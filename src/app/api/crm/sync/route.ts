import { NextResponse } from "next/server";
import { pushLeadToGhostCrm } from "@/lib/ghostcrm";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const prisma = getPrisma();
  const body = await request.json();
  const leadId = String(body.leadId || "");

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const sync = await pushLeadToGhostCrm(lead);

  await prisma.interaction.create({
    data: {
      leadId: lead.id,
      contactId: lead.contactId,
      channel: "crm:ghostcrm",
      direction: "outbound",
      body: sync.message,
      classification: sync.status,
    },
  });

  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: sync.status === "synced" ? "crm_synced" : lead.status,
      lastTouch: "Just now",
    },
    include: {
      interactions: { orderBy: { createdAt: "desc" }, take: 5 },
      opportunities: true,
    },
  });

  return NextResponse.json({ sync, lead: updatedLead });
}
