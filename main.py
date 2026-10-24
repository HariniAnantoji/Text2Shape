from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from cad_generator import BaseplateParams, generate_baseplate

GENERATED_MODELS_DIR = Path(__file__).parent / "generated_models"
GENERATED_MODELS_DIR.mkdir(exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.mount("/files", StaticFiles(directory=GENERATED_MODELS_DIR), name="files")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, prompt: str) -> str:
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("prompt must contain non-whitespace text")
        return prompt

    cad_params: BaseplateParams = Field(default_factory=BaseplateParams)


class GeneratedFiles(BaseModel):
    stl_url: str
    step_url: str


class GenerateResponse(BaseModel):
    message: str
    cad_params: BaseplateParams
    files: GeneratedFiles


@app.post("/generate")
def generate(request: GenerateRequest, http_request: Request) -> GenerateResponse:
    model_id = uuid4().hex
    artifacts = generate_baseplate(
        request.cad_params,
        GENERATED_MODELS_DIR / model_id,
    )
    file_base_url = f"{str(http_request.base_url).rstrip('/')}/files/{model_id}"

    return GenerateResponse(
        message=f'Generated a baseplate with four mounting holes for: "{request.prompt}".',
        cad_params=request.cad_params,
        files={
            "stl_url": f"{file_base_url}/{artifacts.stl_path.name}",
            "step_url": f"{file_base_url}/{artifacts.step_path.name}",
        },
    )
