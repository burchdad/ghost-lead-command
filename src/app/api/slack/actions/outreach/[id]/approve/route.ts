import { NextResponse } from "next/server";
import { approveOutreachQueueItem } from "@/lib/approval";
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
  const result = await approveOutreachQueueItem(id);

  const delivery = result.ok ? result.body.delivery : null;
  const isManual = delivery?.channel === "manual";
  return slackActionClosePage(
    result.ok ? "Vega approved outreach" : "Vega approval failed",
    result.ok
      ? isManual
        ? "Manual contact task approved. No SendGrid email was sent. You can close this tab."
        : `Delivery: ${delivery?.dryRun ? "dry-run queued" : delivery?.status || "sent"}. You can close this tab.`
      : result.body.error || "Approval failed.",
  );
}
