# Text2Shape
Ai integrated CAD applications you can chat to design.

## Frontend file layout

- `frontend/src/app/page.tsx` contains the main app state and workspace layout.
- `frontend/src/components/ThreeViewport.tsx` owns the Three.js viewport.
- `frontend/src/components/BlueprintView.tsx` renders the 2D blueprint.
- `frontend/src/textToShapeData.ts` holds shared prompts, initial chat messages, and material presets.
- The 3D workbench supports a four-hole baseplate plus positioned box, cylinder, and sphere features. Feature dimensions and positions are in millimeters.

## Python setup

Activate the virtual environment and install project dependencies:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Add Python packages to `requirements.txt` as the project needs them.

## Run the API

Start the API from `Text2Shape`:

```sh
python -m uvicorn main:app --reload
```

## Build the backend container

The backend image can be built from the repository root with Docker:

```powershell
docker build -t text2shape-api .
docker run --rm -p 8000:8000 text2shape-api
```

The API will be available at `http://localhost:8000`. The current backend
uses local artifact storage unless S3 is configured. Container-local files
are not durable across task replacement, so configure S3 before deploying to
ECS.

In another terminal, start the frontend:

```sh
cd frontend
npm install
npm run dev
```

The frontend sends prompts to `http://localhost:8000/generate` by default. To
use the ECS API from local development, set its current public endpoint before
starting Next.js:

```powershell
$env:NEXT_PUBLIC_API_URL = "http://<current-ecs-task-public-ip>:8000"
npm run dev
```

Replace the placeholder with the current task public IP from ECS. Do not commit
the endpoint to source control; it can change when ECS replaces the task. The
backend allows `http://localhost:3000` by default. To allow a different
frontend origin, configure the backend's `CORS_ORIGINS` environment variable
as a comma-separated list of exact origins (for example,
`https://your-frontend.example.com`) and deploy a new image. Never use `*` for
a public deployment.

`POST /generate` accepts a prompt and optional baseplate parameters. The
response contains validated parameters and a `files` object with URLs for the
generated STL and STEP files:

```sh
curl -X POST http://127.0.0.1:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a 100 x 60 mm baseplate with 6 mm holes","cad_params":{"length":100,"width":60,"thickness":8,"hole_diameter":6,"edge_offset":10}}'
```

The baseplate parameters also accept a center position (`x`, `y`, `z`, in
millimeters), defaulting to zero. Its four-hole pattern moves with the plate.
The request may also include up to 20 additive primitive features. Each
feature has an `id`, a `shape` (`box`, `cylinder`, or `sphere`), and a center
position (`x`, `y`, `z`, in millimeters). Boxes use `length`, `width`, and
`height`; cylinders use `diameter` and `height`; spheres use `diameter`.
In the workbench, use the baseplate position fields and each primitive's
position/dimension fields to move and resize the model before generating new
STEP and STL files.

Chat requests are interpreted by a local Ollama model into a constrained CAD
plan. The backend validates each operation and generates geometry itself;
model output is never executed as code. The MVP supports
baseplate dimensions and its four corner holes, additional through-holes,
adding/removing box, cylinder, and sphere primitives, positioning them, and
resizing or uniformly scaling existing primitives. Ambiguous requests return
a clarification instead of changing the design. Generated files are served
through restricted `/artifacts/` URLs. The frontend loads the STL in the 3D
viewport and provides a STEP download link.

Examples to type in the chat include “add a 30 × 20 × 10 mm box on top,”
“drill a 6 mm hole at x 0 y 0,” “move feature 1 to x 25,” and “scale feature 1
by 1.5.” Include dimensions and position when you have a specific placement in
mind. The assistant asks for clarification when the target or request is
ambiguous.

Install Ollama for Windows from [ollama.com/download](https://ollama.com/download),
then open a new PowerShell terminal and download the local model:

```powershell
ollama pull qwen2.5:7b
ollama run qwen2.5:7b
```

Ollama runs the model on your computer; no Hugging Face token or per-request
inference API is used. Keep Ollama running while using Text2Shape. In another
terminal, start the backend and frontend as described above. The backend uses
`qwen2.5:7b` at `http://localhost:11434` by default. Set `OLLAMA_MODEL` to a
different model name or `OLLAMA_BASE_URL` to a different Ollama host if needed.
The 7B model download is several gigabytes and inference speed depends on your
computer. For ECS deployment, Ollama must be hosted on a machine reachable by
the backend; a local Windows Ollama installation is only available to local
development.

To store artifacts in a private S3 bucket, set these variables for the API:

```text
S3_BUCKET_NAME=text2shape-cad-artifacts-2026
AWS_REGION=us-east-2
```

When `S3_BUCKET_NAME` is unset, the API stores files locally for development.
When it is set, the API uploads generated files to S3 and streams downloads
through the API; the bucket does not need public access or browser CORS rules.
The AWS SDK uses its standard credential chain. For ECS, assign the task a
dedicated task role limited to `s3:PutObject` and `s3:GetObject` on
`arn:aws:s3:::text2shape-cad-artifacts-2026/*`. Do not put AWS access keys in
the image or repository.
Local browser requests are allowed from `http://localhost:3000` by default.

## Baseplate CAD tests

The API uses `cad_generator.py` to create the baseplate with four through-holes
and export STEP and STL files. Run its focused tests from the project root with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

## Environment variables and API keys

Never commit `.env` or real API keys to GitHub. Create your local `.env` by
copying `.env.example`, then fill in the required variables:

```powershell
Copy-Item .env.example .env
```

Commit only `.env.example`, containing variable names and placeholder values,
not secrets. Each collaborator should get their own API key from the service
provider and store it in their local `.env`. If a key must be shared, use an
approved secrets manager or another secure channel, not GitHub or chat.
