import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { withCircuitBreaker } from "../infra/circuitBreakerStore.js";
import { recordProviderTelemetry } from "../infra/metricsStore.js";
import { log } from "../utils/logger.js";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getVisualProvider() {
  return String(process.env.VISUAL_PROVIDER || "mock").toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFormat(value) {
  const format = String(value || "shorts").toLowerCase();
  if (format === "reels" || format === "tiktok" || format === "youtube") return format;
  return "shorts";
}

function slug(value, fallback = "visual") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function formatResolution(format) {
  if (format === "youtube") return "1920x1080";
  return "1080x1920";
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeoutMs() {
  return Math.max(
    1000,
    toNumber(
      process.env.VISUAL_PROVIDER_TIMEOUT_MS || process.env.PROVIDER_HTTP_TIMEOUT_MS || 8000,
      8000
    )
  );
}

function maxRetries() {
  return Math.min(
    5,
    Math.max(
      0,
      toNumber(
        process.env.VISUAL_PROVIDER_MAX_RETRIES || process.env.PROVIDER_MAX_RETRIES || 2,
        2
      )
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolutionToSize(resolution) {
  const [w, h] = String(resolution)
    .split("x")
    .map((value) => Number(value));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return { width: 1080, height: 1920 };
}

function createPpmBuffer(width, height) {
  const safeWidth = Math.min(Math.max(Number(width) || 1080, 64), 1920);
  const safeHeight = Math.min(Math.max(Number(height) || 1920, 64), 1920);
  const header = Buffer.from(`P6\n${safeWidth} ${safeHeight}\n255\n`, "ascii");
  const pixels = Buffer.alloc(safeWidth * safeHeight * 3);
  for (let y = 0; y < safeHeight; y += 1) {
    for (let x = 0; x < safeWidth; x += 1) {
      const offset = (y * safeWidth + x) * 3;
      pixels[offset] = 30 + (x % 80);
      pixels[offset + 1] = 90 + (y % 120);
      pixels[offset + 2] = 150;
    }
  }
  return Buffer.concat([header, pixels]);
}

async function generateMockVisualAsset({ topic, prompt, format }) {
  const id = `visual_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const resolution = formatResolution(format);
  const { width, height } = resolutionToSize(resolution);
  const filePath = path.join(getDataDir(), "generated", "visual", `${slug(topic)}-${id}.ppm`);
  await ensureDir(filePath);
  await writeFile(filePath, createPpmBuffer(width, height));
  return {
    visualId: id,
    provider: "mock",
    mode: "mock",
    visualAssetPath: filePath,
    visualAssetUrl: null,
    format,
    resolution,
    generatedAt: new Date().toISOString()
  };
}

async function generateLiveVisualAsset({ topic, prompt, format }) {
  const url = String(process.env.VISUAL_API_URL || "").trim();
  const apiKey = String(process.env.VISUAL_API_KEY || "").trim();
  if (!url || !apiKey) {
    throw new Error("VISUAL_PROVIDER_CONFIG_REQUIRED");
  }

  let response = null;
  let lastError = null;
  const retries = maxRetries();
  const reqTimeout = timeoutMs();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      response = await withCircuitBreaker("visual.provider", async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), reqTimeout);
        try {
          return await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              topic,
              prompt,
              format
            }),
            signal: controller.signal
          });
        } catch (error) {
          if (error?.name === "AbortError") {
            throw new Error("VISUAL_PROVIDER_TIMEOUT");
          }
          throw new Error("VISUAL_PROVIDER_NETWORK");
        } finally {
          clearTimeout(timeout);
        }
      });

      if (!response.ok) {
        throw new Error(`VISUAL_PROVIDER_HTTP_${response.status}`);
      }
      log("info", "visual_provider_success", {
        attempt,
        durationMs: Date.now() - startedAt
      });
      recordProviderTelemetry({
        provider: "visual",
        outcome: "success",
        durationMs: Date.now() - startedAt,
        retried: attempt > 0
      });
      break;
    } catch (error) {
      lastError = error;
      const errorMessage = String(error?.message || "VISUAL_PROVIDER_ERROR");
      const outcome = errorMessage.startsWith("CIRCUIT_OPEN:")
        ? "circuit_open"
        : errorMessage === "VISUAL_PROVIDER_TIMEOUT"
          ? "timeout"
          : "failure";
      recordProviderTelemetry({
        provider: "visual",
        outcome,
        durationMs: Date.now() - startedAt,
        retried: attempt > 0
      });
      log("warn", "visual_provider_attempt_failed", {
        attempt,
        durationMs: Date.now() - startedAt,
        error: errorMessage
      });
      if (errorMessage.startsWith("CIRCUIT_OPEN:")) {
        throw error;
      }
      if (attempt >= retries) {
        throw error;
      }
      await sleep(Math.min(1200, 180 * (attempt + 1)));
    }
  }

  if (!response) {
    throw lastError || new Error("VISUAL_PROVIDER_FAILED");
  }

  const payload = await response.json();
  return {
    visualId: payload.visualId || `visual_${Date.now()}`,
    provider: payload.provider || "live",
    mode: "live",
    visualAssetPath: payload.visualAssetPath || null,
    visualAssetUrl: payload.visualAssetUrl || null,
    format,
    resolution: payload.resolution || formatResolution(format),
    generatedAt: new Date().toISOString()
  };
}

export async function generateVisualAsset({ topic, prompt = "", format = "shorts" }) {
  const normalizedTopic = normalizeText(topic);
  const normalizedPrompt = normalizeText(prompt) || normalizedTopic;
  if (!normalizedTopic) {
    throw new Error("TOPIC_REQUIRED");
  }

  const normalizedFormat = normalizeFormat(format);
  const provider = getVisualProvider();
  if (provider === "live") {
    return generateLiveVisualAsset({
      topic: normalizedTopic,
      prompt: normalizedPrompt,
      format: normalizedFormat
    });
  }

  return generateMockVisualAsset({
    topic: normalizedTopic,
    prompt: normalizedPrompt,
    format: normalizedFormat
  });
}
