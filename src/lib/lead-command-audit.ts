import { getBookingReadiness } from "@/lib/automation";
import { getGhostCrmHealth } from "@/lib/ghostcrm";
import { getMissionControlBridgeStatus } from "@/lib/mission-control-bridge";
import { getOperatorCaps } from "@/lib/operator-policy";
import { getOutreachStatus, getTwilioReadiness } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { getSourcingStatus } from "@/lib/sourcing";
import { notifySlackLeadCommandAudit } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

type AgentAuditStatus = "online" | "limited" | "blocked";

type AgentAudit = {
  name: string;
  status: AgentAuditStatus;
  detail: string;
  owner: "Vega" | "Nova" | "Stephen" | "System";
};

function status(ok: boolean, limited = false): AgentAuditStatus {
  if (ok) return limited ? "limited" : "online";
  return "blocked";
}

export async function runLeadCommandAudit(input: { postToSlack?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [leads, queue, replies, events, suppressions, ghostcrm] = await Promise.all([
    prisma.lead.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 1000,
      include: { lead: { include: { contact: true } } },
    }),
    prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    prisma.automationEvent.findMany({ where: { workspaceId: workspace.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.suppressionRecord.count({ where: { workspaceId: workspace.id } }),
    getGhostCrmHealth(),
  ]);

  const sourcing = getSourcingStatus();
  const outreach = getOutreachStatus();
  const booking = getBookingReadiness();
  const twilio = getTwilioReadiness();
  const missionControl = getMissionControlBridgeStatus();
  const caps = getOperatorCaps();
  const pending = queue.filter((item) => item.status === "pending").length;
  const emailReady = queue.filter((item) => item.status === "pending" && item.channel === "email" && item.lead?.contact?.email).length;
  const manualPending = queue.filter((item) => item.status === "pending" && item.channel === "manual").length;
  const sentOrQueued = queue.filter((item) => ["queued", "sent"].includes(item.status)).length;
  const sent = queue.filter((item) => item.status === "sent").length;
  const failed = queue.filter((item) => item.status === "failed").length;
  const booked = leads.filter((lead) => lead.stage === "Call Booked").length;
  const leadsToday = leads.filter((lead) => lead.createdAt >= since).length;
  const repliesToday = replies.filter((reply) => reply.createdAt >= since).length;
  const sourceOnline = sourcing.googleMapsConfigured || sourcing.pdlConfigured || sourcing.ghostLeadAgentConfigured;
  const bookingReady = Boolean(booking.calendarConfigured && booking.ownerEmail && (booking.meetingLink || booking.zoomConfigured));
  const reviewJam = pending >= Math.max(5, caps.executiveReviewLimit);
  const noReplies = sentOrQueued > 0 && replies.length === 0;

  const agents: AgentAudit[] = [
    {
      name: missionControl.sourceAgent || "Vega Lead Director AI",
      status: status(sourceOnline && outreach.sendgridConfigured, reviewJam || noReplies),
      detail: reviewJam ? `${pending} executive-review items need a human decision.` : "Can coordinate source, trust scoring, safe sends, call-first work, and escalation lanes.",
      owner: "Vega",
    },
    {
      name: "Web Helper Agent",
      status: status(sourcing.googleMapsConfigured || sourcing.ghostLeadAgentConfigured, !sourcing.ghostLeadAgentConfigured),
      detail: sourcing.ghostLeadAgentConfigured
        ? "Can use Ghost Lead Intelligence and web context."
        : "Google Maps/SerpAPI can discover websites; Ghost Lead Agent web helper endpoint is not connected.",
      owner: "Vega",
    },
    {
      name: "Source Agents",
      status: status(sourceOnline),
      detail: `Google Maps ${sourcing.googleMapsConfigured ? "online" : "off"}, PDL ${sourcing.pdlConfigured ? "online" : "off"}, Ghost Lead Agent ${sourcing.ghostLeadAgentConfigured ? "online" : "off"}.`,
      owner: "Vega",
    },
    {
      name: "Outreach Agent",
      status: status(outreach.sendgridConfigured, outreach.mode !== "live"),
      detail: outreach.sendgridConfigured ? `SendGrid configured; send mode ${outreach.mode}.` : "SendGrid is not configured.",
      owner: "Stephen",
    },
    {
      name: "Reply Agent",
      status: status(Boolean(process.env.SENDGRID_INBOUND_SECRET || process.env.CRON_SECRET), noReplies),
      detail: noReplies ? "No replies recorded yet; verify sends and inbox routes after approvals move." : "Inbound reply capture route is available.",
      owner: "System",
    },
    {
      name: "Booking Agent",
      status: status(bookingReady, booked === 0),
      detail: bookingReady ? "Calendar/meeting path is ready for hot replies." : "Calendar owner or meeting link is incomplete.",
      owner: "Stephen",
    },
    {
      name: "Deliverability Agent",
      status: status(Boolean(process.env.SENDGRID_EVENT_SECRET), failed > 0),
      detail: `Suppression count ${suppressionCount(suppressions)}; failed sends ${failed}; Twilio A2P ${twilio.a2pStatus}.`,
      owner: "System",
    },
    {
      name: "GhostCRM Revenue Agent",
      status: status(ghostcrm.configured && ghostcrm.reachable),
      detail: ghostcrm.detail,
      owner: "System",
    },
    {
      name: "Mission Control Bridge",
      status: status(missionControl.configured, !missionControl.cSuiteConfigured),
      detail: missionControl.detail,
      owner: "Nova",
    },
  ];

  const bottleneck = reviewJam
    ? `${pending} executive-review items are waiting on Stephen. Keep auto-send moving, but clear exception decisions before adding more high-impact accounts.`
    : !outreach.sendgridConfigured
      ? "SendGrid is not configured, so email outreach cannot leave the system."
      : outreach.mode !== "live"
        ? "Outreach is in dry-run mode, so emails are queued but not actually sent."
        : !sourceOnline
          ? "No source provider is online."
          : noReplies
            ? "Sends exist but replies are not coming back yet; improve targeting/copy and verify inbound handling."
            : "System is operational; continue controlled sourcing, trust scoring, and sender-governed outreach.";
  const nextMove = reviewJam
    ? `Stephen should decide the next ${Math.min(caps.executiveReviewLimit, pending)} executive-review items from Slack, while Vega continues safe sends and call-first work.`
    : sentOrQueued === 0
      ? "Vega should run a Google Maps-first director sprint and queue contactable leads."
      : "Vega should brief Nova daily, monitor replies, and escalate only executive exceptions or booking-ready responses.";
  const executiveSummary =
    reviewJam
      ? "Lead generation is moving, but the executive-review lane needs decisions on exception accounts."
      : "Lead Command is ready for supervised lead-gen operations with Vega coordinating and Nova receiving executive updates.";

  const audit = {
    ok: agents.every((agent) => agent.status !== "blocked") && !reviewJam,
    executiveSummary,
    bottleneck,
    nextMove,
    gojiBerryPosition:
      sourceOnline && outreach.sendgridConfigured && missionControl.configured
        ? "Approaching parity on sourcing plus supervised outreach; advantage is GhostCRM and c-suite agent coordination."
        : "Still behind on one or more operational lanes.",
    metrics: {
      leads: leads.length,
      leadsToday,
      pending,
      sentOrQueued,
      sent,
      replies: replies.length,
      repliesToday,
      booked,
      failed,
      suppressions,
    },
    agents,
    recentEvents: events.map((event) => ({
      title: event.title,
      detail: event.detail,
      status: event.status,
      at: event.createdAt.toISOString(),
    })),
  };

  const slack = input.postToSlack
    ? await notifySlackLeadCommandAudit({
        executiveSummary,
        bottleneck,
        nextMove,
        metrics: {
          leads: audit.metrics.leads,
          pending,
          emailReady,
          manualPending,
          sent: sentOrQueued,
          replies: replies.length,
          booked,
          failed,
        },
        agents,
      })
    : null;

  return { ...audit, slack };
}

function suppressionCount(value: number) {
  return Number.isFinite(value) ? value : 0;
}
