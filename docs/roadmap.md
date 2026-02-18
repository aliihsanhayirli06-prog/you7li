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
