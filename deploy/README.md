# Deploying Text2Shape to AWS

## The big picture: where each piece goes

Text2Shape has three parts, each with a natural home:

| Part | Deploy to | Notes |
|---|---|---|
| **Backend** (FastAPI + build123d) | **ECS Fargate** behind an **Application Load Balancer** | Must be a container: build123d needs the OpenCascade native libraries (already in the `Dockerfile`). No Lambda/serverless path. |
| **Frontend** (Next.js) | **AWS Amplify Hosting** (see `amplify.yml`) or **Vercel** | Set `NEXT_PUBLIC_API_URL` to the backend's ALB URL at build time. |
| **CAD artifacts** | **S3** (private bucket) | Backend already supports it; downloads stream through the API. |
| **LLM API key** | **Secrets Manager** | Injected into the backend; see below. |
| **LLM itself** | **Hosted provider** (Together AI / Groq / Fireworks) | Cloud containers can't reach your local Ollama. Set `LLM_BASE_URL` + `LLM_MODEL`. |

Recommended order: (1) create S3 bucket + LLM secret, (2) deploy the backend to
ECS and get its ALB URL, (3) deploy the frontend with `NEXT_PUBLIC_API_URL` set
to that URL, (4) set the backend's `CORS_ORIGINS` to the frontend's final URL.

Health check: the ALB target group should health-check `GET /`, which returns
`{"status":"ok"}`.

---

## Frontend (AWS Amplify)

1. In the Amplify console, connect this repo. Amplify auto-detects `amplify.yml`
   (which builds the `frontend/` subdirectory).
2. Under **App settings -> Environment variables**, add:
   `NEXT_PUBLIC_API_URL = https://api.your-domain.com` (your ALB/API URL).
3. Deploy. Amplify gives you a URL like `https://main.xxxx.amplifyapp.com`
   (attach a custom domain if you have one).
4. Put that frontend URL into the backend's `CORS_ORIGINS` and redeploy the
   backend task.

(Prefer Vercel? Import the repo, set **Root Directory** to `frontend`, add the
same `NEXT_PUBLIC_API_URL` env var, deploy.)

---

## Backend details

This section covers the two backend specifics:

1. Storing generated CAD files in your S3 bucket.
2. Storing the hosted LLM API key as an AWS secret so the backend runs in the
   cloud, not just locally.

> **Important architecture note.** Locally, the backend talks to **Ollama** at
> `http://localhost:11434`. Inside an AWS container, `localhost` is the
> container itself — there is no Ollama there. To run in the cloud you must
> either (A) point the backend at a **hosted** OpenAI-compatible Llama endpoint
> that needs an API key (Together AI, Groq, Fireworks, etc.), or (B) run Ollama
> yourself on a reachable GPU host. The steps below use option A, which is what
> the "API key as a secret" request implies.

Replace every `111122223333`, `us-east-2`, and bucket/secret name below with
your real values.

---

## 1. S3 file storage

The backend already supports S3 (`artifact_storage.py`). It is activated purely
by environment variables — no code change needed:

| Variable | Example | Meaning |
|---|---|---|
| `S3_BUCKET_NAME` | `text2shape-cad-artifacts-2026` | Turns on S3 mode |
| `AWS_REGION` | `us-east-2` | Region of the bucket + SDK |

Behavior when enabled:

- Generated `.stl`/`.step` files and uploaded imports are written to the bucket
  under keys like `<artifact_id>/baseplate.stl` and `imports/<id>.stl`.
- Downloads are **streamed through the API** (`/artifacts/...`, `/imports/...`),
  so the bucket stays **private**. No public access, no bucket CORS needed.

### Create the bucket (private)

```sh
aws s3api create-bucket \
  --bucket text2shape-cad-artifacts-2026 \
  --region us-east-2 \
  --create-bucket-configuration LocationConstraint=us-east-2

aws s3api put-public-access-block \
  --bucket text2shape-cad-artifacts-2026 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### Give the task permission

Credentials come from the **task role** via the standard AWS credential chain —
never bake access keys into the image. Attach `task-role-policy.json` (in this
folder) to the ECS **task role**. It grants `s3:PutObject` / `s3:GetObject` on
just that bucket, plus reading the LLM secret (see below).

---

## 2. LLM API key as an AWS secret

### Create the secret

Store the hosted provider's key in Secrets Manager. A raw string is simplest:

```sh
aws secretsmanager create-secret \
  --name text2shape/llm-api-key \
  --secret-string "sk-your-real-provider-key" \
  --region us-east-2
```

(You can also store JSON like `{"LLM_API_KEY":"sk-..."}` — the backend reads
either form.)

### Two ways the key reaches the backend

The code supports both; pick one.

**Option A — ECS injects it as an env var (recommended).**
In the task definition, the `secrets` block maps the secret to the
`LLM_API_KEY` environment variable. ECS fetches it at task start using the
**execution role**. Attach `execution-role-policy.json` to the execution role.
The app just reads `LLM_API_KEY` from the environment — no boto3 call at
request time. See `ecs-task-definition.json`.

**Option B — the app fetches it at runtime.**
Set `LLM_API_KEY_SECRET_ARN` to the secret ARN instead of the `secrets` block.
The backend calls Secrets Manager itself (`_resolve_api_key()` in `ai_cad.py`)
using the **task role**, which needs `secretsmanager:GetSecretValue` (included
in `task-role-policy.json`). Useful if the key rotates and you don't want to
restart tasks on every change.

### Point the backend at the hosted model

Set these env vars (plain, non-secret) on the container:

```text
LLM_BASE_URL=https://api.together.xyz/v1
LLM_MODEL=meta-llama/Llama-3.1-8B-Instruct-Turbo
```

When `LLM_BASE_URL` is set, the backend uses the hosted endpoint and requires
the API key. When it is unset, it falls back to local Ollama. This is why
local development keeps working unchanged.

---

## 3. Build and push the image

```sh
aws ecr create-repository --repository-name text2shape-api --region us-east-2

aws ecr get-login-password --region us-east-2 \
  | docker login --username AWS --password-stdin 111122223333.dkr.ecr.us-east-2.amazonaws.com

docker build -t text2shape-api .
docker tag text2shape-api:latest 111122223333.dkr.ecr.us-east-2.amazonaws.com/text2shape-api:latest
docker push 111122223333.dkr.ecr.us-east-2.amazonaws.com/text2shape-api:latest
```

## 4. Register and run the task

```sh
aws ecs register-task-definition \
  --cli-input-json file://deploy/ecs-task-definition.json \
  --region us-east-2
```

Then create/update an ECS service (Fargate) that runs this task definition in a
subnet with outbound internet (NAT or public IP) so it can reach the LLM
provider and S3. Put it behind an Application Load Balancer for a stable HTTPS
endpoint, and set the frontend's `NEXT_PUBLIC_API_URL` to that endpoint.

## 5. Point the frontend at the deployed API

```powershell
$env:NEXT_PUBLIC_API_URL = "https://your-api.example.com"
npm run dev   # or build + deploy the frontend to your host of choice
```

Also set the backend's `CORS_ORIGINS` to the exact frontend origin
(e.g. `https://your-frontend.example.com`). Never use `*` in production.

---

## Quick local test of the hosted path (before deploying)

You can verify the hosted LLM path from your own machine without AWS:

```powershell
$env:LLM_BASE_URL = "https://api.together.xyz/v1"
$env:LLM_MODEL    = "meta-llama/Llama-3.1-8B-Instruct-Turbo"
$env:LLM_API_KEY  = "sk-your-real-provider-key"
$env:CORS_ORIGINS = "http://localhost:3000"
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8002
```

If `LLM_BASE_URL` is set, Ollama is bypassed entirely.
