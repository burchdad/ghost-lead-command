import { NextResponse } from "next/server";
import { runMorningStandup } from "@/lib/morning-standup";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runMorningStandup({
      message: url.searchParams.get("message") || undefined,
      location: url.searchParams.get("location") || undefined,
      targetCloses: url.searchParams.get("targetCloses") ? Number(url.searchParams.get("targetCloses")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Morning standup failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runMorningStandup({
      message: body.message ? String(body.message) : undefined,
      location: body.location ? String(body.location) : undefined,
      targetCloses: body.targetCloses ? Number(body.targetCloses) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Morning standup failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
