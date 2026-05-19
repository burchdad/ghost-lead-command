import { NextResponse } from "next/server";
import { addSuppressionRecord } from "@/lib/suppression";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

function classify(body: string) {
  const text = body.toLowerCase();
  if (/\bstop\b|unsubscribe|do not contact/.test(text)) return "stop";
  if (/book|calendar|call|meeting|this week|pricing|send/.test(text)) return "hot";
  if (/not now|later|next month|follow up/.test(text)) return "nurture";
  if (/too expensive|cost|budget|price/.test(text)) return "objection";
  return "needs-review";
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
    const nextStage = classification === "hot" ? "Replied" : undefined;
    await prisma.interaction.create({
      data: {
        leadId,
        channel: String(body.channel || "email"),
        direction: "inbound",
        body: replyBody,
        classification,
      },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastTouch: "Just now", stage: nextStage },
    });
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
