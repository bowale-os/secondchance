FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# Run migrations, then serve. Railway sets PORT.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host :: --port ${PORT:-3000}"]
