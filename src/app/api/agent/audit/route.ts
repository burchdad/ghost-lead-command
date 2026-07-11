import { NextResponse } from "next/server";
import { runLeadCommandAudit } from "@/lib/lead-command-audit";

function boolParam(value: string | null) {
  if (!value) return false;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await runLeadCommandAudit({
      postToSlack: boolParam(url.searchParams.get("slack")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Lead Command audit failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLeadCommandAudit({
      postToSlack: body.postToSlack !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Lead Command audit failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
