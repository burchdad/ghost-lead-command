import { NextResponse } from "next/server";
import { runVegaOpsBrief } from "@/lib/vega-ops-brief";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function boolParam(value: string | null) {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase());
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runVegaOpsBrief({
      instruction: url.searchParams.get("instruction") || "Scheduled Vega ops brief",
      execute: boolParam(url.searchParams.get("execute")),
      briefNova: boolParam(url.searchParams.get("nova")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega ops brief failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runVegaOpsBrief({
      instruction: body.instruction ? String(body.instruction) : "Manual Vega ops brief",
      execute: Boolean(body.execute),
      briefNova: Boolean(body.briefNova),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega ops brief failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
