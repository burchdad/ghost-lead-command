import { NextResponse } from "next/server";
import { rejectOutreachQueueItem } from "@/lib/approval";
import { slackActionClosePage } from "@/lib/slack-action-page";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await rejectOutreachQueueItem(id, "Discarded from Slack approval.");
  return slackActionClosePage(
    result.ok ? "Vega rejected outreach" : "Vega reject failed",
    result.ok ? "The queue item was rejected. You can close this tab." : result.body.error || "Reject failed.",
  );
}
