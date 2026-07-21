import { NextResponse } from "next/server";
import { runVegaProductionProof } from "@/lib/production-proof";

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
    const url = new URL(request.url);
    const result = await runVegaProductionProof({
      instruction: url.searchParams.get("instruction") || "scheduled production proof loop",
      postToSlack: url.searchParams.get("slack") !== "false",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Production proof loop failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runVegaProductionProof({
      instruction: body.instruction ? String(body.instruction) : "production proof loop",
      postToSlack: body.postToSlack !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Production proof loop failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
