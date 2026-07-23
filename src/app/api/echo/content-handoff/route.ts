import { NextResponse } from "next/server";
import {
  ingestEchoContentHandoff,
  runLinkedInContentSignalAgent,
  type LinkedInEngagementRow,
} from "@/lib/linkedin-content-signals";

function authorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function rowsFromBody(body: Record<string, unknown>): LinkedInEngagementRow[] {
  const rows = body.rows || body.engagements || body.signals || body.leads;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...(row as LinkedInEngagementRow),
    sourceSystem: "echo",
    contentOwner: (row as LinkedInEngagementRow).contentOwner || "Echo",
  }));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await runLinkedInContentSignalAgent({
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    queue: url.searchParams.get("queue") !== "false",
  });
  return NextResponse.json({
    ok: true,
    owner: "Vega",
    upstream: "Echo",
    publishing: "not handled here",
    result,
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const rows = rowsFromBody(body);
  const ingest = rows.length ? await ingestEchoContentHandoff(rows) : null;
  const run = await runLinkedInContentSignalAgent({
    limit: body.limit ? Number(body.limit) : undefined,
    queue: body.queue !== false,
  });

  return NextResponse.json({
    ok: true,
    owner: "Vega",
    upstream: "Echo",
    publishing: "not handled here",
    ingest,
    run,
  });
}
