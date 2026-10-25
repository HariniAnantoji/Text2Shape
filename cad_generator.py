"""Build123d geometry construction for the baseplate workbench.

Responsibilities are split across three modules:
  - cad_models.py  : the Pydantic data models (params, features, artifacts)
  - cad_generator.py (this file): builds the build123d solid model
  - cad_export.py  : writes the model to STEP and STL files

The model classes are re-exported from here so existing imports such as
`from cad_generator import BaseplateParams` keep working.
"""

from pathlib import Path

from build123d import Align, Box, Cylinder, Pos, Sphere

from cad_export import export_model
from cad_models import (
    BaseplateParams,
    BoxFeature,
    CADArtifacts,
    CylinderFeature,
    HoleFeature,
    ImportedMesh,
    PrimitiveBase,
    PrimitiveFeature,
    SphereFeature,
)

__all__ = [
    "BaseplateParams",
    "BoxFeature",
    "CADArtifacts",
    "CylinderFeature",
    "HoleFeature",
    "ImportedMesh",
    "PrimitiveBase",
    "PrimitiveFeature",
    "SphereFeature",
    "generate_baseplate",
    "generate_model",
]


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

    model = _build_solid_model(params, features, holes)

    return export_model(
        model,
        output_dir,
        imported_mesh=imported_mesh,
        imported_mesh_path=imported_mesh_path,
    )


def _build_solid_model(
    params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature] | None,
):
    """Construct the baseplate solid with corner holes, extra holes, and primitives."""
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

    return model
