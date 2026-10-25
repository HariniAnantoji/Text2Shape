"""Requesting a structured CAD plan from the language model.

This module owns the "get a plan" half of the AI pipeline:
  - the plan data models (CADOperation, CADPlan)
  - the system prompt that constrains the model
  - the LLM transport (local Ollama or a hosted OpenAI-compatible endpoint)

Validating and applying a plan lives in `ai_cad.py`. Keeping the two halves
separate makes the request/transport concern independent from the geometry
state-transition concern.
"""

import json
import os
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field, ValidationError

from cad_models import (
    BaseplateParams,
    HoleFeature,
    ImportedMesh,
    PrimitiveFeature,
)

MAX_OPERATIONS = 10
OLLAMA_CHAT_URL = f"{os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434').rstrip('/')}/api/chat"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"

# Hosted LLM (OpenAI-compatible) configuration. When a base URL and an API key
# are present the backend calls a hosted chat-completions endpoint instead of a
# local Ollama server. This is how the service runs in AWS without local Ollama.
# Works with any OpenAI-compatible provider that hosts Llama models
# (e.g. Together AI, Groq, Fireworks).
DEFAULT_HOSTED_MODEL = "meta-llama/Llama-3.1-8B-Instruct-Turbo"


class LocalModelError(Exception):
    """Raised when the local Ollama model cannot produce a usable CAD plan."""


class CADOperation(BaseModel):
    action: Literal[
        "add_primitive",
        "update_primitive",
        "remove_primitive",
        "set_baseplate",
        "add_hole",
        "remove_hole",
        "update_imported_mesh",
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


SYSTEM_PROMPT = """You convert a user's CAD request into a safe, structured plan for a simple CAD workbench.
Return only a JSON object with exactly these top-level keys: reply (brief friendly text) and operations (an array of up to 10 operations).
Allowed operation actions:
- add_primitive: add a box, cylinder, or sphere. Supply shape and requested dimensions and center coordinates when specified. Dimensions are millimeters. Omitted dimensions use sensible defaults. Coordinates are absolute world-space center coordinates.
- update_primitive: update the existing primitive identified by its one-based target_index in the supplied feature list. Supply only changed dimensions or x/y/z. Use scale_factor for uniform scaling when requested.
- remove_primitive: remove the primitive at target_index.
- set_baseplate: change only supplied baseplate_length, baseplate_width, baseplate_thickness, hole_diameter, edge_offset, x, y, or z fields. Baseplate position coordinates are its center.
- add_hole: cut one new through-hole in the baseplate. x/y are absolute world-space coordinates in millimeters. For a hole in the center or middle of the plate, OMIT x and y (they default to the baseplate center) or set them equal to the baseplate's own x and y from the current state. Omit diameter to reuse the baseplate's corner-hole diameter ("same as the corner holes"); only supply diameter when the user gives a different size. The hole must stay fully inside the plate: for a hole offset from the baseplate center, keep abs(x - baseplate_x) + diameter/2 below length/2 and abs(y - baseplate_y) + diameter/2 below width/2. If the user requests multiple holes, return one add_hole operation per hole when positions are clear.
- remove_hole: remove the extra hole at its one-based target_index from the supplied holes list.
- update_imported_mesh: move the imported STL using supplied x/y/z coordinates, or uniformly resize it with scale_factor. Preserve all other transform values.
- clarify: ask one concise question when the requested geometry or target is ambiguous.
- unsupported: explain that the request is outside the current MVP.
The baseplate already has four corner holes; changing their size or spacing is a set_baseplate operation. Extra holes are additional through-holes.
Do not invent values the user did not specify except sensible defaults for primitive dimensions and placement. Place a new primitive on top of the baseplate when no z position is given. Do not generate code, scripts, or free-form operation names. Geometry operations must be limited to the list above.
An imported STL is a faceted mesh; it can be moved or uniformly scaled, but its faces cannot be edited parametrically.
Current CAD state follows as JSON, then the new user request."""


def _hosted_base_url() -> str:
    return os.getenv("LLM_BASE_URL", "").rstrip("/")


def _resolve_api_key() -> str:
    """Return the hosted-LLM API key.

    Priority:
    1. LLM_API_KEY environment variable (set directly, or injected by ECS from
       a Secrets Manager secret).
    2. LLM_API_KEY_SECRET_ARN -> fetched from AWS Secrets Manager at runtime.
    Returns an empty string when neither is configured (local Ollama mode).
    """
    direct_key = os.getenv("LLM_API_KEY", "").strip()
    if direct_key:
        return direct_key

    secret_ref = os.getenv("LLM_API_KEY_SECRET_ARN", "").strip()
    if not secret_ref:
        return ""

    # Lazy import so local Ollama usage never requires boto3 to be importable.
    import boto3

    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_ref)
    secret_string = response.get("SecretString", "")
    # Support either a raw string secret or a JSON secret like {"LLM_API_KEY": "..."}
    try:
        parsed = json.loads(secret_string)
        if isinstance(parsed, dict):
            for candidate in ("LLM_API_KEY", "api_key", "apiKey"):
                if parsed.get(candidate):
                    return str(parsed[candidate]).strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return secret_string.strip()


def hosted_llm_is_enabled() -> bool:
    return bool(_hosted_base_url()) and bool(_resolve_api_key())


def _build_user_content(
    prompt: str,
    cad_params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature],
    imported_mesh: ImportedMesh | None,
) -> str:
    return json.dumps(
        {
            "cad_params": cad_params.model_dump(),
            "features": [feature.model_dump() for feature in features],
            "holes": [hole.model_dump() for hole in holes],
            "imported_mesh": imported_mesh.model_dump() if imported_mesh else None,
            "request": prompt,
        },
        separators=(",", ":"),
    )


def _request_cad_plan_hosted(user_content: str, api_key: str) -> CADPlan:
    """Call an OpenAI-compatible chat-completions endpoint (hosted Llama)."""
    base_url = _hosted_base_url()
    payload = {
        "model": os.getenv("LLM_MODEL", DEFAULT_HOSTED_MODEL),
        "temperature": 0,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }
    request = Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            result = json.load(response)
    except HTTPError as error:
        try:
            error_body = json.loads(error.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            error_body = {}
        detail = error_body.get("error")
        if isinstance(detail, dict):
            detail = detail.get("message")
        if isinstance(detail, str):
            detail = detail[:500]
        else:
            detail = "Check the LLM provider, model name, and API key."
        raise LocalModelError(f"LLM provider returned HTTP {error.code}: {detail}") from error
    except (URLError, TimeoutError, OSError) as error:
        raise LocalModelError(
            f"Could not reach the hosted LLM endpoint at {base_url}."
        ) from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise LocalModelError("The hosted LLM returned an invalid response.") from error

    try:
        content = result["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise TypeError("Model content is not text")
        return CADPlan.model_validate_json(content)
    except (KeyError, IndexError, TypeError, ValidationError) as error:
        raise LocalModelError(
            "The hosted LLM returned a CAD plan that did not match the required format."
        ) from error


def _request_cad_plan_ollama(user_content: str) -> CADPlan:
    """Call a local (or self-hosted) Ollama chat endpoint."""
    payload = {
        "model": os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL),
        "stream": False,
        "think": False,
        "format": "json",
        "options": {"temperature": 0, "num_predict": 700},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }
    request = Request(
        OLLAMA_CHAT_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
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


def request_cad_plan(
    prompt: str,
    cad_params: BaseplateParams,
    features: list[PrimitiveFeature],
    holes: list[HoleFeature],
    imported_mesh: ImportedMesh | None = None,
) -> CADPlan:
    user_content = _build_user_content(prompt, cad_params, features, holes, imported_mesh)

    if _hosted_base_url():
        api_key = _resolve_api_key()
        if not api_key:
            raise LocalModelError(
                "LLM_BASE_URL is set but no API key was found. Set LLM_API_KEY or "
                "LLM_API_KEY_SECRET_ARN."
            )
        return _request_cad_plan_hosted(user_content, api_key)

    return _request_cad_plan_ollama(user_content)
