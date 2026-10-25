Hwo # Text2Shape Project Summary

**Project:** Text2Shape  
**Purpose:** A chat-assisted CAD workbench for creating and editing a parametric
baseplate design, previewing it in 3D/2D, and exporting STEP and STL files.

This summary records the project work and the latest local demo setup. It
contains no API tokens, passwords, or cloud credentials.

## Product and architecture

- **Frontend:** Next.js/React application in `frontend/`. The workbench includes
  a chat panel, 3D canvas, 2D blueprint, CAD code/export view, design controls,
  material presets, and revision history.
- **Backend:** FastAPI application in `main.py`. `POST /generate` accepts a
  prompt and CAD state, asks the configured local model for a structured plan,
  validates that plan, creates CAD geometry, and returns STL/STEP artifact
  links.
- **CAD generation:** `cad_generator.py` uses build123d to generate a
  four-corner-hole baseplate and positioned primitives, then exports STEP and
  STL files.
- **Local language model:** `ai_cad.py` calls the Ollama chat API on the local
  machine. The model returns a constrained JSON plan; the backend validates
  it and creates geometry itself. It does **not** execute model-generated
  Python or CAD code.
- **Artifact storage:** `artifact_storage.py` serves local files for
  development or can upload/retrieve files from private S3 when configured.

## Implemented features

- Baseplate length, width, thickness, corner-hole diameter and edge offset.
- Baseplate position controls and positioned box, cylinder, and sphere
  primitives, with dimensions in millimeters.
- Additive through-holes in the plate, with diameter and world-space X/Y
  position.
- Chat operations for adding, moving, resizing/scaling, and removing supported
  geometry, plus clarification for ambiguous or invalid requests.
- Validation of CAD parameters, feature limits, and hole placement before
  geometry generation.
- 3D STL preview, 2D blueprint, approximate volume/weight display, generated
  build123d code, revision history, and STEP download.
- Local artifact URLs and optional private S3 artifact storage.
- `.env` files and Python virtual environments are excluded from Git by
  `.gitignore`; do not put credentials in source control or chat.

## Local demo: verified setup

The model downloaded for the demo is **`qwen3.5:4b`**. Ollama runs locally and
does not require a Hugging Face token or a paid per-request inference API.
Model execution uses the computer’s own resources.

At the latest verified run:

- Ollama was responding on `http://localhost:11434`.
- The Text2Shape frontend was responding on `http://localhost:3000`.
- The active demo backend was configured with `OLLAMA_MODEL=qwen3.5:4b` on
  `http://localhost:8001`.
- The frontend was configured to send requests to that backend.
- Chat successfully added a 20 × 20 × 20 mm box at the top of the plate.
  The API returned valid STL/STEP links, and the browser loaded the STL.
- A center 6 mm through-hole succeeded after the request explicitly specified
  `x=0, y=0`; the model’s first interpretation of a less precise request chose
  an invalid location and was safely rejected.
- The centered box visually obscured the center hole in the 3D view. Moving
  feature 1 to `x=30 mm` succeeded and moved it aside. The 2D blueprint can
  also show the hole and feature outlines.
- The 3D canvas offers **Download STL** and **Download STEP** for the current
  generated revision. These are exported model files; they do not preserve the
  chat transcript or editable revision history.

### Run the local demo

Keep Ollama running with the downloaded model. From PowerShell, start the API
with the correct model and port:

```powershell
cd C:\Harini\Text2Shape
$env:OLLAMA_MODEL = "qwen3.5:4b"
$env:CORS_ORIGINS = "http://localhost:3000"
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8001
```

In a second terminal, start the frontend against that API:

```powershell
cd C:\Harini\Text2Shape\frontend
$env:NEXT_PUBLIC_API_URL = "http://localhost:8001"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep all three services
(Ollama, API, frontend) running during the demo. First model responses can take
several seconds while the model loads and generates. For reliable CAD
placement, make chat prompts explicit about shape, dimensions, coordinates,
and whether a hole should pass through the plate.

**Port note:** The earlier local backend on port 8000 may still be a stale
process using the default model name. The verified demo frontend/API pairing
is port 3000 → port 8001. Do not switch the frontend to port 8000 unless that
backend has been intentionally restarted with the same Ollama configuration.

## Deployment history and current deployment status

- An earlier, non-Ollama backend was deployed to AWS ECS and configured to
  store generated artifacts in a private S3 bucket. The deployment was
  smoke-tested when active.
- The current local Ollama-enabled backend and frontend changes have **not**
  been deployed to ECS. A local Windows Ollama process is not reachable by
  ECS; cloud deployment would require Ollama hosted on infrastructure
  reachable by the backend, which can incur compute/storage costs.
- No Hugging Face provider is used by the current local implementation.
  Hugging Face token setup is not required for the local demo.
- Worktree changes remain uncommitted unless separately committed after this
  summary was written.

## Validation completed

- Full backend test suite: **38 passed, 2 subtests passed** after changing the
  backend from hosted Hugging Face to Ollama.
- After disabling Qwen thinking output for structured CAD plans, focused
  AI/CAD and API tests: **19 passed**.
- Live local browser test with `qwen3.5:4b`: box created, revision updated,
  STL loaded successfully, and STEP download link appeared.
- Live local API test for an explicit center through-hole returned a generated
  model; follow-up movement of the box was also accepted.
- Python syntax, Pylance diagnostics for the updated backend files, and
  `git diff --check` were checked during the provider change.
- Earlier in development, frontend lint, TypeScript checking, and production
  builds passed for the geometry/UI changes. They were not rerun as part of
  the latest local Ollama switch.

## Important files

| File | Responsibility |
|---|---|
| `main.py` | FastAPI endpoints, input validation, CAD-plan execution, artifact URLs |
| `cad_models.py` | Shared Pydantic models (params, features, artifacts) |
| `cad_plan.py` | LLM request + constrained CAD plan models (local Ollama / hosted Llama) |
| `ai_cad.py` | CAD plan validation and application to the design state |
| `cad_generator.py` | build123d solid geometry construction |
| `cad_export.py` | STEP and STL export (mesh merged into STL only) |
| `artifact_storage.py` | Local/S3 artifact storage |
| `prompt_parser.py` | Deterministic prompt interpretation retained from earlier work (unused by the API) |
| `frontend/src/app/page.tsx` | Main UI state, chat, API requests, history and code display |
| `frontend/src/types.ts` | Shared CAD and API types |
| `frontend/src/components/ThreeViewport.tsx` | 3D preview and STL rendering |
| `frontend/src/components/BlueprintView.tsx` | 2D drawing and feature/hole outlines |
| `tests/test_ai_cad.py` | Plan application and Ollama client tests |
| `tests/test_generate_api.py` | API and artifact-route tests |
| `tests/test_cad_generator.py` | CAD feature/export tests |
| `README.md` | Setup, API, local Ollama, and storage documentation |

## Known demo considerations

- Small local models can misunderstand vague geometric requests. The backend
  validates their plans, but explicit dimensions and coordinates improve
  reliability.
- A solid primitive placed directly over a hole can visually hide that hole.
  Move the primitive aside or use the blueprint view to show both.
- The frontend’s design state is in the browser session; refreshing can reset
  an in-progress design. Regenerate the desired demo geometry after a reload.
- The README documents the default Ollama model (`qwen2.5:7b`); the current
  demo uses `qwen3.5:4b` through the `OLLAMA_MODEL` environment variable.
