import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";

const attempts = new Map<string, { count: number; resetAt: number }>();
const allowedEvents = new Set([
  "final CTA clicked",
  "hero primary CTA clicked",
  "hero secondary CTA clicked",
  "integration section viewed",
  "prospect journey viewed",
  "specialist section viewed",
  "waitlist route entered",
  "waitlist form started",
  "waitlist form submitted",
  "waitlist submission failed",
  "waitlist submission succeeded",
  "workflow section viewed",
  "faq opened",
]);

function rateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "anonymous";
}

function checkRateLimit(request: Request) {
  const key = rateLimitKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

function clean(value: unknown, maxLength = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return NextResponse.json({ ok: false, error: "Too many events." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { event?: unknown; source?: unknown; metadata?: unknown } | null;
  const event = clean(body?.event);
  if (!allowedEvents.has(event)) {
    return NextResponse.json({ ok: false, error: "Unsupported event." }, { status: 422 });
  }

  await createAutomationEvent({
    title: "Vega waitlist web event",
    detail: event,
    status: "received",
    type: "waitlist-analytics",
    payload: {
      event,
      source: clean(body?.source, 80) || "vega-waitlist",
      metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
      referrer: clean(request.headers.get("referer"), 500),
      userAgent: clean(request.headers.get("user-agent"), 500),
    },
  }).catch((error) => {
    console.warn("waitlist_analytics_event_failed", error instanceof Error ? error.message : error);
  });

  return NextResponse.json({ ok: true });
}
