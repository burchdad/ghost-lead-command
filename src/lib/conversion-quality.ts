import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getSenderHealth as getNormalizedSenderHealth } from "@/lib/sender-health";

type QueueItemForQuality = Prisma.OutreachQueueItemGetPayload<{
  include: { lead: { include: { contact: true; company: true } } };
}>;

type LeadForOpportunity = Prisma.LeadGetPayload<{
  include: { contact: true; company: true; opportunities: true };
}>;

function clean(value: unknown) {
  return String(value || "").trim();
}

function numberFromEnv(name: string, fallback: number) {
  const raw = clean(process.env[name]);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return fallback > 0 ? (value > 0 ? value : fallback) : Math.max(0, value);
}

function boolFromEnv(name: string, fallback: boolean) {
  const value = clean(process.env[name]).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function isValidBusinessEmail(email?: string | null) {
  const value = clean(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  if (/\.\.|[<>(),;:"[\]\\]/.test(value)) return false;
  const domain = value.split("@")[1] || "";
  if (!domain || domain.startsWith("-") || domain.endsWith("-")) return false;
  if (["example.com", "test.com", "localhost"].includes(domain)) return false;
  return true;
}

export function isDecisionMakerTitle(title?: string | null) {
  const value = clean(title).toLowerCase();
  if (!value) return false;
  return /\b(owner|founder|ceo|president|principal|partner|chief|director|vp|vice president|head of|operations|marketing|growth|revenue|general manager|office manager|practice manager)\b/.test(value);
}

export function isRiskyEmailDomain(email?: string | null) {
  const domain = clean(email).toLowerCase().split("@").pop() || "";
  return /^(gmail|yahoo|hotmail|outlook|aol|icloud|proton|mail)\.com$/.test(domain);
}

export function isGenericRoleEmail(email?: string | null) {
  const local = clean(email).toLowerCase().split("@")[0] || "";
  return /^(info|contact|hello|sales|support|admin|office|service|customerservice|team|webmaster|marketing|billing|careers|jobs|hr)$/.test(local);
}

export function emailQualityTier(email?: string | null) {
  if (!isValidBusinessEmail(email)) return "invalid" as const;
  if (isRiskyEmailDomain(email)) return "personal" as const;
  if (isGenericRoleEmail(email)) return "generic" as const;
  return "named-business" as const;
}

export async function getSenderHealth(input: { workspaceId?: string; days?: number } = {}) {
  return getNormalizedSenderHealth(input);
}

export async function evaluateQueueItemForConversionSend(item: QueueItemForQuality) {
  const health = await getSenderHealth({ workspaceId: item.workspaceId });
  const email = item.lead?.contact?.email || "";
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (item.channel !== "email") return { ok: true, health, reasons, warnings };
  if (!isValidBusinessEmail(email)) reasons.push("Missing or invalid business email.");
  const tier = emailQualityTier(email);
  const leadScore = Number(item.lead?.score || 0);
  if (!isDecisionMakerTitle(item.lead?.title || item.lead?.contact?.title || item.lead?.contact?.role)) {
    warnings.push("Buyer title is not clearly decision-maker level.");
  }
  if (tier === "personal") warnings.push("Personal/free email domain; verify before scaling.");
  if (tier === "generic") {
    warnings.push("Generic role inbox; named buyer email is preferred for auto-send.");
    if (health.mode !== "healthy" || leadScore < numberFromEnv("VEGA_GENERIC_EMAIL_MIN_SCORE", 90)) {
      reasons.push("Generic role inbox needs manual review or named-buyer enrichment before auto email.");
    }
  }
  if (health.mode === "stop" && !boolFromEnv("VEGA_ALLOW_HIGH_BOUNCE_SEND", false)) {
    reasons.push(`Sender health STOP: ${health.providerFailureRate}% provider failure rate across ${health.uniqueSendsEvaluated} unique messages.`);
  }
  if (health.mode === "recovery" || health.mode === "restricted") {
    reasons.push(`Sender recovery required: ${health.providerFailureRate}% provider failure rate. Broad first-touch email is paused.`);
  }

  return {
    ok: reasons.length === 0,
    health,
    reasons,
    warnings,
  };
}

export async function ensureConfirmedOpportunity(input: {
  lead: LeadForOpportunity;
  classification: string;
  replyBody?: string;
}) {
  if (!["hot", "booked", "objection"].includes(input.classification)) {
    return { created: false, updated: false, opportunity: input.lead.opportunities[0] || null };
  }

  const prisma = getPrisma();
  const companyId = input.lead.companyId || input.lead.company?.id;
  if (!companyId) return { created: false, updated: false, opportunity: null };

  const existing = input.lead.opportunities[0] || await prisma.opportunity.findFirst({
    where: { leadId: input.lead.id },
    orderBy: { updatedAt: "desc" },
  });

  const title = `Confirmed opportunity: ${input.lead.companyName}`;
  const stage = input.classification === "booked" ? "Booking Requested" : "Confirmed Opportunity";
  const probability = input.classification === "booked" ? 70 : input.classification === "hot" ? 55 : 40;
  const value = Math.max(input.lead.value || 0, 3500);

  if (existing) {
    const opportunity = await prisma.opportunity.update({
      where: { id: existing.id },
      data: {
        title: existing.title || title,
        stage: ["Won", "Proposal Sent"].includes(existing.stage) ? existing.stage : stage,
        probability: Math.max(existing.probability, probability),
        value: Math.max(existing.value, value),
      },
    });
    return { created: false, updated: true, opportunity };
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      companyId,
      leadId: input.lead.id,
      title,
      stage,
      probability,
      value,
    },
  });

  return { created: true, updated: false, opportunity };
}
