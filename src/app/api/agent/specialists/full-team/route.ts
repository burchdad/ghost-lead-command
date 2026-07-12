import { NextResponse } from "next/server";
import { runVegaSpecialist } from "@/lib/vega-specialists";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runVegaSpecialist("full-team", { limit: 10 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega specialist team failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
