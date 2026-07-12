import { NextResponse } from "next/server";
import { runAdaptiveLearningLoop } from "@/lib/adaptive-learning";
import { computeConversionLearning } from "@/lib/conversion-learning";

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}

export async function GET() {
  try {
    return NextResponse.json(await computeConversionLearning());
  } catch (error) {
    return NextResponse.json(
      { error: "Adaptive learning readout unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await runAdaptiveLearningLoop({
      activate: body.activate == null ? true : boolValue(body.activate),
      limit: body.limit ? Number(body.limit) : undefined,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: "Adaptive learning loop failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
