import { NextResponse } from "next/server";
import { getWaitlistDashboard } from "@/lib/waitlist";

export async function GET() {
  try {
    return NextResponse.json(await getWaitlistDashboard());
  } catch (error) {
    return NextResponse.json(
      { error: "Vega waitlist unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
