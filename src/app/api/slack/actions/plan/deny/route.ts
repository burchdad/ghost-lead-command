import { NextResponse } from "next/server";
import { sendAgentPlan } from "@/lib/autopilot";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const niche = url.searchParams.get("niche") || "";
  await sendAgentPlan({
    exclude: niche ? [niche] : [],
    source: "reroll",
  });

  const destination = new URL("/?view=readiness", url.origin);
  destination.searchParams.set("slackAction", "plan_rerolled");
  return NextResponse.redirect(destination);
}
