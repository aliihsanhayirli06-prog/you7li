# you7li

YouTube odakli icerik strateji ve otomasyon platformu icin proje iskeleti.

## Hedef

Bu repo, su hedefe hizmet eder:

- telif ve platform kurallarina uyumlu icerik pipeline
- moduler agent mimarisi
- olculebilir performans optimizasyon dongusu

Detayli urun notlari:

- `you7li-PROMPT.md`
- `mimari.md`

## Klasor Yapisi

- `apps/api`: MVP backend (`Opportunity -> Script -> Video -> Publish`)
- `apps/web`: Basit dashboard (`/app/dashboard`)
- `packages/core`: Ortak is mantigi, skor ve compliance modulleri
- `services/worker`: Render, queue, cron gibi arka plan isleri
- `tests`: Entegrasyon ve e2e testleri
- `docs`: Teknik kararlar ve yol haritasi

## Hızlı Baslangic

1. Repoyu klonla.
2. Ortam degiskenlerini `.env.example` uzerinden tanimla.
3. Altyapiyi kaldir: `docker compose up -d`
4. Migrationlari uygula: `npm run migrate`
5. API'yi calistir: `npm run start`
6. Worker'i calistir: `npm run worker`
7. Testleri calistir: `npm test`

## Standart Komutlar

- `make setup` : gelistirme ortamini hazirlar
- `make migrate`: postgres migrationlarini uygular
- `make worker` : queue worker surecini baslatir
- `make test` : tum testleri kosar
- `make lint` : kod standartlarini denetler
- `make format` : formatlama uygular (Prettier)

## MVP API Endpoints

- `GET /health`
- `GET /api/v1/history`
- `GET /api/v1/compliance/report`
- `GET /api/v1/analytics/report`
- `GET /api/v1/ops/metrics`
- `GET /api/v1/ops/dlq`
- `GET /api/v1/ops/autoscale`
- `GET /api/v1/ops/slo`
- `GET /api/v1/ops/capacity-plan`
- `GET /api/v1/ops/db/profile`
- `GET /api/v1/ops/cache`
- `GET /api/v1/review/queue`
- `GET /api/v1/audit/trail`
- `GET /api/v1/audit/verify`
- `GET /api/v1/privacy/policy`
- `GET /api/v1/integrations/webhooks`
- `GET /api/v1/integrations/connectors`
- `GET /api/v1/plugins`
- `GET /api/v1/developer/keys`
- `GET /api/v1/security/checklist`
- `GET /api/v1/youtube/stats`
- `GET /api/v1/openapi`
- `GET /api/v1/channels`
- `GET /api/v1/billing/usage`
- `GET /api/v1/billing/invoice`
- `GET /api/v1/tenants`
- `GET /api/v1/tenants/me`
- `POST /api/v1/opportunity/score`
- `POST /api/v1/compliance/check`
- `POST /api/v1/review/decision`
- `POST /api/v1/auth/sso/login`
- `POST /api/v1/analytics/ingest`
- `POST /api/v1/optimize/run`
- `POST /api/v1/youtube/analytics/sync`
- `POST /api/v1/channels`
- `POST /api/v1/tenants`
- `POST /api/v1/privacy/retention/apply`
- `POST /api/v1/privacy/erase-publish`
- `POST /api/v1/ops/dr/drill`
- `POST /api/v1/integrations/webhooks`
- `POST /api/v1/integrations/webhooks/test`
- `POST /api/v1/integrations/connectors`
- `POST /api/v1/integrations/connectors/sync`
- `POST /api/v1/plugins/register`
- `POST /api/v1/plugins/execute`
- `POST /api/v1/developer/keys`
- `POST /api/v1/developer/keys/revoke`
- `POST /api/v1/script/generate`
- `POST /api/v1/publish/create`
- `GET /api/v1/publish`
- `POST /api/v1/pipeline/run`
- `DELETE /api/v1/integrations/webhooks?webhookId=...`
- `PATCH /api/v1/tenants/me/settings`
- `GET /app/dashboard`
- `GET /developer/portal`

## Veri Kaynaklari

- `YOUTUBE_API_KEY` varsa opportunity scoring canli YouTube sinyaliyla desteklenir.
- `STORAGE_DRIVER=postgres` ile publish kayitlari Postgres'e yazilir.
- `QUEUE_DRIVER=redis` ile job kayitlari Redis listesine yazilir.
- `auto` modunda baglanti varsa Postgres/Redis kullanilir, hata olursa `DATA_DIR` altindaki file fallback devreye girer.
- Worker, `render.generate -> publish.execute` zinciri ile video olusturup yayinlar.
- `GET /health` yanitinda `queueSize` ile mevcut kuyruk uzunlugu gorulebilir.
- `GET /health` yanitinda `dlqSize` ile dead-letter queue uzunlugu gorulebilir.
- `GET /api/v1/history` ile is gecmisi event loglari listelenir.
- Publish olusturma adiminda compliance gate calisir; riskli icerik `blocked` statuse cekilir.
- Analytics ingest ile CTR/retention metrikleri kaydedilir.
- Dusuk performans metriklerinde sistem `optimize.generate` job'u uretir.
- Optimize worker hook/title/thumbnail varyasyonlari olusturur ve publish kaydina yazar.
- Worker hata alan job'lari tekrar dener, max denemede DLQ'ya tasir.
- Job idempotency store ayni job'un tekrar islenmesini engeller.
- `GET /api/v1/ops/metrics` endpoint'i worker/http metrik snapshot'i verir (admin).
- DLQ kayitlari `GET /api/v1/ops/dlq` ile izlenebilir (admin).
- `GET /api/v1/youtube/stats?videoId=...` YouTube video istatistiklerini canli ceker.
- `GET /api/v1/openapi` endpoint'i API kontratini YAML formatinda sunar.
- Publish asamasinda YouTube publish adapter'i calisir (`YOUTUBE_PUBLISH_MODE=mock|live`).
- `POST /api/v1/youtube/analytics/sync` endpoint'i YouTube stats'tan metrik turetip analytics'e yazar.
- Multi-channel destegi ile publish/pipeline request'lerinde `channelId` secilebilir.
- Billing/usage metering ile API aksiyonlari unit ve USD bazinda izlenir.
- Aylik fatura ozetleri `GET /api/v1/billing/invoice` ile tenant bazinda alinabilir.
- Tenancy icin request bazinda `x-tenant-id` header'i desteklenir (varsayilan: `t_default`).
- Plan bazli kota/rate limit enforcement aktif: free/pro/business.
- Moderation policy classifier compliance sonuclarina dahil edilir.
- Human-in-the-loop review queue ile `review` statulu publish kayitlari onay/red surecine girer.
- Audit trail zincir-hash modeliyle tutulur; `GET /api/v1/audit/verify` ile butunluk kontrolu yapilir.
- Data governance: retention policy uygulama ve publish-level silme endpointleri vardir.
- Ops katmani autoscale tavsiyesi, SLO raporu, cache ve DB profile snapshot sunar.
- Ecosystem katmani webhook, plugin ve analytics connector entegrasyonlariyla genisletilmistir.
- Developer portal ve API key lifecycle (create/list/revoke) endpointleri eklidir.
- Enterprise readiness: test-token tabanli OIDC/SAML SSO login, ABAC policy, DR drill endpoint ve security checklist mevcuttur.

## Security

- `AUTH_ENABLED=true` ile API token tabanli kimlik dogrulama aktif olur.
- `ADMIN_API_TOKEN` ve `EDITOR_API_TOKEN` ile rol bazli yetkilendirme yapilir.
- `POST /api/v1/optimize/run` sadece `admin` rolune aciktir.

## Config Validation

- API ve worker startup asamasinda config dogrulamasi calisir (`validateConfig`).
- Kritik env eksikse servis fail-fast ile acilmaz.
- Ozellikle `AUTH_ENABLED=true` ve `YOUTUBE_PUBLISH_MODE=live` senaryolarinda zorunlu secret kontrolu vardir.

Ornek istek:

```bash
curl -X POST http://localhost:8787/api/v1/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{"topic":"YouTube shorts otomasyon stratejisi"}'
```

## Gelistirme Prensipleri

- Kural 1: Re-upload veya telif ihlali riski olan icerik yok.
- Kural 2: Compliance kontrolu publish oncesi zorunlu.
- Kural 3: Tum agent ciktilari izlenebilir ve loglanabilir olmali.

## Katki

Katki sureci icin `CONTRIBUTING.md` dosyasina bak.
