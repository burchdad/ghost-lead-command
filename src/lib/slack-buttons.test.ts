import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Lead, OutreachQueueItem } from "@prisma/client";
import { notifySlackOutreachApproval } from "@/lib/slack";

const originalFetch = global.fetch;
const originalWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const originalActionToken = process.env.SLACK_ACTION_TOKEN;

type CapturedSlackPayload = {
  blocks?: Array<{ elements?: Array<{ action_id?: string; text?: { text?: string }; url?: string; value?: string }> }>;
};
type QueueItemWithLead = OutreachQueueItem & { lead: Lead };
type QueueItemOverride = Partial<OutreachQueueItem> & { lead?: Lead };

function makeLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date();
  return {
    id: "lead-test",
    workspaceId: "workspace-test",
    name: "Jordan Lee",
    companyName: "Texas Star Roofing",
    title: "Owner",
    description: null,
    niche: "Roofing",
    source: "google-maps",
    stage: "Imported",
    priority: null,
    score: 91,
    leadScore: null,
    value: 5000,
    lastTouch: "Just now",
    nextAction: "Strong ICP fit with public web signal.",
    tags: null,
    customFields: null,
    crmSyncStatus: "pending",
    crmSyncedAt: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    contactId: null,
    companyId: null,
    ...overrides,
  };
}

function makeQueueItem(overrides: QueueItemOverride = {}): QueueItemWithLead {
  const now = new Date();
  const lead = overrides.lead || makeLead();
  const queueOverrides = { ...overrides };
  delete queueOverrides.lead;
  return {
    id: "queue-test",
    workspaceId: "workspace-test",
    leadId: "lead-test",
    channel: "email",
    provider: "sendgrid",
    subject: "Following up on your open quotes?",
    body: "Hi Jordan,\n\nI had a quick idea for tightening website and phone inquiry follow-up.",
    status: "pending",
    reason: "ICP and market-fit signals support further research; active buying intent is not confirmed.",
    scheduledFor: null,
    approvedAt: null,
    sentAt: null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now,
    ...queueOverrides,
    lead,
  };
}

async function captureOutreachCard(item: QueueItemWithLead) {
  let payload: CapturedSlackPayload | null = null;
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/services/test";
  process.env.SLACK_ACTION_TOKEN = "test-action-token";
  global.fetch = (async (_url, init) => {
    payload = JSON.parse(String(init?.body || "{}")) as CapturedSlackPayload;
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  const result = await notifySlackOutreachApproval(item);
  assert.equal(result.sent, true);
  assert.ok(payload);
  return payload;
}

function buttonLabels(payload: CapturedSlackPayload) {
  return (payload.blocks || [])
    .flatMap((block) => block.elements || [])
    .filter((element) => element.text?.text)
    .map((element) => ({ label: element.text?.text, actionId: element.action_id, url: element.url, value: element.value }));
}

afterEach(() => {
  global.fetch = originalFetch;
  process.env.SLACK_WEBHOOK_URL = originalWebhookUrl;
  process.env.SLACK_ACTION_TOKEN = originalActionToken;
});

describe("Slack outreach button contracts", () => {
  it("uses native Slack actions for send-ready approval controls", async () => {
    const payload = await captureOutreachCard(makeQueueItem({
      body: "Hi Jordan,\n\nI had a quick idea for tightening website and phone inquiry follow-up.\n\njordan@texasstarroofing.com",
      reason: "Verified decision-maker email and high opportunity trust.",
    }));
    const buttons = buttonLabels(payload);

    assert.deepEqual(
      buttons.filter((button) => ["Approve", "Redo", "Discard", "Suppress"].includes(button.label || "")).map((button) => button.actionId),
      ["outreach_approve", "outreach_redo", "outreach_discard", "outreach_suppress"],
    );
    assert.equal(buttons.find((button) => button.label === "Open Queue")?.actionId, undefined);
    assert.match(buttons.find((button) => button.label === "Approve")?.value || "", /outreach_approve/);
  });

  it("routes research cards to Research Contact without a browser redirect", async () => {
    const payload = await captureOutreachCard(makeQueueItem({
      channel: "research",
      provider: "contact-enrichment",
      body: "Research contact path for Texas Star Roofing.\nWebsite/contact form: https://example.com/contact",
      reason: "buyer role is unclear; no contact path yet; active buying intent is not confirmed.",
      lead: makeLead({ title: "", score: 87 }),
    }));
    const buttons = buttonLabels(payload);
    const research = buttons.find((button) => button.label === "Research Contact");

    assert.equal(research?.actionId, "outreach_research");
    assert.equal(research?.url, undefined);
    assert.match(research?.value || "", /outreach_research/);
    assert.equal(buttons.some((button) => button.label === "Approve"), false);
  });

  it("puts Create Call Task first for call-first cards and keeps email blocked", async () => {
    const payload = await captureOutreachCard(makeQueueItem({
      channel: "manual",
      provider: "phone-website",
      body: "Manual contact path.\nCall path: (903) 555-1212\nWebsite/contact form: https://example.com/contact",
      reason: "phone available for follow-up; buyer role is unclear.",
      lead: makeLead({ title: "", score: 87 }),
    }));
    const buttons = buttonLabels(payload);

    assert.equal(buttons[0]?.label, "Create Call Task");
    assert.equal(buttons[0]?.actionId, "outreach_call_task");
    assert.equal(buttons[0]?.url, undefined);
    assert.equal(buttons.find((button) => button.label === "Research Contact")?.actionId, "outreach_research");
    assert.equal(buttons.some((button) => button.label === "Approve"), false);
  });
});
