import { after, NextResponse } from "next/server";
import { isLeadRequest, runVegaLeadRequest } from "@/lib/autopilot";
import { createAutomationEvent } from "@/lib/automation";
import { isSlackEventAuthorized, notifySlackVegaLeadRequestResult, type SlackEventPayload } from "@/lib/slack";

function isVegaAddressed(text: string) {
  return /^\s*(?:vega|<@[A-Z0-9]+>)\s*[,:\-]?\s+/i.test(text);
}

function stripVegaAddress(text: string) {
  return text.replace(/^\s*(?:vega|<@[A-Z0-9]+>)\s*[,:\-]?\s+/i, "").trim();
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as SlackEventPayload;

  if (payload.type === "url_verification") {
    return new NextResponse(payload.challenge || "", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (!isSlackEventAuthorized(payload, request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = payload.event;
  if (payload.type !== "event_callback" || event?.type !== "message") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (event.subtype || event.bot_id) {
    return NextResponse.json({ ok: true, ignored: true, reason: "bot or subtype message" });
  }

  const text = String(event.text || "").trim();
  if (!isVegaAddressed(text) || !isLeadRequest(text)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not a Vega lead request" });
  }

  const instruction = stripVegaAddress(text);
  after(async () => {
    await createAutomationEvent({
      title: "Vega Slack message instruction received",
      detail: instruction,
      status: "running",
      type: "slack",
      payload: {
        eventId: payload.event_id,
        userId: event.user,
        channelId: event.channel,
        ts: event.ts,
        text,
      },
    });

    await notifySlackVegaLeadRequestResult({
      instruction,
      status: "received",
      summary: "Vega is sourcing this request now.",
    });

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
