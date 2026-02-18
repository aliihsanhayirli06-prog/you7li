# Canary + Blue/Green Playbook

## Hedef

- Zero-downtime release
- Kontrollu trafik artisi (`canaryPercent`)
- Hata durumunda hizli rollback

## Rollout Akisi

1. Green ortami ayaga kaldir:
   - `docker compose -f docker-compose.bluegreen.yml up -d api_green`
2. Health ve smoke kontrol:
   - `GET /health`
   - `GET /api/v1/ops/status`
3. Canary baslat:
   - `POST /api/v1/ops/deploy/canary {"percent": 5}`
   - `POST /api/v1/ops/deploy/canary {"percent": 25}`
   - `POST /api/v1/ops/deploy/canary {"percent": 50}`
4. SLO ve hata metrikleri stabilse promote et:
   - `POST /api/v1/ops/deploy/canary {"percent": 100}`
5. Trafigi green'e switch et:
   - `POST /api/v1/ops/deploy/switch {"targetColor":"green"}`

## Rollback

- Canary asamasinda sorun varsa:
  - `POST /api/v1/ops/deploy/canary {"percent": 0}`
- Promote sonrasi sorun varsa:
  - `POST /api/v1/ops/deploy/switch {"targetColor":"blue"}`

## Gozlemlenecek Sinyaller

- `GET /api/v1/ops/status`:
  - `status`
  - `errorRate`
  - `httpP95Ms`
  - `deployStrategy.activeColor`
  - `deployStrategy.canaryPercent`
