import type { Prisma } from "@prisma/client";
import { generateSalesText } from "@/lib/ai";
import { approveOutreachQueueItem } from "@/lib/approval";
import { getPrisma } from "@/lib/prisma";
import { findSuppressionMatch } from "@/lib/suppression";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { notifySlackOutreachApproval } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

export type IntakeLead = {
  id?: string;
  name?: string;
  contactName?: string;
  companyName?: string;
  company?: string;
  email?: string;
  phone?: string;
  title?: string;
  role?: string;
  niche?: string;
  industry?: string;
  location?: string;
  website?: string;
  domain?: string;
  source?: string;
  sourceUrl?: string;
  profileUrl?: string;
  score?: number;
  value?: number;
  buyerFit?: string;
  confidence?: string;
  intentSignals?: string[];
  signals?: string[] | string;
  signalSummary?: string;
  notes?: string;
};

export type IntakeOptions = {
  source?: string;
  autoQueue?: boolean;
  autoSend?: boolean;
  queueLimit?: number;
};

function clean(value: string | null | undefined) {
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

function normalizeSignals(lead: IntakeLead) {
  const raw = lead.intentSignals || lead.signals || [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean).slice(0, 8);
  return String(raw)
    .split(/[|;,]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function inferSignalSummary(lead: IntakeLead, signals: string[]) {
  if (clean(lead.signalSummary)) return clean(lead.signalSummary);
  if (signals.length) return signals.slice(0, 4).join("; ");

  const inferred = [];
  if (lead.website || lead.domain) inferred.push("website available for offer audit");
  if (lead.profileUrl || lead.sourceUrl) inferred.push("source profile available for context");
  if (lead.email) inferred.push("direct business email available");
  if (lead.phone) inferred.push("phone path available for follow-up");
  return inferred.length ? inferred.join("; ") : "External source matched ICP; needs deeper signal enrichment.";
}

function classifyBuyerFit(title: string) {
  const role = title.toLowerCase();
  if (["founder", "owner", "ceo", "president", "principal"].some((term) => role.includes(term))) return "Owner";
  if (["vp", "head of", "growth", "revenue", "sales", "operations", "general manager"].some((term) => role.includes(term))) {
    return "Operator";
  }
  if (["manager", "director"].some((term) => role.includes(term))) return "Manager";
  return "Unclear";
}

function scoreIntakeLead(lead: IntakeLead, signals: string[]) {
  let score = Number(lead.score || 42);
  const title = clean(lead.title || lead.role);
  const text = `${title} ${lead.niche || lead.industry || ""} ${lead.companyName || lead.company || ""}`.toLowerCase();
  const strongSignals = signals.filter((signal) =>
    /hiring|funding|ad|paid|launch|traffic|social|linkedin|google|review|intent|booking|conversion|demo|form|calendar/i.test(signal),
  );

  if (lead.email) score += 12;
  if (lead.phone) score += 8;
  if (lead.website || lead.domain) score += 4;
  if (/founder|owner|ceo|president/.test(text)) score += 16;
  if (/growth|revenue|sales|operations|vp|head of/.test(text)) score += 12;
  score += Math.min(14, signals.length * 3);
  score += Math.min(16, strongSignals.length * 5);

  const cap = strongSignals.length >= 2 && (lead.email || lead.phone) ? 100 : strongSignals.length ? 94 : 88;
  return Math.max(0, Math.min(cap, score));
}

function buildNextAction(input: {
  companyName: string;
  contactName: string;
  title: string;
  niche: string;
  source: string;
  signalSummary: string;
}) {
  const role = input.title ? `${input.contactName} (${input.title})` : input.contactName;
  return `External signal intake from ${input.source}. Queue signal-to-meeting opener to ${role} at ${input.companyName} for ${input.niche}. Buyer fit: ${classifyBuyerFit(input.title)}. Signal: ${input.signalSummary}.`;
}

async function queueFirstTouch(input: {
  workspaceId: string;
  lead: {
    id: string;
    name: string;
    companyName: string;
    niche: string;
    stage: string;
    score: number;
    value: number;
    source: string;
    nextAction: string;
  };
  autoSend: boolean;
}) {
  const prisma = getPrisma();
  const generated = await generateSalesText({
    kind: "outreach",
    lead: input.lead,
    input: "External buyer-signal intake. Write a short signal-to-meeting first-touch email.",
  });

  const trimmed = generated.text.trim();
  const subjectMatch = trimmed.match(/^Subject:\s*(.+)$/im);
  const subject = sanitizeSubject(subjectMatch?.[1] || `Signal-to-meeting idea`);
  const body = sanitizeCustomerMessage(trimmed.replace(/^Subject:\s*.+$/im, "").trim() || trimmed, {
    channel: "email",
  });

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: input.lead.id,
      channel: "email",
      provider: "sendgrid",
      subject,
      body,
      status: "pending",
      reason: sanitizeInternalReason(`Queued from external source intake via ${generated.provider}.`),
    },
    include: { lead: true },
  });

  const slack = input.autoSend
    ? { sent: false, skipped: true, reason: "Auto-send enabled; Slack approval card skipped." }
    : await notifySlackOutreachApproval(item);
  const approval = input.autoSend ? await approveOutreachQueueItem(item.id) : null;

  return { item, slack, approval };
}

export async function ingestExternalSourceLeads(leads: IntakeLead[], options: IntakeOptions = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const created = [];
  const queued = [];
  const skipped: Record<string, number> = {};
  const queueLimit = Math.max(0, Number(options.queueLimit || 0));

  function skip(reason: string) {
    skipped[reason] = (skipped[reason] || 0) + 1;
  }

  for (const leadInput of leads.slice(0, 250)) {
    const source = clean(leadInput.source || options.source) || "external-signal-intake";
    const companyName = clean(leadInput.companyName || leadInput.company);
    const contactName = clean(leadInput.name || leadInput.contactName);
    const title = clean(leadInput.title || leadInput.role) || "Decision maker";
    const niche = clean(leadInput.niche || leadInput.industry) || "B2B Services";
    const email = clean(leadInput.email).toLowerCase();
    const phone = clean(leadInput.phone);
    const website = clean(leadInput.website);
    const domain = normalizeDomain(clean(leadInput.domain) || website);
    const signals = normalizeSignals(leadInput);
    const signalSummary = inferSignalSummary(leadInput, signals);
    const score = scoreIntakeLead(leadInput, signals);
    const value = Number(leadInput.value || (score >= 90 ? 7500 : score >= 82 ? 5000 : 2500));

    if (!companyName || !contactName) {
      skip("missing-company-or-contact");
      continue;
    }

    if (!email && !phone) {
      skip("missing-contact-path");
      continue;
    }

    const suppression = await findSuppressionMatch({ email, phone, domain, companyName });
    if (suppression) {
      skip("suppressed");
      continue;
    }

    const duplicateChecks: Prisma.ContactWhereInput[] = [{ name: contactName, company: { is: { name: companyName } } }];
    if (email) duplicateChecks.push({ email });
    if (phone) duplicateChecks.push({ phone });

    const [existingContact, existingLead, existingCompany] = await Promise.all([
      prisma.contact.findFirst({ where: { workspaceId: workspace.id, OR: duplicateChecks }, select: { id: true } }),
      prisma.lead.findFirst({
        where: {
          workspaceId: workspace.id,
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
          workspaceId: workspace.id,
          OR: [{ name: companyName }, ...(domain ? [{ website: { contains: domain, mode: "insensitive" as const } }] : [])],
        },
        select: { id: true },
      }),
    ]);

    if (existingContact || existingLead || existingCompany) {
      skip("duplicate");
      continue;
    }

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: companyName,
        niche,
        website: website || domain || null,
        crmSource: source,
      },
    });

    const contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        name: contactName,
        email: email || null,
        phone: phone || null,
        role: title,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        contactId: contact.id,
        name: contact.name,
        companyName: company.name,
        niche,
        stage: "Imported",
        score,
        value,
        source,
        lastTouch: "Never",
        nextAction: buildNextAction({ companyName, contactName, title, niche, source, signalSummary }),
        opportunities: {
          create: {
            companyId: company.id,
            title: `${company.name} signal-to-meeting install`,
            stage: "Imported",
            value,
            probability: Math.min(95, Math.max(20, score)),
          },
        },
      },
    });

    created.push(lead);

    if (options.autoQueue && (!queueLimit || queued.length < queueLimit)) {
      queued.push(await queueFirstTouch({ workspaceId: workspace.id, lead, autoSend: Boolean(options.autoSend) }));
    }
  }

  return { count: created.length, queued: queued.length, skipped, leads: created, queueItems: queued };
}
