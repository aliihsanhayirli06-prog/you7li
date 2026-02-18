import crypto from "node:crypto";

const sessions = new Map();

function roleFromEmail(email) {
  const normalized = String(email || "").toLowerCase();
  if (normalized.endsWith("@admin.local")) return "admin";
  return "editor";
}

export function ssoLogin({ provider, idToken, email }) {
  const allowed = ["oidc", "saml"];
  if (!allowed.includes(provider)) throw new Error("SSO_PROVIDER_INVALID");

  const expected =
    provider === "oidc" ? process.env.SSO_OIDC_TEST_TOKEN : process.env.SSO_SAML_TEST_TOKEN;
  if (!expected || idToken !== expected) throw new Error("SSO_TOKEN_INVALID");

  const role = roleFromEmail(email);
  const sessionToken = `sso_${crypto.randomUUID()}`;
  const session = {
    sessionToken,
    provider,
    email,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
  sessions.set(sessionToken, session);
  return session;
}

export function getSsoSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.parse(session.expiresAt) < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}
