import { NextResponse } from "next/server";
import { recordCallAssistOutcome, type CallAssistOutcome } from "@/lib/call-assist";

const allowedOutcomes = new Set<CallAssistOutcome>([
  "called",
  "no_answer",
  "voicemail_left",
  "gatekeeper",
  "wrong_person",
  "callback_requested",
  "interested",
  "send_information",
  "meeting_requested",
  "meeting_booked",
  "not_interested",
  "suppress",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const outcome = String(body.outcome || "") as CallAssistOutcome;

  if (!allowedOutcomes.has(outcome)) {
    return NextResponse.json({ error: "Unsupported call outcome" }, { status: 400 });
  }

  const result = await recordCallAssistOutcome({
    queueItemId: id,
    outcome,
    note: body.note ? String(body.note) : undefined,
    callbackAt: body.callbackAt ? String(body.callbackAt) : undefined,
  });

  return NextResponse.json(result.body, { status: result.status });
}
