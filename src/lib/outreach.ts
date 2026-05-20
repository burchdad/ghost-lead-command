import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";

type SmsProvider = "telnyx" | "twilio";
type DeliveryStatus = "queued" | "sent" | "failed";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type SendSmsInput = {
  to: string;
  text: string;
  provider?: SmsProvider;
};

export type DeliveryResult = {
  status: DeliveryStatus;
  provider: "sendgrid" | SmsProvider;
  channel: "email" | "sms";
  dryRun: boolean;
  message?: string;
  providerId?: string;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function isLiveMode() {
  return clean(process.env.OUTREACH_SEND_MODE).toLowerCase() === "live";
}

function preferredSmsProvider(): SmsProvider {
  return clean(process.env.SMS_PROVIDER).toLowerCase() === "twilio" ? "twilio" : "telnyx";
}

function sendgridFromEmail() {
  return clean(process.env.SENDGRID_FROM_EMAIL) || clean(process.env.SENDGRID_FROM);
}

function telnyxFromNumber() {
  return clean(process.env.TELNYX_FROM_NUMBER) || clean(process.env.TELNYX_PHONE_NUMBER);
}

function twilioFromNumber() {
  return clean(process.env.TWILIO_FROM_NUMBER) || clean(process.env.TWILIO_PHONE_NUMBER);
}

export function getTwilioReadiness() {
  const status = getOutreachStatus();
  return {
    configured: status.twilioConfigured,
    preferred: status.smsProvider === "twilio",
    fromNumber: twilioFromNumber() ? "configured" : "missing",
    accountSid: clean(process.env.TWILIO_ACCOUNT_SID) ? "configured" : "missing",
    authToken: clean(process.env.TWILIO_AUTH_TOKEN) ? "configured" : "missing",
    testTo: clean(process.env.TWILIO_TEST_TO) || clean(process.env.OWNER_PHONE_NUMBER) ? "configured" : "missing",
    a2pStatus: clean(process.env.TWILIO_A2P_STATUS) || "pending",
    voiceWebhook: "configured",
    messagingWebhook: "configured",
  };
}

export function getOutreachStatus() {
  const sendgridConfigured = Boolean(
    clean(process.env.SENDGRID_API_KEY) && sendgridFromEmail(),
  );
  const telnyxConfigured = Boolean(
    clean(process.env.TELNYX_API_KEY) && telnyxFromNumber(),
  );
  const twilioConfigured = Boolean(
    clean(process.env.TWILIO_ACCOUNT_SID) &&
      clean(process.env.TWILIO_AUTH_TOKEN) &&
      twilioFromNumber(),
  );

  return {
    mode: isLiveMode() ? "live" : "dry-run",
    smsProvider: preferredSmsProvider(),
    sendgridConfigured,
    telnyxConfigured,
    twilioConfigured,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<DeliveryResult> {
  const status = getOutreachStatus();
  const fromEmail = sendgridFromEmail();
  const subject = sanitizeSubject(input.subject);
  const text = sanitizeCustomerMessage(input.text, { channel: "email" });

  if (status.mode !== "live" || !status.sendgridConfigured) {
    return {
      status: "queued",
      provider: "sendgrid",
      channel: "email",
      dryRun: true,
      message: status.sendgridConfigured
        ? "Email queued in dry-run mode. Set OUTREACH_SEND_MODE=live when you are ready to send."
        : "Email queued in dry-run mode. Add SendGrid env vars before live sending.",
    };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clean(process.env.SENDGRID_API_KEY)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: {
        email: fromEmail,
        name: clean(process.env.SENDGRID_FROM_NAME) || "Ghost AI Solutions",
      },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!response.ok) {
    return {
      status: "failed",
      provider: "sendgrid",
      channel: "email",
      dryRun: false,
      message: `SendGrid returned ${response.status}.`,
    };
  }

  return {
    status: "sent",
    provider: "sendgrid",
    channel: "email",
    dryRun: false,
    providerId: response.headers.get("x-message-id") || undefined,
  };
}

export async function sendSms(input: SendSmsInput): Promise<DeliveryResult> {
  const provider = input.provider || preferredSmsProvider();
  if (provider === "twilio") return sendTwilioSms(input);
  return sendTelnyxSms(input);
}

async function sendTelnyxSms(input: SendSmsInput): Promise<DeliveryResult> {
  const status = getOutreachStatus();
  const text = sanitizeCustomerMessage(input.text, { channel: "sms" });

  if (status.mode !== "live" || !status.telnyxConfigured) {
    return {
      status: "queued",
      provider: "telnyx",
      channel: "sms",
      dryRun: true,
      message: status.telnyxConfigured
        ? "SMS queued in dry-run mode. Set OUTREACH_SEND_MODE=live when you are ready to send."
        : "SMS queued in dry-run mode. Add Telnyx env vars before live sending.",
    };
  }

  const payload: Record<string, string> = {
    from: telnyxFromNumber(),
    to: input.to,
    text,
  };
  const messagingProfileId = clean(process.env.TELNYX_MESSAGING_PROFILE_ID);
  if (messagingProfileId) payload.messaging_profile_id = messagingProfileId;

  const response = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clean(process.env.TELNYX_API_KEY)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return {
      status: "failed",
      provider: "telnyx",
      channel: "sms",
      dryRun: false,
      message: `Telnyx returned ${response.status}.`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { data?: { id?: string } };
  return {
    status: "sent",
    provider: "telnyx",
    channel: "sms",
    dryRun: false,
    providerId: data.data?.id,
  };
}

async function sendTwilioSms(input: SendSmsInput): Promise<DeliveryResult> {
  const status = getOutreachStatus();
  const text = sanitizeCustomerMessage(input.text, { channel: "sms" });

  if (status.mode !== "live" || !status.twilioConfigured) {
    return {
      status: "queued",
      provider: "twilio",
      channel: "sms",
      dryRun: true,
      message: status.twilioConfigured
        ? "SMS queued in dry-run mode. Set OUTREACH_SEND_MODE=live when you are ready to send."
        : "SMS queued in dry-run mode. Add Twilio env vars before live sending.",
    };
  }

  const accountSid = clean(process.env.TWILIO_ACCOUNT_SID);
  const token = clean(process.env.TWILIO_AUTH_TOKEN);
  const params = new URLSearchParams({
    From: twilioFromNumber(),
    To: input.to,
    Body: text,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  if (!response.ok) {
    return {
      status: "failed",
      provider: "twilio",
      channel: "sms",
      dryRun: false,
      message: `Twilio returned ${response.status}.`,
    };
  }

  const data = (await response.json().catch(() => ({}))) as { sid?: string };
  return {
    status: "sent",
    provider: "twilio",
    channel: "sms",
    dryRun: false,
    providerId: data.sid,
  };
}
