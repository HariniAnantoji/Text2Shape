# Text2Shape
Ai integrated CAD applications you can chat to design.

## Python setup

Activate the virtual environment and install project dependencies:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Add Python packages to `requirements.txt` as the project needs them.

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
