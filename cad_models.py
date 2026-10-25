"""Shared Pydantic models for CAD parameters, features, and artifacts.

These are plain data definitions with validation rules. Keeping them in one
module (separate from geometry construction and export) lets `cad_generator`,
`cad_export`, `ai_cad`, and `main` import the same types without circular
dependencies.
"""

from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class BaseplateParams(BaseModel):
    length: float = Field(default=100, gt=0, le=1000)
    width: float = Field(default=60, gt=0, le=1000)
    thickness: float = Field(default=8, gt=0, le=200)
    hole_diameter: float = Field(default=6, gt=0, le=100)
    edge_offset: float = Field(default=10, gt=0, le=500)
    x: float = Field(default=0, ge=-500, le=500)
    y: float = Field(default=0, ge=-500, le=500)
    z: float = Field(default=0, ge=-500, le=500)

    @model_validator(mode="after")
    def validate_hole_clearance(self):
        if self.edge_offset < self.hole_diameter / 2:
            raise ValueError("edge_offset must be at least half the hole diameter")
        if self.edge_offset * 2 >= min(self.length, self.width):
            raise ValueError("edge_offset must leave room for four corner holes")
        return self


class PrimitiveBase(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    x: float = Field(default=0, ge=-500, le=500)
    y: float = Field(default=0, ge=-500, le=500)
    z: float = Field(default=0, ge=-500, le=500)


class BoxFeature(PrimitiveBase):
    shape: Literal["box"]
    length: float = Field(gt=0, le=500)
    width: float = Field(gt=0, le=500)
    height: float = Field(gt=0, le=500)


class CylinderFeature(PrimitiveBase):
    shape: Literal["cylinder"]
    diameter: float = Field(gt=0, le=500)
    height: float = Field(gt=0, le=500)


class SphereFeature(PrimitiveBase):
    shape: Literal["sphere"]
    diameter: float = Field(gt=0, le=500)


class HoleFeature(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    x: float = Field(ge=-500, le=500)
    y: float = Field(ge=-500, le=500)
    diameter: float = Field(gt=0, le=100)


class ImportedMesh(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f]{32}$")
    filename: str = Field(min_length=1, max_length=255)
    length: float = Field(gt=0, le=10000)
    width: float = Field(gt=0, le=10000)
    height: float = Field(gt=0, le=10000)
    x: float = Field(default=0, ge=-5000, le=5000)
    y: float = Field(default=0, ge=-5000, le=5000)
    z: float = Field(default=0, ge=-5000, le=5000)
    scale_factor: float = Field(default=1, gt=0, le=100)


PrimitiveFeature = Annotated[
    BoxFeature | CylinderFeature | SphereFeature,
    Field(discriminator="shape"),
]


class CADArtifacts(BaseModel):
    step_path: Path
    stl_path: Path
