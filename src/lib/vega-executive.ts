import { computeConversionLearning, type ConversionLearning } from "@/lib/conversion-learning";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type VegaExecutiveIntent =
  | "pipeline_status"
  | "rank_leads"
  | "compare_leads"
  | "explain_lead"
  | "sales_memory"
  | "team_work"
  | "unsupported_action";

export type VegaExecutiveRequest = {
  intent: VegaExecutiveIntent;
  limit: number;
  companyNames: string[];
};

export type VegaExecutiveResult = {
  intent: VegaExecutiveIntent;
  summary: string;
  detail: string;
  grounded: true;
  model: string;
};

type RankedLead = {
  companyName: string;
  contactName: string;
  score: number;
  rankScore: number;
  stage: string;
  source: string;
  reason: string;
  nextAction: string;
};

const supportedIntents: VegaExecutiveIntent[] = [
  "pipeline_status",
  "rank_leads",
  "compare_leads",
  "explain_lead",
  "sales_memory",
  "team_work",
  "unsupported_action",
];

function clean(value: unknown) {
  return String(value || "").trim();
}

function clampLimit(value: unknown, fallback = 5) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(10, Math.max(1, Math.round(parsed))) : fallback;
}

function requestedLimit(text: string) {
  const match = text.match(/\b(?:top|best|warmest|show|rank|compare|put|queue)?\s*(\d{1,2})\b/i);
  return clampLimit(match?.[1], 5);
}

export function classifyVegaExecutiveRequest(text: string): VegaExecutiveRequest {
  const normalized = clean(text).toLowerCase();
  const limit = requestedLimit(normalized);

  if (/\b(?:compare|versus|vs\.?|better than)\b/.test(normalized) || /why is\s+#?\d+\s+better than\s+#?\d+/.test(normalized)) {
    return { intent: "compare_leads", limit: Math.max(2, limit), companyNames: [] };
  }
  if (
    /\b(?:best|top|warmest|most likely|highest[- ]intent|rank)\b.*\b(?:leads?|accounts?|prospects?)/.test(normalized) ||
    /\b(?:leads?|accounts?|prospects?)\b.*\b(?:best|warmest|most likely|highest[- ]intent)\b/.test(normalized)
  ) {
    return { intent: "rank_leads", limit, companyNames: [] };
  }
  if (/\bwhy\b.*\b(?:lead|account|prospect|sent|send|queued|research|call-first|suppressed)/.test(normalized)) {
    return { intent: "explain_lead", limit: 1, companyNames: [] };
  }
  if (/\b(?:what(?:'s| is) (?:my|the) team working|team work|calls due|human work|setter work|alex working|work today)\b/.test(normalized)) {
    return { intent: "team_work", limit, companyNames: [] };
  }
  if (/\b(?:what(?:'s| is) converting|converting best|conversion|best source|best niche|winning (?:source|niche|signal)|allocate|sales memory|what have we learned)\b/.test(normalized)) {
    return { intent: "sales_memory", limit, companyNames: [] };
  }
  if (/\b(?:status|pipeline|how are we doing|scoreboard|numbers|performance|bottleneck)\b/.test(normalized)) {
    return { intent: "pipeline_status", limit, companyNames: [] };
  }
  if (/\b(?:assign|put|move|delete|send|approve|suppress|queue)\b/.test(normalized)) {
    return { intent: "unsupported_action", limit, companyNames: [] };
  }
  return { intent: "pipeline_status", limit, companyNames: [] };
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function interpretWithOpenAI(text: string): Promise<VegaExecutiveRequest | null> {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: clean(process.env.VEGA_EXECUTIVE_MODEL) || clean(process.env.OPENAI_MODEL) || "gpt-4.1-mini",
      max_output_tokens: 220,
      input: [
        "You interpret natural-language requests for Vega, an AI sales director.",
        "Choose exactly one read-only intent: pipeline_status, rank_leads, compare_leads, explain_lead, sales_memory, team_work, unsupported_action.",
        "Use unsupported_action for any request that would write, assign, send, approve, suppress, delete, or change records. Existing deterministic Vega commands handle those actions separately.",
        "Return only JSON with keys intent, limit, companyNames. limit must be 1-10 and companyNames must be an array.",
        `Request: ${text}`,
      ].join("\n"),
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const output = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || "";
  const parsed = extractJsonObject(output);
  const intent = clean(parsed?.intent) as VegaExecutiveIntent;
  if (!supportedIntents.includes(intent)) return null;
  return {
    intent,
    limit: clampLimit(parsed?.limit),
    companyNames: Array.isArray(parsed?.companyNames) ? parsed.companyNames.map(clean).filter(Boolean).slice(0, 5) : [],
  };
}

export async function interpretVegaExecutiveRequest(text: string) {
  const deterministic = classifyVegaExecutiveRequest(text);
  if (deterministic.intent !== "pipeline_status" || /\b(?:status|pipeline|how are we doing|scoreboard|numbers|performance|bottleneck)\b/i.test(text)) {
    return { request: deterministic, model: "deterministic" };
  }
  const interpreted = await interpretWithOpenAI(text).catch(() => null);
  return { request: interpreted || deterministic, model: interpreted ? clean(process.env.VEGA_EXECUTIVE_MODEL) || clean(process.env.OPENAI_MODEL) || "gpt-4.1-mini" : "deterministic" };
}

function statusWeight(stage: string) {
  const normalized = stage.toLowerCase();
  if (/booked|appointment set/.test(normalized)) return 45;
  if (/replied|engaged|potential client/.test(normalized)) return 30;
  if (/contacted|follow-up/.test(normalized)) return 14;
  if (/rejected|dead|suppressed/.test(normalized)) return -40;
  return 0;
}

function rankLead(lead: {
  companyName: string;
  name: string;
  score: number;
  stage: string;
  source: string;
  nextAction: string;
  contact: { email: string | null; phone: string | null } | null;
  replies: Array<{ classification: string }>;
  bookingTasks: Array<{ status: string }>;
}): RankedLead {
  const hotReply = lead.replies.some((reply) => ["hot", "booked", "objection"].includes(reply.classification.toLowerCase()));
  const bookingReady = lead.bookingTasks.some((task) => ["ready", "scheduled", "booked"].includes(task.status.toLowerCase()));
  const contactPoints = (lead.contact?.email ? 6 : 0) + (lead.contact?.phone ? 5 : 0);
  const rankScore = Math.max(0, lead.score + statusWeight(lead.stage) + (hotReply ? 28 : 0) + (bookingReady ? 24 : 0) + contactPoints);
  const reason = bookingReady
    ? "booking task ready or scheduled"
    : hotReply
      ? "engaged reply signal"
      : lead.contact?.email && lead.contact?.phone
        ? "strong fit with verified email and phone"
        : lead.contact?.email
          ? "strong fit with email path"
          : lead.contact?.phone
            ? "strong fit with call path"
            : "fit score; contact enrichment still needed";
  return {
    companyName: lead.companyName,
    contactName: lead.name,
    score: lead.score,
    rankScore,
    stage: lead.stage,
    source: lead.source,
    reason,
    nextAction: lead.nextAction,
  };
}

function topLearningRow(rows: ConversionLearning["sources"]) {
  return rows.find((row) => row.leads >= 2) || rows[0];
}

async function executiveSnapshot() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const [leads, queue, replies, bookings, learning] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: workspace.id, status: "active" },
      include: { contact: true, replies: true, bookingTasks: true },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 250,
    }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 750 }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: dayStart } } }),
    prisma.bookingTask.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" }, take: 250 }),
    computeConversionLearning(),
  ]);
  return { leads, ranked: leads.map(rankLead).sort((a, b) => b.rankScore - a.rankScore), queue, replies, bookings, learning, now };
}

function rankedDetail(ranked: RankedLead[]) {
  return ranked.map((lead, index) => `${index + 1}. ${lead.companyName} (${lead.rankScore}) — ${lead.reason}. Next: ${lead.nextAction || "review account"}.`).join("\n");
}

export async function runVegaExecutive(input: { text: string }): Promise<VegaExecutiveResult> {
  const interpreted = await interpretVegaExecutiveRequest(input.text);
  const request = interpreted.request;
  const snapshot = await executiveSnapshot();
  const activeStages = new Map<string, number>();
  for (const lead of snapshot.leads) activeStages.set(lead.stage, (activeStages.get(lead.stage) || 0) + 1);
  const pending = snapshot.queue.filter((item) => item.status === "pending").length;
  const sentToday = snapshot.queue.filter((item) => item.sentAt && item.sentAt >= new Date(snapshot.now.getFullYear(), snapshot.now.getMonth(), snapshot.now.getDate())).length;
  const dueCalls = snapshot.bookings.filter((task) => !["done", "booked", "completed", "suppressed"].includes(task.status.toLowerCase()) && (!task.scheduledFor || task.scheduledFor <= snapshot.now)).length;

  if (request.intent === "rank_leads") {
    const ranked = snapshot.ranked.slice(0, request.limit);
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: ranked.length ? `Vega ranked the top ${ranked.length} active accounts from live Lead Command data.` : "No active accounts are available to rank.", detail: rankedDetail(ranked) || "No ranked leads.", };
  }
  if (request.intent === "compare_leads") {
    const compared = snapshot.ranked.slice(0, Math.max(2, Math.min(request.limit, 5)));
    const leader = compared[0];
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: leader ? `${leader.companyName} currently ranks first because of ${leader.reason}.` : "No active accounts are available to compare.", detail: rankedDetail(compared) || "No comparison available." };
  }
  if (request.intent === "explain_lead") {
    const requestedName = request.companyNames[0]?.toLowerCase();
    const lead = requestedName ? snapshot.ranked.find((item) => item.companyName.toLowerCase().includes(requestedName)) : snapshot.ranked[0];
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: lead ? `${lead.companyName} is in ${lead.stage} with a Vega rank of ${lead.rankScore}.` : "I could not match that company to an active lead.", detail: lead ? `Fit score ${lead.score}; source ${lead.source}; evidence: ${lead.reason}. Current next action: ${lead.nextAction || "review account"}.` : "Name the company exactly as it appears in Lead Command so Vega can explain it." };
  }
  if (request.intent === "sales_memory") {
    const bestSource = topLearningRow(snapshot.learning.sources);
    const bestNiche = topLearningRow(snapshot.learning.niches);
    const bestSignal = topLearningRow(snapshot.learning.signals);
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: `Vega Sales Memory has ${snapshot.learning.summary.leads} leads and ${snapshot.learning.summary.replies} replies in its current learning window.`, detail: [`Best source: ${bestSource ? `${bestSource.key} — ${bestSource.replyRate}% reply rate across ${bestSource.leads} leads` : "not enough proof"}.`, `Best niche: ${bestNiche ? `${bestNiche.key} — ${bestNiche.replyRate}% reply rate` : "not enough proof"}.`, `Strongest signal: ${bestSignal?.key || "not enough proof"}.`, ...snapshot.learning.recommendations.slice(0, 3)].join("\n") };
  }
  if (request.intent === "team_work") {
    const nextCalls = snapshot.bookings.filter((task) => !["done", "booked", "completed", "suppressed"].includes(task.status.toLowerCase())).slice(0, request.limit);
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: `${dueCalls} call or booking tasks are due now; ${pending} outreach items remain pending.`, detail: nextCalls.length ? nextCalls.map((task, index) => `${index + 1}. ${task.meetingTitle} — ${task.status}${task.ownerEmail ? ` — owner ${task.ownerEmail}` : ""}.`).join("\n") : "No open call or booking tasks were found." };
  }
  if (request.intent === "unsupported_action") {
    return { intent: request.intent, grounded: true, model: interpreted.model, summary: "I understood the requested change, but the executive reasoning layer cannot bypass Vega's execution policy.", detail: "Use Vega's existing sourcing, approval, call-work, or outreach command for writes. This boundary keeps GPT from sending, assigning, suppressing, or changing records without the deterministic policy engine." };
  }

  const stages = [...activeStages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([stage, count]) => `${stage}: ${count}`).join("; ");
  return { intent: "pipeline_status", grounded: true, model: interpreted.model, summary: `${snapshot.leads.length} active leads, ${pending} pending outreach items, ${sentToday} sent today, ${snapshot.replies.length} replies today, and ${dueCalls} calls due.`, detail: `Active stages: ${stages || "none"}. Sender health: ${snapshot.learning.summary.senderHealth} at ${snapshot.learning.summary.bounceRate}% risky events. Current reply rate: ${snapshot.learning.summary.overallReplyRate}%.` };
}
