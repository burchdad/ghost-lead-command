import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProofReconciliationWarnings,
  classifyDecisionLanes,
  classifyEmailPipeline,
} from "./production-proof.ts";
import { classifyPhoneAssistTasks } from "./phone-assist.ts";

const now = new Date("2026-07-21T15:00:00.000-05:00");
const past = new Date("2026-07-21T13:00:00.000-05:00");
const future = new Date("2026-07-21T18:00:00.000-05:00");
const yesterday = new Date("2026-07-20T16:00:00.000-05:00");

function emailItem(id: string, email: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "pending",
    channel: "email",
    provider: "sendgrid",
    subject: "Quick idea",
    body: "Initial outreach",
    reason: null,
    scheduledFor: null,
    createdAt: yesterday,
    sentAt: null,
    lead: {
      contactId: email ? `contact-${id}` : null,
      contact: { email },
      status: "active",
    },
    ...overrides,
  };
}

function phoneItem(id: string, status: string, scheduledFor: Date | null, createdAt = yesterday) {
  return {
    id,
    status,
    channel: "manual",
    provider: "phone-after-email",
    subject: "Call assist",
    body: "Call assist\nAttempts: 0",
    reason: null,
    scheduledFor,
    sentAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

test("qualified first-touch email is held and not sendable when sender governor is STOP", () => {
  const result = classifyEmailPipeline(
    [
      emailItem("a", "owner@examplehvac.com"),
      emailItem("b", "sales@examplehvac.com"),
      emailItem("c", null),
    ],
    { senderMode: "stop", recommendedSendLimit: 10, now },
  );

  assert.equal(result.emailQualified, 2);
  assert.equal(result.sendableNow, 0);
  assert.equal(result.heldBySenderGovernor, 2);
  assert.equal(result.firstTouchHeld, 2);
  assert.equal(result.blockedByContactRisk, 1);
});

test("follow-ups are evaluated separately from first-touch sending", () => {
  const result = classifyEmailPipeline(
    [
      emailItem("initial", "owner@examplehvac.com"),
      emailItem("follow", "owner2@examplehvac.com", {
        subject: "Step 2 follow-up",
        scheduledFor: past,
      }),
    ],
    { senderMode: "stop", recommendedSendLimit: 10, now },
  );

  assert.equal(result.firstTouchEligible, 1);
  assert.equal(result.firstTouchSendable, 0);
  assert.equal(result.followUpsDue, 1);
  assert.equal(result.followUpsSendable, 1);
});

test("decision lanes are mutually exclusive and reconcile", () => {
  const result = classifyDecisionLanes(
    [
      emailItem("email", "owner@examplehvac.com"),
      { ...emailItem("manual", null), channel: "manual", provider: "phone-website" },
      emailItem("research", null),
      { ...emailItem("suppressed", "bad@examplehvac.com"), status: "suppressed" },
      { ...emailItem("sent", "sent@examplehvac.com"), status: "sent" },
    ],
    { senderMode: "clear", recommendedSendLimit: 5 },
  );

  assert.deepEqual(result.lanes, {
    AUTO_EMAIL: 1,
    CALL_FIRST: 1,
    RESEARCH_MORE: 1,
    SUPPRESS: 1,
    CLOSED: 1,
  });
  assert.equal(result.totalActiveCandidates, 5);
  assert.equal(result.totalClassified, 5);
  assert.equal(result.reconciled, true);
});

test("phone tasks classify future, due, overdue, callback, and missing schedule", () => {
  const result = classifyPhoneAssistTasks(
    [
      phoneItem("future", "pending", future),
      phoneItem("due", "pending", past),
      phoneItem("callback", "callback_requested", past),
      phoneItem("missing", "pending", null),
      phoneItem("closed", "meeting_booked", past),
    ],
    { now, createdStart: new Date("2026-07-20T00:00:00.000-05:00"), createdEnd: new Date("2026-07-21T00:00:00.000-05:00") },
  );

  assert.equal(result.created.length, 5);
  assert.equal(result.scheduledLater.length, 1);
  assert.equal(result.dueNow.length, 2);
  assert.equal(result.overdue.length, 2);
  assert.equal(result.callbackDue.length, 1);
  assert.equal(result.missingDueTime.length, 1);
  assert.equal(result.closed.length, 1);
  assert.equal(result.actionable.length, 3);
});

test("reconciliation warns when human call actions do not come from actionable phone query", () => {
  const warnings = buildProofReconciliationWarnings({
    senderMode: "stop",
    sendableNow: 0,
    actionablePhoneTaskIds: ["due"],
    humanActionTaskIds: ["not-actionable"],
    laneReconciled: true,
    unclassified: 0,
  });

  assert.match(warnings.join("\n"), /outside the shared actionable-phone query/);
});

test("reconciliation warns if STOP governor would allow first-touch sends", () => {
  const warnings = buildProofReconciliationWarnings({
    senderMode: "stop",
    sendableNow: 1,
    actionablePhoneTaskIds: [],
    humanActionTaskIds: [],
    laneReconciled: true,
    unclassified: 0,
  });

  assert.match(warnings.join("\n"), /sendableNow is not zero/);
});
