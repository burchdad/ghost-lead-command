import { getPerplexityStatus } from "@/lib/perplexity";
import { getSenderHealth } from "@/lib/conversion-quality";
import { getPrisma } from "@/lib/prisma";
import { signalPlays } from "@/lib/signal-plays";
import { getDefaultWorkspace } from "@/lib/workspace";

export type LearningRow = {
  key: string;
  leads: number;
  queued: number;
  sent: number;
  failed: number;
  replies: number;
  hot: number;
  booked: number;
  pipeline: number;
  replyRate: number;
  hotRate: number;
  failureRate: number;
  quality: "scale" | "watch" | "suppress/check" | "needs proof";
};

export type ConversionLearning = {
  summary: {
    leads: number;
    sentOrQueued: number;
    replies: number;
    hot: number;
    failed: number;
    overallReplyRate: number;
    gojiBerryCloseness: string;
    socialSignalCoverage: number;
    senderHealth: string;
    bounceRate: number;
    recommendedPlayIds: string[];
  };
  sources: LearningRow[];
  niches: LearningRow[];
  signals: LearningRow[];
  examples: { company: string; source: string; signal: string; score: number; stage: string }[];
  recommendations: string[];
  gaps: string[];
  nextActions: string[];
};

type MutableRow = Omit<LearningRow, "replyRate" | "hotRate" | "failureRate" | "quality">;

function emptyRow(key: string): MutableRow {
  return { key, leads: 0, queued: 0, sent: 0, failed: 0, replies: 0, hot: 0, booked: 0, pipeline: 0 };
}

function clean(value: unknown) {
  return String(value || "").trim();
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

function toInsight(row: MutableRow): LearningRow {
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

function recommendedPlays(input: { bestSource?: LearningRow; bestSignal?: LearningRow; replyRate: number; socialCoverage: number }) {
  const ids = new Set<string>();
  const signalKey = clean(input.bestSignal?.key).toLowerCase();
  const sourceKey = clean(input.bestSource?.key).toLowerCase();

  if (/social|linkedin|competitor/.test(signalKey) || /linkedin|sales nav/.test(sourceKey)) {
    ids.add("linkedin-competitor-engagement");
    ids.add("b2b-saas-growth");
  }
  if (/search|website|google|maps|pipeline leak/.test(signalKey) || /google|maps/.test(sourceKey)) {
    ids.add("local-high-ticket");
    ids.add("local-hvac-missed-call");
  }
  if (/company change|growth|funding|hiring/.test(signalKey)) {
    ids.add("b2b-saas-growth");
    ids.add("event-led-growth");
  }
  if (input.replyRate < 3) {
    ids.add("linkedin-competitor-engagement");
    ids.add("local-high-ticket");
  }
  if (input.socialCoverage < 25) ids.add("linkedin-competitor-engagement");

  for (const play of signalPlays) {
    if (ids.size >= 4) break;
    ids.add(play.id);
  }
  return [...ids].filter((id) => signalPlays.some((play) => play.id === id)).slice(0, 4);
}

function closenessScore(input: {
  leads: number;
  sentOrQueued: number;
  replies: number;
  hot: number;
  failed: number;
  replyRate: number;
  socialCoverage: number;
  perplexity: boolean;
  booked: number;
}) {
  let base = 68;
  if (input.leads >= 75) base += 4;
  if (input.sentOrQueued >= 50) base += 4;
  if (input.replyRate >= 2) base += 4;
  if (input.replyRate >= 5) base += 5;
  if (input.hot > 0) base += 3;
  if (input.booked > 0) base += 4;
  if (input.socialCoverage >= 20) base += 4;
  if (input.perplexity) base += 3;
  if (input.failed > Math.max(4, input.sentOrQueued * 0.12)) base -= 5;
  const low = Math.max(55, Math.min(88, base - 3));
  const high = Math.max(low + 4, Math.min(92, base + 4));
  return `${low}-${high}%`;
}

export async function computeConversionLearning(): Promise<ConversionLearning> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const [leads, queue, replies, senderHealth] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: workspace.id },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    getSenderHealth({ workspaceId: workspace.id }),
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

  const bySource = new Map<string, MutableRow>();
  const byNiche = new Map<string, MutableRow>();
  const bySignal = new Map<string, MutableRow>();
  const examples: ConversionLearning["examples"] = [];

  function apply(row: MutableRow, leadId: string, leadStage: string, value: number) {
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
  const hot = replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length;
  const booked = replies.filter((reply) => reply.classification === "booked").length + leads.filter((lead) => lead.stage === "Call Booked").length;
  const overallReplyRate = rate(replies.length, Math.max(sentOrQueued, 1));
  const socialSignals = signals.find((row) => row.key === "social intent")?.leads || 0;
  const socialSignalCoverage = rate(socialSignals, Math.max(leads.length, 1));
  const recommendedPlayIds = recommendedPlays({ bestSource, bestSignal, replyRate: overallReplyRate, socialCoverage: socialSignalCoverage });
  const perplexity = getPerplexityStatus();

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
    senderHealth.mode !== "healthy"
      ? `Hold or reduce auto-send volume: sender health is ${senderHealth.mode} with ${senderHealth.bounceRate}% risky SendGrid events.`
      : `Sender health is healthy at ${senderHealth.bounceRate}% risky SendGrid events.`,
    overallReplyRate < 3
      ? "Keep daily volume moderate and test sharper signal-first copy before scaling auto-send."
      : "Reply rate is viable; increase queue cap only on the top-performing source/signal pair.",
  ];

  const nextActions = [
    recommendedPlayIds.length ? `Activate or refresh these source plays: ${recommendedPlayIds.join(", ")}.` : "",
    socialSignalCoverage < 25 ? "Run Vega social intent scout to add LinkedIn/competitor-style trigger evidence." : "",
    failed || senderHealth.mode !== "healthy" ? "Run Vega protect deliverability before increasing send volume." : "",
    replies.length ? "Run Vega work replies and push bookings after each send batch." : "Approve a small reviewed batch, then watch SendGrid events before adding more volume.",
  ].filter(Boolean);

  return {
    summary: {
      leads: leads.length,
      sentOrQueued,
      replies: replies.length,
      hot,
      failed,
      overallReplyRate,
      gojiBerryCloseness: closenessScore({
        leads: leads.length,
        sentOrQueued,
        replies: replies.length,
        hot,
        failed,
        replyRate: overallReplyRate,
        socialCoverage: socialSignalCoverage,
        perplexity: perplexity.configured,
        booked,
      }),
      socialSignalCoverage,
      senderHealth: senderHealth.mode,
      bounceRate: senderHealth.bounceRate,
      recommendedPlayIds,
    },
    sources: sources.slice(0, 8),
    niches: niches.slice(0, 8),
    signals: signals.slice(0, 8),
    examples,
    recommendations,
    gaps: [
      "Native LinkedIn lead sync is still gated by LinkedIn approval.",
      "Automatic social DM orchestration should stay manual/compliant until account limits are proven.",
      "Booked-call conversion learning needs more reply and calendar outcomes.",
    ],
    nextActions,
  };
}
