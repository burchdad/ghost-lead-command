import { NextResponse } from "next/server";
import { isLeadCommandRequestAuthorized } from "@/lib/access";
import { getWaitlistDashboard } from "@/lib/waitlist";

export async function GET(request: Request) {
  if (!(await isLeadCommandRequestAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getWaitlistDashboard());
  } catch (error) {
    return NextResponse.json(
      { error: "Vega waitlist unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
