import { NextResponse } from "next/server";
import { runVegaRevenueWatch } from "@/lib/vega-revenue-watch";

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
    return NextResponse.json(await runVegaRevenueWatch({
      instruction: url.searchParams.get("instruction") || "Scheduled Vega revenue watch",
      execute: url.searchParams.has("execute") ? boolParam(url.searchParams.get("execute")) : true,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega revenue watch failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await runVegaRevenueWatch({
      instruction: body.instruction ? String(body.instruction) : "Manual Vega revenue watch",
      execute: Boolean(body.execute),
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega revenue watch failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
