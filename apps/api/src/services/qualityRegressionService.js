import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scoreStrategyForTopic } from "./strategyFusionService.js";
import { generateScript } from "./scriptService.js";
import { generateSeoMetadata } from "./seoService.js";
import { evaluateCompliance } from "./complianceService.js";
import { evaluatePromptCompliance } from "./promptComplianceService.js";

const DEFAULT_DATASET = Object.freeze([
  { id: "eval_1", topic: "youtube shorts izlenme artirma plani", minScore: 78 },
  { id: "eval_2", topic: "icerik retention neden dusuyor", minScore: 75 },
  { id: "eval_3", topic: "youtube otomasyon sisteminde compliance kontrolu", minScore: 80 },
  { id: "eval_4", topic: "kanal buyutme icin haftalik icerik stratejisi", minScore: 77 },
  { id: "eval_5", topic: "shorts baslik ve aciklama seo optimizasyonu", minScore: 79 }
]);

function getDatasetFile() {
  if (process.env.QUALITY_EVAL_DATASET_FILE) return process.env.QUALITY_EVAL_DATASET_FILE;
  return path.join(process.env.DATA_DIR || "data", "quality-eval-dataset.json");
}

function getReportFile() {
  return path.join(process.env.DATA_DIR || "data", "quality-regression-latest.json");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toPercent01(value) {
  return Number((clamp(Number(value) || 0, 0, 1) * 100).toFixed(2));
}

function toScore(value) {
  return Number(clamp(Number(value) || 0, 0, 100).toFixed(2));
}

function computeSeoQualityScore(seo) {
  const title = String(seo?.title || "");
  const keywords = Array.isArray(seo?.keywords) ? seo.keywords : [];
  const hashtags = Array.isArray(seo?.hashtags) ? seo.hashtags : [];
  const score =
    Number(title.length > 0 && title.length <= 70 ? 0.4 : 0.15) +
    Number(keywords.length >= 4 ? 0.35 : 0.1) +
    Number(hashtags.length >= 3 ? 0.25 : 0.1);
  return toPercent01(score);
}

function normalizeDatasetItem(item, index) {
  const topic = String(item?.topic || "").trim();
  if (!topic) return null;
  const minScore = Number.isFinite(Number(item?.minScore))
    ? toScore(item.minScore)
    : Number(process.env.QUALITY_EVAL_MIN_SCORE || 75);
  return {
    id: String(item?.id || `eval_${index + 1}`),
    topic,
    minScore
  };
}

async function readDatasetFromFile() {
  const file = getDatasetFile();
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((item, index) => normalizeDatasetItem(item, index))
      .filter(Boolean)
      .slice(0, 100);
  } catch {
    return null;
  }
}

export async function getOfflineEvalDataset() {
  const fromFile = await readDatasetFromFile();
  if (Array.isArray(fromFile) && fromFile.length > 0) {
    return { source: getDatasetFile(), items: fromFile };
  }

  return {
    source: "default",
    items: DEFAULT_DATASET.map((item) => ({ ...item }))
  };
}

function evaluateDatasetItem(item) {
  const strategy = scoreStrategyForTopic(item.topic);
  const opportunity = { topic: item.topic, opportunityScore: strategy.scores.opportunity };
  const script = generateScript({
    topic: item.topic,
    opportunityScore: opportunity.opportunityScore
  });
  const seo = generateSeoMetadata({
    topic: item.topic,
    script: script.script,
    format: script.metadata.format,
    language: script.metadata.language
  });
  const compliance = evaluateCompliance({
    topic: item.topic,
    script: script.script
  });
  const promptCompliance = evaluatePromptCompliance({
    strategy: {
      selectedTopic: strategy.topic,
      ranked: [strategy]
    },
    script,
    seo,
    media: { enabled: false },
    publish: {
      publishId: `eval_${item.id}`,
      complianceStatus: compliance.status
    }
  });

  const seoQualityScore = computeSeoQualityScore(seo);
  const fusionScorePercent = toPercent01(strategy.fusion.finalScore);
  const finalScore = toScore(
    promptCompliance.scorePercent * 0.6 + fusionScorePercent * 0.25 + seoQualityScore * 0.15
  );

  return {
    id: item.id,
    topic: item.topic,
    threshold: item.minScore,
    scores: {
      finalScore,
      promptCompliance: promptCompliance.scorePercent,
      fusion: fusionScorePercent,
      seoQuality: seoQualityScore
    },
    pass: finalScore >= item.minScore
  };
}

export async function runOfflineQualityRegression({ maxItems = 50 } = {}) {
  const dataset = await getOfflineEvalDataset();
  const items = dataset.items.slice(0, Math.max(1, Number(maxItems) || 50));
  const evaluated = items.map((item) => evaluateDatasetItem(item));
  const passed = evaluated.filter((item) => item.pass).length;
  const failed = evaluated.length - passed;
  const avgScore =
    evaluated.length > 0
      ? Number(
          (
            evaluated.reduce((sum, item) => sum + Number(item.scores.finalScore || 0), 0) /
            evaluated.length
          ).toFixed(2)
        )
      : 0;

  const report = {
    status: failed > 0 ? "regression" : "pass",
    dataset: {
      source: dataset.source,
      size: evaluated.length
    },
    summary: {
      passed,
      failed,
      passRate: evaluated.length ? Number(((passed / evaluated.length) * 100).toFixed(2)) : 0,
      avgFinalScore: avgScore
    },
    items: evaluated,
    generatedAt: new Date().toISOString()
  };

  const file = getReportFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");
  return report;
}
