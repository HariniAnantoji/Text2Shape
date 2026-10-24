import re
from typing import Literal

from pydantic import BaseModel

from cad_generator import BaseplateParams

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


def interpret_prompt(prompt: str, current: BaseplateParams) -> PromptInterpretation:
    """Interpret simple baseplate dimensions and relative edits without executing code."""
    prompt = prompt.replace("×", " x ").replace("✕", " x ")
    if _UNSUPPORTED_OBJECTS.search(prompt):
        return PromptInterpretation(
            status="unsupported",
            message="I can currently generate baseplates with dimensions and four through-holes, but not that object type.",
            cad_params=current,
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
        if field not in changes:
            changes[field] = values[field] + _relative_delta(prompt, expressions, default)
            if changes[field] == values[field]:
                changes.pop(field)

    if not changes:
        if _AMBIGUOUS_TERMS.search(prompt):
            return PromptInterpretation(
                status="clarification",
                message="Which baseplate dimension should I change, and to what value? For example, specify both length and width or name the thickness.",
                cad_params=current,
            )
        if not _SUPPORTED_TERMS.search(prompt):
            return PromptInterpretation(
                status="unsupported",
                message="I can currently generate baseplates with dimensions and four through-holes. Try specifying length, width, thickness, or hole diameter.",
                cad_params=current,
            )
        return PromptInterpretation(
            status="clarification",
            message="Please specify a baseplate dimension or a relative edit, such as “make it 120 × 80 mm with 8 mm holes” or “make it thicker.”",
            cad_params=current,
        )

    values.update(changes)
    try:
        updated = BaseplateParams.model_validate(values)
    except ValueError:
        return PromptInterpretation(
            status="clarification",
            message="Those dimensions do not leave enough material for four through-holes. Please adjust the hole diameter or edge offset.",
            cad_params=current,
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
            )
        return PromptInterpretation(
            status="clarification",
            message="Those dimensions are already set. Specify a different dimension or relative edit.",
            cad_params=current,
        )

    return PromptInterpretation(
        status="generated",
        message=f"Updated baseplate parameters ({'; '.join(changed_fields)}) and generated the model.",
        cad_params=updated,
    )
