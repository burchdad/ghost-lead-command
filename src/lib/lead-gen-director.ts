import { createAutomationEvent } from "@/lib/automation";
import { getBookingReadiness } from "@/lib/automation";
import { runLeadCommandAgent } from "@/lib/agent";
import { getOutreachStatus } from "@/lib/outreach";
import { getOperatorCaps } from "@/lib/operator-policy";
import { getPrisma } from "@/lib/prisma";
import { getSourcingStatus, type SourceProvider } from "@/lib/sourcing";
import { getDefaultWorkspace } from "@/lib/workspace";

type DirectorRunInput = {
  mode?: "sprint" | "daily";
  autoSend?: boolean;
  location?: string;
  queueLimit?: number;
};

type SpecialistRun = {
  id: string;
  name: string;
  role: string;
  status: "done" | "blocked" | "skipped";
  provider?: SourceProvider;
  found?: number;
  qualified?: number;
  queued?: number;
  message: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function splitCsv(value: string | null | undefined) {
  return clean(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasProvider(provider: SourceProvider) {
  const status = getSourcingStatus();
  if (provider === "google-maps") return status.googleMapsConfigured;
  if (provider === "ghost-lead-agent") return status.ghostLeadAgentConfigured;
  return status.pdlConfigured;
}

function sprintPlays(input: DirectorRunInput) {
  const defaultLocation = clean(input.location) || process.env.LEAD_DIRECTOR_LOCATION || "Texas";
  return [
    {
      id: "maps-hvac",
      name: "Google Maps HVAC Hunter",
      role: "Find contactable local operators with phone/website paths.",
      provider: "google-maps" as const,
      query: process.env.LEAD_DIRECTOR_MAPS_QUERY_1 || "HVAC companies with owners operators website phone",
      location: defaultLocation,
      industries: ["HVAC", "Home Services"],
      minScore: 82,
      size: 25,
      queueLimit: 5,
    },
    {
      id: "maps-roofing",
      name: "Google Maps Roofing Hunter",
      role: "Fill the approval queue with high-ticket local service businesses.",
      provider: "google-maps" as const,
      query: process.env.LEAD_DIRECTOR_MAPS_QUERY_2 || "roofing companies with owners operators website phone",
      location: defaultLocation,
      industries: ["Roofing", "Construction", "Home Services"],
      minScore: 82,
      size: 25,
      queueLimit: 5,
    },
    {
      id: "pdl-founder-services",
      name: "PDL Founder Services Hunter",
      role: "Find named economic buyers when PDL contact data is available.",
      provider: "pdl" as const,
      query: process.env.LEAD_DIRECTOR_PDL_QUERY || "founders owners presidents of B2B service companies that need qualified sales calls",
      location: clean(input.location) || process.env.LEAD_DIRECTOR_PDL_LOCATION || "United States",
      industries: splitCsv(process.env.LEAD_DIRECTOR_PDL_INDUSTRIES || "Marketing, Consulting, B2B Services, Staffing"),
      minScore: 84,
      size: 25,
      queueLimit: 4,
    },
  ];
}

async function queuePressure(workspaceId: string) {
  const prisma = getPrisma();
  const [pending, sentOrQueued, booked, hotReplies] = await Promise.all([
    prisma.outreachQueueItem.count({ where: { workspaceId, status: "pending" } }),
    prisma.outreachQueueItem.count({ where: { workspaceId, status: { in: ["queued", "sent"] } } }),
    prisma.lead.count({ where: { workspaceId, stage: "Call Booked" } }),
    prisma.reply.count({ where: { workspaceId, classification: { in: ["hot", "booked", "objection"] } } }),
  ]);
  return { pending, sentOrQueued, booked, hotReplies };
}

export async function runLeadGenDirector(input: DirectorRunInput = {}) {
  const workspace = await getDefaultWorkspace();
  const outreach = getOutreachStatus();
  const booking = getBookingReadiness();
  const caps = getOperatorCaps();
  const sourceStatus = getSourcingStatus();
  const before = await queuePressure(workspace.id);
  const autoSend = input.autoSend ?? (outreach.mode === "live" && process.env.LEAD_DIRECTOR_AUTO_SEND === "true");
  const requestedQueue = Math.min(15, Math.max(1, Number(input.queueLimit || process.env.LEAD_DIRECTOR_QUEUE_LIMIT || 10)));
  const perRunQueue = Math.max(2, Math.ceil(requestedQueue / 2));
  const specialists: SpecialistRun[] = [];

  await createAutomationEvent({
    title: "Lead Gen Director started",
    detail: `Director sprint started. Target queue ${requestedQueue}, auto-send ${autoSend ? "on" : "off"}.`,
    status: "running",
    type: "agent",
    payload: { input, sourceStatus, outreach, caps, before },
  });

  for (const play of sprintPlays(input)) {
    if (!hasProvider(play.provider)) {
      specialists.push({
        id: play.id,
        name: play.name,
        role: play.role,
        status: "skipped",
        provider: play.provider,
        message: `${play.provider} is not configured for this environment.`,
      });
      continue;
    }

    const result = await runLeadCommandAgent({
      provider: play.provider,
      query: play.query,
      location: play.location,
      industries: play.industries,
      titles: ["Owner", "Founder", "CEO", "President", "General Manager", "Operations Manager", "Managing Partner"],
      size: play.size,
      minScore: play.minScore,
      queueLimit: Math.min(play.queueLimit, perRunQueue),
      autoSend,
    });

    specialists.push({
      id: play.id,
      name: play.name,
      role: play.role,
      status: result.queued > 0 ? "done" : "blocked",
      provider: play.provider,
      found: result.found,
      qualified: result.qualified,
      queued: result.queued,
      message: result.message,
    });

    const totalQueued = specialists.reduce((sum, item) => sum + (item.queued || 0), 0);
    if (totalQueued >= requestedQueue) break;
  }

  const after = await queuePressure(workspace.id);
  const queued = specialists.reduce((sum, item) => sum + (item.queued || 0), 0);
  const found = specialists.reduce((sum, item) => sum + (item.found || 0), 0);
  const qualified = specialists.reduce((sum, item) => sum + (item.qualified || 0), 0);
  const blocked = specialists.filter((item) => item.status !== "done");
  const bookingReady = booking.calendarConfigured && booking.ownerEmail && (booking.meetingLink || booking.zoomConfigured);
  const nextMove =
    after.pending > 0
      ? "Approve the pending queue now. That is the fastest path from sourced leads to real conversations."
      : queued > 0
        ? "Watch SendGrid events and reply inbox for the first buying-intent responses."
        : sourceStatus.googleMapsConfigured
          ? "Run narrower Google Maps city and niche searches, then import and queue the contactable results."
          : "Configure or repair Google Maps/SerpAPI because contactable local business sourcing is the fastest current lane.";

  await createAutomationEvent({
    title: "Lead Gen Director finished",
    detail: `Director ran ${specialists.length} specialist lanes: found ${found}, qualified ${qualified}, queued ${queued}.`,
    status: queued > 0 || after.pending > before.pending ? "done" : "blocked",
    type: "agent",
    payload: { specialists, before, after, nextMove, bookingReady, blocked },
  });

  return {
    ok: true,
    mode: input.mode || "sprint",
    summary: {
      found,
      qualified,
      queued,
      pendingApprovals: after.pending,
      sentOrQueued: after.sentOrQueued,
      hotReplies: after.hotReplies,
      bookedCalls: after.booked,
      bookingReady,
      nextMove,
    },
    specialists,
    guardrails: {
      dailySourceLimit: caps.dailySourceLimit,
      dailyQueueLimit: caps.dailyQueueLimit,
      maxPendingApprovals: caps.maxPendingApprovals,
      outreachMode: outreach.mode,
      autoSend,
    },
  };
}
