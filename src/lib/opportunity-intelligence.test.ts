import assert from "node:assert/strict";
import test from "node:test";
import type { Lead, OutreachQueueItem } from "@prisma/client";
import { evaluateOpportunityQueueItem, softenUnsupportedPainClaims } from "@/lib/opportunity-intelligence";

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead_1",
    workspaceId: "workspace_1",
    companyId: null,
    contactId: null,
    name: "Team",
    title: null,
    description: null,
    companyName: "HVAC of Texas",
    niche: "HVAC Contractor",
    stage: "Imported",
    priority: null,
    score: 87,
    leadScore: null,
    value: 7500,
    source: "google-maps",
    lastTouch: "Never",
    nextAction: "Vega read: Signal score 68 (research). Channel: enrich. Risk: buyer role is unclear; no contact path yet.",
    tags: null,
    customFields: null,
    crmSyncStatus: "pending",
    crmSyncedAt: null,
    status: "active",
    createdAt: new Date("2026-07-22T00:00:00Z"),
    updatedAt: new Date("2026-07-22T00:00:00Z"),
    ...overrides,
  };
}

function item(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  return {
    id: "item_1",
    workspaceId: "workspace_1",
    leadId: "lead_1",
    channel: "manual",
    provider: "phone-website",
    subject: "Manual contact path for HVAC of Texas",
    body: "Manual contact path for HVAC of Texas.\nWebsite/contact form: https://example.com",
    status: "pending",
    reason: "Signal score 68 (research). Channel: enrich. Risk: buyer role is unclear; no contact path yet.",
    scheduledFor: null,
    approvedAt: null,
    sentAt: null,
    rejectedAt: null,
    createdAt: new Date("2026-07-22T00:00:00Z"),
    updatedAt: new Date("2026-07-22T00:00:00Z"),
    ...overrides,
  };
}

test("manual or enrich queue items are not send-ready approval cards", () => {
  const decision = evaluateOpportunityQueueItem({ ...item(), lead: lead() });
  assert.equal(decision.sendReady, false);
  assert.equal(decision.cardTitle, "VEGA RESEARCH REQUIRED");
  assert.equal(decision.leadFit, 87);
  assert.equal(decision.intent, 68);
  assert.equal(decision.decisionLane, "RESEARCH");
  assert.ok(decision.risks.some((risk) => /decision-maker|email|enrichment/i.test(risk)));
});

test("research cards separate ICP fit from confirmed buyer intent", () => {
  const decision = evaluateOpportunityQueueItem({
    ...item({
      channel: "email",
      provider: "sendgrid",
      subject: "Following up on open quotes?",
      body: "No contact path yet. Website/contact form: https://hvac.example",
      reason:
        "Signal score 68 (research). Channel: enrich. Why: ICP match is strong enough for a money-path test; buyer-intent trigger present; public web signal supports context. Risk: buyer role is unclear; no contact path yet.",
    }),
    lead: lead({
      nextAction:
        "Vega read: Signal score 68 (research). Channel: enrich. Why: ICP match is strong enough for a money-path test; buyer-intent trigger present; public web signal supports context.",
      score: 91,
    }),
  });

  assert.equal(decision.sendReady, false);
  assert.equal(decision.decisionLane, "RESEARCH");
  assert.equal(decision.leadFit, 91);
  assert.equal(decision.researchSignalScore, 68);
  assert.match(decision.executionStatus, /Blocked pending enrichment/i);
  assert.match(decision.researchObjective, /owner|operator|office manager|verified business email/i);
  assert.match(decision.proposedOutreachAngle, /inquiry follow-up|lead-response/i);
  assert.ok(decision.reasons.some((reason) => /active buying intent not confirmed/i.test(reason)));
  assert.ok(!decision.reasons.some((reason) => /buyer-intent trigger present/i.test(reason)));
});

test("verified sendgrid email can remain approval-ready", () => {
  const decision = evaluateOpportunityQueueItem({
    ...item({
      channel: "email",
      provider: "sendgrid",
      subject: "Quick follow-up idea",
      body: "Hi Chris,\nCould this help?\nchris@hvacoftexas.com",
      reason: "Signal score 82 (warm). Channel: email. Why: direct email path available.",
    }),
    lead: lead({ name: "Chris", title: "Owner", nextAction: "direct email path available", score: 90 }),
  });
  assert.equal(decision.sendReady, true);
  assert.equal(decision.cardTitle, "Lead Command approval ready");
  assert.match(decision.decisionLane, /EMAIL/);
});

test("unsupported pain claims are softened when evidence is weak", () => {
  const copy = softenUnsupportedPainClaims(
    {
      subject: "missed requests",
      body: "Team,\nI noticed missed requests and old form fills are costing HVAC of Texas opportunities.\nWorth a quick look?",
    },
    "public web or Google signal supports context",
  );
  assert.doesNotMatch(copy.body, /missed requests|old form fills/i);
  assert.match(copy.body, /may be an opportunity to tighten/i);
  assert.match(copy.body, /^Hi,/);
});
