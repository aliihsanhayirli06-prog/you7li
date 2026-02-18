# Incident Runbook

## Severity Matrix

- `SEV-1`: Full outage, publish pipeline unavailable, data loss risk.
- `SEV-2`: Major degradation, retries/DLQ growth, partial request failures.
- `SEV-3`: Minor degradation, localized or non-critical features impacted.

## Detection Inputs

- `GET /api/v1/ops/status`
- `GET /api/v1/ops/metrics`
- `GET /api/v1/ops/dlq`
- Alert webhook events (`job_moved_to_dlq`, high error-rate)

## Response Steps

1. Triage severity and assign incident commander.
2. Confirm blast radius: tenant/channel/path affected.
3. Stabilize:
   - Reduce ingress (rate limit / feature flag / queue defer).
   - Pause unstable adapters (YouTube/connector if circuit open).
4. Recover:
   - Drain queue safely.
   - Reprocess DLQ with controlled batches.
5. Validate:
   - Error rate, p95, queue lag return to acceptable range.
6. Communicate:
   - Status page update + stakeholder timeline.

## Rollback Checklist

- Last known good deploy marker identified.
- Config diff reviewed (`.env`, secrets, deploy vars).
- Rollback command executed and health checked.
- Post-rollback smoke tests for pipeline + dashboard.

## Exit Criteria

- `status=operational`
- Queue and DLQ stable
- No sustained 5xx spikes for at least 15 minutes
