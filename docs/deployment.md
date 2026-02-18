# Deployment Guide

## Images

Release workflow asagidaki image'lari GHCR'a push eder:

- `ghcr.io/<org>/<repo>/api:<sha>`
- `ghcr.io/<org>/<repo>/worker:<sha>`

## Staging

Staging icin:

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

## Runtime Essentials

- `AUTH_ENABLED=true`
- `ADMIN_API_TOKEN`, `EDITOR_API_TOKEN`
- `DATABASE_URL`, `REDIS_URL`
- `REDIS_QUEUE_KEY`, `REDIS_DLQ_KEY`
- `JOB_MAX_ATTEMPTS`, `JOB_IDEMPOTENCY_TTL_HOURS`

## Ops Endpoints

- `GET /api/v1/ops/metrics` (admin)
- `GET /api/v1/ops/dlq` (admin)
