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

## Canary + Blue/Green

Blue/green compose ornegi:

```bash
docker compose -f docker-compose.bluegreen.yml up -d --build
```

Deploy state endpointleri:

- `GET /api/v1/ops/deploy/strategy`
- `POST /api/v1/ops/deploy/canary` (`{ "percent": 0-100 }`)
- `POST /api/v1/ops/deploy/switch` (`{ "targetColor": "blue|green" }`)

Detayli operasyon adimlari: `docs/ops/canary-bluegreen-playbook.md`

Disaster recovery otomasyonu:

- `POST /api/v1/ops/dr/multi-region/run`
- `GET /api/v1/ops/dr/multi-region/status`

## Runtime Essentials

- `AUTH_ENABLED=true`
- `ADMIN_API_TOKEN`, `EDITOR_API_TOKEN`
- `DATABASE_URL`, `REDIS_URL`
- `REDIS_QUEUE_KEY`, `REDIS_DLQ_KEY`
- `JOB_MAX_ATTEMPTS`, `JOB_IDEMPOTENCY_TTL_HOURS`

## Ops Endpoints

- `GET /api/v1/ops/metrics` (admin)
- `GET /api/v1/ops/dlq` (admin)
- `GET /api/v1/ops/status` (admin, deployStrategy dahil)
