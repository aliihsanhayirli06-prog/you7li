import { checkProviderTelemetryAlerts } from "../services/alertingService.js";

async function main() {
  const tenantId = process.env.ALERT_TENANT_ID || "t_default";
  const result = await checkProviderTelemetryAlerts({ tenantId });
  process.stdout.write(
    JSON.stringify(
      {
        checkedAt: result.checkedAt,
        alerts: result.alerts.length,
        incidents: result.incidents.length,
        suppressed: result.suppressed.length
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "PROVIDER_ALERT_CHECK_FAILED"}\n`);
  process.exitCode = 1;
});
