import { NextResponse } from "next/server";
import { getSourcingStatus, searchFreshLeads, type SourceProvider } from "@/lib/sourcing";
import { getPrisma } from "@/lib/prisma";
import { callSourceDecision } from "@/lib/call-source-policy";

export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(getSourcingStatus());
}

export async function POST(request: Request) {
  const body = await request.json();
  const provider = String(body.provider || "pdl") as SourceProvider;
  const callReady = body.mode === "call-ready";
  const workspace = callReady && typeof body.workspaceSlug === "string"
    ? await getPrisma().workspace.findUnique({ where: { slug: body.workspaceSlug } }) : null;
  if (callReady && !workspace) {
    return NextResponse.json({ error: "A mapped Vega workspace is required for call-ready sourcing and suppression checks." }, { status: 422 });
  }
  const size = Number(body.size ?? 25);
  if (!Number.isInteger(size) || size < 1 || size > 100) {
    return NextResponse.json({ error: "size must be an integer from 1 to 100" }, { status: 400 });
  }

  if (provider !== "pdl" && provider !== "apollo" && provider !== "ghost-lead-agent" && provider !== "google-maps" && provider !== "facebook-business") {
    return NextResponse.json({ error: "provider must be pdl, apollo, ghost-lead-agent, google-maps, or facebook-business" }, { status: 400 });
  }

  const result = await searchFreshLeads({
    provider,
    query: String(body.query || "owner local services"),
    location: body.location ? String(body.location) : undefined,
    locations: Array.isArray(body.locations) ? body.locations.map(String) : undefined,
    titles: Array.isArray(body.titles) ? body.titles.map(String) : [],
    industries: Array.isArray(body.industries) ? body.industries.map(String) : [],
    size,
    mode: callReady ? "call-ready" : undefined,
    scrollToken: body.scrollToken ? String(body.scrollToken) : undefined,
  });

  if (!callReady || !workspace) return NextResponse.json(result);
  const suppressions = await getPrisma().suppressionRecord.findMany({
    where: { workspaceId: workspace.id }, select: { type: true, value: true },
  });
  const skipped: Record<string, number> = {};
  const candidates = [...result.leads, ...("reviewLeads" in result ? result.reviewLeads || [] : [])];
  const seen = new Set<string>();
  const leads = candidates.filter((lead) => {
    const decision = callSourceDecision(lead, suppressions);
    if (decision !== "call-ready") { skipped[decision] = (skipped[decision] || 0) + 1; return false; }
    if (seen.has(lead.id)) return false;
    seen.add(lead.id);
    return true;
  }).map((lead) => ({
    ...lead,
    // An email suppression never becomes permission to email a callable business.
    email: suppressions.some((record) => record.type === "email" && record.value.toLowerCase() === lead.email.toLowerCase()) ? "" : lead.email,
  }));
  return NextResponse.json({ ...result, leads, reviewLeads: [], diagnostics: { ...("diagnostics" in result ? result.diagnostics : {}), skipped } });
}
