import { NextResponse } from "next/server";
import { runVegaExecutive } from "@/lib/vega-executive";

function authorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || process.env.LEAD_COMMAND_ACCESS_KEY || "").trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    if (!text) return NextResponse.json({ error: "A Vega executive request is required." }, { status: 400 });
    return NextResponse.json(await runVegaExecutive({ text }));
  } catch (error) {
    return NextResponse.json({ error: "Vega Executive failed", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
