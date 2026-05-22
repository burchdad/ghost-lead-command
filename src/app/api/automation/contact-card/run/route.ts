import { NextResponse } from "next/server";
import { runContactCardAutomation } from "@/lib/contact-card-automation";

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
  const limit = Number(url.searchParams.get("limit") || process.env.CONTACT_CARD_AUTOMATION_LIMIT || 10);
  const result = await runContactCardAutomation({ limit });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = Number(body.limit || process.env.CONTACT_CARD_AUTOMATION_LIMIT || 10);
  const result = await runContactCardAutomation({ limit });
  return NextResponse.json(result);
}
