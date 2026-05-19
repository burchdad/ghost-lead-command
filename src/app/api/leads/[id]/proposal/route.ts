import { NextResponse } from "next/server";
import { generateSalesText } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json().catch(() => ({}));

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      opportunities: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const generated = await generateSalesText({
    kind: "proposal",
    lead: {
      name: lead.name,
      companyName: lead.companyName,
      niche: lead.niche,
      stage: lead.stage,
      score: lead.score,
      value: lead.value,
    },
    input: [
      body.notes ? `Operator notes: ${body.notes}` : "",
      lead.interactions.map((interaction) => interaction.body).join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const opportunity = lead.opportunities[0];
  const proposal = await prisma.proposal.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: opportunity?.id || null,
      title: `${lead.companyName} AI Revival Proposal`,
      status: "draft",
      setupFee: Number(body.setupFee || 2500),
      monthlyFee: Number(body.monthlyFee || 1000),
      revSharePct: Number(body.revSharePct || 12),
      summary: generated.text,
    },
  });

  const updatedLead = await prisma.lead.update({
    where: { id },
    data: {
      stage: "Proposal Sent",
      lastTouch: "Just now",
      nextAction: "Review proposal, send close-plan follow-up, and ask for pilot approval.",
      opportunities: {
        updateMany: {
          where: { leadId: id },
          data: { stage: "Proposal Sent" },
        },
      },
    },
    include: {
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      opportunities: true,
    },
  });

  return NextResponse.json({
    proposal,
    lead: updatedLead,
    generation: {
      provider: generated.provider,
      model: generated.model,
      warning: generated.warning,
    },
  });
}
