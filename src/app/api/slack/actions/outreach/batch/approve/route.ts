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

  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui,sans-serif;margin:32px"><h1>Vega batch approval complete</h1><p>Approved ${result.approved}/${result.attempted}. Failed: ${result.failed}.</p><p>You can close this tab. New Vega audit buttons will approve directly inside Slack once Slack Interactivity points to <code>/api/slack/interactions</code>.</p><script>window.close();</script></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
