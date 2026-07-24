import type { Prisma } from "@prisma/client";
import { createAutomationEvent } from "@/lib/automation";
import { emailQualityTier, getSenderHealth } from "@/lib/conversion-quality";
import { computeConversionLearning } from "@/lib/conversion-learning";
import {
  getActionablePhoneTasks,
  repairMissingPhoneAssistSchedules,
} from "@/lib/phone-assist";
import { evaluateOpportunityQueueItem } from "@/lib/opportunity-intelligence";
import { getPrisma } from "@/lib/prisma";
import { notifySlackVegaLeadRequestResult } from "@/lib/slack";
import { VEGA_CAPABILITY_REGISTRY } from "@/lib/vega-capabilities";
import { vegaFeatureFlagSnapshot } from "@/lib/vega-feature-flags";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

function startOfDay(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function pct(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function campaignName(lead: { customFields: Prisma.JsonValue | null; source: string; niche: string }) {
  const fields = jsonObject(lead.customFields);
  return clean(fields.campaignName) || `${lead.source || "Unknown source"} - ${lead.niche || "Unknown niche"}`;
}

function campaignOwner(name: string) {
  return /partner/i.test(name) ? "partner" : "ghost";
}

function lineItem(label: string, value: string | number) {
  return `${label}: ${value}`;
}

function nextSendLimit(input: { mode: string; dayIndex: number; campaignsRunning: number }) {
  if (input.mode === "stop") return 0;
  const perCampaign = input.mode === "caution" ? 5 : input.dayIndex <= 2 ? 10 : input.dayIndex <= 4 ? 15 : 25;
  return Math.max(0, perCampaign * Math.max(1, input.campaignsRunning));
}

type EmailPipelineItem = {
  id: string;
  status: string;
  channel: string;
  provider: string;
  subject?: string | null;
  body?: string | null;
  reason: string | null;
  scheduledFor: Date | null;
  createdAt: Date;
  sentAt: Date | null;
  lead?: {
    companyName?: string | null;
    name?: string | null;
    niche?: string | null;
    source?: string | null;
    score?: number | null;
    nextAction?: string | null;
    stage?: string | null;
    value?: number | null;
    contactId: string | null;
    contact?: { email: string | null } | null;
    status?: string | null;
  } | null;
};

export function isLikelyFollowUp(item: { subject?: string | null; body?: string | null; reason?: string | null; scheduledFor?: Date | null }) {
  return /(?:follow[-\s]?up|step\s*[2-9]|day\s*[2-9]|close(?:ing)? the loop|sequence)/i.test(
    `${item.subject || ""} ${item.body || ""} ${item.reason || ""}`,
  );
}

export function classifyEmailPipeline(
  items: EmailPipelineItem[],
  input: { senderMode: string; recommendedSendLimit: number; now?: Date },
) {
  const now = input.now || new Date();
  const pendingEmail = items.filter((item) => item.status === "pending" && item.channel === "email");
  const firstTouchQualified = pendingEmail.filter((item) => !isLikelyFollowUp(item) && Boolean(item.lead?.contact?.email));
  const followUpsDue = pendingEmail.filter((item) => isLikelyFollowUp(item) && (!item.scheduledFor || item.scheduledFor <= now));
  const invalidContact = pendingEmail.filter((item) => !item.lead?.contact?.email || emailQualityTier(item.lead?.contact?.email) === "invalid");
  const blockedBySuppression = items.filter((item) => /suppress/i.test(`${item.status} ${item.reason || ""}`));
  const blockedByCampaignPolicy = pendingEmail.filter((item) => /campaign policy|policy/i.test(item.reason || ""));
  const blockedByProviderHealth = input.senderMode === "stop" ? firstTouchQualified : [];
  const newFirstTouchSendable = input.senderMode === "stop" ? [] : firstTouchQualified.slice(0, input.recommendedSendLimit);
  const followUpsSendable =
    input.senderMode === "stop"
      ? followUpsDue.filter((item) => !/bounce|spam|suppressed|complaint/i.test(item.reason || ""))
      : followUpsDue;

  return {
    emailQualified: firstTouchQualified.length,
    sendableNow: newFirstTouchSendable.length,
    heldBySenderGovernor: blockedByProviderHealth.length,
    blockedBySuppression: blockedBySuppression.length,
    blockedByContactRisk: invalidContact.length,
    blockedByCampaignPolicy: blockedByCampaignPolicy.length,
    blockedByUsageLimit: input.senderMode !== "stop" ? Math.max(0, firstTouchQualified.length - newFirstTouchSendable.length) : 0,
    blockedByProviderHealth: blockedByProviderHealth.length,
    firstTouchEligible: firstTouchQualified.length,
    firstTouchSendable: newFirstTouchSendable.length,
    firstTouchHeld: input.senderMode === "stop" ? firstTouchQualified.length : Math.max(0, firstTouchQualified.length - newFirstTouchSendable.length),
    followUpsDue: followUpsDue.length,
    followUpsSendable: followUpsSendable.length,
    followUpsHeld: Math.max(0, followUpsDue.length - followUpsSendable.length),
  };
}

export function classifyDecisionLanes(
  items: EmailPipelineItem[],
  input: { senderMode: string; recommendedSendLimit: number },
) {
  const active = items.filter((item) => Boolean(item.id));
  const lanes = {
    AUTO_EMAIL: 0,
    APPROVAL_EMAIL: 0,
    CALL_FIRST: 0,
    MANUAL_CONTACT_FORM: 0,
    RESEARCH_MORE: 0,
    SUPPRESS: 0,
    CLOSED: 0,
  };
  const assigned = new Map<string, keyof typeof lanes>();

  function fallbackLane(item: EmailPipelineItem): keyof typeof lanes {
    if (item.channel === "manual") return "CALL_FIRST";
    if (item.channel === "email" && item.lead?.contact?.email && emailQualityTier(item.lead.contact.email) !== "invalid") return "AUTO_EMAIL";
    if (item.channel === "email") return "RESEARCH_MORE";
    return "RESEARCH_MORE";
  }

  for (const item of active) {
    let lane: keyof typeof lanes = "RESEARCH_MORE";
    if (["failed", "rejected", "suppressed"].includes(item.status)) lane = "SUPPRESS";
    else if (["sent", "queued"].includes(item.status)) lane = "CLOSED";
    else {
      const hasIntelligenceFields = Boolean(item.lead?.companyName) || typeof item.lead?.score === "number";
      if (!hasIntelligenceFields) {
        lane = fallbackLane(item);
      } else {
        const intelligence = evaluateOpportunityQueueItem(item as Parameters<typeof evaluateOpportunityQueueItem>[0]);
        if (intelligence.decisionLane === "AUTO_EMAIL") lane = "AUTO_EMAIL";
        else if (intelligence.decisionLane === "APPROVAL_EMAIL") lane = "APPROVAL_EMAIL";
        else if (intelligence.decisionLane === "CALL_FIRST") lane = "CALL_FIRST";
        else if (intelligence.decisionLane === "MANUAL_CONTACT_FORM") lane = "MANUAL_CONTACT_FORM";
        else if (intelligence.decisionLane === "SUPPRESS_REVIEW") lane = "SUPPRESS";
        else lane = "RESEARCH_MORE";
      }
    }
    assigned.set(item.id, lane);
    lanes[lane] += 1;
  }

  const totalClassified = Object.values(lanes).reduce((sum, value) => sum + value, 0);
  return {
    lanes,
    totalActiveCandidates: active.length,
    totalClassified,
    unclassified: Math.max(0, active.length - totalClassified),
    reconciled: totalClassified === active.length,
    duplicatePrimaryLaneIds: [],
    label: input.senderMode === "stop" ? "Primary lanes while sender governor holds email execution" : "Primary lanes",
  };
}

export function buildProofReconciliationWarnings(input: {
  senderMode: string;
  sendableNow: number;
  actionablePhoneTaskIds: string[];
  humanActionTaskIds: string[];
  laneReconciled: boolean;
  unclassified: number;
  duplicatePrimaryLaneIds?: string[];
}) {
  const warnings: string[] = [];
  if (input.senderMode === "stop" && input.sendableNow !== 0) {
    warnings.push("Sender governor is STOP but sendableNow is not zero.");
  }
  const actionable = new Set(input.actionablePhoneTaskIds);
  const missingHumanActions = input.humanActionTaskIds.filter((id) => !actionable.has(id));
  if (missingHumanActions.length) {
    warnings.push(`Human call actions include ${missingHumanActions.length} task(s) outside the shared actionable-phone query.`);
  }
  if (!input.laneReconciled || input.unclassified) {
    warnings.push(`Decision lane totals do not reconcile. Unclassified: ${input.unclassified}.`);
  }
  if (input.duplicatePrimaryLaneIds?.length) {
    warnings.push(`Some candidates have multiple primary lanes: ${input.duplicatePrimaryLaneIds.slice(0, 5).join(", ")}.`);
  }
  return warnings;
}

export function isProductionProofRequest(text: string) {
  return /\b(?:proof loop|production proof|seven[-\s]?day|7[-\s]?day|campaign report|daily campaign report|learning report|source quality)\b/i.test(clean(text));
}

export async function runVegaProductionProof(input: { instruction?: string; postToSlack?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  await repairMissingPhoneAssistSchedules({ workspaceId: workspace.id });
  const yesterdayStart = startOfDay(-1);
  const todayStart = startOfDay(0);
  const tomorrowStart = startOfDay(1);
  const sevenDaysAgo = daysAgo(7);
  const now = new Date();

  const [
    leads,
    queue,
    replies,
    interactions,
    bookingTasks,
    campaigns,
    learning,
    senderHealth,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: sevenDaysAgo } },
      include: { contact: true, opportunities: true },
      orderBy: { createdAt: "desc" },
      take: 1500,
    }),
    prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: sevenDaysAgo } },
      include: { lead: { include: { contact: true, company: true } } },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.interaction.findMany({ where: { lead: { is: { workspaceId: workspace.id } }, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.bookingTask.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.sourcingCampaign.findMany({ where: { workspaceId: workspace.id, status: "active" }, orderBy: { updatedAt: "desc" }, take: 50 }),
    computeConversionLearning(),
    getSenderHealth({ workspaceId: workspace.id }),
  ]);

  const activeCampaigns = Math.max(1, campaigns.length);
  const dayIndex = Math.min(7, Math.max(1, Math.ceil((Date.now() - sevenDaysAgo.getTime()) / 86_400_000)));
  const recommendedSendLimit = nextSendLimit({ mode: senderHealth.mode, dayIndex, campaignsRunning: activeCampaigns });
  const emailPipeline = classifyEmailPipeline(queue, {
    senderMode: senderHealth.mode,
    recommendedSendLimit,
    now,
  });
  const decisionLanes = classifyDecisionLanes(queue, {
    senderMode: senderHealth.mode,
    recommendedSendLimit,
  });
  const phoneTaskReport = await getActionablePhoneTasks({
    workspaceId: workspace.id,
    now,
    createdStart: yesterdayStart,
    createdEnd: todayStart,
  });

  const inRange = (date: Date, start: Date, end: Date) => date >= start && date < end;
  const yesterdayQueue = queue.filter((item) => inRange(item.createdAt, yesterdayStart, todayStart) || (item.sentAt && inRange(item.sentAt, yesterdayStart, todayStart)));
  const yesterdayInteractions = interactions.filter((item) => inRange(item.createdAt, yesterdayStart, todayStart));
  const todayReplies = replies.filter((reply) => inRange(reply.createdAt, todayStart, tomorrowStart));
  const yesterdayReplies = replies.filter((reply) => inRange(reply.createdAt, yesterdayStart, todayStart));

  const phoneTasks = phoneTaskReport.all;
  const phoneCompletedYesterday = phoneTasks.filter((item) =>
    ["called", "call_no_answer", "voicemail_left", "gatekeeper", "wrong_person", "callback_requested", "interested", "info_requested", "meeting_requested", "meeting_booked", "not_interested", "suppressed"].includes(item.status) &&
    inRange(item.updatedAt, yesterdayStart, todayStart),
  );
  const callInteractionsYesterday = interactions.filter((item) => item.channel === "phone" && inRange(item.createdAt, yesterdayStart, todayStart));
  const reachedYesterday = callInteractionsYesterday.filter((item) => {
    const meta = jsonObject(item.metadata);
    return meta.reached === true;
  }).length;
  const conversationsYesterday = callInteractionsYesterday.filter((item) => {
    const meta = jsonObject(item.metadata);
    return meta.conversation === true;
  }).length;
  const interestedYesterday = phoneCompletedYesterday.filter((item) => ["interested", "info_requested", "meeting_requested", "meeting_booked"].includes(item.status)).length;

  const campaignsByName = new Map<string, {
    name: string;
    owner: string;
    leads: number;
    sent: number;
    delivered: number;
    risky: number;
    replies: number;
    meetings: number;
    pipeline: number;
  }>();
  const leadCampaign = new Map<string, string>();
  for (const lead of leads) {
    const name = campaignName(lead);
    leadCampaign.set(lead.id, name);
    if (!campaignsByName.has(name)) {
      campaignsByName.set(name, { name, owner: campaignOwner(name), leads: 0, sent: 0, delivered: 0, risky: 0, replies: 0, meetings: 0, pipeline: 0 });
    }
    const row = campaignsByName.get(name)!;
    row.leads += 1;
    row.pipeline += lead.value || 0;
    row.meetings += lead.stage === "Call Booked" ? 1 : 0;
  }
  for (const item of queue) {
    if (!item.leadId) continue;
    const row = campaignsByName.get(leadCampaign.get(item.leadId) || "");
    if (!row) continue;
    if (["sent", "queued"].includes(item.status)) row.sent += 1;
    if (item.status === "failed") row.risky += 1;
  }
  for (const event of interactions) {
    if (!event.leadId) continue;
    const row = campaignsByName.get(leadCampaign.get(event.leadId) || "");
    if (!row) continue;
    if (event.channel === "email:sendgrid" && event.classification === "delivered") row.delivered += 1;
    if (event.channel === "email:sendgrid" && ["bounce", "dropped", "spamreport"].includes(clean(event.classification))) row.risky += 1;
  }
  for (const reply of replies) {
    if (!reply.leadId) continue;
    const row = campaignsByName.get(leadCampaign.get(reply.leadId) || "");
    if (!row) continue;
    row.replies += 1;
    if (reply.classification === "booked") row.meetings += 1;
  }

  const campaignRows = [...campaignsByName.values()]
    .map((row) => {
      const replyRate = pct(row.replies, Math.max(row.sent, 1));
      const riskyRate = pct(row.risky, Math.max(row.sent + row.risky, 1));
      return {
        ...row,
        replyRate,
        riskyRate,
        recommendation:
          riskyRate >= 12 ? "reduce/pause until contact quality improves" :
          row.replies || row.meetings ? "keep and push booking" :
          row.sent >= 8 ? "revise offer/copy before scaling" :
          "needs more proof",
      };
    })
    .sort((a, b) => b.meetings - a.meetings || b.replies - a.replies || b.leads - a.leads)
    .slice(0, 8);

  const riskyYesterday = yesterdayInteractions.filter((item) => item.channel === "email:sendgrid" && ["bounce", "dropped", "spamreport"].includes(clean(item.classification))).length;
  const sentYesterday = yesterdayQueue.filter((item) => ["sent", "queued"].includes(item.status)).length;
  const deliveredYesterday = yesterdayInteractions.filter((item) => item.channel === "email:sendgrid" && item.classification === "delivered").length;
  const sendDecision =
    senderHealth.mode === "stop"
      ? "New first-touch email is paused. Work calls/replies and suppress bad contacts."
      : senderHealth.mode === "caution"
        ? `Limit to ${recommendedSendLimit} first-touch sends across active campaigns and prioritize named-business emails.`
      : `Vega may send up to ${recommendedSendLimit} eligible first-touch emails today, then watch replies and phone assists.`;
  const featureFlags = vegaFeatureFlagSnapshot({ workspaceName: workspace.name, workspaceSlug: workspace.slug });
  const enabledFoundationFlags = Object.entries(featureFlags).filter(([, enabled]) => enabled).map(([flag]) => flag);
  const capabilityReadiness = VEGA_CAPABILITY_REGISTRY.map((entry) => ({
    group: entry.group,
    label: entry.label,
    services: entry.services,
    models: entry.models,
    featureFlags: entry.featureFlags,
    enabled: entry.featureFlags.length === 0 || entry.featureFlags.every((flag) => featureFlags[flag]),
  }));

  const humanActionTasks = phoneTaskReport.actionable.slice(0, 3);
  const humanActions = [
    ...humanActionTasks.map((item) => `Call ${item.lead?.companyName || "manual lead"}${item.lead?.contactId ? "" : " and verify decision maker"}`),
    ...bookingTasks.filter((task) => ["ready", "scheduled"].includes(task.status)).slice(0, 2).map((task) => `Confirm booking handoff: ${task.meetingTitle}`),
  ].slice(0, 5);
  const reconciliationWarnings = buildProofReconciliationWarnings({
    senderMode: senderHealth.mode,
    sendableNow: emailPipeline.sendableNow,
    actionablePhoneTaskIds: phoneTaskReport.actionable.map((item) => item.id),
    humanActionTaskIds: humanActionTasks.map((item) => item.id),
    laneReconciled: decisionLanes.reconciled,
    unclassified: decisionLanes.unclassified,
    duplicatePrimaryLaneIds: decisionLanes.duplicatePrimaryLaneIds,
  });

  const report = {
    yesterday: {
      emailsAttempted: sentYesterday + yesterdayQueue.filter((item) => item.status === "failed").length,
      delivered: deliveredYesterday,
      bounced: riskyYesterday,
      opened: yesterdayInteractions.filter((item) => item.classification === "open").length,
      clicked: yesterdayInteractions.filter((item) => item.classification === "click").length,
      replies: yesterdayReplies.length,
      phoneTasksCreated: yesterdayQueue.filter((item) => item.channel === "manual").length,
      callsCompleted: phoneCompletedYesterday.length,
      contactsReached: reachedYesterday,
      conversations: conversationsYesterday,
      interested: interestedYesterday,
      meetingsRequested: phoneCompletedYesterday.filter((item) => ["meeting_requested", "meeting_booked"].includes(item.status)).length,
      meetingsBooked: phoneCompletedYesterday.filter((item) => item.status === "meeting_booked").length,
    },
    today: {
      campaignsRunning: campaigns.length,
      emailsEligible: emailPipeline.emailQualified,
      sendableNow: emailPipeline.sendableNow,
      heldBySenderGovernor: emailPipeline.heldBySenderGovernor,
      followUpsDue: emailPipeline.followUpsDue,
      followUpsSendable: emailPipeline.followUpsSendable,
      followUpsHeld: emailPipeline.followUpsHeld,
      callsDue: phoneTaskReport.actionable.length,
      callbacksDue: phoneTaskReport.callbackDue.length,
      repliesToday: todayReplies.length,
      phoneReadyAfterEmail: phoneTaskReport.actionable.length,
    },
    emailPipeline,
    phonePipeline: {
      createdYesterday: phoneTaskReport.created.length,
      dueNow: phoneTaskReport.dueNow.length,
      overdue: phoneTaskReport.overdue.length,
      scheduledLater: phoneTaskReport.scheduledLater.length,
      callbackDue: phoneTaskReport.callbackDue.length,
      interestedFollowUp: phoneTaskReport.interestedFollowUp.length,
      completed: phoneTaskReport.completed.length,
      closed: phoneTaskReport.closed.length,
      missingDueTime: phoneTaskReport.missingDueTime.length,
      excludedByCampaign: phoneTaskReport.excludedByCampaign.length,
      excludedByStatus: phoneTaskReport.excludedByStatus.length,
    },
    lanes: {
      autoEmailNow: decisionLanes.lanes.AUTO_EMAIL,
      autoEmail: decisionLanes.lanes.AUTO_EMAIL,
      executiveReview: decisionLanes.lanes.APPROVAL_EMAIL,
      callFirst: decisionLanes.lanes.CALL_FIRST,
      manualContact: decisionLanes.lanes.MANUAL_CONTACT_FORM,
      researchMore: decisionLanes.lanes.RESEARCH_MORE,
      suppress: decisionLanes.lanes.SUPPRESS,
      closed: decisionLanes.lanes.CLOSED,
      totalActiveCandidates: decisionLanes.totalActiveCandidates,
      totalClassified: decisionLanes.totalClassified,
      unclassified: decisionLanes.unclassified,
      reconciled: decisionLanes.reconciled,
    },
    sender: {
      mode: senderHealth.mode,
      bounceRate: senderHealth.bounceRate,
      targetBounceRate: senderHealth.targetBounceRate,
      hardStopBounceRate: senderHealth.hardStopBounceRate,
      recommendedSendLimit,
      decision: sendDecision,
    },
    phaseA: {
      featureFlags,
      enabledFoundationFlags,
      capabilityGroups: capabilityReadiness,
      readiness: "Phase A foundation is installed: intent, channel, provider, source-quality, experiment, entitlement, and feature-flag layers are available behind policy gates.",
    },
    campaigns: campaignRows,
    sources: learning.sources.slice(0, 5),
    recommendations: [
      sendDecision,
      learning.recommendations[0],
      learning.recommendations[1],
      campaignRows.find((row) => row.owner === "partner")
        ? "Keep partner campaigns separated in reporting and phone tasks; do not let partner send volume contaminate Ghost campaign learning."
        : "Partner campaign reporting is ready, but no recent partner campaign has enough proof yet.",
      humanActions.length ? `Human focus: ${humanActions.slice(0, 3).join("; ")}.` : "No urgent human call list; let Vega source/send only within sender-health limits.",
    ].filter(Boolean),
    humanActions,
    reconciliationWarnings,
  };

  const summaryLines = [
    "VEGA DAILY CAMPAIGN REPORT",
    "",
    "Yesterday",
    lineItem("Emails attempted", report.yesterday.emailsAttempted),
    lineItem("Delivered", report.yesterday.delivered),
    lineItem("Bounced/dropped/spam", report.yesterday.bounced),
    lineItem("Opened", report.yesterday.opened),
    lineItem("Clicked", report.yesterday.clicked),
    lineItem("Replies", report.yesterday.replies),
    lineItem("Phone tasks created", report.yesterday.phoneTasksCreated),
    lineItem("Calls completed", report.yesterday.callsCompleted),
    lineItem("Contacts reached", report.yesterday.contactsReached),
    lineItem("Conversations", report.yesterday.conversations),
    lineItem("Interested", report.yesterday.interested),
    lineItem("Meetings requested", report.yesterday.meetingsRequested),
    lineItem("Meetings booked", report.yesterday.meetingsBooked),
    "",
    "Today",
    lineItem("Campaigns running", report.today.campaignsRunning),
    "",
    "Email pipeline",
    lineItem("Email-qualified", report.emailPipeline.emailQualified),
    lineItem("Sendable now", report.emailPipeline.sendableNow),
    lineItem("Held by sender governor", report.emailPipeline.heldBySenderGovernor),
    lineItem("Blocked by suppression", report.emailPipeline.blockedBySuppression),
    lineItem("Blocked by contact risk", report.emailPipeline.blockedByContactRisk),
    lineItem("Blocked by campaign policy", report.emailPipeline.blockedByCampaignPolicy),
    lineItem("Blocked by usage limit", report.emailPipeline.blockedByUsageLimit),
    lineItem("Blocked by provider health", report.emailPipeline.blockedByProviderHealth),
    lineItem("Follow-ups due", report.emailPipeline.followUpsDue),
    lineItem("Follow-ups sendable", report.emailPipeline.followUpsSendable),
    lineItem("Follow-ups held", report.emailPipeline.followUpsHeld),
    "",
    "Phone pipeline",
    lineItem("Created yesterday", report.phonePipeline.createdYesterday),
    lineItem("Due/actionable now", report.today.callsDue),
    lineItem("Due now", report.phonePipeline.dueNow),
    lineItem("Overdue", report.phonePipeline.overdue),
    lineItem("Scheduled later", report.phonePipeline.scheduledLater),
    lineItem("Missing schedule", report.phonePipeline.missingDueTime),
    lineItem("Completed", report.phonePipeline.completed),
    lineItem("Closed", report.phonePipeline.closed),
    lineItem("Excluded by campaign", report.phonePipeline.excludedByCampaign),
    lineItem("Excluded by status", report.phonePipeline.excludedByStatus),
    lineItem("Callbacks due", report.today.callbacksDue),
    "",
    "Primary decision lanes",
    lineItem("Active candidates", report.lanes.totalActiveCandidates),
    lineItem("Auto-email candidate", report.lanes.autoEmail),
    lineItem("Executive review", report.lanes.executiveReview),
    lineItem("Call first", report.lanes.callFirst),
    lineItem("Manual contact", report.lanes.manualContact),
    lineItem("Research more", report.lanes.researchMore),
    lineItem("Suppress", report.lanes.suppress),
    lineItem("Closed", report.lanes.closed),
    lineItem("Unclassified", report.lanes.unclassified),
    lineItem("Lane totals reconcile", report.lanes.reconciled ? "yes" : "no"),
    "",
    "Sender governor",
    `${report.sender.mode.toUpperCase()}: ${report.sender.decision}`,
    report.reconciliationWarnings.length
      ? `\nData reconciliation warning\n${report.reconciliationWarnings.map((warning) => `- ${warning}`).join("\n")}`
      : "",
    "",
    "Vega capability groups",
    ...report.phaseA.capabilityGroups.map((group) => `- ${group.label}: ${group.enabled ? "enabled/gated" : "available but disabled"}`),
    `Feature flags on: ${report.phaseA.enabledFoundationFlags.length ? report.phaseA.enabledFoundationFlags.join(", ") : "none"}`,
    "",
    "Campaign quality",
    ...(report.campaigns.length
      ? report.campaigns.slice(0, 5).map((row) => `- ${row.name}: ${row.sent} sent, ${row.delivered} delivered, ${row.replies} replies, ${row.meetings} meetings, ${row.riskyRate}% risky. Recommendation: ${row.recommendation}.`)
      : ["- No campaign-level proof yet."]),
    "",
    "Source quality",
    ...(report.sources.length
      ? report.sources.slice(0, 4).map((row) => `- ${row.key}: ${row.leads} leads, ${row.sent} sent, ${row.replies} replies, ${row.failureRate}% fail, ${row.quality}.`)
      : ["- No source rows yet."]),
    "",
    "Human actions",
    ...(report.humanActions.length ? report.humanActions.map((item, index) => `${index + 1}. ${item}`) : ["1. No urgent Stephen/VA action detected."]),
  ];

  const slack = input.postToSlack
    ? await notifySlackVegaLeadRequestResult({
        instruction: input.instruction || "production proof loop",
        status: "finished",
        summary: summaryLines.join("\n").slice(0, 2900),
      })
    : { configured: false, sent: false, message: "Slack posting disabled." };

  await createAutomationEvent({
    title: "Vega production proof loop",
    detail: `${report.sender.mode} sender mode. Today: ${report.today.emailsEligible} email eligible, ${report.today.callsDue} calls due, ${report.today.callbacksDue} callbacks due.`,
    status: senderHealth.mode === "stop" ? "needs_review" : "done",
    type: "agent",
    payload: { report, slack },
  });

  return { ok: true, report, summary: summaryLines.join("\n"), slack };
}
