const ROLE_PERMISSIONS = {
  admin: ["*"],
  editor: [
    "pipeline.run",
    "publish.create",
    "publish.read",
    "history.read",
    "analytics.read",
    "analytics.ingest",
    "compliance.read",
    "compliance.check",
    "review.read",
    "webhook.read",
    "connector.read",
    "plugin.read",
    "developer.keys.read"
  ]
};

function routePermission(method, pathname) {
  if (method === "GET" && pathname === "/api/v1/publish") return "publish.read";
  if (method === "POST" && pathname === "/api/v1/pipeline/run") return "pipeline.run";
  if (method === "POST" && pathname === "/api/v1/publish/create") return "publish.create";
  if (method === "GET" && pathname === "/api/v1/history") return "history.read";
  if (method === "GET" && pathname === "/api/v1/analytics/report") return "analytics.read";
  if (method === "POST" && pathname === "/api/v1/analytics/ingest") return "analytics.ingest";
  if (method === "GET" && pathname === "/api/v1/compliance/report") return "compliance.read";
  if (method === "POST" && pathname === "/api/v1/compliance/check") return "compliance.check";
  if (method === "GET" && pathname === "/api/v1/review/queue") return "review.read";
  if (method === "GET" && pathname.startsWith("/api/v1/integrations/webhooks"))
    return "webhook.read";
  if (method === "GET" && pathname.startsWith("/api/v1/integrations/connectors"))
    return "connector.read";
  if (method === "GET" && pathname.startsWith("/api/v1/plugins")) return "plugin.read";
  if (method === "GET" && pathname.startsWith("/api/v1/developer/keys"))
    return "developer.keys.read";
  return null;
}

export function isAllowedByPolicy({ role, method, pathname }) {
  const needed = routePermission(method, pathname);
  if (!needed) return true;
  const grants = ROLE_PERMISSIONS[role] || [];
  return grants.includes("*") || grants.includes(needed);
}
