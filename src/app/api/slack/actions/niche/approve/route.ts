import { NextResponse } from "next/server";
import { approveAgentPlan } from "@/lib/autopilot";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const industries = url.searchParams.getAll("industries");
  const niche = url.searchParams.get("niche") || "Recommended niche";
  const result = await approveAgentPlan({
    provider: "pdl",
    niche,
    query: url.searchParams.get("query") || `owners and operators of ${niche.toLowerCase()} companies`,
    location: url.searchParams.get("location") || "United States",
    industries: industries.length ? industries : [niche],
    minScore: Number(url.searchParams.get("minScore") || 80),
    queueLimit: Number(url.searchParams.get("queueLimit") || 5),
    size: Number(url.searchParams.get("size") || 15),
    rationale: ["Approved from Slack niche recommendation."],
    source: "daily",
  });

  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", `niche_approved_${result.queued}_queued`);
  return NextResponse.redirect(destination);
}
