import { createAutomationEvent } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";

export type CallAssistTask = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  dueAt: string;
  dueLabel: string;
};

export type HumanFollowUpResult =
  | { queued: true; task: CallAssistTask }
  | { queued: false; reason: string; task?: CallAssistTask };

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "live"].includes(value);
}

function followUpDelayHours() {
  const raw = Number(process.env.VEGA_PHONE_FOLLOWUP_DELAY_HOURS || 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(24, Math.max(1, Math.round(raw)));
}

function cleanPhone(phone: string | null | undefined) {
  return String(phone || "").trim();
}

function defaultCallAssignee() {
  return process.env.VEGA_PHONE_FOLLOWUP_ASSIGNEE?.trim() || "Stephen/VA";
}

function toTask(item: {
  id: string;
  scheduledFor: Date | null;
  lead: { companyName: string; name: string } | null;
  body: string;
}): CallAssistTask {
  const phone = item.body.match(/Phone:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const delay = followUpDelayHours();
  return {
    id: item.id,
    companyName: item.lead?.companyName || "Unknown company",
    contactName: item.lead?.name || "Decision maker",
    phone,
    dueAt: (item.scheduledFor || new Date(Date.now() + delay * 60 * 60 * 1000)).toISOString(),
    dueLabel: `in about ${delay} hours`,
  };
}

export async function queueHumanCallAssistAfterEmail(input: {
  leadId: string;
  sourceQueueItemId?: string | null;
}): Promise<HumanFollowUpResult> {
  if (!envBoolean("VEGA_ENABLE_PHONE_FOLLOWUP_AFTER_EMAIL", true)) {
    return { queued: false, reason: "Phone follow-up after email is disabled." };
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: { contact: true, company: true },
  });

  if (!lead) return { queued: false, reason: "Lead not found." };

  const phone = cleanPhone(lead.contact?.phone);
  if (!phone) return { queued: false, reason: "Lead has no phone number for human follow-up." };

  const existing = await prisma.outreachQueueItem.findFirst({
    where: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      channel: "manual",
      provider: "phone-after-email",
      status: "pending",
    },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return { queued: false, reason: "Phone assist task already exists.", task: toTask(existing) };
  }

  const delay = followUpDelayHours();
  const scheduledFor = new Date(Date.now() + delay * 60 * 60 * 1000);
  const contactName = lead.name || lead.contact?.name || "the decision maker";
  const role = lead.title || lead.contact?.title || "decision maker";
  const companyWebsite = lead.company?.website ? `Website: ${lead.company.website}` : "";
  const email = lead.contact?.email ? `Email sent to: ${lead.contact.email}` : "";
  const opener =
    `Hey ${contactName.split(" ")[0] || "there"}, this is Stephen with Ghost AI Solutions. ` +
    "I sent over a quick note earlier about missed quote requests and follow-up. " +
    "Who usually owns making sure those open opportunities do not stall?";

  const body = sanitizeCustomerMessage(
    [
      `Call assist for ${lead.companyName}`,
      "",
      `Person: ${contactName}`,
      `Role: ${role}`,
      `Phone: ${phone}`,
      `Assigned to: ${defaultCallAssignee()}`,
      email,
      companyWebsite,
      `When: about ${delay} hours after the email send`,
      "Attempts: 0",
      "",
      `Why this lead: ${lead.nextAction || "Vega marked this as a fit for the Lead Command offer."}`,
      "",
      "Suggested opener:",
      opener,
      "",
      "Goal: open the door, confirm who owns lead follow-up, and ask for a quick audit/demo slot if there is pain.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    { channel: "manual" },
  );

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      channel: "manual",
      provider: "phone-after-email",
      subject: sanitizeSubject(`VA call assist after email: ${lead.companyName}`),
      body,
      status: "pending",
      scheduledFor,
      reason: sanitizeInternalReason(
        `Vega queued a human phone follow-up ${delay} hours after SendGrid email send. Source queue item: ${input.sourceQueueItemId || "unknown"}.`,
      ),
    },
    include: { lead: true },
  });

  await createAutomationEvent({
    leadId: lead.id,
    title: "Phone assist queued",
    detail: `${lead.companyName}: call ${contactName} at ${phone} ${delay} hours after the email send.`,
    status: "needs_review",
    type: "human-assist",
    payload: { queueItemId: item.id, sourceQueueItemId: input.sourceQueueItemId || null, scheduledFor: scheduledFor.toISOString() },
  });

  return { queued: true, task: toTask(item) };
}
