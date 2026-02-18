# AGENTS.md

Bu dosya, you7li reposunda calisan insan ve AI ajanlari icin operasyon rehberidir.

## 1) Sistem Ozeti

- Urun: YouTube odakli icerik strateji ve otomasyon platformu
- Ana akis: `Opportunity -> Script -> Video(Render) -> Publish -> Analytics -> Optimize`
- Servisler:
  - `apps/api`: HTTP API ve orchestration katmani
  - `services/worker`: queue tabanli arka plan islemleri (render/publish/optimize)
  - `apps/web`: dashboard/status/developer portal
  - `db/migrations`: Postgres sema ve migrationlar
  - `tests/api`: node:test tabanli entegrasyon ve e2e testleri

## 2) Mimari Prensipler

- Compliance-first: publish oncesi policy/compliance gate zorunlu.
- Auditability: onemli aksiyonlar izlenebilir olmali (history/audit trail).
- Reliability: retry + DLQ + idempotency zorunlu.
- Graceful degradation: `auto` modunda Postgres/Redis yoksa file fallback calismali.
- Tenant awareness: istekler tenant baglaminda ele alinmali (`x-tenant-id`).

## 3) Gelistirme Komutlari

- Kurulum: `make setup`
- Migration: `make migrate`
- API: `npm run start`
- Worker: `npm run worker`
- Test: `make test`
- Lint: `make lint`
- Format: `make format`

## 4) Kritik Ortam Degiskenleri

- Uygulama/guvenlik: `AUTH_ENABLED`, `ADMIN_API_TOKEN`, `EDITOR_API_TOKEN`
- Veri: `DATABASE_URL`, `STORAGE_DRIVER`, `MIGRATIONS_DIR`
- Kuyruk: `REDIS_URL`, `QUEUE_DRIVER`, `JOB_MAX_ATTEMPTS`, `REDIS_DLQ_KEY`
- Dayaniklilik: `QUEUE_BACKPRESSURE_*`, `CIRCUIT_BREAKER_*`, `AUTOSCALE_*`
- YouTube/render: `YOUTUBE_*`, `VIDEO_RENDER_*`, `FFMPEG_BIN`

Not: `AUTH_ENABLED=true` ve `YOUTUBE_PUBLISH_MODE=live` senaryolarinda secret/config eksikligi fail-fast sebebidir.

## 5) Kodlama Kurallari

- Node `>=18`, ESM (`"type": "module"`) kullanilir.
- Yeni ozellikte servis katmanina odaklan; route dosyalari ince ve orchestration agirlikli kalmali.
- IO siniri:
  - API: validation + authorization + service cagrisi
  - Service: is kurali
  - Infra: db/redis/dis baglanti
- Buyuk degisikliklerde ilgili dokumanlari da guncelle:
  - `README.md`
  - `docs/architecture.md`
  - `docs/roadmap.md` (gerekiyorsa)

## 6) Test ve Kalite Kapisi

Her anlamli degisiklikte minimum:

1. `npm test`
2. `npm run lint`
3. `npm run format:check`

Degisiklik API davranisini etkiliyorsa test ekle/guncelle (`tests/api/*.test.js`).

## 7) Git ve PR Standarti

- Branch adlari: `feat/*`, `fix/*`, `chore/*`
- Commit: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`)
- PR aciklamasi zorunlu basliklar:
  - Problem tanimi
  - Cozum yaklasimi
  - Etkilenen moduller
  - Test kaniti

## 8) Ajan Calisma Kurallari

- Mevcut davranisi bozmadan ilerle; backward compatibility riskini acikca belirt.
- Network/dis servis hatalarinda retry/circuit-breaker ve timeout davranisini koru.
- Data kaybi yaratabilecek degisikliklerde migration ve rollback plani belirt.
- "Hizli cozum" yerine gozlemlenebilir ve test edilebilir cozum tercih et.

## 9) Referans Dokumanlar

- Urun ve hedef: `you7li-PROMPT.md`
- Teknik baseline: `docs/architecture.md`, `mimari.md`
- Katki sureci: `CONTRIBUTING.md`
- API kontrati: `docs/api/openapi.yaml`
