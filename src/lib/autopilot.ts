import { createAutomationEvent } from "@/lib/automation";
import { recommendNiche, runLeadCommandAgent } from "@/lib/agent";
import { getPrisma } from "@/lib/prisma";
import { runReplyConversionSweep } from "@/lib/replies";
import {
  notifySlackAgentPlan,
  notifySlackDailyDigest,
  notifySlackNicheRecommendation,
  notifySlackReplyWorkResult,
} from "@/lib/slack";
import type { SourceProvider } from "@/lib/sourcing";
import { getDefaultWorkspace } from "@/lib/workspace";

export type AgentPlan = {
  provider: SourceProvider;
  niche: string;
  query: string;
  location: string;
  locations?: string[];
  industries: string[];
  minScore: number;
  queueLimit: number;
  size: number;
  rationale: string[];
  source: "daily" | "slack-command" | "reroll";
};

const knownNiches = [
  "roofing",
  "hvac",
  "dental",
  "med spa",
  "auto detail",
  "construction",
  "plumbing",
  "landscaping",
  "chiropractor",
  "law firm",
];

const localServiceNiches = new Set(["roofing", "hvac", "dental", "med spa", "auto detail", "construction", "plumbing", "landscaping", "chiropractor", "law firm"]);

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanLocation(value: unknown) {
  return clean(value).replace(/[.!?]+$/, "");
}

function parseLocation(text: string) {
  const betweenMatch = text.match(/\bbetween\s+(.+?)(?:\s+(?:for|with|at|over|under|score|limit|size|today|tomorrow)|$)/i);
  if (betweenMatch?.[1]) return cleanLocation(betweenMatch[1]);

  const nearMatch = text.match(/\b(?:near|around|outside of)\s+(.+?)(?:\s+(?:for|with|at|over|under|score|limit|size|today|tomorrow)|$)/i);
  if (nearMatch?.[1]) return cleanLocation(nearMatch[1]);

  const match = text.match(/\bin\s+([a-zA-Z\s,]+?)(?:\s+(?:with|at|over|under|score|limit|today|tomorrow)|$)/i);
  return cleanLocation(match?.[1]) || "United States";
}

function parseLocationMarkets(text: string, location: string) {
  const normalized = clean(text).toLowerCase();
  if (!/\bbetween\b/.test(normalized)) return undefined;

  if (normalized.includes("tyler") && normalized.includes("dallas")) {
    return [
      "Tyler, TX",
      "Lindale, TX",
      "Mineola, TX",
      "Canton, TX",
      "Wills Point, TX",
      "Terrell, TX",
      "Forney, TX",
      "Dallas, TX",
    ];
  }

  const match = normalized.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?:\s+(?:texas|tx|for|with|at|over|under|score|limit|size|today|tomorrow)|[.!?]*$)/i);
  if (!match) return undefined;
  const state = normalized.includes("texas") || normalized.includes(" tx") ? "TX" : "";
  const endpoints = [match[1], match[2]]
    .map((part) => titleCase(cleanLocation(part).replace(/\btexas\b|\btx\b/gi, "").replace(/,+$/, "")))
    .filter(Boolean)
    .map((city) => (state && !city.includes(",") ? `${city}, ${state}` : city));
  const fallback = clean(location);
  return Array.from(new Set([...endpoints, ...(fallback ? [fallback] : [])])).slice(0, 8);
}

function parseLeadCount(text: string) {
  const match =
    text.match(/\bneed\s+(\d+)\s+(?:new\s+)?leads?\b/i) ||
    text.match(/\b(\d+)\s+(?:new\s+)?leads?\b/i) ||
    text.match(/\bfind\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function maxRequestedQueueLimit() {
  const value = Number(process.env.AGENT_MAX_REQUEST_QUEUE_LIMIT || process.env.AGENT_DAILY_QUEUE_LIMIT || 40);
  return Number.isFinite(value) && value > 0 ? value : 40;
}

function maxRequestedSourceSize() {
  const value = Number(process.env.AGENT_MAX_REQUEST_SOURCE_SIZE || process.env.AGENT_DAILY_SOURCE_LIMIT || 150);
  return Number.isFinite(value) && value > 0 ? value : 150;
}

function parseNumber(text: string, label: "score" | "limit" | "size", fallback: number) {
  const match = text.match(new RegExp(`\\b${label}\\s*(?:above|over|of|=|:)?\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : fallback;
}

function parseProvider(text: string, niche: string): SourceProvider {
  if (text.includes("google maps") || text.includes("map")) return "google-maps";
  if (text.includes("pdl") || text.includes("people data labs")) return "pdl";
  if (text.includes("ghost lead agent") || text.includes("web helper")) return "ghost-lead-agent";
  return localServiceNiches.has(niche.toLowerCase()) ? "google-maps" : "pdl";
}

function commandQuery(niche: string, text: string) {
  const lowerNiche = niche.toLowerCase();
  if (localServiceNiches.has(lowerNiche)) {
    return `${lowerNiche} companies owners operators that need missed-call follow-up, quote follow-up, booking automation, or speed-to-lead help`;
  }
  if (/could use our services|need our services|our services/i.test(text)) {
    return `owners founders growth operators at ${lowerNiche} companies that need qualified lead generation, follow-up automation, and booked calls`;
  }
  return `owners and operators of ${lowerNiche} companies`;
}

export function createAgentPlan(input: {
  text?: string;
  exclude?: string[];
  source?: AgentPlan["source"];
} = {}): AgentPlan {
  const text = clean(input.text).toLowerCase();
  const explicitNiche = knownNiches.find((niche) => text.includes(niche));
  const recommended = recommendNiche({ exclude: input.exclude });
  const niche = explicitNiche ? titleCase(explicitNiche) : recommended.niche;
  const provider = parseProvider(text, niche);
  const location = text ? parseLocation(text) : recommended.location;
  const locations = text ? parseLocationMarkets(text, location) : undefined;
  const industries = explicitNiche
    ? [titleCase(explicitNiche), explicitNiche === "roofing" ? "Construction" : "Local Services"]
    : recommended.industries;
  const minScore = parseNumber(text, "score", recommended.minScore);
  const requestedLeads = parseLeadCount(text);
  const queueLimit = Math.min(maxRequestedQueueLimit(), Math.max(1, requestedLeads || parseNumber(text, "limit", recommended.queueLimit)));
  const size = Math.min(maxRequestedSourceSize(), Math.max(queueLimit, parseNumber(text, "size", Math.max(30, queueLimit * 3))));

  return {
    provider,
    niche,
    query: explicitNiche ? commandQuery(niche, text) : recommended.query,
    location,
    locations,
    industries,
    minScore,
    queueLimit,
    size,
    rationale: explicitNiche
      ? [
          `Operator requested ${niche}, so the agent will stay inside that market.`,
          `Vega will use ${provider === "google-maps" ? "Google Maps/web contact discovery" : provider === "ghost-lead-agent" ? "Ghost Lead Intelligence" : "People Data Labs"} for this run.`,
          locations?.length ? `Route market expanded into ${locations.length} nearby searches.` : "",
          "The run will source fresh contacts, dedupe, score, draft email-first outreach, and wait for approvals.",
          "Slack remains the control surface for approval, rewrite, discard, and suppression decisions.",
        ].filter(Boolean)
      : recommended.rationale,
    source: input.source || "slack-command",
  };
}

export async function sendAgentPlan(input: {
  text?: string;
  exclude?: string[];
  source?: AgentPlan["source"];
} = {}) {
  const plan = createAgentPlan(input);
  const slack = await notifySlackAgentPlan(plan);

  await createAutomationEvent({
    title: "AI operator plan proposed",
    detail: `${plan.niche} plan proposed from ${plan.source}.`,
    status: slack.sent ? "done" : "blocked",
    type: "agent",
    payload: { plan, slack },
  });

  return { plan, slack };
}

export async function approveAgentPlan(plan: AgentPlan) {
  await createAutomationEvent({
    title: "AI operator plan approved",
    detail: `${plan.niche} scan approved from Slack.`,
    status: "running",
    type: "agent",
    payload: { plan },
  });

  return runLeadCommandAgent({
    provider: plan.provider,
    query: plan.query,
    location: plan.location,
    locations: plan.locations,
    industries: plan.industries,
    minScore: plan.minScore,
    queueLimit: plan.queueLimit,
    size: plan.size,
  });
}

export function isLeadRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  if (!normalized) return false;
  return (
    /\b(?:need|find|get|source|pull|bring me|give me)\b/.test(normalized) &&
    /\bleads?\b/.test(normalized)
  );
}

export function isReplyWorkRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  if (!normalized) return false;
  return (
    /\b(?:reply|replies|inbox|respond|follow[-\s]?up|booking|bookings|calendar)\b/.test(normalized) &&
    /\b(?:work|push|convert|handle|process|queue|draft|book|approve|follow)\b/.test(normalized)
  );
}

function parseReplyWorkLimit(text: string) {
  const match =
    text.match(/\b(?:work|process|handle|queue|draft|push)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:replies|reply|bookings|hot)\b/i) ||
    text.match(/\blimit\s*(?:=|:)?\s*(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

export async function runVegaLeadRequest(input: { text: string }) {
  const plan = createAgentPlan({ text: input.text, source: "slack-command" });
  const result = await approveAgentPlan(plan);
  return { plan, result };
}

export async function runVegaReplyWork(input: { text: string }) {
  const result = await runReplyConversionSweep({
    limit: parseReplyWorkLimit(input.text) || 10,
    lookbackHours: /week|7\s*days/i.test(input.text) ? 168 : 72,
  });
  const slack = await notifySlackReplyWorkResult({
    instruction: input.text,
    summary: result.message,
    reviewed: result.reviewed,
    queued: result.queued,
    alreadyPending: result.alreadyPending,
    missingContact: result.missingContact,
    bookingReady: result.bookingReady,
    bookingBlocked: result.bookingBlocked,
    results: result.results,
  });
  return { result, slack };
}


export async function sendDailyRecommendation() {
  const plan = createAgentPlan({ source: "daily" });
  const slack = await notifySlackNicheRecommendation(plan);

  await createAutomationEvent({
    title: "Daily niche recommendation",
    detail: `Recommended ${plan.niche} for today's AI operator scan.`,
    status: slack.sent ? "done" : "blocked",
    type: "agent",
    payload: { plan, slack },
  });

  return { recommendation: plan, slack };
}

export async function sendDailyDigest() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [leads, queue, replies, events] = await Promise.all([
    prisma.lead.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.automationEvent.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { lead: true },
    }),
  ]);

  const pending = await prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending" } });
  const hotReplies = replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification));
  const digest = {
    leadsSourced: leads.length,
    outreachQueued: queue.filter((item) => item.status === "pending").length,
    sentOrApproved: queue.filter((item) => ["queued", "sent"].includes(item.status)).length,
    replies: replies.length,
    hotReplies: hotReplies.length,
    pendingApprovals: pending,
    recentEvents: events.map((event) => ({
      title: event.title,
      detail: event.detail,
      status: event.status,
      lead: event.lead?.companyName || null,
    })),
  };

  const slack = await notifySlackDailyDigest(digest);
  await createAutomationEvent({
    title: "Daily ops digest",
    detail: `Posted digest: ${digest.leadsSourced} new leads, ${digest.pendingApprovals} pending approvals.`,
    status: slack.sent ? "done" : "blocked",
    type: "agent",
    payload: { digest, slack },
  });

  return { digest, slack };
}
