import type { Prisma } from "@prisma/client";
import { approveOutreachQueueItem } from "@/lib/approval";
import { generateSalesText } from "@/lib/ai";
import { createAutomationEvent } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { evaluateSourceLead, prepareOperatorRun } from "@/lib/operator-policy";
import { getPrisma } from "@/lib/prisma";
import { searchFreshLeads, type SourceDiagnostics, type SourceLead, type SourceProvider } from "@/lib/sourcing";
import { findSuppressionMatch } from "@/lib/suppression";
import { notifySlackNicheRecommendation, notifySlackOutreachApproval } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

type AgentRunInput = {
  provider?: SourceProvider;
  query?: string;
  location?: string;
  locations?: string[];
  industries?: string[];
  titles?: string[];
  size?: number;
  minScore?: number;
  queueLimit?: number;
  autoSend?: boolean;
};

type AgentSourceResult = Awaited<ReturnType<typeof searchFreshLeads>> & {
  diagnostics?: SourceDiagnostics;
  reviewLeads?: SourceLead[];
};

type NicheRecommendation = {
  niche: string;
  query: string;
  location: string;
  industries: string[];
  minScore: number;
  queueLimit: number;
  rationale: string[];
};

const nichePlaybook: NicheRecommendation[] = [
  {
    niche: "B2B SaaS",
    query: "founders growth leaders revenue leaders at B2B SaaS companies",
    location: "United States",
    industries: ["Software", "SaaS", "Technology"],
    minScore: 84,
    queueLimit: 8,
    rationale: [
      "High ACV supports a fast pilot sale when pipeline creation is painful.",
      "Founders and revenue leaders understand outbound volume and conversion math.",
      "The pitch can be tied to warm-signal monitoring, enrichment, and booked demos.",
    ],
  },
  {
    niche: "Agencies",
    query: "founders owners growth operators at marketing agencies and B2B service firms",
    location: "United States",
    industries: ["Marketing", "Advertising", "Consulting", "B2B Services"],
    minScore: 82,
    queueLimit: 8,
    rationale: [
      "Agencies have immediate pressure to book sales calls for themselves and clients.",
      "A lead-engine offer is easy to demonstrate with their own ICP.",
      "One client acquisition can justify a setup fee quickly.",
    ],
  },
  {
    niche: "Recruiting and Staffing",
    query: "founders operators sales leaders at recruiting staffing and talent companies",
    location: "United States",
    industries: ["Staffing", "Recruiting", "Human Resources"],
    minScore: 82,
    queueLimit: 8,
    rationale: [
      "They already buy outbound, enrichment, and booked-meeting systems.",
      "Hiring and role-change signals map cleanly to buying intent.",
      "Sales cycles can be short when the offer is qualified calls.",
    ],
  },
  {
    niche: "Local High-Ticket Services",
    query: "owners operators growth managers at high ticket local service businesses",
    location: "United States",
    industries: ["Home Services", "Healthcare", "Professional Services"],
    minScore: 80,
    queueLimit: 8,
    rationale: [
      "Missed calls, slow form follow-up, and unworked quotes create immediate pain.",
      "Booked calls are a concrete deliverable, not an abstract AI promise.",
      "Setup plus monthly response desk can close fast when the leak is obvious.",
    ],
  },
  {
    niche: "Founder-Led Services",
    query: "founders owners principals of founder led B2B service companies",
    location: "United States",
    industries: ["Consulting", "Professional Services", "Business Services"],
    minScore: 80,
    queueLimit: 8,
    rationale: [
      "Founder-led businesses can approve pilots quickly.",
      "Their pain is usually simple: not enough qualified conversations.",
      "The offer can be positioned as done-for-you signal monitoring plus outreach.",
    ],
  },
];

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function boolFromEnv(name: string, fallback = false) {
  const value = clean(process.env[name]).toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

function normalizeDomain(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function parseGeneratedOutreach(text: string, companyName: string) {
  const trimmed = text.trim();
  const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/im);
  const subject = sanitizeSubject(subjectMatch?.[1]?.trim() || `Quick idea for ${companyName}`);
  const body = sanitizeCustomerMessage(trimmed.replace(/^Subject:\s*.+$/im, "").trim() || trimmed, {
    channel: "email",
  });
  return { subject, body };
}

function defaultNextAction(lead: SourceLead) {
  const signals = lead.signalSummary || lead.intentSignals?.slice(0, 3).join("; ");
  return `AI agent sourced ${lead.companyName}, scored ${lead.score}, and queued a first-touch opener for ${lead.name}. Buyer fit: ${lead.buyerFit}.${signals ? ` Signal: ${signals}.` : ""}`;
}

async function importSourceLead(sourceLead: SourceLead, workspaceId: string) {
  const prisma = getPrisma();
  const email = clean(sourceLead.email).toLowerCase();
  const phone = clean(sourceLead.phone);
  const companyName = clean(sourceLead.companyName);
  const contactName = clean(sourceLead.name);
  const domain = normalizeDomain((sourceLead as SourceLead & { website?: string }).website || "");

  const suppression = await findSuppressionMatch({
    email,
    phone,
    domain,
    companyName,
  });

  if (suppression) return { skipped: true as const, reason: "suppressed" };

  const duplicateChecks: Prisma.ContactWhereInput[] = [
    { name: contactName, company: { is: { name: companyName } } },
  ];
  if (email) duplicateChecks.push({ email });
  if (phone) duplicateChecks.push({ phone });

  const [existingContact, existingLead, existingCompany] = await Promise.all([
    prisma.contact.findFirst({
      where: { workspaceId, OR: duplicateChecks },
      select: { id: true },
    }),
    prisma.lead.findFirst({
      where: {
        workspaceId,
        OR: [
          { name: contactName, companyName },
          ...(email ? [{ contact: { is: { email } } }] : []),
          ...(phone ? [{ contact: { is: { phone } } }] : []),
        ],
      },
      select: { id: true },
    }),
    prisma.company.findFirst({
      where: {
        workspaceId,
        OR: [
          { name: companyName },
          ...(domain ? [{ website: { contains: domain, mode: "insensitive" as const } }] : []),
        ],
      },
      select: { id: true },
    }),
  ]);

  if (existingContact || existingLead || existingCompany) {
    return { skipped: true as const, reason: "duplicate" };
  }

  const company = await prisma.company.create({
    data: {
      workspaceId,
      name: companyName,
      niche: sourceLead.niche || "General",
      crmSource: sourceLead.source,
    },
  });

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      companyId: company.id,
      name: contactName,
      email: email || null,
      phone: phone || null,
      role: clean(sourceLead.title) || "Decision maker",
    },
  });

  const score = Number(sourceLead.score || 50);
  const value = score >= 95 ? 7500 : score >= 85 ? 5000 : 3500;
  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      companyId: company.id,
      contactId: contact.id,
      name: contact.name,
      companyName: company.name,
      niche: company.niche,
      stage: "Imported",
      score,
      value,
      source: sourceLead.source,
      lastTouch: "Never",
      nextAction: defaultNextAction(sourceLead),
      opportunities: {
        create: {
          companyId: company.id,
          title: `${company.name} AI follow-up install`,
          stage: "Imported",
          value,
          probability: Math.min(95, Math.max(20, score)),
        },
      },
    },
    include: { contact: true, company: true },
  });

  return { skipped: false as const, lead };
}

export async function runLeadCommandAgent(input: AgentRunInput = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const provider = input.provider || "pdl";
  const autoSend = input.autoSend ?? boolFromEnv("AGENT_AUTO_SEND", false);
  const requestedMinScore = Number(input.minScore || process.env.AGENT_MIN_CONTACT_SCORE || process.env.AGENT_MIN_LEAD_SCORE || 80);
  const requestedQueueLimit = Math.min(10, Math.max(1, Number(input.queueLimit || process.env.AGENT_QUEUE_LIMIT || 5)));
  const requestedSize = Math.min(
    50,
    Math.max(requestedQueueLimit, Number(input.size || process.env.AGENT_SOURCE_BATCH_SIZE || 15)),
  );
  const policy = await prepareOperatorRun({
    workspaceId: workspace.id,
    requestedSize,
    requestedQueueLimit,
    requestedMinScore,
  });

  if (policy.mode === "blocked") {
    await createAutomationEvent({
      title: "AI operator blocked by guardrails",
      detail: policy.blockedReasons.join(" "),
      status: "blocked",
      type: "agent",
      payload: { provider, policy },
    });

    return {
      provider,
      found: 0,
      qualified: 0,
      queued: 0,
      skipped: { guardrails: policy.blockedReasons.length },
      items: [],
      guardrails: policy,
      message: `AI operator paused: ${policy.blockedReasons.join(" ")}`,
    };
  }

  const minScore = policy.effective.minScore;
  const queueLimit = policy.effective.queueLimit;
  const size = policy.effective.size;

  await createAutomationEvent({
    title: "AI operator started",
    detail: `Sourcing ${size} leads from ${provider}, minimum score ${minScore}, queue limit ${queueLimit}. Guardrails active.`,
    status: "running",
    type: "agent",
    payload: { provider, minScore, queueLimit, size, policy, autoSend },
  });

  const sourceResult = await searchFreshLeads({
    provider,
    query:
      input.query ||
      process.env.AGENT_SOURCE_QUERY ||
      "founders revenue leaders growth operators at companies that need more qualified sales calls",
    location: input.location || process.env.AGENT_SOURCE_LOCATION || "United States",
    locations: input.locations,
    industries: input.industries || (process.env.AGENT_SOURCE_INDUSTRIES || "Software, SaaS, Marketing, Consulting, B2B Services").split(","),
    titles: input.titles || ["Founder", "CEO", "Owner", "President", "Head of Growth", "VP Sales", "Revenue Operations", "General Manager"],
    size,
  }) as AgentSourceResult;

  const skipped: Record<string, number> = {};

  function skip(reason: string) {
    skipped[reason] = (skipped[reason] || 0) + 1;
  }

  const qualified = [];
  for (const lead of sourceResult.leads as SourceLead[]) {
    const evaluation = evaluateSourceLead(lead, policy);
    if (!evaluation.ok) {
      skip(evaluation.reason);
      continue;
    }
    qualified.push(lead);
    if (qualified.length >= queueLimit) break;
  }

  const queued = [];

  for (const sourceLead of qualified) {
    const imported = await importSourceLead(sourceLead, workspace.id);
    if (imported.skipped) {
      skip(imported.reason);
      continue;
    }

    const generated = await generateSalesText({
      kind: "outreach",
      lead: {
        name: imported.lead.name,
        companyName: imported.lead.companyName,
        niche: imported.lead.niche,
        stage: imported.lead.stage,
        score: imported.lead.score,
        value: imported.lead.value,
        source: imported.lead.source,
        nextAction: imported.lead.nextAction,
      },
      input: "Autonomous first-touch email. Keep it short, consultative, and approval-ready.",
    });

    const copy = parseGeneratedOutreach(generated.text, imported.lead.companyName);
    const item = await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: imported.lead.id,
        channel: "email",
        provider: "sendgrid",
        subject: copy.subject,
        body: copy.body,
        status: "pending",
        reason: sanitizeInternalReason(`Queued by AI operator via ${generated.provider}.`),
      },
      include: { lead: true },
    });

    const slack = autoSend ? { sent: false, skipped: true, reason: "Auto-send enabled; Slack approval card skipped." } : await notifySlackOutreachApproval(item);
    const approval = autoSend ? await approveOutreachQueueItem(item.id) : null;
    queued.push({ lead: imported.lead, item, slack, approval });
  }

  const diagnostics = {
    ...(sourceResult.diagnostics || {
      rawFound: sourceResult.leads.length,
      strictQualified: sourceResult.leads.length,
      reviewReady: 0,
      contactable: sourceResult.leads.filter((lead: SourceLead) => lead.email || lead.phone).length,
      missingContact: sourceResult.leads.filter((lead: SourceLead) => !lead.email && !lead.phone).length,
      suppressed: {},
    }),
    policySkipped: skipped,
  };

  await createAutomationEvent({
    title: "AI operator finished",
    detail: `Found ${diagnostics.rawFound}, source-qualified ${sourceResult.leads.length}, policy-qualified ${qualified.length}, ${autoSend ? "sent/attempted" : "queued"} ${queued.length}.`,
    status: queued.length ? "done" : "blocked",
    type: "agent",
    payload: {
      provider,
      sourceMessage: sourceResult.message || null,
      found: sourceResult.leads.length,
      qualified: qualified.length,
      queued: queued.length,
      reviewReady: diagnostics.reviewReady,
      skipped,
      diagnostics,
      guardrails: policy,
      autoSend,
    },
  });

  return {
    provider,
    found: sourceResult.leads.length,
    rawFound: diagnostics.rawFound,
    qualified: qualified.length,
    queued: queued.length,
    reviewReady: diagnostics.reviewReady,
    skipped,
    diagnostics,
    guardrails: policy,
    items: queued.map((entry) => entry.item),
    message:
      queued.length > 0
        ? autoSend
          ? `AI operator attempted ${queued.length} live sends.`
          : `AI operator queued ${queued.length} approval-ready emails.`
        : sourceResult.message ||
          (diagnostics.reviewReady > 0
            ? `AI operator found ${diagnostics.reviewReady} review-ready leads, but none passed the current email/score policy for outreach.`
            : "AI operator did not find new qualified leads to queue."),
  };
}

export function recommendNiche(input: { exclude?: string[] } = {}) {
  const excluded = new Set((input.exclude || []).map((item) => item.toLowerCase()));
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const candidates = nichePlaybook.filter((niche) => !excluded.has(niche.niche.toLowerCase()));
  const pool = candidates.length ? candidates : nichePlaybook;
  return pool[dayIndex % pool.length];
}

export async function sendDailyNicheRecommendation(input: { exclude?: string[] } = {}) {
  const recommendation = recommendNiche(input);
  const slack = await notifySlackNicheRecommendation(recommendation);

  await createAutomationEvent({
    title: "Daily niche recommendation",
    detail: `Recommended ${recommendation.niche} for today's AI operator scan.`,
    status: slack.sent ? "done" : "blocked",
    type: "agent",
    payload: { recommendation, slack },
  });

  return { recommendation, slack };
}
