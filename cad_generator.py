from pathlib import Path

from build123d import Align, Box, Cylinder, Pos, export_step, export_stl
from pydantic import BaseModel, Field, model_validator


class BaseplateParams(BaseModel):
    length: float = Field(default=100, gt=0, le=1000)
    width: float = Field(default=60, gt=0, le=1000)
    thickness: float = Field(default=8, gt=0, le=200)
    hole_diameter: float = Field(default=6, gt=0, le=100)
    edge_offset: float = Field(default=10, gt=0, le=500)

    @model_validator(mode="after")
    def validate_hole_clearance(self):
        if self.edge_offset < self.hole_diameter / 2:
            raise ValueError("edge_offset must be at least half the hole diameter")
        if self.edge_offset * 2 >= min(self.length, self.width):
            raise ValueError("edge_offset must leave room for four corner holes")
        return self


class CADArtifacts(BaseModel):
    step_path: Path
    stl_path: Path


def generate_baseplate(params: BaseplateParams, output_dir: Path) -> CADArtifacts:
    """Generate a four-hole baseplate and export STEP and STL files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    plate = Box(
        params.length,
        params.width,
        params.thickness,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )
    hole_radius = params.hole_diameter / 2
    hole_x = params.length / 2 - params.edge_offset
    hole_y = params.width / 2 - params.edge_offset

    for x in (-hole_x, hole_x):
        for y in (-hole_y, hole_y):
            cutter = Pos(x, y, 0) * Cylinder(
                hole_radius,
                params.thickness + 2,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
            )
            plate -= cutter

    step_path = output_dir / "baseplate.step"
    stl_path = output_dir / "baseplate.stl"
    export_step(plate, str(step_path))
    export_stl(plate, str(stl_path))

    for artifact in (step_path, stl_path):
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f"CAD export did not produce a valid file: {artifact}")

    return CADArtifacts(step_path=step_path, stl_path=stl_path)
