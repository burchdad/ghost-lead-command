import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { runReplyConversionSweep } from "@/lib/replies";
import { notifySlackRevenueWatch } from "@/lib/slack";
import { getSourceScorecard } from "@/lib/source-scorecard";
import { runVegaSpecialist } from "@/lib/vega-specialists";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

export function isRevenueWatchRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  return /\b(?:watch revenue|watch replies|revenue watch|conversion watch|watch loop|monitor sends|monitor replies|after send)\b/.test(normalized);
}

export async function runVegaRevenueWatch(input: { instruction?: string; execute?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [scorecard, recentReplies, recentInteractions, pendingApprovals, bookingReady, bookingBlocked] = await Promise.all([
    getSourceScorecard(),
    prisma.reply.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 25, include: { lead: true } }),
    prisma.interaction.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid", createdAt: { gte: since } },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending" } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: { not: "blocked" } } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: "blocked" } }),
  ]);

  const eventCounts = recentInteractions.reduce<Record<string, number>>((acc, event) => {
    const key = String(event.classification || "event").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const hotReplies = recentReplies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification));
  const bounceSpike = (eventCounts.bounce || 0) + (eventCounts.dropped || 0) + (eventCounts.spamreport || 0);
  const noReplyAfterDelivery = (eventCounts.delivered || 0) >= 10 && recentReplies.length === 0;
  const escalations = [
    hotReplies.length ? `${hotReplies.length} hot/booked/objection replies need conversion work.` : "",
    bookingReady ? `${bookingReady} booking tasks are ready for calendar movement.` : "",
    bookingBlocked ? `${bookingBlocked} booking tasks are blocked by config or handoff.` : "",
    bounceSpike ? `${bounceSpike} risky SendGrid events in the last 24h; protect deliverability.` : "",
    noReplyAfterDelivery ? "Delivered volume is moving, but no replies landed in the last 24h." : "",
    pendingApprovals >= 25 ? `${pendingApprovals} pending approvals may be slowing fresh send/reply learning.` : "",
  ].filter(Boolean);

  const executed = [];
  const replySweep = await runReplyConversionSweep({ limit: 10, lookbackHours: 72 });
  executed.push({ name: "Reply sweep", status: replySweep.queued || replySweep.bookingReady ? "done" : "needs_review", detail: replySweep.message });

  if (input.execute) {
    if (bookingReady || hotReplies.length) {
      const booking = await runVegaSpecialist("booking", { limit: 10 });
      executed.push({ name: booking.title, status: booking.status, detail: booking.summary });
    }
    if (bounceSpike) {
      const deliverability = await runVegaSpecialist("deliverability", { limit: 50 });
      executed.push({ name: deliverability.title, status: deliverability.status, detail: deliverability.summary });
    }
    if (noReplyAfterDelivery || pendingApprovals > 0) {
      const cadence = await runVegaSpecialist("cadence", { limit: 8 });
      executed.push({ name: cadence.title, status: cadence.status, detail: cadence.summary });
    }
  }

  const topSources = scorecard.rows.slice(0, 5);
  const summary = escalations.length
    ? `Vega revenue watch found ${escalations.length} escalation${escalations.length === 1 ? "" : "s"}.`
    : "Vega revenue watch found no urgent conversion escalations.";
  const nextMove = escalations[0] || scorecard.summary.recommendation;
  const slack = await notifySlackRevenueWatch({
    summary,
    nextMove,
    escalations,
    eventCounts,
    pendingApprovals,
    bookingReady,
    bookingBlocked,
    replies: recentReplies.length,
    hotReplies: hotReplies.length,
    topSources,
    executed,
  });

  await createAutomationEvent({
    title: "Vega revenue watch completed",
    detail: `${summary} Next: ${nextMove}`,
    status: escalations.length || executed.some((item) => item.status === "done") ? "done" : "needs_review",
    type: "agent",
    payload: { instruction: input.instruction, execute: input.execute, escalations, eventCounts, scorecard: scorecard.summary, executed, slack },
  });

  return {
    ok: slack.sent || !slack.configured,
    summary,
    nextMove,
    escalations,
    eventCounts,
    pendingApprovals,
    bookingReady,
    bookingBlocked,
    replies: recentReplies.length,
    hotReplies: hotReplies.length,
    topSources,
    scorecard,
    executed,
    slack,
  };
}
