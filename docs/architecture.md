# Architecture Baseline

## Katmanlar

1. Orchestrator
2. Domain Agents (opportunity, revenue, format, script, compliance)
3. Execution Services (render, publish, analytics)
4. Optimization Loop

## Teknik Omurga (Hedef)

- Web: Next.js (app router)
- Data: Postgres
- Queue: Redis
- Worker: containerized background jobs
- Scheduler: cron tabanli tetikleme

## Ilk Teslimat Kapsami (MVP)

- Tek niche
- Tek format
- Otomatik publish
- Basit analytics ve yeniden deneme mekanizmasi
