import { NextResponse } from "next/server";
import { runLeadCommandAgent } from "@/lib/agent";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function boolParam(value: string | null) {
  if (!value) return undefined;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

function parseProvider(value: unknown) {
  return value === "ghost-lead-agent" || value === "google-maps" ? value : "pdl";
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runLeadCommandAgent({
      provider: parseProvider(url.searchParams.get("provider")),
      query: url.searchParams.get("query") || undefined,
      location: url.searchParams.get("location") || undefined,
      locations: url.searchParams.get("locations")?.split("|").map((item) => item.trim()).filter(Boolean),
      industries: url.searchParams.get("industries")?.split(",").map((item) => item.trim()).filter(Boolean),
      titles: url.searchParams.get("titles")?.split(",").map((item) => item.trim()).filter(Boolean),
      size: url.searchParams.get("size") ? Number(url.searchParams.get("size")) : undefined,
      minScore: url.searchParams.get("minScore") ? Number(url.searchParams.get("minScore")) : undefined,
      queueLimit: url.searchParams.get("queueLimit") ? Number(url.searchParams.get("queueLimit")) : undefined,
      autoSend: boolParam(url.searchParams.get("autoSend")),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "AI operator run failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLeadCommandAgent({
      provider: parseProvider(body.provider),
      query: body.query ? String(body.query) : undefined,
      location: body.location ? String(body.location) : undefined,
      locations: Array.isArray(body.locations) ? body.locations.map(String) : undefined,
      industries: Array.isArray(body.industries) ? body.industries.map(String) : undefined,
      titles: Array.isArray(body.titles) ? body.titles.map(String) : undefined,
      size: body.size ? Number(body.size) : undefined,
      minScore: body.minScore ? Number(body.minScore) : undefined,
      queueLimit: body.queueLimit ? Number(body.queueLimit) : undefined,
      autoSend: typeof body.autoSend === "boolean" ? body.autoSend : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "AI operator run failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
