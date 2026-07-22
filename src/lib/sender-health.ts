import { SendGridMessageOutcomeStatus, type Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { scoreSourceQuality } from "@/lib/source-quality-v2";
import { addSuppressionRecord } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

export type SenderGovernorMode = "insufficient_data" | "healthy" | "caution" | "restricted" | "recovery" | "stop";

export type NormalizedSendGridEvent = {
  providerEventId?: string | null;
  providerMessageId: string;
  eventType: string;
  email?: string | null;
  reason?: string | null;
  response?: string | null;
  timestamp?: number | null;
  rawPayload?: Record<string, unknown>;
};

export type SenderHealthScope = {
  workspaceId?: string;
  campaignName?: string | null;
  senderEmail?: string | null;
  senderDomain?: string | null;
  sendingIdentity?: string | null;
  provider?: string | null;
  sourceProvider?: string | null;
  days?: number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function numberFromEnv(name: string, fallback: number) {
  const raw = clean(process.env[name]);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean) {
  const value = clean(process.env[name]).toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function startOfWindow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, days));
  return date;
}

function pct(count: number, denominator: number) {
  return denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
}

function senderDomain(email?: string | null) {
  return clean(email).toLowerCase().split("@")[1] || "";
}

function isValidBusinessEmail(email?: string | null) {
  const value = clean(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return false;
  if (/\.\.|[<>(),;:"[\]\\]/.test(value)) return false;
  const domain = value.split("@")[1] || "";
  if (!domain || domain.startsWith("-") || domain.endsWith("-")) return false;
  if (["example.com", "test.com", "localhost"].includes(domain)) return false;
  return true;
}

function isGenericRoleEmail(email?: string | null) {
  const local = clean(email).toLowerCase().split("@")[0] || "";
  return /^(info|contact|hello|sales|support|admin|office|service|customerservice|team|webmaster|marketing|billing|careers|jobs|hr)$/.test(local);
}

function emailQualityTier(email?: string | null) {
  if (!isValidBusinessEmail(email)) return "invalid";
  const domain = senderDomain(email);
  if (/^(gmail|yahoo|hotmail|outlook|aol|icloud|proton|mail)\.com$/.test(domain)) return "personal";
  if (isGenericRoleEmail(email)) return "generic";
  return "named-business";
}

function campaignNameFromLead(lead?: { customFields: Prisma.JsonValue | null; source: string; niche: string } | null) {
  const fields = lead?.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
    ? lead.customFields as Record<string, unknown>
    : {};
  return clean(fields.campaignName) || `${lead?.source || "Unknown source"} - ${lead?.niche || "Unknown niche"}`;
}

export function normalizeSendGridOutcome(input: { eventType?: string | null; reason?: string | null; response?: string | null }) {
  const event = clean(input.eventType).toLowerCase();
  const detail = `${input.reason || ""} ${input.response || ""}`.toLowerCase();
  if (event === "delivered") return SendGridMessageOutcomeStatus.DELIVERED;
  if (event === "processed") return SendGridMessageOutcomeStatus.PROCESSED;
  if (event === "deferred") return SendGridMessageOutcomeStatus.DEFERRED;
  if (event === "spamreport") return SendGridMessageOutcomeStatus.SPAM_COMPLAINT;
  if (event === "unsubscribe" || event === "group_unsubscribe") return SendGridMessageOutcomeStatus.UNSUBSCRIBED;
  if (event === "dropped") {
    return /block|blocked|policy|reputation|spam|denied|reject/.test(detail)
      ? SendGridMessageOutcomeStatus.BLOCKED
      : SendGridMessageOutcomeStatus.DROPPED;
  }
  if (event === "bounce") {
    return /soft|temporary|temporar|mailbox full|try again|defer|timeout|greylist|4\.\d\.\d/.test(detail)
      ? SendGridMessageOutcomeStatus.SOFT_BOUNCE
      : SendGridMessageOutcomeStatus.HARD_BOUNCE;
  }
  return SendGridMessageOutcomeStatus.UNKNOWN;
}

function outcomeSeverity(outcome: SendGridMessageOutcomeStatus) {
  if (outcome === "SPAM_COMPLAINT") return 100;
  if (outcome === "HARD_BOUNCE" || outcome === "DROPPED") return 80;
  if (outcome === "BLOCKED") return 70;
  if (outcome === "SOFT_BOUNCE") return 35;
  if (outcome === "UNSUBSCRIBED") return 20;
  if (outcome === "DEFERRED") return 10;
  if (outcome === "DELIVERED") return 0;
  return 5;
}

function isFinalOutcome(outcome: SendGridMessageOutcomeStatus) {
  return !["PROCESSED", "DEFERRED", "UNKNOWN"].includes(outcome);
}

function dominantOutcome(outcomes: SendGridMessageOutcomeStatus[], input: { deferredResolutionHours?: number; lastEventAt?: Date | null } = {}) {
  const rank = [
    SendGridMessageOutcomeStatus.SPAM_COMPLAINT,
    SendGridMessageOutcomeStatus.HARD_BOUNCE,
    SendGridMessageOutcomeStatus.DROPPED,
    SendGridMessageOutcomeStatus.BLOCKED,
    SendGridMessageOutcomeStatus.UNSUBSCRIBED,
    SendGridMessageOutcomeStatus.DELIVERED,
    SendGridMessageOutcomeStatus.SOFT_BOUNCE,
    SendGridMessageOutcomeStatus.DEFERRED,
    SendGridMessageOutcomeStatus.PROCESSED,
    SendGridMessageOutcomeStatus.UNKNOWN,
  ];
  const selected = rank.find((candidate) => outcomes.includes(candidate)) || SendGridMessageOutcomeStatus.UNKNOWN;
  if (selected === SendGridMessageOutcomeStatus.DEFERRED) {
    const hours = input.deferredResolutionHours ?? numberFromEnv("VEGA_DEFERRED_RESOLUTION_HOURS", 48);
    const last = input.lastEventAt?.getTime() || Date.now();
    if (Date.now() - last > hours * 60 * 60 * 1000) return SendGridMessageOutcomeStatus.SOFT_BOUNCE;
  }
  return selected;
}

export function reconcileSendGridEvents(events: NormalizedSendGridEvent[]) {
  const groups = new Map<string, NormalizedSendGridEvent[]>();
  for (const event of events) {
    const messageId = clean(event.providerMessageId);
    if (!messageId) continue;
    groups.set(messageId, [...(groups.get(messageId) || []), event]);
  }
  return Array.from(groups.entries()).map(([providerMessageId, group]) => {
    const sorted = group.sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    const outcomes = sorted.map((event) => normalizeSendGridOutcome(event));
    const lastEventAt = sorted.at(-1)?.timestamp ? new Date(Number(sorted.at(-1)?.timestamp) * 1000) : new Date();
    const finalOutcome = dominantOutcome(outcomes, { lastEventAt });
    return {
      providerMessageId,
      finalOutcome,
      final: isFinalOutcome(finalOutcome),
      severity: outcomeSeverity(finalOutcome),
      eventCount: sorted.length,
      firstEventAt: sorted[0]?.timestamp ? new Date(Number(sorted[0].timestamp) * 1000) : null,
      lastEventAt,
      lastEventType: clean(sorted.at(-1)?.eventType).toLowerCase() || null,
      rawEvents: sorted.map((event) => event.rawPayload || event),
      recipientEmail: sorted.find((event) => clean(event.email))?.email || null,
    };
  });
}

function healthWhere(input: SenderHealthScope & { workspaceId: string; since: Date }): Prisma.SendGridMessageOutcomeWhereInput {
  return {
    workspaceId: input.workspaceId,
    provider: clean(input.provider) || "sendgrid",
    lastEventAt: { gte: input.since },
    ...(clean(input.senderEmail) ? { senderEmail: clean(input.senderEmail).toLowerCase() } : {}),
    ...(clean(input.senderDomain) ? { senderDomain: clean(input.senderDomain).toLowerCase() } : {}),
    ...(clean(input.sendingIdentity) ? { sendingIdentity: clean(input.sendingIdentity).toLowerCase() } : {}),
    ...(clean(input.campaignName) ? { campaignName: clean(input.campaignName) } : {}),
    ...(clean(input.sourceProvider) ? { sourceProvider: clean(input.sourceProvider) } : {}),
  };
}

export function classifySenderHealth(input: {
  evaluated: number;
  hardBounceRate: number;
  softBounceRate: number;
  droppedRate: number;
  blockedRate: number;
  complaintRate: number;
}) {
  const min = numberFromEnv("VEGA_SENDER_MIN_SAMPLE", 10);
  const full = numberFromEnv("VEGA_SENDER_FULL_SAMPLE", 25);
  const target = numberFromEnv("VEGA_TARGET_BOUNCE_RATE", 3);
  const hardStop = numberFromEnv("VEGA_HARD_STOP_BOUNCE_RATE", 8);
  const failureRate = input.hardBounceRate + input.droppedRate + input.blockedRate;
  if (input.complaintRate > 0) return "stop" as SenderGovernorMode;
  if (input.evaluated < min) return "insufficient_data" as SenderGovernorMode;
  if (failureRate >= hardStop) return "stop" as SenderGovernorMode;
  if (input.evaluated < full && failureRate >= target) return "recovery" as SenderGovernorMode;
  if (failureRate >= target * 2) return "recovery" as SenderGovernorMode;
  if (failureRate >= target) return "restricted" as SenderGovernorMode;
  if (input.softBounceRate >= target * 2) return "caution" as SenderGovernorMode;
  return "healthy" as SenderGovernorMode;
}

export async function recordSendGridEvent(input: {
  workspaceId: string;
  leadId?: string | null;
  event: NormalizedSendGridEvent;
}) {
  const prisma = getPrisma();
  const eventType = clean(input.event.eventType).toLowerCase();
  const providerMessageId = clean(input.event.providerMessageId);
  if (!providerMessageId) return { recorded: false as const, reason: "missing-provider-message-id" };

  const providerEventId =
    clean(input.event.providerEventId) ||
    `${providerMessageId}:${eventType}:${input.event.timestamp || "no-ts"}:${clean(input.event.email).toLowerCase()}`;
  const eventTimestamp = input.event.timestamp ? new Date(Number(input.event.timestamp) * 1000) : new Date();

  const existing = await prisma.sendGridEventLog.findUnique({
    where: {
      workspaceId_provider_providerEventId: {
        workspaceId: input.workspaceId,
        provider: "sendgrid",
        providerEventId,
      },
    },
  });
  if (existing) return { recorded: false as const, reason: "duplicate-event", providerMessageId };

  await prisma.sendGridEventLog.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: input.leadId || null,
      provider: "sendgrid",
      providerEventId,
      providerMessageId,
      eventType,
      eventTimestamp,
      payload: (input.event.rawPayload || input.event) as Prisma.InputJsonValue,
    },
  });

  const logs = await prisma.sendGridEventLog.findMany({
    where: { workspaceId: input.workspaceId, provider: "sendgrid", providerMessageId },
    orderBy: { eventTimestamp: "asc" },
  });
  const [derived] = reconcileSendGridEvents(logs.map((log) => ({
    providerEventId: log.providerEventId,
    providerMessageId: log.providerMessageId,
    eventType: log.eventType,
    timestamp: log.eventTimestamp ? Math.floor(log.eventTimestamp.getTime() / 1000) : null,
    rawPayload: log.payload as Record<string, unknown>,
  })));
  if (!derived) return { recorded: true as const, reason: "event-only", providerMessageId };

  const lead = input.leadId
    ? await prisma.lead.findUnique({ where: { id: input.leadId }, include: { contact: true } })
    : null;
  const senderEmail = clean(process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM).toLowerCase();

  const outcome = await prisma.sendGridMessageOutcome.upsert({
    where: {
      workspaceId_provider_providerMessageId: {
        workspaceId: input.workspaceId,
        provider: "sendgrid",
        providerMessageId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      leadId: input.leadId || null,
      provider: "sendgrid",
      providerMessageId,
      senderEmail: senderEmail || null,
      senderDomain: senderDomain(senderEmail) || null,
      sendingIdentity: senderEmail || senderDomain(senderEmail) || "sendgrid",
      sourceProvider: lead?.source || null,
      campaignName: campaignNameFromLead(lead),
      recipientEmail: clean(input.event.email).toLowerCase() || lead?.contact?.email || null,
      finalOutcome: derived.finalOutcome,
      final: derived.final,
      severity: derived.severity,
      lastEventType: derived.lastEventType,
      firstEventAt: derived.firstEventAt,
      lastEventAt: derived.lastEventAt,
      eventCount: derived.eventCount,
      rawEvents: derived.rawEvents as Prisma.InputJsonValue,
    },
    update: {
      leadId: input.leadId || undefined,
      senderEmail: senderEmail || undefined,
      senderDomain: senderDomain(senderEmail) || undefined,
      sendingIdentity: senderEmail || senderDomain(senderEmail) || "sendgrid",
      sourceProvider: lead?.source || undefined,
      campaignName: campaignNameFromLead(lead),
      recipientEmail: clean(input.event.email).toLowerCase() || lead?.contact?.email || undefined,
      finalOutcome: derived.finalOutcome,
      final: derived.final,
      severity: derived.severity,
      lastEventType: derived.lastEventType,
      firstEventAt: derived.firstEventAt,
      lastEventAt: derived.lastEventAt,
      eventCount: derived.eventCount,
      rawEvents: derived.rawEvents as Prisma.InputJsonValue,
    },
  });

  return { recorded: true as const, providerMessageId, outcome };
}

export async function getSenderHealth(input: SenderHealthScope = {}) {
  const workspace = input.workspaceId ? { id: input.workspaceId } : await getDefaultWorkspace();
  const days = input.days || numberFromEnv("VEGA_SENDER_HEALTH_WINDOW_DAYS", 7);
  const since = startOfWindow(days);
  const prisma = getPrisma();
  const where = healthWhere({ ...input, workspaceId: workspace.id, since });
  const outcomes = await prisma.sendGridMessageOutcome.findMany({ where, take: 5000 });
  const count = (status: SendGridMessageOutcomeStatus) => outcomes.filter((item) => item.finalOutcome === status).length;
  const delivered = count("DELIVERED");
  const hardBounced = count("HARD_BOUNCE");
  const softBounced = count("SOFT_BOUNCE");
  const dropped = count("DROPPED");
  const blocked = count("BLOCKED");
  const complaints = count("SPAM_COMPLAINT");
  const unsubscribes = count("UNSUBSCRIBED");
  const deferredPending = count("DEFERRED");
  const unknownFinalState = count("UNKNOWN") + count("PROCESSED");
  const uniqueSendsEvaluated = outcomes.filter((item) => item.final && item.finalOutcome !== "UNSUBSCRIBED").length;
  const providerFailures = hardBounced + dropped + blocked;
  const hardBounceRate = pct(hardBounced, uniqueSendsEvaluated);
  const softBounceRate = pct(softBounced, uniqueSendsEvaluated);
  const droppedRate = pct(dropped, uniqueSendsEvaluated);
  const blockedRate = pct(blocked, uniqueSendsEvaluated);
  const complaintRate = pct(complaints, Math.max(uniqueSendsEvaluated, complaints));
  const unsubscribeRate = pct(unsubscribes, Math.max(uniqueSendsEvaluated, unsubscribes));
  const providerFailureRate = pct(providerFailures, uniqueSendsEvaluated);
  const deliveredRate = pct(delivered, uniqueSendsEvaluated);
  const mode = classifySenderHealth({ evaluated: uniqueSendsEvaluated, hardBounceRate, softBounceRate, droppedRate, blockedRate, complaintRate });
  const sampleConfidence = uniqueSendsEvaluated >= numberFromEnv("VEGA_SENDER_FULL_SAMPLE", 25)
    ? "High"
    : uniqueSendsEvaluated >= numberFromEnv("VEGA_SENDER_MIN_SAMPLE", 10)
      ? "Medium"
      : "Low";

  return {
    mode,
    state: mode.toUpperCase(),
    scope: {
      workspaceId: workspace.id,
      campaignName: input.campaignName || null,
      senderEmail: input.senderEmail || null,
      senderDomain: input.senderDomain || null,
      sendingIdentity: input.sendingIdentity || null,
      provider: input.provider || "sendgrid",
      sourceProvider: input.sourceProvider || null,
      days,
    },
    uniqueSendsEvaluated,
    observedVolume: uniqueSendsEvaluated || outcomes.length || 1,
    delivered,
    hardBounced,
    softBounced,
    dropped,
    blocked,
    complaints,
    unsubscribes,
    deferredPending,
    unknownFinalState,
    providerFailures,
    deliveredRate,
    hardBounceRate,
    softBounceRate,
    droppedRate,
    blockedRate,
    complaintRate,
    unsubscribeRate,
    providerFailureRate,
    bounceRate: providerFailureRate,
    risky: providerFailures + complaints,
    targetBounceRate: numberFromEnv("VEGA_TARGET_BOUNCE_RATE", 3),
    hardStopBounceRate: numberFromEnv("VEGA_HARD_STOP_BOUNCE_RATE", 8),
    sampleConfidence,
    canScale: mode === "healthy",
    canSendBroadFirstTouch: ["healthy", "caution"].includes(mode),
    canSendRecoveryBatch: ["insufficient_data", "recovery", "stop", "restricted", "caution"].includes(mode),
  };
}

export async function getMostRestrictiveSenderHealth(scopes: SenderHealthScope[]) {
  const states: SenderGovernorMode[] = ["healthy", "insufficient_data", "caution", "restricted", "recovery", "stop"];
  const health = await Promise.all(scopes.map((scope) => getSenderHealth(scope)));
  return health.sort((a, b) => states.indexOf(b.mode) - states.indexOf(a.mode))[0] || getSenderHealth(scopes[0] || {});
}

export async function buildSenderRecoveryPlan(input: SenderHealthScope & { limit?: number } = {}) {
  const workspace = input.workspaceId ? { id: input.workspaceId } : await getDefaultWorkspace();
  const prisma = getPrisma();
  const health = await getSenderHealth({ ...input, workspaceId: workspace.id });
  const failedOutcomes = await prisma.sendGridMessageOutcome.findMany({
    where: {
      workspaceId: workspace.id,
      finalOutcome: { in: ["HARD_BOUNCE", "DROPPED", "BLOCKED"] },
      recipientEmail: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { lead: { include: { contact: true } } },
  });
  const pendingEmail = await prisma.outreachQueueItem.findMany({
    where: {
      workspaceId: workspace.id,
      status: "pending",
      channel: "email",
      lead: { is: { contact: { is: { email: { not: null } } } } },
    },
    orderBy: [{ lead: { score: "desc" } }, { createdAt: "asc" }],
    take: 200,
    include: { lead: { include: { contact: true } } },
  });
  const failedEmails = new Set(failedOutcomes.map((item) => clean(item.recipientEmail).toLowerCase()).filter(Boolean));
  const recoveryLimit = Math.min(5, Math.max(3, Number(input.limit || process.env.VEGA_RECOVERY_BATCH_LIMIT || 4)));
  const recoveryCandidates = pendingEmail
    .filter((item) => {
      const email = clean(item.lead?.contact?.email).toLowerCase();
      if (!email || failedEmails.has(email)) return false;
      if (!isValidBusinessEmail(email)) return false;
      if (isGenericRoleEmail(email) && !boolFromEnv("VEGA_RECOVERY_ALLOW_GENERIC_EMAILS", false)) return false;
      return emailQualityTier(email) === "named-business";
    })
    .slice(0, recoveryLimit)
    .map((item) => ({ queueItemId: item.id, leadId: item.leadId, companyName: item.lead?.companyName || "Unknown", email: item.lead?.contact?.email || "" }));
  const callFirstCandidates = pendingEmail
    .filter((item) => item.lead?.contact?.phone)
    .slice(0, 25)
    .map((item) => ({ queueItemId: item.id, leadId: item.leadId, companyName: item.lead?.companyName || "Unknown", phone: item.lead?.contact?.phone || "" }));

  return {
    health,
    heldPipeline: {
      emailQualifiedHeld: pendingEmail.length,
      recoveryVerified: recoveryCandidates.length,
      callFirst: callFirstCandidates.length,
      research: Math.max(0, pendingEmail.length - recoveryCandidates.length - callFirstCandidates.length),
      suppressed: failedOutcomes.length,
    },
    failedContacts: failedOutcomes.map((item) => ({
      email: item.recipientEmail || "",
      leadId: item.leadId,
      companyName: item.lead?.companyName || "Unknown",
      outcome: item.finalOutcome,
    })),
    recoveryCandidates,
    callFirstCandidates,
    recommendedActions: [
      failedOutcomes.length ? `Suppress ${failedOutcomes.length} hard-failed contacts/domains.` : "",
      pendingEmail.length ? `Reverify ${Math.max(0, pendingEmail.length - recoveryCandidates.length)} held email addresses.` : "",
      recoveryCandidates.length ? `Build a controlled ${recoveryCandidates.length}-email recovery batch.` : "",
      callFirstCandidates.length ? `Work ${Math.min(12, callFirstCandidates.length)} highest-priority phone tasks.` : "",
      "Wait for final SendGrid outcomes before increasing volume.",
    ].filter(Boolean),
  };
}

export async function suppressFailedSendGridContacts(input: SenderHealthScope = {}) {
  const workspace = input.workspaceId ? { id: input.workspaceId } : await getDefaultWorkspace();
  const prisma = getPrisma();
  const failed = await prisma.sendGridMessageOutcome.findMany({
    where: {
      workspaceId: workspace.id,
      finalOutcome: { in: ["HARD_BOUNCE", "DROPPED"] },
      recipientEmail: { not: null },
    },
    take: 250,
  });
  let added = 0;
  for (const item of failed) {
    if (!item.recipientEmail) continue;
    const result = await addSuppressionRecord({
      type: "email",
      value: item.recipientEmail,
      reason: `SendGrid final outcome ${item.finalOutcome}`,
      source: "sender-recovery",
    }).catch(() => null);
    if (result) added += 1;
  }
  return { reviewed: failed.length, suppressed: added };
}

export async function recalculateSourceQualityFromOutcomes(input: { workspaceId: string }) {
  const prisma = getPrisma();
  const outcomes = await prisma.sendGridMessageOutcome.findMany({
    where: { workspaceId: input.workspaceId },
    include: { lead: true },
    take: 5000,
  });
  const groups = new Map<string, typeof outcomes>();
  for (const outcome of outcomes) {
    const key = `${outcome.sourceProvider || outcome.lead?.source || "unknown"}:${outcome.campaignName || "all"}`;
    groups.set(key, [...(groups.get(key) || []), outcome]);
  }
  const updates = [];
  for (const [key, rows] of groups) {
    const [provider, segment] = key.split(":");
    const delivered = rows.filter((row) => row.finalOutcome === "DELIVERED").length;
    const hardBounced = rows.filter((row) => row.finalOutcome === "HARD_BOUNCE").length;
    const droppedBlocked = rows.filter((row) => ["DROPPED", "BLOCKED"].includes(row.finalOutcome)).length;
    const source = scoreSourceQuality({
      recordsReturned: rows.length,
      validBusinessCount: rows.length,
      verifiedEmailCount: rows.filter((row) => row.recipientEmail).length,
      phoneAvailableCount: 0,
      decisionMakerCount: 0,
      sentCount: rows.length,
      deliveredCount: delivered,
      hardBounceCount: hardBounced + droppedBlocked,
      replyCount: 0,
      reachedContactCount: 0,
      conversationCount: 0,
      meetingCount: 0,
    });
    const profileData = {
      recordsReturned: rows.length,
      verifiedEmailRate: pct(rows.filter((row) => row.recipientEmail).length, rows.length),
      deliveredRate: source.deliveredRate,
      hardBounceRate: source.hardBounceRate,
      score: source.score,
      state: source.state,
      sampleSize: source.sampleSize,
    };
    const existing = await prisma.sourceQualityProfile.findFirst({
      where: {
        workspaceId: input.workspaceId,
        provider,
        sourceType: "sendgrid-outcomes",
        segment,
        campaignId: null,
      },
    });
    const profile = existing
      ? await prisma.sourceQualityProfile.update({
          where: { id: existing.id },
          data: { ...profileData, refreshedAt: new Date() },
        })
      : await prisma.sourceQualityProfile.create({
          data: {
            workspaceId: input.workspaceId,
            provider,
            sourceType: "sendgrid-outcomes",
            segment,
            ...profileData,
          },
        });
    updates.push(profile);
  }
  return { updated: updates.length };
}
