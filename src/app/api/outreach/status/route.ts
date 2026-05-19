import { NextResponse } from "next/server";
import { getOutreachStatus } from "@/lib/outreach";

export async function GET() {
  return NextResponse.json(getOutreachStatus());
}
