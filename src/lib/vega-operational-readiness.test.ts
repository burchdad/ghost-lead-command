import assert from "node:assert/strict";
import test from "node:test";
import { VegaOperationalReadinessState } from "@prisma/client";
import {
  deriveOperationalReadinessState,
  evaluateConfigurationReadiness,
  evaluateIntegrationReadiness,
  evaluatePolicyReadiness,
  resolveOperationalTenant,
  scoreCalibration,
} from "@/lib/vega-operational-readiness";

test("tenant resolution honors explicit tenant and defaults only to Ghost", () => {
  const workspaces = [
    { id: "ghost", slug: "ghost-ai-solutions" },
    { id: "client", slug: "naks-exterior" },
  ];
  assert.equal(resolveOperationalTenant({ workspaceSlug: "naks-exterior" }, workspaces)?.id, "client");
  assert.equal(resolveOperationalTenant({ workspaceId: "ghost" }, workspaces)?.slug, "ghost-ai-solutions");
  assert.equal(resolveOperationalTenant({}, workspaces)?.id, "ghost");
  assert.equal(resolveOperationalTenant({ workspaceSlug: "missing" }, workspaces), null);
});

test("integration readiness distinguishes hard delivery blockers from Slack warning", () => {
  const result = evaluateIntegrationReadiness({
    sourceConfigured: true,
    sendgridConfigured: true,
    crmConfigured: true,
    crmReachable: true,
    slackConfigured: false,
  });
  assert.equal(result.ready, true);
  assert.equal(result.blockers.length, 0);
  assert.match(result.warnings[0], /Slack/);

  const blocked = evaluateIntegrationReadiness({
    sourceConfigured: false,
    sendgridConfigured: false,
    crmConfigured: true,
    crmReachable: false,
    slackConfigured: true,
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.blockers.length, 3);
});

test("operator policy cannot disable verified email or suppression checks", () => {
  const result = evaluatePolicyReadiness({
    mode: "managed-autonomy",
    minimumScore: 75,
    dailySendLimit: 20,
    requireVerifiedEmail: false,
    requireSuppressionCheck: false,
    humanApprovalForRisk: true,
  });
  assert.equal(result.ready, false);
  assert.match(result.blockers.join(" "), /Verified email/);
  assert.match(result.blockers.join(" "), /Suppression/);
});

test("authoritative sales profile requires operator-owned launch facts", () => {
  const result = evaluateConfigurationReadiness({
    salesProfile: { businessName: "Ghost AI Solutions", senderName: "Stephen", senderEmail: "sales@ghostai.solutions" },
    icps: ["Local service businesses"],
    offers: ["Lead response audit"],
    territories: ["Texas"],
    qualificationRules: { minimumScore: 75 },
    teamResponsibilities: { salesOwner: "Stephen" },
    outreachPolicy: { mode: "approval" },
  });
  assert.equal(result.ready, true);
});

test("calibration scoring treats research as partial evidence and requires ten reviews", () => {
  const early = scoreCalibration(["GOOD", "GOOD", "NEEDS_RESEARCH"]);
  assert.equal(early.pass, false);
  assert.equal(early.reviewed, 3);

  const passing = scoreCalibration(Array.from({ length: 10 }, () => "GOOD"));
  assert.equal(passing.score, 100);
  assert.equal(passing.pass, true);

  const weak = scoreCalibration(["GOOD", "GOOD", "GOOD", "GOOD", "GOOD", "BAD_FIT", "WRONG_PERSON", "WRONG_COMPANY", "NEEDS_RESEARCH", "GOOD"]);
  assert.ok(weak.score < 80);
});

test("readiness transitions are deterministic and autonomy requires calibration", () => {
  assert.equal(deriveOperationalReadinessState({ configurationReady: false, hardBlockers: [], calibrationReviewed: 0, calibrationTarget: 10, calibrationScore: 0, autonomyRequested: false }), VegaOperationalReadinessState.NOT_CONFIGURED);
  assert.equal(deriveOperationalReadinessState({ configurationReady: true, hardBlockers: ["Sender stop"], calibrationReviewed: 10, calibrationTarget: 10, calibrationScore: 100, autonomyRequested: true }), VegaOperationalReadinessState.BLOCKED);
  assert.equal(deriveOperationalReadinessState({ configurationReady: true, hardBlockers: [], calibrationReviewed: 5, calibrationTarget: 10, calibrationScore: 100, autonomyRequested: true }), VegaOperationalReadinessState.CALIBRATING);
  assert.equal(deriveOperationalReadinessState({ configurationReady: true, hardBlockers: [], calibrationReviewed: 10, calibrationTarget: 10, calibrationScore: 70, autonomyRequested: true }), VegaOperationalReadinessState.APPROVAL_MODE);
  assert.equal(deriveOperationalReadinessState({ configurationReady: true, hardBlockers: [], calibrationReviewed: 10, calibrationTarget: 10, calibrationScore: 90, autonomyRequested: true }), VegaOperationalReadinessState.MANAGED_AUTONOMY);
});
