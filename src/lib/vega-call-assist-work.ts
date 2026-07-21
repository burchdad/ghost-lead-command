import { createAutomationEvent } from "@/lib/automation";
import { getActionablePhoneTasks } from "@/lib/phone-assist";
import { notifySlackVegaLeadRequestResult } from "@/lib/slack";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

function extractLine(body: string, label: string) {
  const pattern = new RegExp(`${label}:\\s*([^\\n]+)`, "i");
  return body.match(pattern)?.[1]?.trim() || "";
}

function extractAttempts(body: string) {
  const attempts = Number(extractLine(body, "Attempts"));
  return Number.isFinite(attempts) ? attempts : 0;
}

function extractOpener(body: string) {
  const marker = body.match(/Suggested opener:\s*([\s\S]+?)(?:\n\nGoal:|\nGoal:|$)/i);
  return marker?.[1]?.trim() || "";
}

function dueLabel(date: Date | null) {
  if (!date) return "due now";
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (minutes <= -60) return `${Math.abs(Math.round(minutes / 60))}h overdue`;
  if (minutes < 0) return `${Math.abs(minutes)}m overdue`;
  if (minutes < 5) return "due now";
  if (minutes < 60) return `due in ${minutes}m`;
  return `due in ${Math.round(minutes / 60)}h`;
}

export function isCallAssistWorkRequest(text: string) {
  const normalized = clean(text).toLowerCase();
  return /\b(?:work calls?|call assists?|phone[-\s]?assists?|call lane|work phones?|phone follow[-\s]?ups?|va calls?|calls due|call list|phone list)\b/.test(normalized);
}

export async function runVegaCallAssistWork(input: { instruction?: string; limit?: number; postToSlack?: boolean } = {}) {
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const now = new Date();

  const phoneReport = await getActionablePhoneTasks({ workspaceId: workspace.id, now, limit: 500 });
  const phoneTasks = phoneReport.active;
  const dueTasks = phoneReport.actionable;
  const upcomingTasks = phoneReport.scheduledLater;
  const selected = [...phoneReport.actionable, ...phoneReport.scheduledLater].slice(0, limit);
  const overdue = phoneReport.overdue.length;
  const totalAttempts = phoneTasks.reduce((sum, task) => sum + extractAttempts(task.body), 0);

  const worklist = selected.map((task, index) => {
    const lead = task.lead;
    const assignee = extractLine(task.body, "Assigned to") || "Stephen/VA";
    const campaign = extractLine(task.body, "Campaign") || "Unassigned campaign";
    const lastAttempt = extractLine(task.body, "Last attempt") || "none";
    const nextAttempt = extractLine(task.body, "Next attempt") || dueLabel(task.scheduledFor);
    const finalDisposition = extractLine(task.body, "Final disposition") || task.status.replace(/_/g, " ");
    const phone = extractLine(task.body, "Phone") || lead?.contact?.phone || "";
    const person = extractLine(task.body, "Person") || lead?.name || lead?.contact?.name || "Decision maker";
    const role = extractLine(task.body, "Role") || lead?.title || lead?.contact?.title || "";
    const opener = extractOpener(task.body);
    return {
      rank: index + 1,
      id: task.id,
      companyName: lead?.companyName || "Unknown company",
      person,
      role,
      phone,
      assignee,
      campaign,
      attempts: extractAttempts(task.body),
      due: dueLabel(task.scheduledFor),
      lastAttempt,
      nextAttempt,
      finalDisposition,
      signal: lead?.nextAction || task.reason || "Phone follow-up after email send.",
      opener,
    };
  });

  const summary = worklist.length
    ? `Vega found ${worklist.length} phone-assist calls to work now. ${dueTasks.length} actionable, ${overdue} overdue, ${upcomingTasks.length} scheduled later.`
    : "Vega found no pending phone-assist calls to work.";
  const nextMove = worklist.length
    ? "Stephen/VA should call the due list, record every outcome, then run Vega, watch replies."
    : "Send or approve a small clean batch, then Vega will create phone-assist tasks after successful emails.";
  const lines = worklist.map((task) =>
    [
      `${task.rank}. ${task.companyName} - ${task.person}${task.role ? ` (${task.role})` : ""}`,
      `Phone: ${task.phone || "missing"} | Assignee: ${task.assignee} | Campaign: ${task.campaign} | ${task.due} | Attempts: ${task.attempts}`,
      `Last: ${task.lastAttempt} | Next: ${task.nextAttempt} | Disposition: ${task.finalDisposition}`,
      `Signal: ${task.signal.slice(0, 220)}`,
      task.opener ? `Opener: ${task.opener.slice(0, 260)}` : "",
    ].filter(Boolean).join("\n"),
  );

  let slack = null;
  if (input.postToSlack !== false) {
    slack = await notifySlackVegaLeadRequestResult({
      instruction: input.instruction || "Vega, work calls",
      status: "finished",
      summary: [summary, nextMove, ...lines].join("\n\n"),
      result: {
        found: phoneTasks.length,
        qualified: dueTasks.length,
        queued: worklist.length,
        reviewReady: overdue,
        message: `Total attempts logged: ${totalAttempts}. Record outcomes from the Queue page after each call.`,
      },
    });
  }

  await createAutomationEvent({
    title: "Vega call assist worklist prepared",
    detail: `${summary} Next: ${nextMove}`,
    status: worklist.length ? "done" : "needs_review",
    type: "human-assist",
    payload: {
      instruction: input.instruction || null,
      limit,
      totalPending: phoneTasks.length,
      due: dueTasks.length,
      overdue,
      upcoming: upcomingTasks.length,
      missingDueTime: phoneReport.missingDueTime.length,
      callbackDue: phoneReport.callbackDue.length,
      selected: worklist.map((task) => ({ id: task.id, companyName: task.companyName, phone: task.phone, assignee: task.assignee, due: task.due })),
      accountability: worklist.map((task) => ({
        id: task.id,
        campaign: task.campaign,
        attempts: task.attempts,
        lastAttempt: task.lastAttempt,
        nextAttempt: task.nextAttempt,
        finalDisposition: task.finalDisposition,
      })),
      slack,
    },
  });

  return {
    ok: slack?.sent ?? true,
    summary,
    nextMove,
    metrics: {
      totalPending: phoneTasks.length,
      due: dueTasks.length,
      overdue,
      upcoming: upcomingTasks.length,
      missingDueTime: phoneReport.missingDueTime.length,
      callbackDue: phoneReport.callbackDue.length,
      selected: worklist.length,
      totalAttempts,
    },
    worklist,
    slack,
  };
}
