import assert from "node:assert/strict";
import test from "node:test";
import { POST as sms, GET as smsGet } from "../app/api/twilio/messaging/route";
import { POST as smsStatus, GET as smsStatusGet } from "../app/api/twilio/messaging/status/route";
import { POST as smsFallback, GET as smsFallbackGet } from "../app/api/twilio/messaging/fallback/route";
import { POST as voice, GET as voiceGet } from "../app/api/twilio/voice/route";
import { POST as voiceStatus, GET as voiceStatusGet } from "../app/api/twilio/voice/status/route";
import { POST as voiceFallback, GET as voiceFallbackGet } from "../app/api/twilio/voice/fallback/route";
import { POST as testSend } from "../app/api/twilio/test/route";
import { sendSms, getOutreachStatus, getTwilioReadiness } from "./outreach";

test("all retired callback methods and test sends return Gone without configuration", async () => {
  for (const handler of [sms, smsGet, smsStatus, smsStatusGet, smsFallback, smsFallbackGet, voice, voiceGet, voiceStatus, voiceStatusGet, voiceFallback, voiceFallbackGet, testSend]) {
    assert.equal((await handler()).status, 410);
  }
});
test("Twilio sends fail closed without a network request, even in live mode", async () => {
  const names = ["OUTREACH_SEND_MODE", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "SMS_PROVIDER"] as const;
  const previous = names.map(name => process.env[name]);
  const fetcher = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected network request"); };
  Object.assign(process.env, { OUTREACH_SEND_MODE: "live", TWILIO_ACCOUNT_SID: "fixture", TWILIO_AUTH_TOKEN: "fixture", TWILIO_FROM_NUMBER: "+15551234567", SMS_PROVIDER: "twilio" });
  try {
    assert.equal(getOutreachStatus().twilioConfigured, false);
    assert.equal(getTwilioReadiness().retired, true);
    const explicit = await sendSms({ to: "+15557654321", text: "Fixture only", provider: "twilio" });
    const selected = await sendSms({ to: "+15557654321", text: "Fixture only" });
    assert.equal(explicit.status, "failed");
    assert.equal(selected.status, "failed");
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetcher;
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
