import { NextResponse } from "next/server";
import { getSourcingStatus, searchFreshLeads, type SourceProvider } from "@/lib/sourcing";

export async function GET() {
  return NextResponse.json(getSourcingStatus());
}

export async function POST(request: Request) {
  const body = await request.json();
  const provider = String(body.provider || "pdl") as SourceProvider;

  if (provider !== "pdl" && provider !== "ghost-lead-agent" && provider !== "google-maps") {
    return NextResponse.json({ error: "provider must be pdl, ghost-lead-agent, or google-maps" }, { status: 400 });
  }

  const result = await searchFreshLeads({
    provider,
    query: String(body.query || "owner local services"),
    location: body.location ? String(body.location) : undefined,
    titles: Array.isArray(body.titles) ? body.titles.map(String) : [],
    industries: Array.isArray(body.industries) ? body.industries.map(String) : [],
    size: Number(body.size || 25),
    scrollToken: body.scrollToken ? String(body.scrollToken) : undefined,
  });

  return NextResponse.json(result);
}
