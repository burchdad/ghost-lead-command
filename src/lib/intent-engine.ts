import type { IntentSignalType, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type IntentSignalInput = {
  workspaceId: string;
  campaignId?: string | null;
  leadId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  signalType: IntentSignalType;
  sourceProvider: string;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  observedAt?: Date;
  expiresAt?: Date | null;
  rawPayload?: Prisma.InputJsonValue;
  normalizedPayload?: Prisma.InputJsonValue;
  summary: string;
  confidence: number;
  intentStrength: number;
  scoreImpact?: number;
  accountLevel?: boolean;
  personLevel?: boolean;
  verified?: boolean;
  evidence?: Prisma.InputJsonValue;
  idempotencyKey: string;
};

export type IntentSignalLike = {
  signalType: IntentSignalType;
  observedAt: Date;
  expiresAt?: Date | null;
  confidence: number;
  intentStrength: number;
  scoreImpact: number;
  accountLevel?: boolean;
  personLevel?: boolean;
  verified?: boolean;
  summary: string;
  evidence?: unknown;
  sourceProvider?: string;
};

const HALF_LIFE_DAYS: Record<IntentSignalType, number> = {
  WEBSITE_VISIT: 7,
  FORM_SUBMISSION: 30,
  CONTENT_DOWNLOAD: 21,
  EMAIL_OPEN: 5,
  EMAIL_CLICK: 14,
  EMAIL_REPLY: 45,
  REPEAT_EMAIL_ENGAGEMENT: 21,
  LINKEDIN_REACTION: 10,
  LINKEDIN_COMMENT: 21,
  LINKEDIN_SHARE: 21,
  LINKEDIN_PROFILE_ENGAGEMENT: 14,
  LINKEDIN_REPEAT_ENGAGEMENT: 21,
  COMPETITOR_ENGAGEMENT: 21,
  SOCIAL_MENTION: 14,
  SOCIAL_FOLLOW: 14,
  JOB_CHANGE: 30,
  LEADERSHIP_CHANGE: 45,
  COMPANY_HIRING: 30,
  FUNDING_EVENT: 60,
  LOCATION_EXPANSION: 60,
  NEW_SERVICE_LAUNCH: 45,
  TECHNOLOGY_CHANGE: 45,
  NEGATIVE_REVIEW_PATTERN: 45,
  MISSED_CALL_REVIEW_SIGNAL: 45,
  SCHEDULING_COMPLAINT: 45,
  SLOW_RESPONSE_COMPLAINT: 45,
  WEBSITE_CONVERSION_GAP: 30,
  WEBSITE_FORM_FAILURE: 30,
  SEARCH_VISIBILITY_GAP: 30,
  GOOGLE_PROFILE_GAP: 30,
  CRM_REACTIVATION_SIGNAL: 30,
  PREVIOUS_OPPORTUNITY_REOPENED: 60,
  REFERRAL_SIGNAL: 60,
  MANUAL_OPERATOR_SIGNAL: 30,
  THIRD_PARTY_INTENT_SIGNAL: 21,
};

const BASE_IMPACT: Record<IntentSignalType, number> = {
  WEBSITE_VISIT: 6,
  FORM_SUBMISSION: 30,
  CONTENT_DOWNLOAD: 14,
  EMAIL_OPEN: 4,
  EMAIL_CLICK: 18,
  EMAIL_REPLY: 35,
  REPEAT_EMAIL_ENGAGEMENT: 18,
  LINKEDIN_REACTION: 6,
  LINKEDIN_COMMENT: 18,
  LINKEDIN_SHARE: 18,
  LINKEDIN_PROFILE_ENGAGEMENT: 14,
  LINKEDIN_REPEAT_ENGAGEMENT: 20,
  COMPETITOR_ENGAGEMENT: 16,
  SOCIAL_MENTION: 12,
  SOCIAL_FOLLOW: 8,
  JOB_CHANGE: 12,
  LEADERSHIP_CHANGE: 18,
  COMPANY_HIRING: 14,
  FUNDING_EVENT: 20,
  LOCATION_EXPANSION: 22,
  NEW_SERVICE_LAUNCH: 18,
  TECHNOLOGY_CHANGE: 16,
  NEGATIVE_REVIEW_PATTERN: 18,
  MISSED_CALL_REVIEW_SIGNAL: 22,
  SCHEDULING_COMPLAINT: 18,
  SLOW_RESPONSE_COMPLAINT: 18,
  WEBSITE_CONVERSION_GAP: 16,
  WEBSITE_FORM_FAILURE: 20,
  SEARCH_VISIBILITY_GAP: 12,
  GOOGLE_PROFILE_GAP: 10,
  CRM_REACTIVATION_SIGNAL: 20,
  PREVIOUS_OPPORTUNITY_REOPENED: 30,
  REFERRAL_SIGNAL: 28,
  MANUAL_OPERATOR_SIGNAL: 16,
  THIRD_PARTY_INTENT_SIGNAL: 14,
};

const LOW_EFFORT_SIGNALS = new Set<IntentSignalType>([
  "WEBSITE_VISIT",
  "EMAIL_OPEN",
  "LINKEDIN_REACTION",
  "SOCIAL_FOLLOW",
  "GOOGLE_PROFILE_GAP",
  "SEARCH_VISIBILITY_GAP",
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

export function signalHalfLifeDays(signalType: IntentSignalType) {
  return HALF_LIFE_DAYS[signalType] || 21;
}

export function signalExpiresAt(signalType: IntentSignalType, observedAt = new Date()) {
  const date = new Date(observedAt);
  date.setDate(date.getDate() + signalHalfLifeDays(signalType) * 3);
  return date;
}

export function decayedSignalImpact(signal: IntentSignalLike, now = new Date()) {
  if (signal.expiresAt && signal.expiresAt <= now) return 0;
  const halfLife = signalHalfLifeDays(signal.signalType);
  const age = daysBetween(signal.observedAt, now);
  const decayFactor = Math.pow(0.5, age / halfLife);
  const base = signal.scoreImpact || BASE_IMPACT[signal.signalType] || 10;
  const verifiedBoost = signal.verified ? 1.1 : 1;
  const confidence = clamp(signal.confidence, 0, 1);
  const strength = clamp(signal.intentStrength, 0, 1);
  return Math.round(base * confidence * strength * decayFactor * verifiedBoost);
}

export function scoreIntentSignals(signals: IntentSignalLike[], input: { now?: Date } = {}) {
  const now = input.now || new Date();
  const activeSignals = signals.filter((signal) => !signal.expiresAt || signal.expiresAt > now);
  const scored = activeSignals
    .map((signal) => ({ signal, impact: decayedSignalImpact(signal, now) }))
    .filter((row) => row.impact > 0)
    .sort((a, b) => b.impact - a.impact);
  const personLevelScore = scored.filter((row) => row.signal.personLevel).reduce((sum, row) => sum + row.impact, 0);
  const accountLevelScore = scored.filter((row) => row.signal.accountLevel).reduce((sum, row) => sum + row.impact, 0);
  const repeatedTypes = new Map<IntentSignalType, number>();
  for (const row of scored) {
    repeatedTypes.set(row.signal.signalType, (repeatedTypes.get(row.signal.signalType) || 0) + 1);
  }
  const repeatedSignalPattern = [...repeatedTypes.entries()]
    .filter(([, count]) => count >= 2)
    .map(([signalType, count]) => `${signalType}:${count}`);
  const lowEffortOnly = scored.length > 0 && scored.every((row) => LOW_EFFORT_SIGNALS.has(row.signal.signalType));
  const lowEffortCount = scored.filter((row) => LOW_EFFORT_SIGNALS.has(row.signal.signalType)).length;
  const weakSuppressed = lowEffortOnly && lowEffortCount < 3;
  const totalIntentScore = weakSuppressed ? Math.min(15, scored.reduce((sum, row) => sum + row.impact, 0)) : clamp(scored.reduce((sum, row) => sum + row.impact, 0), 0, 100);
  const confidence = scored.length
    ? Math.round((scored.reduce((sum, row) => sum + clamp(row.signal.confidence, 0, 1), 0) / scored.length) * 100) / 100
    : 0;
  const strongestSignals = scored.slice(0, 5).map((row) => ({
    signalType: row.signal.signalType,
    impact: row.impact,
    summary: row.signal.summary,
    sourceProvider: row.signal.sourceProvider,
  }));
  const blockers = [
    weakSuppressed ? "One or two weak engagement signals are not enough for automatic outreach." : "",
    strongestSignals.length === 0 ? "No current intent signal evidence." : "",
  ].filter(Boolean);
  const recommendedAction =
    blockers.length ? "RESEARCH_MORE" :
    totalIntentScore >= 70 ? "AUTO_EMAIL_OR_CALL" :
    totalIntentScore >= 45 ? "APPROVAL_EMAIL" :
    totalIntentScore >= 25 ? "NURTURE" :
    "RESEARCH_MORE";

  return {
    totalIntentScore,
    strongestSignals,
    repeatedSignalPattern,
    personLevelScore: clamp(personLevelScore, 0, 100),
    accountLevelScore: clamp(accountLevelScore, 0, 100),
    signalRecencyDays: scored[0] ? Math.round(daysBetween(scored[0].signal.observedAt, now) * 10) / 10 : null,
    confidence,
    recommendedAction,
    evidence: strongestSignals.map((signal) => signal.summary),
    blockers,
  };
}

export async function upsertIntentSignal(input: IntentSignalInput) {
  const prisma = getPrisma();
  const observedAt = input.observedAt || new Date();
  return prisma.intentSignal.upsert({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: input.workspaceId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    update: {
      observedAt,
      expiresAt: input.expiresAt || signalExpiresAt(input.signalType, observedAt),
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      summary: input.summary,
      confidence: clamp(input.confidence, 0, 1),
      intentStrength: clamp(input.intentStrength, 0, 1),
      scoreImpact: input.scoreImpact || BASE_IMPACT[input.signalType] || 10,
      accountLevel: Boolean(input.accountLevel),
      personLevel: Boolean(input.personLevel),
      verified: Boolean(input.verified),
      evidence: input.evidence,
    },
    create: {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId || null,
      leadId: input.leadId || null,
      companyId: input.companyId || null,
      contactId: input.contactId || null,
      signalType: input.signalType,
      sourceProvider: input.sourceProvider,
      sourceRecordId: input.sourceRecordId || null,
      sourceUrl: input.sourceUrl || null,
      observedAt,
      expiresAt: input.expiresAt || signalExpiresAt(input.signalType, observedAt),
      rawPayload: input.rawPayload,
      normalizedPayload: input.normalizedPayload,
      summary: input.summary,
      confidence: clamp(input.confidence, 0, 1),
      intentStrength: clamp(input.intentStrength, 0, 1),
      scoreImpact: input.scoreImpact || BASE_IMPACT[input.signalType] || 10,
      accountLevel: Boolean(input.accountLevel),
      personLevel: Boolean(input.personLevel),
      verified: Boolean(input.verified),
      evidence: input.evidence,
      idempotencyKey: input.idempotencyKey,
    },
  });
}

export async function scoreLeadIntent(input: { workspaceId: string; leadId?: string; companyId?: string; contactId?: string }) {
  const prisma = getPrisma();
  const signals = await prisma.intentSignal.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        input.leadId ? { leadId: input.leadId } : {},
        input.companyId ? { companyId: input.companyId } : {},
        input.contactId ? { contactId: input.contactId } : {},
      ].filter((item) => Object.keys(item).length),
    },
    orderBy: { observedAt: "desc" },
    take: 100,
  });
  return scoreIntentSignals(signals);
}
