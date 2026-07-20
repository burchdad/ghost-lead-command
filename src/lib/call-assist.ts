import { createAutomationEvent, createBookingTaskForLead } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { addSuppressionRecord } from "@/lib/suppression";

export type CallAssistOutcome =
  | "called"
  | "no_answer"
  | "voicemail_left"
  | "gatekeeper"
  | "wrong_person"
  | "callback_requested"
  | "interested"
  | "send_information"
  | "meeting_requested"
  | "meeting_booked"
  | "not_interested"
  | "suppress";

const outcomeLabels: Record<CallAssistOutcome, string> = {
  called: "Called",
  no_answer: "No answer",
  voicemail_left: "Voicemail left",
  gatekeeper: "Gatekeeper",
  wrong_person: "Wrong person",
  callback_requested: "Callback requested",
  interested: "Interested",
  send_information: "Send information",
  meeting_requested: "Meeting requested",
  meeting_booked: "Meeting booked",
  not_interested: "Not interested",
  suppress: "Suppressed",
};

function nextBusinessDay() {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const day = due.getDay();
  if (day === 6) due.setDate(due.getDate() + 2);
  if (day === 0) due.setDate(due.getDate() + 1);
  return due;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function appendCallOutcome(body: string, outcome: CallAssistOutcome, note: string) {
  return sanitizeCustomerMessage(
    [
      body,
      "",
      "---",
      `Call outcome: ${outcomeLabels[outcome]}`,
      note ? `Note: ${note}` : "",
      `Recorded: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n"),
    { channel: "manual" },
  );
}

function infoFollowUpBody(input: { companyName: string; contactName: string; note: string }) {
  const firstName = input.contactName.split(" ")[0] || "there";
  return sanitizeCustomerMessage(
    [
      `${firstName},`,
      "",
      "Thanks for taking the call. Here is the quick version of what Stephen was reaching out about:",
      "",
      `We help teams like ${input.companyName} catch quote requests, missed calls, and open follow-ups before they stall. The workflow tracks the lead, writes the next touch, escalates hot replies, and keeps the calendar path moving.`,
      "",
      input.note ? `Context from the call: ${input.note}` : "",
      "",
      "Worth comparing this against how follow-up is handled now?",
      "",
      "Best,",
      "Stephen Burch",
      "Ghost AI Solutions",
    ]
      .filter(Boolean)
      .join("\n"),
    { channel: "email" },
  );
}

export async function recordCallAssistOutcome(input: {
  queueItemId: string;
  outcome: CallAssistOutcome;
  note?: string;
  callbackAt?: string | null;
}) {
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id: input.queueItemId },
    include: { lead: { include: { contact: true, company: true } } },
  });

  if (!item) return { ok: false as const, status: 404, body: { error: "Call assist task not found" } };
  if (item.channel !== "manual" || !["phone-after-email", "phone-website"].includes(item.provider)) {
    return { ok: false as const, status: 400, body: { error: "Queue item is not a phone/manual assist task" } };
  }
  if (!item.lead) return { ok: false as const, status: 400, body: { error: "Call assist task is missing a lead" } };

  const outcome = input.outcome;
  const note = clean(input.note);
  const lead = item.lead;
  const contactName = lead.name || lead.contact?.name || "Decision maker";
  const phone = lead.contact?.phone || item.body.match(/Phone:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const nextRetry =
    outcome === "callback_requested" && input.callbackAt
      ? new Date(input.callbackAt)
      : ["no_answer", "voicemail_left", "gatekeeper", "callback_requested"].includes(outcome)
        ? nextBusinessDay()
        : null;

  const nextActionByOutcome: Record<CallAssistOutcome, string> = {
    called: "Call completed. Review notes and choose the next conversion action.",
    no_answer: "No answer. Vega scheduled a next-business-day retry.",
    voicemail_left: "Voicemail left. Vega queued a short email follow-up and scheduled a retry.",
    gatekeeper: "Gatekeeper reached. Confirm the correct decision maker before the next touch.",
    wrong_person: "Wrong person. Research the correct operator or owner before more outreach.",
    callback_requested: "Callback requested. Follow up at the scheduled callback time.",
    interested: "Interested from phone follow-up. Vega prepared booking handoff.",
    send_information: "Prospect asked for information. Vega queued a short email follow-up.",
    meeting_requested: "Meeting requested. Vega prepared booking handoff.",
    meeting_booked: "Meeting requested. Confirm the calendar event before counting this as booked.",
    not_interested: "Not interested from phone follow-up. Stop active outreach or move to long-term nurture.",
    suppress: "Suppressed after phone follow-up. Do not contact again.",
  };

  const statusByOutcome: Record<CallAssistOutcome, string> = {
    called: "call_completed",
    no_answer: "call_no_answer",
    voicemail_left: "voicemail_left",
    gatekeeper: "gatekeeper",
    wrong_person: "wrong_person",
    callback_requested: "callback_requested",
    interested: "interested",
    send_information: "info_requested",
    meeting_requested: "meeting_requested",
    meeting_booked: "meeting_requested",
    not_interested: "not_interested",
    suppress: "suppressed",
  };

  const updates = await prisma.$transaction(async (tx) => {
    const updatedItem = await tx.outreachQueueItem.update({
      where: { id: item.id },
      data: {
        status: statusByOutcome[outcome],
        scheduledFor: nextRetry,
        reason: sanitizeInternalReason(`Phone assist outcome: ${outcomeLabels[outcome]}. ${note}`),
        body: appendCallOutcome(item.body, outcome, note),
      },
      include: { lead: true },
    });

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: ["interested", "send_information", "meeting_requested", "meeting_booked"].includes(outcome)
          ? "Potential Client"
          : lead.stage === "Imported"
            ? "Contacted"
            : lead.stage,
        lastTouch: "Just now",
        nextAction: nextActionByOutcome[outcome],
      },
    });

    await tx.interaction.create({
      data: {
        leadId: lead.id,
        contactId: lead.contactId,
        channel: "phone:human-assist",
        direction: "outbound",
        classification: outcome,
        body: [
          `${outcomeLabels[outcome]} call assist for ${lead.companyName}.`,
          phone ? `Phone: ${phone}` : "",
          note ? `Note: ${note}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });

    return { updatedItem, updatedLead };
  });

  let followUpQueueItem = null;
  if (["voicemail_left", "send_information"].includes(outcome) && lead.contact?.email) {
    followUpQueueItem = await prisma.outreachQueueItem.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        channel: "email",
        provider: "sendgrid",
        subject: sanitizeSubject(`Following up after the quick call - ${lead.companyName}`),
        body: infoFollowUpBody({ companyName: lead.companyName, contactName, note }),
        status: "pending",
        reason: sanitizeInternalReason(`Queued from phone assist outcome: ${outcomeLabels[outcome]}.`),
      },
      include: { lead: true },
    });
  }

  const booking =
    ["interested", "meeting_requested", "meeting_booked"].includes(outcome)
      ? await createBookingTaskForLead({ leadId: lead.id, replyBody: note || `Phone outcome: ${outcomeLabels[outcome]}`, classification: outcome })
      : null;

  if (outcome === "suppress") {
    if (phone) await addSuppressionRecord({ type: "phone", value: phone, reason: "Suppressed from phone-assist outcome", source: "vega-call-assist" });
    await addSuppressionRecord({ type: "company", value: lead.companyName, reason: "Suppressed from phone-assist outcome", source: "vega-call-assist" });
  }

  await createAutomationEvent({
    leadId: lead.id,
    title: `Phone outcome: ${outcomeLabels[outcome]}`,
    detail: `${lead.companyName}: ${nextActionByOutcome[outcome]}`,
    status: ["interested", "send_information", "meeting_requested", "meeting_booked"].includes(outcome) ? "done" : "needs_review",
    type: "phone-assist",
    payload: {
      queueItemId: item.id,
      outcome,
      note,
      nextRetry: nextRetry?.toISOString() || null,
      followUpQueueItemId: followUpQueueItem?.id || null,
      bookingTaskId: booking?.task?.id || null,
    },
  });

  return {
    ok: true as const,
    status: 200,
    body: {
      item: updates.updatedItem,
      lead: updates.updatedLead,
      followUpQueueItem,
      booking,
      nextRetry,
      outcome,
      message: nextActionByOutcome[outcome],
    },
  };
}
