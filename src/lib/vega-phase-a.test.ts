import assert from "node:assert/strict";
import test from "node:test";
import { scoreIntentSignals, signalExpiresAt } from "@/lib/intent-engine";
import { selectNextBestChannel } from "@/lib/next-best-channel";
import { scoreSourceQuality } from "@/lib/source-quality-v2";
import { canAutoApplyLearning, requiresExperimentApproval, transitionExperimentStatus } from "@/lib/experiment-engine";
import { hasVegaCapability } from "@/lib/vega-entitlements";
import { isVegaFeatureEnabled } from "@/lib/vega-feature-flags";
import {
  buildOpportunityIntelligence,
  buildCampaignHealth,
  buildExecutiveDashboard,
  buildUnifiedCompanyTimeline,
  buildUnifiedMemory,
  VEGA_INTELLIGENCE_VERSION,
  VEGA_POLICY_VERSION,
} from "@/lib/vega-intelligence-fusion";
import { MEANINGFUL_INTELLIGENCE_TRIGGERS, snapshotTypeForTrigger } from "@/lib/vega-intelligence-snapshots";

const now = new Date("2026-07-22T15:00:00.000Z");

test("intent signals expire and decay", () => {
  const expired = scoreIntentSignals([
    {
      signalType: "EMAIL_CLICK",
      observedAt: new Date("2026-06-01T15:00:00.000Z"),
      expiresAt: new Date("2026-06-15T15:00:00.000Z"),
      confidence: 1,
      intentStrength: 1,
      scoreImpact: 30,
      accountLevel: true,
      summary: "Old click",
    },
  ], { now });

  assert.equal(expired.totalIntentScore, 0);
  assert.deepEqual(expired.blockers, ["No current intent signal evidence."]);
  assert.ok(signalExpiresAt("EMAIL_REPLY", now) > now);
});

test("single weak signal is suppressed but repeated weak signals can accumulate", () => {
  const single = scoreIntentSignals([
    {
      signalType: "EMAIL_OPEN",
      observedAt: now,
      confidence: 1,
      intentStrength: 1,
      scoreImpact: 8,
      personLevel: true,
      summary: "Opened once",
    },
  ], { now });
  assert.equal(single.recommendedAction, "RESEARCH_MORE");
  assert.ok(single.blockers[0].includes("weak engagement"));

  const repeated = scoreIntentSignals([
    {
      signalType: "EMAIL_OPEN",
      observedAt: now,
      confidence: 1,
      intentStrength: 1,
      scoreImpact: 8,
      personLevel: true,
      summary: "Open one",
    },
    {
      signalType: "WEBSITE_VISIT",
      observedAt: now,
      confidence: 1,
      intentStrength: 1,
      scoreImpact: 8,
      accountLevel: true,
      summary: "Visit",
    },
    {
      signalType: "LINKEDIN_REACTION",
      observedAt: now,
      confidence: 1,
      intentStrength: 1,
      scoreImpact: 8,
      personLevel: true,
      summary: "Reaction",
    },
  ], { now });
  assert.equal(repeated.blockers.length, 0);
  assert.equal(repeated.totalIntentScore, 24);
});

test("account-level aggregation includes several people at one company", () => {
  const score = scoreIntentSignals([
    {
      signalType: "LINKEDIN_COMMENT",
      observedAt: now,
      confidence: 0.9,
      intentStrength: 0.9,
      scoreImpact: 36,
      accountLevel: true,
      personLevel: true,
      summary: "Ops leader commented with a pain point.",
    },
    {
      signalType: "EMAIL_CLICK",
      observedAt: now,
      confidence: 0.8,
      intentStrength: 0.8,
      scoreImpact: 30,
      accountLevel: true,
      personLevel: true,
      summary: "Owner clicked.",
    },
  ], { now });
  assert.ok(score.accountLevelScore > 20);
  assert.equal(score.strongestSignals.length, 2);
  assert.equal(score.recommendedAction, "APPROVAL_EMAIL");
});

test("next-best-channel selects exactly one primary action", () => {
  const decision = selectNextBestChannel({
    emailConfidence: 0.95,
    phoneConfidence: 0.75,
    decisionMakerConfidence: 0.9,
    permittedChannels: ["cold_outbound_email", "phone_calls", "linkedin_manual_actions"],
    senderState: "HEALTHY",
    providerHealthy: true,
    sourceQualityScore: 80,
    workspaceAllowsAutoEmail: true,
    campaignAllowsAutoEmail: true,
    signals: [
      {
        signalType: "EMAIL_CLICK",
        observedAt: now,
        confidence: 1,
        intentStrength: 1,
        scoreImpact: 45,
        accountLevel: true,
        personLevel: true,
        verified: true,
        summary: "Clicked pricing link.",
      },
    ],
  });

  assert.equal(decision.selectedPrimaryChannel, "AUTO_EMAIL");
  assert.equal(decision.requiredApproval, false);
  assert.ok(!decision.allowedSecondaryChannels.includes("AUTO_EMAIL"));
});

test("STOP deliverability governor blocks first-touch email but leaves calls actionable", () => {
  const decision = selectNextBestChannel({
    emailConfidence: 0.95,
    phoneConfidence: 0.9,
    decisionMakerConfidence: 0.9,
    permittedChannels: ["cold_outbound_email", "phone_calls"],
    senderState: "STOP",
    providerHealthy: true,
    sourceQualityScore: 90,
    workspaceAllowsAutoEmail: true,
    campaignAllowsAutoEmail: true,
    signals: [
      {
        signalType: "EMAIL_REPLY",
        observedAt: now,
        confidence: 1,
        intentStrength: 1,
        scoreImpact: 50,
        accountLevel: true,
        personLevel: true,
        summary: "Positive reply.",
      },
    ],
  });

  assert.equal(decision.selectedPrimaryChannel, "CALL_FIRST");
  assert.ok(decision.reasons.some((reason) => reason.includes("STOP")));
});

test("channel policy restrictions prohibit unconsented SMS", () => {
  const decision = selectNextBestChannel({
    emailConfidence: 0.4,
    phoneConfidence: 0.4,
    decisionMakerConfidence: 0.8,
    permittedChannels: ["outbound_sms"],
    channelConsent: { sms: false },
    senderState: "HEALTHY",
    providerHealthy: true,
    sourceQualityScore: 70,
  });
  assert.ok(decision.prohibitedChannels.includes("SMS_FOLLOW_UP"));
});

test("source quality uses minimum sample size before penalizing permanently", () => {
  const small = scoreSourceQuality({
    recordsReturned: 8,
    validBusinessCount: 4,
    verifiedEmailCount: 2,
    phoneAvailableCount: 4,
    decisionMakerCount: 2,
    sentCount: 5,
    deliveredCount: 3,
    hardBounceCount: 2,
    replyCount: 0,
    reachedContactCount: 0,
    conversationCount: 0,
    meetingCount: 0,
  });
  assert.equal(small.state, "insufficient_sample");

  const bad = scoreSourceQuality({
    recordsReturned: 50,
    validBusinessCount: 25,
    verifiedEmailCount: 10,
    phoneAvailableCount: 20,
    decisionMakerCount: 10,
    sentCount: 40,
    deliveredCount: 25,
    hardBounceCount: 8,
    replyCount: 0,
    reachedContactCount: 1,
    conversationCount: 0,
    meetingCount: 0,
  });
  assert.equal(bad.state, "penalize");
});

test("experiments require approval for material changes", () => {
  assert.equal(requiresExperimentApproval({ changes: ["target_market"] }), true);
  assert.equal(requiresExperimentApproval({ changes: ["subject_line"], volumeIncreasePct: 10 }), false);
  assert.equal(canAutoApplyLearning({ action: "suppress_bad_contact" }), true);
  assert.equal(canAutoApplyLearning({ action: "change_target_market" }), false);
  assert.deepEqual(transitionExperimentStatus("PROPOSED", "APPROVED"), { ok: true });
  assert.equal(transitionExperimentStatus("COMPLETED", "RUNNING").ok, false);
});

test("entitlements and feature flags are conservative for external workspaces", () => {
  assert.equal(hasVegaCapability("VEGA_SCOUT", "outbound_email"), false);
  assert.equal(hasVegaCapability("VEGA_REACH", "outbound_email"), true);
  assert.equal(hasVegaCapability("VEGA_MANAGED", "controlled_experiments"), true);
  assert.equal(isVegaFeatureEnabled("VEGA_SOCIAL_SIGNALS", { workspaceSlug: "client-shop" }), false);
  assert.equal(isVegaFeatureEnabled("VEGA_SOCIAL_SIGNALS", { workspaceSlug: "ghost-ai-solutions" }), true);
});

test("opportunity intelligence fuses scores into one explainable auto-send decision", () => {
  const intelligence = buildOpportunityIntelligence({
    leadScore: 96,
    email: "owner@acmeroofing.com",
    phone: "+15555550123",
    title: "Owner",
    companyName: "Acme Roofing",
    niche: "Roofing",
    signalSummary: "Owner clicked pricing and requested faster estimate follow-up.",
    intentSignals: [
      {
        signalType: "EMAIL_CLICK",
        observedAt: now,
        confidence: 1,
        intentStrength: 1,
        scoreImpact: 55,
        accountLevel: true,
        personLevel: true,
        verified: true,
        summary: "Owner clicked pricing.",
      },
    ],
    sourceQualityMetrics: {
      recordsReturned: 80,
      validBusinessCount: 75,
      verifiedEmailCount: 62,
      phoneAvailableCount: 70,
      decisionMakerCount: 60,
      sentCount: 40,
      deliveredCount: 39,
      hardBounceCount: 1,
      replyCount: 5,
      reachedContactCount: 8,
      conversationCount: 3,
      meetingCount: 1,
    },
    campaignApproved: true,
    policy: {
      minScore: 82,
      autoSendTrustThreshold: 90,
      executiveReviewTrustThreshold: 80,
      senderMode: "clear",
      senderRemaining: 12,
      senderBounceRate: 1.2,
    },
  });

  assert.equal(intelligence.decisionLane, "auto-send");
  assert.equal(intelligence.recommendedChannel, "AUTO_EMAIL");
  assert.ok(intelligence.trustScore >= 90);
  assert.ok(intelligence.explanation.metrics.some((metric) => metric.label === "Overall Trust"));
  assert.ok(intelligence.explanation.reason.includes("Vega"));
});

test("opportunity intelligence routes uncertain or strategic accounts to one exception lane", () => {
  const intelligence = buildOpportunityIntelligence({
    leadScore: 91,
    email: "info@regionalhospital.com",
    phone: "+15555550123",
    title: "Operations Director",
    companyName: "Regional Hospital",
    niche: "Healthcare",
    signalSummary: "Hospital scheduling complaints surfaced in public reviews.",
    campaignApproved: true,
    policy: {
      minScore: 82,
      autoSendTrustThreshold: 90,
      executiveReviewTrustThreshold: 80,
      senderMode: "clear",
      senderRemaining: 20,
      senderBounceRate: 0.8,
    },
  });

  assert.equal(intelligence.decisionLane, "executive-review");
  assert.equal(intelligence.recommendedChannel, "APPROVAL_EMAIL");
  assert.ok(intelligence.explanation.blockers.some((blocker) => blocker.includes("Strategic") || blocker.includes("regulated")));
});

test("company timeline and memory are unified into one ordered history", () => {
  const timeline = buildUnifiedCompanyTimeline({
    lead: {
      createdAt: new Date("2026-07-20T10:00:00.000Z"),
      source: "google-maps",
      stage: "Imported",
      score: 88,
      companyName: "ABC Roofing",
    },
    intentSignals: [
      {
        observedAt: new Date("2026-07-20T11:00:00.000Z"),
        summary: "Website has missed-call complaint pattern.",
        sourceProvider: "reviews",
        signalType: "MISSED_CALL_REVIEW_SIGNAL",
      },
    ],
    queueItems: [
      {
        createdAt: new Date("2026-07-20T12:00:00.000Z"),
        updatedAt: new Date("2026-07-20T12:00:00.000Z"),
        channel: "email",
        provider: "sendgrid",
        status: "sent",
        reason: "Trust 94 auto-send.",
      },
    ],
    replies: [
      {
        createdAt: new Date("2026-07-21T09:00:00.000Z"),
        classification: "hot",
        body: "Interested. Call me tomorrow.",
        source: "sendgrid",
      },
    ],
  });
  const memory = buildUnifiedMemory({
    companyName: "ABC Roofing",
    contacts: [{ name: "Amy Owner", email: "amy@abcroofing.com", phone: "+15555550123", title: "Owner" }],
    timeline,
    campaignName: "East Texas Roofing",
    workspaceName: "Ghost AI Solutions",
  });

  assert.deepEqual(timeline.map((event) => event.label), ["Prospect Found", "Intent Signal", "EMAIL sent", "Reply hot"]);
  assert.equal(new Set(timeline.map((event) => event.type)).size, 4);
  assert.ok(memory.company.some((item) => item.includes("Recent reply")));
  assert.ok(memory.contacts["Amy Owner"].some((item) => item.includes("Email known")));
  assert.ok(memory.campaign[0].includes("East Texas Roofing"));
});

test("executive dashboard turns campaign health into recommendations", () => {
  const fleet = buildCampaignHealth({
    name: "Fleet Detailing",
    leads: 40,
    sent: 30,
    replies: 5,
    conversations: 4,
    meetings: 2,
    revenue: 28000,
    riskyEvents: 0,
    sourceQuality: 88,
    trust: 92,
  });
  const roofing = buildCampaignHealth({
    name: "Roofing",
    leads: 70,
    sent: 50,
    replies: 0,
    conversations: 0,
    meetings: 0,
    revenue: 0,
    riskyEvents: 7,
    sourceQuality: 42,
    trust: 61,
  });
  const dashboard = buildExecutiveDashboard({
    opportunities: [{ value: 28000, probability: 55 }, { value: 12000, probability: 30 }],
    conversationsToday: 4,
    meetings: 2,
    humanTasks: 3,
    campaigns: [fleet, roofing],
    sourcePerformance: [
      { source: "google-maps", score: 86 },
      { source: "pdl", score: 58 },
    ],
  });

  assert.equal(fleet.momentum, "Growing");
  assert.equal(fleet.requiresStephenApproval, true);
  assert.equal(roofing.risk, "High");
  assert.equal(dashboard.revenuePipeline, 40000);
  assert.equal(dashboard.estimatedRevenue, 19000);
  assert.equal(dashboard.bestPerformingSource, "google-maps");
  assert.ok(dashboard.recommendedActions.some((action) => action.includes("Fleet")));
  assert.ok(dashboard.biggestBottleneck.includes("Human tasks"));
});

test("intelligence snapshots are limited to meaningful operational triggers", () => {
  assert.ok(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("lead_qualified"));
  assert.ok(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("send_decision"));
  assert.ok(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("reply_received"));
  assert.ok(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("manual_override"));
  assert.equal(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("page_load"), false);
  assert.equal(MEANINGFUL_INTELLIGENCE_TRIGGERS.has("poll_refresh"), false);
});

test("intelligence versions are explicit for snapshot reconciliation", () => {
  assert.equal(VEGA_INTELLIGENCE_VERSION, "vega-intelligence-fusion.v1");
  assert.equal(VEGA_POLICY_VERSION, "vega-trust-policy.v2");
});

test("snapshot trigger types map to typed intelligence categories", () => {
  assert.equal(snapshotTypeForTrigger("lead_qualified"), "QUALIFICATION");
  assert.equal(snapshotTypeForTrigger("send_decision"), "DECISION");
  assert.equal(snapshotTypeForTrigger("email_event"), "DELIVERY_EVENT");
  assert.equal(snapshotTypeForTrigger("reply_received"), "REPLY");
  assert.equal(snapshotTypeForTrigger("manual_override"), "MANUAL_OVERRIDE");
});
