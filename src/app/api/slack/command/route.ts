import { NextResponse } from "next/server";
import { sendAgentPlan, sendDailyDigest } from "@/lib/autopilot";
import { createAutomationEvent } from "@/lib/automation";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { isSlackCommandAuthorized } from "@/lib/slack";

function slackText(text: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    text,
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const form = new URLSearchParams(raw);

  if (!isSlackCommandAuthorized(form, request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const text = String(form.get("text") || "").trim();
  const normalized = text.toLowerCase();

  await createAutomationEvent({
    title: "Slack operator command received",
    detail: text || "No command text provided.",
    status: "done",
    type: "slack",
    payload: { text, userId: form.get("user_id"), channelId: form.get("channel_id") },
  });

  if (normalized.includes("nova") || normalized.includes("director")) {
    const result = await briefNovaCeoAgent({
      message: text || "Slack requested a Lead Gen Director briefing for Nova.",
    });
    return slackText(
      result.posted
        ? `Lead Gen Director brief posted for ${result.targetAgent}.`
        : `Director brief prepared, but Slack posting did not complete: ${result.postStatus}`,
    );
  }

  if (normalized.includes("digest") || normalized.includes("status") || normalized.includes("summary")) {
    await sendDailyDigest();
    return slackText("Digest posted to the Lead Command Slack channel.");
  }

  if (normalized.includes("help")) {
    return slackText(
      [
        "Lead Command commands:",
        "`recommend` - propose today's best niche.",
        "`run roofing in Texas score 85 limit 5` - propose a scoped sourcing plan.",
        "`digest` - post the current ops digest.",
        "`nova` - have the Lead Gen Director brief the Nova CEO AI Agent in Slack.",
        "`director status` - post the Director-to-Nova lead-gen briefing.",
        "Approve plans and outreach directly from the Slack buttons.",
      ].join("\n"),
    );
  }

  await sendAgentPlan({ text, source: "slack-command" });
  return slackText("Plan posted. Approve it in Slack to launch the PDL scan and outreach queue.");
}
