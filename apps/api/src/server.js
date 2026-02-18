import http from "node:http";
import crypto from "node:crypto";
import { handleApi } from "./routes/api.js";
import { log } from "./utils/logger.js";
import { increment, observeHttpDuration } from "./infra/metricsStore.js";
import { validateConfig } from "./utils/config.js";

const PORT = Number(process.env.PORT || 8787);
validateConfig("api");

const server = http.createServer((req, res) => {
  const startedAt = Date.now();
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    increment("httpRequestsTotal");
    observeHttpDuration(durationMs);

    if (res.statusCode >= 500) {
      increment("httpErrorsTotal");
    }

    log("info", "http_request", {
      requestId,
      method: req.method,
      path: req.url,
      statusCode: res.statusCode,
      durationMs
    });
  });

  Promise.resolve(handleApi(req, res)).catch((error) => {
    increment("httpErrorsTotal");

    log("error", "http_request_failed", {
      requestId,
      method: req.method,
      path: req.url,
      error: error?.message || "unknown"
    });

    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "internal error" }));
  });
});

server.listen(PORT, () => {
  log("info", "server_started", { port: PORT });
});
