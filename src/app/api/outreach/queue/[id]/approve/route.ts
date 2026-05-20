import { NextResponse } from "next/server";
import { approveOutreachQueueItem } from "@/lib/approval";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await approveOutreachQueueItem(id, {
    subject: body.subject ? String(body.subject) : undefined,
    body: body.body ? String(body.body) : undefined,
  });

  return NextResponse.json(result.body, { status: result.status });
}
