import { createFollowUpSequenceForLead } from "@/lib/automation";
import { generateSalesText } from "@/lib/ai";
import { sendEmail, sendSms } from "@/lib/outreach";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { improveOfferCopy } from "@/lib/offer-copy-brain";
import { evaluateQueueItemForConversionSend, getSenderHealth } from "@/lib/conversion-quality";
import { queueHumanCallAssistAfterEmail } from "@/lib/human-followup";
import { getPrisma } from "@/lib/prisma";
import { buildSenderRecoveryPlan, recordSendGridEvent } from "@/lib/sender-health";
import { getDefaultWorkspace } from "@/lib/workspace";
import { findSuppressionMatch } from "@/lib/suppression";

function emailDomain(email: string | null | undefined) {
  return email?.split("@")[1]?.trim().toLowerCase() || "";
}

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

  const quality = await evaluateQueueItemForConversionSend(item);
  if (!quality.ok) {
    await prisma.outreachQueueItem.update({
      where: { id },
      data: {
        reason: `Vega conversion quality gate paused this send: ${quality.reasons.join(" ")}`,
      },
    });
    return {
      ok: false as const,
      status: 409,
      body: {
        error: "Conversion quality gate paused this send",
        detail: quality.reasons.join(" "),
        health: quality.health,
        warnings: quality.warnings,
        item,
      },
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

  if (item.channel === "email" && delivery.provider === "sendgrid" && "providerId" in delivery && delivery.providerId) {
    await recordSendGridEvent({
      workspaceId: item.workspaceId,
      leadId: item.leadId,
      event: {
        providerMessageId: delivery.providerId,
        eventType: delivery.status === "sent" ? "processed" : "dropped",
        email: item.lead.contact?.email,
        reason: delivery.message,
        timestamp: Math.floor(Date.now() / 1000),
        rawPayload: { source: "approval-send", queueItemId: item.id, delivery },
      },
    }).catch(() => undefined);
  }

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

  const humanFollowUp =
    item.channel === "email" && delivery.status === "sent" && !delivery.dryRun
      ? await queueHumanCallAssistAfterEmail({ leadId: item.lead.id, sourceQueueItemId: item.id })
      : { queued: false as const, reason: "No human phone assist needed for this queue item." };

  return { ok: true as const, status: 200, body: { item: updated, delivery, sequence, quality, humanFollowUp } };
}

export async function approvePendingOutreachBatch(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const maxLimit = Math.min(25, Math.max(1, Number(process.env.VEGA_APPROVAL_BATCH_LIMIT || 10)));
  const limit = Math.min(maxLimit, Math.max(1, Number(input.limit || maxLimit)));
  const health = await getSenderHealth({ workspaceId: workspace.id });
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

  if (["stop", "recovery", "restricted"].includes(health.mode) && !["true", "1", "yes", "on"].includes(String(process.env.VEGA_ALLOW_HIGH_BOUNCE_SEND || "").toLowerCase())) {
    const recovery = await buildSenderRecoveryPlan({ workspaceId: workspace.id });
    return {
      requested: limit,
      attempted: 0,
      approved: 0,
      failed: 0,
      blocked: true,
      blockReason: `Sender ${health.mode.toUpperCase()} requires recovery: ${health.providerFailureRate}% provider failure rate across ${health.uniqueSendsEvaluated} unique messages. Broad first-touch email remains blocked.`,
      health,
      recovery,
      emailReadyBefore: emailReady,
      manualPending,
      otherPending,
      sent: 0,
      dryRunQueued: 0,
      callAssistQueued: 0,
      callAssistTasks: [],
      results: [],
    };
  }

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
  const callAssistTasks = results.flatMap((result) => {
    if (!result.ok) return [];
    return result.body.humanFollowUp.queued && result.body.humanFollowUp.task
      ? [result.body.humanFollowUp.task]
      : [];
  });

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
    callAssistQueued: callAssistTasks.length,
    callAssistTasks,
    results: results.map((result) => ({
      ok: result.ok,
      status: result.status,
      error: result.ok ? null : result.body.error || "Approval failed",
      detail: result.ok ? null : "detail" in result.body ? result.body.detail || null : null,
      delivery: result.ok ? result.body.delivery : null,
      humanFollowUp: result.ok ? result.body.humanFollowUp : null,
    })),
    health,
  };
}

export async function rejectOutreachQueueItem(id: string, reason = "Rejected from approval queue") {
  const prisma = getPrisma();
  const existing = await prisma.outreachQueueItem.findUnique({ where: { id } });

  if (!existing) {
    return { ok: false as const, status: 404, body: { error: "Queue item not found" } };
  }

  if (existing.status !== "pending") {
    return {
      ok: false as const,
      status: 409,
      body: { error: `Queue item is already ${existing.status}`, item: existing },
    };
  }

  const item = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      reason,
    },
    include: { lead: true },
  });

  return { ok: true as const, status: 200, body: { item } };
}

export async function suppressOutreachQueueItem(id: string) {
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: { include: { contact: true, company: true } } },
  });

  if (!item?.lead) {
    return { ok: false as const, status: 404, body: { error: "Queue item or lead not found" } };
  }

  const domain = item.lead.company?.website || emailDomain(item.lead.contact?.email);
  const records = [
    item.lead.contact?.email
      ? { type: "email", value: item.lead.contact.email.toLowerCase(), reason: "Suppressed from Slack approval." }
      : null,
    domain ? { type: "domain", value: domain.toLowerCase(), reason: "Suppressed from Slack approval." } : null,
    { type: "company", value: item.lead.companyName.toLowerCase(), reason: "Suppressed from Slack approval." },
  ].filter(Boolean) as { type: string; value: string; reason: string }[];

  for (const record of records) {
    await prisma.suppressionRecord.upsert({
      where: {
        workspaceId_type_value: {
          workspaceId: item.workspaceId,
          type: record.type,
          value: record.value,
        },
      },
      update: { reason: record.reason, source: "slack" },
      create: {
        workspaceId: item.workspaceId,
        type: record.type,
        value: record.value,
        reason: record.reason,
        source: "slack",
      },
    });
  }

  const rejected = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      reason: "Suppressed from Slack approval.",
    },
    include: { lead: true },
  });

  return { ok: true as const, status: 200, body: { item: rejected, suppressed: records.length } };
}

export async function redoOutreachQueueItem(id: string) {
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: true },
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

  const generated = await generateSalesText({
    kind: "outreach",
    lead: item.lead
      ? {
          name: item.lead.name,
          companyName: item.lead.companyName,
          niche: item.lead.niche,
          stage: item.lead.stage,
          score: item.lead.score,
          value: item.lead.value,
          source: item.lead.source,
          nextAction: item.lead.nextAction,
        }
      : undefined,
    input: [
      "Rewrite this queued outreach because the operator requested Redo from Slack.",
      "Make it shorter, sharper, consultative, and compliant.",
      "Use a problem-led opener, avoid hype, and end with one low-friction question.",
      `Previous draft:\n${item.body}`,
    ].join("\n"),
  });

  const text = generated.text.trim();
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  const copy = improveOfferCopy({
    subject: subjectMatch?.[1]?.trim() || item.subject,
    body: sanitizeCustomerMessage(text.replace(/^Subject:\s*.+$/im, "").trim() || item.body, {
      channel: item.channel,
    }),
    lead: item.lead
      ? {
          name: item.lead.name,
          companyName: item.lead.companyName,
          niche: item.lead.niche,
          source: item.lead.source,
          nextAction: item.lead.nextAction,
          score: item.lead.score,
          value: item.lead.value,
        }
      : undefined,
    mode: "rewrite",
  });

  const updated = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      subject: sanitizeSubject(copy.subject),
      body: copy.body,
      reason: `Rewritten from Slack. ${copy.reason}`,
    },
    include: { lead: true },
  });

  return { ok: true as const, status: 200, body: { item: updated, reason: copy.reason } };
}
