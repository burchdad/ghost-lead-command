import { NextResponse } from "next/server";
import { redoOutreachQueueItem } from "@/lib/approval";
import { slackActionClosePage } from "@/lib/slack-action-page";
import { isSlackActionAuthorized, notifySlackOutreachApproval } from "@/lib/slack";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await redoOutreachQueueItem(id);
  if (result.ok) {
    await notifySlackOutreachApproval(result.body.item);
  }

  return slackActionClosePage(
    result.ok ? "Vega rewrote outreach" : "Vega rewrite failed",
    result.ok
      ? "A fresh approval card was posted in Slack. You can close this tab."
      : result.body.error || "Rewrite failed.",
  );
}
