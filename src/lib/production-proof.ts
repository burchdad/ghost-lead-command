import type { Prisma } from "@prisma/client";
import { createAutomationEvent } from "@/lib/automation";
import { getSenderHealth } from "@/lib/conversion-quality";
import { computeConversionLearning } from "@/lib/conversion-learning";
import { getPrisma } from "@/lib/prisma";
import { notifySlackVegaLeadRequestResult } from "@/lib/slack";
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

export function isProductionProofRequest(text: string) {
  return /\b(?:proof loop|production proof|seven[-\s]?day|7[-\s]?day|campaign report|daily campaign report|learning report|source quality)\b/i.test(clean(text));
}

export async function runVegaProductionProof(input: { instruction?: string; postToSlack?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const yesterdayStart = startOfDay(-1);
  const todayStart = startOfDay(0);
  const tomorrowStart = startOfDay(1);
  const sevenDaysAgo = daysAgo(7);
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

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
      include: { lead: true },
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

  const inRange = (date: Date, start: Date, end: Date) => date >= start && date < end;
  const yesterdayQueue = queue.filter((item) => inRange(item.createdAt, yesterdayStart, todayStart) || (item.sentAt && inRange(item.sentAt, yesterdayStart, todayStart)));
  const todayQueue = queue.filter((item) => inRange(item.createdAt, todayStart, tomorrowStart) || (item.sentAt && inRange(item.sentAt, todayStart, tomorrowStart)));
  const yesterdayInteractions = interactions.filter((item) => inRange(item.createdAt, yesterdayStart, todayStart));
  const todayReplies = replies.filter((reply) => inRange(reply.createdAt, todayStart, tomorrowStart));
  const yesterdayReplies = replies.filter((reply) => inRange(reply.createdAt, yesterdayStart, todayStart));

  const phoneTasks = queue.filter((item) => item.channel === "manual" && ["phone-after-email", "phone-website"].includes(item.provider));
  const phoneDueToday = phoneTasks.filter((item) => item.scheduledFor && inRange(item.scheduledFor, todayStart, tomorrowStart));
  const callbackDue = phoneTasks.filter((item) => item.status === "callback_requested" && item.scheduledFor && item.scheduledFor <= tomorrowStart);
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

  const autoEmailNow = queue.filter((item) => item.status === "pending" && item.channel === "email" && item.lead?.contactId);
  const callFirst = phoneTasks.filter((item) => ["pending", "call_no_answer", "voicemail_left", "gatekeeper", "callback_requested"].includes(item.status));
  const researchMore = queue.filter((item) => item.status === "pending" && (item.channel === "manual" || /manual|research|contact path/i.test(`${item.provider} ${item.reason}`)));
  const suppress = queue.filter((item) => ["failed", "rejected", "suppressed"].includes(item.status));

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
  const activeCampaigns = Math.max(1, campaigns.length);
  const dayIndex = Math.min(7, Math.max(1, Math.ceil((Date.now() - sevenDaysAgo.getTime()) / 86_400_000)));
  const recommendedSendLimit = nextSendLimit({ mode: senderHealth.mode, dayIndex, campaignsRunning: activeCampaigns });
  const sendDecision =
    senderHealth.mode === "stop"
      ? "Pause new first-touch sends; only work calls/replies and suppress bad contacts."
      : senderHealth.mode === "caution"
        ? `Limit to ${recommendedSendLimit} first-touch sends across active campaigns and prioritize named-business emails.`
        : `Vega may send up to ${recommendedSendLimit} eligible first-touch emails today, then watch replies and phone assists.`;

  const humanActions = [
    ...callFirst.slice(0, 3).map((item) => `Call ${item.lead?.companyName || "manual lead"}${item.lead?.contactId ? "" : " and verify decision maker"}`),
    ...bookingTasks.filter((task) => ["ready", "scheduled"].includes(task.status)).slice(0, 2).map((task) => `Confirm booking handoff: ${task.meetingTitle}`),
  ].slice(0, 5);

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
      emailsEligible: autoEmailNow.length,
      followUpsDue: todayQueue.filter((item) => item.channel === "email" && item.scheduledFor && item.scheduledFor <= tomorrowStart).length,
      callsDue: phoneDueToday.length,
      callbacksDue: callbackDue.length,
      repliesToday: todayReplies.length,
      phoneReadyAfterEmail: phoneTasks.filter((item) => item.status === "pending" && item.scheduledFor && item.scheduledFor <= threeHoursAgo).length,
    },
    lanes: {
      autoEmailNow: autoEmailNow.length,
      callFirst: callFirst.length,
      researchMore: researchMore.length,
      suppress: suppress.length,
    },
    sender: {
      mode: senderHealth.mode,
      bounceRate: senderHealth.bounceRate,
      targetBounceRate: senderHealth.targetBounceRate,
      hardStopBounceRate: senderHealth.hardStopBounceRate,
      recommendedSendLimit,
      decision: sendDecision,
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
    lineItem("Emails eligible to send", report.today.emailsEligible),
    lineItem("Follow-ups due", report.today.followUpsDue),
    lineItem("Calls due", report.today.callsDue),
    lineItem("Callbacks due", report.today.callbacksDue),
    "",
    "Decision lanes",
    lineItem("Auto-email now", report.lanes.autoEmailNow),
    lineItem("Call first", report.lanes.callFirst),
    lineItem("Research more", report.lanes.researchMore),
    lineItem("Suppress/closed", report.lanes.suppress),
    "",
    "Sender governor",
    `${report.sender.mode.toUpperCase()}: ${report.sender.decision}`,
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
