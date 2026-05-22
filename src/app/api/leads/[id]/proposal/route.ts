import { NextResponse } from "next/server";
import { generateSalesText } from "@/lib/ai";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { buildOfferRecommendation, formatOfferContext } from "@/lib/offers";
import { getPrisma } from "@/lib/prisma";
import { notifySlackOutreachApproval } from "@/lib/slack";
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
      contact: true,
      company: true,
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

  const offer = buildOfferRecommendation(lead, lead.interactions);
  const generated = await generateSalesText({
    kind: "proposal",
    lead: {
      name: lead.name,
      companyName: lead.companyName,
      niche: lead.niche,
      stage: lead.stage,
      score: lead.score,
      value: lead.value,
      source: lead.source,
      nextAction: lead.nextAction,
    },
    input: [
      formatOfferContext(offer),
      body.notes ? `Operator notes: ${body.notes}` : "",
      lead.company?.website ? `Company website: ${lead.company.website}` : "",
      lead.contact?.role ? `Contact role: ${lead.contact.role}` : "",
      lead.opportunities[0]
        ? `Opportunity: ${lead.opportunities[0].title}, stage ${lead.opportunities[0].stage}, value $${lead.opportunities[0].value}, probability ${lead.opportunities[0].probability}%`
        : "",
      lead.interactions
        .map((interaction) => `${interaction.channel} ${interaction.direction}${interaction.classification ? ` (${interaction.classification})` : ""}: ${interaction.body}`)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  const opportunity = lead.opportunities[0];
  const proposal = await prisma.proposal.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: opportunity?.id || null,
      title: `${lead.companyName} ${offer.planName} Proposal`,
      status: "draft",
      setupFee: Number(body.setupFee || offer.setupFee),
      monthlyFee: Number(body.monthlyFee || offer.monthlyFee),
      revSharePct: Number(body.revSharePct || offer.revSharePct),
      summary: generated.text,
    },
  });

  await prisma.interaction.create({
    data: {
      leadId: lead.id,
      contactId: lead.contactId,
      channel: "proposal",
      direction: "outbound",
      classification: "draft",
      body: generated.text,
    },
  });

  await prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      leadId: lead.id,
      title: "Proposal generated",
      detail: `${offer.planName} created for ${lead.companyName} with $${offer.setupFee.toLocaleString()} setup and $${offer.monthlyFee.toLocaleString()}/mo response desk.`,
      status: "done",
      type: "proposal",
      payload: {
        proposalId: proposal.id,
        setupFee: offer.setupFee,
        monthlyFee: offer.monthlyFee,
        revSharePct: offer.revSharePct,
        estimatedPipelineValue: offer.estimatedPipelineValue,
      },
    },
  });

  const followUpSubject = sanitizeSubject(`${lead.companyName} proposal next step`);
  const followUpBody = sanitizeCustomerMessage(
    [
      `Hi ${(lead.contact?.name || lead.name).split(" ")[0] || "there"},`,
      "",
      `I put together the ${offer.planName.toLowerCase()} outline for ${lead.companyName}. The main idea is to start with one narrow segment, prove whether the workflow creates qualified replies or booked calls, then decide if it is worth expanding.`,
      "",
      `Would it be useful if I walked you through the scope, cost, and next step this week?`,
    ].join("\n"),
    { channel: "email" },
  );

  const existingFollowUp = await prisma.outreachQueueItem.findFirst({
    where: {
      workspaceId: workspace.id,
      leadId: lead.id,
      channel: "email",
      provider: "sendgrid",
      status: "pending",
      reason: "Proposal follow-up prepared.",
    },
    include: { lead: true },
  });

  const followUp = existingFollowUp
    ? await prisma.outreachQueueItem.update({
      where: { id: existingFollowUp.id },
      data: {
        subject: followUpSubject,
        body: followUpBody,
        updatedAt: new Date(),
      },
      include: { lead: true },
    })
    : await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead.id,
        channel: "email",
        provider: "sendgrid",
        subject: followUpSubject,
        body: followUpBody,
        status: "pending",
        reason: "Proposal follow-up prepared.",
      },
      include: { lead: true },
    });

  await prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      leadId: lead.id,
      title: "Proposal follow-up queued",
      detail: `Approval-ready follow-up queued for ${lead.companyName}.`,
      status: "done",
      type: "proposal",
      payload: {
        proposalId: proposal.id,
        outreachQueueItemId: followUp.id,
      },
    },
  });

  const slack = await notifySlackOutreachApproval(followUp);

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
    proposalShareUrl: new URL(`/proposals/${proposal.id}`, request.url).toString(),
    followUp,
    offer,
    slack,
    lead: updatedLead,
    generation: {
      provider: generated.provider,
      model: generated.model,
      warning: generated.warning,
    },
  });
}
