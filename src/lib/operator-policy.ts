import type { SourceLead } from "@/lib/sourcing";
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
    maxPendingApprovals: number;
    requireEmail: boolean;
  };
  usage: {
    sourcedToday: number;
    queuedToday: number;
    pendingApprovals: number;
  };
  blockedReasons: string[];
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
    dailyQueueLimit: numberFromEnv("AGENT_DAILY_QUEUE_LIMIT", 10),
    maxPendingApprovals: numberFromEnv("AGENT_MAX_PENDING_APPROVALS", 25),
    requireEmail: boolFromEnv("AGENT_REQUIRE_EMAIL", true),
  };
}

export async function prepareOperatorRun(input: PrepareRunInput): Promise<OperatorRunPolicy> {
  const prisma = getPrisma();
  const caps = getOperatorCaps();
  const since = startOfToday();

  const [sourcedToday, queuedToday, pendingApprovals] = await Promise.all([
    prisma.lead.count({
      where: { workspaceId: input.workspaceId, createdAt: { gte: since }, source: { not: "dead crm import" } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: input.workspaceId, createdAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: input.workspaceId, status: "pending" },
    }),
  ]);

  const remainingSource = Math.max(0, caps.dailySourceLimit - sourcedToday);
  const remainingQueue = Math.max(0, caps.dailyQueueLimit - queuedToday);
  const pendingCapacity = Math.max(0, caps.maxPendingApprovals - pendingApprovals);
  const queueLimit = Math.min(input.requestedQueueLimit, remainingQueue, pendingCapacity);
  const size = Math.min(input.requestedSize, remainingSource);
  const minScore = Math.max(input.requestedMinScore, numberFromEnv("AGENT_MIN_CONTACT_SCORE", 80));
  const blockedReasons: string[] = [];

  if (remainingSource <= 0) blockedReasons.push("Daily source cap reached.");
  if (remainingQueue <= 0) blockedReasons.push("Daily outreach queue cap reached.");
  if (pendingCapacity <= 0) blockedReasons.push("Pending approval cap reached.");
  if (queueLimit <= 0) blockedReasons.push("No approval capacity remains for this run.");
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
    usage: { sourcedToday, queuedToday, pendingApprovals },
    blockedReasons,
  };
}

export async function getOperatorQueueCapacity(workspaceId: string) {
  const prisma = getPrisma();
  const caps = getOperatorCaps();
  const since = startOfToday();

  const [queuedToday, pendingApprovals] = await Promise.all([
    prisma.outreachQueueItem.count({
      where: { workspaceId, createdAt: { gte: since } },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId, status: "pending" },
    }),
  ]);

  const remainingQueue = Math.max(0, caps.dailyQueueLimit - queuedToday);
  const pendingCapacity = Math.max(0, caps.maxPendingApprovals - pendingApprovals);
  const capacity = Math.min(remainingQueue, pendingCapacity);
  const blockedReasons: string[] = [];

  if (remainingQueue <= 0) blockedReasons.push("Daily outreach queue cap reached.");
  if (pendingCapacity <= 0) blockedReasons.push("Pending approval cap reached.");

  return {
    mode: blockedReasons.length ? ("blocked" as const) : ("ready" as const),
    capacity,
    caps,
    usage: { queuedToday, pendingApprovals },
    blockedReasons,
  };
}

export function evaluateSourceLead(lead: SourceLead, policy: OperatorRunPolicy) {
  if (lead.score < policy.effective.minScore) return { ok: false as const, reason: "below-score-threshold" };
  if (!lead.companyName?.trim()) return { ok: false as const, reason: "missing-company" };
  if (!lead.name?.trim()) return { ok: false as const, reason: "missing-contact-name" };
  if (policy.caps.requireEmail && !lead.email?.trim()) return { ok: false as const, reason: "missing-email" };
  return { ok: true as const };
}
