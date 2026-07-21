import { NextResponse } from "next/server";
import { approveAgentPlan, campaignNameFor, type AgentPlan } from "@/lib/autopilot";
import { isSlackActionAuthorized } from "@/lib/slack";
import type { SourceProvider } from "@/lib/sourcing";

function parseProvider(value: string | null): SourceProvider {
  if (value === "google-maps" || value === "ghost-lead-agent" || value === "pdl") return value;
  return "pdl";
}

function planFromUrl(url: URL): AgentPlan {
  const industries = url.searchParams.getAll("industries").filter(Boolean);
  const niche = url.searchParams.get("niche") || "Roofing";
  const location = url.searchParams.get("location") || "United States";
  const partnerService = url.searchParams.get("partnerService") || undefined;
  return {
    provider: parseProvider(url.searchParams.get("provider")),
    niche,
    query: url.searchParams.get("query") || `owners and operators of ${niche.toLowerCase()} companies`,
    location,
    industries: industries.length ? industries : [niche],
    minScore: Number(url.searchParams.get("minScore") || 80),
    queueLimit: Number(url.searchParams.get("queueLimit") || 5),
    size: Number(url.searchParams.get("size") || 15),
    partnerService,
    campaignName: campaignNameFor({ niche, location, partnerService, source: "slack-command" }),
    rationale: ["Approved from Slack."],
    source: "slack-command",
  };
}

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await approveAgentPlan(planFromUrl(url), { autoSend: true });

  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", `plan_approved_${result.queued}_queued`);
  return NextResponse.redirect(destination);
}
