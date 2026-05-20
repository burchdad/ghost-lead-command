import { NextResponse } from "next/server";
import { sendDailyNicheRecommendation } from "@/lib/agent";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const exclude = url.searchParams.getAll("exclude").filter(Boolean);
  await sendDailyNicheRecommendation({ exclude });

  const destination = new URL("/?view=readiness", url.origin);
  destination.searchParams.set("slackAction", "niche_denied_new_option_sent");
  return NextResponse.redirect(destination);
}
