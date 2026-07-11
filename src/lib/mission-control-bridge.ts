import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

type NovaBriefInput = {
  message?: string;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function novaEndpoint() {
  return clean(process.env.NOVA_CEO_AGENT_URL) || clean(process.env.GHOST_MISSION_CONTROL_AGENT_URL);
}

function novaToken() {
  return clean(process.env.NOVA_CEO_AGENT_TOKEN) || clean(process.env.GHOST_MISSION_CONTROL_TOKEN);
}

export function getMissionControlBridgeStatus() {
  const endpoint = novaEndpoint();
  return {
    configured: Boolean(endpoint),
    targetAgent: process.env.NOVA_CEO_AGENT_NAME || "Nova CEO AI Agent",
    channel: endpoint ? "mission-control-webhook" : "internal-briefing",
    detail: endpoint
      ? "Lead Gen Director can brief Nova through the configured Mission Control endpoint."
      : "Add NOVA_CEO_AGENT_URL to post Director briefs into Ghost Mission Control automatically.",
  };
}

function formatLine(label: string, value: string | number | boolean) {
  return `${label}: ${value}`;
}

export async function briefNovaCeoAgent(input: NovaBriefInput = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [leadsToday, pending, sentOrQueued, replies, booked, recentEvents] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending" } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: { in: ["queued", "sent"] } } }),
    prisma.reply.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.lead.count({ where: { workspaceId: workspace.id, stage: "Call Booked" } }),
    prisma.automationEvent.findMany({
      where: { workspaceId: workspace.id, type: "agent" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);
  const bridge = getMissionControlBridgeStatus();
  const nextMove =
    pending > 0
      ? "Nova should push Stephen to approve pending outreach before adding more volume."
      : "Nova should ask the Lead Gen Director to run a Google Maps-first sprint, then review queue creation.";
  const brief = [
    "Lead Gen Director briefing for Nova CEO AI Agent",
    formatLine("Workspace", workspace.name),
    formatLine("Leads sourced in last 24h", leadsToday),
    formatLine("Pending approvals", pending),
    formatLine("Sent or queued touches", sentOrQueued),
    formatLine("Replies in last 24h", replies),
    formatLine("Booked calls", booked),
    formatLine("Next CEO-level move", nextMove),
    input.message ? formatLine("Operator note", input.message) : "",
    "Recent agent events:",
    ...recentEvents.map((event) => `- ${event.title}: ${event.detail}`),
  ]
    .filter(Boolean)
    .join("\n");

  let posted = false;
  let postStatus = "internal";
  const endpoint = novaEndpoint();
  if (endpoint) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = novaToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fromAgent: "Lead Gen Director Agent",
        toAgent: bridge.targetAgent,
        type: "lead-gen-director-briefing",
        message: brief,
        metrics: { leadsToday, pending, sentOrQueued, replies, booked },
        nextMove,
      }),
    }).catch(() => null);
    posted = Boolean(response?.ok);
    postStatus = response ? String(response.status) : "network_error";
  }

  await createAutomationEvent({
    title: posted ? "Lead Gen Director briefed Nova" : "Lead Gen Director prepared Nova briefing",
    detail: posted ? `Brief posted to ${bridge.targetAgent}.` : `Brief ready for ${bridge.targetAgent}; ${bridge.detail}`,
    status: posted || !endpoint ? "done" : "blocked",
    type: "agent",
    payload: {
      bridge,
      posted,
      postStatus,
      brief,
      metrics: { leadsToday, pending, sentOrQueued, replies, booked },
      nextMove,
    },
  });

  return {
    ok: posted || !endpoint,
    posted,
    postStatus,
    targetAgent: bridge.targetAgent,
    bridge,
    brief,
    metrics: { leadsToday, pending, sentOrQueued, replies, booked },
    nextMove,
  };
}
