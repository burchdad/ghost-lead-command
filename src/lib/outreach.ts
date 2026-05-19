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

export function getOutreachStatus() {
  const sendgridConfigured = Boolean(
    clean(process.env.SENDGRID_API_KEY) && clean(process.env.SENDGRID_FROM_EMAIL),
  );
  const telnyxConfigured = Boolean(
    clean(process.env.TELNYX_API_KEY) && clean(process.env.TELNYX_FROM_NUMBER),
  );
  const twilioConfigured = Boolean(
    clean(process.env.TWILIO_ACCOUNT_SID) &&
      clean(process.env.TWILIO_AUTH_TOKEN) &&
      clean(process.env.TWILIO_FROM_NUMBER),
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
  const fromEmail = clean(process.env.SENDGRID_FROM_EMAIL);

  if (status.mode !== "live" || !status.sendgridConfigured) {
    return {
      status: "queued",
      provider: "sendgrid",
      channel: "email",
      dryRun: true,
      message: "Email queued in dry-run mode. Add SendGrid env vars and set OUTREACH_SEND_MODE=live to send.",
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
      subject: input.subject,
      content: [{ type: "text/plain", value: input.text }],
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

  if (status.mode !== "live" || !status.telnyxConfigured) {
    return {
      status: "queued",
      provider: "telnyx",
      channel: "sms",
      dryRun: true,
      message: "SMS queued in dry-run mode. Add Telnyx env vars and set OUTREACH_SEND_MODE=live to send.",
    };
  }

  const payload: Record<string, string> = {
    from: clean(process.env.TELNYX_FROM_NUMBER),
    to: input.to,
    text: input.text,
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

  if (status.mode !== "live" || !status.twilioConfigured) {
    return {
      status: "queued",
      provider: "twilio",
      channel: "sms",
      dryRun: true,
      message: "SMS queued in dry-run mode. Add Twilio env vars and set OUTREACH_SEND_MODE=live to send.",
    };
  }

  const accountSid = clean(process.env.TWILIO_ACCOUNT_SID);
  const token = clean(process.env.TWILIO_AUTH_TOKEN);
  const params = new URLSearchParams({
    From: clean(process.env.TWILIO_FROM_NUMBER),
    To: input.to,
    Body: input.text,
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
