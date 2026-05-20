import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { readTwilioForm } from "@/lib/twiml";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);

  await createAutomationEvent({
    title: "Twilio messaging fallback",
    detail: `Fallback messaging handler triggered${payload.ErrorCode ? ` with ${payload.ErrorCode}` : ""}.`,
    status: "blocked",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "twilio-messaging-fallback" });
}
