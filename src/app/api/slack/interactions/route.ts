import { NextResponse } from "next/server";
import {
  approveOutreachQueueItem,
  approvePendingOutreachBatch,
  redoOutreachQueueItem,
  rejectOutreachQueueItem,
  suppressOutreachQueueItem,
} from "@/lib/approval";
import { approveAgentPlan, type AgentPlan } from "@/lib/autopilot";
import { createAutomationEvent } from "@/lib/automation";
import {
  isSlackInteractionAuthorized,
  notifySlackBatchApprovalResult,
  notifySlackOutreachApproval,
  notifySlackVegaLeadRequestResult,
  type SlackInteractionPayload,
} from "@/lib/slack";
import { getPrisma } from "@/lib/prisma";

function parseActionValue(value?: string) {
  if (!value) return {} as { action?: string; limit?: number; itemId?: string; plan?: AgentPlan };
  try {
    return JSON.parse(value) as { action?: string; limit?: number; itemId?: string; plan?: AgentPlan };
  } catch {
    return {};
  }
}

function slackEphemeral(text: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    replace_original: false,
    text,
  });
}

async function recordOutreachSlackAction(input: {
  action: string;
  itemId?: string;
  ok: boolean;
  summary: string;
  payload: SlackInteractionPayload;
}) {
  await createAutomationEvent({
    title: `Slack outreach ${input.action}`,
    detail: input.summary,
    status: input.ok ? "done" : "needs_review",
    type: "slack",
    payload: {
      action: input.action,
      itemId: input.itemId,
      userId: input.payload.user?.id,
      channelId: input.payload.channel?.id,
    },
  });
}

async function handleOutreachAction(actionName: string, itemId: string | undefined, payload: SlackInteractionPayload) {
  if (!itemId) {
    return slackEphemeral("Vega could not find the queue item for that Slack button.");
  }

  if (actionName === "outreach_approve") {
    const result = await approveOutreachQueueItem(itemId);
    const delivery = result.ok ? result.body.delivery : null;
    const isManual = delivery?.channel === "manual";
    const summary = result.ok
      ? isManual
        ? "Approved manual contact task. No SendGrid email was sent."
        : `Approved outreach item. Delivery: ${delivery?.dryRun ? "dry-run queued" : delivery?.status || "sent"}.`
      : `Approval failed: ${result.body.error || "Unknown approval failure."}`;
    await recordOutreachSlackAction({ action: "approve", itemId, ok: result.ok, summary, payload });
    return slackEphemeral(result.ok ? `Vega approved it. ${summary}` : summary);
  }

  if (actionName === "outreach_call_task") {
    const prisma = getPrisma();
    const item = await prisma.outreachQueueItem.findUnique({
      where: { id: itemId },
      include: { lead: true },
    });
    if (!item) {
      return slackEphemeral("Vega could not find that queue item.");
    }
    if (item.status !== "pending") {
      return slackEphemeral(`Vega cannot create the call task because this item is already ${item.status}.`);
    }
    const updated = await prisma.outreachQueueItem.update({
      where: { id: item.id },
      data: {
        channel: "manual",
        provider: "phone-website",
        status: "queued",
        approvedAt: new Date(),
        reason: "Converted from Slack research card into a call/contact-form task. No SendGrid email was sent.",
      },
      include: { lead: true },
    });
    if (updated.lead) {
      await prisma.interaction.create({
        data: {
          leadId: updated.leadId,
          channel: "manual:phone-website",
          direction: "outbound",
          body: updated.body,
          classification: "queued",
        },
      });
    }
    const summary = `Vega created a call/contact-form task for ${updated.lead?.companyName || "that lead"}. No SendGrid email was sent.`;
    await recordOutreachSlackAction({ action: "call_task", itemId, ok: true, summary, payload });
    return slackEphemeral(summary);
  }

  if (actionName === "outreach_research") {
    const prisma = getPrisma();
    const item = await prisma.outreachQueueItem.findUnique({
      where: { id: itemId },
      include: { lead: true },
    });
    if (!item) {
      return slackEphemeral("Vega could not find that queue item.");
    }
    if (item.status !== "pending") {
      return slackEphemeral(`Vega cannot start research because this item is already ${item.status}.`);
    }

    const researchInstruction =
      "Research requested from Slack. Objective: identify owner/operator/office manager, verified email, phone confidence, and best contact path; then rebuild Opportunity Intelligence before any outreach draft.";
    const updated = await prisma.outreachQueueItem.update({
      where: { id: item.id },
      data: {
        channel: "research",
        provider: "contact-enrichment",
        reason: researchInstruction,
        subject: `Research contact path for ${item.lead?.companyName || "lead"}`,
        body: [
          `Research contact path for ${item.lead?.companyName || "this lead"}.`,
          "Find owner/operator/office manager or a verified business email.",
          "Verify phone and website/contact-form path.",
          "Recalculate contact confidence and opportunity trust before creating outreach.",
        ].join("\n"),
      },
      include: { lead: true },
    });
    if (updated.lead) {
      await prisma.lead.update({
        where: { id: updated.lead.id },
        data: {
          nextAction: "Vega research lane: identify verified decision-maker and contact path before drafting outreach.",
        },
      });
    }
    await createAutomationEvent({
      title: "Vega contact research requested",
      detail: `Research lane started for ${updated.lead?.companyName || "lead"}.`,
      status: "running",
      type: "agent",
      payload: {
        itemId: updated.id,
        leadId: updated.leadId,
        companyName: updated.lead?.companyName,
        requestedBy: payload.user?.id,
        channelId: payload.channel?.id,
      },
    });
    const summary = `Vega moved ${updated.lead?.companyName || "that lead"} into contact research. No email draft or SendGrid send will be created until contact confidence is rebuilt.`;
    await recordOutreachSlackAction({ action: "research", itemId, ok: true, summary, payload });
    return slackEphemeral(summary);
  }

  if (actionName === "outreach_redo") {
    const result = await redoOutreachQueueItem(itemId);
    if (result.ok) {
      await notifySlackOutreachApproval(result.body.item);
    }
    const summary = result.ok
      ? "Vega rewrote the draft and posted a fresh approval card."
      : `Redo failed: ${result.body.error || "Unknown rewrite failure."}`;
    await recordOutreachSlackAction({ action: "redo", itemId, ok: result.ok, summary, payload });
    return slackEphemeral(summary);
  }

  if (actionName === "outreach_discard") {
    const result = await rejectOutreachQueueItem(itemId, "Discarded from Slack approval.");
    const summary = result.ok ? "Vega rejected that item and removed it from the approval queue." : `Reject failed: ${result.body.error}`;
    await recordOutreachSlackAction({ action: "discard", itemId, ok: result.ok, summary, payload });
    return slackEphemeral(summary);
  }

  if (actionName === "outreach_suppress") {
    const result = await suppressOutreachQueueItem(itemId);
    const summary = result.ok
      ? `Vega suppressed that lead/company and rejected the queue item. Records added: ${result.body.suppressed}.`
      : `Suppress failed: ${result.body.error}`;
    await recordOutreachSlackAction({ action: "suppress", itemId, ok: result.ok, summary, payload });
    return slackEphemeral(summary);
  }

  return slackEphemeral("Vega received the Slack action, but this button is not mapped yet.");
}

async function handlePlanAction(actionName: string, plan: AgentPlan | undefined, payload: SlackInteractionPayload) {
  if (actionName === "plan_deny") {
    await createAutomationEvent({
      title: "Vega plan declined",
      detail: "Stephen asked Vega for a different Lead Command plan from Slack.",
      status: "needs_review",
      type: "slack",
      payload: { userId: payload.user?.id, channelId: payload.channel?.id, plan },
    });
    return slackEphemeral("Got it. Vega will wait for a different plan or a direct sourcing command.");
  }

  if (actionName !== "plan_approve" || !plan) {
    return slackEphemeral("Vega could not read the plan from that button.");
  }

  await createAutomationEvent({
    title: "Vega plan auto-send approved",
    detail: `${plan.niche} plan approved from Slack. Vega will source, clean copy, auto-send eligible emails, and report back.`,
    status: "running",
    type: "slack",
    payload: { userId: payload.user?.id, channelId: payload.channel?.id, plan },
  });

  const result = await approveAgentPlan(plan, { autoSend: true });
  const sent = result.autoSendSummary?.sentCompanies || [];
  const blocked = result.autoSendSummary?.blockedCompanies || [];
  const failed = result.autoSendSummary?.failedCompanies || [];
  const manual = result.autoSendSummary?.manualCompanies || [];
  const callAssists = result.autoSendSummary?.callAssistTasks || [];
  const contactedLine = sent.length ? `Contacted: ${sent.slice(0, 10).join(", ")}${sent.length > 10 ? ` +${sent.length - 10} more` : ""}` : "Contacted: none yet.";
  const callAssistLine = callAssists.length
    ? `Phone assists queued for Stephen/VA: ${callAssists
        .slice(0, 6)
        .map((task) => `${task.contactName} at ${task.companyName} - ${task.phone} (${task.dueLabel})`)
        .join("; ")}${callAssists.length > 6 ? ` +${callAssists.length - 6} more` : ""}`
    : "";
  const skippedLine = [
    blocked.length ? `Blocked by quality gate: ${blocked.slice(0, 6).join(", ")}` : "",
    failed.length ? `Failed send: ${failed.slice(0, 6).join(", ")}` : "",
    manual.length ? `Manual contact path: ${manual.slice(0, 6).join(", ")}` : "",
  ].filter(Boolean).join(" | ");

  await notifySlackVegaLeadRequestResult({
    instruction: `Approve plan: ${plan.niche}`,
    status: "finished",
    summary: `Approved plan ran end-to-end. ${result.message}`,
    plan: {
      niche: plan.niche,
      provider: plan.provider,
      location: plan.location,
      locations: plan.locations,
    },
    result: {
      found: result.found,
      rawFound: result.rawFound,
      qualified: result.qualified,
      queued: result.queued,
      reviewReady: result.reviewReady,
      message: [contactedLine, callAssistLine, skippedLine].filter(Boolean).join("\n"),
      guardrails: result.guardrails,
      diagnostics: result.diagnostics,
    },
  });

  await createAutomationEvent({
    title: "Vega plan auto-send finished",
    detail: `Sent ${result.autoSendSummary?.sent || 0}; blocked ${result.autoSendSummary?.blocked || 0}; failed ${result.autoSendSummary?.failed || 0}; manual ${result.autoSendSummary?.manualCompanies.length || 0}; phone assists ${callAssists.length}.`,
    status: result.autoSendSummary?.sent ? "done" : "needs_review",
    type: "slack",
    payload: { result, userId: payload.user?.id, channelId: payload.channel?.id },
  });

  return slackEphemeral(
    `Vega ran the plan end-to-end. Sent ${result.autoSendSummary?.sent || 0}, phone assists ${callAssists.length}, blocked ${result.autoSendSummary?.blocked || 0}, failed ${result.autoSendSummary?.failed || 0}.`,
  );
}

export async function POST(request: Request) {
  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const encodedPayload = form.get("payload");
  if (!encodedPayload) {
    return NextResponse.json({ error: "Missing Slack payload" }, { status: 400 });
  }

  const payload = JSON.parse(encodedPayload) as SlackInteractionPayload;
  if (!isSlackInteractionAuthorized(payload, request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = payload.actions[0];
  const value = parseActionValue(action?.value);
  const actionName = value.action || action?.action_id || "";
  if (actionName.startsWith("outreach_")) {
    return handleOutreachAction(actionName, value.itemId, payload);
  }

  if (actionName.startsWith("plan_")) {
    return handlePlanAction(actionName, value.plan, payload);
  }

  if (actionName !== "vega_batch_approve") {
    return slackEphemeral("Vega received the Slack action, but this button is not mapped yet.");
  }

  const result = await approvePendingOutreachBatch({ limit: value.limit });
  await notifySlackBatchApprovalResult(result);
  const blocked = "blocked" in result && result.blocked;
  await createAutomationEvent({
    title: "Vega Slack batch approval",
    detail: blocked
      ? `Vega paused Slack batch approval. ${"blockReason" in result ? result.blockReason : "Sender health or quality gate blocked the batch."}`
      : `Stephen approved ${result.approved} outreach items from Slack. Sent ${result.sent}; dry-run ${result.dryRunQueued}; failed ${result.failed}.`,
    status: blocked || result.failed ? "needs_review" : "done",
    type: "slack",
    payload: {
      requested: result.requested,
      attempted: result.attempted,
      approved: result.approved,
      failed: result.failed,
      sent: result.sent,
      dryRunQueued: result.dryRunQueued,
      emailReadyBefore: result.emailReadyBefore,
      manualPending: result.manualPending,
      otherPending: result.otherPending,
      userId: payload.user?.id,
      channelId: payload.channel?.id,
    },
  });

  return slackEphemeral(
    blocked
      ? `Vega paused batch approval: ${"blockReason" in result ? result.blockReason : "conversion quality gate blocked it."}`
      :
    result.attempted
      ? `Vega approved ${result.approved}/${result.attempted} outreach items. Failed: ${result.failed}. No browser detour needed.`
      : "Vega found no pending email outreach items ready for batch approval.",
  );
}
