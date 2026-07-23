import { NextResponse } from "next/server";
import {
  ingestLinkedInEngagementRows,
  runLinkedInContentSignalAgent,
  type LinkedInEngagementRow,
} from "@/lib/linkedin-content-signals";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function parseRows(value: unknown): LinkedInEngagementRow[] {
  if (Array.isArray(value)) return value as LinkedInEngagementRow[];
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|,/).map((part) => part.trim());
        return {
          engagerName: parts[0],
          engagerTitle: parts[1],
          engagerCompany: parts[2],
          engagementType: parts[3] || "engagement",
          engagerProfileUrl: parts[4],
          postUrl: parts[5],
          raw: { line },
        };
      });
  }
  return [];
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await runLinkedInContentSignalAgent({
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    queue: url.searchParams.get("queue") !== "false",
  });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rows = parseRows(body.rows || body.csv || body.text);
  const ingest = rows.length ? await ingestLinkedInEngagementRows(rows) : null;
  const run = await runLinkedInContentSignalAgent({
    limit: body.limit ? Number(body.limit) : undefined,
    queue: body.queue !== false,
  });
  return NextResponse.json({ ok: true, ingest, run });
}
