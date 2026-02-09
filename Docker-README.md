# Docker Guide

This project includes Dockerfiles and a `docker-compose.yml` for API, worker, and MongoDB services.

## Services in `docker-compose.yml`

- `api`: FastAPI server on `http://localhost:8000`
- `worker`: background task processor (`python workers.py`)
- `mongodb`: MongoDB 8 on `localhost:27017`
- optional commented `llamacpp` service

## Start

From `/app`:

```bash
docker compose up --build
```

Run in background:

```bash
docker compose up -d --build
```

## Stop

```bash
docker compose down
```

## Scale Workers

```bash
docker compose up --scale worker=3
```

## Environment

`docker-compose.yml` loads `.env` and sets:

- `MONGODB_URL=mongodb://mongodb:27017/`
- `LLAMACPP_URL=${LLAMACPP_URL:-http://llamacpp:8080}`
- `TOKEN=${TOKEN:-}`

If you use an external LLamaCPP server, set `LLAMACPP_URL` in `.env`.

## Useful URLs

- API docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Frontend pages are served by the API at `/page/*`

## Rebuild After Changes

When backend/frontend code changes:

```bash
docker compose up --build
```

When only restarting services is needed:

```bash
docker compose restart
```

## Frontend Tests in Docker

Use the dedicated frontend test image:

```bash
docker build -f frontend/Dockerfile.test -t frontend-tests .
docker run --rm -v "$(pwd)/frontend:/app/frontend" frontend-tests
```
