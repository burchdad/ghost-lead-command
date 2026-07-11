import { NextResponse } from "next/server";
import { getBookingReadiness } from "@/lib/automation";
import { getGhostCrmHealth } from "@/lib/ghostcrm";
import { getOperatorCaps } from "@/lib/operator-policy";
import { getOutreachStatus, getTwilioReadiness } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { getSourcingStatus } from "@/lib/sourcing";
import { getDefaultWorkspace } from "@/lib/workspace";

type AgentStatus = "running" | "ready" | "needs-work" | "blocked";

function ageLabel(date: Date | null | undefined) {
  if (!date) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function summarizeEvent(event: { title: string; detail: string; status: string; createdAt: Date } | null) {
  return event
    ? {
        title: event.title,
        detail: event.detail,
        status: event.status,
        at: event.createdAt.toISOString(),
        age: ageLabel(event.createdAt),
      }
    : null;
}

function agentCard(input: {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  health: string;
  detail: string;
  lastEvent?: { title: string; detail: string; status: string; createdAt: Date } | null;
  nextRun?: string;
  actionLabel?: string;
  actionView?: string;
  metrics: Record<string, string | number>;
  blockers?: string[];
}) {
  return {
    ...input,
    lastEvent: summarizeEvent(input.lastEvent || null),
    blockers: input.blockers || [],
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const [events, leads, queue, replies, suppressions, bookingTasks, campaigns, ghostcrm] = await Promise.all([
      prisma.automationEvent.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        take: 75,
      }),
      prisma.lead.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.outreachQueueItem.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.reply.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.suppressionRecord.count({ where: { workspaceId: workspace.id } }),
      prisma.bookingTask.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.sourcingCampaign.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
      getGhostCrmHealth(),
    ]);

    const sourceStatus = getSourcingStatus();
    const outreach = getOutreachStatus();
    const caps = getOperatorCaps();
    const twilio = getTwilioReadiness();
    const booking = getBookingReadiness();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayLeads = leads.filter((lead) => lead.createdAt >= todayStart).length;
    const pending = queue.filter((item) => item.status === "pending").length;
    const queuedOrSent = queue.filter((item) => ["queued", "sent"].includes(item.status)).length;
    const failed = queue.filter((item) => item.status === "failed").length;
    const hotReplies = replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length;
    const bookedTasks = bookingTasks.filter((task) => task.status !== "blocked").length;
    const recentAgentEvent = events.find((event) => event.type === "agent");
    const recentDirectorEvent = events.find((event) => /lead gen director/i.test(event.title));
    const recentSourceEvent = events.find((event) => ["agent", "source", "sendgrid"].includes(event.type));
    const recentReplyEvent = events.find((event) => ["reply", "sendgrid", "twilio"].includes(event.type));
    const recentBookingEvent = events.find((event) => event.type === "booking" || /book/i.test(event.title));
    const recentCrmEvent = events.find((event) => event.type === "crm" || /crm/i.test(event.title));
    const recentSafetyEvent = events.find((event) => ["sendgrid", "suppression", "twilio"].includes(event.type));

    const sourceConfigured = sourceStatus.pdlConfigured || sourceStatus.googleMapsConfigured || sourceStatus.ghostLeadAgentConfigured;
    const linkedinConfigured = Boolean(
      process.env.LINKEDIN_ACCESS_TOKEN || (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    );
    const linkedinLeads = leads.filter((lead) => /linkedin|sales navigator/i.test(lead.source));
    const canSend = outreach.mode === "live" && outreach.sendgridConfigured;
    const canBook = booking.calendarConfigured && booking.ownerEmail && (booking.meetingLink || booking.zoomConfigured);

    const agents = [
      agentCard({
        id: "sourcing",
        name: "Sourcing Agent",
        role: "Find fresh buyer-fit accounts from PDL, Google Maps, and intake feeds.",
        status: sourceConfigured ? "ready" : "blocked",
        health: sourceConfigured ? "Sources online" : "No source configured",
        detail: sourceConfigured
          ? "Use Google Maps for business discovery, PDL for named contacts, and intake for ghostai.solutions/social signals."
          : "Configure PDL, SerpAPI, or Ghost Lead Agent before running daily sourcing.",
        lastEvent: recentSourceEvent,
        nextRun: "Weekdays 8:15 AM CT via Vercel Cron",
        actionLabel: "Run source operator",
        actionView: "source",
        metrics: {
          "today found": todayLeads,
          "active campaigns": campaigns.filter((campaign) => campaign.status === "active").length,
          "source cap": caps.dailySourceLimit,
        },
        blockers: sourceConfigured ? [] : ["Missing PDL_API_KEY, SERPAPI_API_KEY, or GHOST_LEAD_AGENT_SEARCH_URL"],
      }),
      agentCard({
        id: "linkedin",
        name: "LinkedIn Sales Nav Agent",
        role: "Convert Sales Navigator saved searches into enriched, scored, approval-ready GhostCRM leads.",
        status: linkedinConfigured || sourceStatus.pdlConfigured ? "ready" : "needs-work",
        health: linkedinConfigured ? "LinkedIn connected" : sourceStatus.pdlConfigured ? "Manual Sales Nav lane ready" : "Needs enrichment source",
        detail:
          "Paste Sales Navigator rows or CSV into the Source lane. Lead Command enriches contact paths, scores buying context, imports contactable leads, and queues first touches.",
        lastEvent: events.find((event) => /sales navigator|linkedin/i.test(`${event.title} ${event.detail}`)),
        actionLabel: "Open Sales Nav lane",
        actionView: "source",
        metrics: {
          "sales nav leads": linkedinLeads.length,
          "pdl enrich": sourceStatus.pdlConfigured ? "on" : "off",
          "min score": "76+",
        },
        blockers: sourceStatus.pdlConfigured ? [] : ["Sales Nav paste works now, but PDL_API_KEY is needed to enrich missing emails/phones."],
      }),
      agentCard({
        id: "qa",
        name: "Lead QA Agent",
        role: "Score buyer fit, contactability, intent signals, duplicates, and suppressions.",
        status: leads.length ? "ready" : sourceConfigured ? "needs-work" : "blocked",
        health: leads.length ? "Scoring live leads" : "Waiting on lead supply",
        detail: "Only leads with contact path plus buyer/intent evidence should graduate into outreach.",
        lastEvent: recentAgentEvent,
        actionLabel: "Review pipeline",
        actionView: "pipeline",
        metrics: {
          "hot leads": leads.filter((lead) => lead.score >= 82).length,
          suppressions,
          "failed sends": failed,
        },
      }),
      agentCard({
        id: "outreach",
        name: "Outreach Agent",
        role: "Generate signal-based first touches and send or queue approval-ready outreach.",
        status: canSend ? "ready" : outreach.sendgridConfigured ? "needs-work" : "blocked",
        health: canSend ? "Live sending enabled" : outreach.sendgridConfigured ? "Approval mode / dry-run" : "SendGrid missing",
        detail: canSend
          ? "The operator can attempt live sends inside guardrails."
          : "Use approval mode until lead quality is proven, then enable live auto-send.",
        lastEvent: recentAgentEvent,
        actionLabel: "Open queue",
        actionView: "queue",
        metrics: {
          pending,
          "sent/queued": queuedOrSent,
          "daily queue cap": caps.dailyQueueLimit,
        },
        blockers: outreach.sendgridConfigured ? [] : ["Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL"],
      }),
      agentCard({
        id: "reply",
        name: "Reply Agent",
        role: "Classify inbound replies, move stages, alert Slack, and start booking work.",
        status: outreach.sendgridConfigured ? "ready" : "needs-work",
        health: "Inbound routes available",
        detail: "SendGrid inbound, Twilio SMS, and manual capture all feed the reply classifier.",
        lastEvent: recentReplyEvent,
        actionLabel: "Open inbox",
        actionView: "inbox",
        metrics: {
          replies: replies.length,
          "hot/booked": hotReplies,
          "reply rate": `${Math.round((replies.length / Math.max(1, queuedOrSent)) * 100)}%`,
        },
      }),
      agentCard({
        id: "booking",
        name: "Booking Agent",
        role: "Turn hot replies into calendar-ready calls, prep notes, links, and reminders.",
        status: canBook ? "ready" : "needs-work",
        health: canBook ? "Calendar-ready" : "Calendar or meeting link incomplete",
        detail: canBook
          ? "Booked replies can create call tasks with owner, duration, and meeting link context."
          : "Add a meeting URL or Zoom config so booked replies are not blocked.",
        lastEvent: recentBookingEvent,
        actionLabel: "Open proposal/call prep",
        actionView: "proposal",
        metrics: {
          "booking tasks": bookingTasks.length,
          ready: bookedTasks,
          blocked: bookingTasks.filter((task) => task.status === "blocked").length,
        },
        blockers: canBook ? [] : ["Missing DEFAULT_MEETING_URL or Zoom config/calendar owner"],
      }),
      agentCard({
        id: "revenue",
        name: "Revenue Agent",
        role: "Track proposals, CRM sync, won revenue, source attribution, and next-money actions.",
        status: ghostcrm.configured && ghostcrm.reachable ? "ready" : ghostcrm.configured ? "needs-work" : "blocked",
        health: ghostcrm.detail,
        detail: "GhostCRM should remain the operational source of truth while RelateOS receives relationship intelligence.",
        lastEvent: recentCrmEvent,
        actionLabel: "Open analytics",
        actionView: "analytics",
        metrics: {
          "pipeline leads": leads.length,
          proposals: leads.filter((lead) => lead.stage === "Proposal Sent").length,
          won: leads.filter((lead) => lead.stage === "Won").length,
        },
        blockers: ghostcrm.configured && ghostcrm.reachable ? [] : ["GhostCRM sync endpoint or API key needs attention"],
      }),
      agentCard({
        id: "safety",
        name: "Deliverability Agent",
        role: "Watch bounces, drops, spam reports, A2P, suppression, and send caps.",
        status: process.env.SENDGRID_EVENT_SECRET ? "ready" : "needs-work",
        health: process.env.SENDGRID_EVENT_SECRET ? "SendGrid event route secured" : "Event secret missing",
        detail: "This lane protects the sending domain by stopping retries to bad addresses and noisy contacts.",
        lastEvent: recentSafetyEvent,
        actionLabel: "Open readiness",
        actionView: "readiness",
        metrics: {
          suppressions,
          "failed sends": failed,
          "twilio a2p": twilio.a2pStatus,
        },
        blockers: process.env.SENDGRID_EVENT_SECRET ? [] : ["Add SENDGRID_EVENT_SECRET and SendGrid Event Webhook"],
      }),
    ];

    const ready = agents.filter((agent) => agent.status === "ready").length;
    const blocked = agents.filter((agent) => agent.status === "blocked").length;
    const directorBlockers = [
      ...(sourceConfigured ? [] : ["No sourcing provider is configured."]),
      ...(pending >= caps.maxPendingApprovals ? ["Approval queue is at capacity."] : []),
      ...(canSend ? [] : ["Live SendGrid sending is not fully enabled; approval mode is still usable."]),
      ...(canBook ? [] : ["Booking link or calendar automation is incomplete."]),
    ];

    return NextResponse.json({
      director: {
        name: "Lead Gen Director Agent",
        mandate: "Own the daily path from source selection to queued outreach, reply classification, booked calls, and source learning.",
        status: sourceConfigured && pending < caps.maxPendingApprovals ? "ready" : "needs-work",
        health:
          sourceConfigured && pending < caps.maxPendingApprovals
            ? "Ready to run specialist lanes"
            : "Needs source or queue capacity attention",
        nextMove:
          pending > 0
            ? "Approve pending outreach before adding more volume."
            : "Run a director sprint against Google Maps first, then broaden with PDL or Sales Nav enrichment.",
        lastEvent: summarizeEvent(recentDirectorEvent || recentAgentEvent || null),
        blockers: directorBlockers,
        metrics: {
          "pending approvals": pending,
          "hot replies": hotReplies,
          "booked calls": bookedTasks,
          "sources online": [sourceStatus.googleMapsConfigured, sourceStatus.pdlConfigured, sourceStatus.ghostLeadAgentConfigured].filter(Boolean).length,
        },
      },
      summary: {
        ready,
        total: agents.length,
        blocked,
        mode: outreach.mode,
        crmRoute: "GhostCRM primary, RelateOS intelligence sync next",
        recommendation: "Keep GhostCRM as the lead-to-cash source of truth; push qualified relationship context to RelateOS.",
      },
      agents,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Agent control room unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
