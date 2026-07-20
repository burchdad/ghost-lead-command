import type { Prisma } from "@prisma/client";
import { approveOutreachQueueItem } from "@/lib/approval";
import { generateSalesText } from "@/lib/ai";
import { createAutomationEvent } from "@/lib/automation";
import { buildSignalScoreboard, signalScoreboardSummary } from "@/lib/intent-scoreboard";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { improveOfferCopy } from "@/lib/offer-copy-brain";
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

type DeepSearchResult = AgentSourceResult & {
  runs: {
    provider: SourceProvider;
    query: string;
    location?: string;
    locations?: string[];
    found: number;
    strictQualified: number;
    reviewReady: number;
    message?: string;
  }[];
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

function sourceLeadKey(lead: SourceLead) {
  const email = clean(lead.email).toLowerCase();
  if (email) return `email:${email}`;
  const phone = clean(lead.phone).replace(/\D/g, "");
  if (phone) return `phone:${phone}`;
  return `company:${clean(lead.companyName).toLowerCase()}:${clean(lead.location).toLowerCase()}`;
}

function mergeCounts(...items: Array<Record<string, number> | undefined>) {
  const merged: Record<string, number> = {};
  for (const item of items) {
    for (const [key, count] of Object.entries(item || {})) {
      merged[key] = (merged[key] || 0) + Number(count || 0);
    }
  }
  return merged;
}

function mergeDiagnostics(results: AgentSourceResult[], fallbackMarkets?: string[]): SourceDiagnostics {
  const markets = Array.from(new Set(results.flatMap((result) => result.diagnostics?.marketsSearched || fallbackMarkets || []).filter(Boolean)));
  return {
    marketsSearched: markets.length ? markets : fallbackMarkets,
    rawFound: results.reduce((sum, result) => sum + Number(result.diagnostics?.rawFound || result.total || result.leads.length || 0), 0),
    strictQualified: results.reduce((sum, result) => sum + Number(result.diagnostics?.strictQualified || result.leads.length || 0), 0),
    reviewReady: results.reduce((sum, result) => sum + Number(result.diagnostics?.reviewReady || result.reviewLeads?.length || 0), 0),
    contactable: results.reduce((sum, result) => sum + Number(result.diagnostics?.contactable || (result.leads as SourceLead[]).filter((lead) => lead.email || lead.phone).length), 0),
    missingContact: results.reduce((sum, result) => sum + Number(result.diagnostics?.missingContact || (result.leads as SourceLead[]).filter((lead) => !lead.email && !lead.phone).length), 0),
    suppressed: mergeCounts(...results.map((result) => result.diagnostics?.suppressed)),
  };
}

function expandedQueries(baseQuery: string, niche: string, provider: SourceProvider) {
  const base = clean(baseQuery);
  const lowerNiche = clean(niche).toLowerCase();
  if (provider !== "google-maps") return [base].filter(Boolean);
  const service = lowerNiche || "local service";
  const variants = [
    base,
    `${service} repair company owner`,
    `${service} contractor owner`,
    `${service} installation company`,
    `${service} emergency service company`,
    `${service} maintenance company`,
    `${service} commercial service company`,
  ];
  return Array.from(new Set(variants.map(clean).filter(Boolean)));
}

async function searchFreshLeadsDeep(input: {
  provider: SourceProvider;
  query: string;
  location?: string;
  locations?: string[];
  industries?: string[];
  titles?: string[];
  size: number;
  queueLimit: number;
  minScore: number;
}): Promise<DeepSearchResult> {
  const queryVariants = expandedQueries(input.query, input.industries?.[0] || input.query, input.provider);
  const maxRuns = Math.min(
    Number(process.env.AGENT_MAX_SOURCE_RUNS || 4),
    input.queueLimit >= 20 ? 4 : input.queueLimit >= 10 ? 3 : 2,
    queryVariants.length,
  );
  const perRunSize = Math.min(100, Math.max(input.size, Math.ceil(input.queueLimit * 2.5)));
  const results: AgentSourceResult[] = [];
  const leadMap = new Map<string, SourceLead>();
  const reviewMap = new Map<string, SourceLead>();
  const runs: DeepSearchResult["runs"] = [];

  for (const query of queryVariants.slice(0, maxRuns)) {
    const result = (await searchFreshLeads({
      provider: input.provider,
      query,
      location: input.location,
      locations: input.locations,
      industries: input.industries,
      titles: input.titles,
      size: perRunSize,
    })) as AgentSourceResult;
    results.push(result);
    runs.push({
      provider: input.provider,
      query,
      location: input.location,
      locations: input.locations,
      found: result.leads.length,
      strictQualified: Number(result.diagnostics?.strictQualified || result.leads.length || 0),
      reviewReady: Number(result.diagnostics?.reviewReady || result.reviewLeads?.length || 0),
      message: result.message || undefined,
    });

    for (const lead of result.leads || []) {
      const key = sourceLeadKey(lead);
      const existing = leadMap.get(key);
      if (!existing || lead.score > existing.score) leadMap.set(key, lead);
    }
    for (const lead of result.reviewLeads || []) {
      const key = sourceLeadKey(lead);
      if (leadMap.has(key)) continue;
      const existing = reviewMap.get(key);
      if (!existing || lead.score > existing.score) reviewMap.set(key, lead);
    }

    const emailReady = [...leadMap.values()].filter((lead) => lead.score >= input.minScore && lead.email).length;
    const contactReady = [...leadMap.values()].filter((lead) => lead.score >= input.minScore && (lead.email || lead.phone)).length;
    if (emailReady >= input.queueLimit || contactReady >= Math.ceil(input.queueLimit * 1.2)) break;
  }

  const leads = [...leadMap.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(input.size, input.queueLimit * 2));
  const reviewLeads = [...reviewMap.values()].sort((a, b) => b.score - a.score).slice(0, Math.max(input.size, input.queueLimit * 2));
  const diagnostics = mergeDiagnostics(results, input.locations || (input.location ? [input.location] : undefined));
  return {
    provider: input.provider,
    dryRun: results.some((result) => result.dryRun),
    total: results.reduce((sum, result) => sum + Number(result.total || 0), 0),
    scrollToken: results.find((result) => result.scrollToken)?.scrollToken || null,
    leads,
    reviewLeads,
    diagnostics,
    runs,
    message: leads.length
      ? undefined
      : results.find((result) => result.message)?.message || "Deep source search did not find qualified leads.",
  };
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

function improveGeneratedOutreach(copy: { subject: string; body: string }, lead: SourceLead) {
  const scoreboard = buildSignalScoreboard(lead);
  return improveOfferCopy({
    subject: copy.subject,
    body: copy.body,
    lead: {
      name: lead.name,
      companyName: lead.companyName,
      niche: lead.niche,
      source: lead.source,
      nextAction: `${defaultNextAction(lead)} ${signalScoreboardSummary(scoreboard)}`,
      score: Math.max(lead.score, scoreboard.total),
    },
    mode: "first-touch",
  });
}

function defaultNextAction(lead: SourceLead) {
  const signals = lead.signalSummary || lead.intentSignals?.slice(0, 3).join("; ");
  const scoreboard = buildSignalScoreboard(lead);
  return [
    `AI agent sourced ${lead.companyName}, scored ${Math.max(lead.score, scoreboard.total)}, and queued a first-touch opener for ${lead.name}.`,
    `Buyer fit: ${lead.buyerFit}.`,
    signals ? `Signal: ${signals}.` : "",
    `Vega read: ${signalScoreboardSummary(scoreboard)} Next: ${scoreboard.nextMove}`,
  ].filter(Boolean).join(" ");
}

function manualContactBody(sourceLead: SourceLead) {
  const website = clean((sourceLead as SourceLead & { website?: string }).website);
  const phone = clean(sourceLead.phone);
  const signals = sourceLead.signalSummary || sourceLead.intentSignals?.slice(0, 3).join("; ");
  const scoreboard = buildSignalScoreboard(sourceLead);
  return [
    `Manual contact path for ${sourceLead.companyName}.`,
    phone ? `Call path: ${phone}` : "",
    website ? `Website/contact form: ${website}` : "",
    signals ? `Why this lead: ${signals}` : "",
    `Vega read: ${signalScoreboardSummary(scoreboard)}`,
    "Operator move: find a direct email, call the business, or use the website contact form before adding this lead to email outreach.",
  ].filter(Boolean).join("\n");
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

  const scoreboard = buildSignalScoreboard(sourceLead);
  const score = Math.max(Number(sourceLead.score || 50), scoreboard.total);
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
  const maxRequestedQueueLimit = Number(process.env.AGENT_MAX_REQUEST_QUEUE_LIMIT || process.env.AGENT_DAILY_QUEUE_LIMIT || 40);
  const maxRequestedSourceSize = Number(process.env.AGENT_MAX_REQUEST_SOURCE_SIZE || process.env.AGENT_DAILY_SOURCE_LIMIT || 150);
  const requestedQueueLimit = Math.min(
    Number.isFinite(maxRequestedQueueLimit) && maxRequestedQueueLimit > 0 ? maxRequestedQueueLimit : 40,
    Math.max(1, Number(input.queueLimit || process.env.AGENT_QUEUE_LIMIT || 5)),
  );
  const requestedSize = Math.min(
    Number.isFinite(maxRequestedSourceSize) && maxRequestedSourceSize > 0 ? maxRequestedSourceSize : 150,
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

  const sourceResult: DeepSearchResult = await searchFreshLeadsDeep({
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
    queueLimit,
    minScore,
  });

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

  const queued: { lead: { companyName: string }; item: Prisma.OutreachQueueItemGetPayload<{ include: { lead: true } }>; slack: unknown; approval: unknown }[] = [];
  const manualQueued: { lead: { companyName: string }; item: Prisma.OutreachQueueItemGetPayload<{ include: { lead: true } }>; slack: unknown }[] = [];

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

    const copy = improveGeneratedOutreach(parseGeneratedOutreach(generated.text, imported.lead.companyName), sourceLead);
    const item = await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: imported.lead.id,
        channel: "email",
        provider: "sendgrid",
        subject: copy.subject,
        body: copy.body,
        status: "pending",
        reason: sanitizeInternalReason(`${copy.reason} ${signalScoreboardSummary(buildSignalScoreboard(sourceLead))} Generated via ${generated.provider}.`),
      },
      include: { lead: true },
    });

    const slack = autoSend ? { sent: false, skipped: true, reason: "Auto-send enabled; Slack approval card skipped." } : await notifySlackOutreachApproval(item);
    const approval = autoSend ? await approveOutreachQueueItem(item.id) : null;
    queued.push({ lead: imported.lead, item, slack, approval });
  }

  const manualCandidates = [
    ...(sourceResult.leads as SourceLead[]),
    ...((sourceResult.reviewLeads || []) as SourceLead[]),
  ].filter((lead) => {
    if (queued.some((entry) => entry.lead.companyName === lead.companyName)) return false;
    if (lead.score < minScore) return false;
    if (!lead.phone && !(lead as SourceLead & { website?: string }).website) return false;
    if (lead.email) return false;
    if (!lead.companyName?.trim() || !lead.name?.trim()) return false;
    return true;
  });

  for (const sourceLead of manualCandidates) {
    if (manualQueued.length >= Math.max(0, queueLimit - queued.length)) break;
    const imported = await importSourceLead(sourceLead, workspace.id);
    if (imported.skipped) {
      skip(`manual-${imported.reason}`);
      continue;
    }

    const item = await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: imported.lead.id,
        channel: "manual",
        provider: "phone-website",
        subject: `Manual contact path for ${imported.lead.companyName}`,
        body: manualContactBody(sourceLead),
        status: "pending",
        reason: sanitizeInternalReason(`Queued by Vega because this lead has phone/website context but no public email yet. ${signalScoreboardSummary(buildSignalScoreboard(sourceLead))}`),
      },
      include: { lead: true },
    });

    const slack = await notifySlackOutreachApproval(item);
    manualQueued.push({ lead: imported.lead, item, slack });
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
    searchRuns: sourceResult.runs,
  };
  const approvalResults = queued.map((entry) => entry.approval).filter(Boolean) as Array<
    | { ok: true; body: { delivery: { status: string; dryRun?: boolean; message?: string }; item?: { lead?: { companyName?: string } | null } } }
    | { ok: false; body: { error?: string; detail?: string; item?: { lead?: { companyName?: string } | null } } }
  >;
  const sentCompanies = queued
    .filter((entry) => {
      const approval = entry.approval as { ok?: boolean; body?: { delivery?: { status?: string; dryRun?: boolean } } } | null;
      return Boolean(approval?.ok && approval.body?.delivery?.status === "sent" && !approval.body.delivery.dryRun);
    })
    .map((entry) => entry.lead.companyName);
  const dryRunCompanies = queued
    .filter((entry) => {
      const approval = entry.approval as { ok?: boolean; body?: { delivery?: { dryRun?: boolean } } } | null;
      return Boolean(approval?.ok && approval.body?.delivery?.dryRun);
    })
    .map((entry) => entry.lead.companyName);
  const blockedCompanies = queued
    .filter((entry) => {
      const approval = entry.approval as { ok?: boolean } | null;
      return autoSend && approval && !approval.ok;
    })
    .map((entry) => entry.lead.companyName);
  const failedCompanies = queued
    .filter((entry) => {
      const approval = entry.approval as { ok?: boolean; body?: { delivery?: { status?: string } } } | null;
      return Boolean(approval?.ok && approval.body?.delivery?.status === "failed");
    })
    .map((entry) => entry.lead.companyName);

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
      queued: queued.length + manualQueued.length,
      reviewReady: diagnostics.reviewReady,
      skipped,
      diagnostics,
      guardrails: policy,
      autoSend,
      autoSendSummary: {
        attempted: approvalResults.length,
        sent: sentCompanies.length,
        dryRunQueued: dryRunCompanies.length,
        blocked: blockedCompanies.length,
        failed: failedCompanies.length,
      },
    },
  });

  return {
    provider,
    found: sourceResult.leads.length,
    rawFound: diagnostics.rawFound,
    qualified: qualified.length,
    queued: queued.length + manualQueued.length,
    reviewReady: diagnostics.reviewReady,
    skipped,
    diagnostics,
    guardrails: policy,
    items: [...queued.map((entry) => entry.item), ...manualQueued.map((entry) => entry.item)],
    autoSendSummary: {
      attempted: approvalResults.length,
      sent: sentCompanies.length,
      dryRunQueued: dryRunCompanies.length,
      blocked: blockedCompanies.length,
      failed: failedCompanies.length,
      sentCompanies,
      dryRunCompanies,
      blockedCompanies,
      failedCompanies,
      manualCompanies: manualQueued.map((entry) => entry.lead.companyName),
    },
    message:
      queued.length + manualQueued.length > 0
        ? autoSend
          ? `AI operator cleaned copy and attempted ${approvalResults.length} live sends: ${sentCompanies.length} sent, ${blockedCompanies.length} blocked, ${failedCompanies.length} failed, ${dryRunCompanies.length} dry-run queued.`
          : manualQueued.length
            ? `AI operator queued ${queued.length} email approvals and ${manualQueued.length} manual contact tasks.`
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
