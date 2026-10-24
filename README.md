# Text2Shape
Ai integrated CAD applications you can chat to design.

## Frontend file layout

- `frontend/src/app/page.tsx` contains the main app state and workspace layout.
- `frontend/src/components/ThreeViewport.tsx` owns the Three.js viewport.
- `frontend/src/components/BlueprintView.tsx` renders the 2D blueprint.
- `frontend/src/textToShapeData.ts` holds shared prompts, initial chat messages, and material presets.

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

In another terminal, start the frontend:

```sh
cd frontend
npm install
npm run dev
```

The frontend sends prompts to `http://localhost:8000/generate`. To use a
different API URL, set `NEXT_PUBLIC_API_URL` before starting Next.js.

`POST /generate` accepts a prompt and optional baseplate parameters. It returns
validated parameters and URLs for generated STEP and STL files:

```sh
curl -X POST http://127.0.0.1:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Make a baseplate","cad_params":{"length":120,"width":80,"thickness":10,"hole_diameter":8,"edge_offset":12}}'
```

The CAD engine currently uses the supplied parameters (or defaults); it does
not infer dimensions from the prompt yet. Generated files are served locally
under `/files/`. This local file storage is for development; configure managed
storage such as S3 before deploying. Local browser requests are allowed from
`http://localhost:3000`.

## Baseplate CAD prototype

The standalone `cad_generator.py` module creates a baseplate with four
through-holes and exports STEP and STL files. It does not yet run from the API.
Run its focused tests from the project root with:

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
