export type SendGridDeliveryEvent = {
  email?: string;
  event?: string;
  reason?: string;
  response?: string;
  sg_message_id?: string;
  url?: string;
  timestamp?: number;
};

const TRACKABLE_EVENTS = new Set([
  "processed", "delivered", "open", "click", "deferred", "bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe",
]);

const SUPPRESSION_EVENTS = new Set(["bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"]);

export function normalizeSendGridEventType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isTrackableSendGridEvent(value: unknown) {
  return TRACKABLE_EVENTS.has(normalizeSendGridEventType(value));
}

export function isSendGridSuppressionEvent(value: unknown) {
  return SUPPRESSION_EVENTS.has(normalizeSendGridEventType(value));
}

export function getSendGridSuppressionReason(event: SendGridDeliveryEvent) {
  const type = normalizeSendGridEventType(event.event) || "event";
  const detail = String(event.reason || event.response || "SendGrid event").trim();
  return `SendGrid ${type}: ${detail}`.slice(0, 240);
}
