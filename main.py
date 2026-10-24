from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)


@app.post("/generate")
def generate(request: GenerateRequest) -> dict[str, str]:
    return {"prompt": request.prompt}
