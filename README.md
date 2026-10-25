# Text2Shape

A chat-assisted CAD workbench. Describe a part in plain English and Text2Shape
generates a real, parametric baseplate — previewed in 3D/2D and exported as
manufacturable **STEP** and **STL** files.

The language model never runs code. It returns a constrained JSON *plan*; the
backend validates every operation and builds the geometry itself.

---

## How it works

```
Browser (Next.js)  ──prompt + current design──▶  FastAPI  /generate
      ▲                                              │
      │                                              ▼
      │                                   cad_plan.py  ──▶  LLM (Ollama or hosted)
      │                                              │   (returns a JSON plan)
      │                                              ▼
      │                                   ai_cad.py   (validate + apply plan)
      │                                              ▼
      │                                   cad_generator.py  (build123d geometry)
      │                                              ▼
      │                                   cad_export.py  (STEP + STL)
      │                                              ▼
      └──────artifact URLs────────────  artifact_storage.py  (local disk or S3)
```

The backend is stateless: every request carries the full design. The browser
owns the design state and saves projects to `localStorage`.

### Backend modules

| File | Responsibility |
|---|---|
| `main.py` | FastAPI endpoints, request validation, artifact URLs |
| `cad_models.py` | Shared Pydantic models (params, features, artifacts) |
| `cad_plan.py` | LLM request + constrained CAD-plan models |
| `ai_cad.py` | Validate and apply a plan to the design state |
| `cad_generator.py` | build123d solid geometry construction |
| `cad_export.py` | STEP and STL export |
| `artifact_storage.py` | Local or S3 artifact storage |

### Frontend

| File | Responsibility |
|---|---|
| `src/app/page.tsx` | Main UI state, chat, API calls, history, code view |
| `src/components/ThreeViewport.tsx` | Three.js 3D preview |
| `src/components/BlueprintView.tsx` | 2D top-view blueprint |
| `src/hooks/useSavedProjects.ts` | Save/load/export projects via `localStorage` |
| `src/types.ts` | Shared TypeScript types |

---

## Quick start (local)

You need **Python 3.11+**, **Node 18+**, and **Ollama**.

**1. Ollama** — install from [ollama.com/download](https://ollama.com/download),
then pull the model:

```powershell
ollama pull qwen2.5:7b
```

**2. Backend** — from the project root:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:CORS_ORIGINS = "http://localhost:3000"
python -m uvicorn main:app --port 8000 --reload
```

**3. Frontend** — in a second terminal:

```powershell
cd frontend
npm install
$env:NEXT_PUBLIC_API_URL = "http://localhost:8000"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The first model response is
slow while Ollama loads; later ones are fast.

> Tip: `.\demo.ps1` starts both servers and opens the app in one command.

---

## Using it

Type requests in the chat. Be explicit about dimensions and coordinates for
reliable placement. Examples:

- `Create a 100 x 60 mm baseplate with 6 mm corner holes`
- `Add a 30 x 20 x 10 mm box on top`
- `Add a 6 mm hole at x 0 y 0`
- `Move feature 1 to x 25`
- `Scale feature 1 by 1.5`

The workbench supports: baseplate dimensions and its four corner holes,
additional through-holes, box/cylinder/sphere primitives (add, move, resize,
scale), importing an STL mesh, material presets, revision history, and saving
or exporting projects. Ambiguous requests get a clarification instead of
bad geometry.

An imported STL is a faceted mesh: it can be moved or uniformly scaled and is
merged into the **STL** export. The **STEP** export stays solid (baseplate +
primitives), because a mesh is not a B-rep solid.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Health check (`{"status":"ok"}`) |
| `POST` | `/generate` | Build a model from a prompt + current design |
| `POST` | `/imports` | Upload an STL (raw body, `X-Filename` header) |
| `GET` | `/imports/{id}` | Fetch an uploaded STL |
| `GET` | `/artifacts/{id}/{file}` | Download a generated STEP/STL |

Example:

```sh
curl -X POST http://127.0.0.1:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a 100 x 60 mm baseplate with 6 mm holes"}'
```

Interactive docs are at `/docs`.

---

## Configuration

All configuration is via environment variables. Everything is **local by
default** — set these only to opt into cloud features.

| Variable | Default | Purpose |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed frontend origins (comma-separated; never `*`) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama host |
| `OLLAMA_MODEL` | `qwen2.5:7b` | Local model name |
| `LLM_BASE_URL` | _(unset)_ | Hosted OpenAI-compatible endpoint; when set, Ollama is bypassed |
| `LLM_MODEL` | `meta-llama/Llama-3.1-8B-Instruct-Turbo` | Hosted model name |
| `LLM_API_KEY` | _(unset)_ | Hosted-LLM key (or inject from a secret) |
| `LLM_API_KEY_SECRET_ARN` | _(unset)_ | Fetch the key from AWS Secrets Manager at runtime |
| `S3_BUCKET_NAME` | _(unset)_ | Store artifacts in S3; otherwise local `downloads/` |
| `AWS_REGION` | _(unset)_ | Required when `S3_BUCKET_NAME` is set |

Copy `.env.example` to `.env` for local setup. Never commit real keys.

---

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests/
```

---

## Deploying

The app is designed to run locally; deployment is optional. To run it in the
cloud (ECS Fargate backend, S3 storage, Secrets Manager key, Amplify/Vercel
frontend), see [`deploy/README.md`](deploy/README.md).

> Note: cloud containers cannot reach a local Ollama. For cloud deployment,
> point `LLM_BASE_URL` at a hosted provider (Together AI, Groq, Fireworks).
