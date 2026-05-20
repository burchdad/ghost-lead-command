import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { escapeXml, readTwilioForm } from "@/lib/twiml";

export const runtime = "nodejs";

function messagingResponse(message?: string) {
  const body = message ? `\n  <Message>${escapeXml(message)}</Message>` : "";
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>${body}
</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);
  const from = payload.From || "unknown sender";
  const body = payload.Body || "";

  await createAutomationEvent({
    title: "Twilio inbound SMS",
    detail: `Inbound SMS from ${from}${body ? `: ${body.slice(0, 120)}` : ""}`,
    status: "done",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  const autoReply = process.env.TWILIO_MESSAGING_AUTO_REPLY || "";
  return messagingResponse(autoReply);
}

export async function GET() {
  return messagingResponse("Ghost Lead Command messaging webhook is online.");
}
