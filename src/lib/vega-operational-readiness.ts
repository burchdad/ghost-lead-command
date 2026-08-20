import { Prisma, VegaCalibrationVerdict, VegaOperationalReadinessState } from "@prisma/client";
import { getSenderHealth } from "@/lib/conversion-quality";
import { getGhostCrmHealth } from "@/lib/ghostcrm";
import { getMissionControlBridgeStatus } from "@/lib/mission-control-bridge";
import { getOutreachStatus } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { getSourcingStatus } from "@/lib/sourcing";
import { ensureVegaOperationalSchema } from "@/lib/vega-operational-schema";
import { getDefaultWorkspace } from "@/lib/workspace";

export const VEGA_OPERATIONAL_POLICY_VERSION = "vega-operator-v1";
export const CALIBRATION_MINIMUM = 10;
export const CALIBRATION_MAXIMUM = 20;
export const MANAGED_AUTONOMY_SCORE = 80;

export type OperationalConfiguration = {
  salesProfile?: Record<string, unknown> | null;
  icps?: unknown[] | null;
  offers?: unknown[] | null;
  territories?: unknown[] | null;
  qualificationRules?: Record<string, unknown> | null;
  teamResponsibilities?: Record<string, unknown> | null;
  outreachPolicy?: Record<string, unknown> | null;
};

export type IntegrationReadinessInput = {
  sourceConfigured: boolean;
  sendgridConfigured: boolean;
  crmConfigured: boolean;
  crmReachable: boolean;
  slackConfigured: boolean;
};

export type PolicyReadinessInput = {
  mode?: string;
  minimumScore?: number;
  dailySendLimit?: number;
  requireVerifiedEmail?: boolean;
  requireSuppressionCheck?: boolean;
  humanApprovalForRisk?: boolean;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function resolveOperationalTenant<T extends { id: string; slug: string }>(
  selector: { workspaceId?: string; workspaceSlug?: string },
  available: T[],
) {
  const workspaceId = clean(selector.workspaceId);
  const workspaceSlug = clean(selector.workspaceSlug).toLowerCase();
  if (workspaceId) return available.find((workspace) => workspace.id === workspaceId) || null;
  if (workspaceSlug) return available.find((workspace) => workspace.slug.toLowerCase() === workspaceSlug) || null;
  return available.find((workspace) => workspace.slug === "ghost-ai-solutions") || null;
}

export function evaluateConfigurationReadiness(config: OperationalConfiguration) {
  const sales = record(config.salesProfile);
  const qualification = record(config.qualificationRules);
  const team = record(config.teamResponsibilities);
  const outreach = record(config.outreachPolicy);
  const blockers: string[] = [];

  if (!clean(sales.businessName)) blockers.push("Authoritative business name is missing.");
  if (!clean(sales.senderName) || !clean(sales.senderEmail)) blockers.push("Approved sender identity is incomplete.");
  if (!list(config.icps).length) blockers.push("At least one ICP must be approved.");
  if (!list(config.offers).length) blockers.push("At least one offer must be approved.");
  if (!list(config.territories).length) blockers.push("At least one operating territory must be approved.");
  if (!Number.isFinite(Number(qualification.minimumScore))) blockers.push("A deterministic minimum qualification score is required.");
  if (!clean(team.salesOwner)) blockers.push("Sales follow-up ownership is not assigned.");
  if (!clean(outreach.mode)) blockers.push("An outreach autonomy mode is required.");

  return { ready: blockers.length === 0, blockers };
}

export function evaluateIntegrationReadiness(input: IntegrationReadinessInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!input.sourceConfigured) blockers.push("No lead source provider is configured.");
  if (!input.sendgridConfigured) blockers.push("SendGrid is not configured for controlled email delivery.");
  if (!input.crmConfigured) blockers.push("GhostCRM sync is not configured.");
  else if (!input.crmReachable) blockers.push("GhostCRM is configured but unreachable.");
  if (!input.slackConfigured) warnings.push("Slack executive reporting is not configured.");
  return { ready: blockers.length === 0, blockers, warnings };
}

export function evaluatePolicyReadiness(input: PolicyReadinessInput) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const allowedModes = ["approval", "managed-autonomy", "draft-only"];
  if (!allowedModes.includes(clean(input.mode).toLowerCase())) blockers.push("Outreach mode must be draft-only, approval, or managed-autonomy.");
  if (!Number.isFinite(Number(input.minimumScore)) || Number(input.minimumScore) < 0 || Number(input.minimumScore) > 100) {
    blockers.push("Minimum qualification score must be between 0 and 100.");
  }
  if (!Number.isFinite(Number(input.dailySendLimit)) || Number(input.dailySendLimit) < 1) blockers.push("Daily send limit must be at least 1.");
  if (!input.requireVerifiedEmail) blockers.push("Verified email is mandatory for autonomous first-touch email.");
  if (!input.requireSuppressionCheck) blockers.push("Suppression checks cannot be disabled.");
  if (!input.humanApprovalForRisk) warnings.push("Risky or strategic accounts should remain in human approval.");
  return { ready: blockers.length === 0, blockers, warnings };
}

export function scoreCalibration(verdicts: Array<VegaCalibrationVerdict | string | null | undefined>) {
  const reviewed = verdicts.filter(Boolean).length;
  const weights: Record<string, number> = {
    GOOD: 100,
    NEEDS_RESEARCH: 45,
    WRONG_PERSON: 25,
    BAD_FIT: 0,
    WRONG_COMPANY: 0,
  };
  const points = verdicts.reduce((total, verdict) => total + (weights[String(verdict || "")] || 0), 0);
  const score = reviewed ? Math.round(points / reviewed) : 0;
  const good = verdicts.filter((verdict) => verdict === "GOOD").length;
  return { reviewed, score, good, pass: reviewed >= CALIBRATION_MINIMUM && score >= MANAGED_AUTONOMY_SCORE };
}

export function deriveOperationalReadinessState(input: {
  configurationReady: boolean;
  hardBlockers: string[];
  calibrationReviewed: number;
  calibrationTarget: number;
  calibrationScore: number;
  autonomyRequested: boolean;
}) {
  if (!input.configurationReady) return VegaOperationalReadinessState.NOT_CONFIGURED;
  if (input.hardBlockers.length) return VegaOperationalReadinessState.BLOCKED;
  if (input.calibrationReviewed < input.calibrationTarget) return VegaOperationalReadinessState.CALIBRATING;
  if (input.autonomyRequested && input.calibrationScore >= MANAGED_AUTONOMY_SCORE) {
    return VegaOperationalReadinessState.MANAGED_AUTONOMY;
  }
  return VegaOperationalReadinessState.APPROVAL_MODE;
}

function calibrationTarget(value: unknown) {
  const parsed = Number(value || CALIBRATION_MINIMUM);
  return Math.max(CALIBRATION_MINIMUM, Math.min(CALIBRATION_MAXIMUM, Number.isFinite(parsed) ? Math.round(parsed) : CALIBRATION_MINIMUM));
}

export async function getOperationalWorkspace(selector: { workspaceId?: string; workspaceSlug?: string } = {}) {
  const prisma = getPrisma();
  if (!selector.workspaceId && !selector.workspaceSlug) return getDefaultWorkspace();
  const workspaces = await prisma.workspace.findMany({ select: { id: true, slug: true, name: true } });
  const resolved = resolveOperationalTenant(selector, workspaces);
  if (!resolved) throw new Error("Operational workspace was not found.");
  return resolved;
}

async function snapshotOperationalHealth(workspaceId: string) {
  const prisma = getPrisma();
  const [ghostcrm, sender, suppressions, recentSuppressions, storedHealth] = await Promise.all([
    getGhostCrmHealth(),
    getSenderHealth({ workspaceId }),
    prisma.suppressionRecord.count({ where: { workspaceId } }),
    prisma.suppressionRecord.count({ where: { workspaceId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    prisma.integrationHealth.findMany({ where: { workspaceId }, orderBy: { checkedAt: "desc" } }),
  ]);
  const source = getSourcingStatus();
  const outreach = getOutreachStatus();
  const slack = getMissionControlBridgeStatus();
  const sourceConfigured = Boolean(source.pdlConfigured || source.apolloConfigured || source.googleMapsConfigured || source.ghostLeadAgentConfigured);
  const integrations = {
    sourceConfigured,
    providers: {
      pdl: Boolean(source.pdlConfigured),
      apollo: Boolean(source.apolloConfigured),
      googleMaps: Boolean(source.googleMapsConfigured),
      ghostLeadAgent: Boolean(source.ghostLeadAgentConfigured),
    },
    sendgridConfigured: Boolean(outreach.sendgridConfigured),
    crmConfigured: Boolean(ghostcrm.configured),
    crmReachable: Boolean(ghostcrm.reachable),
    slackConfigured: Boolean(slack.slackConfigured),
    stored: storedHealth.map((item) => ({ name: item.name, status: item.status, detail: item.detail, checkedAt: item.checkedAt })),
  };
  const health = {
    sender,
    suppression: { total: suppressions, lastSevenDays: recentSuppressions, state: recentSuppressions > 10 ? "caution" : "clear" },
  };
  return { integrations, health };
}

export async function evaluateOperationalReadiness(selector: { workspaceId?: string; workspaceSlug?: string } = {}) {
  const prisma = getPrisma();
  await ensureVegaOperationalSchema(prisma);
  const workspace = await getOperationalWorkspace(selector);
  const readiness = await prisma.vegaOperationalReadiness.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id, policyVersion: VEGA_OPERATIONAL_POLICY_VERSION },
    include: { calibrationItems: { orderBy: { createdAt: "asc" } } },
  });
  const configuration = evaluateConfigurationReadiness({
    salesProfile: record(readiness.salesProfile),
    icps: list(readiness.icps),
    offers: list(readiness.offers),
    territories: list(readiness.territories),
    qualificationRules: record(readiness.qualificationRules),
    teamResponsibilities: record(readiness.teamResponsibilities),
    outreachPolicy: record(readiness.outreachPolicy),
  });
  const policy = evaluatePolicyReadiness(record(readiness.outreachPolicy) as PolicyReadinessInput);
  const { integrations, health } = await snapshotOperationalHealth(workspace.id);
  const integration = evaluateIntegrationReadiness(integrations);
  const calibration = scoreCalibration(readiness.calibrationItems.map((item) => item.verdict));
  const hardBlockers = [
    ...integration.blockers,
    ...policy.blockers,
    ...(health.sender.mode === "stop" ? [`Sender health is STOP at ${health.sender.bounceRate}% risky events.`] : []),
  ];
  const target = calibrationTarget(readiness.calibrationTarget);
  const state = deriveOperationalReadinessState({
    configurationReady: configuration.ready,
    hardBlockers,
    calibrationReviewed: calibration.reviewed,
    calibrationTarget: target,
    calibrationScore: calibration.score,
    autonomyRequested: readiness.autonomyRequested,
  });
  const blockerSnapshot = {
    hard: configuration.ready ? hardBlockers : configuration.blockers,
    warnings: [...integration.warnings, ...policy.warnings],
  };
  const updated = await prisma.vegaOperationalReadiness.update({
    where: { id: readiness.id },
    data: {
      state,
      integrationSnapshot: integrations as unknown as Prisma.InputJsonValue,
      healthSnapshot: health as unknown as Prisma.InputJsonValue,
      blockerSnapshot: blockerSnapshot as unknown as Prisma.InputJsonValue,
      calibrationTarget: target,
      calibrationReviewed: calibration.reviewed,
      calibrationScore: calibration.score,
      lastEvaluatedAt: new Date(),
    },
    include: { calibrationItems: { orderBy: { createdAt: "asc" } } },
  });
  return { workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug }, readiness: updated, configuration, integration, policy, calibration, blockers: blockerSnapshot };
}

export async function saveOperationalConfiguration(input: {
  workspaceId?: string;
  workspaceSlug?: string;
  configuration: OperationalConfiguration;
  autonomyRequested?: boolean;
  calibrationTarget?: number;
}) {
  const prisma = getPrisma();
  await ensureVegaOperationalSchema(prisma);
  const workspace = await getOperationalWorkspace(input);
  await prisma.vegaOperationalReadiness.upsert({
    where: { workspaceId: workspace.id },
    update: {
      salesProfile: (input.configuration.salesProfile || {}) as Prisma.InputJsonValue,
      icps: (input.configuration.icps || []) as Prisma.InputJsonValue,
      offers: (input.configuration.offers || []) as Prisma.InputJsonValue,
      territories: (input.configuration.territories || []) as Prisma.InputJsonValue,
      qualificationRules: (input.configuration.qualificationRules || {}) as Prisma.InputJsonValue,
      teamResponsibilities: (input.configuration.teamResponsibilities || {}) as Prisma.InputJsonValue,
      outreachPolicy: (input.configuration.outreachPolicy || {}) as Prisma.InputJsonValue,
      autonomyRequested: Boolean(input.autonomyRequested),
      calibrationTarget: calibrationTarget(input.calibrationTarget),
      policyVersion: VEGA_OPERATIONAL_POLICY_VERSION,
    },
    create: {
      workspaceId: workspace.id,
      salesProfile: (input.configuration.salesProfile || {}) as Prisma.InputJsonValue,
      icps: (input.configuration.icps || []) as Prisma.InputJsonValue,
      offers: (input.configuration.offers || []) as Prisma.InputJsonValue,
      territories: (input.configuration.territories || []) as Prisma.InputJsonValue,
      qualificationRules: (input.configuration.qualificationRules || {}) as Prisma.InputJsonValue,
      teamResponsibilities: (input.configuration.teamResponsibilities || {}) as Prisma.InputJsonValue,
      outreachPolicy: (input.configuration.outreachPolicy || {}) as Prisma.InputJsonValue,
      autonomyRequested: Boolean(input.autonomyRequested),
      calibrationTarget: calibrationTarget(input.calibrationTarget),
      policyVersion: VEGA_OPERATIONAL_POLICY_VERSION,
    },
  });
  return evaluateOperationalReadiness({ workspaceId: workspace.id });
}

export async function startLeadCalibration(input: { workspaceId?: string; workspaceSlug?: string; target?: number }) {
  const prisma = getPrisma();
  await ensureVegaOperationalSchema(prisma);
  const workspace = await getOperationalWorkspace(input);
  const target = calibrationTarget(input.target);
  const readiness = await prisma.vegaOperationalReadiness.upsert({
    where: { workspaceId: workspace.id },
    update: { calibrationTarget: target, state: VegaOperationalReadinessState.CALIBRATING },
    create: { workspaceId: workspace.id, calibrationTarget: target, state: VegaOperationalReadinessState.CALIBRATING },
  });
  const leads = await prisma.lead.findMany({
    where: { workspaceId: workspace.id },
    include: { contact: true, company: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: target,
  });
  if (!leads.length) throw new Error("No leads are available for a dry-run calibration. Source a small batch first; no outreach will be sent.");
  await prisma.$transaction(
    leads.map((lead) => prisma.vegaCalibrationItem.upsert({
      where: { readinessId_leadId: { readinessId: readiness.id, leadId: lead.id } },
      update: { snapshot: calibrationSnapshot(lead) },
      create: { readinessId: readiness.id, workspaceId: workspace.id, leadId: lead.id, snapshot: calibrationSnapshot(lead) },
    })),
  );
  return evaluateOperationalReadiness({ workspaceId: workspace.id });
}

function calibrationSnapshot(lead: {
  id: string; name: string; companyName: string; title: string | null; niche: string; source: string; score: number;
  description: string | null; nextAction: string; contact: { email: string | null; phone: string | null } | null;
  company: { website: string | null; domain: string | null; niche: string } | null;
}) {
  return {
    leadId: lead.id,
    contactName: lead.name,
    companyName: lead.companyName,
    title: lead.title,
    niche: lead.niche,
    source: lead.source,
    score: lead.score,
    email: lead.contact?.email || "",
    phone: lead.contact?.phone || "",
    website: lead.company?.website || lead.company?.domain || "",
    industry: lead.company?.niche || lead.niche,
    evidence: lead.description || lead.nextAction,
  };
}

export async function labelCalibrationItem(input: {
  itemId: string;
  verdict: VegaCalibrationVerdict;
  notes?: string;
  reviewedBy?: string;
}) {
  const prisma = getPrisma();
  await ensureVegaOperationalSchema(prisma);
  const item = await prisma.vegaCalibrationItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("Calibration item was not found.");
  const memoryEvidence = {
    evidenceType: "operator-calibration",
    verdict: input.verdict,
    notes: clean(input.notes),
    snapshot: item.snapshot,
    policyVersion: VEGA_OPERATIONAL_POLICY_VERSION,
    recordedAt: new Date().toISOString(),
  };
  await prisma.vegaCalibrationItem.update({
    where: { id: item.id },
    data: {
      verdict: input.verdict,
      notes: clean(input.notes) || null,
      reviewedBy: clean(input.reviewedBy) || "Vega operator",
      reviewedAt: new Date(),
      memoryEvidence: memoryEvidence as unknown as Prisma.InputJsonValue,
    },
  });
  return evaluateOperationalReadiness({ workspaceId: item.workspaceId });
}

export async function getCalibrationSalesMemory(workspaceId: string) {
  const prisma = getPrisma();
  await ensureVegaOperationalSchema(prisma);
  return prisma.vegaCalibrationItem.findMany({
    where: { workspaceId, verdict: { not: null } },
    select: { verdict: true, notes: true, snapshot: true, memoryEvidence: true, reviewedAt: true },
    orderBy: { reviewedAt: "desc" },
    take: 100,
  });
}
