import { createAutomationEvent } from "@/lib/automation";
import {
  getClosingSprintBottleneck,
  getClosingSprintMetrics,
  getClosingSprintNextMoves,
} from "@/lib/vega-closing-sprint";
import { notifySlackMorningStandup } from "@/lib/slack";
import { getBookingDiagnosisReport, getWarmLeadPriorityReport } from "@/lib/warm-leads";

type MorningStandupInput = {
  message?: string;
  location?: string;
  targetCloses?: number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function businessDaysRemainingThisWeek() {
  const day = new Date().getDay();
  if (day === 0) return 5;
  if (day === 6) return 1;
  return Math.max(1, 6 - day);
}

function dailyTargets(input: {
  targetBooked: number;
  bookedCalls: number;
  targetCloses: number;
  wonDeals: number;
  sendgridReady: number;
}) {
  const daysLeft = businessDaysRemainingThisWeek();
  const bookedGap = Math.max(0, input.targetBooked - input.bookedCalls);
  const closeGap = Math.max(0, input.targetCloses - input.wonDeals);
  const bookedToday = Math.max(1, Math.ceil(bookedGap / daysLeft));
  const closeToday = Math.max(1, Math.ceil(closeGap / daysLeft));
  const sendTarget = Math.max(20, bookedToday * 15);
  const sourceTarget = Math.max(20, sendTarget + Math.max(0, 10 - input.sendgridReady));
  return {
    daysLeft,
    bookedGap,
    closeGap,
    bookedToday,
    closeToday,
    sendTarget,
    sourceTarget,
    approvalTarget: Math.min(15, Math.max(5, input.sendgridReady || 10)),
  };
}

function defaultLocation(message?: string, explicit?: string) {
  if (explicit) return explicit;
  const text = clean(message);
  const match = text.match(/\b(?:in|near|around|between)\s+(.+?)(?:\s+(?:today|this week|for|target|score)|[.!?]*$)/i);
  return clean(match?.[1]).replace(/[.!?]+$/, "") || process.env.LEAD_DIRECTOR_LOCATION || "Tyler to Dallas, Texas";
}

export async function runMorningStandup(input: MorningStandupInput = {}) {
  const location = defaultLocation(input.message, input.location);
  const [metrics, warmLeads, bookingDiagnosis] = await Promise.all([
    getClosingSprintMetrics({
      instruction: input.message || "Morning lead-gen standup",
      targetCloses: input.targetCloses,
      location,
    }),
    getWarmLeadPriorityReport({ limit: 5, createEvent: false }),
    getBookingDiagnosisReport({ createEvent: false }),
  ]);
  const bottleneck = getClosingSprintBottleneck(metrics);
  const nextMoves = getClosingSprintNextMoves(metrics, bottleneck);
  const targets = dailyTargets(metrics);
  const vegaOrders = [
    warmLeads.leads[0] ? `Vega, work ${warmLeads.leads[0].companyName}` : "",
    "Vega, refresh intent feed",
    `Vega, need ${targets.sourceTarget} new HVAC leads between ${location} score 75`,
    "Vega, queue LinkedIn tasks",
    "Vega, tune copy",
    metrics.sendgridReady >= 5
      ? `Vega, approve ${targets.approvalTarget}`
      : "Vega, run specialists",
    "Vega, work replies",
    "Vega, push bookings",
  ].filter(Boolean);
  const novaDirective =
    bottleneck === "booking-handoff"
      ? "Nova should pressure booking conversion first: every hot reply needs a calendar path or Stephen escalation."
      : bottleneck === "approvals"
        ? "Nova should hold Stephen accountable to approve the reviewed batch before Vega adds more volume."
        : bottleneck === "outbound-volume" || bottleneck === "fresh-sourcing"
          ? "Nova should authorize Vega to prioritize new contactable lead volume before strategy discussion."
          : "Nova should keep Vega focused on the single bottleneck and ask for proof of movement by midday.";
  const stephenAsk =
    metrics.sendgridReady > 0
      ? `Approve ${targets.approvalTarget} reviewed SendGrid-ready outreach items.`
      : "Review the standup bottleneck and unblock the first manual contact path or booking task.";

  const payload = {
    location,
    metrics,
    bottleneck,
    nextMoves,
    targets,
    warmLeads: warmLeads.leads,
    bookingDiagnosis,
    novaDirective,
    vegaOrders,
    stephenAsk,
  };
  const slack = await notifySlackMorningStandup(payload);

  await createAutomationEvent({
    title: "Nova and Vega morning standup",
    detail: `Morning standup posted. Bottleneck: ${bottleneck}. Stephen ask: ${stephenAsk}`,
    status: slack.sent ? "done" : "blocked",
    type: "agent",
    payload: { ...payload, slack },
  });

  return {
    ok: slack.sent,
    posted: slack.sent,
    slack,
    ...payload,
  };
}
