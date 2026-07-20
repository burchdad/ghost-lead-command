import { NextResponse } from "next/server";
import { runVegaDominanceLoop } from "@/lib/vega-dominance-loop";

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.LEAD_COMMAND_ACCESS_KEY;
  if (!secret) return true;
  const url = new URL(request.url);
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || url.searchParams.get("token") === secret;
}

function boolParam(value: string | null) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const result = await runVegaDominanceLoop({
      instruction: url.searchParams.get("instruction") || "Vega dominance loop",
      autoApprove: boolParam(url.searchParams.get("autoApprove")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega dominance loop failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runVegaDominanceLoop({
      instruction: body.instruction ? String(body.instruction) : "Vega dominance loop",
      autoApprove: typeof body.autoApprove === "boolean" ? body.autoApprove : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Vega dominance loop failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

