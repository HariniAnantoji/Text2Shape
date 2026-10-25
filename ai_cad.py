"""Validating and applying a CAD plan to the design state.

This module owns the "apply a plan" half of the AI pipeline: it takes a
CADPlan (produced in `cad_plan.py`), validates each operation against the
Pydantic models and clearance rules, and returns a new, validated design
state. The model's output is never executed as code.

The plan-request pieces (CADPlan, request_cad_plan, LocalModelError, ...) are
re-exported here so existing imports such as
`from ai_cad import request_cad_plan, LocalModelError` keep working.
"""

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ValidationError

from cad_models import (
    BaseplateParams,
    BoxFeature,
    CylinderFeature,
    HoleFeature,
    ImportedMesh,
    PrimitiveFeature,
    SphereFeature,
)
from cad_plan import (
    MAX_OPERATIONS,
    SYSTEM_PROMPT,
    CADOperation,
    CADPlan,
    LocalModelError,
    hosted_llm_is_enabled,
    request_cad_plan,
)

__all__ = [
    "MAX_OPERATIONS",
    "SYSTEM_PROMPT",
    "CADOperation",
    "CADPlan",
    "CADPlanResult",
    "LocalModelError",
    "apply_cad_plan",
    "hosted_llm_is_enabled",
    "request_cad_plan",
    "validate_hole_clearance",
]


class CADPlanResult(BaseModel):
    status: Literal["generated", "clarification", "unsupported"]
    message: str
    cad_params: BaseplateParams
    features: list[PrimitiveFeature]
    holes: list[HoleFeature]
    imported_mesh: ImportedMesh | None = None


def validate_hole_clearance(params: BaseplateParams, holes: list[HoleFeature]) -> None:
    for hole in holes:
        radius = hole.diameter / 2
        max_x = params.length / 2 - radius
        max_y = params.width / 2 - radius
        if abs(hole.x - params.x) > max_x or abs(hole.y - params.y) > max_y:
            raise ValueError(
                f"A {hole.diameter} mm hole at X {hole.x}, Y {hole.y} does not fit inside the "
                f"{params.length} x {params.width} mm plate centered at X {params.x}, Y {params.y}. "
                f"Its center must stay within X {params.x - max_x:g} to {params.x + max_x:g} and "
                f"Y {params.y - max_y:g} to {params.y + max_y:g}. "
                f"For a centered hole, use X {params.x:g}, Y {params.y:g}."
            )


def apply_cad_plan(
    plan: CADPlan,
    cad_params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature],
    imported_mesh: ImportedMesh | None = None,
) -> CADPlanResult:
    updated_params = cad_params
    updated_features = list(features)
    updated_holes = list(holes)
    updated_imported_mesh = imported_mesh
    clarification = next(
        (operation for operation in plan.operations if operation.action == "clarify"),
        None,
    )
    if clarification is not None:
        return CADPlanResult(
            status="clarification",
            message=plan.reply,
            cad_params=cad_params,
            features=features,
            holes=holes,
            imported_mesh=imported_mesh,
        )
    unsupported = next(
        (operation for operation in plan.operations if operation.action == "unsupported"),
        None,
    )
    if unsupported is not None:
        return CADPlanResult(
            status="unsupported",
            message=plan.reply,
            cad_params=cad_params,
            features=features,
            holes=holes,
            imported_mesh=imported_mesh,
        )

    try:
        for operation in plan.operations:
            if operation.action == "set_baseplate":
                values = updated_params.model_dump()
                for operation_field, parameter_field in (
                    ("baseplate_length", "length"),
                    ("baseplate_width", "width"),
                    ("baseplate_thickness", "thickness"),
                    ("hole_diameter", "hole_diameter"),
                    ("edge_offset", "edge_offset"),
                    ("x", "x"),
                    ("y", "y"),
                    ("z", "z"),
                ):
                    value = getattr(operation, operation_field)
                    if value is not None:
                        values[parameter_field] = value
                updated_params = BaseplateParams.model_validate(values)
            elif operation.action == "add_primitive":
                if len(updated_features) >= 20:
                    raise ValueError("This design already has 20 primitives, the current limit.")
                if operation.shape is None:
                    raise ValueError("The AI plan did not specify the primitive shape.")
                height = operation.height if operation.height is not None else 20
                diameter = operation.diameter if operation.diameter is not None else 20
                x = operation.x if operation.x is not None else updated_params.x
                y = operation.y if operation.y is not None else updated_params.y
                z = operation.z
                if z is None:
                    z = updated_params.z + updated_params.thickness / 2 + height / 2
                    if operation.shape == "sphere":
                        z = updated_params.z + updated_params.thickness / 2 + diameter / 2
                placement = {"id": uuid4().hex, "x": x, "y": y, "z": z}
                if operation.shape == "box":
                    feature: PrimitiveFeature = BoxFeature(
                        shape="box",
                        length=operation.length if operation.length is not None else 20,
                        width=(
                            operation.width
                            if operation.width is not None
                            else operation.length if operation.length is not None else 20
                        ),
                        height=height,
                        **placement,
                    )
                elif operation.shape == "cylinder":
                    feature = CylinderFeature(
                        shape="cylinder",
                        diameter=diameter,
                        height=height,
                        **placement,
                    )
                else:
                    feature = SphereFeature(
                        shape="sphere",
                        diameter=diameter,
                        **placement,
                    )
                updated_features.append(feature)
            elif operation.action in {"update_primitive", "remove_primitive"}:
                if operation.target_index is None or operation.target_index > len(updated_features):
                    raise ValueError("I could not find that primitive. Specify its current list number.")
                index = operation.target_index - 1
                if operation.action == "remove_primitive":
                    updated_features.pop(index)
                    continue
                existing = updated_features[index]
                values = existing.model_dump()
                for field in ("x", "y", "z", "length", "width", "height", "diameter"):
                    value = getattr(operation, field)
                    if value is not None and field in values:
                        values[field] = value
                if operation.scale_factor is not None:
                    for field in ("length", "width", "height", "diameter"):
                        if field in values:
                            values[field] *= operation.scale_factor
                updated_features[index] = type(existing).model_validate(values)
            elif operation.action == "add_hole":
                updated_holes.append(
                    HoleFeature(
                        id=uuid4().hex,
                        x=operation.x if operation.x is not None else updated_params.x,
                        y=operation.y if operation.y is not None else updated_params.y,
                        diameter=(
                            operation.diameter
                            if operation.diameter is not None
                            else updated_params.hole_diameter
                        ),
                    )
                )
                if len(updated_holes) > 100:
                    raise ValueError("This design already has 100 extra holes, the current limit.")
            elif operation.action == "remove_hole":
                if operation.target_index is None or operation.target_index > len(updated_holes):
                    raise ValueError("I could not find that extra hole. Specify its current list number.")
                updated_holes.pop(operation.target_index - 1)
            elif operation.action == "update_imported_mesh":
                if updated_imported_mesh is None:
                    raise ValueError("There is no imported STL to move or resize.")
                values = updated_imported_mesh.model_dump()
                for field in ("x", "y", "z"):
                    value = getattr(operation, field)
                    if value is not None:
                        values[field] = value
                if operation.scale_factor is not None:
                    values["scale_factor"] *= operation.scale_factor
                updated_imported_mesh = ImportedMesh.model_validate(values)
        validate_hole_clearance(updated_params, updated_holes)
    except (ValidationError, ValueError) as error:
        return CADPlanResult(
            status="clarification",
            message=f"{error}. Please revise the request and try again.",
            cad_params=cad_params,
            features=features,
            holes=holes,
            imported_mesh=imported_mesh,
        )

    if not plan.operations:
        return CADPlanResult(
            status="clarification",
            message=plan.reply,
            cad_params=cad_params,
            features=features,
            holes=holes,
            imported_mesh=imported_mesh,
        )
    return CADPlanResult(
        status="generated",
        message=plan.reply,
        cad_params=updated_params,
        features=updated_features,
        holes=updated_holes,
        imported_mesh=updated_imported_mesh,
    )
