import { NextResponse } from "next/server";
import {
  buildCampaignHealth,
  buildExecutiveDashboard,
  buildVegaIntelligenceGraph,
} from "@/lib/vega-intelligence-fusion";
import { getPrisma } from "@/lib/prisma";
import { persistOpportunityIntelligenceSnapshot } from "@/lib/vega-intelligence-snapshots";
import { getDefaultWorkspace } from "@/lib/workspace";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function campaignNameFromLead(lead: { customFields: unknown; source: string; niche: string }) {
  const fields = lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
    ? lead.customFields as Record<string, unknown>
    : {};
  return clean(fields.campaignName) || `${lead.source || "Unknown source"} - ${lead.niche || "Unknown niche"}`;
}

function probabilityBand(value: number | null | undefined) {
  const n = Number(value || 0);
  if (n >= 75) return "high";
  if (n >= 45) return "medium";
  if (n > 0) return "low";
  return "unknown";
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const url = new URL(request.url);
  const leadId = clean(url.searchParams.get("leadId"));

  if (leadId) {
    const graph = await buildVegaIntelligenceGraph({ workspaceId: workspace.id, leadId });
    return NextResponse.json({ mode: "lead-graph", graph });
  }

  const today = startOfToday();
  const [leads, opportunities, replies, interactions, queue, sourceProfiles, latestSnapshots] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 1500,
    }),
    prisma.opportunity.findMany({
      where: { company: { is: { workspaceId: workspace.id } } },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    }),
    prisma.reply.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.interaction.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { lead: true },
    }),
    prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 1500,
      include: { lead: true },
    }),
    prisma.sourceQualityProfile.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { refreshedAt: "desc" },
      take: 100,
    }),
    prisma.opportunityIntelligenceSnapshot.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { lead: true },
    }),
  ]);

  const latestSnapshotByLead = new Map<string, (typeof latestSnapshots)[number]>();
  for (const snapshot of latestSnapshots) {
    if (!latestSnapshotByLead.has(snapshot.leadId)) latestSnapshotByLead.set(snapshot.leadId, snapshot);
  }
  const snapshots = Array.from(latestSnapshotByLead.values());

  const campaignNames = Array.from(new Set([
    ...leads.map(campaignNameFromLead),
    ...queue.map((item) => item.lead ? campaignNameFromLead(item.lead) : ""),
  ].filter(Boolean)));

  const campaigns = campaignNames.map((name) => {
    const campaignLeads = leads.filter((lead) => campaignNameFromLead(lead) === name);
    const campaignQueue = queue.filter((item) => item.lead && campaignNameFromLead(item.lead) === name);
    const sent = campaignQueue.filter((item) => item.status === "sent" || item.status === "queued").length;
    const campaignReplies = replies.filter((reply) => campaignLeads.some((lead) => lead.id === reply.leadId));
    const conversations = interactions.filter((interaction) =>
      campaignLeads.some((lead) => lead.id === interaction.leadId) &&
      /conversation|interested|meeting|booked|reply/i.test(`${interaction.classification || ""} ${interaction.channel}`),
    ).length;
    const meetings = campaignLeads.filter((lead) => /booked|proposal|won/i.test(lead.stage)).length;
    const revenue = opportunities
      .filter((opportunity) => campaignLeads.some((lead) => lead.companyId === opportunity.companyId || lead.id === opportunity.leadId))
      .reduce((sum, opportunity) => sum + opportunity.value, 0);
    const riskyEvents = interactions.filter((interaction) =>
      campaignLeads.some((lead) => lead.id === interaction.leadId) &&
      /bounce|dropped|spam|unsubscribe/i.test(interaction.classification || ""),
    ).length;
    const sourceQuality = sourceProfiles.find((profile) => {
      const segment = clean(profile.segment).toLowerCase();
      return segment ? name.toLowerCase().includes(segment) : false;
    })?.score ?? 70;
    const trust = campaignLeads.length
      ? Math.round(campaignLeads.reduce((sum, lead) => sum + lead.score, 0) / campaignLeads.length)
      : 50;

    return buildCampaignHealth({
      name,
      leads: campaignLeads.length,
      sent,
      replies: campaignReplies.length,
      conversations,
      meetings,
      revenue,
      riskyEvents,
      sourceQuality,
      trust,
    });
  });

  const executiveDashboard = buildExecutiveDashboard({
    opportunities,
    conversationsToday: interactions.filter((interaction) => /conversation|interested|meeting|booked|reply/i.test(`${interaction.classification || ""} ${interaction.channel}`)).length,
    meetings: opportunities.filter((opportunity) => /booking|booked|proposal|won/i.test(opportunity.stage)).length,
    humanTasks: queue.filter((item) => item.status === "pending" && (item.channel === "manual" || /Executive review/i.test(item.reason || ""))).length,
    campaigns,
    sourcePerformance: sourceProfiles.map((profile) => ({ source: `${profile.provider}:${profile.sourceType}${profile.segment ? `:${profile.segment}` : ""}`, score: profile.score })),
  });

  const bestOpportunitiesToday = snapshots
    .filter((snapshot) => snapshot.decisionLane === "auto-send" || snapshot.decisionLane === "call-first")
    .sort((a, b) => b.overallConfidence - a.overallConfidence)
    .slice(0, 12)
    .map((snapshot) => ({
      leadId: snapshot.leadId,
      companyName: snapshot.lead?.companyName || "Unknown company",
      contactName: snapshot.lead?.name || "Unknown contact",
      trustScore: snapshot.trustScore,
      overallConfidence: snapshot.overallConfidence,
      snapshotType: snapshot.snapshotType,
      decisionLane: snapshot.decisionLane,
      recommendedChannel: snapshot.recommendedChannel,
      recommendedAction: snapshot.recommendedAction,
      meetingLikelihood: probabilityBand(snapshot.meetingProbability),
      evidenceBasis: Array.isArray(snapshot.evidence) ? `${snapshot.evidence.length} evidence items` : "Stored evidence object",
      createdAt: snapshot.createdAt,
    }));
  const humanInterventions = snapshots
    .filter((snapshot) => snapshot.decisionLane === "executive-review" || snapshot.decisionLane === "call-first")
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 12)
    .map((snapshot) => ({
      leadId: snapshot.leadId,
      companyName: snapshot.lead?.companyName || "Unknown company",
      contactName: snapshot.lead?.name || "Unknown contact",
      snapshotType: snapshot.snapshotType,
      decisionLane: snapshot.decisionLane,
      reason:
        snapshot.explanation && typeof snapshot.explanation === "object" && !Array.isArray(snapshot.explanation) && "reason" in snapshot.explanation
          ? String(snapshot.explanation.reason)
          : snapshot.recommendedAction,
      recommendedAction: snapshot.recommendedAction,
      trustScore: snapshot.trustScore,
      createdAt: snapshot.createdAt,
    }));
  const highestExpectedValueCalls = snapshots
    .filter((snapshot) => snapshot.decisionLane === "call-first")
    .sort((a, b) => Number(b.meetingProbability || 0) - Number(a.meetingProbability || 0))
    .slice(0, 8)
    .map((snapshot) => ({
      leadId: snapshot.leadId,
      companyName: snapshot.lead?.companyName || "Unknown company",
      contactName: snapshot.lead?.name || "Unknown contact",
      snapshotType: snapshot.snapshotType,
      meetingLikelihood: probabilityBand(snapshot.meetingProbability),
      trustScore: snapshot.trustScore,
      recommendedAction: snapshot.recommendedAction,
    }));
  const senderRisks = snapshots
    .filter((snapshot) => snapshot.senderHealth < 75 || Number(snapshot.bounceProbability || 0) >= 20)
    .slice(0, 8)
    .map((snapshot) => ({
      leadId: snapshot.leadId,
      companyName: snapshot.lead?.companyName || "Unknown company",
      snapshotType: snapshot.snapshotType,
      senderHealth: snapshot.senderHealth,
      bounceRisk: probabilityBand(snapshot.bounceProbability),
      recommendedAction: snapshot.recommendedAction,
    }));

  return NextResponse.json({
    mode: "executive-dashboard",
    executiveDashboard,
    campaigns,
    intelligence: {
      snapshotCount: latestSnapshots.length,
      latestByLeadCount: snapshots.length,
      bestOpportunitiesToday,
      humanInterventions,
      highestExpectedValueCalls,
      senderRisks,
      calibrationStatus: "Heuristic v1; display bands until enough outcome data calibrates prediction fields.",
    },
  });
}

export async function POST(request: Request) {
  const workspace = await getDefaultWorkspace();
  const body = await request.json().catch(() => ({}));
  const leadId = clean(body.leadId);
  const triggerType = clean(body.triggerType) || "manual_override";
  if (!leadId) {
    return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
  }

  const result = await persistOpportunityIntelligenceSnapshot({
    workspaceId: workspace.id,
    leadId,
    triggerType,
    triggerId: clean(body.triggerId) || null,
    evidence: Array.isArray(body.evidence) ? body.evidence : [clean(body.note)].filter(Boolean),
  });

  return NextResponse.json(result, { status: result.created ? 201 : 202 });
}
