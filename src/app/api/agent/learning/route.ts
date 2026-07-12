import { NextResponse } from "next/server";
import { computeConversionLearning } from "@/lib/conversion-learning";

export async function GET() {
  try {
    return NextResponse.json(await computeConversionLearning());
  } catch (error) {
    return NextResponse.json(
      { error: "Learning loop unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
