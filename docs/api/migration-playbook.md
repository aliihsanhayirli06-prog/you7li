# API Migration Playbook

Bu dokuman `you7li API` icin versioning ve deprecation gecis adimlarini tanimlar.

## Versioning Policy

- Major path bazli versiyonlama kullanilir: `v1`, `v2`, ...
- `v1` icinde backward-compatible eklemeler serbesttir.
- Breaking degisiklik yalnizca yeni major path ile yayinlanir.

## Deprecation Policy

- Deprecated endpoint en az `90 gun` boyunca calismaya devam eder.
- Duyuru kanallari:
  - release notes
  - `docs/roadmap.md`
  - bu migration playbook
- Deprecated endpoint tamamen kapanmadan once replacement endpoint net sekilde belirtilir.

## Standard Timeline

1. `T0` duyuru: endpoint `deprecated` olarak isaretlenir.
2. `T0 + 30 gun`: client migration durumu takip edilir.
3. `T0 + 60 gun`: kalan clientlar icin son cagri.
4. `T0 + 90 gun`: endpoint kaldirilir veya read-only fallback'e cekilir.

## Client Migration Checklist

1. Kullanilan endpointleri envanterle (`/api/v1/*` kullanim listesi).
2. Replacement endpoint mapping cikar.
3. Request/response contract farklarini test fixture'lariyla dogrula.
4. Gecis suresinde dual-run yap (eski + yeni endpoint sonucu karsilastir).
5. Canary tenantlarda aktif et, metrikleri izle.
6. Tum tenantlar icin rollout yap.
7. Eski endpoint bagimliligini temizle.

## Example Mapping Template

| Deprecated | Replacement | Breaking Risk | Owner | Due Date |
| --- | --- | --- | --- | --- |
| `/api/v1/example-old` | `/api/v2/example-new` | high | api-team | 2026-06-30 |

## Rollback Plan

- Yeni endpointte kritik regresyon olursa:
  1. Trafik canary seviyesine geri cekilir.
  2. Eski endpoint gecici olarak yeniden primary yapilir.
  3. Incident kaydi acilir ve postmortem tamamlanir.

## Governance Notes

- Her major API degisikliginde:
  - OpenAPI dokumani guncellenir (`docs/api/openapi.yaml`)
  - Bu playbook'ta migration adimi eklenir
  - Test/regresyon raporu release artefaktina baglanir
