import { NextResponse } from "next/server";
import { briefNovaCeoAgent } from "@/lib/mission-control-bridge";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await briefNovaCeoAgent({
      message: body.message ? String(body.message) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Nova briefing failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
