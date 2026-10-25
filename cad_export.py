"""STEP and STL export for generated CAD models.

Separated from geometry construction (`cad_generator.py`) so the "how we build
shapes" concern is distinct from the "how we write files" concern.

Key behavior: a parametric solid model is exported to STEP (a boundary-
representation format for solids). An imported STL is a triangulated mesh (a
loose Face, not a solid); OCCT drops mesh faces on STEP export, so the mesh is
merged into the STL output only.
"""

from pathlib import Path

from build123d import Compound, Pos, export_step, export_stl, import_stl

from cad_models import CADArtifacts, ImportedMesh


def export_model(
    model,
    output_dir: Path,
    imported_mesh: ImportedMesh | None = None,
    imported_mesh_path: Path | None = None,
) -> CADArtifacts:
    """Export the solid model to STEP and (with any imported mesh) to STL.

    Args:
        model: the build123d solid model (baseplate + primitives + holes).
        output_dir: directory to write baseplate.step and baseplate.stl into.
        imported_mesh: optional imported mesh metadata (transform/scale).
        imported_mesh_path: path to the imported STL file on disk.

    Returns:
        CADArtifacts with the written STEP and STL paths.
    """
    # Validate imported-mesh inputs up front, before writing any files, so a
    # missing STL never leaves a half-written export behind.
    if imported_mesh is not None and (
        imported_mesh_path is None or not imported_mesh_path.is_file()
    ):
        raise ValueError("The imported STL file is unavailable.")

    step_path = output_dir / "baseplate.step"
    stl_path = output_dir / "baseplate.stl"

    # STEP must be exported BEFORE building the STL compound: Compound(children=
    # [model, ...]) reparents `model`'s underlying OCCT topology into the new
    # compound, which leaves the standalone `model` in a state that fails STEP
    # export. Writing STEP first keeps the solid model intact.
    export_step(model, str(step_path))

    stl_model = model
    if imported_mesh is not None:
        stl_model = _merge_imported_mesh(model, imported_mesh, imported_mesh_path)

    export_stl(stl_model, str(stl_path))

    for artifact in (step_path, stl_path):
        if not artifact.is_file() or artifact.stat().st_size == 0:
            raise RuntimeError(f"CAD export did not produce a valid file: {artifact}")

    return CADArtifacts(step_path=step_path, stl_path=stl_path)


def _merge_imported_mesh(model, imported_mesh: ImportedMesh, imported_mesh_path: Path):
    """Center, scale, and place the imported mesh, then combine it with the model."""
    imported_shape = import_stl(imported_mesh_path)
    imported_bounds = imported_shape.bounding_box()
    center_x = (imported_bounds.min.X + imported_bounds.max.X) / 2
    center_y = (imported_bounds.min.Y + imported_bounds.max.Y) / 2
    center_z = (imported_bounds.min.Z + imported_bounds.max.Z) / 2
    imported_shape = Pos(-center_x, -center_y, -center_z) * imported_shape
    imported_shape = imported_shape.scale(imported_mesh.scale_factor)
    imported_shape = Pos(imported_mesh.x, imported_mesh.y, imported_mesh.z) * imported_shape
    return Compound(children=[model, imported_shape])
