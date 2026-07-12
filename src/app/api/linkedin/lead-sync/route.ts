import { NextResponse } from "next/server";
import { getLinkedInLeadSyncReadiness } from "@/lib/linkedin-products";

export async function GET() {
  const result = await getLinkedInLeadSyncReadiness();
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}

export async function POST() {
  const result = await getLinkedInLeadSyncReadiness();
  if (!result.ok) {
    return NextResponse.json(
      {
        ...result,
        imported: 0,
        queued: 0,
        reason: "Lead Sync is under LinkedIn review. Once approved, this route can be upgraded from readiness check to response ingestion.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ...result,
    imported: 0,
    queued: 0,
    reason: "Lead Sync is approved, but form-response field mapping has not been selected yet.",
  });
}
