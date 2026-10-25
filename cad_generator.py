from pathlib import Path

from typing import Annotated, Literal

from build123d import Align, Box, Compound, Cylinder, Pos, Sphere, export_step, export_stl, import_stl
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


def generate_baseplate(params: BaseplateParams, output_dir: Path) -> CADArtifacts:
    """Generate a four-hole baseplate and export STEP and STL files."""
    return generate_model(params, [], output_dir)


def generate_model(
    params: BaseplateParams,
    features: list[PrimitiveFeature],
    output_dir: Path,
    holes: list[HoleFeature] | None = None,
    imported_mesh: ImportedMesh | None = None,
    imported_mesh_path: Path | None = None,
) -> CADArtifacts:
    """Generate a baseplate with four through-holes and optional placed primitives."""
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

    plate = Pos(params.x, params.y, params.z) * plate
    for hole in holes or []:
        plate -= Pos(hole.x, hole.y, params.z) * Cylinder(
            hole.diameter / 2,
            params.thickness + 2,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    model = plate
    for feature in features:
        if isinstance(feature, BoxFeature):
            solid = Box(
                feature.length,
                feature.width,
                feature.height,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
            )
        elif isinstance(feature, CylinderFeature):
            solid = Cylinder(
                feature.diameter / 2,
                feature.height,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
            )
        else:
            solid = Sphere(feature.diameter / 2)
        model = model + Pos(feature.x, feature.y, feature.z) * solid

    # Validate the imported-mesh inputs up front, before writing any files, so a
    # missing STL never leaves a half-written export behind.
    if imported_mesh is not None and (
        imported_mesh_path is None or not imported_mesh_path.is_file()
    ):
        raise ValueError("The imported STL file is unavailable.")

    step_path = output_dir / "baseplate.step"
    stl_path = output_dir / "baseplate.stl"

    # The parametric solids (baseplate + primitives) form the B-rep model used
    # for STEP. An imported STL is a triangulated mesh (a loose Face, not a
    # solid); STEP is a boundary-representation format for solids and OCCT drops
    # mesh faces on export. So STEP contains the solid model only, and the mesh
    # is merged into the STL output.
    #
    # STEP must be exported BEFORE building the STL compound: Compound(children=
    # [model, ...]) reparents `model`'s underlying OCCT topology into the new
    # compound, which leaves the standalone `model` in a state that fails STEP
    # export. Writing STEP first keeps the solid model intact.
    export_step(model, str(step_path))

    stl_model = model
    if imported_mesh is not None:
        imported_shape = import_stl(imported_mesh_path)
        imported_bounds = imported_shape.bounding_box()
        center_x = (imported_bounds.min.X + imported_bounds.max.X) / 2
        center_y = (imported_bounds.min.Y + imported_bounds.max.Y) / 2
        center_z = (imported_bounds.min.Z + imported_bounds.max.Z) / 2
        imported_shape = Pos(-center_x, -center_y, -center_z) * imported_shape
        imported_shape = imported_shape.scale(imported_mesh.scale_factor)
        imported_shape = Pos(imported_mesh.x, imported_mesh.y, imported_mesh.z) * imported_shape
        stl_model = Compound(children=[model, imported_shape])

    export_stl(stl_model, str(stl_path))

    for artifact in (step_path, stl_path):
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f"CAD export did not produce a valid file: {artifact}")

    return CADArtifacts(step_path=step_path, stl_path=stl_path)
