import json
import os
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError

from cad_generator import (
    BaseplateParams,
    BoxFeature,
    CylinderFeature,
    HoleFeature,
    PrimitiveFeature,
    SphereFeature,
)

MAX_OPERATIONS = 10
OLLAMA_CHAT_URL = f"{os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')}/api/chat"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"


class CADOperation(BaseModel):
    action: Literal[
        "add_primitive",
        "update_primitive",
        "remove_primitive",
        "set_baseplate",
        "add_hole",
        "remove_hole",
        "clarify",
        "unsupported",
    ]
    target_index: int | None = Field(default=None, ge=1, le=100)
    shape: Literal["box", "cylinder", "sphere"] | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None
    length: float | None = None
    width: float | None = None
    height: float | None = None
    diameter: float | None = None
    scale_factor: float | None = Field(default=None, gt=0, le=100)
    baseplate_length: float | None = None
    baseplate_width: float | None = None
    baseplate_thickness: float | None = None
    hole_diameter: float | None = None
    edge_offset: float | None = None


class CADPlan(BaseModel):
    reply: str = Field(min_length=1, max_length=500)
    operations: list[CADOperation] = Field(max_length=MAX_OPERATIONS)


class CADPlanResult(BaseModel):
    status: Literal["generated", "clarification", "unsupported"]
    message: str
    cad_params: BaseplateParams
    features: list[PrimitiveFeature]
    holes: list[HoleFeature]


def validate_hole_clearance(params: BaseplateParams, holes: list[HoleFeature]) -> None:
    for hole in holes:
        radius = hole.diameter / 2
        if (
            abs(hole.x - params.x) + radius > params.length / 2
            or abs(hole.y - params.y) + radius > params.width / 2
        ):
            raise ValueError(
                f"Extra hole at X {hole.x}, Y {hole.y} does not fit inside the baseplate."
            )


class LocalModelError(Exception):
    """Raised when the local Ollama model cannot produce a usable CAD plan."""


SYSTEM_PROMPT = """You convert a user's CAD request into a safe, structured plan for a simple CAD workbench.
Return only a JSON object with exactly these top-level keys: reply (brief friendly text) and operations (an array of up to 10 operations).
Allowed operation actions:
- add_primitive: add a box, cylinder, or sphere. Supply shape and requested dimensions and center coordinates when specified. Dimensions are millimeters. Omitted dimensions use sensible defaults. Coordinates are absolute world-space center coordinates.
- update_primitive: update the existing primitive identified by its one-based target_index in the supplied feature list. Supply only changed dimensions or x/y/z. Use scale_factor for uniform scaling when requested.
- remove_primitive: remove the primitive at target_index.
- set_baseplate: change only supplied baseplate_length, baseplate_width, baseplate_thickness, hole_diameter, edge_offset, x, y, or z fields. Baseplate position coordinates are its center.
- add_hole: cut one new through-hole in the baseplate. Supply its diameter and absolute x/y coordinates in millimeters. If the user requests multiple holes, return one add_hole operation per hole when positions are clear.
- remove_hole: remove the extra hole at its one-based target_index from the supplied holes list.
- clarify: ask one concise question when the requested geometry or target is ambiguous.
- unsupported: explain that the request is outside the current MVP.
The baseplate already has four corner holes; changing their size or spacing is a set_baseplate operation. Extra holes are additional through-holes.
Do not invent values the user did not specify except sensible defaults for primitive dimensions and placement. Place a new primitive on top of the baseplate when no z position is given. Do not generate code, scripts, or free-form operation names. Geometry operations must be limited to the list above.
Current CAD state follows as JSON, then the new user request."""


def request_cad_plan(
    prompt: str,
    cad_params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature],
) -> CADPlan:
    token = ""

    payload = {
        "model": os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL),
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0, "num_predict": 700},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "cad_params": cad_params.model_dump(),
                        "features": [feature.model_dump() for feature in features],
                        "holes": [hole.model_dump() for hole in holes],
                        "request": prompt,
                    },
                    separators=(",", ":"),
                ),
            },
        ],
    }
    request = Request(
        OLLAMA_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    request.remove_header("Authorization")
    try:
        with urlopen(request, timeout=120) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            error_body = json.loads(error.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            error_body = {}
        model_message = error_body.get("error")
        if isinstance(model_message, str):
            model_message = model_message[:500]
        else:
            model_message = "Check that Ollama is running and the model is downloaded."
        raise LocalModelError(
            f"Ollama returned HTTP {error.code}: {model_message}"
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        ollama_url = OLLAMA_CHAT_URL.rsplit("/api/chat", 1)[0]
        raise LocalModelError(
            f"Could not reach Ollama at {ollama_url}. Start Ollama and ensure the model is downloaded."
        ) from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise LocalModelError("Ollama returned an invalid response.") from error

    try:
        content = result["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("Model content is not text")
        return CADPlan.model_validate_json(content)
    except (KeyError, IndexError, TypeError, ValidationError) as error:
        raise LocalModelError(
            "Ollama returned a CAD plan that did not match the required format."
        ) from error


def apply_cad_plan(
    plan: CADPlan,
    cad_params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature],
) -> CADPlanResult:
    updated_params = cad_params
    updated_features = list(features)
    updated_holes = list(holes)
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
        validate_hole_clearance(updated_params, updated_holes)
    except (ValidationError, ValueError) as error:
        return CADPlanResult(
            status="clarification",
            message=f"{error}. Please revise the request and try again.",
            cad_params=cad_params,
            features=features,
            holes=holes,
        )

    if not plan.operations:
        return CADPlanResult(
            status="clarification",
            message=plan.reply,
            cad_params=cad_params,
            features=features,
            holes=holes,
        )
    return CADPlanResult(
        status="generated",
        message=plan.reply,
        cad_params=updated_params,
        features=updated_features,
        holes=updated_holes,
    )
