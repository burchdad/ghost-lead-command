import { NextResponse } from "next/server";
import { runLeadCommandAgent } from "@/lib/agent";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const industries = url.searchParams.getAll("industries");
  const result = await runLeadCommandAgent({
    provider: "pdl",
    query: url.searchParams.get("query") || undefined,
    location: url.searchParams.get("location") || undefined,
    industries: industries.length ? industries : undefined,
    minScore: Number(url.searchParams.get("minScore") || 80),
    queueLimit: Number(url.searchParams.get("queueLimit") || 5),
    size: Number(url.searchParams.get("size") || 15),
  });

  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", `niche_approved_${result.queued}_queued`);
  return NextResponse.redirect(destination);
}
