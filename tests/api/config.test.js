import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../../apps/api/src/utils/config.js";

function withEnv(pairs, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(pairs)) {
    previous[key] = process.env[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("validateConfig fails when auth enabled but tokens missing", () => {
  withEnv(
    {
      AUTH_ENABLED: "true",
      ADMIN_API_TOKEN: null,
      EDITOR_API_TOKEN: null,
      YOUTUBE_PUBLISH_MODE: "mock"
    },
    () => {
      assert.throws(() => validateConfig("test"), /CONFIG_VALIDATION_FAILED/);
    }
  );
});

test("validateConfig fails on invalid youtube live configuration", () => {
  withEnv(
    {
      AUTH_ENABLED: "false",
      YOUTUBE_PUBLISH_MODE: "live",
      YOUTUBE_ACCESS_TOKEN: null,
      GOOGLE_CLIENT_ID: null,
      GOOGLE_CLIENT_SECRET: null,
      GOOGLE_REFRESH_TOKEN: null
    },
    () => {
      assert.throws(() => validateConfig("test"), /CONFIG_VALIDATION_FAILED/);
    }
  );
});

test("validateConfig passes with minimal valid configuration", () => {
  withEnv(
    {
      AUTH_ENABLED: "false",
      YOUTUBE_PUBLISH_MODE: "mock",
      STORAGE_DRIVER: "file",
      QUEUE_DRIVER: "file",
      JOB_MAX_ATTEMPTS: "3",
      JOB_IDEMPOTENCY_TTL_HOURS: "48",
      WORKER_POLL_MS: "1000",
      PORT: "8787"
    },
    () => {
      assert.doesNotThrow(() => validateConfig("test"));
    }
  );
});
