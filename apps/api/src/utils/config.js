import { log } from "./logger.js";

function isTruthy(value) {
  return String(value || "").toLowerCase() === "true";
}

function isNumberLike(value) {
  if (value == null || value === "") return false;
  return Number.isFinite(Number(value));
}

function assertEnv(errors, condition, message) {
  if (!condition) errors.push(message);
}

function validateCommon(errors) {
  assertEnv(errors, isNumberLike(process.env.PORT || 8787), "PORT must be a valid number");
  assertEnv(
    errors,
    isNumberLike(process.env.WORKER_POLL_MS || 1000),
    "WORKER_POLL_MS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.JOB_MAX_ATTEMPTS || 3),
    "JOB_MAX_ATTEMPTS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.JOB_IDEMPOTENCY_TTL_HOURS || 48),
    "JOB_IDEMPOTENCY_TTL_HOURS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.QUEUE_BACKPRESSURE_SOFT_LIMIT || 500),
    "QUEUE_BACKPRESSURE_SOFT_LIMIT must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.QUEUE_BACKPRESSURE_HARD_LIMIT || 1000),
    "QUEUE_BACKPRESSURE_HARD_LIMIT must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.QUEUE_BACKPRESSURE_DEFER_MS || 150),
    "QUEUE_BACKPRESSURE_DEFER_MS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || 3),
    "CIRCUIT_BREAKER_FAILURE_THRESHOLD must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || 30000),
    "CIRCUIT_BREAKER_COOLDOWN_MS must be a valid number"
  );

  const soft = Number(process.env.QUEUE_BACKPRESSURE_SOFT_LIMIT || 500);
  const hard = Number(process.env.QUEUE_BACKPRESSURE_HARD_LIMIT || 1000);
  if (Number.isFinite(soft) && Number.isFinite(hard) && soft > hard) {
    errors.push("QUEUE_BACKPRESSURE_SOFT_LIMIT must be <= QUEUE_BACKPRESSURE_HARD_LIMIT");
  }
}

function validateAuth(errors) {
  const authEnabled = isTruthy(process.env.AUTH_ENABLED);

  if (!authEnabled) return;

  assertEnv(
    errors,
    Boolean(process.env.ADMIN_API_TOKEN),
    "AUTH_ENABLED=true requires ADMIN_API_TOKEN"
  );
  assertEnv(
    errors,
    Boolean(process.env.EDITOR_API_TOKEN),
    "AUTH_ENABLED=true requires EDITOR_API_TOKEN"
  );
}

function validateStorage(errors) {
  const storageDriver = process.env.STORAGE_DRIVER || "auto";
  const queueDriver = process.env.QUEUE_DRIVER || "auto";

  if (storageDriver === "postgres") {
    assertEnv(
      errors,
      Boolean(process.env.DATABASE_URL),
      "STORAGE_DRIVER=postgres requires DATABASE_URL"
    );
  }

  if (queueDriver === "redis") {
    assertEnv(errors, Boolean(process.env.REDIS_URL), "QUEUE_DRIVER=redis requires REDIS_URL");
  }

  if (queueDriver !== "redis" && queueDriver !== "file" && queueDriver !== "auto") {
    errors.push("QUEUE_DRIVER must be one of: auto, redis, file");
  }

  if (storageDriver !== "postgres" && storageDriver !== "file" && storageDriver !== "auto") {
    errors.push("STORAGE_DRIVER must be one of: auto, postgres, file");
  }
}

function validateYouTube(errors) {
  const mode = process.env.YOUTUBE_PUBLISH_MODE || "mock";

  if (mode !== "mock" && mode !== "live") {
    errors.push("YOUTUBE_PUBLISH_MODE must be one of: mock, live");
    return;
  }

  if (mode === "mock") return;

  const hasDirectToken = Boolean(process.env.YOUTUBE_ACCESS_TOKEN);
  const hasOAuthTriplet =
    Boolean(process.env.GOOGLE_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET) &&
    Boolean(process.env.GOOGLE_REFRESH_TOKEN);

  assertEnv(
    errors,
    hasDirectToken || hasOAuthTriplet,
    "YOUTUBE_PUBLISH_MODE=live requires YOUTUBE_ACCESS_TOKEN or GOOGLE_CLIENT_ID+GOOGLE_CLIENT_SECRET+GOOGLE_REFRESH_TOKEN"
  );
}

function validateSso(errors) {
  const ssoEnabled = isTruthy(process.env.SSO_ENABLED);
  if (!ssoEnabled) return;
  assertEnv(
    errors,
    Boolean(process.env.SSO_OIDC_TEST_TOKEN),
    "SSO_ENABLED=true requires SSO_OIDC_TEST_TOKEN"
  );
  assertEnv(
    errors,
    Boolean(process.env.SSO_SAML_TEST_TOKEN),
    "SSO_ENABLED=true requires SSO_SAML_TEST_TOKEN"
  );
}

function validateRender(errors) {
  const mode = String(process.env.VIDEO_RENDER_MODE || "mock").toLowerCase();
  if (mode !== "mock" && mode !== "ffmpeg" && mode !== "auto") {
    errors.push("VIDEO_RENDER_MODE must be one of: mock, ffmpeg, auto");
  }

  const preset = String(process.env.VIDEO_RENDER_PRESET || "balanced").toLowerCase();
  if (preset !== "fast" && preset !== "balanced" && preset !== "quality") {
    errors.push("VIDEO_RENDER_PRESET must be one of: fast, balanced, quality");
  }

  const template = String(process.env.VIDEO_RENDER_TEMPLATE || "basic").toLowerCase();
  if (template !== "basic" && template !== "minimal") {
    errors.push("VIDEO_RENDER_TEMPLATE must be one of: basic, minimal");
  }

  const format = String(process.env.VIDEO_RENDER_FORMAT || "shorts").toLowerCase();
  if (format !== "shorts" && format !== "reels" && format !== "tiktok" && format !== "youtube") {
    errors.push("VIDEO_RENDER_FORMAT must be one of: shorts, reels, tiktok, youtube");
  }

  assertEnv(
    errors,
    isNumberLike(process.env.VIDEO_RENDER_DURATION_SEC || 6),
    "VIDEO_RENDER_DURATION_SEC must be a valid number"
  );
}

function validateGenerationProviders(errors) {
  const voiceProvider = String(process.env.VOICE_PROVIDER || "mock").toLowerCase();
  if (voiceProvider !== "mock" && voiceProvider !== "live") {
    errors.push("VOICE_PROVIDER must be one of: mock, live");
  } else if (voiceProvider === "live") {
    assertEnv(
      errors,
      Boolean(process.env.VOICE_API_URL) && Boolean(process.env.VOICE_API_KEY),
      "VOICE_PROVIDER=live requires VOICE_API_URL and VOICE_API_KEY"
    );
  }
  assertEnv(
    errors,
    isNumberLike(process.env.VOICE_PROVIDER_TIMEOUT_MS || process.env.PROVIDER_HTTP_TIMEOUT_MS || 7000),
    "VOICE_PROVIDER_TIMEOUT_MS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.VOICE_PROVIDER_MAX_RETRIES || process.env.PROVIDER_MAX_RETRIES || 2),
    "VOICE_PROVIDER_MAX_RETRIES must be a valid number"
  );

  const visualProvider = String(process.env.VISUAL_PROVIDER || "mock").toLowerCase();
  if (visualProvider !== "mock" && visualProvider !== "live") {
    errors.push("VISUAL_PROVIDER must be one of: mock, live");
  } else if (visualProvider === "live") {
    assertEnv(
      errors,
      Boolean(process.env.VISUAL_API_URL) && Boolean(process.env.VISUAL_API_KEY),
      "VISUAL_PROVIDER=live requires VISUAL_API_URL and VISUAL_API_KEY"
    );
  }
  assertEnv(
    errors,
    isNumberLike(
      process.env.VISUAL_PROVIDER_TIMEOUT_MS || process.env.PROVIDER_HTTP_TIMEOUT_MS || 8000
    ),
    "VISUAL_PROVIDER_TIMEOUT_MS must be a valid number"
  );
  assertEnv(
    errors,
    isNumberLike(process.env.VISUAL_PROVIDER_MAX_RETRIES || process.env.PROVIDER_MAX_RETRIES || 2),
    "VISUAL_PROVIDER_MAX_RETRIES must be a valid number"
  );
}

export function validateConfig(target = "api") {
  const errors = [];

  validateCommon(errors);
  validateAuth(errors);
  validateStorage(errors);
  validateYouTube(errors);
  validateSso(errors);
  validateRender(errors);
  validateGenerationProviders(errors);

  if (errors.length > 0) {
    log("error", "config_validation_failed", {
      target,
      errors
    });
    const err = new Error("CONFIG_VALIDATION_FAILED");
    err.details = errors;
    throw err;
  }

  log("info", "config_validation_ok", { target });
}
