import { runOfflineQualityRegression } from "../services/qualityRegressionService.js";

async function main() {
  const report = await runOfflineQualityRegression({
    maxItems: Number(process.env.QUALITY_EVAL_MAX_ITEMS || 50)
  });

  process.stdout.write(
    JSON.stringify(
      {
        status: report.status,
        datasetSize: report.dataset.size,
        passed: report.summary.passed,
        failed: report.summary.failed,
        passRate: report.summary.passRate,
        avgFinalScore: report.summary.avgFinalScore,
        generatedAt: report.generatedAt
      },
      null,
      2
    ) + "\n"
  );

  if (report.summary.failed > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "QUALITY_REGRESSION_FAILED"}\n`);
  process.exitCode = 1;
});
