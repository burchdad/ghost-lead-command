import { NextResponse } from "next/server";
import { listLinkedInEvents } from "@/lib/linkedin-products";

function boolParam(value: string | null) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await listLinkedInEvents({
      count: url.searchParams.get("count") ? Number(url.searchParams.get("count")) : undefined,
      start: url.searchParams.get("start") ? Number(url.searchParams.get("start")) : undefined,
      leadGenOnly: boolParam(url.searchParams.get("leadGenOnly")),
      lifeCycleState: (url.searchParams.get("lifeCycleState") || undefined) as "UPCOMING" | "ONGOING" | "PAST" | undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      { error: "LinkedIn Events check failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
