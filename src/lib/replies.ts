import { createBookingTaskForLead } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { notifySlackReplyAlert } from "@/lib/slack";
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

  const slack = await notifySlackReplyAlert({
    leadId,
    companyName: updatedLead.companyName,
    contactName: updatedLead.name,
    classification,
    body: replyBody,
    nextAction: updatedLead.nextAction,
  });

  return { reply, lead: updatedLead, route, booking, slack, matched: true };
}
