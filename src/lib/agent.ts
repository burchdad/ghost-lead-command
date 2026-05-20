import type { Prisma } from "@prisma/client";
import { generateSalesText } from "@/lib/ai";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { searchFreshLeads, type SourceLead, type SourceProvider } from "@/lib/sourcing";
import { findSuppressionMatch } from "@/lib/suppression";
import { notifySlackNicheRecommendation, notifySlackOutreachApproval } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

type AgentRunInput = {
  provider?: SourceProvider;
  query?: string;
  location?: string;
  industries?: string[];
  titles?: string[];
  size?: number;
  minScore?: number;
  queueLimit?: number;
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
    niche: "Roofing",
    query: "owners and operators of roofing companies",
    location: "United States",
    industries: ["Roofing", "Construction"],
    minScore: 82,
    queueLimit: 5,
    rationale: [
      "High-ticket jobs make one recovered estimate request meaningful.",
      "Missed calls, old forms, and slow follow-up are easy pains to diagnose.",
      "The offer maps cleanly to an AI follow-up and booked-estimate workflow.",
    ],
  },
  {
    niche: "HVAC",
    query: "owners and general managers of HVAC companies",
    location: "United States",
    industries: ["HVAC", "Home Services"],
    minScore: 82,
    queueLimit: 5,
    rationale: [
      "Seasonal demand creates urgency without manufacturing pressure.",
      "Missed estimate requests and service calls are visible revenue leaks.",
      "Owners understand speed-to-lead and appointment booking value quickly.",
    ],
  },
  {
    niche: "Dental",
    query: "owners and practice managers of dental practices",
    location: "United States",
    industries: ["Dental", "Healthcare"],
    minScore: 80,
    queueLimit: 5,
    rationale: [
      "Patient acquisition economics support automation retainers.",
      "No-show, recall, and unscheduled treatment follow-up are concrete pains.",
      "Email-first outreach is safer while SMS compliance is pending.",
    ],
  },
  {
    niche: "Med Spa",
    query: "owners and operators of med spas",
    location: "United States",
    industries: ["Med Spa", "Wellness"],
    minScore: 80,
    queueLimit: 5,
    rationale: [
      "Consultation follow-up and old inquiry revival are easy to demonstrate.",
      "Margins can support setup plus monthly optimization.",
      "The demo path is visual: inquiry capture, reply classification, booked consults.",
    ],
  },
  {
    niche: "Auto Detail",
    query: "owners of auto detail and ceramic coating shops",
    location: "United States",
    industries: ["Auto Detail", "Automotive"],
    minScore: 78,
    queueLimit: 5,
    rationale: [
      "Shops often lose leads in DMs, missed calls, and quote follow-up.",
      "The offer is simple: recover quote requests and book paid details.",
      "A smaller-ticket niche gives fast feedback on copy and workflow.",
    ],
  },
];

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function parseGeneratedOutreach(text: string, companyName: string) {
  const trimmed = text.trim();
  const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch?.[1]?.trim() || `Quick idea for ${companyName}`;
  const body = trimmed.replace(/^Subject:\s*.+$/im, "").trim() || trimmed;
  return { subject, body };
}

function defaultNextAction(lead: SourceLead) {
  return `AI agent sourced ${lead.companyName}, scored ${lead.score}, and queued a first-touch opener for ${lead.name}.`;
}

async function importSourceLead(sourceLead: SourceLead, workspaceId: string) {
  const prisma = getPrisma();
  const email = sourceLead.email ? sourceLead.email.trim().toLowerCase() : "";
  const phone = sourceLead.phone ? sourceLead.phone.trim() : "";
  const companyName = sourceLead.companyName.trim();
  const contactName = sourceLead.name.trim();
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
  const minScore = Number(input.minScore || process.env.AGENT_MIN_LEAD_SCORE || 80);
  const queueLimit = Math.min(10, Math.max(1, Number(input.queueLimit || process.env.AGENT_QUEUE_LIMIT || 5)));
  const size = Math.min(50, Math.max(queueLimit, Number(input.size || process.env.AGENT_SOURCE_BATCH_SIZE || 15)));

  await createAutomationEvent({
    title: "AI operator started",
    detail: `Sourcing ${size} leads from ${provider}, minimum score ${minScore}, queue limit ${queueLimit}.`,
    status: "running",
    type: "agent",
    payload: { provider, minScore, queueLimit, size },
  });

  const sourceResult = await searchFreshLeads({
    provider,
    query: input.query || process.env.AGENT_SOURCE_QUERY || "owners of roofing HVAC dental med spa businesses",
    location: input.location || process.env.AGENT_SOURCE_LOCATION || "United States",
    industries: input.industries || (process.env.AGENT_SOURCE_INDUSTRIES || "Roofing, HVAC, Dental, Med Spa").split(","),
    titles: input.titles || ["Owner", "Founder", "CEO", "President", "General Manager", "Vice President"],
    size,
  });

  const qualified = (sourceResult.leads as SourceLead[]).filter((lead) => lead.score >= minScore).slice(0, queueLimit);
  const queued = [];
  const skipped: Record<string, number> = {};

  function skip(reason: string) {
    skipped[reason] = (skipped[reason] || 0) + 1;
  }

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
        reason: `Queued by AI operator via ${generated.provider}.`,
      },
      include: { lead: true },
    });

    const slack = await notifySlackOutreachApproval(item);
    queued.push({ lead: imported.lead, item, slack });
  }

  await createAutomationEvent({
    title: "AI operator finished",
    detail: `Found ${sourceResult.leads.length}, qualified ${qualified.length}, queued ${queued.length}.`,
    status: queued.length ? "done" : "blocked",
    type: "agent",
    payload: {
      provider,
      sourceMessage: sourceResult.message || null,
      found: sourceResult.leads.length,
      qualified: qualified.length,
      queued: queued.length,
      skipped,
    },
  });

  return {
    provider,
    found: sourceResult.leads.length,
    qualified: qualified.length,
    queued: queued.length,
    skipped,
    items: queued.map((entry) => entry.item),
    message:
      queued.length > 0
        ? `AI operator queued ${queued.length} approval-ready emails.`
        : sourceResult.message || "AI operator did not find new qualified leads to queue.",
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
