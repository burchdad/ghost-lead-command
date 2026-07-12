import { createAutomationEvent } from "@/lib/automation";
import { computeConversionLearning } from "@/lib/conversion-learning";
import { getPrisma } from "@/lib/prisma";
import { getSignalPlay } from "@/lib/signal-plays";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function runAdaptiveLearningLoop(input: { activate?: boolean; limit?: number } = {}) {
  const learning = await computeConversionLearning();
  const activate = input.activate !== false;
  const recommendedPlayIds = learning.summary.recommendedPlayIds.slice(0, Math.min(4, Math.max(1, Number(input.limit || 3))));
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const existing = await prisma.sourcingCampaign.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, query: true, status: true },
  });
  const existingKeys = new Set(existing.map((campaign) => `${campaign.name}:${campaign.query}`.toLowerCase()));
  const created = [];
  const refreshed = [];

  if (activate) {
    for (const playId of recommendedPlayIds) {
      const play = getSignalPlay(playId);
      if (!play) continue;
      const key = `${play.name}:${play.query}`.toLowerCase();
      if (existingKeys.has(key)) {
        const matches = existing.filter((campaign) => `${campaign.name}:${campaign.query}`.toLowerCase() === key && campaign.status !== "active");
        for (const match of matches) {
          refreshed.push(await prisma.sourcingCampaign.update({ where: { id: match.id }, data: { status: "active" } }));
        }
        continue;
      }
      created.push(await prisma.sourcingCampaign.create({
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
      }));
    }
  }

  await createAutomationEvent({
    title: activate ? "Vega learning loop tuned source plays" : "Vega learning loop readout",
    detail: activate
      ? `Recommended ${recommendedPlayIds.length} plays, created ${created.length}, refreshed ${refreshed.length}. Closeness ${learning.summary.gojiBerryCloseness}.`
      : `Recommended ${recommendedPlayIds.length} plays without activation. Closeness ${learning.summary.gojiBerryCloseness}.`,
    status: "done",
    type: "agent",
    payload: {
      recommendedPlayIds,
      created: created.map((campaign) => campaign.id),
      refreshed: refreshed.map((campaign) => campaign.id),
      summary: learning.summary,
    },
  });

  return {
    ok: true,
    activate,
    learning,
    recommendedPlayIds,
    created,
    refreshed,
    message: created.length || refreshed.length
      ? `Learning loop activated ${created.length + refreshed.length} source plays.`
      : "Learning loop found existing recommended plays already active.",
  };
}
