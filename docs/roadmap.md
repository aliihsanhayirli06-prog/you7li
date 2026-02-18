# Roadmap

## Guncel Durum (2026-02-18)

### Bu tur yapilanlar

- [x] Dashboard'a `Videolar` ve `Kanallar` bolumleri eklendi
- [x] SEO varyantlari icin secim/ranking motoru (`rankSeoVariantsForSelection`) eklendi
- [x] Optimization ciktilarina `seoSelection.ranking` ve `scoringWeights` metadata'si eklendi
- [x] Growth test setine SEO ranking ve selection metadata testleri eklendi
- [x] Secilen SEO varyanti optimize asamasinda publish `title/description` alanlarina otomatik uygulanir hale getirildi
- [x] Dashboard publish tablosuna secilen SEO varyanti (`variantId + score`) eklendi
- [x] Prompt compliance tabanli release gate aktif edildi (`/ops/deploy/canary` %100 icin zorunlu)
- [x] API version/deprecation policy ve migration playbook dokumantasyonu eklendi
- [x] Offline eval dataset + otomatik kalite regression raporu endpoint/script/test seti eklendi
- [x] Provider telemetry esik alarmi + otomatik incident tetikleme endpoint/script/test eklendi

### Siradaki isler

- [ ] Tenant bazli provider cost guardrail ve butce limiti (F18)

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

## F16 - Prompt Alignment v2 (Aktif)

### Yapilanlar

- [x] Strategy Fusion Engine (7 skor + agirlikli final score) eklendi
- [x] `POST /api/v1/strategy/score` endpoint'i eklendi
- [x] `POST /api/v1/fusion/select-topic` endpoint'i eklendi
- [x] Pipeline `topics[]` ile en iyi konuyu secme destegi kazandi
- [x] AI Voice adapter katmani eklendi (`mock|live`)
- [x] AI Visual adapter katmani eklendi (`mock|live`)
- [x] `POST /api/v1/voice/generate` endpoint'i eklendi
- [x] `POST /api/v1/video/generate` endpoint'i eklendi
- [x] Pipeline icinde otomatik media generation (voice+visual) aktif edildi
- [x] `generateMedia=false` ile pipeline'da media adimi kapatma secenegi eklendi
- [x] SEO Engine eklendi (title/description/keywords/hashtags)
- [x] `POST /api/v1/seo/generate` endpoint'i eklendi
- [x] Pipeline publish title/description alanlari SEO engine ciktilariyla beslenmeye basladi
- [x] SEO varyant secimi icin skorlamali ranking motoru optimize loop'a eklendi

### Yapilacaklar

- [x] Render worker'da voice/visual assetlerini final video kompozisyonuna gercekten bagla
- [x] SEO A/B varyantlarini optimization loop'a entegre et
- [x] Search intent / pillar / viral / revenue / problem engine'lerini dis sinyal kaynaklariyla guclendir
- [x] Provider `live` modlari icin retry + timeout + circuit-breaker + telemetry hardening
- [x] Promptta gecen strategy fusion metriklerini dashboard'da gorsellestir

## F17 - Prompt Alignment v3 (Sonraki Faz)

### Hedef

- Promptta tanimlanan uretim kalitesini "tam otomasyon + olculebilir kalite kapilari" ile operasyonel seviyeye tasimak.

### Oncelikli Backlog

- [x] SEO varyantlarini publish-oncesi otomatik secim motoruna bagla (en iyi title/description secimi)
- [x] Media quality gate ekle (ses seviyesi, sure, resolution, codec, dosya boyutu)
- [x] Provider telemetry dashboard'u ekle (timeout/error-rate/retry oranlari)
- [x] Pipeline response contract v3 dokumani ve geriye donuk uyumluluk testi
- [x] Prompt compliance skoru ekle (pipeline sonucu prompt kapsam yuzdesi)

### Teknik Kirilim

- [x] `apps/api/src/services/optimizationService.js` icinde SEO variant ranking fonksiyonu
- [x] `services/worker/src/renderProcessor.js` icinde media quality validator
- [x] `apps/api/src/infra/metricsStore.js` provider-metrik sayaçları ve snapshot genisletmesi
- [x] `docs/api/openapi.yaml` v3 response schema guncellemesi
- [x] `tests/api/*` altinda quality-gate ve contract regression testleri

### Teslim Kriterleri

- [ ] Quality gate fail eden medya publish'e gitmez, review queue'ya duser
- [ ] Provider hatalari dashboard'da endpoint bazli gorunur
- [ ] Pipeline v3 response'u OpenAPI ile birebir uyumlu olur
- [ ] En az 1 e2e test prompt alignment skorunu dogrular

### Sprint Onerisi

- [ ] Sprint 1: SEO ranking + quality gate v1
- [ ] Sprint 2: provider telemetry + dashboard paneli
- [ ] Sprint 3: contract v3 + e2e/regresyon kapanisi

## F18 - Governance, Eval & Release Gates (Sonraki Faz)

### Hedef

- Uretim kalitesini surdurulebilir hale getiren release gate, kalite olcumu ve operasyonel guvenlik katmanlarini tamamlamak.

### Oncelikli Backlog

- [x] Prompt compliance tabanli release gate (canary->full rollout kosulu)
- [x] API version/deprecation policy dokumani ve migration playbook
- [x] Offline eval dataset + otomatik kalite regression raporu
- [x] Provider telemetry alarm/esik yonetimi + otomatik incident tetikleme
- [ ] Tenant bazli provider cost guardrail ve butce limiti

### Teknik Kirilim

- [x] `apps/api/src/services/deployStrategyService.js` icine compliance gate kurali
- [x] `docs/api/openapi.yaml` icinde versioning/deprecation notlari
- [x] `tests/api/*` altina kalite regression fixture ve score-comparison testleri
- [x] `apps/api/src/services/alertingService.js` icine provider esik alarmlari
- [ ] `apps/api/src/services/billingService.js` ve `limitService.js` icine provider-cost quota

### Teslim Kriterleri

- [x] Prompt compliance skoru esik altindaysa full rollout engellenir
- [ ] Her release'te otomatik kalite regression raporu uretilir
- [x] Provider timeout/error-rate esikleri alarm ureterek runbook akisini tetikler
- [ ] Tenant bazli cost limiti asilinca yeni provider cagrilari kontrollu reddedilir

### Sprint Onerisi

- [ ] Sprint 1: release gate + deprecation policy
- [ ] Sprint 2: offline eval + regression automation
- [ ] Sprint 3: alerting hardening + provider cost guardrail
