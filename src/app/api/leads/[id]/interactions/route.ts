import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json();
  const lead = await prisma.lead.findUnique({ where: { id } });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const interaction = await prisma.interaction.create({
    data: {
      leadId: lead.id,
      contactId: lead.contactId,
      channel: String(body.channel || "note"),
      direction: String(body.direction || "outbound"),
      body: String(body.body || ""),
      classification: body.classification ? String(body.classification) : null,
    },
  });

  const updatedLead = await prisma.lead.update({
    where: { id },
    data: {
      lastTouch: "Just now",
      stage: body.nextStage ? String(body.nextStage) : undefined,
    },
    include: {
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      opportunities: true,
    },
  });

  return NextResponse.json({ interaction, lead: updatedLead }, { status: 201 });
}
