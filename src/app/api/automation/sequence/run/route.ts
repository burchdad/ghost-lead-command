import { NextResponse } from "next/server";
import { approvePendingOutreachBatch } from "@/lib/approval";
import { runDueSequenceSteps } from "@/lib/automation";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function boolFromEnv(name: string, fallback = false) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function sequenceLimit(value: unknown) {
  const maxLimit = Math.min(25, Math.max(1, numberFromEnv("VEGA_SEQUENCE_MAX_RUN_LIMIT", 20)));
  const requested = Number(value || process.env.SEQUENCE_RUN_LIMIT || 10);
  return Math.min(maxLimit, Math.max(1, Number.isFinite(requested) ? requested : 10));
}

function shouldAutoSend(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  const param = url.searchParams.get("autoSend");
  const bodyValue = body?.autoSend;
  if (param === "false" || bodyValue === false) return false;
  if (param === "true" || bodyValue === true) return true;
  return boolFromEnv("AGENT_AUTO_SEND", false) && String(process.env.OUTREACH_SEND_MODE || "").toLowerCase() === "live";
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = sequenceLimit(url.searchParams.get("limit"));
  const result = await runDueSequenceSteps({ limit });
  const approval = shouldAutoSend(request) ? await approvePendingOutreachBatch({ limit }) : null;
  return NextResponse.json({ ...result, autoSend: Boolean(approval), approval });
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = sequenceLimit(body.limit);
  const result = await runDueSequenceSteps({ limit });
  const approval = shouldAutoSend(request, body) ? await approvePendingOutreachBatch({ limit }) : null;
  return NextResponse.json({ ...result, autoSend: Boolean(approval), approval });
}
