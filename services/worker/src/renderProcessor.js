import { enqueue } from "../../../apps/api/src/infra/queueClient.js";
import {
  updatePublishRender,
  updatePublishStatus
} from "../../../apps/api/src/infra/publishRepository.js";
import { logHistory } from "../../../apps/api/src/services/historyService.js";
import { queueComplianceReview } from "../../../apps/api/src/services/reviewService.js";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAssetUrl(publishId) {
  return `https://cdn.you7li.local/assets/${publishId}.mp4`;
}

function buildAssetPath(publishId) {
  const dir = process.env.VIDEO_ASSET_DIR || path.join(process.env.DATA_DIR || "data", "assets");
  return path.join(dir, `${publishId}.mp4`);
}

async function ensureMockAsset(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  // Placeholder bytes to keep local development flow deterministic.
  await writeFile(filePath, Buffer.from("you7li-mock-video-asset"));
}

function getRenderMode() {
  return String(process.env.VIDEO_RENDER_MODE || "mock").toLowerCase();
}

function getFfmpegBin() {
  return process.env.FFMPEG_BIN || "ffmpeg";
}

function getRenderDurationSec() {
  const value = Number(process.env.VIDEO_RENDER_DURATION_SEC || 6);
  if (!Number.isFinite(value) || value <= 0) return 6;
  return Math.min(value, 60);
}

function getRenderPresetName() {
  const value = String(process.env.VIDEO_RENDER_PRESET || "balanced").toLowerCase();
  if (value === "fast" || value === "quality") return value;
  return "balanced";
}

function getRenderTemplateName() {
  const value = String(process.env.VIDEO_RENDER_TEMPLATE || "basic").toLowerCase();
  if (value === "minimal") return value;
  return "basic";
}

function getRenderFormatName() {
  const value = String(process.env.VIDEO_RENDER_FORMAT || "shorts").toLowerCase();
  if (value === "reels" || value === "tiktok" || value === "youtube") return value;
  return "shorts";
}

function getQualityGatePolicy() {
  const minBytes = Number(process.env.MEDIA_QUALITY_MIN_BYTES || 16);
  const maxBytes = Number(process.env.MEDIA_QUALITY_MAX_BYTES || 50 * 1024 * 1024);
  return {
    minBytes: Number.isFinite(minBytes) ? Math.max(16, minBytes) : 128,
    maxBytes: Number.isFinite(maxBytes) ? Math.max(1024, maxBytes) : 50 * 1024 * 1024
  };
}

export function resolveRenderPreset(presetName = "balanced") {
  if (presetName === "fast") {
    return {
      ffmpegPreset: "veryfast",
      crf: 31,
      fps: 24,
      targetBitrateKbps: 1200
    };
  }
  if (presetName === "quality") {
    return {
      ffmpegPreset: "slow",
      crf: 21,
      fps: 30,
      targetBitrateKbps: 2800
    };
  }
  return {
    ffmpegPreset: "medium",
    crf: 26,
    fps: 30,
    targetBitrateKbps: 1800
  };
}

export function resolveRenderTemplate(templateName = "basic") {
  if (templateName === "minimal") {
    return {
      introDurationSec: 0,
      outroDurationSec: 0,
      lowerThirdEnabled: false
    };
  }
  return {
    introDurationSec: 1.6,
    outroDurationSec: 1.6,
    lowerThirdEnabled: true
  };
}

export function resolveRenderFormat(formatName = "shorts") {
  if (formatName === "youtube") {
    return { width: 1920, height: 1080, label: "16:9" };
  }
  if (formatName === "reels") {
    return { width: 1080, height: 1920, label: "9:16" };
  }
  if (formatName === "tiktok") {
    return { width: 1080, height: 1920, label: "9:16" };
  }
  return { width: 1080, height: 1920, label: "9:16" };
}

function escapeDrawtextText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildTemplateFilter({ topic, duration, templateName }) {
  const template = resolveRenderTemplate(templateName);
  const safeTopic = escapeDrawtextText(topic || "you7li render");
  const introText = escapeDrawtextText(process.env.VIDEO_TEMPLATE_INTRO_TEXT || "you7li AI Studio");
  const outroText = escapeDrawtextText(process.env.VIDEO_TEMPLATE_OUTRO_TEXT || "like + subscribe");
  const lowerThird = escapeDrawtextText(
    process.env.VIDEO_TEMPLATE_LOWER_THIRD || "you7li.com | content automation"
  );

  const filters = [
    `drawtext=text='${safeTopic}':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=(h-text_h)/2`
  ];

  if (template.introDurationSec > 0) {
    filters.push(
      `drawtext=text='${introText}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=120:box=1:boxcolor=black@0.45:boxborderw=14:enable='between(t,0,${template.introDurationSec})'`
    );
  }

  if (template.lowerThirdEnabled) {
    const lowerThirdEnd = Math.max(
      template.introDurationSec,
      Number(duration) - template.outroDurationSec
    );
    filters.push(
      `drawtext=text='${lowerThird}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=h-160:box=1:boxcolor=black@0.45:boxborderw=10:enable='between(t,${template.introDurationSec},${lowerThirdEnd})'`
    );
  }

  if (template.outroDurationSec > 0) {
    const outroStart = Math.max(0, Number(duration) - template.outroDurationSec);
    filters.push(
      `drawtext=text='${outroText}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2+220:box=1:boxcolor=black@0.45:boxborderw=12:enable='between(t,${outroStart},${duration})'`
    );
  }

  return filters.join(",");
}

function runProcess(bin, args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PROCESS_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`PROCESS_FAILED_${code}:${stderr.slice(0, 220)}`));
    });
  });
}

async function ensureFfmpegAsset(filePath, topic = "", options = {}) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const ffmpeg = getFfmpegBin();
  const duration = getRenderDurationSec();
  const presetName = getRenderPresetName();
  const preset = resolveRenderPreset(presetName);
  const templateName = getRenderTemplateName();
  const formatName = getRenderFormatName();
  const format = resolveRenderFormat(formatName);
  const filter = buildTemplateFilter({ topic, duration, templateName });
  const composeAudio =
    typeof options.audioAssetPath === "string" ? options.audioAssetPath : null;
  const composeVisual =
    typeof options.visualAssetPath === "string" ? options.visualAssetPath : null;

  let hasVisualAsset = false;
  let hasAudioAsset = false;
  if (composeVisual) {
    try {
      await access(composeVisual);
      hasVisualAsset = true;
    } catch {
      hasVisualAsset = false;
    }
  }
  if (composeAudio) {
    try {
      await access(composeAudio);
      hasAudioAsset = true;
    } catch {
      hasAudioAsset = false;
    }
  }

  const videoInputArgs = hasVisualAsset
    ? ["-loop", "1", "-i", composeVisual]
    : [
        "-f",
        "lavfi",
        "-i",
        `color=c=#1b7f79:s=${format.width}x${format.height}:d=${duration}:r=${preset.fps}`
      ];

  const audioInputArgs = hasAudioAsset
    ? ["-i", composeAudio]
    : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"];

  const baseArgs = [
    "-y",
    ...videoInputArgs,
    ...audioInputArgs,
    "-vf",
    filter,
    "-r",
    String(preset.fps),
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac"
  ];
  let codec = "libx264";

  try {
    await runProcess(
      ffmpeg,
      [
        ...baseArgs,
        "-c:v",
        "libx264",
        "-preset",
        preset.ffmpegPreset,
        "-crf",
        String(preset.crf),
        "-b:v",
        `${preset.targetBitrateKbps}k`,
        filePath
      ]
    );
  } catch {
    codec = "mpeg4";
    await runProcess(ffmpeg, [...baseArgs, "-c:v", "mpeg4", filePath]);
  }

  return {
    hasAudioAsset,
    hasVisualAsset,
    codec
  };
}

async function validateRenderedAsset(filePath) {
  const policy = getQualityGatePolicy();
  const file = await stat(filePath);
  const bytes = Number(file.size || 0);
  const errors = [];
  if (bytes < policy.minBytes) {
    errors.push(`size_too_small:${bytes}<${policy.minBytes}`);
  }
  if (bytes > policy.maxBytes) {
    errors.push(`size_too_large:${bytes}>${policy.maxBytes}`);
  }
  return {
    ok: errors.length === 0,
    bytes,
    policy,
    errors
  };
}

export async function processRenderJob(job) {
  if (!job?.publishId) {
    throw new Error("INVALID_JOB");
  }

  await updatePublishRender({
    publishId: job.publishId,
    renderStatus: "rendering"
  });
  await logHistory("render.started", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    renderStatus: "rendering"
  });

  await sleep(150);

  const renderedAt = new Date().toISOString();
  const videoAssetUrl = buildAssetUrl(job.publishId);
  const videoAssetPath = buildAssetPath(job.publishId);
  const mode = getRenderMode();
  const presetName = getRenderPresetName();
  const templateName = getRenderTemplateName();
  const formatName = getRenderFormatName();
  let compose = {
    hasAudioAsset: false,
    hasVisualAsset: false,
    codec: null
  };

  if (mode === "ffmpeg") {
    compose = await ensureFfmpegAsset(videoAssetPath, job.topic, {
      audioAssetPath: job.audioAssetPath || null,
      visualAssetPath: job.visualAssetPath || null
    });
  } else if (mode === "auto") {
    try {
      compose = await ensureFfmpegAsset(videoAssetPath, job.topic, {
        audioAssetPath: job.audioAssetPath || null,
        visualAssetPath: job.visualAssetPath || null
      });
    } catch {
      await ensureMockAsset(videoAssetPath);
    }
  } else {
    await ensureMockAsset(videoAssetPath);
  }

  const quality = await validateRenderedAsset(videoAssetPath);
  if (!quality.ok) {
    await updatePublishRender({
      publishId: job.publishId,
      renderStatus: "failed_quality_gate",
      renderedAt,
      videoAssetUrl,
      videoAssetPath
    });
    await updatePublishStatus({
      publishId: job.publishId,
      status: "review"
    });
    await queueComplianceReview({
      tenantId: job.tenantId || "t_default",
      publishId: job.publishId,
      channelId: job.channelId || null,
      reason: "Media quality gate failed",
      riskScore: 65,
      categories: ["media_quality"]
    });
    await logHistory("render.quality_gate_failed", {
      publishId: job.publishId,
      channelId: job.channelId || null,
      topic: job.topic,
      quality
    });
    return {
      publishId: job.publishId,
      renderStatus: "failed_quality_gate"
    };
  }

  const updated = await updatePublishRender({
    publishId: job.publishId,
    renderStatus: "rendered",
    renderedAt,
    videoAssetUrl,
    videoAssetPath
  });
  await logHistory("render.completed", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    renderStatus: "rendered",
    videoAssetUrl,
    videoAssetPath,
    renderMode: mode,
    renderPreset: presetName,
    renderTemplate: templateName,
    renderFormat: formatName,
    composeAudioAsset: compose.hasAudioAsset,
    composeVisualAsset: compose.hasVisualAsset,
    videoCodec: compose.codec || null,
    quality
  });

  await enqueue({
    jobType: "publish.execute",
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    scheduledAt: job.scheduledAt,
    videoAssetUrl,
    videoAssetPath
  });
  await logHistory("job.enqueued", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    jobType: "publish.execute"
  });

  return updated;
}
