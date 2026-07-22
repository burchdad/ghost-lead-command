import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { persistOpportunityIntelligenceSnapshot } from "@/lib/vega-intelligence-snapshots";

const allowedStages = new Set([
  "Imported",
  "Contacted",
  "Networking Contact",
  "Potential Client",
  "Referral Partner",
  "Vendor",
  "Friend of Business",
  "Replied",
  "Call Booked",
  "Proposal Sent",
  "Won",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      opportunities: true,
      interactions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json();

  const stage = body.stage ? String(body.stage) : undefined;
  if (stage && !allowedStages.has(stage)) {
    return NextResponse.json({ error: "Unsupported lead stage" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      stage,
      score: body.score === undefined ? undefined : Number(body.score),
      value: body.value === undefined ? undefined : Number(body.value),
      nextAction: body.nextAction === undefined ? undefined : String(body.nextAction),
      lastTouch: body.lastTouch === undefined ? undefined : String(body.lastTouch),
      opportunities: stage
        ? {
            updateMany: {
              where: { leadId: id },
              data: {
                stage,
                value: body.value === undefined ? undefined : Number(body.value),
              },
            },
          }
        : undefined,
    },
    include: {
      opportunities: true,
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  await persistOpportunityIntelligenceSnapshot({
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    companyId: lead.companyId,
    contactId: lead.contactId,
    triggerType: "manual_override",
    triggerId: lead.id,
    evidence: [
      stage ? `Stage changed to ${stage}` : "",
      body.score === undefined ? "" : `Score set to ${body.score}`,
      body.value === undefined ? "" : `Value set to ${body.value}`,
      body.nextAction === undefined ? "" : `Next action: ${body.nextAction}`,
    ].filter(Boolean),
  }).catch(() => undefined);

  return NextResponse.json({ lead });
}
