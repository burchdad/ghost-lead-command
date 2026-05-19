import { NextResponse } from "next/server";
import { getGhostCrmStatus } from "@/lib/ghostcrm";

export async function GET() {
  return NextResponse.json({ ghostcrm: getGhostCrmStatus() });
}
