import { NextResponse } from "next/server";
import { runVegaSpecialist, type VegaSpecialistKind } from "@/lib/vega-specialists";

const allowedKinds = new Set<VegaSpecialistKind>([
  "contact-path",
  "booking",
  "deliverability",
  "copy-chief",
  "cadence",
  "intent-feed",
  "learning-loop",
  "social-intent",
  "linkedin-content",
  "linkedin-events",
  "linkedin-tasks",
  "waitlist",
  "full-team",
]);

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseKind(value: string | null): VegaSpecialistKind {
  return allowedKinds.has(value as VegaSpecialistKind) ? (value as VegaSpecialistKind) : "full-team";
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runVegaSpecialist(parseKind(url.searchParams.get("kind")), {
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega specialist run failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runVegaSpecialist(parseKind(body.kind ? String(body.kind) : null), {
      limit: body.limit ? Number(body.limit) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega specialist run failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
