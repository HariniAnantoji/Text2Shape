from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)


class CadParams(BaseModel):
    teeth_count: int = Field(ge=3, le=200)
    outer_radius: float = Field(gt=0, le=500)
    bore_diameter: float = Field(gt=0, le=1000)
    extrusion_depth: float = Field(gt=0, le=500)
    fillet_radius: float = Field(ge=0, le=100)
    mounting_holes: bool


class GenerateResponse(BaseModel):
    message: str
    cad_params: CadParams


@app.post("/generate")
def generate(request: GenerateRequest) -> GenerateResponse:
    return GenerateResponse(
        message=f'Received prompt: "{request.prompt}". CAD generation is not implemented yet.',
        cad_params=CadParams(
            teeth_count=20,
            outer_radius=40,
            bore_diameter=15,
            extrusion_depth=18,
            fillet_radius=2.5,
            mounting_holes=False,
        ),
    )
