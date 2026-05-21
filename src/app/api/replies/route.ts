import { NextResponse } from "next/server";
import { createBookingTaskForLead } from "@/lib/automation";
import { addSuppressionRecord } from "@/lib/suppression";
import { getPrisma } from "@/lib/prisma";
import { notifySlackReplyAlert } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

function classify(body: string) {
  const text = body.toLowerCase();
  if (/\bstop\b|unsubscribe|do not contact/.test(text)) return "stop";
  if (/book|calendar|meeting|schedule|available|tomorrow|this week/.test(text)) return "booked";
  if (/pricing|price|cost|send|info|details|interested|tell me more|learn more/.test(text)) return "hot";
  if (/too expensive|budget|can't afford|not in budget/.test(text)) return "objection";
  if (/not now|later|next month|follow up|circle back|check back/.test(text)) return "nurture";
  if (/no thanks|not interested|wrong person|don't need|do not need/.test(text)) return "dead";
  return "needs-review";
}

function replyRoute(classification: string, companyName: string) {
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
      nextAction: `Set a nurture reminder and send a short proof point before the requested follow-up window.`,
    };
  }
  if (classification === "stop" || classification === "dead") {
    return {
      stage: "Contacted",
      scoreDelta: -20,
      nextAction: `Do not continue outreach unless the contact re-engages. Review suppression before any future touch.`,
    };
  }
  return {
    stage: "Replied",
    scoreDelta: 2,
    nextAction: `Review this reply manually, then choose whether to book, nurture, answer an objection, or suppress.`,
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const replies = await prisma.reply.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: { lead: true },
    });

    return NextResponse.json({ replies });
  } catch (error) {
    return NextResponse.json(
      { error: "Replies unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();
  const leadId = body.leadId ? String(body.leadId) : null;
  const replyBody = String(body.body || "");
  const classification = body.classification ? String(body.classification) : classify(replyBody);

  const reply = await prisma.reply.create({
    data: {
      workspaceId: workspace.id,
      leadId,
      channel: String(body.channel || "email"),
      from: String(body.from || ""),
      body: replyBody,
      classification,
      source: String(body.source || "manual"),
    },
    include: { lead: true },
  });

  if (leadId) {
    const existingLead = await prisma.lead.findUnique({ where: { id: leadId } });
    const route = replyRoute(classification, existingLead?.companyName || "this lead");
    await prisma.interaction.create({
      data: {
        leadId,
        channel: String(body.channel || "email"),
        direction: "inbound",
        body: replyBody,
        classification,
      },
    });
    const updatedLead = existingLead
      ? await prisma.lead.update({
          where: { id: leadId },
          data: {
            lastTouch: "Just now",
            stage: route.stage,
            score: Math.max(0, Math.min(100, existingLead.score + route.scoreDelta)),
            nextAction: route.nextAction,
          },
          include: {
            opportunities: true,
            interactions: {
              orderBy: { createdAt: "desc" },
              take: 3,
            },
          },
      })
      : null;

    const booking =
      updatedLead && ["hot", "booked"].includes(classification)
        ? await createBookingTaskForLead({ leadId, replyBody, classification })
        : null;

    const slack = updatedLead
      ? await notifySlackReplyAlert({
          leadId,
          companyName: updatedLead.companyName,
          contactName: updatedLead.name,
          classification,
          body: replyBody,
          nextAction: updatedLead.nextAction,
        })
      : null;

    if (classification === "stop" && body.from) {
      await addSuppressionRecord({
        type: String(body.from).includes("@") ? "email" : "phone",
        value: String(body.from),
        reason: "Inbound stop request",
        source: "reply",
      });
    }

    return NextResponse.json({ reply, lead: updatedLead, route, booking, slack }, { status: 201 });
  }

  if (classification === "stop" && body.from) {
    await addSuppressionRecord({
      type: String(body.from).includes("@") ? "email" : "phone",
      value: String(body.from),
      reason: "Inbound stop request",
      source: "reply",
    });
  }

  return NextResponse.json({ reply }, { status: 201 });
}
