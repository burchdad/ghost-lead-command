import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const [leads, queue, replies, proposals, opportunities] = await Promise.all([
    prisma.lead.findMany({ where: { workspaceId: workspace.id } }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id } }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id } }),
    prisma.proposal.findMany({ where: { workspaceId: workspace.id } }),
    prisma.opportunity.findMany({ where: { company: { is: { workspaceId: workspace.id } } } }),
  ]);

  const sent = queue.filter((item) => ["sent", "queued"].includes(item.status)).length;
  const hotReplies = replies.filter((reply) => reply.classification === "hot").length;
  const won = opportunities.filter((opportunity) => opportunity.stage === "Won").reduce((sum, opportunity) => sum + opportunity.value, 0);
  const pipeline = opportunities.reduce((sum, opportunity) => sum + opportunity.value, 0);
  const sourceBreakdown = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.source] = (acc[lead.source] || 0) + 1;
    return acc;
  }, {});
  const replyRate = sent ? replies.length / sent : 0;
  const hotRate = sent ? hotReplies / sent : 0;

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
    queueByStatus: queue.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}),
    repliesByClass: replies.reduce<Record<string, number>>((acc, reply) => {
      acc[reply.classification] = (acc[reply.classification] || 0) + 1;
      return acc;
    }, {}),
  });
}
