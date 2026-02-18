import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { withCircuitBreaker } from "../infra/circuitBreakerStore.js";
import { recordProviderTelemetry } from "../infra/metricsStore.js";
import { log } from "../utils/logger.js";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getVoiceProvider() {
  return String(process.env.VOICE_PROVIDER || "mock").toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function slug(value, fallback = "voice") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function estimateDurationSec(script) {
  const words = normalizeText(script)
    .split(/\s+/)
    .filter(Boolean).length;
  const sec = Math.max(3, Math.round((words / 150) * 60));
  return Math.min(sec, 120);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timeoutMs() {
  return Math.max(
    1000,
    toNumber(process.env.VOICE_PROVIDER_TIMEOUT_MS || process.env.PROVIDER_HTTP_TIMEOUT_MS || 7000, 7000)
  );
}

function maxRetries() {
  return Math.min(
    5,
    Math.max(
      0,
      toNumber(
        process.env.VOICE_PROVIDER_MAX_RETRIES || process.env.PROVIDER_MAX_RETRIES || 2,
        2
      )
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function createSilentWavBuffer(durationSec = 4, sampleRate = 44100) {
  const seconds = Math.max(1, Math.min(Number(durationSec) || 4, 30));
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = Math.floor(seconds * byteRate);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

async function generateMockVoiceAsset({ topic, script, language, voice }) {
  const id = `voice_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const filePath = path.join(getDataDir(), "generated", "voice", `${slug(topic)}-${id}.wav`);
  await ensureDir(filePath);
  const durationSec = estimateDurationSec(script);
  await writeFile(filePath, createSilentWavBuffer(durationSec));
  return {
    voiceId: id,
    provider: "mock",
    mode: "mock",
    audioAssetPath: filePath,
    audioAssetUrl: null,
    estimatedDurationSec: durationSec,
    generatedAt: new Date().toISOString()
  };
}

async function generateLiveVoiceAsset({ topic, script, language, voice }) {
  const url = String(process.env.VOICE_API_URL || "").trim();
  const apiKey = String(process.env.VOICE_API_KEY || "").trim();
  if (!url || !apiKey) {
    throw new Error("VOICE_PROVIDER_CONFIG_REQUIRED");
  }

  let response = null;
  let lastError = null;
  const retries = maxRetries();
  const reqTimeout = timeoutMs();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = Date.now();
    try {
      response = await withCircuitBreaker("voice.provider", async () => {
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
              script,
              language,
              voice
            }),
            signal: controller.signal
          });
        } catch (error) {
          if (error?.name === "AbortError") {
            throw new Error("VOICE_PROVIDER_TIMEOUT");
          }
          throw new Error("VOICE_PROVIDER_NETWORK");
        } finally {
          clearTimeout(timeout);
        }
      });

      if (!response.ok) {
        throw new Error(`VOICE_PROVIDER_HTTP_${response.status}`);
      }
      log("info", "voice_provider_success", {
        attempt,
        durationMs: Date.now() - startedAt
      });
      recordProviderTelemetry({
        provider: "voice",
        outcome: "success",
        durationMs: Date.now() - startedAt,
        retried: attempt > 0
      });
      break;
    } catch (error) {
      lastError = error;
      const errorMessage = String(error?.message || "VOICE_PROVIDER_ERROR");
      const outcome = errorMessage.startsWith("CIRCUIT_OPEN:")
        ? "circuit_open"
        : errorMessage === "VOICE_PROVIDER_TIMEOUT"
          ? "timeout"
          : "failure";
      recordProviderTelemetry({
        provider: "voice",
        outcome,
        durationMs: Date.now() - startedAt,
        retried: attempt > 0
      });
      log("warn", "voice_provider_attempt_failed", {
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
      await sleep(Math.min(1000, 150 * (attempt + 1)));
    }
  }

  if (!response) {
    throw lastError || new Error("VOICE_PROVIDER_FAILED");
  }

  const payload = await response.json();
  return {
    voiceId: payload.voiceId || `voice_${Date.now()}`,
    provider: payload.provider || "live",
    mode: "live",
    audioAssetPath: payload.audioAssetPath || null,
    audioAssetUrl: payload.audioAssetUrl || null,
    estimatedDurationSec: Number(payload.estimatedDurationSec || estimateDurationSec(script)),
    generatedAt: new Date().toISOString()
  };
}

export async function generateVoiceover({ topic, script, language = "tr", voice = "default" }) {
  const normalizedTopic = normalizeText(topic);
  const normalizedScript = normalizeText(script);
  if (!normalizedTopic || !normalizedScript) {
    throw new Error("TOPIC_AND_SCRIPT_REQUIRED");
  }

  const provider = getVoiceProvider();
  if (provider === "live") {
    return generateLiveVoiceAsset({
      topic: normalizedTopic,
      script: normalizedScript,
      language,
      voice
    });
  }

  return generateMockVoiceAsset({
    topic: normalizedTopic,
    script: normalizedScript,
    language,
    voice
  });
}
