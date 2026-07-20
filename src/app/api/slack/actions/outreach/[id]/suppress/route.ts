import { NextResponse } from "next/server";
import { suppressOutreachQueueItem } from "@/lib/approval";
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
  const result = await suppressOutreachQueueItem(id);
  return slackActionClosePage(
    result.ok ? "Vega suppressed lead" : "Vega suppress failed",
    result.ok
      ? `Suppression records added: ${result.body.suppressed}. You can close this tab.`
      : result.body.error || "Suppress failed.",
  );
}
