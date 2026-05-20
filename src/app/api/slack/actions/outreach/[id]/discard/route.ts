import { NextResponse } from "next/server";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const response = await fetch(new URL(`/api/outreach/queue/${id}/reject`, url.origin), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Discarded from Slack approval." }),
  });

  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", response.ok ? "discarded" : "discard_failed");
  return NextResponse.redirect(destination);
}
