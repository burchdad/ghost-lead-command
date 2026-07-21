import { NextResponse } from "next/server";
import { runVegaCallAssistWork } from "@/lib/vega-call-assist-work";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function boolParam(value: string | null) {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase());
}

function limitParam(value: string | null) {
  const parsed = Number(value || 10);
  return Number.isFinite(parsed) ? parsed : 10;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    return NextResponse.json(await runVegaCallAssistWork({
      instruction: url.searchParams.get("instruction") || "Scheduled Vega call assist worklist",
      limit: limitParam(url.searchParams.get("limit")),
      postToSlack: url.searchParams.has("postToSlack") ? boolParam(url.searchParams.get("postToSlack")) : true,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega call assist worklist failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await runVegaCallAssistWork({
      instruction: body.instruction ? String(body.instruction) : "Manual Vega call assist worklist",
      limit: limitParam(body.limit ? String(body.limit) : null),
      postToSlack: body.postToSlack === undefined ? true : Boolean(body.postToSlack),
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega call assist worklist failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
