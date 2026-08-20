import assert from "node:assert/strict";
import test from "node:test";
import { getSendGridSuppressionReason, isSendGridSuppressionEvent, isTrackableSendGridEvent } from "@/lib/sendgrid-events";
import { buildSuppressionRecordData } from "@/lib/suppression";

test("SendGrid suppression evidence always carries the resolved workspace tenant", () => {
  const data = buildSuppressionRecordData({
    workspaceId: "workspace-1",
    type: "email",
    value: " Buyer@Example.COM ",
    reason: "SendGrid bounce",
    source: "sendgrid-event",
  });
  assert.deepEqual(data, {
    workspaceId: "workspace-1",
    type: "email",
    value: "buyer@example.com",
    reason: "SendGrid bounce",
    source: "sendgrid-event",
  });
  assert.equal("organizationId" in data, false);
});

test("suppression writes fail closed without a tenant", () => {
  assert.throws(() => buildSuppressionRecordData({ workspaceId: "", type: "email", value: "buyer@example.com" }), /workspace tenant/);
});

test("SendGrid delivery events classify suppression outcomes deterministically", () => {
  assert.equal(isTrackableSendGridEvent("Delivered"), true);
  assert.equal(isSendGridSuppressionEvent("delivered"), false);
  assert.equal(isSendGridSuppressionEvent("bounce"), true);
  assert.equal(isSendGridSuppressionEvent("spamreport"), true);
  assert.equal(getSendGridSuppressionReason({ event: "bounce", response: "550 mailbox unavailable" }), "SendGrid bounce: 550 mailbox unavailable");
});
