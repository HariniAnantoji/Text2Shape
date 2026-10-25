FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ai_cad.py artifact_storage.py cad_export.py cad_generator.py cad_models.py cad_plan.py main.py prompt_parser.py ./

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/downloads /app/downloads/imports \
    && chown -R app:app /app/downloads

USER app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
