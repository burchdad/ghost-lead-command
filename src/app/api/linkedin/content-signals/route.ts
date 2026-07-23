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

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fieldValue(record: Record<string, string>, names: string[]) {
  for (const name of names) {
    const value = record[normalizeHeader(name)];
    if (value) return value;
  }
  return "";
}

function numberField(record: Record<string, string>, names: string[]) {
  const value = fieldValue(record, names).replace(/,/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDelimitedRows(value: string): LinkedInEngagementRow[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines.some((line) => line.includes("\t")) ? "\t" : ",";
  const splitLine = (line: string) => line.split(delimiter).map((part) => part.trim());
  const first = splitLine(lines[0]);
  const looksLikeHeader = first.some((part) =>
    /name|title|company|engagement|profile|post|impression|click|reaction|comment|share|campaign|echo/i.test(part),
  );
  const headers = looksLikeHeader
    ? first.map(normalizeHeader)
    : ["engagername", "engagertitle", "engagercompany", "engagementtype", "engagerprofileurl", "posturl"];
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const parts = splitLine(line);
    const record = headers.reduce<Record<string, string>>((memo, header, index) => {
      memo[header] = parts[index] || "";
      return memo;
    }, {});
    return {
      sourceSystem: fieldValue(record, ["sourceSystem", "source", "origin"]) || "echo",
      campaignName: fieldValue(record, ["campaignName", "campaign", "campaign title"]),
      contentOwner: fieldValue(record, ["contentOwner", "owner", "author", "agent"]) || "Echo",
      postUrl: fieldValue(record, ["postUrl", "post link", "url"]),
      postTitle: fieldValue(record, ["postTitle", "post", "content", "topic"]),
      postPublishedAt: fieldValue(record, ["publishedAt", "postPublishedAt", "date"]),
      postImpressions: numberField(record, ["postImpressions", "impressions", "views"]),
      postClicks: numberField(record, ["postClicks", "clicks"]),
      postReactions: numberField(record, ["postReactions", "reactions", "likes"]),
      postComments: numberField(record, ["postComments", "comments"]),
      postShares: numberField(record, ["postShares", "shares", "reposts"]),
      impressionDelta: numberField(record, ["impressionDelta", "delta", "impression growth"]),
      engagementType: fieldValue(record, ["engagementType", "engagement", "action"]) || "engagement",
      engagerName: fieldValue(record, ["engagerName", "name", "person", "lead"]),
      engagerTitle: fieldValue(record, ["engagerTitle", "title", "role"]),
      engagerCompany: fieldValue(record, ["engagerCompany", "company", "account"]),
      engagerProfileUrl: fieldValue(record, ["engagerProfileUrl", "profile", "profileUrl", "linkedinUrl"]),
      accountUrl: fieldValue(record, ["accountUrl", "companyUrl", "linkedinCompanyUrl"]),
      notes: fieldValue(record, ["notes", "note", "context"]),
      sourceUrl: fieldValue(record, ["sourceUrl", "source link"]) || fieldValue(record, ["postUrl", "post link", "url"]),
      raw: { line, record },
    };
  });
}

function parseRows(value: unknown): LinkedInEngagementRow[] {
  if (Array.isArray(value)) return value as LinkedInEngagementRow[];
  if (typeof value === "string") return parseDelimitedRows(value);
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
