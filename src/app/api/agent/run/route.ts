import { NextResponse } from "next/server";
import { runLeadCommandAgent } from "@/lib/agent";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLeadCommandAgent({
      provider: body.provider === "ghost-lead-agent" ? "ghost-lead-agent" : "pdl",
      query: body.query ? String(body.query) : undefined,
      location: body.location ? String(body.location) : undefined,
      industries: Array.isArray(body.industries) ? body.industries.map(String) : undefined,
      titles: Array.isArray(body.titles) ? body.titles.map(String) : undefined,
      size: body.size ? Number(body.size) : undefined,
      minScore: body.minScore ? Number(body.minScore) : undefined,
      queueLimit: body.queueLimit ? Number(body.queueLimit) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "AI operator run failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
