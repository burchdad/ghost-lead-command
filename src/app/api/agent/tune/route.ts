import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { signalPlays } from "@/lib/signal-plays";
import { getDefaultWorkspace } from "@/lib/workspace";

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const [leads, queue, replies, campaigns] = await Promise.all([
      prisma.lead.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.sourcingCampaign.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" } }),
    ]);
    const sentOrQueued = queue.filter((item) => ["queued", "sent"].includes(item.status)).length;
    const failed = queue.filter((item) => item.status === "failed").length;
    const replyRate = rate(replies.length, Math.max(sentOrQueued, 1));
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active").length;
    const recommendedPlays = signalPlays.slice(0, replyRate >= 3 ? 3 : 2);

    return NextResponse.json({
      summary: {
        leads: leads.length,
        sentOrQueued,
        replies: replies.length,
        failed,
        replyRate,
        activeCampaigns,
      },
      recommendedPlays,
      recommendation:
        replyRate >= 3
          ? "Scale the top signal plays cautiously and keep failed-send suppression tight."
          : "Keep volume controlled, activate two high-signal source campaigns, and test sharper signal-first copy.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Tuning readout unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const existing = await prisma.sourcingCampaign.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, query: true },
    });
    const existingKeys = new Set(existing.map((campaign) => `${campaign.name}:${campaign.query}`.toLowerCase()));
    const created = [];

    for (const play of signalPlays.slice(0, 3)) {
      const key = `${play.name}:${play.query}`.toLowerCase();
      if (existingKeys.has(key)) continue;
      const campaign = await prisma.sourcingCampaign.create({
        data: {
          workspaceId: workspace.id,
          name: play.name,
          provider: play.provider,
          query: play.query,
          location: play.location,
          industries: play.industries.join(", "),
          titles: play.titles.join(", "),
          dailyLimit: play.size,
          scoreThreshold: play.minScore,
          status: "active",
        },
      });
      created.push(campaign);
    }

    await createAutomationEvent({
      title: "Self-tuning agent updated source plays",
      detail: created.length
        ? `Activated ${created.length} high-signal source campaigns.`
        : "Existing high-signal source campaigns already cover the recommended plays.",
      status: "done",
      type: "agent",
      payload: { created: created.map((campaign) => campaign.id) },
    });

    return NextResponse.json({
      ok: true,
      created,
      message: created.length
        ? `Created ${created.length} active source campaigns.`
        : "Recommended source campaigns already exist.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Self-tuning failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
