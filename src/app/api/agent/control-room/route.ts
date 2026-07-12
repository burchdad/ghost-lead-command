import { NextResponse } from "next/server";
import { getBookingReadiness } from "@/lib/automation";
import { getGhostCrmHealth } from "@/lib/ghostcrm";
import { getLinkedInProductStatus } from "@/lib/linkedin-products";
import { getMissionControlBridgeStatus } from "@/lib/mission-control-bridge";
import { getOperatorCaps } from "@/lib/operator-policy";
import { getOutreachStatus, getTwilioReadiness } from "@/lib/outreach";
import { getPerplexityStatus } from "@/lib/perplexity";
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
    const [events, leads, queue, replies, suppressions, bookingTasks, campaigns, sequenceSteps, ghostcrm] = await Promise.all([
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
      prisma.sequenceStep.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 500 }),
      getGhostCrmHealth(),
    ]);

    const sourceStatus = getSourcingStatus();
    const perplexity = getPerplexityStatus();
    const outreach = getOutreachStatus();
    const caps = getOperatorCaps();
    const twilio = getTwilioReadiness();
    const booking = getBookingReadiness();
    const missionControl = getMissionControlBridgeStatus();
    const linkedInProducts = getLinkedInProductStatus();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayLeads = leads.filter((lead) => lead.createdAt >= todayStart).length;
    const pending = queue.filter((item) => item.status === "pending").length;
    const queuedOrSent = queue.filter((item) => ["queued", "sent"].includes(item.status)).length;
    const failed = queue.filter((item) => item.status === "failed").length;
    const manualPending = queue.filter((item) => item.status === "pending" && item.channel === "manual").length;
    const pendingEmail = queue.filter((item) => item.status === "pending" && item.channel === "email").length;
    const dueSequence = sequenceSteps.filter((step) => ["draft", "active"].includes(step.status)).length;
    const hotReplies = replies.filter((reply) => ["hot", "booked", "objection"].includes(reply.classification)).length;
    const bookedTasks = bookingTasks.filter((task) => task.status !== "blocked").length;
    const recentAgentEvent = events.find((event) => event.type === "agent");
    const recentDirectorEvent = events.find((event) => /lead gen director/i.test(event.title));
    const recentSourceEvent = events.find((event) => ["agent", "source", "sendgrid"].includes(event.type));
    const recentReplyEvent = events.find((event) => ["reply", "sendgrid", "twilio"].includes(event.type));
    const recentRevenueWatchEvent = events.find((event) => /revenue watch|reply \+ booking watch|conversion watch/i.test(`${event.title} ${event.detail}`));
    const recentBookingEvent = events.find((event) => event.type === "booking" || /book/i.test(event.title));
    const recentCrmEvent = events.find((event) => event.type === "crm" || /crm/i.test(event.title));
    const recentSafetyEvent = events.find((event) => ["sendgrid", "suppression", "twilio"].includes(event.type));
    const recentCopyEvent = events.find((event) => /copy chief/i.test(event.title));
    const recentCadenceEvent = events.find((event) => /cadence|follow-up|sequence/i.test(event.title));
    const recentContactPathEvent = events.find((event) => /contact path|manual/i.test(`${event.title} ${event.detail}`));
    const recentClosingSprintEvent = events.find((event) => /closing sprint/i.test(event.title));
    const recentStandupEvent = events.find((event) => /morning standup/i.test(event.title));
    const recentOpsEvent = events.find((event) => /vega ops|ops loop|sub-agent command/i.test(`${event.title} ${event.detail}`));
    const recentIntentEvent = events.find((event) => /intent signal feed|intent-ranked|perplexity|web intel/i.test(`${event.title} ${event.detail}`));
    const recentLearningEvent = events.find((event) => /learning loop|self-tuning|tuned source/i.test(`${event.title} ${event.detail}`));
    const recentSocialIntentEvent = events.find((event) => /social intent|competitor|social\/competitor/i.test(`${event.title} ${event.detail}`));
    const recentLinkedInTaskEvent = events.find((event) => /linkedin task|sales navigator task|sales nav/i.test(`${event.title} ${event.detail}`));

    const sourceConfigured = sourceStatus.pdlConfigured || sourceStatus.googleMapsConfigured || sourceStatus.ghostLeadAgentConfigured;
    const linkedinConfigured = Boolean(
      process.env.LINKEDIN_ACCESS_TOKEN || (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    );
    const linkedinLeads = leads.filter((lead) => /linkedin|sales navigator/i.test(lead.source));
    const linkedinTasks = queue.filter((item) => item.channel === "linkedin" && item.status === "pending").length;
    const warmSignalPattern = /linkedin|sales navigator|social|post|comment|hiring|growth|review|missed|quote|booking/i;
    const warmSignalLeads = leads.filter((lead) => warmSignalPattern.test(lead.nextAction)).length;
    const emailReadyWarm = leads.filter((lead) => lead.score >= 75 && warmSignalPattern.test(lead.nextAction)).length;
    const socialSignalLeads = leads.filter((lead) => /social|linkedin|competitor|event|community/i.test(`${lead.source} ${lead.nextAction}`)).length;
    const activeLearningCampaigns = campaigns.filter((campaign) =>
      campaign.status === "active" && /signal|growth|pipeline|linkedin|event|hvac|high-ticket/i.test(`${campaign.name} ${campaign.query}`),
    ).length;
    const canSend = outreach.mode === "live" && outreach.sendgridConfigured;
    const canBook = booking.calendarConfigured && booking.ownerEmail && (booking.meetingLink || booking.zoomConfigured);
    const weeklyCloseTarget = Math.max(1, Number(process.env.VEGA_WEEKLY_CLOSE_TARGET || 10));
    const bookedCalls = leads.filter((lead) => lead.stage === "Call Booked").length;
    const wonDeals = leads.filter((lead) => lead.stage === "Won").length;

    const agents = [
      agentCard({
        id: "morning-standup",
        name: "Nova x Vega Morning Standup",
        role: "Post the daily C-suite scoreboard, Nova directive, Vega execution orders, and Stephen's one required action.",
        status: missionControl.configured ? "ready" : "needs-work",
        health: missionControl.configured ? "C-suite standup route ready" : "Slack C-suite route needs configuration",
        detail:
          "Runs every weekday morning and turns the weekly close target into today's sourcing, approval, reply, and booking targets.",
        lastEvent: recentStandupEvent,
        nextRun: "Weekdays 8:30 AM CT via Vercel Cron",
        actionLabel: "Run standup",
        actionView: "agents",
        metrics: {
          "channel": missionControl.cSuiteChannel || "c-suite-talks",
          "pending approvals": pending,
          "booked calls": bookedCalls,
          "hot replies": hotReplies,
        },
      }),
      agentCard({
        id: "ops-loop",
        name: "Vega Ops Commander",
        role: "Collect sub-agent reports, choose the bottleneck, brief Nova/Stephen, and run safe autonomy lanes.",
        status: missionControl.configured ? "ready" : "needs-work",
        health: recentOpsEvent ? "Sub-agent command loop active" : "Ready for ops loop",
        detail:
          "Posts the chain-of-command brief into Slack: what every sub-agent reports to Vega, what Vega orders next, what Nova should reinforce, and what Stephen must unblock.",
        lastEvent: recentOpsEvent,
        nextRun: "Weekdays 12:00 PM CT via Vercel Cron",
        actionLabel: "Run ops loop",
        actionView: "agents",
        metrics: {
          bottleneck: pending ? "approvals" : hotReplies ? "booking" : "sourcing",
          "pending approvals": pending,
          "hot replies": hotReplies,
          "failed sends": failed,
        },
        blockers: missionControl.configured ? [] : ["Configure Slack C-suite or Mission Control bridge so Vega can brief Nova."],
      }),
      agentCard({
        id: "closing-sprint",
        name: "Vega Closing Sprint Commander",
        role: "Own the week-level target: source, approve, follow up, book calls, and escalate what blocks 10 closes.",
        status: wonDeals >= weeklyCloseTarget || bookedCalls >= weeklyCloseTarget ? "ready" : sourceConfigured ? "running" : "blocked",
        health:
          wonDeals >= weeklyCloseTarget
            ? "Close target met"
            : bookedCalls >= weeklyCloseTarget
              ? "Booked-call target met"
              : sourceConfigured
                ? "Sprint active"
                : "Needs source provider",
        detail:
          "Runs the director, Copy Chief, cadence, reply, booking, contact-path, and deliverability lanes around the weekly revenue target.",
        lastEvent: recentClosingSprintEvent,
        nextRun: "Weekdays 8:45 AM CT via Vercel Cron",
        actionLabel: "Run closing sprint",
        actionView: "agents",
        metrics: {
          "won deals": `${wonDeals}/${weeklyCloseTarget}`,
          "booked calls": bookedCalls,
          "pending approvals": pending,
          "hot replies": hotReplies,
        },
        blockers: sourceConfigured ? [] : ["No sourcing provider is configured for sprint volume."],
      }),
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
        id: "intent-feed",
        name: "Intent Signal Feed Agent",
        role: "Rank warm buyer signals across LinkedIn, public web, Google Maps, replies, and existing GhostCRM context.",
        status: leads.length ? "ready" : sourceConfigured ? "needs-work" : "blocked",
        health: perplexity.configured ? "Perplexity web intel enabled" : "Local signal ranking enabled",
        detail: perplexity.configured
          ? "Uses local lead signals plus Perplexity-backed public company context to tell Vega which accounts deserve attention next."
          : "Ranks current lead signals now; add PERPLEXITY_API_KEY to enrich with public web/company intelligence.",
        lastEvent: recentIntentEvent,
        actionLabel: "Refresh signals",
        actionView: "agents",
        metrics: {
          "warm signals": warmSignalLeads,
          "email-ready warm": emailReadyWarm,
          perplexity: perplexity.configured ? "on" : "off",
        },
        blockers: leads.length ? [] : ["No active leads are available for signal ranking yet."],
      }),
      agentCard({
        id: "learning-loop",
        name: "Adaptive Learning Agent",
        role: "Learn from sends, replies, bounces, sources, and signal buckets, then activate the next best source plays.",
        status: leads.length || queue.length ? "ready" : sourceConfigured ? "needs-work" : "blocked",
        health: activeLearningCampaigns ? "Recommended plays active" : "Ready to tune source plays",
        detail:
          "This is Vega's self-tuning layer: it studies what actually converts, updates recommended campaigns, and narrows the GojiBerry gap by outcome.",
        lastEvent: recentLearningEvent,
        actionLabel: "Run learning loop",
        actionView: "agents",
        metrics: {
          "active plays": activeLearningCampaigns,
          "reply rate": `${Math.round((replies.length / Math.max(1, queuedOrSent)) * 100)}%`,
          "failed sends": failed,
          "warm signals": warmSignalLeads,
        },
        blockers: leads.length || queue.length ? [] : ["Run at least one sourcing/send cycle so Vega has outcomes to learn from."],
      }),
      agentCard({
        id: "social-intent",
        name: "Social Intent Scout",
        role: "Find competitor, LinkedIn, event, and public-audience trigger signals before outreach gets written.",
        status: sourceStatus.pdlConfigured || linkedinConfigured || perplexity.configured ? "ready" : "needs-work",
        health: socialSignalLeads ? "Social signal records in GhostCRM" : "Ready to scout social intent",
        detail:
          "Runs GojiBerry-style signal plays using available public/company/contact sources, then imports and queues qualified accounts for review.",
        lastEvent: recentSocialIntentEvent,
        actionLabel: "Scout social intent",
        actionView: "agents",
        metrics: {
          "social leads": socialSignalLeads,
          "linkedin tasks": linkedinTasks,
          "perplexity": perplexity.configured ? "on" : "off",
          "pdl": sourceStatus.pdlConfigured ? "on" : "off",
        },
        blockers:
          sourceStatus.pdlConfigured || linkedinConfigured || perplexity.configured
            ? []
            : ["Add PDL, LinkedIn, or Perplexity access for stronger social/competitor signal scouting."],
      }),
      agentCard({
        id: "linkedin",
        name: "LinkedIn Sales Nav Agent",
        role: "Convert Sales Navigator saved searches and LinkedIn product access into enriched, scored, approval-ready GhostCRM leads.",
        status: linkedinConfigured || sourceStatus.pdlConfigured || linkedInProducts.ready.eventsManagement ? "ready" : "needs-work",
        health: linkedInProducts.ready.eventsManagement
          ? "Events Management provisioned"
          : linkedinConfigured
            ? "LinkedIn connected"
            : sourceStatus.pdlConfigured
              ? "Manual Sales Nav lane ready"
              : "Needs enrichment source",
        detail:
          "Paste Sales Navigator rows or CSV into the Source lane. Events Management can now supply event context; Lead Sync stays gated until LinkedIn approves it.",
        lastEvent: events.find((event) => /sales navigator|linkedin/i.test(`${event.title} ${event.detail}`)),
        actionLabel: "Open Sales Nav lane",
        actionView: "source",
        metrics: {
          "sales nav leads": linkedinLeads.length,
          "pdl enrich": sourceStatus.pdlConfigured ? "on" : "off",
          "events api": linkedInProducts.ready.eventsManagement ? "ready" : "pending",
          "lead sync": linkedInProducts.products.leadSync,
        },
        blockers: [
          ...(sourceStatus.pdlConfigured ? [] : ["Sales Nav paste works now, but PDL_API_KEY is needed to enrich missing emails/phones."]),
          ...(linkedInProducts.ready.leadSync ? [] : ["LinkedIn Lead Sync is not approved yet; keep using Sales Nav paste/screenshots and Events Management."]),
        ],
      }),
      agentCard({
        id: "linkedin-tasks",
        name: "LinkedIn Task Agent",
        role: "Turn Sales Navigator/social-fit accounts into manual connection, DM, and follow-up tasks.",
        status: linkedinConfigured || sourceStatus.pdlConfigured || linkedinLeads.length ? "ready" : "needs-work",
        health: linkedinTasks ? "LinkedIn tasks waiting" : "Ready for Sales Nav paste or intent-ranked leads",
        detail:
          "Creates compliant manual LinkedIn task cards from Sales Navigator paste data and warm social signals, then keeps replies flowing back into Vega.",
        lastEvent: recentLinkedInTaskEvent,
        actionLabel: "Queue LinkedIn",
        actionView: "queue",
        metrics: {
          "pending tasks": linkedinTasks,
          "sales nav leads": linkedinLeads.length,
          "manual lane": "on",
        },
        blockers: sourceStatus.pdlConfigured || linkedinLeads.length ? [] : ["Paste Sales Navigator rows or keep PDL enabled for enrichment."],
      }),
      agentCard({
        id: "web-helper",
        name: "Web Helper Agent",
        role: "Research company websites, Google/Maps context, and public contact paths for lead scoring and call prep.",
        status: sourceStatus.googleMapsConfigured || sourceStatus.ghostLeadAgentConfigured ? "ready" : "blocked",
        health: sourceStatus.ghostLeadAgentConfigured
          ? "Ghost web intelligence connected"
          : sourceStatus.googleMapsConfigured
            ? "Google Maps web context available"
            : "No web research lane configured",
        detail: sourceStatus.ghostLeadAgentConfigured
          ? "Can use Ghost Lead Agent plus source pages to enrich buyer context."
          : "Uses SerpAPI/Google Maps for business discovery and contact-path research until Ghost Lead Agent is connected.",
        lastEvent: events.find((event) => /web|google maps|ghost lead/i.test(`${event.title} ${event.detail}`)),
        actionLabel: "Open source",
        actionView: "source",
        metrics: {
          "maps": sourceStatus.googleMapsConfigured ? "on" : "off",
          "ghost web": sourceStatus.ghostLeadAgentConfigured ? "on" : "off",
          "serpapi": process.env.SERPAPI_API_KEY ? "on" : "off",
        },
        blockers:
          sourceStatus.googleMapsConfigured || sourceStatus.ghostLeadAgentConfigured
            ? []
            : ["Add SERPAPI_API_KEY or GHOST_LEAD_AGENT_SEARCH_URL for web research."],
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
        id: "copy-chief",
        name: "Copy Chief Agent",
        role: "Rewrite pending email drafts with the offer scorecard before Stephen approves sends.",
        status: pendingEmail ? "ready" : "needs-work",
        health: pendingEmail ? "Draft QA lane active" : "Waiting on pending email drafts",
        detail: "Applies signal-first, low-pressure copy rules so outreach stays specific, short, and reply-oriented.",
        lastEvent: recentCopyEvent,
        actionLabel: "Open queue",
        actionView: "queue",
        metrics: {
          "pending email": pendingEmail,
          "queue drafts": pending,
          "copy floor": "76+",
        },
      }),
      agentCard({
        id: "cadence",
        name: "Cadence Orchestrator",
        role: "Move approved leads from initial outreach into due follow-up steps without flooding the queue.",
        status: dueSequence ? "ready" : "needs-work",
        health: dueSequence ? "Follow-up steps drafted" : "No active sequence steps",
        detail: "Hourly cron checks due sequence steps and queues only eligible follow-ups for review.",
        lastEvent: recentCadenceEvent,
        nextRun: "Hourly via Vercel Cron",
        actionLabel: "Open queue",
        actionView: "queue",
        metrics: {
          "open steps": dueSequence,
          pending,
          "queue cap": caps.dailyQueueLimit,
        },
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
        id: "revenue-watch",
        name: "Reply + Booking Watch Agent",
        role: "Monitor SendGrid events, source performance, replies, bookings, and no-response risk after every send batch.",
        status: outreach.sendgridConfigured ? "ready" : "needs-work",
        health: hotReplies || bookedTasks ? "Conversion work available" : "Monitoring active",
        detail:
          "Escalates only the important stuff: hot replies, booking-ready leads, bounce spikes, no-response batches, and approval jams.",
        lastEvent: recentRevenueWatchEvent,
        nextRun: "Weekdays 11:00 AM and 3:00 PM CT via Vercel Cron",
        actionLabel: "Open inbox",
        actionView: "inbox",
        metrics: {
          "hot replies": hotReplies,
          "booking ready": bookedTasks,
          "failed sends": failed,
          "pending approvals": pending,
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
        id: "contact-path",
        name: "Contact Path Agent",
        role: "Work manual phone/website tasks and enrich contacts that are not email-ready yet.",
        status: manualPending ? "ready" : "needs-work",
        health: manualPending ? "Manual tasks waiting" : "No manual tasks waiting",
        detail: "Keeps Google Maps and website-only leads from dying in the queue when no public email is found.",
        lastEvent: recentContactPathEvent,
        actionLabel: "Open queue",
        actionView: "queue",
        metrics: {
          "manual tasks": manualPending,
          "pending email": pendingEmail,
          suppressions,
        },
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
          won: wonDeals,
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
      missionControl: {
        nova: missionControl,
        peers: [
          {
            name: missionControl.targetAgent,
            role: "CEO-level strategy, prioritization, and operator accountability partner.",
            status: missionControl.configured ? "connected" : "briefing-ready",
            detail: missionControl.detail,
          },
          {
            name: missionControl.sourceAgent,
            role: "Owns sourcing, qualification, outreach queueing, reply handoff, and booking readiness.",
            status: "active",
            detail: "Reports lead-gen bottlenecks, wins, and next moves to Nova.",
          },
        ],
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
