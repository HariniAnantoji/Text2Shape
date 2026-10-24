from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from cad_generator import BaseplateParams, generate_baseplate

app = FastAPI()

ARTIFACTS_DIR = Path(__file__).parent / "downloads"
ARTIFACTS_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    cad_params: BaseplateParams = Field(default_factory=BaseplateParams)

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, prompt: str) -> str:
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("prompt must contain non-whitespace text")
        return prompt


class GeneratedFiles(BaseModel):
    stl_url: str
    step_url: str


class GenerateResponse(BaseModel):
    message: str
    cad_params: BaseplateParams
    files: GeneratedFiles


@app.get("/artifacts/{artifact_id}/{filename}", name="get_artifact")
def get_artifact(
    artifact_id: str,
    filename: Literal["baseplate.stl", "baseplate.step"],
) -> FileResponse:
    if len(artifact_id) != 32 or any(char not in "0123456789abcdef" for char in artifact_id):
        raise HTTPException(status_code=404, detail="Artifact not found")

    artifact_path = ARTIFACTS_DIR / artifact_id / filename
    if not artifact_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    return FileResponse(artifact_path, filename=filename)


@app.post("/generate")
def generate(request: GenerateRequest, http_request: Request) -> GenerateResponse:
    artifact_id = uuid4().hex
    artifacts = generate_baseplate(
        request.cad_params,
        ARTIFACTS_DIR / artifact_id,
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
        message=f'Generated a baseplate with four mounting holes for: "{request.prompt}".',
        cad_params=request.cad_params,
        files=files,
    )
