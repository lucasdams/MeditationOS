FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Runs migrations then starts uvicorn. Kept as CMD (not ENTRYPOINT) so one-off
# overrides like `docker compose run backend alembic ...` still work.
CMD ["sh", "entrypoint.sh"]
