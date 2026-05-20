import { createAutomationEvent } from "@/lib/automation";
import { escapeXml, readTwilioForm, twimlResponse } from "@/lib/twiml";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);
  const from = payload.From || "unknown caller";
  const to = payload.To || "Ghost AI Solutions";

  await createAutomationEvent({
    title: "Twilio voice request",
    detail: `Voice webhook received from ${from} to ${to}.`,
    status: "done",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  const greeting = escapeXml(
    process.env.TWILIO_VOICE_GREETING ||
      "Thanks for calling Ghost AI Solutions. Your call has reached the lead command voice handler. Please leave a message after the tone.",
  );

  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${greeting}</Say>
  <Record maxLength="120" playBeep="true" transcribe="true" />
  <Say voice="alice">Thanks. We received your message.</Say>
  <Hangup />
</Response>`);
}

export async function GET() {
  return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Ghost Lead Command voice webhook is online.</Say>
</Response>`);
}
