import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Literal
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator

from artifact_storage import get_artifact_object, s3_is_enabled, upload_artifact
from ai_cad import LocalModelError, apply_cad_plan, request_cad_plan, validate_hole_clearance
from cad_generator import BaseplateParams, HoleFeature, PrimitiveFeature, generate_model

app = FastAPI()

ARTIFACTS_DIR = Path(__file__).parent / "downloads"
ARTIFACTS_DIR.mkdir(exist_ok=True)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    cad_params: BaseplateParams = Field(default_factory=BaseplateParams)
    features: list[PrimitiveFeature] = Field(default_factory=list, max_length=20)
    holes: list[HoleFeature] = Field(default_factory=list, max_length=100)

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


class GenerateResponse(BaseModel):
    status: Literal["generated", "clarification", "unsupported"]
    message: str
    cad_params: BaseplateParams
    features: list[PrimitiveFeature] = Field(default_factory=list)
    holes: list[HoleFeature] = Field(default_factory=list)
    files: GeneratedFiles | None = None


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
        )
    except LocalModelError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    interpretation = apply_cad_plan(
        plan,
        request.cad_params,
        request.features,
        request.holes,
    )
    if interpretation.status != "generated":
        return GenerateResponse(
            status=interpretation.status,
            message=interpretation.message,
            cad_params=interpretation.cad_params,
            features=interpretation.features,
            holes=interpretation.holes,
        )

    artifact_id = uuid4().hex
    if s3_is_enabled():
        with TemporaryDirectory(prefix=f"text2shape-{artifact_id}-") as temp_dir:
            artifacts = generate_model(
                interpretation.cad_params,
                interpretation.features,
                Path(temp_dir),
                interpretation.holes,
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
        files=files,
    )
