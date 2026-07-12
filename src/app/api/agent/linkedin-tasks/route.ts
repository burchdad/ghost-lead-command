import { NextResponse } from "next/server";
import { runLinkedInTaskLane } from "@/lib/linkedin-task-lane";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await runLinkedInTaskLane({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "LinkedIn task lane failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLinkedInTaskLane({
      limit: body.limit ? Number(body.limit) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "LinkedIn task lane failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
