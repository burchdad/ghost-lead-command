import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type SourceScorecardRow = {
  source: string;
  leads: number;
  pending: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  replies: number;
  hotReplies: number;
  booked: number;
  pipeline: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  hotRate: number;
  failRate: number;
  score: number;
  verdict: "scale" | "watch" | "fix" | "prove";
  nextMove: string;
};

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function emptyRow(source: string): SourceScorecardRow {
  return {
    source,
    leads: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    failed: 0,
    replies: 0,
    hotReplies: 0,
    booked: 0,
    pipeline: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0,
    replyRate: 0,
    hotRate: 0,
    failRate: 0,
    score: 0,
    verdict: "prove",
    nextMove: "Collect more send and reply data before scaling this source.",
  };
}

function finalize(row: SourceScorecardRow): SourceScorecardRow {
  const sentBase = Math.max(1, row.sent);
  const engagedBase = Math.max(1, row.replies);
  row.deliveryRate = rate(row.delivered, sentBase);
  row.openRate = rate(row.opened, sentBase);
  row.clickRate = rate(row.clicked, sentBase);
  row.replyRate = rate(row.replies, sentBase);
  row.hotRate = rate(row.hotReplies + row.booked, engagedBase);
  row.failRate = rate(row.failed, Math.max(1, row.sent + row.failed));
  row.score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        row.replyRate * 5 +
          row.hotRate * 0.5 +
          row.clickRate * 2 +
          row.openRate * 0.25 +
          Math.min(20, row.leads) -
          row.failRate * 1.2,
      ),
    ),
  );

  if (row.sent >= 5 && row.replyRate >= 4 && row.failRate < 10) {
    row.verdict = "scale";
    row.nextMove = "Scale cautiously: source more like this and approve the next reviewed batch.";
  } else if (row.failed >= 3 || row.failRate >= 20) {
    row.verdict = "fix";
    row.nextMove = "Protect deliverability before adding more volume from this source.";
  } else if (row.sent >= 3 || row.leads >= 10) {
    row.verdict = "watch";
    row.nextMove = "Keep testing this source, but require stronger signal proof before scaling.";
  } else {
    row.verdict = "prove";
    row.nextMove = "Run a small controlled batch and wait for delivery/reply data.";
  }
  return row;
}

export async function getSourceScorecard() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const [leads, queue, replies, interactions] = await Promise.all([
    prisma.lead.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 3000 }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.interaction.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid" },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 3000,
    }),
  ]);

  const rows = new Map<string, SourceScorecardRow>();
  const sourceByLeadId = new Map<string, string>();

  function rowFor(source: string) {
    const key = source || "Unknown";
    if (!rows.has(key)) rows.set(key, emptyRow(key));
    return rows.get(key)!;
  }

  for (const lead of leads) {
    const row = rowFor(lead.source);
    sourceByLeadId.set(lead.id, lead.source || "Unknown");
    row.leads += 1;
    row.pipeline += lead.value || 0;
    if (lead.stage === "Call Booked") row.booked += 1;
  }

  for (const item of queue) {
    if (!item.leadId) continue;
    const row = rowFor(sourceByLeadId.get(item.leadId) || "Unknown");
    if (item.status === "pending") row.pending += 1;
    if (["queued", "sent"].includes(item.status)) row.sent += 1;
    if (item.status === "failed") row.failed += 1;
  }

  for (const reply of replies) {
    if (!reply.leadId) continue;
    const row = rowFor(sourceByLeadId.get(reply.leadId) || "Unknown");
    row.replies += 1;
    if (["hot", "booked", "objection"].includes(reply.classification)) row.hotReplies += 1;
    if (reply.classification === "booked") row.booked += 1;
  }

  for (const interaction of interactions) {
    const source = interaction.lead?.source || "Unknown";
    const row = rowFor(source);
    const type = String(interaction.classification || "").toLowerCase();
    if (type === "delivered") row.delivered += 1;
    if (type === "open") row.opened += 1;
    if (type === "click") row.clicked += 1;
    if (["bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"].includes(type)) row.failed += 1;
  }

  const scorecard = [...rows.values()].map(finalize).sort((a, b) => b.score - a.score || b.replies - a.replies || b.sent - a.sent);
  const top = scorecard[0];
  const weakest = [...scorecard].sort((a, b) => b.failRate - a.failRate || b.failed - a.failed)[0];
  const recommendation = top
    ? top.verdict === "scale"
      ? `Scale ${top.source}: ${top.replyRate}% reply rate, ${top.failRate}% fail rate.`
      : `Keep ${top.source} under observation; strongest current source is not fully proven yet.`
    : "Run a controlled source batch so Vega can build source attribution.";

  return {
    rows: scorecard,
    summary: {
      sources: scorecard.length,
      scaleReady: scorecard.filter((row) => row.verdict === "scale").length,
      needsFix: scorecard.filter((row) => row.verdict === "fix").length,
      topSource: top?.source || "none",
      weakestSource: weakest?.source || "none",
      recommendation,
    },
  };
}
