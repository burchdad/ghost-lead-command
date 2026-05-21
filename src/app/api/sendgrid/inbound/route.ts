import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { recordInboundReply } from "@/lib/replies";

export const runtime = "nodejs";

function inboundAuthorized(request: Request) {
  const secret = (process.env.SENDGRID_INBOUND_SECRET || process.env.CRON_SECRET || "").trim();
  if (!secret) return true;

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-lead-command-token") || "";
  return token === secret;
}

function stripQuotedReply(value: string) {
  return value
    .split(/\nOn .+ wrote:\n/i)[0]
    .split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0]
    .split(/\nFrom:\s.+\nSent:\s/i)[0]
    .trim();
}

export async function POST(request: Request) {
  if (!inboundAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";
  const form = contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")
    ? await request.formData()
    : null;
  const json = form ? null : await request.json().catch(() => ({}));

  const getValue = (key: string) => {
    const value = form?.get(key);
    if (typeof value === "string") return value;
    const jsonValue = (json as Record<string, unknown>)?.[key];
    return typeof jsonValue === "string" ? jsonValue : "";
  };

  const from = getValue("from") || getValue("sender");
  const subject = getValue("subject");
  const text = stripQuotedReply(getValue("text") || getValue("body-plain") || getValue("html") || "");
  const envelope = getValue("envelope");

  await createAutomationEvent({
    title: "SendGrid inbound email",
    detail: `Inbound email from ${from || "unknown sender"}${subject ? `: ${subject}` : ""}`,
    status: "done",
    type: "sendgrid",
    payload: { from, subject, envelope },
  }).catch(() => undefined);

  if (!text) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No reply body found." });
  }

  const result = await recordInboundReply({
    channel: "email",
    from,
    body: text,
    source: "sendgrid-inbound",
    metadata: { subject, envelope },
  });

  return NextResponse.json({ ok: true, ...result }, { status: 202 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sendgrid-inbound",
    configured: true,
    url: "/api/sendgrid/inbound",
  });
}
