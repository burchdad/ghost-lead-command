import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSourceScorecard } from "@/lib/source-scorecard";
import { getDefaultWorkspace } from "@/lib/workspace";

function metadataFlag(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)[key] === true;
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const leads = await prisma.lead.findMany({ where: { workspaceId: workspace.id } });
    const queue = await prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id } });
    const replies = await prisma.reply.findMany({ where: { workspaceId: workspace.id } });
    const callInteractions = await prisma.interaction.findMany({
      where: { channel: "phone:human-assist", lead: { is: { workspaceId: workspace.id } } },
      orderBy: { createdAt: "desc" },
    });
    const proposals = await prisma.proposal.findMany({ where: { workspaceId: workspace.id } });
    const [opportunities, sourceScorecard] = await Promise.all([
      prisma.opportunity.findMany({ where: { company: { is: { workspaceId: workspace.id } } } }),
      getSourceScorecard(),
    ]);

    const sent = queue.filter((item) => ["sent", "queued"].includes(item.status)).length;
    const hotReplies = replies.filter((reply) => ["hot", "booked"].includes(reply.classification)).length;
    const won = opportunities.filter((opportunity) => opportunity.stage === "Won").reduce((sum, opportunity) => sum + opportunity.value, 0);
    const pipeline = opportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const sourceBreakdown = leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {});
    const nicheAttribution = leads.reduce<Record<string, { leads: number; queued: number; replies: number; booked: number; pipeline: number }>>(
      (acc, lead) => {
        const key = lead.niche || "Unknown";
        acc[key] ||= { leads: 0, queued: 0, replies: 0, booked: 0, pipeline: 0 };
        acc[key].leads += 1;
        acc[key].queued += queue.filter((item) => item.leadId === lead.id).length;
        acc[key].replies += replies.filter((reply) => reply.leadId === lead.id).length;
        acc[key].booked += lead.stage === "Call Booked" ? 1 : 0;
        acc[key].pipeline += lead.value || 0;
        return acc;
      },
      {},
    );
    const funnel = {
      sourced: leads.length,
      queued: queue.length,
      approved: queue.filter((item) => ["queued", "sent"].includes(item.status)).length,
      replied: replies.length,
      hot: replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length,
      booked: leads.filter((lead) => lead.stage === "Call Booked").length,
      proposal: leads.filter((lead) => lead.stage === "Proposal Sent").length,
      won: leads.filter((lead) => lead.stage === "Won").length,
    };
    const replyRate = sent ? replies.length / sent : 0;
    const hotRate = sent ? hotReplies / sent : 0;
    const phoneAssists = queue.filter((item) => item.channel === "manual" && ["phone-after-email", "phone-website"].includes(item.provider));
    const now = new Date();
    const phoneAssistMetrics = {
      total: phoneAssists.length,
      pending: phoneAssists.filter((item) => item.status === "pending").length,
      due: phoneAssists.filter((item) => item.status === "pending" && (!item.scheduledFor || item.scheduledFor <= now)).length,
      overdue: phoneAssists.filter((item) => item.status === "pending" && item.scheduledFor && item.scheduledFor < now).length,
      completed: phoneAssists.filter((item) => item.status !== "pending").length,
      reached: callInteractions.filter((interaction) => metadataFlag(interaction.metadata, "reached")).length,
      conversations: callInteractions.filter((interaction) => metadataFlag(interaction.metadata, "conversation")).length,
      interested: phoneAssists.filter((item) => ["interested", "info_requested", "meeting_requested"].includes(item.status)).length,
      meetingRequested: phoneAssists.filter((item) => item.status === "meeting_requested").length,
      meetingBooked: phoneAssists.filter((item) => item.status === "meeting_booked").length,
      suppressed: phoneAssists.filter((item) => item.status === "suppressed").length,
      notInterested: phoneAssists.filter((item) => item.status === "not_interested").length,
      wrongPerson: phoneAssists.filter((item) => item.status === "wrong_person").length,
      callback: phoneAssists.filter((item) => ["callback_requested", "call_no_answer", "voicemail_left", "gatekeeper"].includes(item.status)).length,
      attempts: callInteractions.length,
      booked: leads.filter((lead) => lead.stage === "Call Booked").length + phoneAssists.filter((item) => item.status === "meeting_booked").length,
    };

    return NextResponse.json({
      totals: {
        leads: leads.length,
        sent,
        replies: replies.length,
        hotReplies,
        proposals: proposals.length,
        pipeline,
        won,
        replyRate,
        hotRate,
      },
      sourceBreakdown,
      nicheAttribution,
      funnel,
      suppressedOrFailed: queue.filter((item) => item.status === "failed").length,
      queueByStatus: queue.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {}),
      repliesByClass: replies.reduce<Record<string, number>>((acc, reply) => {
        acc[reply.classification] = (acc[reply.classification] || 0) + 1;
        return acc;
      }, {}),
      phoneAssist: phoneAssistMetrics,
      sourceScorecard,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Analytics unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
