import { appendHistoryEvent, listHistoryEvents } from "../infra/historyRepository.js";
import { logAuditEvent } from "./auditService.js";
import { dispatchWebhookEvent } from "./webhookService.js";
import { invokePluginHook } from "./pluginService.js";

const historySubscribers = new Set();

function notifyHistorySubscribers(event) {
  for (const subscriber of historySubscribers) {
    try {
      subscriber(event);
    } catch {
      // SSE listener failures should not break the main pipeline.
    }
  }
}

export function subscribeHistoryEvents(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  historySubscribers.add(listener);
  return () => {
    historySubscribers.delete(listener);
  };
}

export async function logHistory(eventType, payload = {}) {
  const event = await appendHistoryEvent({
    eventType,
    ...payload
  });
  notifyHistorySubscribers(event);
  await logAuditEvent({
    tenantId: event.tenantId || payload.tenantId || "t_default",
    publishId: event.publishId || payload.publishId || null,
    eventType,
    actorRole: payload.actorRole || null,
    payload: {
      historyEventId: event.eventId,
      ...payload
    },
    createdAt: event.createdAt
  });
  await dispatchWebhookEvent({
    tenantId: event.tenantId || payload.tenantId || "t_default",
    eventType,
    payload: event
  });
  await invokePluginHook({
    tenantId: event.tenantId || payload.tenantId || "t_default",
    hook: "history.event",
    payload: event
  });
  return event;
}

export async function getHistory({ limit = 100, publishId = null, tenantId = null } = {}) {
  return listHistoryEvents({ limit, publishId, tenantId });
}
