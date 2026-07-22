import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { addSuppressionRecord } from "@/lib/suppression";
import { persistOpportunityIntelligenceSnapshot } from "@/lib/vega-intelligence-snapshots";
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

async function queueClickIntentFollowUp(input: {
  workspaceId: string;
  lead: {
    id: string;
    name: string;
    companyName: string;
    niche: string;
    stage: string;
    contactId: string | null;
  };
  url?: string;
}) {
  const prisma = getPrisma();
  const existing = await prisma.outreachQueueItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      leadId: input.lead.id,
      channel: "email",
      status: "pending",
      reason: { contains: "click intent" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return { queued: false, reason: "already-pending" };

  const firstName = input.lead.name.split(" ")[0] || "there";
  const niche = input.lead.niche || "business";
  const clickedUrl = clean(input.url);
  const body = sanitizeCustomerMessage(
    [
      `${firstName}, saw there may have been some interest in the workflow I sent over.`,
      "",
      `For ${input.lead.companyName}, the quick win is usually finding where ${niche.toLowerCase()} leads stall, then putting a lightweight follow-up and booking layer around that path.`,
      "",
      "Worth a quick look this week so I can show the exact flow I had in mind?",
      clickedUrl ? `\nFor context, this is the link that got activity: ${clickedUrl}` : "",
    ].join("\n"),
    { channel: "email" },
  );

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: input.lead.id,
      channel: "email",
      provider: "sendgrid",
      subject: sanitizeSubject(`Worth a quick look for ${input.lead.companyName}?`),
      body,
      status: "pending",
      reason: "Vega click intent follow-up prepared after SendGrid click.",
    },
  });

  await prisma.lead.update({
    where: { id: input.lead.id },
    data: {
      stage: ["Call Booked", "Proposal Sent", "Won"].includes(input.lead.stage) ? input.lead.stage : "Potential Client",
      lastTouch: "SendGrid click",
      nextAction: "Clicked outbound email. Vega queued a warm click-intent follow-up for approval.",
    },
  });

  await createAutomationEvent({
    leadId: input.lead.id,
    title: "Vega click intent follow-up queued",
    detail: `${input.lead.companyName} clicked an outbound email. A warm follow-up is waiting for approval.`,
    status: "done",
    type: "sendgrid",
    payload: { queueItemId: item.id, clickedUrl },
  });

  return { queued: true, queueItemId: item.id };
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

      await persistOpportunityIntelligenceSnapshot({
        workspaceId: workspace.id,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        triggerType: "email_event",
        triggerId: clean(event.sg_message_id) || type,
        evidence: [eventBody(event), event.url].filter(Boolean),
      }).catch(() => undefined);

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

        if (type === "click") {
          await queueClickIntentFollowUp({
            workspaceId: workspace.id,
            lead: {
              id: lead.id,
              name: lead.name,
              companyName: lead.companyName,
              niche: lead.niche,
              stage: lead.stage,
              contactId: lead.contactId,
            },
            url: event.url,
          });
        }
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
