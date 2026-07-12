import { approvePendingOutreachBatch } from "@/lib/approval";
import { createAutomationEvent } from "@/lib/automation";
import { runLeadGenDirector } from "@/lib/lead-gen-director";
import { getOperatorQueueCapacity } from "@/lib/operator-policy";
import { getPrisma } from "@/lib/prisma";
import { runVegaSpecialist, runVegaSpecialistTeam } from "@/lib/vega-specialists";
import { getDefaultWorkspace } from "@/lib/workspace";

type ClosingSprintInput = {
  instruction?: string;
  targetCloses?: number;
  targetBooked?: number;
  autoApprove?: boolean;
  queueLimit?: number;
  location?: string;
};

type ClosingSprintMetrics = {
  targetCloses: number;
  targetBooked: number;
  leadsThisWeek: number;
  sentThisWeek: number;
  repliesThisWeek: number;
  hotRepliesThisWeek: number;
  bookedCalls: number;
  wonDeals: number;
  pendingApprovals: number;
  sendgridReady: number;
  manualTasks: number;
  failedSends: number;
  openSequenceSteps: number;
  bookingTasksReady: number;
  bookingTasksBlocked: number;
  approvalCapacity: number;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function weekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function parseTarget(text: string, fallback: number) {
  const match =
    text.match(/\b(?:close|closes|closed|win|won|book|booked)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:closes|closed|wins|deals|booked|calls|appointments)\b/i);
  return match ? Math.max(1, Math.min(50, Number(match[1]))) : fallback;
}

function parseLocation(text: string) {
  const match =
    text.match(/\b(?:in|near|around|between)\s+(.+?)(?:\s+(?:score|target|close|book|approve|send|this week|today)|[.!?]*$)/i);
  return clean(match?.[1]).replace(/[.!?]+$/, "") || undefined;
}

export function isClosingSprintRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  if (!normalized) return false;
  return (
    /\b(?:closing sprint|close sprint|revenue sprint|sprint mode|war room|close this week|book this week)\b/.test(normalized) ||
    (/\b(?:close|book|win)\b/.test(normalized) && /\b(?:this week|week|minimum|target|deals|leads)\b/.test(normalized))
  );
}

export function parseClosingSprintInstruction(text: string): ClosingSprintInput {
  const normalized = clean(text).toLowerCase();
  const target = parseTarget(text, Number(process.env.VEGA_WEEKLY_CLOSE_TARGET || 10));
  return {
    instruction: text,
    targetCloses: target,
    targetBooked: Math.max(target, parseTarget(text, Number(process.env.VEGA_WEEKLY_BOOKED_TARGET || target))),
    autoApprove:
      /\b(?:approve|send|release)\b/.test(normalized) ||
      clean(process.env.VEGA_SPRINT_AUTO_APPROVE).toLowerCase() === "true",
    queueLimit: Number(process.env.VEGA_SPRINT_QUEUE_LIMIT || 10),
    location: parseLocation(text),
  };
}

export async function getClosingSprintMetrics(input: ClosingSprintInput = {}): Promise<ClosingSprintMetrics> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = weekStart();
  const capacity = await getOperatorQueueCapacity(workspace.id);
  const targetCloses = Math.max(1, Number(input.targetCloses || process.env.VEGA_WEEKLY_CLOSE_TARGET || 10));
  const targetBooked = Math.max(targetCloses, Number(input.targetBooked || process.env.VEGA_WEEKLY_BOOKED_TARGET || targetCloses));

  const [
    leadsThisWeek,
    sentThisWeek,
    repliesThisWeek,
    hotRepliesThisWeek,
    bookedCalls,
    wonDeals,
    pendingApprovals,
    sendgridReady,
    manualTasks,
    failedSends,
    openSequenceSteps,
    bookingTasksReady,
    bookingTasksBlocked,
  ] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: workspace.id, status: { in: ["sent", "queued"] }, approvedAt: { gte: since } },
    }),
    prisma.reply.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.reply.count({
      where: { workspaceId: workspace.id, createdAt: { gte: since }, classification: { in: ["hot", "booked", "objection"] } },
    }),
    prisma.lead.count({ where: { workspaceId: workspace.id, stage: "Call Booked" } }),
    prisma.lead.count({ where: { workspaceId: workspace.id, stage: "Won" } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending" } }),
    prisma.outreachQueueItem.count({
      where: {
        workspaceId: workspace.id,
        status: "pending",
        channel: "email",
        lead: { is: { contact: { is: { email: { not: null } } } } },
      },
    }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending", channel: "manual" } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "failed" } }),
    prisma.sequenceStep.count({ where: { workspaceId: workspace.id, status: { in: ["draft", "active"] } } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: { not: "blocked" } } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: "blocked" } }),
  ]);

  return {
    targetCloses,
    targetBooked,
    leadsThisWeek,
    sentThisWeek,
    repliesThisWeek,
    hotRepliesThisWeek,
    bookedCalls,
    wonDeals,
    pendingApprovals,
    sendgridReady,
    manualTasks,
    failedSends,
    openSequenceSteps,
    bookingTasksReady,
    bookingTasksBlocked,
    approvalCapacity: capacity.capacity,
  };
}

export function getClosingSprintBottleneck(metrics: ClosingSprintMetrics) {
  if (metrics.bookedCalls >= metrics.targetBooked || metrics.wonDeals >= metrics.targetCloses) {
    return "close-mode";
  }
  if (metrics.hotRepliesThisWeek > 0 || metrics.bookingTasksReady > 0 || metrics.bookingTasksBlocked > 0) {
    return "booking-handoff";
  }
  if (metrics.sendgridReady > 0) return "approvals";
  if (metrics.sentThisWeek < metrics.targetBooked * 15) return "outbound-volume";
  if (metrics.openSequenceSteps > 0) return "follow-up-cadence";
  if (metrics.manualTasks > 0) return "contact-path";
  return "fresh-sourcing";
}

export function getClosingSprintNextMoves(metrics: ClosingSprintMetrics, currentBottleneck: string) {
  if (currentBottleneck === "close-mode") {
    return ["Work booked calls, prep proposals, and push every warm opportunity toward a paid pilot."];
  }
  if (currentBottleneck === "booking-handoff") {
    return ["Work hot/booked replies first.", "Move booking-ready leads into call prep.", "Escalate blocked booking tasks to Stephen/Nova."];
  }
  if (currentBottleneck === "approvals") {
    return ["Tune copy, approve the next SendGrid-ready batch, then monitor SendGrid and replies within the hour."];
  }
  if (currentBottleneck === "outbound-volume") {
    return ["Source narrower local-service batches.", "Queue only contactable leads.", "Approve reviewed drafts daily until reply volume exists."];
  }
  if (currentBottleneck === "follow-up-cadence") {
    return ["Run cadence, approve due follow-ups, and keep reply sweeps active."];
  }
  if (currentBottleneck === "contact-path") {
    return ["Work manual phone/website paths or enrich emails before expecting automated outreach volume."];
  }
  return ["Run a focused source sprint, then Copy Chief, then approval batch."];
}

export async function runVegaClosingSprint(input: ClosingSprintInput = {}) {
  const normalized = clean(input.instruction).toLowerCase();
  const before = await getClosingSprintMetrics(input);
  const currentBottleneck = getClosingSprintBottleneck(before);
  const actions: { name: string; status: string; detail: string; metrics?: Record<string, unknown> }[] = [];
  const shouldApprove = Boolean(input.autoApprove);

  await createAutomationEvent({
    title: "Vega closing sprint started",
    detail: `Target ${before.targetCloses} closes / ${before.targetBooked} booked calls. Bottleneck: ${currentBottleneck}.`,
    status: "running",
    type: "agent",
    payload: { input, before, currentBottleneck },
  });

  if (["fresh-sourcing", "outbound-volume"].includes(currentBottleneck) || /\b(?:source|find|new leads)\b/.test(normalized)) {
    const director = await runLeadGenDirector({
      mode: "sprint",
      location: input.location,
      queueLimit: input.queueLimit || 10,
      autoSend: false,
    });
    actions.push({
      name: "Lead Gen Director",
      status: director.summary.queued ? "done" : "needs_review",
      detail: director.summary.nextMove,
      metrics: director.summary,
    });
  }

  if (before.sendgridReady > 0 || before.pendingApprovals > 0 || shouldApprove) {
    const copy = await runVegaSpecialist("copy-chief", { limit: Math.min(25, input.queueLimit || 10) });
    actions.push({ name: copy.title, status: copy.status, detail: copy.summary, metrics: copy.metrics });
  }

  const team = await runVegaSpecialistTeam({ limit: Math.min(25, input.queueLimit || 10) });
  actions.push({ name: team.title, status: team.status, detail: team.summary, metrics: team.metrics });

  if (shouldApprove) {
    const approval = await approvePendingOutreachBatch({ limit: input.queueLimit || 10 });
    actions.push({
      name: "Approval Batch",
      status: approval.approved ? "done" : "needs_review",
      detail: `Approved ${approval.approved}/${approval.attempted}. Sent ${approval.sent}. Failed ${approval.failed}.`,
      metrics: approval as unknown as Record<string, unknown>,
    });
  }

  const after = await getClosingSprintMetrics(input);
  const afterBottleneck = getClosingSprintBottleneck(after);
  const moves = getClosingSprintNextMoves(after, afterBottleneck);

  await createAutomationEvent({
    title: "Vega closing sprint finished",
    detail: `Bottleneck now: ${afterBottleneck}. Next: ${moves[0]}`,
    status: after.bookedCalls >= after.targetBooked || actions.some((action) => action.status === "done") ? "done" : "needs_review",
    type: "agent",
    payload: { before, after, actions, afterBottleneck, moves },
  });

  return {
    ok: true,
    mode: "closing-sprint" as const,
    bottleneck: afterBottleneck,
    summary:
      after.bookedCalls >= after.targetBooked
        ? `Booked-call target is met: ${after.bookedCalls}/${after.targetBooked}. Shift into proposal/close follow-up.`
        : `Closing sprint active. Booked ${after.bookedCalls}/${after.targetBooked}, won ${after.wonDeals}/${after.targetCloses}. Bottleneck: ${afterBottleneck}.`,
    before,
    after,
    actions,
    nextMoves: moves,
    autoApproved: shouldApprove,
  };
}
