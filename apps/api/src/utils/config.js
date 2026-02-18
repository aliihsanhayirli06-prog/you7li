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

export function validateConfig(target = "api") {
  const errors = [];

  validateCommon(errors);
  validateAuth(errors);
  validateStorage(errors);
  validateYouTube(errors);
  validateSso(errors);

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
