import { NextResponse } from "next/server";
import { runVegaConversionAudit } from "@/lib/conversion-audit";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") || 7);
    return NextResponse.json(await runVegaConversionAudit({ days }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega conversion audit failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { days?: number };
    return NextResponse.json(await runVegaConversionAudit({ days: body.days }));
  } catch (error) {
    return NextResponse.json(
      { error: "Vega conversion audit failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
