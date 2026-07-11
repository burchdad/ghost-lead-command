import { after, NextResponse } from "next/server";
import { isLeadRequest, runVegaLeadRequest, sendAgentPlan, sendDailyDigest } from "@/lib/autopilot";
import { createAutomationEvent } from "@/lib/automation";
import { runLeadCommandAudit } from "@/lib/lead-command-audit";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { isSlackCommandAuthorized } from "@/lib/slack";

function slackText(text: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    text,
  });
}

async function postSlackCommandResponse(responseUrl: string | null, text: string) {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  }).catch(() => undefined);
}

function leadRunText(input: Awaited<ReturnType<typeof runVegaLeadRequest>>) {
  const diagnostics = input.result.diagnostics as
    | {
        marketsSearched?: string[];
        contactable?: number;
        missingContact?: number;
        suppressed?: Record<string, number>;
        policySkipped?: Record<string, number>;
      }
    | undefined;
  const marketsSearched = diagnostics?.marketsSearched || [];
  const markets = marketsSearched.length
    ? `Markets: ${marketsSearched.slice(0, 8).join(", ")}`
    : "";
  const sourceFilters = diagnostics?.suppressed
    ? Object.entries(diagnostics.suppressed)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([reason, count]) => `${reason} ${count}`)
        .join(", ")
    : "";
  const policySkips = diagnostics?.policySkipped
    ? Object.entries(diagnostics.policySkipped)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([reason, count]) => `${reason} ${count}`)
        .join(", ")
    : "";

  return [
    `Vega ran the lead request for ${input.plan.niche}.`,
    `Source: ${input.plan.provider}`,
    `Location: ${input.plan.location}${input.plan.locations?.length ? ` (${input.plan.locations.length} markets)` : ""}`,
    `Found ${input.result.rawFound ?? input.result.found}, qualified ${input.result.qualified}, queued ${input.result.queued}, review-ready ${input.result.reviewReady ?? 0}.`,
    diagnostics ? `Contactable: ${diagnostics.contactable}, missing contact: ${diagnostics.missingContact}` : "",
    markets,
    sourceFilters ? `Source filters: ${sourceFilters}` : "",
    policySkips ? `Policy skips: ${policySkips}` : "",
    input.result.message,
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  const raw = await request.text();
  const form = new URLSearchParams(raw);

  if (!isSlackCommandAuthorized(form, request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const text = String(form.get("text") || "").trim();
  const normalized = text.toLowerCase();
  const responseUrl = form.get("response_url");

  await createAutomationEvent({
    title: "Slack operator command received",
    detail: text || "No command text provided.",
    status: "done",
    type: "slack",
    payload: { text, userId: form.get("user_id"), channelId: form.get("channel_id") },
  });

  if (isLeadRequest(text)) {
    after(async () => {
      const result = await runVegaLeadRequest({ text });
      await postSlackCommandResponse(responseUrl, leadRunText(result));
    });
    return slackText("Vega is running that lead request now. I'll post the sourcing result back here when the run finishes.");
  }

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

  if (normalized.includes("audit") || normalized.includes("vega")) {
    const result = await runLeadCommandAudit({ postToSlack: true });
    return slackText(
      result.slack?.sent
        ? `Vega audit posted. Bottleneck: ${result.bottleneck}`
        : `Vega audit prepared. Bottleneck: ${result.bottleneck}`,
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
        "`Vega, need 10 new leads in HVAC between Tyler and Dallas, Texas` - run sourcing and queue approval-ready outreach.",
        "`digest` - post the current ops digest.",
        "`nova` - have the Lead Gen Director brief the Nova CEO AI Agent in Slack.",
        "`director status` - post the Director-to-Nova lead-gen briefing.",
        "`audit` - post Vega's full Lead Command audit with escalation actions.",
        "Approve plans and outreach directly from the Slack buttons.",
      ].join("\n"),
    );
  }

  await sendAgentPlan({ text, source: "slack-command" });
  return slackText("Plan posted. Approve it in Slack to launch the PDL scan and outreach queue.");
}
