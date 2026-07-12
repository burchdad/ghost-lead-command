import { createFollowUpSequenceForLead } from "@/lib/automation";
import { sendEmail, sendSms } from "@/lib/outreach";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";
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
    item.channel === "manual"
      ? {
          status: "queued" as const,
          provider: item.provider || "operator",
          channel: "manual" as const,
          dryRun: true,
          message: "Manual contact item approved. No external message was sent.",
        }
      : item.channel === "sms"
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

  const sequence =
    delivery.status === "failed"
      ? []
      : await createFollowUpSequenceForLead({
          leadId: item.lead.id,
          provider: delivery.provider,
          seedSubject: subject,
          seedBody: message,
        });

  return { ok: true as const, status: 200, body: { item: updated, delivery, sequence } };
}

export async function approvePendingOutreachBatch(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const maxLimit = Math.min(25, Math.max(1, Number(process.env.VEGA_APPROVAL_BATCH_LIMIT || 10)));
  const limit = Math.min(maxLimit, Math.max(1, Number(input.limit || maxLimit)));
  const [emailReady, manualPending, otherPending] = await Promise.all([
    prisma.outreachQueueItem.count({
      where: {
        workspaceId: workspace.id,
        status: "pending",
        channel: "email",
        lead: { is: { contact: { is: { email: { not: null } } } } },
      },
    }),
    prisma.outreachQueueItem.count({
      where: { workspaceId: workspace.id, status: "pending", channel: "manual" },
    }),
    prisma.outreachQueueItem.count({
      where: {
        workspaceId: workspace.id,
        status: "pending",
        NOT: [
          {
            channel: "email",
            lead: { is: { contact: { is: { email: { not: null } } } } },
          },
          { channel: "manual" },
        ],
      },
    }),
  ]);
  const items = await prisma.outreachQueueItem.findMany({
    where: {
      workspaceId: workspace.id,
      status: "pending",
      channel: "email",
      lead: { is: { contact: { is: { email: { not: null } } } } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results = [];
  for (const item of items) {
    results.push(await approveOutreachQueueItem(item.id));
  }

  return {
    requested: limit,
    attempted: results.length,
    approved: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    emailReadyBefore: emailReady,
    manualPending,
    otherPending,
    sent: results.filter((result) => result.ok && result.body.delivery.status === "sent").length,
    dryRunQueued: results.filter((result) => result.ok && result.body.delivery.dryRun).length,
    results: results.map((result) => ({
      ok: result.ok,
      status: result.status,
      error: result.ok ? null : result.body.error || "Approval failed",
      delivery: result.ok ? result.body.delivery : null,
    })),
  };
}
