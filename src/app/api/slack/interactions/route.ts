import { NextResponse } from "next/server";
import { approvePendingOutreachBatch } from "@/lib/approval";
import { createAutomationEvent } from "@/lib/automation";
import { isSlackInteractionAuthorized, notifySlackBatchApprovalResult, type SlackInteractionPayload } from "@/lib/slack";

function parseActionValue(value?: string) {
  if (!value) return {} as { action?: string; limit?: number };
  try {
    return JSON.parse(value) as { action?: string; limit?: number };
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
  if (action?.action_id !== "vega_batch_approve" && value.action !== "vega_batch_approve") {
    return slackEphemeral("Vega received the Slack action, but this button is not mapped yet.");
  }

  const result = await approvePendingOutreachBatch({ limit: value.limit });
  await notifySlackBatchApprovalResult(result);
  await createAutomationEvent({
    title: "Vega Slack batch approval",
    detail: `Stephen approved ${result.approved} outreach items from Slack. Sent ${result.sent}; dry-run ${result.dryRunQueued}; failed ${result.failed}.`,
    status: result.failed ? "needs_review" : "done",
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
    result.attempted
      ? `Vega approved ${result.approved}/${result.attempted} outreach items. Failed: ${result.failed}. No browser detour needed.`
      : "Vega found no pending email outreach items ready for batch approval.",
  );
}
