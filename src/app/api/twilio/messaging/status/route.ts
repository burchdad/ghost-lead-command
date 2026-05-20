import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { readTwilioForm } from "@/lib/twiml";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readTwilioForm(request);
  const messageStatus = payload.MessageStatus || payload.SmsStatus || payload.MessageSid || "status update";

  await createAutomationEvent({
    title: "Twilio SMS status",
    detail: `SMS ${messageStatus}.`,
    status: messageStatus === "failed" || messageStatus === "undelivered" ? "blocked" : "done",
    type: "twilio",
    payload,
  }).catch(() => undefined);

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "twilio-messaging-status" });
}
