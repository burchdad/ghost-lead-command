import { createAutomationEvent } from "@/lib/automation";
import { runIntentFeedScout } from "@/lib/intent-feed";
import { runLeadGenDirector } from "@/lib/lead-gen-director";
import { runVegaClosingSprint } from "@/lib/vega-closing-sprint";
import { runVegaRevenueWatch } from "@/lib/vega-revenue-watch";
import { runVegaSpecialistTeam } from "@/lib/vega-specialists";

function clean(value: unknown) {
  return String(value || "").trim();
}

function parseLocation(text: string) {
  const match = text.match(/\b(?:in|near|around|between)\s+(.+?)(?:\s+(?:score|target|close|book|approve|send|today|this week)|[.!?]*$)/i);
  return clean(match?.[1]).replace(/[.!?]+$/, "") || undefined;
}

function parseLimit(text: string, fallback: number) {
  const match =
    text.match(/\b(?:limit|queue|approve|send|source|need)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:leads|emails|approvals|touches|calls|bookings)\b/i);
  return match ? Math.max(1, Math.min(50, Number(match[1]))) : fallback;
}

export function isDominanceLoopRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  if (!normalized) return false;
  return /\b(?:dominance loop|dominate|push past gojiberry|beat gojiberry|full revenue loop|run the whole machine|run everything)\b/.test(normalized);
}

export async function runVegaDominanceLoop(input: { instruction?: string; autoApprove?: boolean } = {}) {
  const instruction = clean(input.instruction) || "Vega dominance loop";
  const queueLimit = parseLimit(instruction, Number(process.env.VEGA_DOMINANCE_QUEUE_LIMIT || 10));
  const location = parseLocation(instruction);
  const autoApprove = input.autoApprove ?? /\b(?:approve|send|release|auto)\b/i.test(instruction);

  await createAutomationEvent({
    title: "Vega dominance loop started",
    detail: `Dominance loop started. Queue target ${queueLimit}, auto-approve ${autoApprove ? "on" : "off"}.`,
    status: "running",
    type: "agent",
    payload: { instruction, queueLimit, location, autoApprove },
  });

  const [intent, director, team] = await Promise.all([
    runIntentFeedScout({ limit: 15, enrich: true }),
    runLeadGenDirector({ mode: "sprint", location, queueLimit, autoSend: autoApprove }),
    runVegaSpecialistTeam({ limit: queueLimit }),
  ]);

  const sprint = await runVegaClosingSprint({
    instruction,
    targetCloses: Number(process.env.VEGA_WEEKLY_CLOSE_TARGET || 10),
    targetBooked: Number(process.env.VEGA_WEEKLY_BOOKED_TARGET || 10),
    autoApprove,
    queueLimit,
    location,
  });
  const watch = await runVegaRevenueWatch({ instruction: "Vega dominance loop watch", execute: true });

  const topIntent = intent.items[0];
  const nextMoves = [
    sprint.nextMoves[0],
    director.summary.nextMove,
    team.nextMove,
    watch.nextMove,
    topIntent ? `Work top intent account: ${topIntent.companyName} (${topIntent.signalScore}) - ${topIntent.nextMove}` : "",
  ].filter(Boolean);

  const summary = [
    `Dominance loop ran. Sourced ${director.summary.found}, qualified ${director.summary.qualified}, queued ${director.summary.queued}.`,
    `Specialists: ${team.summary}`,
    `Closing bottleneck: ${sprint.bottleneck}`,
    `Watch: ${watch.summary}`,
    topIntent ? `Top intent: ${topIntent.companyName} (${topIntent.signalScore}) - ${topIntent.signalType}` : "Top intent: none yet.",
  ].join(" ");

  await createAutomationEvent({
    title: "Vega dominance loop finished",
    detail: summary.slice(0, 900),
    status: director.summary.queued || sprint.after.pendingApprovals || sprint.after.bookingTasksReady ? "done" : "needs_review",
    type: "agent",
    payload: { instruction, director, team, sprint, watch, intent: intent.items.slice(0, 10), nextMoves },
  });

  return {
    ok: true,
    instruction,
    summary,
    metrics: {
      found: director.summary.found,
      qualified: director.summary.qualified,
      queued: director.summary.queued,
      pendingApprovals: sprint.after.pendingApprovals,
      sendgridReady: sprint.after.sendgridReady,
      bookedCalls: sprint.after.bookedCalls,
      repliesThisWeek: sprint.after.repliesThisWeek,
      failedSends: sprint.after.failedSends,
      intentRanked: intent.items.length,
      gojiBerryCloseness: team.metrics.gojiBerryCloseness,
    },
    bottleneck: sprint.bottleneck,
    nextMoves,
  };
}

