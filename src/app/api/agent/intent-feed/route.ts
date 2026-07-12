import { NextResponse } from "next/server";
import { getIntentFeed, runIntentFeedScout } from "@/lib/intent-feed";

function boolParam(value: string | null) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await getIntentFeed({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      enrich: boolParam(url.searchParams.get("enrich")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Intent feed unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runIntentFeedScout({
      limit: body.limit ? Number(body.limit) : undefined,
      enrich: body.enrich !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Intent feed scout failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
