import { sendEmail, sendSms } from "@/lib/outreach";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { findSuppressionMatch } from "@/lib/suppression";

export async function approveOutreachQueueItem(
  id: string,
  input: { subject?: string; body?: string } = {},
) {
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: { include: { contact: true, company: true } } },
  });

  if (!item) {
    return { ok: false as const, status: 404, body: { error: "Queue item not found" } };
  }

  if (item.status !== "pending") {
    return {
      ok: false as const,
      status: 409,
      body: { error: `Queue item is already ${item.status}`, item },
    };
  }

  if (!item.lead) {
    return { ok: false as const, status: 400, body: { error: "Queue item is missing a lead" } };
  }

  const suppression = await findSuppressionMatch({
    email: item.lead.contact?.email,
    phone: item.lead.contact?.phone,
    domain: item.lead.company?.website,
    companyName: item.lead.companyName,
  });

  if (suppression) {
    const rejected = await prisma.outreachQueueItem.update({
      where: { id },
      data: { status: "rejected", rejectedAt: new Date(), reason: `Suppressed: ${suppression.reason}` },
    });
    return {
      ok: false as const,
      status: 409,
      body: { error: "Suppressed lead", suppression, item: rejected },
    };
  }

  const message = sanitizeCustomerMessage(String(input.body || item.body), { channel: item.channel });
  const subject = sanitizeSubject(input.subject ? String(input.subject) : item.subject || `Quick idea for ${item.lead.companyName}`);
  const delivery =
    item.channel === "sms"
      ? await sendSms({ to: item.lead.contact?.phone || "", text: message })
      : await sendEmail({ to: item.lead.contact?.email || "", subject, text: message });

  const updated = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      body: message,
      subject,
      status: delivery.status === "failed" ? "failed" : delivery.dryRun ? "queued" : "sent",
      approvedAt: new Date(),
      sentAt: delivery.status === "sent" ? new Date() : null,
      reason: delivery.message || item.reason,
    },
    include: { lead: true },
  });

  await prisma.interaction.create({
    data: {
      leadId: item.leadId,
      contactId: item.lead.contactId,
      channel: `${item.channel}:${delivery.provider}`,
      direction: "outbound",
      body: message,
      classification: delivery.dryRun ? "queued" : delivery.status,
    },
  });

  await prisma.lead.update({
    where: { id: item.lead.id },
    data: { lastTouch: "Just now", stage: item.lead.stage === "Imported" ? "Contacted" : item.lead.stage },
  });

  return { ok: true as const, status: 200, body: { item: updated, delivery } };
}
