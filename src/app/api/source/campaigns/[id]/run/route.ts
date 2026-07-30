import { NextResponse } from "next/server";
import { findClientCampaignUpdateConfigs, sendClientCampaignDigest } from "@/lib/client-campaign-updates";
import { searchFreshLeads, type SourceLead } from "@/lib/sourcing";
import { runLeadCommandAgent } from "@/lib/agent";
import { getPrisma } from "@/lib/prisma";

function splitList(value: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const campaign = await prisma.sourcingCampaign.findUnique({ where: { id } });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const provider =
    campaign.provider === "ghost-lead-agent" || campaign.provider === "google-maps"
      ? campaign.provider
      : "pdl";

  const body = await request.json().catch(() => ({}));
  const previewOnly = body.previewOnly === true;

  if (!previewOnly) {
    const agentResult = await runLeadCommandAgent({
      provider,
      query: campaign.query,
      location: campaign.location || undefined,
      industries: splitList(campaign.industries),
      titles: splitList(campaign.titles),
      size: campaign.dailyLimit,
      minScore: campaign.scoreThreshold,
      queueLimit: campaign.dailyLimit,
      autoSend: body.autoSend !== false,
      campaignName: campaign.name,
    });

    await prisma.sourcingCampaign.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });

    const clientUpdateResults = await sendClientRunUpdates({
      campaignName: campaign.name,
      leadsFound: agentResult.items.length,
      qualified: agentResult.qualified,
      emailsSent: agentResult.autoSendSummary?.sent || 0,
      callTasksDue: agentResult.autoSendSummary?.callAssistTasks?.length || 0,
      notableLeads: agentResult.items.slice(0, 8).map((item) => ({
        companyName: item.lead?.companyName || "Unknown company",
        contactName: item.lead?.name,
        phone: null,
        email: null,
        nextAction: item.lead?.nextAction || "Review and call if Vega marked this as phone-assist ready.",
        reason: item.reason,
      })),
    });

    return NextResponse.json({
      campaign,
      agentResult,
      result: { leads: agentResult.items },
      qualified: agentResult.items,
      qualifiedCount: agentResult.qualified,
      autoSendSummary: agentResult.autoSendSummary,
      clientUpdateResults,
      message: agentResult.message,
    });
  }

  const result = await searchFreshLeads({
    provider,
    query: campaign.query,
    location: campaign.location || undefined,
    industries: splitList(campaign.industries),
    titles: splitList(campaign.titles),
    size: campaign.dailyLimit,
  });

  const qualified = result.leads.filter(
    (lead: SourceLead) =>
      lead.score >= campaign.scoreThreshold &&
      Boolean(lead.signalSummary?.trim() || lead.intentSignals?.length),
  );

  await prisma.sourcingCampaign.update({
    where: { id },
    data: { lastRunAt: new Date() },
  });

  return NextResponse.json({
    campaign,
    result,
    qualified,
    qualifiedCount: qualified.length,
  });
}

async function sendClientRunUpdates(input: {
  campaignName: string;
  leadsFound: number;
  qualified: number;
  emailsSent: number;
  callTasksDue: number;
  notableLeads: Array<{
    companyName: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    nextAction: string;
    reason?: string | null;
  }>;
}) {
  const configs = await findClientCampaignUpdateConfigs({ campaignName: input.campaignName });
  const afterRunConfigs = configs.filter((config) => config.cadence === "after-run" || config.cadence === "daily-and-after-run");
  return Promise.all(
    afterRunConfigs.map((config) =>
      sendClientCampaignDigest({
        clientName: config.clientName,
        campaignName: input.campaignName,
        recipientEmail: config.recipientEmail,
        recipientName: config.recipientName,
        summary:
          input.emailsSent > 0
            ? `Vega completed this sourcing run and sent ${input.emailsSent} eligible emails. Phone follow-up should happen while the email is fresh.`
            : `Vega completed this sourcing run. Email sending was held or no contacts passed the current send policy, so the sales action is call/research-first.`,
        metrics: {
          leadsFound: input.leadsFound,
          qualified: input.qualified,
          emailsSent: input.emailsSent,
          callTasksDue: input.callTasksDue,
          warmLeads: 0,
          replies: 0,
          quoteOpportunities: 0,
          bookedMeetings: 0,
          suppressed: 0,
        },
        humanActions: [
          input.callTasksDue
            ? `Work the ${input.callTasksDue} phone-assist tasks Vega created from this run.`
            : "Review the top leads and call/research the ones without a verified email path.",
          "Record every call outcome so Vega can learn which sources create reachable commercial prospects.",
        ],
        notableLeads: input.notableLeads,
      }),
    ),
  );
}
