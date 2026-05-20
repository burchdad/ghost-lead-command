import { NextResponse } from "next/server";
import { approveOutreachQueueItem } from "@/lib/approval";
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
  const result = await approveOutreachQueueItem(id);

  const destination = new URL("/?view=queue", url.origin);
  const delivery = result.ok ? result.body.delivery : null;
  destination.searchParams.set(
    "slackAction",
    result.ok ? `approved_${delivery?.dryRun ? "queued" : delivery?.status || "sent"}` : "approval_failed",
  );
  return NextResponse.redirect(destination);
}
