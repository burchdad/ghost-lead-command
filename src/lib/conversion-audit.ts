import { createAutomationEvent } from "@/lib/automation";
import { emailQualityTier, getSenderHealth, isDecisionMakerTitle } from "@/lib/conversion-quality";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

type Severity = "critical" | "high" | "medium" | "low";

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function ageWindow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, days));
  return date;
}

function addGap(gaps: Array<{ severity: Severity; issue: string; action: string }>, severity: Severity, issue: string, action: string) {
  gaps.push({ severity, issue, action });
}

export function isConversionAuditRequest(text: string) {
  return /\b(?:conversion audit|repair conversion|quality audit|reply audit|sender audit|audit conversion|why no replies|why aren't we getting replies)\b/i.test(text);
}

export async function runVegaConversionAudit(input: { days?: number; createEvent?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const days = Math.min(30, Math.max(1, Number(input.days || process.env.VEGA_CONVERSION_AUDIT_DAYS || 7)));
  const since = ageWindow(days);

  const [health, leads, queue, replies, interactions, bookingTasks, opportunities] = await Promise.all([
    getSenderHealth({ workspaceId: workspace.id, days }),
    prisma.lead.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      include: { contact: true, company: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      include: { lead: { include: { contact: true, company: true } } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.interaction.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, createdAt: { gte: since } },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    prisma.bookingTask.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 500 }),
    prisma.opportunity.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, createdAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
  ]);

  const sent = queue.filter((item) => item.status === "sent").length;
  const pending = queue.filter((item) => item.status === "pending").length;
  const failed = queue.filter((item) => item.status === "failed").length;
  const manual = queue.filter((item) => item.channel === "manual" && item.status === "pending").length;
  const emailPending = queue.filter((item) => item.channel === "email" && item.status === "pending");
  const namedBusinessPending = emailPending.filter((item) => emailQualityTier(item.lead?.contact?.email) === "named-business").length;
  const genericPending = emailPending.filter((item) => emailQualityTier(item.lead?.contact?.email) === "generic").length;
  const invalidPending = emailPending.filter((item) => emailQualityTier(item.lead?.contact?.email) === "invalid").length;
  const decisionMakerPending = emailPending.filter((item) =>
    isDecisionMakerTitle(item.lead?.title || item.lead?.contact?.title || item.lead?.contact?.role),
  ).length;
  const delivered = interactions.filter((item) => item.classification === "delivered").length;
  const opened = interactions.filter((item) => item.classification === "open").length;
  const clicked = interactions.filter((item) => item.classification === "click").length;
  const risky = interactions.filter((item) => ["bounce", "dropped", "spamreport"].includes(String(item.classification))).length;
  const hotReplies = replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length;
  const confirmedOpportunities = opportunities.filter((opportunity) =>
    ["Confirmed Opportunity", "Booking Requested", "Proposal Sent", "Won"].includes(opportunity.stage),
  ).length;
  const bookingReady = bookingTasks.filter((task) => task.status === "ready").length;
  const bookingScheduled = bookingTasks.filter((task) => task.status === "scheduled").length;
  const bookingBlocked = bookingTasks.filter((task) => task.status === "blocked").length;

  const sourceMap = new Map<string, {
    leads: number;
    sent: number;
    delivered: number;
    risky: number;
    replies: number;
    hotReplies: number;
    clicks: number;
  }>();
  for (const lead of leads) {
    const key = lead.source || "unknown";
    sourceMap.set(key, sourceMap.get(key) || { leads: 0, sent: 0, delivered: 0, risky: 0, replies: 0, hotReplies: 0, clicks: 0 });
    sourceMap.get(key)!.leads += 1;
  }
  for (const item of queue) {
    const key = item.lead?.source || "unknown";
    sourceMap.set(key, sourceMap.get(key) || { leads: 0, sent: 0, delivered: 0, risky: 0, replies: 0, hotReplies: 0, clicks: 0 });
    if (item.status === "sent") sourceMap.get(key)!.sent += 1;
  }
  for (const event of interactions) {
    const key = event.lead?.source || "unknown";
    sourceMap.set(key, sourceMap.get(key) || { leads: 0, sent: 0, delivered: 0, risky: 0, replies: 0, hotReplies: 0, clicks: 0 });
    if (event.classification === "delivered") sourceMap.get(key)!.delivered += 1;
    if (event.classification === "click") sourceMap.get(key)!.clicks += 1;
    if (["bounce", "dropped", "spamreport"].includes(String(event.classification))) sourceMap.get(key)!.risky += 1;
  }
  for (const reply of replies) {
    const lead = leads.find((item) => item.id === reply.leadId);
    const key = lead?.source || "unknown";
    sourceMap.set(key, sourceMap.get(key) || { leads: 0, sent: 0, delivered: 0, risky: 0, replies: 0, hotReplies: 0, clicks: 0 });
    sourceMap.get(key)!.replies += 1;
    if (["hot", "booked", "objection"].includes(reply.classification)) sourceMap.get(key)!.hotReplies += 1;
  }

  const sources = Array.from(sourceMap.entries())
    .map(([source, metrics]) => ({
      source,
      ...metrics,
      replyRate: pct(metrics.replies, Math.max(metrics.sent, metrics.delivered)),
      riskyRate: pct(metrics.risky, Math.max(metrics.delivered + metrics.risky, metrics.sent)),
      clickRate: pct(metrics.clicks, Math.max(metrics.delivered, metrics.sent)),
    }))
    .sort((a, b) => b.hotReplies - a.hotReplies || b.replyRate - a.replyRate || b.leads - a.leads)
    .slice(0, 8);

  const gaps: Array<{ severity: Severity; issue: string; action: string }> = [];
  if (health.mode === "stop") addGap(gaps, "critical", `Sender health is in stop mode at ${health.bounceRate}% risky events.`, "Run Vega, protect deliverability; suppress bad domains; pause batch approval until below hard stop.");
  else if (health.mode === "caution") addGap(gaps, "high", `Sender health is caution at ${health.bounceRate}% risky events.`, "Send only named-business, high-score contacts until bounce rate is under target.");
  if (sent >= 10 && replies.length === 0) addGap(gaps, "high", "Delivered volume is not producing replies.", "Narrow to one vertical/city pain, rewrite first touch, and run a 10-lead controlled copy test.");
  if (genericPending > namedBusinessPending) addGap(gaps, "high", "Generic inboxes outnumber named buyer inboxes in pending email.", "Use contact-path and enrichment before auto-send; reserve email auto-send for named decision-maker inboxes.");
  if (invalidPending) addGap(gaps, "critical", `${invalidPending} pending emails are invalid or missing.`, "Reject or convert these into manual contact-path tasks before approving batches.");
  if (manual > Math.max(3, namedBusinessPending)) addGap(gaps, "medium", "Manual contact-path tasks are piling up.", "Have Vega work contact paths, find named emails, or assign phone/form follow-up.");
  if (hotReplies && !confirmedOpportunities) addGap(gaps, "high", "Hot replies exist without confirmed opportunities.", "Run Vega, work replies so opportunities and booking handoffs are created.");
  if (bookingReady && !bookingScheduled) addGap(gaps, "high", "Booking tasks are ready but not scheduled.", "Run Vega, push bookings and confirm calendar movement before counting booked calls.");
  if (bookingBlocked) addGap(gaps, "medium", `${bookingBlocked} booking tasks are blocked.`, "Fix calendar/meeting link data or send manual booking handoff.");
  if (clicked && hotReplies === 0) addGap(gaps, "medium", "Clicks exist but have not converted into replies.", "Queue click follow-up with a direct diagnosis question and no pitch.");
  if (decisionMakerPending < Math.ceil(emailPending.length * 0.6) && emailPending.length >= 5) {
    addGap(gaps, "medium", "Too much pending email lacks clear decision-maker title.", "Raise auto-send threshold or enrich titles before approval.");
  }

  const nextMoves = [
    health.mode !== "clear" ? "Vega, protect deliverability" : "",
    bookingReady ? "Vega, push bookings" : "",
    hotReplies ? "Vega, work replies" : "",
    genericPending || manual ? "Vega, work contact paths" : "",
    namedBusinessPending ? `Vega, approve ${Math.min(10, namedBusinessPending)}` : "",
    !namedBusinessPending && !bookingReady ? "Vega, need 20 named decision-maker leads score 80" : "",
  ].filter(Boolean);

  const summary = gaps.length
    ? `Conversion audit found ${gaps.length} gap${gaps.length === 1 ? "" : "s"}. Top issue: ${gaps[0].issue}`
    : "Conversion audit is clean enough for controlled sending. Keep watch mode active after every batch.";

  const result = {
    ok: !gaps.some((gap) => ["critical", "high"].includes(gap.severity)),
    summary,
    days,
    metrics: {
      leads: leads.length,
      pending,
      sent,
      delivered,
      opened,
      clicked,
      replies: replies.length,
      hotReplies,
      failed,
      risky,
      manual,
      namedBusinessPending,
      genericPending,
      invalidPending,
      decisionMakerPending,
      confirmedOpportunities,
      bookingReady,
      bookingScheduled,
      bookingBlocked,
      senderHealth: health.mode,
      bounceRate: health.bounceRate,
      replyRate: pct(replies.length, sent || delivered),
      clickRate: pct(clicked, delivered || sent),
    },
    gaps,
    sources,
    nextMoves,
  };

  if (input.createEvent !== false) {
    await createAutomationEvent({
      title: "Vega Conversion Audit",
      detail: `${summary} Next: ${nextMoves[0] || "controlled send/watch loop"}`.slice(0, 900),
      status: result.ok ? "done" : "needs_review",
      type: "agent",
      payload: result,
    });
  }

  return result;
}
