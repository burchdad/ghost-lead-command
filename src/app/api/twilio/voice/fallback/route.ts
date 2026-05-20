import { createAutomationEvent } from "@/lib/automation";
import { readTwilioForm, twimlResponse } from "@/lib/twiml";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);

  await createAutomationEvent({
    title: "Twilio voice fallback",
    detail: `Fallback voice handler triggered${payload.ErrorCode ? ` with ${payload.ErrorCode}` : ""}.`,
    status: "blocked",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We could not connect the call handler. Please try again shortly.</Say>
  <Hangup />
</Response>`);
}

export async function GET() {
  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Ghost Lead Command voice fallback is online.</Say>
</Response>`);
}
