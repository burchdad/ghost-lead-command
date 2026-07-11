import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { addSuppressionRecord } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

type SendGridEvent = {
  email?: string;
  event?: string;
  reason?: string;
  response?: string;
  sg_message_id?: string;
  url?: string;
  timestamp?: number;
};

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function eventAuthorized(request: Request) {
  const secret = clean(process.env.SENDGRID_EVENT_SECRET) || clean(process.env.SENDGRID_INBOUND_SECRET) || clean(process.env.CRON_SECRET);
  if (!secret) return true;

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-lead-command-token") || "";
  return token === secret;
}

function suppressibleEvent(event: string) {
  return ["bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"].includes(event);
}

function trackableEvent(event: string) {
  return ["processed", "delivered", "open", "click", "deferred", "bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"].includes(
    event,
  );
}

function suppressionReason(event: SendGridEvent) {
  const reason = clean(event.reason) || clean(event.response) || "SendGrid event";
  return `SendGrid ${event.event || "event"}: ${reason}`.slice(0, 240);
}

function eventBody(event: SendGridEvent) {
  const type = clean(event.event).toLowerCase() || "event";
  const detail = clean(event.reason) || clean(event.response) || clean(event.url);
  const messageId = clean(event.sg_message_id);
  return [`SendGrid ${type}`, detail, messageId ? `message ${messageId}` : ""].filter(Boolean).join(" - ").slice(0, 500);
}

export async function POST(request: Request) {
  if (!eventAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => []);
  const events = (Array.isArray(payload) ? payload : [payload]).filter(Boolean) as SendGridEvent[];
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  let suppressed = 0;
  let markedFailed = 0;
  let tracked = 0;

  for (const event of events) {
    const email = clean(event.email).toLowerCase();
    const type = clean(event.event).toLowerCase();
    if (!email || !trackableEvent(type)) continue;

    const lead = await prisma.lead.findFirst({
      where: { workspaceId: workspace.id, contact: { email: { equals: email, mode: "insensitive" } } },
      include: { contact: true },
      orderBy: { updatedAt: "desc" },
    });

    if (lead) {
      await prisma.interaction.create({
        data: {
          leadId: lead.id,
          contactId: lead.contactId,
          channel: "email:sendgrid",
          direction: "system",
          body: eventBody(event),
          classification: type,
        },
      });
      tracked += 1;

      if (["delivered", "open", "click"].includes(type)) {
        const nextAction =
          type === "click"
            ? "Clicked outbound email. Review fit and move this lead toward a direct follow-up."
            : type === "open"
              ? "Opened outbound email. Watch for reply and consider a timed follow-up if no response."
              : "Email delivered. Monitor for opens, clicks, and replies.";

        await prisma.lead.update({
          where: { id: lead.id },
          data: { lastTouch: `SendGrid ${type}`, nextAction },
        });
      }
    }

    if (!suppressibleEvent(type)) continue;

    await addSuppressionRecord({
      type: "email",
      value: email,
      reason: suppressionReason(event),
      source: "sendgrid-event",
    });
    suppressed += 1;

    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          score: Math.max(0, lead.score - 25),
          lastTouch: `SendGrid ${type}`,
          nextAction: `Email suppressed after SendGrid ${type}. Find a better contact path before any future outreach.`,
        },
      });

      const update = await prisma.outreachQueueItem.updateMany({
        where: {
          workspaceId: workspace.id,
          leadId: lead.id,
          channel: "email",
          status: { in: ["queued", "sent", "pending"] },
        },
        data: {
          status: "failed",
          reason: suppressionReason(event),
        },
      });
      markedFailed += update.count;
    }
  }

  await createAutomationEvent({
    title: "SendGrid delivery events processed",
    detail: `Processed ${events.length} events. Tracked ${tracked} timeline events, suppressed ${suppressed} emails, and marked ${markedFailed} outreach items failed.`,
    status: tracked || suppressed ? "done" : "planned",
    type: "sendgrid",
    payload: { count: events.length, tracked, suppressed, markedFailed },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, processed: events.length, tracked, suppressed, markedFailed }, { status: 202 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sendgrid-events",
    configured: true,
    url: "/api/sendgrid/events",
  });
}
