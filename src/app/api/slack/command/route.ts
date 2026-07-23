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
import { isConversionAuditRequest, runVegaConversionAudit } from "@/lib/conversion-audit";
import { runIntentFeedScout } from "@/lib/intent-feed";
import { runLeadCommandAudit } from "@/lib/lead-command-audit";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { runMorningStandup } from "@/lib/morning-standup";
import { isProductionProofRequest, runVegaProductionProof } from "@/lib/production-proof";
import { isSlackCommandAuthorized, notifySlackBatchApprovalResult, notifySlackClosingSprintResult } from "@/lib/slack";
import { isClosingSprintRequest, parseClosingSprintInstruction, runVegaClosingSprint } from "@/lib/vega-closing-sprint";
import { isCallAssistWorkRequest, runVegaCallAssistWork } from "@/lib/vega-call-assist-work";
import { isDominanceLoopRequest, runVegaDominanceLoop } from "@/lib/vega-dominance-loop";
import { isVegaOpsRequest, runVegaOpsBrief, shouldExecuteOps } from "@/lib/vega-ops-brief";
import { isRevenueWatchRequest, runVegaRevenueWatch } from "@/lib/vega-revenue-watch";
import { classifyVegaSpecialistRequest, runVegaSpecialist, specialistSlackSummary } from "@/lib/vega-specialists";
import {
  getBookingDiagnosisReport,
  getWarmLeadPriorityReport,
  isBookingDiagnosisRequest,
  isWarmLeadRequest,
} from "@/lib/warm-leads";

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
  if (/\bauto[-\s]?send\b/.test(normalized)) return true;
  if (/\b(?:approve|send|release|automate|autopilot)\b/.test(normalized) && /\b(?:outreach|emails?|email batch|batch|drafts?|queue|\d+)\b/.test(normalized)) return true;
  return /\b(?:approve and send|send out emails?|send emails?|send outreach|approve queue)\b/.test(normalized);
}

function isMorningStandupRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return /\b(?:morning standup|morning meeting|daily standup|standup|c-suite meeting|nova and vega|nova x vega)\b/.test(normalized);
}

function parseApprovalLimit(text: string) {
  const match =
    text.match(/\b(?:approve|send|release|auto[-\s]?send|automate|autopilot)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:emails?|outreach|approvals?|drafts?)\b/i) ||
    text.match(/\blimit\s*(?:=|:)?\s*(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

function isSignalReportRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return /\b(?:strongest signals|linkedin intent|social intent|intent signals|signal timeline|refresh intent feed)\b/.test(normalized);
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

  if (isProductionProofRequest(text)) {
    after(async () => {
      const result = await runVegaProductionProof({ instruction: text, postToSlack: true });
      await postSlackCommandResponse(
        responseUrl,
        `Production proof posted. Sender ${result.report.sender.mode}; ${result.report.emailPipeline.emailQualified} email-qualified; ${result.report.emailPipeline.sendableNow} sendable now; ${result.report.emailPipeline.heldBySenderGovernor} held by governor; ${result.report.today.callsDue} actionable calls; ${result.report.yesterday.meetingsBooked} booked yesterday.`,
      );
    });
    return slackText("Vega is running the seven-day production proof and learning report now.");
  }

  if (isSignalReportRequest(text)) {
    after(async () => {
      const result = await runIntentFeedScout({ limit: 10, enrich: normalized.includes("refresh") || normalized.includes("strongest") });
      await postSlackCommandResponse(
        responseUrl,
        [
          `Vega Signal ranked ${result.items.length} warm-signal accounts. Perplexity: ${result.perplexity.configured ? "configured" : "not configured"}.`,
          ...result.items.slice(0, 8).map((item, index) =>
            `${index + 1}. ${item.companyName} (${item.signalScore}) - ${item.signalType}. ${item.signalSummary.slice(0, 180)} Next: ${item.nextMove}`,
          ),
          "No unauthorized LinkedIn/social messages were sent; signal lanes create research/manual/email/call actions only.",
        ].join("\n"),
      );
    });
    return slackText("Vega Signal is ranking the strongest intent and social-style evidence now.");
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

  if (isDominanceLoopRequest(text)) {
    after(async () => {
      const result = await runVegaDominanceLoop({ instruction: text });
      await postSlackCommandResponse(
        responseUrl,
        [
          result.summary,
          `Bottleneck: ${result.bottleneck}`,
          result.nextMoves.length ? `Next moves: ${result.nextMoves.slice(0, 4).join("; ")}` : "",
        ].filter(Boolean).join("\n"),
      );
    });
    return slackText("Vega is running the dominance loop across source, signal, specialists, booking, and deliverability now.");
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

  if (isCallAssistWorkRequest(text)) {
    after(async () => {
      const result = await runVegaCallAssistWork({ instruction: text, limit: 10, postToSlack: true });
      await postSlackCommandResponse(
        responseUrl,
        [
          result.summary,
          `Due ${result.metrics.due}, overdue ${result.metrics.overdue}, selected ${result.metrics.selected}.`,
          result.nextMove,
        ].join("\n"),
      );
    });
    return slackText("Vega is building the Stephen/VA call-assist worklist now.");
  }

  if (isWarmLeadRequest(text)) {
    after(async () => {
      const result = await getWarmLeadPriorityReport({ limit: 5 });
      await postSlackCommandResponse(
        responseUrl,
        [
          result.summary,
          ...result.leads.map((lead, index) => `${index + 1}. ${lead.companyName} (${lead.score}) - ${lead.signal}. Next: ${lead.nextMove}`),
        ].join("\n"),
      );
    });
    return slackText("Vega is ranking the warmest accounts now.");
  }

  if (isBookingDiagnosisRequest(text)) {
    after(async () => {
      const result = await getBookingDiagnosisReport();
      await postSlackCommandResponse(
        responseUrl,
        [
          result.summary,
          result.blockers.length ? `Blockers: ${result.blockers.join("; ")}` : "Blockers: none detected.",
          result.nextMoves.length ? `Next moves: ${result.nextMoves.join("; ")}` : "Next moves: work warmest accounts.",
        ].join("\n"),
      );
    });
    return slackText("Vega is diagnosing the booking bottleneck now.");
  }

  if (isConversionAuditRequest(text)) {
    after(async () => {
      const result = await runVegaConversionAudit();
      await postSlackCommandResponse(
        responseUrl,
        [
          result.summary,
          `Sender health: ${result.metrics.senderHealth} (${result.metrics.bounceRate}% risky), reply rate: ${result.metrics.replyRate}%, click rate: ${result.metrics.clickRate}%.`,
          `Email queue: ${result.metrics.namedBusinessPending} named, ${result.metrics.genericPending} generic, ${result.metrics.invalidPending} invalid, ${result.metrics.manual} manual.`,
          result.gaps.length ? `Top gaps: ${result.gaps.slice(0, 4).map((gap) => `${gap.severity}: ${gap.issue} Action: ${gap.action}`).join(" | ")}` : "Top gaps: none.",
          result.sources.length ? `Sources: ${result.sources.slice(0, 4).map((source) => `${source.source}: ${source.sent} sent, ${source.replies} replies, ${source.riskyRate}% risky`).join(" | ")}` : "",
          result.nextMoves.length ? `Next moves: ${result.nextMoves.slice(0, 5).join("; ")}` : "Next moves: controlled send/watch loop.",
        ].filter(Boolean).join("\n"),
      );
    });
    return slackText("Vega is auditing conversion quality, reply capture, sender health, and booking leakage now.");
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
      const blocked = "blocked" in result && result.blocked;
      await postSlackCommandResponse(
        responseUrl,
        blocked
          ? `Vega paused approval: ${"blockReason" in result ? result.blockReason : "conversion quality gate blocked it."}`
          : `Vega approval complete: approved ${result.approved}/${result.attempted}; sent ${result.sent}; dry-run ${result.dryRunQueued}; failed ${result.failed}.`,
      );
    });
    return slackText("Vega is auto-sending the next SendGrid-ready email batch now. I'll post the result when it finishes.");
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
        "`recommend` - post today's auto-send slate.",
        "`run roofing in Texas score 85 limit 5` - propose a scoped sourcing plan.",
        "`Vega, need 10 new leads in HVAC between Tyler and Dallas, Texas` - run sourcing and queue approval-ready outreach.",
        "`Vega, auto-send outreach 10` - let Vega send the next eligible SendGrid-ready emails.",
        "`Vega, work replies` - queue response drafts for hot/booked replies and prep bookings.",
        "`Vega, watch replies` - monitor SendGrid, replies, bookings, and source scorecard after sends.",
        "`Vega, show warmest leads` - rank the top accounts Vega should work next.",
        "`Vega, why are we not booking calls today?` - diagnose booking blockers and next moves.",
        "`Vega, conversion audit` - find exactly where leads are leaking between source, valid contact, send, reply, opportunity, and booking.",
        "`Vega, why no replies` - audit reply-rate, sender health, source quality, and copy/contact gaps.",
        "`Vega, refresh intent feed` - rank warm buyer signals and public web context before choosing the next accounts.",
        "`Vega, run learning loop` - tune source plays from live reply/send outcomes.",
        "`Vega, scout social intent` - run competitor/social-style signal plays and queue qualified leads.",
        "`Vega, LinkedIn post engagement leads` - rank post reactors/commenters/impression signals and queue manual InMail/DM tasks.",
        "`Vega, check LinkedIn events` - verify LinkedIn Events Management and lead-gen-enabled event availability.",
        "`Vega, queue LinkedIn InMails 10` - create manual Sales Navigator connection, DM, or InMail tasks for social-fit leads.",
        "`Vega, review the waitlist` - review Vega early-access contestants and surface top beta/design-partner candidates.",
        "`Vega, push bookings` - work engaged replies toward calendar-ready follow-up.",
        "`Vega, work calls` - post the due Stephen/VA phone-assist worklist with numbers, opener, assignee, and attempts.",
        "`Vega, work contact paths` - refresh manual phone/website tasks and blocked contact paths.",
        "`Vega, tune copy` - rewrite pending email drafts using the offer/copy scorecard.",
        "`Vega, protect deliverability` - suppress failed contacts and reject risky pending sends.",
        "`Vega, run specialists` - run copy, cadence, replies, booking, contact paths, and deliverability together.",
        "`Vega, closing sprint for 10 closes this week` - run Vega's close-this-week operating loop and report the bottleneck.",
        "`Vega, dominance loop` - run the full source, signal, specialist, booking, deliverability, and closing loop.",
        "`Vega, morning standup` - post the Stephen/Nova/Vega scoreboard, Nova directive, Vega orders, and today's lead targets.",
        "`Vega, production proof` - post the seven-day proof loop: delivery, replies, calls, meetings, source quality, campaign split, and sender governor.",
        "`Vega, ops brief` - post the sub-agent chain-of-command report for Vega, Nova, and Stephen.",
        "`Vega, run ops loop` - run Vega's safe autonomy lanes and post what each sub-agent did.",
        "`Vega, closing sprint approve 10` - run the sprint and approve a SendGrid-ready batch if available.",
        "`Vega, approve 10` - approve the next 10 SendGrid-ready outreach items without relying on Slack buttons.",
        "`Vega, automate outreach 10` - safely auto-approve the next capped SendGrid-ready batch.",
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
