import { NextResponse } from "next/server";
import { runVegaReplyWork } from "@/lib/autopilot";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 10);
  const lookbackHours = Number(url.searchParams.get("lookbackHours") || 72);
  const text = `Vega, work ${limit} replies from the last ${lookbackHours} hours`;
  const result = await runVegaReplyWork({ text });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "Vega, work replies");
  const result = await runVegaReplyWork({ text });
  return NextResponse.json(result);
}
