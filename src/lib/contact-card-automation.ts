import { Prisma } from "@prisma/client";
import { approveOutreachQueueItem } from "@/lib/approval";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

type ContactCardPayload = Record<string, unknown>;

type LeadShape = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  niche: string;
  stage: string;
  score: number;
  value: number;
  source: string;
  nextAction: string;
  note: string;
  leadType: string;
  relationshipType: string;
  eventTag: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function addHours(date: Date, hours: number) {
  const copy = new Date(date);
  copy.setHours(copy.getHours() + hours);
  return copy;
}

function firstName(name: string) {
  return name.split(" ").filter(Boolean)[0] || "there";
}

function getFollowUpDelayHours() {
  const value = Number(process.env.QR_FOLLOWUP_DELAY_HOURS || 24);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function contactSyncEnabled() {
  return (process.env.GOOGLE_CONTACTS_SYNC_ENABLED || "").toLowerCase() === "true";
}

function autoSendFollowUps() {
  return (process.env.QR_FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true";
}

function relationshipType(value: unknown) {
  const cleaned = clean(value);
  return cleaned || "Networking Contact";
}

function eventTag(value: unknown) {
  const cleaned = clean(value);
  return cleaned || "QR contact exchange";
}

function getLeadShape(payload: ContactCardPayload): LeadShape {
  if (payload.recordType === "product_intake") {
    const buyer = asObject(payload.buyer);
    return {
      name: clean(buyer.name) || "Contact Card Buyer",
      email: clean(buyer.email),
      phone: clean(buyer.phone),
      companyName: clean(buyer.businessName) || "Contact Card Buyer",
      niche: "Contact Card Product",
      stage: "Product Intake",
      score: 82,
      value: 499,
      source: "contact_card_product_page",
      nextAction: "Review intake and start the contact card build.",
      note: clean(buyer.notes),
      leadType: "product_intake",
      relationshipType: "Product Buyer",
      eventTag: "Contact card product funnel",
    };
  }

  if (payload.recordType === "stripe_checkout_completed") {
    const buyer = asObject(payload.buyer);
    const product = asObject(payload.product);
    const commission = asObject(payload.commission);
    const sale = asObject(commission.sale);
    const plan = clean(product.selectedPlan) || "contact-card";
    const amount = asNumber(sale.amount, 0);
    return {
      name: clean(buyer.name) || "Stripe Buyer",
      email: clean(buyer.email),
      phone: clean(buyer.phone),
      companyName: clean(buyer.name) || "Stripe Contact Card Buyer",
      niche: "Contact Card Product",
      stage: "Paid",
      score: 92,
      value: Math.round(amount || 499),
      source: `stripe_${plan}`,
      nextAction: "Confirm payment details and send the intake/start link.",
      note: "",
      leadType: "stripe_checkout_completed",
      relationshipType: "Customer",
      eventTag: "Stripe checkout",
    };
  }

  const lead = asObject(payload.lead);
  const leadType = clean(lead.leadType);
  const isContactExchange = leadType === "contact_exchange";
  const relation = relationshipType(lead.relationshipType);
  const event = eventTag(lead.eventTag);
  return {
    name: clean(lead.name) || "QR Contact",
    email: clean(lead.email),
    phone: clean(lead.phone),
    companyName: clean(lead.company || lead.businessName) || (isContactExchange ? "Networking Contact" : "QR Contact Card Lead"),
    niche: isContactExchange ? relation : "Business Growth Systems",
    stage: isContactExchange ? relation : "New QR Lead",
    score: isContactExchange ? 62 : 78,
    value: isContactExchange ? 0 : 2500,
    source: clean(payload.source) || "qr_contact_card",
    nextAction: isContactExchange
      ? `Review ${relation.toLowerCase()} from ${event}, enrich the record, and keep the relationship warm.`
      : "Review QR contact card lead brief and follow up.",
    note: clean(lead.goal || lead.note),
    leadType: leadType || "lead",
    relationshipType: relation,
    eventTag: event,
  };
}

async function upsertCompany(workspaceId: string, shape: LeadShape) {
  const prisma = getPrisma();
  const existing = await prisma.company.findFirst({
    where: { workspaceId, name: { equals: shape.companyName, mode: "insensitive" } },
  });

  if (existing) {
    return prisma.company.update({
      where: { id: existing.id },
      data: {
        niche: existing.niche || shape.niche,
        crmSource: existing.crmSource || shape.source,
      },
    });
  }

  return prisma.company.create({
    data: {
      workspaceId,
      name: shape.companyName,
      niche: shape.niche,
      crmSource: shape.source,
    },
  });
}

async function upsertContact(workspaceId: string, companyId: string, shape: LeadShape) {
  const prisma = getPrisma();
  const existing =
    (shape.email &&
      (await prisma.contact.findFirst({
        where: { workspaceId, email: { equals: shape.email, mode: "insensitive" } },
      }))) ||
    (shape.phone &&
      (await prisma.contact.findFirst({
        where: { workspaceId, phone: shape.phone },
      }))) ||
    (await prisma.contact.findFirst({
      where: { workspaceId, companyId, name: { equals: shape.name, mode: "insensitive" } },
    }));

  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        companyId: existing.companyId || companyId,
        name: existing.name || shape.name,
        email: existing.email || shape.email || null,
        phone: existing.phone || shape.phone || null,
      },
    });
  }

  return prisma.contact.create({
    data: {
      workspaceId,
      companyId,
      name: shape.name,
      email: shape.email || null,
      phone: shape.phone || null,
    },
  });
}

async function upsertLead(workspaceId: string, companyId: string, contactId: string, shape: LeadShape) {
  const prisma = getPrisma();
  const existing = await prisma.lead.findFirst({
    where: {
      workspaceId,
      contactId,
      source: shape.source,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    return prisma.lead.update({
      where: { id: existing.id },
      data: {
        companyId,
        name: shape.name,
        companyName: shape.companyName,
        niche: shape.niche,
        stage: existing.stage === "Imported" ? shape.stage : existing.stage,
        score: Math.max(existing.score, shape.score),
        value: Math.max(existing.value, shape.value),
        lastTouch: "Contact card exchange refreshed",
        nextAction: shape.nextAction,
      },
      include: { opportunities: true },
    });
  }

  return prisma.lead.create({
    data: {
      workspaceId,
      companyId,
      contactId,
      name: shape.name,
      companyName: shape.companyName,
      niche: shape.niche,
      stage: shape.stage,
      score: shape.score,
      value: shape.value,
      source: shape.source,
      lastTouch: "Contact card webhook",
      nextAction: shape.nextAction,
      opportunities: shape.value > 0
        ? {
            create: {
              companyId,
              title: `${shape.companyName} growth system opportunity`,
              stage: shape.stage,
              value: shape.value,
              probability: Math.min(95, Math.max(20, shape.score)),
            },
          }
        : undefined,
    },
    include: { opportunities: true },
  });
}

async function createInboundInteraction(leadId: string, contactId: string | null, shape: LeadShape) {
  if (!shape.note && shape.leadType !== "contact_exchange") return null;

  const prisma = getPrisma();
  return prisma.interaction.create({
    data: {
      leadId,
      contactId,
      channel: "qr_contact_card",
      direction: "inbound",
      body: [shape.note || "Contact exchange submitted from QR card.", `Event: ${shape.eventTag}.`, `Relationship: ${shape.relationshipType}.`].join("\n"),
      classification: shape.leadType === "contact_exchange" ? shape.relationshipType : "lead",
    },
  });
}

async function scheduleContactExchangeFollowUps(workspaceId: string, leadId: string, shape: LeadShape) {
  if (shape.leadType !== "contact_exchange") return [];

  const prisma = getPrisma();
  const dueAt = addHours(new Date(), getFollowUpDelayHours());
  const recipientFirstName = firstName(shape.name);
  const created = [];

  const eventLine =
    shape.eventTag && shape.eventTag !== "QR contact exchange"
      ? ` at ${shape.eventTag}`
      : " through my QR card";
  const emailBody = `${recipientFirstName}, it was good connecting${eventLine}.\n\nI saved your info so we do not lose touch. If there is anything you are building, promoting, or trying to grow, send it over and I will point you in the right direction.\n\n- Stephen`;
  const smsBody = `${recipientFirstName}, Stephen here. Good connecting${eventLine}. I saved your info so we do not lose touch.`;

  const messages = [
    shape.email
      ? {
          channel: "email",
          provider: "sendgrid",
          subject: "Good connecting",
          body: emailBody,
        }
      : null,
    shape.phone
      ? {
          channel: "sms",
          provider: process.env.SMS_PROVIDER || "telnyx",
          subject: null,
          body: smsBody,
        }
      : null,
  ].filter(Boolean) as { channel: string; provider: string; subject: string | null; body: string }[];

  for (const message of messages) {
    const existing = await prisma.outreachQueueItem.findFirst({
      where: {
        workspaceId,
        leadId,
        channel: message.channel,
        status: { in: ["pending", "queued", "sent"] },
        reason: { contains: "QR contact exchange follow-up" },
      },
    });
    if (existing) continue;

    created.push(
      await prisma.outreachQueueItem.create({
        data: {
          workspaceId,
          leadId,
          channel: message.channel,
          provider: message.provider,
          subject: message.subject,
          body: message.body,
          status: "pending",
          reason: "QR contact exchange follow-up. Review before send unless QR_FOLLOWUP_AUTO_SEND is enabled.",
          scheduledFor: dueAt,
        },
      }),
    );
  }

  if (created.length) {
    await createAutomationEvent({
      leadId,
      title: "QR follow-up scheduled",
      detail: `${created.length} follow-up message(s) scheduled for ${dueAt.toISOString()}.`,
      status: "done",
      type: "contact_card_followup",
      payload: {
        queueItemIds: created.map((item) => item.id),
        dueAt: dueAt.toISOString(),
        reviewBeforeSend: !autoSendFollowUps(),
        eventTag: shape.eventTag,
        relationshipType: shape.relationshipType,
      },
    });
  }

  return created;
}

async function createPendingAutomationEvents(leadId: string, shape: LeadShape, payload: ContactCardPayload) {
  if (shape.leadType !== "contact_exchange") return [];

  const events = [];
  events.push(
    await createAutomationEvent({
      leadId,
      title: "PDL enrichment pending",
      detail: "QR contact exchange is ready for People Data Labs enrichment.",
      status: "pending",
      type: "contact_card_pdl_enrichment",
      payload: {
        leadId,
        sourceDetail: clean(payload.sourceDetail),
        submittedAt: clean(payload.submittedAt),
        eventTag: shape.eventTag,
        relationshipType: shape.relationshipType,
      },
    }),
  );

  events.push(
    await createAutomationEvent({
      leadId,
      title: "Google contact sync pending",
      detail: "QR contact exchange is ready to sync into personal contacts after enrichment.",
      status: "pending",
      type: "google_contacts_sync",
      payload: { leadId, source: "qr_contact_card", eventTag: shape.eventTag, relationshipType: shape.relationshipType },
    }),
  );

  return events;
}

export async function createLeadFromContactCardPayload(payload: ContactCardPayload) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const shape = getLeadShape(payload);
  const company = await upsertCompany(workspace.id, shape);
  const contact = await upsertContact(workspace.id, company.id, shape);
  const lead = await upsertLead(workspace.id, company.id, contact.id, shape);

  await createInboundInteraction(lead.id, contact.id, shape);
  await scheduleContactExchangeFollowUps(workspace.id, lead.id, shape);
  await createPendingAutomationEvents(lead.id, shape, payload);

  await prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      leadId: lead.id,
      title: shape.leadType === "contact_exchange" ? "Relationship captured" : "Lead captured",
      detail: `${shape.name} captured from ${shape.source}.`,
      status: "received",
      type: "contact_card_capture",
      payload: {
        leadType: shape.leadType,
        contactId: contact.id,
        companyId: company.id,
        sourceDetail: clean(payload.sourceDetail),
        eventTag: shape.eventTag,
        relationshipType: shape.relationshipType,
      },
    },
  });

  return lead;
}

function pdlQueryParams(lead: {
  name: string;
  contact?: { email: string | null; phone: string | null } | null;
  company?: { name: string; website: string | null } | null;
}) {
  const params = new URLSearchParams();
  if (lead.contact?.email) params.set("email", lead.contact.email);
  if (lead.contact?.phone) params.set("phone", lead.contact.phone);
  if (lead.name) params.set("name", lead.name);
  if (lead.company?.name && lead.company.name !== "Networking Contact") params.set("company", lead.company.name);
  if (lead.company?.website) params.set("company_website", lead.company.website);
  params.set("pretty", "false");
  return params;
}

function pdlData(payload: Record<string, unknown>) {
  return asObject(payload.data || payload);
}

export async function enrichLeadWithPdl(leadId: string) {
  const prisma = getPrisma();
  const apiKey = clean(process.env.PDL_API_KEY);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true, company: true },
  });

  if (!lead) return { status: "skipped", reason: "missing_lead" };
  if (!lead.contactId || !lead.companyId) return { status: "skipped", reason: "missing_contact_or_company" };

  if (!apiKey) {
    await createAutomationEvent({
      leadId,
      title: "PDL enrichment blocked",
      detail: "Add PDL_API_KEY to enrich QR contact exchanges.",
      status: "blocked",
      type: "contact_card_pdl_enrichment",
      payload: { leadId },
    });
    return { status: "blocked", reason: "missing_pdl_api_key" };
  }

  const response = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${pdlQueryParams(lead)}`, {
    headers: { "X-Api-Key": apiKey },
  });

  const rawText = await response.text();
  const parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

  if (!response.ok) {
    await createAutomationEvent({
      leadId,
      title: "PDL enrichment failed",
      detail: `People Data Labs returned ${response.status}.`,
      status: "failed",
      type: "contact_card_pdl_enrichment",
      payload: { leadId, status: response.status, response: rawText.slice(0, 500) },
    });
    return { status: "failed", reason: `pdl_${response.status}` };
  }

  const data = pdlData(parsed);
  const enrichedRole = clean(data.job_title);
  const enrichedCompany = clean(data.job_company_name);
  const enrichedIndustry = clean(data.job_company_industry);
  const enrichedWebsite = clean(data.job_company_website);
  const enrichedLinkedIn = clean(data.linkedin_url);
  const enrichedLocation = clean(data.location_name);

  await prisma.$transaction([
    prisma.contact.update({
      where: { id: lead.contactId || "" },
      data: {
        role: lead.contact?.role || enrichedRole || null,
        email: lead.contact?.email || clean(data.work_email) || null,
        phone: lead.contact?.phone || clean(data.mobile_phone) || null,
      },
    }),
    prisma.company.update({
      where: { id: lead.companyId || "" },
      data: {
        name: enrichedCompany || lead.companyName,
        niche: enrichedIndustry || lead.niche,
        website: lead.company?.website || enrichedWebsite || null,
      },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: {
        companyName: enrichedCompany || lead.companyName,
        niche: enrichedIndustry || lead.niche,
        score: Math.max(lead.score, enrichedRole || enrichedLinkedIn ? 72 : lead.score),
        lastTouch: "PDL enrichment checked",
      },
    }),
  ]);

  await createAutomationEvent({
    leadId,
    title: "PDL enrichment complete",
    detail: enrichedRole || enrichedCompany ? "QR contact exchange was enriched with PDL data." : "PDL returned a match with limited appended fields.",
    status: "done",
    type: "contact_card_pdl_enrichment",
    payload: {
      provider: "people_data_labs",
      likelihood: parsed.likelihood || null,
      role: enrichedRole,
      company: enrichedCompany,
      industry: enrichedIndustry,
      website: enrichedWebsite,
      linkedin: enrichedLinkedIn,
      location: enrichedLocation,
    } as Prisma.InputJsonObject,
  });

  return { status: "done", enriched: Boolean(enrichedRole || enrichedCompany || enrichedLinkedIn) };
}

export async function syncLeadToGoogleContacts(leadId: string) {
  const prisma = getPrisma();
  const accessToken = await getGoogleContactsAccessToken();
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true, company: true },
  });

  if (!lead || !lead.contact) return { status: "skipped", reason: "missing_contact" };

  const note = `Met via QR contact card. Relationship type: ${lead.stage}. Source: ${lead.source}.`;
  const contactPayload = {
    names: [{ displayName: lead.contact.name }],
    emailAddresses: lead.contact.email ? [{ value: lead.contact.email }] : undefined,
    phoneNumbers: lead.contact.phone ? [{ value: lead.contact.phone }] : undefined,
    organizations: [{ name: lead.companyName, title: lead.contact.role || undefined }],
    biographies: [{ value: note, contentType: "TEXT_PLAIN" }],
    urls: lead.company?.website ? [{ value: lead.company.website, type: "work" }] : undefined,
  };

  if (!contactSyncEnabled() || !accessToken) {
    await createAutomationEvent({
      leadId,
      title: "Google contact sync blocked",
      detail: "Enable GOOGLE_CONTACTS_SYNC_ENABLED and add Google Contacts OAuth credentials to create phone contacts.",
      status: "blocked",
      type: "google_contacts_sync",
      payload: { leadId, contact: contactPayload },
    });
    return { status: "blocked", reason: "missing_google_contacts_config" };
  }

  const response = await fetch(
    "https://people.googleapis.com/v1/people:createContact?personFields=names,emailAddresses,phoneNumbers,organizations,biographies,urls",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contactPayload),
    },
  );

  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    await createAutomationEvent({
      leadId,
      title: "Google contact sync failed",
      detail: `Google People API returned ${response.status}.`,
      status: "failed",
      type: "google_contacts_sync",
      payload: { leadId, status: response.status, result },
    });
    return { status: "failed", reason: `google_${response.status}` };
  }

  await createAutomationEvent({
    leadId,
    title: "Google contact synced",
    detail: `${lead.contact.name} was created in Google Contacts.`,
    status: "done",
    type: "google_contacts_sync",
    payload: { leadId, resourceName: result.resourceName || null },
  });
  return { status: "done", resourceName: result.resourceName || null };
}

async function getGoogleContactsAccessToken() {
  const staticToken = clean(process.env.GOOGLE_CONTACTS_ACCESS_TOKEN);
  if (staticToken) return staticToken;

  const clientId = clean(process.env.GOOGLE_CONTACTS_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CONTACTS_CLIENT_SECRET);
  const refreshToken = clean(process.env.GOOGLE_CONTACTS_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) return "";

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) return "";
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
  return clean(payload.access_token);
}

export async function runContactCardAutomation(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(Math.max(Number(input.limit || 10), 1), 50);
  const pendingEvents = await prisma.automationEvent.findMany({
    where: {
      workspaceId: workspace.id,
      status: "pending",
      type: { in: ["contact_card_pdl_enrichment", "google_contacts_sync"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const processedEvents = [];
  for (const event of pendingEvents) {
    const payload = asObject(event.payload);
    const leadId = clean(payload.leadId) || event.leadId || "";
    if (!leadId) {
      processedEvents.push({ eventId: event.id, status: "skipped", reason: "missing_lead_id" });
      continue;
    }

    const result =
      event.type === "contact_card_pdl_enrichment"
        ? await enrichLeadWithPdl(leadId)
        : await syncLeadToGoogleContacts(leadId);

    await prisma.automationEvent.update({
      where: { id: event.id },
      data: { status: result.status === "done" ? "done" : result.status === "failed" ? "failed" : "blocked" },
    });
    processedEvents.push({ eventId: event.id, type: event.type, ...result });
  }

  const dueFollowUps = await prisma.outreachQueueItem.findMany({
    where: {
      workspaceId: workspace.id,
      status: "pending",
      scheduledFor: { lte: new Date() },
      reason: { contains: "QR contact exchange follow-up" },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const followUps = [];
  for (const item of dueFollowUps) {
    if (!autoSendFollowUps()) {
      followUps.push({ itemId: item.id, status: "pending_approval" });
      continue;
    }
    const result = await approveOutreachQueueItem(item.id);
    followUps.push({ itemId: item.id, ok: result.ok, status: result.status });
  }

  return {
    processedEvents,
    followUps,
    autoSendFollowUps: autoSendFollowUps(),
  };
}
