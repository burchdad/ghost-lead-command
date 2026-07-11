import { after, NextResponse } from "next/server";
import { isLeadRequest, runVegaLeadRequest } from "@/lib/autopilot";
import { createAutomationEvent } from "@/lib/automation";
import { isSlackEventAuthorized, notifySlackVegaLeadRequestResult, type SlackEventPayload } from "@/lib/slack";

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
  await createAutomationEvent({
    title: isLeadInstruction ? "Vega Slack lead request received" : "Vega Slack message ignored",
    detail: instruction || text || "No Slack text received.",
    status: isLeadInstruction ? "running" : "blocked",
    type: "slack",
    payload: {
      eventId: payload.event_id,
      userId: event.user,
      channelId: event.channel,
      ts: event.ts,
      text,
      isLeadInstruction,
    },
  });

  if (!isLeadInstruction) {
    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "failed",
      summary: "I heard Vega, but I could not detect a lead sourcing request. Try: Vega, need 10 new HVAC leads near Tyler, Texas.",
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "not a Vega lead request" });
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
        },
        result: {
          found: result.found,
          qualified: result.qualified,
          queued: result.queued,
          message: result.message,
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
