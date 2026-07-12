import { NextResponse } from "next/server";
import { runAdaptiveLearningLoop } from "@/lib/adaptive-learning";
import { computeConversionLearning } from "@/lib/conversion-learning";

export async function GET() {
  try {
    const learning = await computeConversionLearning();
    return NextResponse.json({
      summary: learning.summary,
      recommendedPlays: learning.summary.recommendedPlayIds,
      recommendation: learning.recommendations.join(" "),
      nextActions: learning.nextActions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Tuning readout unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json(await runAdaptiveLearningLoop({ activate: true }));
  } catch (error) {
    return NextResponse.json(
      { error: "Self-tuning failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
