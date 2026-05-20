import { createAutomationEvent } from "@/lib/automation";
import { recommendNiche, runLeadCommandAgent } from "@/lib/agent";
import { getPrisma } from "@/lib/prisma";
import {
  notifySlackAgentPlan,
  notifySlackDailyDigest,
  notifySlackNicheRecommendation,
} from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

export type AgentPlan = {
  niche: string;
  query: string;
  location: string;
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

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function parseLocation(text: string) {
  const match = text.match(/\bin\s+([a-zA-Z\s,]+?)(?:\s+(?:with|at|over|under|score|limit|today|tomorrow)|$)/i);
  return clean(match?.[1]) || "United States";
}

function parseNumber(text: string, label: "score" | "limit" | "size", fallback: number) {
  const match = text.match(new RegExp(`\\b${label}\\s*(?:above|over|of|=|:)?\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : fallback;
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
  const location = text ? parseLocation(text) : recommended.location;
  const industries = explicitNiche
    ? [titleCase(explicitNiche), explicitNiche === "roofing" ? "Construction" : "Local Services"]
    : recommended.industries;
  const minScore = parseNumber(text, "score", recommended.minScore);
  const queueLimit = Math.min(10, Math.max(1, parseNumber(text, "limit", recommended.queueLimit)));
  const size = Math.min(50, Math.max(queueLimit, parseNumber(text, "size", Math.max(15, queueLimit * 3))));

  return {
    niche,
    query: explicitNiche
      ? `owners and operators of ${explicitNiche} companies`
      : recommended.query,
    location,
    industries,
    minScore,
    queueLimit,
    size,
    rationale: explicitNiche
      ? [
          `Operator requested ${niche}, so the agent will stay inside that market.`,
          "The run will source fresh contacts, dedupe, score, draft email-first outreach, and wait for approvals.",
          "Slack remains the control surface for approval, rewrite, discard, and suppression decisions.",
        ]
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
    provider: "pdl",
    query: plan.query,
    location: plan.location,
    industries: plan.industries,
    minScore: plan.minScore,
    queueLimit: plan.queueLimit,
    size: plan.size,
  });
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
