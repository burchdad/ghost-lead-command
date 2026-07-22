import type { SourceLead } from "@/lib/sourcing";
import { getSenderHealth } from "@/lib/conversion-quality";
import { getPrisma } from "@/lib/prisma";
import {
  buildOpportunityIntelligenceFromSourceLead,
  type OpportunityIntelligence,
  type VegaDecisionLane,
} from "@/lib/vega-intelligence-fusion";

type PrepareRunInput = {
  workspaceId: string;
  requestedSize: number;
  requestedQueueLimit: number;
  requestedMinScore: number;
};

export type OperatorRunPolicy = {
  mode: "ready" | "blocked";
  requested: {
    size: number;
    queueLimit: number;
    minScore: number;
  };
  effective: {
    size: number;
    queueLimit: number;
    minScore: number;
  };
  caps: {
    dailySourceLimit: number;
    dailyQueueLimit: number;
    dailySafeSendLimit: number;
    executiveReviewLimit: number;
    autoSendTrustThreshold: number;
    executiveReviewTrustThreshold: number;
    requireEmail: boolean;
    requireBuyerSignal: boolean;
    autoSend: boolean;
  };
  usage: {
    sourcedToday: number;
    queuedToday: number;
    sentToday: number;
    executiveReviewPending: number;
  };
  sender: {
    mode: string;
    bounceRate: number;
    targetBounceRate: number;
    hardStopBounceRate: number;
    safeLimit: number;
    sentToday: number;
    remaining: number;
  };
  blockedReasons: string[];
};

export type VegaLeadDecision = {
  lane: VegaDecisionLane;
  trustScore: number;
  scores: {
    leadQuality: number;
    emailConfidence: number;
    copyConfidence: number;
    deliverability: number;
  };
  reasons: string[];
  opportunityIntelligence: OpportunityIntelligence;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(clean(process.env[name]));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean) {
  const value = clean(process.env[name]).toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getOperatorCaps() {
  return {
    dailySourceLimit: numberFromEnv("AGENT_DAILY_SOURCE_LIMIT", 50),
    dailyQueueLimit: numberFromEnv("AGENT_DAILY_QUEUE_LIMIT", numberFromEnv("VEGA_DAILY_SAFE_SEND_LIMIT", 65)),
    dailySafeSendLimit: numberFromEnv("VEGA_DAILY_SAFE_SEND_LIMIT", numberFromEnv("AGENT_DAILY_SEND_LIMIT", 65)),
    executiveReviewLimit: numberFromEnv("VEGA_EXECUTIVE_REVIEW_LIMIT", 5),
    autoSendTrustThreshold: numberFromEnv("VEGA_AUTO_SEND_TRUST_THRESHOLD", 90),
    executiveReviewTrustThreshold: numberFromEnv("VEGA_EXECUTIVE_REVIEW_TRUST_THRESHOLD", 80),
    requireEmail: boolFromEnv("AGENT_REQUIRE_EMAIL", true),
    requireBuyerSignal: boolFromEnv("AGENT_REQUIRE_BUYER_SIGNAL", true),
    autoSend: boolFromEnv("AGENT_AUTO_SEND", false),
  };
}

export async function prepareOperatorRun(input: PrepareRunInput): Promise<OperatorRunPolicy> {
  const prisma = getPrisma();
  const caps = getOperatorCaps();
  const since = startOfToday();

  const [sourcedToday, queuedToday, sentToday, executiveReviewPending, senderHealth] = await Promise.all([
    prisma.lead.count({
      where: { workspaceId: input.workspaceId, createdAt: { gte: since }, source: { not: "dead crm import" } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: input.workspaceId, createdAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: input.workspaceId, status: "sent", channel: "email", sentAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: input.workspaceId, status: "pending", reason: { contains: "Executive review", mode: "insensitive" } },
    }),
    getSenderHealth({ workspaceId: input.workspaceId }),
  ]);

  const remainingSource = Math.max(0, caps.dailySourceLimit - sourcedToday);
  const remainingQueue = Math.max(0, caps.dailyQueueLimit - queuedToday);
  const remainingSender = Math.max(0, caps.dailySafeSendLimit - sentToday);
  const queueLimit = Math.min(input.requestedQueueLimit, remainingQueue, remainingSender);
  const size = Math.min(input.requestedSize, remainingSource);
  const absoluteMinScore = numberFromEnv("AGENT_ABSOLUTE_MIN_CONTACT_SCORE", 50);
  const minScore = Math.max(input.requestedMinScore, absoluteMinScore);
  const blockedReasons: string[] = [];

  if (remainingSource <= 0) blockedReasons.push("Daily source cap reached.");
  if (remainingQueue <= 0) blockedReasons.push("Daily outreach queue cap reached.");
  if (remainingSender <= 0) blockedReasons.push("Today's safe sender capacity reached.");
  if (senderHealth.mode === "stop" && !boolFromEnv("VEGA_ALLOW_HIGH_BOUNCE_SEND", false)) {
    blockedReasons.push(`Sender governor stopped sending at ${senderHealth.bounceRate}% risky events.`);
  }
  if (queueLimit <= 0) blockedReasons.push("No safe sender capacity remains for this run.");
  if (size <= 0) blockedReasons.push("No sourcing capacity remains for this run.");

  return {
    mode: blockedReasons.length ? "blocked" : "ready",
    requested: {
      size: input.requestedSize,
      queueLimit: input.requestedQueueLimit,
      minScore: input.requestedMinScore,
    },
    effective: { size, queueLimit, minScore },
    caps,
    usage: { sourcedToday, queuedToday, sentToday, executiveReviewPending },
    sender: {
      mode: senderHealth.mode,
      bounceRate: senderHealth.bounceRate,
      targetBounceRate: senderHealth.targetBounceRate,
      hardStopBounceRate: senderHealth.hardStopBounceRate,
      safeLimit: caps.dailySafeSendLimit,
      sentToday,
      remaining: remainingSender,
    },
    blockedReasons,
  };
}

export async function getOperatorQueueCapacity(workspaceId: string) {
  const prisma = getPrisma();
  const caps = getOperatorCaps();
  const since = startOfToday();

  const [queuedToday, sentToday, executiveReviewPending, senderHealth] = await Promise.all([
    prisma.outreachQueueItem.count({
      where: { workspaceId, createdAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId, status: "sent", channel: "email", sentAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId, status: "pending", reason: { contains: "Executive review", mode: "insensitive" } },
    }),
    getSenderHealth({ workspaceId }),
  ]);

  const remainingQueue = Math.max(0, caps.dailyQueueLimit - queuedToday);
  const remainingSender = Math.max(0, caps.dailySafeSendLimit - sentToday);
  const capacity = Math.min(remainingQueue, remainingSender);
  const blockedReasons: string[] = [];

  if (remainingQueue <= 0) blockedReasons.push("Daily outreach queue cap reached.");
  if (remainingSender <= 0) blockedReasons.push("Today's safe sender capacity reached.");
  if (senderHealth.mode === "stop" && !boolFromEnv("VEGA_ALLOW_HIGH_BOUNCE_SEND", false)) {
    blockedReasons.push(`Sender governor stopped sending at ${senderHealth.bounceRate}% risky events.`);
  }

  return {
    mode: blockedReasons.length ? ("blocked" as const) : ("ready" as const),
    capacity,
    caps,
    usage: { queuedToday, sentToday, executiveReviewPending },
    sender: {
      mode: senderHealth.mode,
      bounceRate: senderHealth.bounceRate,
      targetBounceRate: senderHealth.targetBounceRate,
      hardStopBounceRate: senderHealth.hardStopBounceRate,
      safeLimit: caps.dailySafeSendLimit,
      sentToday,
      remaining: remainingSender,
    },
    blockedReasons,
  };
}

export function evaluateSourceLead(lead: SourceLead, policy: OperatorRunPolicy) {
  if (lead.score < policy.effective.minScore) return { ok: false as const, reason: "below-score-threshold" };
  if (!lead.companyName?.trim()) return { ok: false as const, reason: "missing-company" };
  if (!lead.name?.trim()) return { ok: false as const, reason: "missing-contact-name" };
  if (policy.caps.requireEmail && !lead.email?.trim()) return { ok: false as const, reason: "missing-email" };
  if (policy.caps.requireBuyerSignal && !lead.signalSummary?.trim() && !lead.intentSignals?.length) {
    return { ok: false as const, reason: "missing-buyer-signal" };
  }
  return { ok: true as const };
}

export function evaluateVegaLeadDecision(lead: SourceLead, policy: OperatorRunPolicy): VegaLeadDecision {
  const intelligence = buildOpportunityIntelligenceFromSourceLead({
    lead,
    policy: {
      minScore: policy.effective.minScore,
      autoSendTrustThreshold: policy.caps.autoSendTrustThreshold,
      executiveReviewTrustThreshold: policy.caps.executiveReviewTrustThreshold,
      senderMode: policy.sender.mode,
      senderRemaining: policy.sender.remaining,
      senderBounceRate: policy.sender.bounceRate,
      workspaceAllowsAutoEmail: true,
      campaignAllowsAutoEmail: true,
    },
  });
  return {
    lane: intelligence.decisionLane,
    trustScore: intelligence.trustScore,
    scores: {
      leadQuality: intelligence.leadScore,
      emailConfidence: intelligence.contactConfidence,
      copyConfidence: intelligence.messageQuality,
      deliverability: intelligence.senderHealth,
    },
    reasons: intelligence.explanation.blockers.length
      ? intelligence.explanation.blockers
      : intelligence.explanation.evidence,
    opportunityIntelligence: intelligence,
  };
}
