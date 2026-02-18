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
- `GET /api/v1/history/stream` SSE ile canli event akisina abone eder (opsiyonel `publishId` filtresi)

## Auth Context Endpoint

- `GET /api/v1/auth/me`: aktif rol/tenant context doner (`admin`/`editor`)

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
- `GET /api/v1/analytics/feature-store`: tenant bazli kanal/icerik segment feature snapshot'i
- `GET /api/v1/experiments`: A/B experiment listesi
- `POST /api/v1/experiments`: yeni A/B experiment olusturur
- `POST /api/v1/experiments/assign`: subject/publish icin deterministic variant atar
- `POST /api/v1/experiments/metrics`: guardrail metric eventi kaydeder
- `GET /api/v1/experiments/report?experimentId=...`: varyant bazli guardrail raporu
- `POST /api/v1/optimize/run`: manuel optimize job kuyruğa ekler
- `POST /api/v1/performance/predict`: publish oncesi tahmini CTR/retention/completion metriklerini doner
- `POST /api/v1/optimize/cost-aware`: maliyet-kalite dengeli render preset/format onerisi uretir

Optimizasyon davranisi:

- Dusuk metrikte otomatik `optimize.generate` job'u uretilir
- Worker hook/title/thumbnail varyasyonlari olusturur

## Ops Endpoints

- `GET /api/v1/ops/metrics`: HTTP/worker metrik snapshot'i (admin)
- `GET /api/v1/ops/status`: operational/degraded durumu + deploy marker (admin)
- `GET /api/v1/ops/dlq`: dead-letter queue kayitlari (admin)
- `GET /api/v1/ops/autoscale`: queue tabanli worker autoscale plani (admin)
- `GET /api/v1/ops/slo`: SLO/SLA durum ozeti (admin)
- `GET /api/v1/ops/eval/dataset`: offline kalite eval dataset listesi (admin)
- `POST /api/v1/ops/eval/regression/run`: otomatik kalite regression raporu uretir (admin)
- `POST /api/v1/ops/alerts/provider/check`: provider telemetry esiklerini kontrol eder, ihlalde incident acabilir (admin)
- `GET /api/v1/ops/capacity-plan`: kapasite ve autoscale birlikte (admin)
- `GET /api/v1/ops/db/profile`: query profile snapshot (admin)
- `GET /api/v1/ops/cache`: cache stats
- `POST /api/v1/ops/cache/invalidate`: cache prefix temizligi
- `GET /api/v1/ops/reliability/policy`: queue backpressure + circuit-breaker policy snapshot (admin)
- `GET /api/v1/ops/runbook`: incident runbook markdown (admin)
- `POST /api/v1/ops/postmortem/export`: postmortem markdown export (admin)
- `GET /api/v1/ops/deploy/strategy`: canary + blue/green rollout state (admin)
- `POST /api/v1/ops/deploy/canary`: canary yuzdesi gunceller (admin)
- `POST /api/v1/ops/deploy/switch`: aktif blue/green rengi degistirir (admin)
- `GET /api/v1/openapi`: API kontratini YAML olarak verir

## Audit Endpoints

- `GET /api/v1/audit/trail?limit=...&publishId=...`: tenant bazli audit event listesi (admin)
- `GET /api/v1/audit/verify`: hash-chain butunluk dogrulamasi (admin)

## Privacy / Data Governance

- `GET /api/v1/privacy/policy`: retention/silme politikasi
- `POST /api/v1/privacy/retention/apply`: retention policy uygular (admin)
- `POST /api/v1/privacy/erase-publish`: publish bagli verileri siler (admin)
- `POST /api/v1/ops/dr/drill`: backup/restore drill calistirir (admin)
- `GET /api/v1/ops/dr/multi-region/status`: multi-region DR automation status + son olcum (admin)
- `POST /api/v1/ops/dr/multi-region/run`: multi-region backup/restore drill + RPO/RTO olcumu (admin)

## Channel Endpoints

- `GET /api/v1/channels`: kanal listesini doner
- `POST /api/v1/channels`: yeni kanal ekler (admin)
- `POST /api/v1/publish/create` ve `POST /api/v1/pipeline/run` isteklerinde `channelId` desteklenir

## Billing Endpoint

- `GET /api/v1/billing/usage`: usage eventleri ve aggregate billing ozeti
- `GET /api/v1/billing/invoice`: aylik fatura ozeti ve line item dagilimi
- `POST /api/v1/billing/activation`: tenant icin `trial` veya `freemium` aktivasyonu (admin)

## Tenancy Endpoints

- `GET /api/v1/tenants`: tenant listesi (admin)
- `POST /api/v1/tenants`: yeni tenant olusturma (admin)
- `GET /api/v1/tenants/me`: aktif tenant context bilgisi
- `PATCH /api/v1/tenants/me/settings`: plan/ayar guncelleme (admin)
- `POST /api/v1/onboarding/self-serve`: self-serve onboarding ile tenant + ilk kanal olusturur
- `GET /api/v1/onboarding/status`: in-app guided setup + empty-state ilerleme durumu
- `x-tenant-id` header'i ile tenant context secilebilir (varsayilan `t_default`)

Plan ve limit davranisi:

- Plan kodlari: `free`, `pro`, `business`
- Limit enforcement: rate limit + aylik kota
- `free` planda kota asiminda `402 quota exceeded`
- `pro/business` planda overage metadata ile metering devam eder
- Provider cost guardrail aktifse tenant bazli provider butce asiminda `402 provider cost limit exceeded`

## Reporting Endpoints

- `GET /api/v1/reports/export?dataset=history|publish|usage|audit&format=json|csv|pdf`: rapor export
- `GET /api/v1/reports/schedules`: tenant rapor schedule listesi
- `POST /api/v1/reports/schedules`: scheduled report delivery (simulated email)

## Ecosystem Endpoints

- `GET/POST/DELETE /api/v1/integrations/webhooks`: outbound webhook lifecycle
- `POST /api/v1/integrations/webhooks/test`: webhook test dispatch
- `GET/POST /api/v1/integrations/connectors`: connector lifecycle
- `POST /api/v1/integrations/connectors/sync`: publish analytics connector sync
- `GET /api/v1/plugins`: plugin listesi
- `POST /api/v1/plugins/register`: plugin kaydi
- `POST /api/v1/plugins/execute`: hook tetikleme
- `GET /api/v1/assets/library`: asset library listesi (type/assetKey filtreli)
- `POST /api/v1/assets/library`: asset versiyonu ekler (`version` otomatik artar)
- `GET /api/v1/marketplace/plugins`: marketplace katalogu
- `POST /api/v1/marketplace/partners/apply`: partner onboarding basvurusu
- `GET /api/v1/marketplace/partners/applications`: tenant partner basvurulari

## Developer Portal & API Keys

- `GET /developer/portal`: public developer portal sayfasi
- `GET /api/v1/developer/keys`: API key listesi
- `POST /api/v1/developer/keys`: API key olusturma
- `POST /api/v1/developer/keys/revoke`: API key iptal

## Enterprise Endpoints

- `POST /api/v1/auth/sso/login`: OIDC/SAML test-token login
- `GET /api/v1/security/checklist`: security hardening checklist (admin)
- `GET /api/v1/enterprise/compliance-pack`: SOC2 readiness kontrol/kanit paketi (admin)
- `GET /api/v1/enterprise/sla-tiers`: SLA tier tanimlari
- `POST /api/v1/enterprise/support/incidents`: enterprise support incident acma
- `GET /api/v1/enterprise/support/incidents`: tenant support incident listesi

## YouTube Endpoint

- `GET /api/v1/youtube/stats?videoId=...`: canli YouTube video istatistikleri
- `POST /api/v1/youtube/analytics/sync`: YouTube istatistiklerinden analytics metriklerini senkronlar
- `YOUTUBE_ACCESS_TOKEN` yoksa endpoint `400` doner

YouTube publish:

- Publish worker asamasinda `publishVideoToYouTube` adapter'i cagrilir
- `YOUTUBE_PUBLISH_MODE=mock` (default) veya `YOUTUBE_PUBLISH_MODE=live`
- Render worker `VIDEO_RENDER_MODE` ile calisir: `mock` (placeholder asset), `ffmpeg` (gercek mp4), `auto` (ffmpeg->mock fallback)
- FFmpeg binary/sure ayari: `FFMPEG_BIN`, `VIDEO_RENDER_DURATION_SEC`
- Render preset profilleri: `VIDEO_RENDER_PRESET=fast|balanced|quality` (hiz-kalite-maliyet dengesi)
- Template katmani: `VIDEO_RENDER_TEMPLATE=basic|minimal` + intro/outro/lower-third text env'leri
- Multi-format cikti: `VIDEO_RENDER_FORMAT=shorts|reels|tiktok|youtube` (portrait/landscape profil secimi)

## Auth / RBAC

- `AUTH_ENABLED=false` iken endpointler aciktir (lokal gelistirme modu)
- `AUTH_ENABLED=true` iken Bearer token zorunludur
- Roller:
  - `admin`: tum endpointler
  - `editor`: optimize run disindaki operasyon endpointleri

## Dashboard

`GET /app/dashboard` uzerinden basit web paneli acilir.
`GET /status` uzerinden ops status page acilir.

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
- API version/deprecation migration playbook: `docs/api/migration-playbook.md`

## Reliability

- Worker job'larinda retry mekanizmasi vardir (`JOB_MAX_ATTEMPTS`)
- Max deneme asilirsa job DLQ'ya tasinir
- Idempotency store, ayni `jobId`'nin tekrar islenmesini engeller
- Queue backpressure: `QUEUE_BACKPRESSURE_SOFT_LIMIT` ustunde enqueue defer, `QUEUE_BACKPRESSURE_HARD_LIMIT` ustunde yeni job kabul edilmez (`503`)
- Circuit-breaker: YouTube/connector adapterlari tekrarli hata aldiginda gecici olarak acilir ve `503 upstream temporarily unavailable` doner

## Not

Dis servis bilgileri tanimli degilse veya baglanti hatasi olursa fallback ile calisir; pipeline akisi durmaz.

## Config Hardening

- `validateConfig` API ve worker acilisinda calisir
- Hatali config durumunda servis startup'ta durdurulur (`CONFIG_VALIDATION_FAILED`)
