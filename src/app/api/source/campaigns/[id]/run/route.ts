import { NextResponse } from "next/server";
import { searchFreshLeads, type SourceLead } from "@/lib/sourcing";
import { getPrisma } from "@/lib/prisma";

function splitList(value: string | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(
  _request: Request,
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
