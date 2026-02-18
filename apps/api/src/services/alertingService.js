import { log } from "../utils/logger.js";

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

export async function sendAlert(eventType, payload) {
  log("error", "alert_event", { eventType, ...payload });

  if (!ALERT_WEBHOOK_URL) return;

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        payload,
        ts: new Date().toISOString()
      })
    });
  } catch (error) {
    log("error", "alert_delivery_failed", {
      eventType,
      error: error?.message || "unknown"
    });
  }
}
