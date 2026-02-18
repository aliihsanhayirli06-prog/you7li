# Roadmap

## F0 - Foundation

- [x] Repo standartlarini tamamla
- [x] CI iskeleti ekle
- [x] Lint + test + format pipeline'i kur

## F1 - MVP Flow

- [x] Opportunity -> Script -> Video -> Publish
- [x] Basit dashboard ve is gecmisi

## F2 - Compliance Hardening

- [x] Kural motoru
- [x] Risk raporu
- [x] Publish gate

## F3 - Growth Loop

- [x] CTR/retention izleme
- [x] Hook/title varyasyon denemeleri
- [x] Otomatik optimizasyon

## F4 - Production Readiness

- [x] Gercek YouTube publish + analytics entegrasyonu
- [x] Auth/RBAC (admin/editor roller ve endpoint yetkilendirme)
- [x] Observability (structured log, metrics, alerting, error tracking)
- [x] Retry/DLQ + idempotency ile worker guvenilirligi
- [x] Containerized deployment + staging/prod CI/CD release hatti

## F5 - Productization

- [x] OpenAPI contract ve versioned API dokumani
- [x] Secrets management / config validation hardening
- [x] Multi-channel support (birden fazla kanal yonetimi)
- [x] Billing/usage metering

## F6 - Commerce & Tenancy

- [x] Plan/abonelik modeli (free/pro/business)
- [x] Billing/usage metering ve faturalama entegrasyonu
- [x] Limit enforcement (quota, rate limit, overage)
- [x] Tenant-level ayarlar ve izolasyon

## F7 - Quality & Trust

- [x] Moderation ve policy classifier katmani
- [x] Human-in-the-loop review queue
- [x] Audit trail (regulatory grade event log)
- [x] Data retention/silme politikasi (GDPR/KVKK benzeri)

## F8 - Scale & Performance

- [x] Horizontal worker autoscaling
- [x] Caching strategy (hot paths + invalidation)
- [x] DB partition/index tuning ve query profilleme
- [x] SLO/SLA hedefleri ve kapasite planlama

## F9 - Ecosystem

- [x] Webhook/outbound integrations (Slack/Discord/CRM)
- [x] Plugin/extension API
- [x] Third-party analytics connectors
- [x] Public developer portal + API key lifecycle

## F10 - Enterprise Readiness

- [x] SSO (OIDC/SAML)
- [x] Advanced RBAC/ABAC
- [x] Disaster recovery drill ve backup restore testleri
- [x] Pen-test ve security hardening checklist

## 100% Calisir Sistem Fazlari ve Teslim Kriterleri

- [x] F0 Foundation: CI calisir, lint/test/format zorunlu, branch protection aktif.
- [x] F1 MVP Flow: fikirden publish'e tek endpoint zinciri calisir, dashboard ve history gorulur.
- [x] F2 Compliance: otomatik risk skoru, publish gate, detayli compliance raporu uretilir.
- [x] F3 Growth Loop: analytics ingest, optimize queue ve varyant uretimi otomatik calisir.
- [x] F4 Production Readiness: YouTube live mode, RBAC, metrics, retry/DLQ, container deploy hazir.
- [x] F5 Productization: OpenAPI, config validation, multi-channel ve usage metering tamam.
- [x] F6 Commerce & Tenancy: subscription plan, invoice ozeti, quota/rate enforcement, tenant izolasyonu aktif.
- [x] F7 Quality & Trust: moderation classifier, insan onay kuyrugu, regulatory audit trail, retention policy.
- [x] F8 Scale & Performance: autoscaling, cache invalidation stratejisi, DB tuning, kapasite/SLO yonetimi.
- [x] F9 Ecosystem: webhook/outbound entegrasyonlar, plugin API, connector seti, developer portal.
- [x] F10 Enterprise: SSO, ileri RBAC/ABAC, DR tatbikati, pen-test ve hardening checklist.

## F11 - UX/Product Maturity

- [x] Dashboard bilgi mimarisini role-based kisilestirme (admin/editor/operator gorunumleri)
- [x] In-app onboarding, empty-state ve guided setup akislari
- [x] Gercek zamanli job timeline (SSE/WebSocket) ve canli durum guncellemesi
- [x] Rapor/export merkezi (CSV/PDF + scheduled email)

## F12 - Media Pipeline v2

- [x] Template tabanli video render (intro/outro, lower-third, brand kit)
- [x] Asset library ve versiyonlama (gorsel/ses/sablon)
- [x] FFmpeg render preset yonetimi (kalite/hiz/maliyet profilleri)
- [x] Multi-format cikti (Shorts, Reels, TikTok oran/preset setleri)

## F13 - SRE & Reliability+

- [x] Canary + blue/green deployment stratejisi
- [x] Queue backpressure ve circuit-breaker politikasi
- [x] Multi-region backup/restore otomasyonu ve RPO/RTO olcumleme
- [x] Incident runbook + status page + postmortem workflow

## F14 - Data & Intelligence

- [x] Feature store benzeri analytics modeli (icerik, kanal, tenant segmentleri)
- [x] Tahminleyici performans modeli (publish oncesi beklenen CTR/retention)
- [x] Deney platformu (A/B test framework, guardrail metrikleri)
- [x] Cost-aware optimization (kalite-maliyet dengeli otomatik karar)

## F15 - Platform & Commercial Expansion

- [x] Self-serve tenant provisioning + trial/freemium activation
- [x] Marketplace (plugin/distributor) ve partner onboarding akisi
- [x] Kurumsal uyum paketleri (SOC2 hazirlik kontrolleri, audit export paketleri)
- [x] SLA tiering ve enterprise support operasyonu

## Onceliklendirilmis Backlog (P0/P1/P2)

- [x] `P0` Gercek zamanli job timeline (SSE/WebSocket) ve canli durum guncellemesi
- [x] `P0` Queue backpressure ve circuit-breaker politikasi
- [x] `P0` FFmpeg render preset yonetimi (kalite/hiz/maliyet profilleri)
- [x] `P0` Incident runbook + status page + postmortem workflow
- [x] `P1` Dashboard role-based bilgi mimarisi (admin/editor/operator)
- [x] `P1` Template tabanli video render + brand kit
- [x] `P1` Multi-format cikti (Shorts/Reels/TikTok)
- [x] `P1` Tahminleyici performans modeli (publish oncesi)
- [x] `P1` Self-serve tenant provisioning + trial/freemium
- [x] `P2` In-app onboarding + guided setup
- [x] `P2` Rapor/export merkezi (CSV/PDF + scheduled email)
- [x] `P2` Feature store benzeri analytics modeli
- [x] `P2` Deney platformu (A/B test + guardrail metrikleri)
- [x] `P2` Marketplace + partner onboarding
- [x] `P2` SOC2 hazirlik paketleri + SLA tiering

## Sprint Backlog (Oneri)

### Sprint 1 (P0 cekirdek)

- [x] SSE/WebSocket event stream endpoint ve dashboard aboneligi
- [x] Worker->event bus publish entegrasyonu (`render.started/completed`, `publish.started/completed`)
- [x] Queue backpressure kurallari (max queue lag, reject/defer stratejisi)
- [x] Circuit-breaker (YouTube/OpenAI/connector adapter seviyesinde)
- [x] Runbook v1 + incident severity matrisi

### Sprint 2 (P0 kapanis + P1 baslangic)

- [x] FFmpeg preset profilleri (`fast`, `balanced`, `quality`) + env/config mapping
- [x] Template render altyapisi (intro/outro/lower-third)
- [x] Dashboard role-based navigation/paneller
- [x] Status page MVP (health, queue, error-rate, deploy marker)
- [x] Postmortem template + otomatik incident timeline export

### Sprint 3 (P1 genisleme)

- [x] Multi-format render profilleri (9:16, 1:1, 16:9)
- [x] Publish-oncesi performans tahmin endpoint'i
- [x] Tenant self-serve onboarding (tenant create + initial channel wizard)
- [x] Billing trial/freemium activation akisi
- [x] E2E regresyon seti (dashboard + pipeline + review + render)
