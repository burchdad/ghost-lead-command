import assert from "node:assert/strict";
import test from "node:test";
import { scoreIntentSignals, signalExpiresAt } from "@/lib/intent-engine";
import { selectNextBestChannel } from "@/lib/next-best-channel";
import { scoreSourceQuality } from "@/lib/source-quality-v2";
import { canAutoApplyLearning, requiresExperimentApproval, transitionExperimentStatus } from "@/lib/experiment-engine";
import { hasVegaCapability } from "@/lib/vega-entitlements";
import { isVegaFeatureEnabled } from "@/lib/vega-feature-flags";

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
