import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { sendSms } from "@/lib/outreach";

function clean(value: string | undefined) {
  return value?.trim() || "";
}

export async function POST() {
  const to = clean(process.env.TWILIO_TEST_TO) || clean(process.env.OWNER_PHONE_NUMBER);

  if (!to) {
    return NextResponse.json(
      { error: "Missing TWILIO_TEST_TO or OWNER_PHONE_NUMBER" },
      { status: 400 },
    );
  }

  const delivery = await sendSms({
    to,
    provider: "twilio",
    text: "Ghost AI Solutions: Lead Command Twilio readiness test. Reply STOP to opt out.",
  });

  await createAutomationEvent({
    title: "Twilio test SMS",
    detail: delivery.dryRun
      ? "Twilio test queued in dry-run mode."
      : `Twilio test ${delivery.status}.`,
    status: delivery.status === "failed" ? "blocked" : "done",
    type: "twilio",
    payload: delivery,
  }).catch(() => undefined);

  return NextResponse.json({ delivery }, { status: delivery.status === "failed" ? 502 : 200 });
}
