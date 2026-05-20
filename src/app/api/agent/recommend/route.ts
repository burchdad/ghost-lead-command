import { NextResponse } from "next/server";
import { sendDailyNicheRecommendation } from "@/lib/agent";

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
  const exclude = [
    ...url.searchParams.getAll("exclude"),
    ...(url.searchParams.get("excludeCsv") || "").split(","),
  ].map((item) => item.trim()).filter(Boolean);
  const result = await sendDailyNicheRecommendation({ exclude });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const exclude = Array.isArray(body.exclude) ? body.exclude.map(String) : [];
  const result = await sendDailyNicheRecommendation({ exclude });
  return NextResponse.json(result);
}
