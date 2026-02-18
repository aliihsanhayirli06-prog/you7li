import crypto from "node:crypto";
import { appendAuditEvent, listAuditEvents, verifyAuditChain } from "../infra/auditRepository.js";

export async function logAuditEvent({
  tenantId = "t_default",
  publishId = null,
  eventType,
  actorRole = null,
  payload = {},
  createdAt = null
}) {
  if (!eventType) throw new Error("AUDIT_EVENT_TYPE_REQUIRED");
  return appendAuditEvent({
    eventId: `aud_${crypto.randomUUID()}`,
    tenantId,
    publishId,
    eventType,
    actorRole,
    payload,
    createdAt: createdAt || new Date().toISOString()
  });
}

export async function getAuditTrail({ tenantId = null, publishId = null, limit = 100 } = {}) {
  return listAuditEvents({ tenantId, publishId, limit });
}

export async function verifyAuditTrail({ tenantId = null } = {}) {
  return verifyAuditChain({ tenantId });
}
