import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

type Row = {
  key: string;
  leads: number;
  queued: number;
  sent: number;
  failed: number;
  replies: number;
  hot: number;
  booked: number;
  pipeline: number;
};

function emptyRow(key: string): Row {
  return { key, leads: 0, queued: 0, sent: 0, failed: 0, replies: 0, hot: 0, booked: 0, pipeline: 0 };
}

function classifySignal(text: string) {
  const lower = text.toLowerCase();
  if (/competitor|linkedin|social|follow|comment|like|post/.test(lower)) return "social intent";
  if (/job|hiring|headcount|funding|raised|launch/.test(lower)) return "company change";
  if (/google|maps|review|rating|search|website|traffic|seo/.test(lower)) return "search and website signal";
  if (/missed|form|calendar|booking|demo|conversion|reply|follow-up|leak/.test(lower)) return "pipeline leak";
  if (/email|phone|contact|profile/.test(lower)) return "contact path";
  return "general ICP signal";
}

function extractSignalText(nextAction: string) {
  const match = nextAction.match(/Signal:\s*(.+)$/i);
  return (match?.[1] || nextAction || "No signal captured").slice(0, 220);
}

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function toInsight(row: Row) {
  const replyRate = rate(row.replies, Math.max(row.sent + row.queued, row.queued));
  const hotRate = rate(row.hot + row.booked, Math.max(row.replies, 1));
  const failureRate = rate(row.failed, Math.max(row.queued + row.sent + row.failed, 1));
  const quality =
    row.leads >= 3 && replyRate >= 5 ? "scale" :
    row.leads >= 2 && row.replies > 0 ? "watch" :
    failureRate >= 25 ? "suppress/check" :
    "needs proof";

  return {
    ...row,
    replyRate,
    hotRate,
    failureRate,
    quality,
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const [leads, queue, replies] = await Promise.all([
      prisma.lead.findMany({
        where: { workspaceId: workspace.id },
        include: { contact: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    ]);

    const queueByLead = new Map<string, typeof queue>();
    for (const item of queue) {
      if (!item.leadId) continue;
      queueByLead.set(item.leadId, [...(queueByLead.get(item.leadId) || []), item]);
    }

    const repliesByLead = new Map<string, typeof replies>();
    for (const reply of replies) {
      if (!reply.leadId) continue;
      repliesByLead.set(reply.leadId, [...(repliesByLead.get(reply.leadId) || []), reply]);
    }

    const bySource = new Map<string, Row>();
    const byNiche = new Map<string, Row>();
    const bySignal = new Map<string, Row>();
    const examples: { company: string; source: string; signal: string; score: number; stage: string }[] = [];

    function apply(row: Row, leadId: string, leadStage: string, value: number) {
      const leadQueue = queueByLead.get(leadId) || [];
      const leadReplies = repliesByLead.get(leadId) || [];
      row.leads += 1;
      row.pipeline += value || 0;
      row.queued += leadQueue.filter((item) => item.status === "pending").length;
      row.sent += leadQueue.filter((item) => ["queued", "sent"].includes(item.status)).length;
      row.failed += leadQueue.filter((item) => item.status === "failed").length;
      row.replies += leadReplies.length;
      row.hot += leadReplies.filter((reply) => ["hot", "objection"].includes(reply.classification)).length;
      row.booked += leadReplies.filter((reply) => reply.classification === "booked").length + (leadStage === "Call Booked" ? 1 : 0);
    }

    for (const lead of leads) {
      const sourceKey = lead.source || "Unknown";
      const nicheKey = lead.niche || "Unknown";
      const signalText = extractSignalText(lead.nextAction);
      const signalKey = classifySignal(signalText);

      if (!bySource.has(sourceKey)) bySource.set(sourceKey, emptyRow(sourceKey));
      if (!byNiche.has(nicheKey)) byNiche.set(nicheKey, emptyRow(nicheKey));
      if (!bySignal.has(signalKey)) bySignal.set(signalKey, emptyRow(signalKey));

      apply(bySource.get(sourceKey)!, lead.id, lead.stage, lead.value);
      apply(byNiche.get(nicheKey)!, lead.id, lead.stage, lead.value);
      apply(bySignal.get(signalKey)!, lead.id, lead.stage, lead.value);

      if (examples.length < 8 && signalText !== "No signal captured") {
        examples.push({ company: lead.companyName, source: sourceKey, signal: signalText, score: lead.score, stage: lead.stage });
      }
    }

    const sources = [...bySource.values()].map(toInsight).sort((a, b) => b.replyRate - a.replyRate || b.leads - a.leads);
    const niches = [...byNiche.values()].map(toInsight).sort((a, b) => b.replyRate - a.replyRate || b.pipeline - a.pipeline);
    const signals = [...bySignal.values()].map(toInsight).sort((a, b) => b.hot + b.booked - (a.hot + a.booked) || b.leads - a.leads);
    const bestSource = sources.find((row) => row.leads >= 2) || sources[0];
    const bestSignal = signals.find((row) => row.replies > 0) || signals[0];
    const failed = queue.filter((item) => item.status === "failed").length;
    const sentOrQueued = queue.filter((item) => ["queued", "sent"].includes(item.status)).length;
    const overallReplyRate = rate(replies.length, Math.max(sentOrQueued, 1));

    const recommendations = [
      bestSource
        ? `Favor ${bestSource.key} next: ${bestSource.replyRate}% reply rate across ${bestSource.leads} leads.`
        : "Run at least one source campaign so the learning agent has conversion data.",
      bestSignal
        ? `Keep collecting ${bestSignal.key} evidence; it is the strongest current signal bucket.`
        : "Require explicit signal evidence before queueing cold outreach.",
      failed > 0
        ? `Review ${failed} failed sends and suppress repeated bounce domains before increasing volume.`
        : "Deliverability is clean enough for a cautious volume increase.",
      overallReplyRate < 3
        ? "Keep daily volume moderate and test sharper signal-first copy before scaling auto-send."
        : "Reply rate is viable; increase queue cap only on the top-performing source/signal pair.",
    ];

    return NextResponse.json({
      summary: {
        leads: leads.length,
        sentOrQueued,
        replies: replies.length,
        hot: replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length,
        failed,
        overallReplyRate,
        gojiBerryCloseness: "60-68%",
      },
      sources: sources.slice(0, 8),
      niches: niches.slice(0, 8),
      signals: signals.slice(0, 8),
      examples,
      recommendations,
      gaps: [
        "Real-time LinkedIn competitor engagement and profile-activity monitoring",
        "Automatic ICP extraction from the user's website",
        "Automatic campaign self-tuning based on reply and booked-call outcomes",
        "Native social DM orchestration",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Learning loop unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
