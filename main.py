import os
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from build123d import import_stl
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from artifact_storage import get_artifact_object, s3_is_enabled, upload_artifact
from ai_cad import LocalModelError, apply_cad_plan, request_cad_plan, validate_hole_clearance
from cad_generator import BaseplateParams, HoleFeature, ImportedMesh, PrimitiveFeature, generate_model

app = FastAPI()

ARTIFACTS_DIR = Path(__file__).parent / "downloads"
ARTIFACTS_DIR.mkdir(exist_ok=True)
IMPORTS_DIR = ARTIFACTS_DIR / "imports"
IMPORTS_DIR.mkdir(exist_ok=True)
MAX_IMPORTED_STL_BYTES = 25 * 1024 * 1024

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Filename"],
)


@app.get("/")
def health() -> dict[str, str]:
    """Simple health check so the root URL returns a friendly response."""
    return {"status": "ok", "service": "text2shape-api"}


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    cad_params: BaseplateParams = Field(default_factory=BaseplateParams)
    features: list[PrimitiveFeature] = Field(default_factory=list, max_length=20)
    holes: list[HoleFeature] = Field(default_factory=list, max_length=100)
    imported_mesh: ImportedMesh | None = None

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, prompt: str) -> str:
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("prompt must contain non-whitespace text")
        return prompt

    @model_validator(mode="after")
    def holes_must_fit_baseplate(self):
        validate_hole_clearance(self.cad_params, self.holes)
        return self


class GeneratedFiles(BaseModel):
    stl_url: str
    step_url: str


class ImportedMeshResponse(ImportedMesh):
    source_url: str


class GenerateResponse(BaseModel):
    status: Literal["generated", "clarification", "unsupported"]
    message: str
    cad_params: BaseplateParams
    features: list[PrimitiveFeature] = Field(default_factory=list)
    holes: list[HoleFeature] = Field(default_factory=list)
    imported_mesh: ImportedMesh | None = None
    files: GeneratedFiles | None = None


def imported_mesh_path(mesh: ImportedMesh, temporary_directory: Path) -> Path:
    if not s3_is_enabled():
        path = IMPORTS_DIR / f"{mesh.id}.stl"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Imported STL not found. Upload it again.")
        return path

    try:
        s3_object = get_artifact_object(f"imports/{mesh.id}.stl")
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey", "NotFound"}:
            raise HTTPException(status_code=404, detail="Imported STL not found. Upload it again.") from error
        raise HTTPException(status_code=502, detail="Unable to retrieve imported STL from S3") from error
    except BotoCoreError as error:
        raise HTTPException(status_code=502, detail="Unable to retrieve imported STL from S3") from error

    path = temporary_directory / f"{mesh.id}.stl"
    body = s3_object["Body"]
    try:
        with path.open("wb") as imported_file:
            shutil.copyfileobj(body, imported_file)
    finally:
        body.close()
    return path


@app.post("/imports", response_model=ImportedMeshResponse, status_code=201)
async def upload_stl(request: Request) -> ImportedMeshResponse:
    filename = request.headers.get("x-filename", "").replace("\\", "/").rsplit("/", 1)[-1]
    if not filename or not filename.lower().endswith(".stl"):
        raise HTTPException(status_code=415, detail="Upload an STL file.")
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_IMPORTED_STL_BYTES:
                raise HTTPException(status_code=413, detail="STL files must be 25 MB or smaller.")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header.") from error

    import_id = uuid4().hex
    with TemporaryDirectory(prefix=f"text2shape-import-{import_id}-") as temp_dir:
        temporary_path = Path(temp_dir) / "upload.stl"
        size = 0
        with temporary_path.open("wb") as imported_file:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_IMPORTED_STL_BYTES:
                    raise HTTPException(status_code=413, detail="STL files must be 25 MB or smaller.")
                imported_file.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded STL file is empty.")
        try:
            shape = import_stl(temporary_path)
            bounds = shape.bounding_box()
            length = bounds.max.X - bounds.min.X
            width = bounds.max.Y - bounds.min.Y
            height = bounds.max.Z - bounds.min.Z
            mesh = ImportedMesh(
                id=import_id,
                filename=filename[:255],
                length=length,
                width=width,
                height=height,
            )
        except (OSError, RuntimeError, ValueError) as error:
            raise HTTPException(status_code=400, detail="The uploaded file is not a valid STL mesh.") from error

        if s3_is_enabled():
            try:
                upload_artifact(str(temporary_path), f"imports/{import_id}.stl")
            except (BotoCoreError, ClientError) as error:
                raise HTTPException(status_code=502, detail="Unable to store imported STL in S3") from error
        else:
            shutil.copyfile(temporary_path, IMPORTS_DIR / f"{import_id}.stl")

    return ImportedMeshResponse(
        **mesh.model_dump(),
        source_url=str(request.url_for("get_import", import_id=import_id)),
    )


@app.get("/imports/{import_id}", name="get_import", response_model=None)
def get_import(import_id: str) -> FileResponse | StreamingResponse:
    if len(import_id) != 32 or any(char not in "0123456789abcdef" for char in import_id):
        raise HTTPException(status_code=404, detail="Imported STL not found")
    if s3_is_enabled():
        try:
            s3_object = get_artifact_object(f"imports/{import_id}.stl")
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                raise HTTPException(status_code=404, detail="Imported STL not found") from error
            raise HTTPException(status_code=502, detail="Unable to retrieve imported STL from S3") from error
        except BotoCoreError as error:
            raise HTTPException(status_code=502, detail="Unable to retrieve imported STL from S3") from error
        body = s3_object["Body"]

        def stream_import():
            try:
                yield from body.iter_chunks(chunk_size=1024 * 1024)
            finally:
                body.close()

        return StreamingResponse(
            stream_import(),
            media_type="model/stl",
            headers={"Content-Disposition": "inline"},
        )

    path = IMPORTS_DIR / f"{import_id}.stl"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Imported STL not found")
    return FileResponse(path, media_type="model/stl", content_disposition_type="inline")


@app.get(
    "/artifacts/{artifact_id}/{filename}",
    name="get_artifact",
    response_model=None,
)
def get_artifact(
    artifact_id: str,
    filename: Literal["baseplate.stl", "baseplate.step"],
) -> FileResponse | StreamingResponse:
    if len(artifact_id) != 32 or any(char not in "0123456789abcdef" for char in artifact_id):
        raise HTTPException(status_code=404, detail="Artifact not found")

    if s3_is_enabled():
        try:
            s3_object = get_artifact_object(f"{artifact_id}/{filename}")
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                raise HTTPException(status_code=404, detail="Artifact not found") from error
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve artifact from S3",
            ) from error
        except BotoCoreError as error:
            raise HTTPException(
                status_code=502,
                detail="Unable to retrieve artifact from S3",
            ) from error

        body = s3_object["Body"]

        def stream_artifact():
            try:
                yield from body.iter_chunks(chunk_size=1024 * 1024)
            finally:
                body.close()

        return StreamingResponse(
            stream_artifact(),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    artifact_path = ARTIFACTS_DIR / artifact_id / filename
    if not artifact_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    return FileResponse(artifact_path, filename=filename)


@app.post("/generate")
def generate(request: GenerateRequest, http_request: Request) -> GenerateResponse:
    try:
        plan = request_cad_plan(
            request.prompt,
            request.cad_params,
            request.features,
            request.holes,
            request.imported_mesh,
        )
    except LocalModelError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    interpretation = apply_cad_plan(
        plan,
        request.cad_params,
        request.features,
        request.holes,
        request.imported_mesh,
    )
    if interpretation.status != "generated":
        return GenerateResponse(
            status=interpretation.status,
            message=interpretation.message,
            cad_params=interpretation.cad_params,
            features=interpretation.features,
            holes=interpretation.holes,
            imported_mesh=interpretation.imported_mesh,
        )

    artifact_id = uuid4().hex
    with TemporaryDirectory(prefix=f"text2shape-import-stage-{artifact_id}-") as import_temp_dir:
        imported_path = (
            imported_mesh_path(request.imported_mesh, Path(import_temp_dir))
            if request.imported_mesh is not None
            else None
        )
        if s3_is_enabled():
            with TemporaryDirectory(prefix=f"text2shape-{artifact_id}-") as temp_dir:
                artifacts = generate_model(
                    interpretation.cad_params,
                    interpretation.features,
                    Path(temp_dir),
                    interpretation.holes,
                    interpretation.imported_mesh,
                    imported_path,
                )
                try:
                    upload_artifact(str(artifacts.stl_path), f"{artifact_id}/baseplate.stl")
                    upload_artifact(str(artifacts.step_path), f"{artifact_id}/baseplate.step")
                except (BotoCoreError, ClientError) as error:
                    raise HTTPException(
                        status_code=502,
                        detail="Unable to upload generated artifacts to S3",
                    ) from error
        else:
            artifacts = generate_model(
                interpretation.cad_params,
                interpretation.features,
                ARTIFACTS_DIR / artifact_id,
                interpretation.holes,
                interpretation.imported_mesh,
                imported_path,
            )
    files = GeneratedFiles(
        stl_url=str(
            http_request.url_for(
                "get_artifact",
                artifact_id=artifact_id,
                filename=artifacts.stl_path.name,
            )
        ),
        step_url=str(
            http_request.url_for(
                "get_artifact",
                artifact_id=artifact_id,
                filename=artifacts.step_path.name,
            )
        ),
    )

    return GenerateResponse(
        status=interpretation.status,
        message=interpretation.message,
        cad_params=interpretation.cad_params,
        features=interpretation.features,
        holes=interpretation.holes,
        imported_mesh=interpretation.imported_mesh,
        files=files,
    )
