import { NextResponse } from "next/server";
import { approvePendingOutreachBatch } from "@/lib/approval";
import { isSlackActionAuthorized } from "@/lib/slack";

export async function GET(request: Request) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await approvePendingOutreachBatch({
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });

  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", `batch_approved_${result.approved}_failed_${result.failed}`);
  return NextResponse.redirect(destination);
}
