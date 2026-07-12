import { createAutomationEvent } from "@/lib/automation";
import { runAdaptiveLearningLoop } from "@/lib/adaptive-learning";
import { computeConversionLearning } from "@/lib/conversion-learning";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { notifySlackVegaOpsBrief } from "@/lib/slack";
import {
  getClosingSprintBottleneck,
  getClosingSprintMetrics,
  getClosingSprintNextMoves,
} from "@/lib/vega-closing-sprint";
import { runVegaSpecialist } from "@/lib/vega-specialists";

type AgentOrder = {
  agent: string;
  status: "online" | "limited" | "blocked";
  report: string;
  order: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

export function isVegaOpsRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  return /\b(?:ops brief|ops loop|agent ops|sub[-\s]?agent report|autonomy loop|run ops|vega ops|command loop)\b/.test(normalized);
}

export function shouldExecuteOps(text: string) {
  const normalized = clean(text).toLowerCase();
  return /\b(?:run|execute|autonomy|autonomous|loop|operate|do it)\b/.test(normalized);
}

function statusFromBlocker(blocked: boolean, limited: boolean): AgentOrder["status"] {
  if (blocked) return "blocked";
  if (limited) return "limited";
  return "online";
}

export async function runVegaOpsBrief(input: { instruction?: string; execute?: boolean; briefNova?: boolean } = {}) {
  const [metrics, learning] = await Promise.all([
    getClosingSprintMetrics({ instruction: input.instruction }),
    computeConversionLearning(),
  ]);
  const bottleneck = getClosingSprintBottleneck(metrics);
  const nextMoves = getClosingSprintNextMoves(metrics, bottleneck);
  const socialCoverage = learning.summary.socialSignalCoverage;
  const replyRate = learning.summary.overallReplyRate;
  const hasPending = metrics.pendingApprovals > 0;
  const hasSendgridReady = metrics.sendgridReady > 0;

  const orders: AgentOrder[] = [
    {
      agent: "Vega Lead Director",
      status: "online",
      report: `Bottleneck is ${bottleneck}; booked ${metrics.bookedCalls}/${metrics.targetBooked}; won ${metrics.wonDeals}/${metrics.targetCloses}.`,
      order: nextMoves[0] || "Keep the lead-to-booking loop moving.",
    },
    {
      agent: "Adaptive Learning Agent",
      status: statusFromBlocker(!learning.summary.leads && !learning.summary.sentOrQueued, false),
      report: `GojiBerry closeness ${learning.summary.gojiBerryCloseness}; reply rate ${replyRate}%; recommended plays ${learning.summary.recommendedPlayIds.join(", ") || "none"}.`,
      order: "Tune source plays from actual outcomes and keep weak signals from scaling.",
    },
    {
      agent: "Social Intent Scout",
      status: statusFromBlocker(false, socialCoverage < 25),
      report: `Social signal coverage ${socialCoverage}%.`,
      order: socialCoverage < 25
        ? "Scout competitor, LinkedIn, event, and public audience signals before the next volume push."
        : "Keep social-intent records flowing into the queue and LinkedIn task lane.",
    },
    {
      agent: "Sourcing Agents",
      status: statusFromBlocker(false, metrics.leadsThisWeek < metrics.targetBooked * 5),
      report: `${metrics.leadsThisWeek} leads sourced this week.`,
      order: "Prioritize contactable leads in the active target market, then hand off to Copy Chief.",
    },
    {
      agent: "Copy Chief Agent",
      status: statusFromBlocker(!hasPending, false),
      report: `${metrics.pendingApprovals} pending approvals; ${metrics.sendgridReady} SendGrid-ready.`,
      order: hasSendgridReady ? "Rewrite the next reviewed batch and keep the approval queue clean." : "Stand by until source agents create email-ready records.",
    },
    {
      agent: "Cadence Agent",
      status: statusFromBlocker(false, metrics.openSequenceSteps === 0),
      report: `${metrics.openSequenceSteps} open follow-up steps.`,
      order: "Queue due follow-ups without flooding Stephen's approval lane.",
    },
    {
      agent: "Reply + Booking Agents",
      status: statusFromBlocker(false, metrics.hotRepliesThisWeek === 0 && metrics.bookingTasksReady === 0),
      report: `${metrics.hotRepliesThisWeek} hot replies this week; ${metrics.bookingTasksReady} booking-ready; ${metrics.bookingTasksBlocked} blocked.`,
      order: metrics.bookingTasksReady || metrics.hotRepliesThisWeek
        ? "Work replies first, then push booking handoffs."
        : "Monitor replies after every approved send batch.",
    },
    {
      agent: "Deliverability Agent",
      status: statusFromBlocker(false, metrics.failedSends > 0),
      report: `${metrics.failedSends} failed sends.`,
      order: metrics.failedSends ? "Suppress risky contacts before scaling volume." : "Keep bounce monitoring active.",
    },
  ];

  const executed = [];
  if (input.execute) {
    const learningResult = await runAdaptiveLearningLoop({ activate: true, limit: 3 });
    executed.push({ name: "Adaptive Learning Agent", status: "done", detail: learningResult.message });

    if (socialCoverage < 25 || bottleneck === "fresh-sourcing" || bottleneck === "outbound-volume") {
      const social = await runVegaSpecialist("social-intent", { limit: 10 });
      executed.push({ name: social.title, status: social.status, detail: social.summary });
    }
    if (["approvals", "outbound-volume"].includes(bottleneck) && hasPending) {
      const copy = await runVegaSpecialist("copy-chief", { limit: 10 });
      executed.push({ name: copy.title, status: copy.status, detail: copy.summary });
    }
    if (["follow-up-cadence", "approvals", "outbound-volume"].includes(bottleneck)) {
      const cadence = await runVegaSpecialist("cadence", { limit: 8 });
      executed.push({ name: cadence.title, status: cadence.status, detail: cadence.summary });
    }
    if (bottleneck === "booking-handoff" || metrics.hotRepliesThisWeek || metrics.bookingTasksReady) {
      const booking = await runVegaSpecialist("booking", { limit: 10 });
      executed.push({ name: booking.title, status: booking.status, detail: booking.summary });
    }
    if (metrics.failedSends > 0) {
      const deliverability = await runVegaSpecialist("deliverability", { limit: 50 });
      executed.push({ name: deliverability.title, status: deliverability.status, detail: deliverability.summary });
    }
  }

  const summary = input.execute
    ? `Vega ops loop executed ${executed.length} safe sub-agent lanes. Bottleneck: ${bottleneck}.`
    : `Vega ops brief prepared. Bottleneck: ${bottleneck}.`;
  const stephenAsk = hasSendgridReady
    ? `Approve the next ${Math.min(10, Math.max(1, metrics.sendgridReady))} SendGrid-ready items.`
    : metrics.manualTasks
      ? "Work the first manual contact-path task so Vega can turn it into outreach."
      : "Let Vega run learning/social intent, then approve the next reviewed batch.";
  const novaDirective =
    bottleneck === "booking-handoff"
      ? "Nova should make booking conversion the executive priority until hot replies move to calendar."
      : bottleneck === "approvals"
        ? "Nova should hold Stephen accountable to approve reviewed outreach before adding more top-of-funnel volume."
        : "Nova should keep Vega focused on the current bottleneck and ask for measurable movement by the next ops check.";

  const slack = await notifySlackVegaOpsBrief({
    summary,
    bottleneck,
    nextMove: nextMoves[0] || "Keep the lead-command loop moving.",
    metrics,
    closeness: learning.summary.gojiBerryCloseness,
    orders,
    executed,
    stephenAsk,
    novaDirective,
  });

  const nova = input.briefNova
    ? await briefNovaCeoAgent({ message: `Vega ops brief: ${summary} Next: ${nextMoves[0] || "continue ops loop"}` })
    : null;

  await createAutomationEvent({
    title: input.execute ? "Vega ops loop ran sub-agent command brief" : "Vega ops brief prepared",
    detail: `${summary} Stephen ask: ${stephenAsk}`,
    status: slack.sent || !slack.configured ? "done" : "blocked",
    type: "agent",
    payload: { instruction: input.instruction, execute: input.execute, metrics, learning: learning.summary, orders, executed, slack, nova },
  });

  return {
    ok: slack.sent || !slack.configured,
    posted: slack.sent,
    summary,
    bottleneck,
    nextMove: nextMoves[0] || "Keep the lead-command loop moving.",
    metrics,
    closeness: learning.summary.gojiBerryCloseness,
    orders,
    executed,
    stephenAsk,
    novaDirective,
    slack,
    nova,
  };
}
