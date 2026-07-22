import type { SourceLead } from "@/lib/sourcing";
import { emailQualityTier, getSenderHealth, isDecisionMakerTitle, isValidBusinessEmail } from "@/lib/conversion-quality";
import { getPrisma } from "@/lib/prisma";

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

export type VegaDecisionLane = "auto-send" | "call-first" | "research" | "suppress" | "executive-review";

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

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasStrategicReviewRisk(lead: SourceLead) {
  const text = `${lead.companyName} ${lead.niche} ${lead.title} ${lead.signalSummary}`.toLowerCase();
  if (/\b(fortune\s*500|enterprise|hospital|health system|medical center|attorney|law firm|legal|bank|financial institution|government|municipal|school|university)\b/.test(text)) {
    return true;
  }
  return false;
}

export function evaluateVegaLeadDecision(lead: SourceLead, policy: OperatorRunPolicy): VegaLeadDecision {
  const reasons: string[] = [];
  const email = clean(lead.email);
  const hasPhone = Boolean(clean(lead.phone));
  const hasWebsite = Boolean(clean(lead.website));
  const hasSignal = Boolean(clean(lead.signalSummary) || lead.intentSignals?.length);
  const validEmail = isValidBusinessEmail(email);
  const emailTier = emailQualityTier(email);
  const decisionMaker = isDecisionMakerTitle(lead.title);

  const leadQuality = clampScore(Math.max(Number(lead.score || 0), hasSignal ? 78 : 0) + (decisionMaker ? 4 : 0));
  const emailConfidence = validEmail
    ? emailTier === "named-business"
      ? 98
      : emailTier === "generic"
        ? 84
        : 72
    : 0;
  const copyConfidence = clampScore(88 + (hasSignal ? 6 : -8) + (decisionMaker ? 3 : 0) - (hasStrategicReviewRisk(lead) ? 8 : 0));
  const deliverability = clampScore(
    policy.sender.mode === "clear"
      ? 96
      : policy.sender.mode === "caution"
        ? 82
        : 35,
  );
  const trustScore = clampScore((leadQuality * 0.34) + (emailConfidence * 0.26) + (copyConfidence * 0.2) + (deliverability * 0.2));

  if (!lead.companyName?.trim()) reasons.push("missing company");
  if (!lead.name?.trim()) reasons.push("unknown contact");
  if (!hasSignal) reasons.push("missing buyer signal");
  if (hasStrategicReviewRisk(lead)) reasons.push("strategic or regulated account");
  if (emailTier === "generic") reasons.push("generic inbox");
  if (policy.sender.remaining <= 0) reasons.push("sender capacity exhausted");
  if (policy.sender.mode === "stop") reasons.push("sender health stop");

  if (policy.sender.mode === "stop" || /institutional|vendor risk/i.test(lead.buyerFit || "")) {
    return { lane: "suppress", trustScore, scores: { leadQuality, emailConfidence, copyConfidence, deliverability }, reasons };
  }
  if (!validEmail) {
    return {
      lane: hasPhone || hasWebsite ? "call-first" : "research",
      trustScore,
      scores: { leadQuality, emailConfidence, copyConfidence, deliverability },
      reasons: reasons.length ? reasons : ["no verified email"],
    };
  }
  if (hasStrategicReviewRisk(lead) || trustScore >= policy.caps.executiveReviewTrustThreshold && trustScore < policy.caps.autoSendTrustThreshold) {
    return { lane: "executive-review", trustScore, scores: { leadQuality, emailConfidence, copyConfidence, deliverability }, reasons };
  }
  if (trustScore >= policy.caps.autoSendTrustThreshold && policy.sender.remaining > 0) {
    return { lane: "auto-send", trustScore, scores: { leadQuality, emailConfidence, copyConfidence, deliverability }, reasons };
  }
  return {
    lane: trustScore >= policy.caps.executiveReviewTrustThreshold ? "executive-review" : "research",
    trustScore,
    scores: { leadQuality, emailConfidence, copyConfidence, deliverability },
    reasons: reasons.length ? reasons : ["trust below auto-send threshold"],
  };
}
