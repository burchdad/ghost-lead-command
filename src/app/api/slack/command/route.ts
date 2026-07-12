import { after, NextResponse } from "next/server";
import {
  isLeadRequest,
  isReplyWorkRequest,
  runVegaLeadRequest,
  runVegaReplyWork,
  sendAgentPlan,
  sendDailyDigest,
} from "@/lib/autopilot";
import { approvePendingOutreachBatch } from "@/lib/approval";
import { createAutomationEvent } from "@/lib/automation";
import { runLeadCommandAudit } from "@/lib/lead-command-audit";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { runMorningStandup } from "@/lib/morning-standup";
import { isSlackCommandAuthorized, notifySlackBatchApprovalResult, notifySlackClosingSprintResult } from "@/lib/slack";
import { isClosingSprintRequest, parseClosingSprintInstruction, runVegaClosingSprint } from "@/lib/vega-closing-sprint";
import { isVegaOpsRequest, runVegaOpsBrief, shouldExecuteOps } from "@/lib/vega-ops-brief";
import { isRevenueWatchRequest, runVegaRevenueWatch } from "@/lib/vega-revenue-watch";
import { classifyVegaSpecialistRequest, runVegaSpecialist, specialistSlackSummary } from "@/lib/vega-specialists";

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
  const requestedScore = input.result.guardrails?.requested?.minScore;
  const effectiveScore = input.result.guardrails?.effective?.minScore;

  return [
    `Vega ran the lead request for ${input.plan.niche}.`,
    `Source: ${input.plan.provider}`,
    `Location: ${input.plan.location}${input.plan.locations?.length ? ` (${input.plan.locations.length} markets)` : ""}`,
    requestedScore || effectiveScore ? `Score: ${requestedScore ?? "n/a"} requested / ${effectiveScore ?? "n/a"} effective` : "",
    `Found ${input.result.rawFound ?? input.result.found}, qualified ${input.result.qualified}, queued ${input.result.queued}, review-ready ${input.result.reviewReady ?? 0}.`,
    diagnostics ? `Contactable: ${diagnostics.contactable}, missing contact: ${diagnostics.missingContact}` : "",
    markets,
    sourceFilters ? `Source filters: ${sourceFilters}` : "",
    policySkips ? `Policy skips: ${policySkips}` : "",
    input.result.message,
  ].filter(Boolean).join("\n");
}

function isApprovalRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return /\b(?:approve|send|release)\b/.test(normalized) && /\b(?:outreach|emails?|batch|\d+)\b/.test(normalized);
}

function isMorningStandupRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return /\b(?:morning standup|morning meeting|daily standup|standup|c-suite meeting|nova and vega|nova x vega)\b/.test(normalized);
}

function parseApprovalLimit(text: string) {
  const match =
    text.match(/\b(?:approve|send|release)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:emails?|outreach|approvals?|drafts?)\b/i) ||
    text.match(/\blimit\s*(?:=|:)?\s*(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
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

  if (isMorningStandupRequest(text)) {
    after(async () => {
      const result = await runMorningStandup({ message: text });
      await postSlackCommandResponse(
        responseUrl,
        `Morning standup posted. Bottleneck: ${result.bottleneck}. Stephen ask: ${result.stephenAsk}`,
      );
    });
    return slackText("Vega is preparing the Nova x Vega morning standup now.");
  }

  if (isClosingSprintRequest(text)) {
    after(async () => {
      const result = await runVegaClosingSprint(parseClosingSprintInstruction(text));
      await notifySlackClosingSprintResult({
        instruction: text,
        status: "finished",
        summary: result.summary,
        bottleneck: result.bottleneck,
        metrics: result.after,
        actions: result.actions,
        nextMoves: result.nextMoves,
      });
      await postSlackCommandResponse(responseUrl, `${result.summary}\nNext: ${result.nextMoves.join(" ")}`);
    });
    return slackText("Vega is running the weekly closing sprint now. I'll post the bottleneck and next moves when it finishes.");
  }

  if (isVegaOpsRequest(text)) {
    const execute = shouldExecuteOps(text);
    after(async () => {
      const result = await runVegaOpsBrief({ instruction: text, execute, briefNova: normalized.includes("nova") });
      await postSlackCommandResponse(
        responseUrl,
        `${result.summary}\nBottleneck: ${result.bottleneck}\nStephen ask: ${result.stephenAsk}`,
      );
    });
    return slackText(execute ? "Vega is running the ops loop now." : "Vega is preparing the sub-agent ops brief now.");
  }

  if (isRevenueWatchRequest(text)) {
    after(async () => {
      const result = await runVegaRevenueWatch({ instruction: text, execute: true });
      await postSlackCommandResponse(responseUrl, `${result.summary}\nNext: ${result.nextMove}`);
    });
    return slackText("Vega is watching replies, SendGrid signals, bookings, and source performance now.");
  }

  const specialistKind = classifyVegaSpecialistRequest(text);
  if (specialistKind) {
    after(async () => {
      const result = await runVegaSpecialist(specialistKind, { limit: 10 });
      await postSlackCommandResponse(responseUrl, specialistSlackSummary(result));
    });
    return slackText(`Vega is running the ${specialistKind} specialist lane now.`);
  }

  if (isLeadRequest(text)) {
    after(async () => {
      const result = await runVegaLeadRequest({ text });
      await postSlackCommandResponse(responseUrl, leadRunText(result));
    });
    return slackText("Vega is running that lead request now. I'll post the sourcing result back here when the run finishes.");
  }

  if (isReplyWorkRequest(text)) {
    after(async () => {
      const { result } = await runVegaReplyWork({ text });
      await postSlackCommandResponse(
        responseUrl,
        [
          result.message,
          `Reviewed ${result.reviewed}, queued ${result.queued}, booking ready ${result.bookingReady}, booking blocked ${result.bookingBlocked}.`,
          result.alreadyPending ? `Already pending: ${result.alreadyPending}.` : "",
          result.missingContact ? `Missing email: ${result.missingContact}.` : "",
        ].filter(Boolean).join("\n"),
      );
    });
    return slackText("Vega is working recent replies now. I'll post the conversion result back here when it finishes.");
  }

  if (isApprovalRequest(text)) {
    after(async () => {
      const result = await approvePendingOutreachBatch({ limit: parseApprovalLimit(text) });
      await notifySlackBatchApprovalResult(result);
      await postSlackCommandResponse(
        responseUrl,
        `Vega approval complete: approved ${result.approved}/${result.attempted}; sent ${result.sent}; dry-run ${result.dryRunQueued}; failed ${result.failed}.`,
      );
    });
    return slackText("Vega is approving the next SendGrid-ready outreach batch now. I'll post the result when it finishes.");
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
        "`Vega, work replies` - queue response drafts for hot/booked replies and prep bookings.",
        "`Vega, watch replies` - monitor SendGrid, replies, bookings, and source scorecard after sends.",
        "`Vega, refresh intent feed` - rank warm buyer signals and public web context before choosing the next accounts.",
        "`Vega, run learning loop` - tune source plays from live reply/send outcomes.",
        "`Vega, scout social intent` - run competitor/social-style signal plays and queue qualified leads.",
        "`Vega, check LinkedIn events` - verify LinkedIn Events Management and lead-gen-enabled event availability.",
        "`Vega, queue LinkedIn tasks` - create manual Sales Navigator connection/DM tasks for social-fit leads.",
        "`Vega, push bookings` - work engaged replies toward calendar-ready follow-up.",
        "`Vega, work contact paths` - refresh manual phone/website tasks and blocked contact paths.",
        "`Vega, tune copy` - rewrite pending email drafts using the offer/copy scorecard.",
        "`Vega, protect deliverability` - suppress failed contacts and reject risky pending sends.",
        "`Vega, run specialists` - run copy, cadence, replies, booking, contact paths, and deliverability together.",
        "`Vega, closing sprint for 10 closes this week` - run Vega's close-this-week operating loop and report the bottleneck.",
        "`Vega, morning standup` - post the Stephen/Nova/Vega scoreboard, Nova directive, Vega orders, and today's lead targets.",
        "`Vega, ops brief` - post the sub-agent chain-of-command report for Vega, Nova, and Stephen.",
        "`Vega, run ops loop` - run Vega's safe autonomy lanes and post what each sub-agent did.",
        "`Vega, closing sprint approve 10` - run the sprint and approve a SendGrid-ready batch if available.",
        "`Vega, approve 10` - approve the next 10 SendGrid-ready outreach items without relying on Slack buttons.",
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
