import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { readTwilioForm } from "@/lib/twiml";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);
  const callStatus = payload.CallStatus || payload.CallSid || "status update";

  await createAutomationEvent({
    title: "Twilio voice status",
    detail: `Voice call ${callStatus}.`,
    status: "done",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "twilio-voice-status" });
}
