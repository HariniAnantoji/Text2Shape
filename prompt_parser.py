import re
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError

from cad_generator import (
    BaseplateParams,
    BoxFeature,
    CylinderFeature,
    PrimitiveFeature,
    SphereFeature,
)

_NUMBER = r"(\d+(?:\.\d+)?)"
_NUMBER_VALUE = r"\d+(?:\.\d+)?"
_DIMENSION_PAIR = re.compile(
    rf"\b{_NUMBER}\s*(?:mm\s*)?(?:x|by)\s*{_NUMBER}\s*(?:mm)?\b",
    re.IGNORECASE,
)
_SUPPORTED_TERMS = re.compile(
    r"\b(?:base\s*plate|plate|holes?|thick(?:er|ness)?|thin(?:ner)?|"
    r"length|long(?:er)?|width|wide(?:r)?|edge\s+offset|size|dimensions?)\b",
    re.IGNORECASE,
)
_FOUR_HOLE_CREATION = re.compile(
    r"\b(?:create|make|generate|build)\b.*\bbase\s*plate\b.*"
    r"\b(?:four|4)\s+(?:corner\s+)?(?:mounting\s+)?holes?\b|"
    r"\b(?:add|create|make|generate)\s+(?:four|4)\s+mounting\s+holes?\b",
    re.IGNORECASE,
)
_HOLE_SIZE_CONTEXT = re.compile(
    r"\bholes?\b.{0,40}\b(?:larger|smaller|bigger)\b|"
    r"\b(?:larger|smaller|bigger)\b.{0,40}\bholes?\b",
    re.IGNORECASE,
)
_UNSUPPORTED_OBJECTS = re.compile(
    r"\b(?:sphere|cube|gear|lamp|cylinder|bracket|screw|pipe)\b",
    re.IGNORECASE,
)
_AMBIGUOUS_TERMS = re.compile(
    r"\b(?:bigger|smaller|change|modify|adjust|different|larger)\b|\d+(?:\.\d+)?\s*mm\b",
    re.IGNORECASE,
)


class PromptInterpretation(BaseModel):
    status: Literal["generated", "clarification", "unsupported"]
    message: str
    cad_params: BaseplateParams
    features: list[PrimitiveFeature] = Field(default_factory=list)


def _coordinate_changes(prompt: str) -> dict[str, float]:
    return {
        axis: float(match.group(1))
        for axis in ("x", "y", "z")
        if (match := re.search(
            rf"\b{axis}\s*(?:=|:|to)?\s*(-?{_NUMBER_VALUE})",
            prompt,
            re.IGNORECASE,
        ))
    }


def _primitive_target(
    prompt: str,
    features: list[PrimitiveFeature],
) -> int | None:
    target = re.search(
        r"\b(?:feature|primitive)\s+(\d+)\b|"
        r"\b(box|cube|cylinder|sphere)\s+(\d+)\b",
        prompt,
        re.IGNORECASE,
    )
    if target:
        index = int(target.group(1) or target.group(3)) - 1
        if target.group(2):
            shape = "box" if target.group(2).lower() == "cube" else target.group(2).lower()
            matching = [
                feature_index
                for feature_index, feature in enumerate(features)
                if feature.shape == shape
            ]
            return matching[index] if 0 <= index < len(matching) else None
        return index if 0 <= index < len(features) else None

    shape_match = re.search(r"\b(box|cube|cylinder|sphere)\b", prompt, re.IGNORECASE)
    if shape_match:
        shape = "box" if shape_match.group(1).lower() == "cube" else shape_match.group(1).lower()
        matching = [
            feature_index
            for feature_index, feature in enumerate(features)
            if feature.shape == shape
        ]
        return matching[0] if len(matching) == 1 else None
    return 0 if len(features) == 1 else None


def _primitive_prompt(
    prompt: str,
    current: BaseplateParams,
    features: list[PrimitiveFeature],
) -> PromptInterpretation | None:
    add_match = re.search(
        r"\b(?:add|create|make|put|place|insert)\b.*?"
        r"\b(box|cube|cylinder|sphere)\b",
        prompt,
        re.IGNORECASE,
    )
    remove_match = re.search(r"\b(?:remove|delete|take\s+out)\b", prompt, re.IGNORECASE)
    edit_match = re.search(r"\b(?:move|position|resize|change|make|set)\b", prompt, re.IGNORECASE)

    if add_match:
        if len(features) >= 20:
            return PromptInterpretation(
                status="clarification",
                message="This design already has 20 primitives, the current limit. Remove one before adding another.",
                cad_params=current,
                features=features,
            )

        shape_name = add_match.group(1).lower()
        shape_name = "box" if shape_name == "cube" else shape_name
        coordinates = _coordinate_changes(prompt)
        position: dict[str, float] = {
            "x": current.x,
            "y": current.y,
            "z": current.z + current.thickness / 2 + 10,
            **coordinates,
        }
        try:
            if shape_name == "box":
                dimensions = re.search(
                    rf"\b({_NUMBER_VALUE})\s*(?:mm\s*)?(?:x|by)\s*"
                    rf"({_NUMBER_VALUE})\s*(?:mm\s*)?(?:(?:x|by)\s*"
                    rf"({_NUMBER_VALUE})\s*(?:mm)?)?",
                    prompt,
                    re.IGNORECASE,
                )
                length = float(dimensions.group(1)) if dimensions else 20
                width = float(dimensions.group(2)) if dimensions else length
                height = float(dimensions.group(3)) if dimensions and dimensions.group(3) else 20
                for field, patterns in {
                    "length": (rf"\blength\s*(?:of|=|:|to)?\s*({_NUMBER_VALUE})", rf"({_NUMBER_VALUE})\s*mm\s*long"),
                    "width": (rf"\bwidth\s*(?:of|=|:|to)?\s*({_NUMBER_VALUE})", rf"({_NUMBER_VALUE})\s*mm\s*wide"),
                    "height": (rf"\bheight\s*(?:of|=|:|to)?\s*({_NUMBER_VALUE})", rf"({_NUMBER_VALUE})\s*mm\s*(?:high|tall)"),
                }.items():
                    value = _first_number(*patterns, prompt=prompt)
                    if value is not None:
                        if field == "length":
                            length = value
                        elif field == "width":
                            width = value
                        else:
                            height = value
                feature: PrimitiveFeature = BoxFeature(
                    id=uuid4().hex,
                    shape="box",
                    length=length,
                    width=width,
                    height=height,
                    **position,
                )
            elif shape_name == "cylinder":
                diameter = _first_number(
                    rf"\b(?:diameter|dia)\s*(?:of|=|:)?\s*({_NUMBER_VALUE})",
                    rf"\b({_NUMBER_VALUE})\s*mm\s*(?:diameter|dia)",
                    prompt=prompt,
                ) or 20
                height = _first_number(
                    rf"\bheight\s*(?:of|=|:|to)?\s*({_NUMBER_VALUE})",
                    rf"\b({_NUMBER_VALUE})\s*mm\s*(?:high|tall)",
                    prompt=prompt,
                ) or 20
                feature = CylinderFeature(
                    id=uuid4().hex,
                    shape="cylinder",
                    diameter=diameter,
                    height=height,
                    **position,
                )
            else:
                diameter = _first_number(
                    rf"\b(?:diameter|dia)\s*(?:of|=|:)?\s*({_NUMBER_VALUE})",
                    rf"\b({_NUMBER_VALUE})\s*mm\s*(?:diameter|dia)",
                    rf"\b({_NUMBER_VALUE})\s*mm\s*sphere",
                    prompt=prompt,
                ) or 20
                feature = SphereFeature(
                    id=uuid4().hex,
                    shape="sphere",
                    diameter=diameter,
                    **position,
                )
        except ValidationError:
            return PromptInterpretation(
                status="clarification",
                message="Primitive dimensions must be greater than 0 and no larger than 500 mm; positions must be between -500 and 500 mm.",
                cad_params=current,
                features=features,
            )

        updated_features = [*features, feature]
        size_description = (
            f"{feature.length} × {feature.width} × {feature.height} mm"
            if isinstance(feature, BoxFeature)
            else (
                f"Ø{feature.diameter} × {feature.height} mm"
                if isinstance(feature, CylinderFeature)
                else f"Ø{feature.diameter} mm"
            )
        )
        return PromptInterpretation(
            status="generated",
            message=(
                f"Added {feature.shape} ({size_description}) at "
                f"X {feature.x}, Y {feature.y}, Z {feature.z} mm and generated the model."
            ),
            cad_params=current,
            features=updated_features,
        )

    target_index = _primitive_target(prompt, features)
    explicit_target = re.search(
        r"\b(?:feature|primitive)\s+\d+\b|"
        r"\b(?:box|cube|cylinder|sphere)\s+\d+\b",
        prompt,
        re.IGNORECASE,
    )
    if (remove_match or edit_match) and (target_index is not None or explicit_target):
        if target_index is None:
            return PromptInterpretation(
                status="clarification",
                message="Which primitive should I change? Refer to its list number, such as “move feature 1 to x 20”, or name a shape that appears only once.",
                cad_params=current,
                features=features,
            )
        if remove_match:
            removed = features[target_index]
            updated_features = [
                feature for index, feature in enumerate(features)
                if index != target_index
            ]
            return PromptInterpretation(
                status="generated",
                message=f"Removed {removed.shape} {target_index + 1} and generated the model.",
                cad_params=current,
                features=updated_features,
            )

        existing = features[target_index]
        changes = _coordinate_changes(prompt)
        dimension_match = re.search(
            rf"\b(length|width|height|diameter|dia)\s*(?:=|:|to|of)?\s*({_NUMBER_VALUE})",
            prompt,
            re.IGNORECASE,
        )
        if dimension_match:
            field = dimension_match.group(1).lower()
            changes["diameter" if field == "dia" else field] = float(dimension_match.group(2))
        if not changes:
            return PromptInterpretation(
                status="clarification",
                message="Tell me a position or dimension to change, for example “move feature 1 to x 20” or “set feature 1 length to 30 mm.”",
                cad_params=current,
                features=features,
            )
        updated_data = existing.model_dump()
        updated_data.update(changes)
        try:
            updated_feature = type(existing).model_validate(updated_data)
        except ValidationError:
            return PromptInterpretation(
                status="clarification",
                message="Primitive dimensions must be greater than 0 and no larger than 500 mm; positions must be between -500 and 500 mm.",
                cad_params=current,
                features=features,
            )
        updated_features = list(features)
        updated_features[target_index] = updated_feature
        return PromptInterpretation(
            status="generated",
            message=f"Updated {existing.shape} {target_index + 1} and generated the model.",
            cad_params=current,
            features=updated_features,
        )

    return None


def _first_number(*patterns: str, prompt: str) -> float | None:
    for pattern in patterns:
        match = re.search(pattern, prompt, re.IGNORECASE)
        if match:
            return float(match.group(1))
    return None


def _relative_delta(prompt: str, expressions: tuple[str, ...], default: float) -> float:
    for expression in expressions:
        match = re.search(
            rf"(?:\b({_NUMBER_VALUE})\s*(?:mm)?\s+)?\b{expression}\b"
            rf"(?:\s+by\s+({_NUMBER_VALUE})\s*(?:mm)?)?",
            prompt,
            re.IGNORECASE,
        )
        if match:
            amount = float(match.group(1) or match.group(2)) if match.group(1) or match.group(2) else default
            return -amount if expression in {"thinner", "shorter", "narrower", "smaller"} else amount
    return 0


def interpret_prompt(
    prompt: str,
    current: BaseplateParams,
    features: list[PrimitiveFeature] | None = None,
) -> PromptInterpretation:
    """Interpret baseplate and primitive requests without executing code."""
    prompt = prompt.replace("×", " x ").replace("✕", " x ")
    current_features = features or []
    primitive_result = _primitive_prompt(prompt, current, current_features)
    if primitive_result is not None:
        return primitive_result
    if _UNSUPPORTED_OBJECTS.search(prompt):
        return PromptInterpretation(
            status="unsupported",
            message="I can currently generate baseplates with dimensions and four through-holes, but not that object type.",
            cad_params=current,
            features=current_features,
        )

    values = current.model_dump()
    changes: dict[str, float] = {}
    dimension_pair = _DIMENSION_PAIR.search(prompt)
    if dimension_pair:
        changes["length"] = float(dimension_pair.group(1))
        changes["width"] = float(dimension_pair.group(2))

    named_dimensions = {
        "length": (
            rf"\b(?:length|long)\s*(?:of|=|:|to)?\s*{_NUMBER}\s*(?:mm)?\b",
            rf"\b{_NUMBER}\s*mm\s*(?:long|length)\b",
        ),
        "width": (
            rf"\bwidth\s*(?:of|=|:|to)?\s*{_NUMBER}\s*(?:mm)?\b",
            rf"\b{_NUMBER}\s*mm\s*wide\b",
        ),
        "thickness": (
            rf"\bthickness\s*(?:of|=|:|to)?\s*{_NUMBER}\s*(?:mm)?\b",
            rf"\b{_NUMBER}\s*mm\s*thick\b",
        ),
        "hole_diameter": (
            rf"\bhole(?:s)?(?:\s+(?:diameter|dia))?\s*(?:of|=|:|to)?\s*{_NUMBER}\s*(?:mm)?\b",
            rf"\b{_NUMBER}\s*mm\s*(?:diameter\s*)?holes?\b",
            rf"\bholes?\s+M\s*{_NUMBER}\b",
            rf"\bM\s*{_NUMBER}\s+holes?\b",
        ),
        "edge_offset": (
            rf"\b(?:edge\s+offset|offset)\s*(?:of|=|:|to)?\s*{_NUMBER}\s*(?:mm)?\b",
        ),
    }
    for field, patterns in named_dimensions.items():
        value = _first_number(*patterns, prompt=prompt)
        if value is not None:
            changes[field] = value

    explicitly_requested_fields = set(changes)
    for field, expressions, default in (
        ("thickness", ("thicker", "thinner"), 2.0),
        ("length", ("longer", "shorter"), 10.0),
        ("width", ("wider", "narrower"), 10.0),
        ("hole_diameter", ("larger", "smaller"), 1.0),
    ):
        if field == "hole_diameter" and not _HOLE_SIZE_CONTEXT.search(prompt):
            continue
        if field not in changes:
            changes[field] = values[field] + _relative_delta(prompt, expressions, default)
            if changes[field] == values[field]:
                changes.pop(field)

    edge_offset_reduction = re.search(
        rf"\b(?:reduce|decrease)\s+(?:the\s+)?(?:hole\s+)?"
        rf"(?:spacing|offset)\s+(?:from\s+the\s+)?edges?"
        rf"(?:\s+by\s+({_NUMBER_VALUE})\s*(?:mm)?)?",
        prompt,
        re.IGNORECASE,
    )
    if edge_offset_reduction:
        amount = float(edge_offset_reduction.group(1) or 2.0)
        changes["edge_offset"] = values["edge_offset"] - amount

    if not changes:
        if _FOUR_HOLE_CREATION.search(prompt):
            return PromptInterpretation(
                status="generated",
                message="Generated a baseplate with four corner holes using the current parameters.",
                cad_params=current,
                features=current_features,
            )
        if _AMBIGUOUS_TERMS.search(prompt):
            return PromptInterpretation(
                status="clarification",
                message="Which baseplate dimension should I change, and to what value? For example, specify both length and width or name the thickness.",
                cad_params=current,
                features=current_features,
            )
        if not _SUPPORTED_TERMS.search(prompt):
            return PromptInterpretation(
                status="unsupported",
                message="I can currently generate baseplates with dimensions and four through-holes. Try specifying length, width, thickness, or hole diameter.",
                cad_params=current,
                features=current_features,
            )
        return PromptInterpretation(
            status="clarification",
            message="Please specify a baseplate dimension or a relative edit, such as “make it 120 × 80 mm with 8 mm holes” or “make it thicker.”",
            cad_params=current,
            features=current_features,
        )

    values.update(changes)
    try:
        updated = BaseplateParams.model_validate(values)
    except ValueError:
        return PromptInterpretation(
            status="clarification",
            message="Those dimensions do not leave enough material for four through-holes. Please adjust the hole diameter or edge offset.",
            cad_params=current,
            features=current_features,
        )

    changed_fields = [
        f"{field.replace('_', ' ')}: {getattr(current, field):g} → {getattr(updated, field):g} mm"
        for field in changes
        if getattr(current, field) != getattr(updated, field)
    ]
    if not changed_fields:
        if explicitly_requested_fields:
            return PromptInterpretation(
                status="generated",
                message="The requested dimensions already match the current model; generated it with the existing parameters.",
                cad_params=updated,
                features=current_features,
            )
        return PromptInterpretation(
            status="clarification",
            message="Those dimensions are already set. Specify a different dimension or relative edit.",
            cad_params=current,
            features=current_features,
        )

    return PromptInterpretation(
        status="generated",
        message=f"Updated baseplate parameters ({'; '.join(changed_fields)}) and generated the model.",
        cad_params=updated,
        features=current_features,
    )
