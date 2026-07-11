import { createAutomationEvent, createBookingTaskForLead, getBookingReadiness } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { notifySlackOutreachApproval, notifySlackReplyAlert } from "@/lib/slack";
import { addSuppressionRecord } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

type RecordInboundReplyInput = {
  leadId?: string | null;
  channel?: string;
  from?: string | null;
  body: string;
  source?: string;
  classification?: string | null;
  metadata?: Record<string, unknown>;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

export function classifyReply(body: string) {
  const text = body.toLowerCase();
  if (/\bstop\b|unsubscribe|do not contact/.test(text)) return "stop";
  if (/book|calendar|meeting|schedule|available|tomorrow|this week/.test(text)) return "booked";
  if (/pricing|price|cost|send|info|details|interested|tell me more|learn more/.test(text)) return "hot";
  if (/too expensive|budget|can't afford|not in budget/.test(text)) return "objection";
  if (/not now|later|next month|follow up|circle back|check back/.test(text)) return "nurture";
  if (/no thanks|not interested|wrong person|don't need|do not need/.test(text)) return "dead";
  return "needs-review";
}

export function routeReply(classification: string, companyName: string) {
  if (classification === "booked") {
    return {
      stage: "Call Booked",
      scoreDelta: 14,
      nextAction: `Prep the discovery call for ${companyName}, confirm the calendar time, and bring a simple AI follow-up demo.`,
    };
  }
  if (classification === "hot") {
    return {
      stage: "Replied",
      scoreDelta: 10,
      nextAction: `Send pricing, offer two meeting windows, and ask what lead source ${companyName} wants fixed first.`,
    };
  }
  if (classification === "objection") {
    return {
      stage: "Replied",
      scoreDelta: 4,
      nextAction: `Answer the pricing concern with a small pilot option and ask what a booked job is worth to ${companyName}.`,
    };
  }
  if (classification === "nurture") {
    return {
      stage: "Contacted",
      scoreDelta: 0,
      nextAction: "Set a nurture reminder and send a short proof point before the requested follow-up window.",
    };
  }
  if (classification === "stop" || classification === "dead") {
    return {
      stage: "Contacted",
      scoreDelta: -20,
      nextAction: "Do not continue outreach unless the contact re-engages. Review suppression before any future touch.",
    };
  }
  return {
    stage: "Replied",
    scoreDelta: 2,
    nextAction: "Review this reply manually, then choose whether to book, nurture, answer an objection, or suppress.",
  };
}

function firstName(name: string | null | undefined) {
  return clean(name).split(/\s+/)[0] || "there";
}

function responseSubject(classification: string, companyName: string) {
  if (classification === "booked") return `Re: quick time for ${companyName}`;
  if (classification === "hot") return `Re: quick AI follow-up idea`;
  if (classification === "objection") return `Re: starting small`;
  if (classification === "nurture") return `Re: circling back`;
  return `Re: quick follow-up`;
}

function draftReplyResponse(input: {
  classification: string;
  contactName: string;
  companyName: string;
  replyBody: string;
}) {
  const name = firstName(input.contactName);
  const readiness = getBookingReadiness();
  const meetingLine = readiness.meetingLink
    ? `Here is the booking link: ${readiness.meetingLink}`
    : "Send me two times that work this week and I will lock one in.";

  if (input.classification === "booked") {
    return `${name}, absolutely.\n\n${meetingLine}\n\nI will keep it focused: where lead follow-up is leaking, what can be automated first, and whether there is a fast pilot worth running for ${input.companyName}.\n\nDoes that work?`;
  }

  if (input.classification === "hot") {
    return `${name}, appreciate it.\n\nThe short version: we help teams catch missed lead requests, follow up faster, classify replies, and route the interested ones into booking without rebuilding the whole CRM.\n\nFor ${input.companyName}, I would start by looking at where inquiries currently stall, then show a simple AI follow-up workflow against that path.\n\nWorth a quick 15 minute look this week? ${readiness.meetingLink ? readiness.meetingLink : ""}`;
  }

  if (input.classification === "objection") {
    return `${name}, totally fair.\n\nI would not start with a big rollout. The cleanest version is a small pilot: pick one lead source or old list, recover what is slipping through, and only expand if it creates booked conversations.\n\nIf one recovered job or client is worth more than the pilot, the math is usually easy. Want me to show the smallest version?`;
  }

  if (input.classification === "nurture") {
    return `${name}, sounds good.\n\nI will circle back then. Before I do, I can send a quick example of the workflow so you have the idea in front of you: missed request comes in, AI writes the follow-up, replies get classified, and hot ones go to booking.\n\nWould that be useful?`;
  }

  return "";
}

async function pauseOpenSequenceSteps(input: { leadId: string; classification: string }) {
  if (!["hot", "booked", "objection", "stop", "dead"].includes(input.classification)) {
    return { count: 0 };
  }

  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const result = await prisma.sequenceStep.updateMany({
    where: {
      workspaceId: workspace.id,
      leadId: input.leadId,
      status: { in: ["draft", "active"] },
    },
    data: { status: "paused" },
  });

  if (result.count > 0) {
    await createAutomationEvent({
      leadId: input.leadId,
      title: "Follow-up sequence paused",
      detail: `${result.count} open follow-up step${result.count === 1 ? "" : "s"} paused after ${input.classification} reply.`,
      status: "done",
      type: "sequence",
      payload: { classification: input.classification, pausedSteps: result.count },
    });
  }

  return result;
}

async function queueReplyResponse(input: {
  leadId: string;
  classification: string;
  replyBody: string;
  nextAction: string;
}) {
  if (!["booked", "hot", "objection", "nurture"].includes(input.classification)) {
    return { queued: false, reason: "No response draft needed for this classification." };
  }

  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: { contact: true, company: true },
  });

  if (!lead?.contact?.email) {
    await createAutomationEvent({
      leadId: input.leadId,
      title: "Reply response blocked",
      detail: `${lead?.companyName || "Lead"} replied, but no email is available for a reviewed response draft.`,
      status: "blocked",
      type: "reply",
      payload: { classification: input.classification },
    });
    return { queued: false, reason: "Missing contact email." };
  }

  const existing = await prisma.outreachQueueItem.findFirst({
    where: {
      workspaceId: workspace.id,
      leadId: lead.id,
      status: "pending",
      reason: { startsWith: "Reply response:" },
    },
    orderBy: { createdAt: "desc" },
    include: { lead: true },
  });

  if (existing) {
    return { queued: false, reason: "Reply response already pending.", item: existing };
  }

  const subject = sanitizeSubject(responseSubject(input.classification, lead.companyName));
  const body = sanitizeCustomerMessage(
    draftReplyResponse({
      classification: input.classification,
      contactName: lead.name,
      companyName: lead.companyName,
      replyBody: input.replyBody,
    }),
    { channel: "email" },
  );

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: workspace.id,
      leadId: lead.id,
      channel: "email",
      provider: "sendgrid",
      subject,
      body,
      status: "pending",
      reason: `Reply response: ${input.classification}. ${input.nextAction}`,
      scheduledFor: new Date(),
    },
    include: { lead: true },
  });

  const slack = await notifySlackOutreachApproval(item);
  await createAutomationEvent({
    leadId: lead.id,
    title: "Reply response queued",
    detail: `${lead.companyName} ${input.classification} reply has a response draft waiting for approval.`,
    status: "done",
    type: "reply",
    payload: { queueItemId: item.id, classification: input.classification, slack },
  });

  return { queued: true, item, slack };
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function extractEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() || "";
}

export async function findLeadForInboundReply(input: { from?: string | null; channel?: string }) {
  const from = clean(input.from);
  if (!from) return null;

  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();

  if (from.includes("@") || input.channel === "email") {
    const email = extractEmail(from);
    if (!email) return null;
    return prisma.lead.findFirst({
      where: {
        workspaceId: workspace.id,
        contact: { email: { equals: email, mode: "insensitive" } },
      },
      orderBy: { updatedAt: "desc" },
      include: { contact: true, company: true },
    });
  }

  const phone = normalizePhone(from);
  if (!phone) return null;
  const leads = await prisma.lead.findMany({
    where: { workspaceId: workspace.id, contact: { phone: { not: null } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { contact: true, company: true },
  });

  return leads.find((lead) => normalizePhone(lead.contact?.phone || "").endsWith(phone.slice(-10))) || null;
}

export async function recordInboundReply(input: RecordInboundReplyInput) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const replyBody = clean(input.body);
  const matchedLead = input.leadId
    ? await prisma.lead.findUnique({ where: { id: input.leadId }, include: { contact: true, company: true } })
    : await findLeadForInboundReply({ from: input.from, channel: input.channel });
  const leadId = matchedLead?.id || null;
  const classification = input.classification || classifyReply(replyBody);
  const channel = clean(input.channel) || "email";
  const from = clean(input.from);

  const reply = await prisma.reply.create({
    data: {
      workspaceId: workspace.id,
      leadId,
      channel,
      from,
      body: replyBody,
      classification,
      source: clean(input.source) || "manual",
    },
    include: { lead: true },
  });

  if (classification === "stop" && from) {
    await addSuppressionRecord({
      type: from.includes("@") ? "email" : "phone",
      value: from,
      reason: "Inbound stop request",
      source: input.source || "reply",
    });
  }

  if (!leadId || !matchedLead) {
    return { reply, lead: null, route: null, booking: null, slack: null, matched: false };
  }

  const route = routeReply(classification, matchedLead.companyName);
  const pausedSequence = await pauseOpenSequenceSteps({ leadId, classification });
  await prisma.interaction.create({
    data: {
      leadId,
      contactId: matchedLead.contactId,
      channel,
      direction: "inbound",
      body: replyBody,
      classification,
    },
  });

  const updatedLead = await prisma.lead.update({
    where: { id: leadId },
    data: {
      lastTouch: "Just now",
      stage: route.stage,
      score: Math.max(0, Math.min(100, matchedLead.score + route.scoreDelta)),
      nextAction: route.nextAction,
    },
    include: {
      opportunities: true,
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  const booking =
    ["hot", "booked"].includes(classification)
      ? await createBookingTaskForLead({ leadId, replyBody, classification })
      : null;

  const responseDraft = await queueReplyResponse({
    leadId,
    classification,
    replyBody,
    nextAction: updatedLead.nextAction,
  });

  const slack = await notifySlackReplyAlert({
    leadId,
    companyName: updatedLead.companyName,
    contactName: updatedLead.name,
    classification,
    body: replyBody,
    nextAction: updatedLead.nextAction,
    responseQueued: responseDraft.queued,
    responseNote: responseDraft.reason,
  });

  return { reply, lead: updatedLead, route, booking, responseDraft, pausedSequence, slack, matched: true };
}
