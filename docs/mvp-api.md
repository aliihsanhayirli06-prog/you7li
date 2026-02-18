# MVP API Flow

Bu API tek bir akisi dogrulamak icin vardir:

1. Opportunity scoring
2. Script generation
3. Video render
4. Draft publish creation

## Pipeline Endpoint

`POST /api/v1/pipeline/run`

Request:

```json
{
  "topic": "YouTube shorts otomasyon stratejisi"
}
```

Response fields:

- `opportunity`: konu skoru ve notlar
- `script`: 30-45 sn hedefli metin ve metadata
- `publish`: zamanlanmis yayin kaydi

## Health Endpoint

`GET /health` yanitinda aktif storage/queue driver, `queueSize` ve `dlqSize` bilgisi doner.

## History Endpoint

`GET /api/v1/history` endpoint'i publish/render event gecmisini doner.
Query params:

- `limit`
- `publishId`

## Compliance Endpoints

- `POST /api/v1/compliance/check`: topic+script icin kural tabanli risk analizi
- `GET /api/v1/compliance/report?publishId=...`: publish kaydinin compliance raporu
- Compliance sonucu policy moderation classifier bulgularini da icerir

Compliance status:

- `pass`: publish gate acik
- `review`: manual review gerekli, gate kapali
- `blocked`: yuksek risk, gate kapali

## Review Endpoints

- `GET /api/v1/review/queue?status=pending&limit=100`: insan onay kuyrugu
- `POST /api/v1/review/decision`: review karar endpoint'i (`approve`/`reject`, admin)

## Growth Endpoints

- `POST /api/v1/analytics/ingest`: CTR/retention/watch/completion metriklerini kaydeder
- `GET /api/v1/analytics/report?publishId=...`: performans ve optimizasyon raporunu doner
- `POST /api/v1/optimize/run`: manuel optimize job kuyruğa ekler

Optimizasyon davranisi:

- Dusuk metrikte otomatik `optimize.generate` job'u uretilir
- Worker hook/title/thumbnail varyasyonlari olusturur

## Ops Endpoints

- `GET /api/v1/ops/metrics`: HTTP/worker metrik snapshot'i (admin)
- `GET /api/v1/ops/dlq`: dead-letter queue kayitlari (admin)
- `GET /api/v1/ops/autoscale`: queue tabanli worker autoscale plani (admin)
- `GET /api/v1/ops/slo`: SLO/SLA durum ozeti (admin)
- `GET /api/v1/ops/capacity-plan`: kapasite ve autoscale birlikte (admin)
- `GET /api/v1/ops/db/profile`: query profile snapshot (admin)
- `GET /api/v1/ops/cache`: cache stats
- `POST /api/v1/ops/cache/invalidate`: cache prefix temizligi
- `GET /api/v1/openapi`: API kontratini YAML olarak verir

## Audit Endpoints

- `GET /api/v1/audit/trail?limit=...&publishId=...`: tenant bazli audit event listesi (admin)
- `GET /api/v1/audit/verify`: hash-chain butunluk dogrulamasi (admin)

## Privacy / Data Governance

- `GET /api/v1/privacy/policy`: retention/silme politikasi
- `POST /api/v1/privacy/retention/apply`: retention policy uygular (admin)
- `POST /api/v1/privacy/erase-publish`: publish bagli verileri siler (admin)
- `POST /api/v1/ops/dr/drill`: backup/restore drill calistirir (admin)

## Channel Endpoints

- `GET /api/v1/channels`: kanal listesini doner
- `POST /api/v1/channels`: yeni kanal ekler (admin)
- `POST /api/v1/publish/create` ve `POST /api/v1/pipeline/run` isteklerinde `channelId` desteklenir

## Billing Endpoint

- `GET /api/v1/billing/usage`: usage eventleri ve aggregate billing ozeti
- `GET /api/v1/billing/invoice`: aylik fatura ozeti ve line item dagilimi

## Tenancy Endpoints

- `GET /api/v1/tenants`: tenant listesi (admin)
- `POST /api/v1/tenants`: yeni tenant olusturma (admin)
- `GET /api/v1/tenants/me`: aktif tenant context bilgisi
- `PATCH /api/v1/tenants/me/settings`: plan/ayar guncelleme (admin)
- `x-tenant-id` header'i ile tenant context secilebilir (varsayilan `t_default`)

Plan ve limit davranisi:

- Plan kodlari: `free`, `pro`, `business`
- Limit enforcement: rate limit + aylik kota
- `free` planda kota asiminda `402 quota exceeded`
- `pro/business` planda overage metadata ile metering devam eder

## Ecosystem Endpoints

- `GET/POST/DELETE /api/v1/integrations/webhooks`: outbound webhook lifecycle
- `POST /api/v1/integrations/webhooks/test`: webhook test dispatch
- `GET/POST /api/v1/integrations/connectors`: connector lifecycle
- `POST /api/v1/integrations/connectors/sync`: publish analytics connector sync
- `GET /api/v1/plugins`: plugin listesi
- `POST /api/v1/plugins/register`: plugin kaydi
- `POST /api/v1/plugins/execute`: hook tetikleme

## Developer Portal & API Keys

- `GET /developer/portal`: public developer portal sayfasi
- `GET /api/v1/developer/keys`: API key listesi
- `POST /api/v1/developer/keys`: API key olusturma
- `POST /api/v1/developer/keys/revoke`: API key iptal

## Enterprise Endpoints

- `POST /api/v1/auth/sso/login`: OIDC/SAML test-token login
- `GET /api/v1/security/checklist`: security hardening checklist (admin)

## YouTube Endpoint

- `GET /api/v1/youtube/stats?videoId=...`: canli YouTube video istatistikleri
- `POST /api/v1/youtube/analytics/sync`: YouTube istatistiklerinden analytics metriklerini senkronlar
- `YOUTUBE_ACCESS_TOKEN` yoksa endpoint `400` doner

YouTube publish:

- Publish worker asamasinda `publishVideoToYouTube` adapter'i cagrilir
- `YOUTUBE_PUBLISH_MODE=mock` (default) veya `YOUTUBE_PUBLISH_MODE=live`

## Auth / RBAC

- `AUTH_ENABLED=false` iken endpointler aciktir (lokal gelistirme modu)
- `AUTH_ENABLED=true` iken Bearer token zorunludur
- Roller:
  - `admin`: tum endpointler
  - `editor`: optimize run disindaki operasyon endpointleri

## Dashboard

`GET /app/dashboard` uzerinden basit web paneli acilir.

## Adapterlar

- YouTube signal: `YOUTUBE_API_KEY` varsa YouTube Data API'den canli sinyal ceker
- Publish repository: `STORAGE_DRIVER=postgres` ise Postgres, degilse file repository
- Queue: `QUEUE_DRIVER=redis` ise Redis listesi, degilse file queue
- Worker: `services/worker/src/worker.js` queue'dan job tuketir ve su sirayi uygular:
  - `render.generate`
  - `publish.execute`
  - `optimize.generate`

## Migration

- SQL migration dosyalari: `db/migrations`
- Calistirma komutu: `npm run migrate`

## Reliability

- Worker job'larinda retry mekanizmasi vardir (`JOB_MAX_ATTEMPTS`)
- Max deneme asilirsa job DLQ'ya tasinir
- Idempotency store, ayni `jobId`'nin tekrar islenmesini engeller

## Not

Dis servis bilgileri tanimli degilse veya baglanti hatasi olursa fallback ile calisir; pipeline akisi durmaz.

## Config Hardening

- `validateConfig` API ve worker acilisinda calisir
- Hatali config durumunda servis startup'ta durdurulur (`CONFIG_VALIDATION_FAILED`)
