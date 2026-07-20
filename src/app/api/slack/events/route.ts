import { after, NextResponse } from "next/server";
import {
  isLeadRequest,
  isReplyWorkRequest,
  runVegaLeadRequest,
  runVegaReplyWork,
  sendDailyDigest,
} from "@/lib/autopilot";
import { approvePendingOutreachBatch } from "@/lib/approval";
import { createAutomationEvent } from "@/lib/automation";
import { runLeadCommandAudit } from "@/lib/lead-command-audit";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";
import { runMorningStandup } from "@/lib/morning-standup";
import {
  isSlackEventAuthorized,
  notifySlackBatchApprovalResult,
  notifySlackClosingSprintResult,
  notifySlackVegaLeadRequestResult,
  type SlackEventPayload,
} from "@/lib/slack";
import { isClosingSprintRequest, parseClosingSprintInstruction, runVegaClosingSprint } from "@/lib/vega-closing-sprint";
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

function isVegaAddressed(text: string) {
  return /^\s*(?:vega|<@[A-Z0-9]+>)\s*[,:\-]?\s+/i.test(text);
}

function stripVegaAddress(text: string) {
  let cleaned = text.trim();
  for (let index = 0; index < 3; index += 1) {
    const next = cleaned.replace(/^\s*(?:vega|<@[A-Z0-9]+>)\s*[,:\-]?\s+/i, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

function normalizedInstruction(text: string) {
  return text.trim().toLowerCase();
}

function isAuditRequest(text: string) {
  const normalized = normalizedInstruction(text);
  return /\b(?:audit|status|bottleneck|blocker|health|what'?s wrong)\b/.test(normalized);
}

function isDigestRequest(text: string) {
  const normalized = normalizedInstruction(text);
  return /\b(?:digest|summary|recap)\b/.test(normalized);
}

function isNovaBriefRequest(text: string) {
  const normalized = normalizedInstruction(text);
  return /\b(?:nova|ceo|director brief|brief nova)\b/.test(normalized);
}

function isMorningStandupRequest(text: string) {
  const normalized = normalizedInstruction(text);
  return /\b(?:morning standup|morning meeting|daily standup|standup|c-suite meeting|nova and vega|nova x vega)\b/.test(normalized);
}

function isApprovalRequest(text: string) {
  const normalized = normalizedInstruction(text);
  return /\b(?:approve|send|release|automate|autopilot|auto[-\s]?send)\b/.test(normalized) && /\b(?:outreach|emails?|batch|\d+)\b/.test(normalized);
}

function parseApprovalLimit(text: string) {
  const match =
    text.match(/\b(?:approve|send|release)\s+(\d+)\b/i) ||
    text.match(/\b(\d+)\s+(?:emails?|outreach|approvals?|drafts?)\b/i) ||
    text.match(/\blimit\s*(?:=|:)?\s*(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: SlackEventPayload;
  try {
    payload = (JSON.parse(rawBody || "{}") || {}) as SlackEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Slack event payload" }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    return new NextResponse(payload.challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!isSlackEventAuthorized(payload, request, rawBody)) {
    console.warn("slack_events_unauthorized", {
      type: payload.type,
      eventType: payload.event?.type,
      channel: payload.event?.channel,
      eventId: payload.event_id,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = payload.event;
  const eventType = String(event?.type || "");
  if (payload.type !== "event_callback" || !event || !["message", "app_mention"].includes(eventType)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (eventType === "message" && (event.subtype || event.bot_id)) {
    console.info("slack_events_ignored_bot_or_subtype", {
      subtype: event.subtype,
      botId: event.bot_id,
      channel: event.channel,
      eventId: payload.event_id,
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "bot or subtype message" });
  }

  const text = String(event.text || "").trim();
  if (!isVegaAddressed(text)) {
    console.info("slack_events_ignored_not_vega", {
      channel: event.channel,
      eventId: payload.event_id,
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "not addressed to Vega" });
  }

  const instruction = stripVegaAddress(text);
  const isLeadInstruction = isLeadRequest(instruction) || isLeadRequest(text);
  const isReplyInstruction = isReplyWorkRequest(instruction) || isReplyWorkRequest(text);
  const isAuditInstruction = isAuditRequest(instruction);
  const isDigestInstruction = isDigestRequest(instruction);
  const isNovaInstruction = isNovaBriefRequest(instruction);
  const isMorningStandupInstruction = isMorningStandupRequest(instruction);
  const isApprovalInstruction = isApprovalRequest(instruction);
  const isClosingInstruction = isClosingSprintRequest(instruction);
  const isDominanceInstruction = isDominanceLoopRequest(instruction);
  const isOpsInstruction = isVegaOpsRequest(instruction);
  const isRevenueWatchInstruction = isRevenueWatchRequest(instruction);
  const isWarmLeadInstruction = isWarmLeadRequest(instruction);
  const isBookingDiagnosisInstruction = isBookingDiagnosisRequest(instruction);
  const specialistKind = classifyVegaSpecialistRequest(instruction);
  await createAutomationEvent({
    title: isLeadInstruction
      ? "Vega Slack lead request received"
      : isReplyInstruction
        ? "Vega Slack reply work received"
        : isAuditInstruction
          ? "Vega Slack audit request received"
          : isDigestInstruction
            ? "Vega Slack digest request received"
            : isNovaInstruction
              ? "Vega Slack Nova brief request received"
              : isMorningStandupInstruction
                ? "Vega Slack morning standup received"
                : isApprovalInstruction
                  ? "Vega Slack batch approval received"
                  : isClosingInstruction
                    ? "Vega Slack closing sprint received"
                    : isDominanceInstruction
                      ? "Vega Slack dominance loop received"
                      : isOpsInstruction
                        ? "Vega Slack ops brief received"
                        : isRevenueWatchInstruction
                          ? "Vega Slack revenue watch received"
                          : isWarmLeadInstruction
                            ? "Vega Slack warm-lead request received"
                            : isBookingDiagnosisInstruction
                              ? "Vega Slack booking diagnosis received"
                              : specialistKind
                                ? "Vega Slack specialist request received"
                                : "Vega Slack message ignored",
    detail: instruction || text || "No Slack text received.",
    status:
      isLeadInstruction ||
      isReplyInstruction ||
      isAuditInstruction ||
      isDigestInstruction ||
      isNovaInstruction ||
      isMorningStandupInstruction ||
      isApprovalInstruction ||
      isClosingInstruction ||
      isDominanceInstruction ||
      isOpsInstruction ||
      isRevenueWatchInstruction ||
      specialistKind
        ? "running"
        : "blocked",
    type: "slack",
    payload: {
      eventId: payload.event_id,
      userId: event.user,
      channelId: event.channel,
      ts: event.ts,
      text,
      isLeadInstruction,
      isReplyInstruction,
      isAuditInstruction,
      isDigestInstruction,
      isNovaInstruction,
      isMorningStandupInstruction,
      isApprovalInstruction,
      isClosingInstruction,
      isDominanceInstruction,
      isOpsInstruction,
      isRevenueWatchInstruction,
      isWarmLeadInstruction,
      isBookingDiagnosisInstruction,
      specialistKind,
    },
  });

  if (
    !isLeadInstruction &&
    !isReplyInstruction &&
    !isAuditInstruction &&
    !isDigestInstruction &&
    !isNovaInstruction &&
    !isMorningStandupInstruction &&
    !isApprovalInstruction &&
    !isClosingInstruction &&
    !isDominanceInstruction &&
    !isOpsInstruction &&
    !isRevenueWatchInstruction &&
    !isWarmLeadInstruction &&
    !isBookingDiagnosisInstruction &&
    !specialistKind
  ) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "failed",
      summary:
        "I heard Vega, but I could not detect a lead sourcing, dominance loop, closing sprint, approval, reply-work, audit, digest, or Nova brief request. Try: Vega, dominance loop. Or: Vega, approve 10.",
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "not a Vega lead request" });
  }

  if (isMorningStandupInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is preparing the Nova x Vega morning standup now.",
    });

    after(async () => {
      try {
        await runMorningStandup({ message: instruction });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown morning standup failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isClosingInstruction) {
    await notifySlackClosingSprintResult({
      instruction,
      status: "received",
      summary: "Vega is running the weekly closing sprint now.",
    });

    after(async () => {
      try {
        const result = await runVegaClosingSprint(parseClosingSprintInstruction(instruction));
        await notifySlackClosingSprintResult({
          instruction,
          status: "finished",
          summary: result.summary,
          bottleneck: result.bottleneck,
          metrics: result.after,
          actions: result.actions,
          nextMoves: result.nextMoves,
        });
      } catch (error) {
        await notifySlackClosingSprintResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega closing sprint failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isDominanceInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is running the dominance loop across source, signal, specialists, booking, and deliverability now.",
    });

    after(async () => {
      try {
        const result = await runVegaDominanceLoop({ instruction });
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "finished",
          summary: [
            result.summary,
            `Bottleneck: ${result.bottleneck}`,
            result.nextMoves.length ? `Next moves: ${result.nextMoves.slice(0, 4).join("; ")}` : "Next moves: continue controlled sourcing and reply watch.",
          ].join("\n"),
          result: {
            found: result.metrics.found,
            qualified: result.metrics.qualified,
            queued: result.metrics.queued,
            message: `Pending ${result.metrics.pendingApprovals}; SendGrid-ready ${result.metrics.sendgridReady}; booked ${result.metrics.bookedCalls}; closeness ${result.metrics.gojiBerryCloseness}.`,
          },
        });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega dominance loop failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isOpsInstruction) {
    const execute = shouldExecuteOps(instruction);
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: execute ? "Vega is running the ops loop now." : "Vega is preparing the sub-agent ops brief now.",
    });

    after(async () => {
      try {
        await runVegaOpsBrief({ instruction, execute, briefNova: /nova/i.test(instruction) });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega ops brief failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isRevenueWatchInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is watching reply, booking, SendGrid, and source performance signals now.",
    });

    after(async () => {
      try {
        await runVegaRevenueWatch({ instruction, execute: true });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega revenue watch failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isWarmLeadInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is ranking the warmest accounts now.",
    });

    after(async () => {
      try {
        const result = await getWarmLeadPriorityReport({ limit: 5 });
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "finished",
          summary: [
            result.summary,
            ...result.leads.map((lead, index) => `${index + 1}. ${lead.companyName} (${lead.score}) - ${lead.signal}. Next: ${lead.nextMove}`),
          ].join("\n"),
        });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown warm lead report failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isBookingDiagnosisInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is diagnosing the booking bottleneck now.",
    });

    after(async () => {
      try {
        const result = await getBookingDiagnosisReport();
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "finished",
          summary: [
            result.summary,
            result.blockers.length ? `Blockers: ${result.blockers.join("; ")}` : "Blockers: none detected.",
            result.nextMoves.length ? `Next moves: ${result.nextMoves.join("; ")}` : "Next moves: work warmest accounts.",
          ].join("\n"),
        });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown booking diagnosis failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (specialistKind) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: `Vega is running the ${specialistKind} specialist lane now.`,
    });

    after(async () => {
      try {
        const result = await runVegaSpecialist(specialistKind, { limit: 10 });
        const metrics = result.metrics as Record<string, string | number | boolean>;
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "finished",
          summary: specialistSlackSummary(result),
          result: {
            found: Number(metrics["reviewed"] || metrics["copyReviewed"] || 0),
            qualified: Number(metrics["ready"] || metrics["bookingReady"] || metrics["rewritten"] || 0),
            queued: Number(metrics["queued"] || metrics["cadenceQueued"] || metrics["replyDrafts"] || 0),
            message: result.nextMove,
          },
        });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega specialist failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isApprovalInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is approving the next SendGrid-ready outreach batch now.",
    });

    after(async () => {
      try {
        const result = await approvePendingOutreachBatch({ limit: parseApprovalLimit(instruction) });
        await notifySlackBatchApprovalResult(result);
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega approval failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isAuditInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is running the Lead Command audit now.",
    });

    after(async () => {
      try {
        await runLeadCommandAudit({ postToSlack: true });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega audit failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isDigestInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is posting the current Lead Command digest now.",
    });

    after(async () => {
      try {
        await sendDailyDigest();
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega digest failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isNovaInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is briefing Nova from Lead Command now.",
    });

    after(async () => {
      try {
        await briefNovaCeoAgent({
          message: instruction || "Slack requested a Vega Lead Command briefing for Nova.",
        });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Nova brief failure.",
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  if (isReplyInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is working recent replies and booking handoffs now.",
    });

    after(async () => {
      try {
        await runVegaReplyWork({ text: instruction });
      } catch (error) {
        await notifySlackVegaLeadRequestResult({
          instruction,
          status: "failed",
          summary: error instanceof Error ? error.message : "Unknown Vega reply-work failure.",
        });
        await createAutomationEvent({
          title: "Vega Slack reply instruction failed",
          detail: error instanceof Error ? error.message : "Unknown Vega reply-work failure.",
          status: "blocked",
          type: "slack",
          payload: { eventId: payload.event_id, instruction },
        });
      }
    });

    return NextResponse.json({ ok: true, accepted: true });
  }

  await notifySlackVegaLeadRequestResult({
    instruction,
    status: "received",
    summary: "Vega is sourcing this request now.",
  });

  after(async () => {
    try {
      const { plan, result } = await runVegaLeadRequest({ text: instruction });
      await notifySlackVegaLeadRequestResult({
        instruction,
        status: "finished",
        summary: result.message,
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
          message: result.message,
          guardrails: result.guardrails,
          diagnostics: result.diagnostics,
        },
      });
    } catch (error) {
      await notifySlackVegaLeadRequestResult({
        instruction,
        status: "failed",
        summary: error instanceof Error ? error.message : "Unknown Vega sourcing failure.",
      });
      await createAutomationEvent({
        title: "Vega Slack message instruction failed",
        detail: error instanceof Error ? error.message : "Unknown Vega sourcing failure.",
        status: "blocked",
        type: "slack",
        payload: { eventId: payload.event_id, instruction },
      });
    }
  });

  return NextResponse.json({ ok: true, accepted: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "slack-events",
    url: "/api/slack/events",
  });
}
