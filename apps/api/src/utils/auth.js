import { sendJson } from "./http.js";
import { resolveTenantIdFromRequest } from "../services/tenantService.js";
import { getSsoSession } from "../services/ssoService.js";
import { isAllowedByPolicy } from "./authorizationPolicy.js";

function isAuthEnabled() {
  return String(process.env.AUTH_ENABLED || "false") === "true";
}

function tokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1].trim();
}

function roleForToken(token) {
  if (!token) return null;
  const adminToken = process.env.ADMIN_API_TOKEN || "";
  const editorToken = process.env.EDITOR_API_TOKEN || "";

  if (adminToken && token === adminToken) return { role: "admin", source: "static" };
  if (editorToken && token === editorToken) return { role: "editor", source: "static" };
  const ssoSession = getSsoSession(token);
  if (ssoSession) return { role: ssoSession.role, source: "sso", email: ssoSession.email };
  return null;
}

export function authorize(req, res, allowedRoles) {
  req.tenantId = resolveTenantIdFromRequest(req);

  if (!isAuthEnabled()) {
    req.userRole = "admin";
    return true;
  }

  const token = tokenFromHeader(req);
  const authContext = roleForToken(token);
  const role = authContext?.role;

  if (!role) {
    sendJson(res, 401, { error: "unauthorized" });
    return false;
  }

  req.userRole = role;
  req.authSource = authContext.source;
  req.authEmail = authContext.email || null;

  if (!allowedRoles.includes(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return false;
  }

  if (
    role === "editor" &&
    process.env.EDITOR_TENANT_ID &&
    String(process.env.EDITOR_TENANT_ID) !== String(req.tenantId)
  ) {
    sendJson(res, 403, { error: "forbidden" });
    return false;
  }

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (!isAllowedByPolicy({ role, method: req.method || "GET", pathname })) {
    sendJson(res, 403, { error: "forbidden" });
    return false;
  }

  return true;
}
