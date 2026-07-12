import { NextResponse } from "next/server";
import { parseClosingSprintInstruction, runVegaClosingSprint } from "@/lib/vega-closing-sprint";

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
    const instruction = url.searchParams.get("instruction") || "Vega closing sprint for 10 closes this week";
    const result = await runVegaClosingSprint(parseClosingSprintInstruction(instruction));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega closing sprint failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const instruction = body.instruction ? String(body.instruction) : "Vega closing sprint for 10 closes this week";
    const parsed = parseClosingSprintInstruction(instruction);
    const result = await runVegaClosingSprint({
      ...parsed,
      autoApprove: typeof body.autoApprove === "boolean" ? body.autoApprove : parsed.autoApprove,
      queueLimit: body.queueLimit ? Number(body.queueLimit) : parsed.queueLimit,
      location: body.location ? String(body.location) : parsed.location,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega closing sprint failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
