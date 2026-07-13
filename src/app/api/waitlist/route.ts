import { NextResponse } from "next/server";
import { attributionFromRequest, submitWaitlist, validateWaitlistPayload } from "@/lib/waitlist";

const attempts = new Map<string, { count: number; resetAt: number }>();

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
  return current.count <= 5;
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const payload = await request.json().catch(() => null);
  const validation = validateWaitlistPayload(payload, attributionFromRequest(request));
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please review the highlighted fields.", fields: validation.errors },
      { status: validation.errors.website ? 400 : 422 },
    );
  }

  try {
    const result = await submitWaitlist(validation.value);
    return NextResponse.json({
      ok: true,
      crmStatus: result.crmStatus,
      emailStatus: result.emailStatus,
    });
  } catch (error) {
    console.error("Vega waitlist submission failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "We could not save your waitlist request right now. Please try again shortly." },
      { status: 503 },
    );
  }
}
