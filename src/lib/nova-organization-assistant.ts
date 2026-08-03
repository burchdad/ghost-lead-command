import type { Prisma } from "@prisma/client";
import { createAutomationEvent } from "@/lib/automation";
import { sendTransactionalEmail } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { ensureLeadCommandCoreSchema } from "@/lib/lead-command-schema";
import { getDefaultWorkspace } from "@/lib/workspace";

export type NovaOrganizationIntent = "lead_intake" | "calendar_update" | "eod_report" | "unknown";

export type NovaOrganizationParse = {
  intent: NovaOrganizationIntent;
  originalText: string;
  cleanedText: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  role?: string;
  service?: string;
  location?: string;
  setter?: string;
  reportRecipient?: string;
  reportAudience?: string;
  appointmentText?: string;
  confidence: number;
};

export type NovaOrganizationResult = {
  intent: NovaOrganizationIntent;
  summary: string;
  detail: string;
  actionLabel: string;
  leadId?: string;
  bookingTaskId?: string;
  reportSent?: boolean;
  parse: NovaOrganizationParse;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 && part === part.toUpperCase() ? part : `${part[0]?.toUpperCase() || ""}${part.slice(1)}`))
    .join(" ");
}

function stripNovaAddress(text: string) {
  return text.replace(/^\s*(?:nova|<@[A-Z0-9]+>)\s*[,:\-]?\s*/i, "").trim();
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim();
}

function extractPhone(text: string) {
  const match = text.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  return match?.[0]?.trim();
}

function extractAfter(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value.replace(/[.!,;:]$/, "").trim();
  }
  return "";
}

function clipPhrase(value: string, stopWords: string[]) {
  let output = value;
  for (const stop of stopWords) {
    const index = output.toLowerCase().indexOf(stop.toLowerCase());
    if (index > 0) output = output.slice(0, index);
  }
  return output.replace(/[.!,;:]$/, "").trim();
}

function extractCompany(text: string) {
  const explicit = extractAfter(text, [
    /\bbook\s+([A-Z][A-Za-z0-9&'.\- ]{2,80})\s+with\b/,
    /\bschedule\s+([A-Z][A-Za-z0-9&'.\- ]{2,80})\s+with\b/,
    /\bcompany\s*(?:is|:)\s*([^,.;\n]+)/i,
    /\bbusiness\s*(?:is|:)\s*([^,.;\n]+)/i,
    /\b(?:at|from|with)\s+([A-Z][A-Za-z0-9&'.\- ]{2,80})(?:,|\s+(?:called|emailed|wants|needs|asked|is|from|in|near)\b|$)/,
  ]);
  if (explicit) return titleCase(clipPhrase(explicit, [" called", " emailed", " wants", " needs", " asked"]));
  return "";
}

function extractContact(text: string, companyName?: string) {
  const explicit = extractAfter(text, [
    /\bcontact\s*(?:is|:)\s*([^,.;\n]+)/i,
    /\bperson\s*(?:is|:)\s*([^,.;\n]+)/i,
    /\b(?:new lead|lead)\s*(?:is|:)?\s*([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,3})\b/,
    /\b([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,3})\s+(?:at|from|with)\s+/,
  ]);
  const value = clipPhrase(explicit, [" at ", " from ", " with ", " wants ", " needs ", " asked "]);
  if (!value || value.toLowerCase() === clean(companyName).toLowerCase()) return "";
  return titleCase(value);
}

function extractService(text: string) {
  const explicit = extractAfter(text, [
    /\b(?:wants|needs|asked for|looking for|interested in)\s+([^.;\n]+)/i,
    /\bservice\s*(?:is|:)\s*([^.;\n]+)/i,
  ]);
  return clipPhrase(explicit, [" around ", " near ", " in ", " at ", " by ", " from "]).toLowerCase();
}

function extractLocation(text: string) {
  const explicit = extractAfter(text, [
    /\b(?:near|around|in|market)\s+([A-Z][A-Za-z ,.-]{2,80})(?:\.|,|$)/,
    /\blocation\s*(?:is|:)\s*([^.;\n]+)/i,
  ]);
  return explicit ? titleCase(explicit) : "";
}

function extractSetter(text: string) {
  const explicit = extractAfter(text, [
    /\bsetter\s*(?:is|:)?\s*([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2})/i,
    /\bassign(?:ed)?\s+to\s+([A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+){0,2})/i,
  ]);
  return explicit ? titleCase(explicit) : "";
}

function inferIntent(cleanedText: string): NovaOrganizationIntent {
  const normalized = cleanedText.toLowerCase();
  if (/\b(?:end of day|eod|daily report|setter report|send report|recap)\b/.test(normalized)) return "eod_report";
  if (/\b(?:book|calendar|appointment|meeting|reschedule|schedule|move.*calendar|set.*call)\b/.test(normalized)) return "calendar_update";
  if (
    /\b(?:new lead|lead info|intake|prospect|called|call came in|form fill|quote|estimate|interested|wants|needs|asked for)\b/.test(
      normalized,
    )
  ) {
    return "lead_intake";
  }
  return "unknown";
}

export function parseNovaOrganizationInstruction(text: string): NovaOrganizationParse {
  const cleanedText = stripNovaAddress(clean(text));
  const intent = inferIntent(cleanedText);
  const email = extractEmail(cleanedText);
  const phone = extractPhone(cleanedText);
  const companyName = extractCompany(cleanedText);
  const contactName = extractContact(cleanedText, companyName);
  const service = extractService(cleanedText);
  const location = extractLocation(cleanedText);
  const setter = extractSetter(cleanedText);
  const reportRecipient = email && intent === "eod_report" ? email : extractAfter(cleanedText, [/\b(?:send|email)\s+(?:it|report|updates?)\s+to\s+([^\s,;]+@[^\s,;]+)/i]);
  const reportAudience = extractAfter(cleanedText, [/\bfor\s+([A-Z][A-Za-z ,&'.\-]{2,80})(?:\.|$)/]);
  const confidence =
    intent === "lead_intake"
      ? [companyName, contactName, email || phone, service].filter(Boolean).length / 4
      : intent === "calendar_update"
        ? [companyName || contactName, cleanedText].filter(Boolean).length / 2
        : intent === "eod_report"
          ? 0.85
          : 0.25;

  return {
    intent,
    originalText: text,
    cleanedText,
    companyName: companyName || undefined,
    contactName: contactName || undefined,
    email: email || undefined,
    phone: phone || undefined,
    service: service || undefined,
    location: location || undefined,
    setter: setter || undefined,
    reportRecipient: reportRecipient || undefined,
    reportAudience: reportAudience || undefined,
    appointmentText: intent === "calendar_update" ? cleanedText : undefined,
    confidence: Math.round(confidence * 100) / 100,
  };
}

function leadName(parse: NovaOrganizationParse) {
  return parse.contactName || parse.companyName || "New lead";
}

function companyName(parse: NovaOrganizationParse) {
  return parse.companyName || parse.contactName || "Unknown company";
}

function leadNiche(parse: NovaOrganizationParse) {
  if (parse.service) return titleCase(parse.service);
  return "Ops Lead Intake";
}

function reportRecipientFromText(parse: NovaOrganizationParse) {
  return parse.reportRecipient || process.env.NOVA_EOD_REPORT_RECIPIENT || process.env.BOOKING_OWNER_EMAIL || "";
}

async function handleLeadIntake(parse: NovaOrganizationParse): Promise<NovaOrganizationResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  await ensureLeadCommandCoreSchema(workspace.id);

  const createdCompany = await prisma.company.create({
    data: {
      workspaceId: workspace.id,
      name: companyName(parse),
      niche: leadNiche(parse),
      crmSource: "nova-natural-language",
    },
  });

  const contact = await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      companyId: createdCompany.id,
      name: leadName(parse),
      email: parse.email || null,
      phone: parse.phone || null,
      role: parse.role || null,
      title: parse.role || null,
      source: "nova-natural-language",
    },
  });

  const lead = await prisma.lead.create({
    data: {
      workspaceId: workspace.id,
      companyId: createdCompany.id,
      contactId: contact.id,
      name: contact.name,
      title: parse.role || null,
      companyName: createdCompany.name,
      niche: createdCompany.niche,
      stage: "Imported",
      priority: parse.phone || parse.email ? "high" : "normal",
      score: parse.phone || parse.email ? 78 : 62,
      leadScore: parse.phone || parse.email ? 78 : 62,
      value: 5000,
      source: "Nova natural-language intake",
      lastTouch: "Just now",
      nextAction: parse.phone
        ? "Setter entered this lead through Nova. Create or work phone follow-up and capture outcome."
        : parse.email
          ? "Setter entered this lead through Nova. Prepare a concise follow-up and track reply."
          : "Setter entered this lead through Nova. Enrich contact path before outreach.",
      tags: ["nova-intake", parse.setter ? `setter:${parse.setter}` : "setter:unknown"] as Prisma.InputJsonValue,
      customFields: {
        novaIntake: true,
        originalInstruction: parse.cleanedText,
        service: parse.service || null,
        location: parse.location || null,
        setter: parse.setter || null,
      },
    },
  });

  await prisma.interaction.create({
    data: {
      leadId: lead.id,
      contactId: contact.id,
      channel: "nova",
      direction: "internal",
      classification: "lead-intake",
      body: parse.cleanedText,
      metadata: { parse } as Prisma.InputJsonValue,
    },
  });

  await createAutomationEvent({
    leadId: lead.id,
    title: "Nova lead intake captured",
    detail: `${lead.companyName} was added from natural-language setter input.`,
    status: "done",
    type: "nova",
    payload: { parse, leadId: lead.id, contactId: contact.id, companyId: createdCompany.id },
  });

  return {
    intent: "lead_intake",
    summary: `Nova captured ${lead.companyName} as a structured lead.`,
    detail: `${contact.name}${parse.phone ? ` | ${parse.phone}` : ""}${parse.email ? ` | ${parse.email}` : ""}. Next: ${lead.nextAction}`,
    actionLabel: parse.phone ? "Phone follow-up ready" : parse.email ? "Email follow-up ready" : "Needs enrichment",
    leadId: lead.id,
    parse,
  };
}

async function handleCalendarUpdate(parse: NovaOrganizationParse): Promise<NovaOrganizationResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  await ensureLeadCommandCoreSchema(workspace.id);

  const search = parse.companyName || parse.contactName || "";
  const lead = search
    ? await prisma.lead.findFirst({
        where: {
          workspaceId: workspace.id,
          OR: [
            { companyName: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
      })
    : null;

  const bookingTask = await prisma.bookingTask.create({
    data: {
      workspaceId: workspace.id,
      leadId: lead?.id || null,
      ownerEmail: process.env.BOOKING_OWNER_EMAIL || null,
      status: "ready",
      meetingTitle: lead ? `Calendar handoff: ${lead.companyName}` : "Nova calendar handoff",
      calendarProvider: process.env.GOOGLE_CALENDAR_CLIENT_ID ? "google" : process.env.OUTLOOK_CLIENT_ID ? "outlook" : null,
      durationMinutes: Number(process.env.DEFAULT_MEETING_DURATION_MINUTES || 30),
      prepNotes: [
        "Nova captured this calendar/update instruction from natural language.",
        parse.appointmentText || parse.cleanedText,
        lead ? `Matched lead: ${lead.companyName}` : "No existing lead matched. Operator should confirm the account before scheduling.",
      ].join("\n"),
    },
  });

  if (lead) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: "Potential Client",
        lastTouch: "Just now",
        nextAction: "Nova created a calendar handoff. Confirm slot, meeting link, and setter notes.",
      },
    });
  }

  await createAutomationEvent({
    leadId: lead?.id || null,
    title: "Nova calendar update captured",
    detail: lead ? `${lead.companyName} calendar handoff is ready.` : "Nova created a calendar handoff from natural language.",
    status: "needs_review",
    type: "nova-calendar",
    payload: { parse, bookingTaskId: bookingTask.id, matchedLeadId: lead?.id || null },
  });

  return {
    intent: "calendar_update",
    summary: lead ? `Nova created a calendar handoff for ${lead.companyName}.` : "Nova created a calendar handoff for operator review.",
    detail: "Confirm the exact time, attendee, and meeting link before counting this as booked.",
    actionLabel: "Calendar handoff ready",
    leadId: lead?.id,
    bookingTaskId: bookingTask.id,
    parse,
  };
}

async function buildEndOfDayReport(parse: NovaOrganizationParse) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  await ensureLeadCommandCoreSchema(workspace.id);

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [newLeads, phoneTasks, replies, bookings, events] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { contact: true },
    }),
    prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id, channel: "manual", provider: { contains: "phone" }, createdAt: { gte: since } },
      orderBy: { scheduledFor: "asc" },
      take: 15,
      include: { lead: { include: { contact: true } } },
    }),
    prisma.reply.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.automationEvent.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: since }, type: { in: ["nova", "nova-calendar", "human-assist", "sendgrid"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const callLines = phoneTasks.length
    ? phoneTasks.slice(0, 8).map((item, index) => `${index + 1}. ${item.lead?.companyName || "Unknown company"} - ${item.subject || "Call task"}`)
    : ["No phone-assist tasks created today."];
  const leadLines = newLeads.length
    ? newLeads.slice(0, 8).map((lead, index) => `${index + 1}. ${lead.companyName} - ${lead.contact?.phone || lead.contact?.email || "needs contact path"}`)
    : ["No new leads entered today."];
  const eventLines = events.length
    ? events.slice(0, 5).map((event) => `- ${event.title}: ${event.detail}`)
    : ["- No Nova/ops events recorded yet today."];

  return [
    "Nova end-of-day setter report",
    "",
    `Audience: ${parse.reportAudience || "Alex and setters"}`,
    `Generated: ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`,
    "",
    "Scoreboard",
    `New leads entered: ${newLeads.length}`,
    `Phone tasks created: ${phoneTasks.length}`,
    `Replies captured: ${replies}`,
    `Booking handoffs created: ${bookings}`,
    "",
    "New leads",
    leadLines.join("\n"),
    "",
    "Call work",
    callLines.join("\n"),
    "",
    "Recent ops notes",
    eventLines.join("\n"),
    "",
    "Setter note",
    "Reply with lead updates in plain English. Nova will structure the data, update the lead, and route booking or follow-up work.",
  ].join("\n");
}

async function handleEndOfDayReport(parse: NovaOrganizationParse): Promise<NovaOrganizationResult> {
  const recipient = reportRecipientFromText(parse);
  const report = await buildEndOfDayReport(parse);
  let sent = false;

  if (recipient) {
    const delivery = await sendTransactionalEmail({
      to: recipient,
      subject: "Nova end-of-day setter report",
      text: report,
    });
    sent = delivery.status !== "failed";
  }

  await createAutomationEvent({
    title: sent ? "Nova EOD report emailed" : "Nova EOD report prepared",
    detail: sent ? `Nova emailed the end-of-day report to ${recipient}.` : "Nova prepared an end-of-day report; no recipient email was configured.",
    status: sent ? "done" : "needs_review",
    type: "nova-report",
    payload: { parse, recipient: recipient || null, report },
  });

  return {
    intent: "eod_report",
    summary: sent ? `Nova emailed the EOD report to ${recipient}.` : "Nova prepared the EOD report.",
    detail: report,
    actionLabel: sent ? "Report sent" : "Report ready",
    reportSent: sent,
    parse,
  };
}

export function isNovaAddressed(text: string) {
  return /^\s*(?:nova|<@[A-Z0-9]+>)\s*[,:\-]?\s+/i.test(text);
}

export async function handleNovaOrganizationInstruction(text: string): Promise<NovaOrganizationResult> {
  const parse = parseNovaOrganizationInstruction(text);

  if (parse.intent === "lead_intake") return handleLeadIntake(parse);
  if (parse.intent === "calendar_update") return handleCalendarUpdate(parse);
  if (parse.intent === "eod_report") return handleEndOfDayReport(parse);

  await createAutomationEvent({
    title: "Nova instruction needs clarification",
    detail: parse.cleanedText || "No instruction received.",
    status: "needs_review",
    type: "nova",
    payload: { parse },
  });

  return {
    intent: "unknown",
    summary: "Nova heard the message, but needs a lead, calendar, or report instruction.",
    detail:
      "Try: `Nova, new lead: John at ABC Roofing, 903-555-1212, wants a quote next week, setter Alex.` Or: `Nova, send end of day report to alex@example.com.`",
    actionLabel: "Needs clearer instruction",
    parse,
  };
}
