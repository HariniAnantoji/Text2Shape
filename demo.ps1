# Text2Shape demo launcher.
# Starts the backend (local Ollama + local file storage, no cloud) and the
# frontend in two windows, then opens the app. Run from the project root:
#     .\demo.ps1
#
# Prerequisite: Ollama must be running with the demo model pulled:
#     ollama run qwen3.5:4b

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting Text2Shape (local, standalone - no S3, no API key)..." -ForegroundColor Cyan

# --- Backend: local Ollama, local downloads/ storage, CORS for the frontend ---
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root';" +
    "`$env:OLLAMA_MODEL='qwen3.5:4b';" +
    "`$env:CORS_ORIGINS='http://localhost:3000';" +
    "Write-Host 'BACKEND -> http://localhost:8002' -ForegroundColor Green;" +
    ".\.venv\Scripts\python.exe -m uvicorn main:app --port 8002"
)

# --- Frontend: points at the local backend ---
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\frontend';" +
    "`$env:NEXT_PUBLIC_API_URL='http://localhost:8002';" +
    "Write-Host 'FRONTEND -> http://localhost:3000' -ForegroundColor Green;" +
    "npm run dev"
)

Write-Host "Waiting for servers to come up..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "Backend:  http://localhost:8002  (health: /)" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "TIP: send one throwaway prompt to warm up Ollama before recording." -ForegroundColor Yellow
