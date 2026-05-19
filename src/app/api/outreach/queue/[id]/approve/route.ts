import { NextResponse } from "next/server";
import { sendEmail, sendSms } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { findSuppressionMatch } from "@/lib/suppression";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json().catch(() => ({}));
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: { include: { contact: true, company: true } } },
  });

  if (!item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  if (item.status !== "pending") {
    return NextResponse.json(
      { error: `Queue item is already ${item.status}`, item },
      { status: 409 },
    );
  }

  if (!item.lead) {
    return NextResponse.json({ error: "Queue item is missing a lead" }, { status: 400 });
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
    return NextResponse.json({ error: "Suppressed lead", suppression, item: rejected }, { status: 409 });
  }

  const message = String(body.body || item.body);
  const subject = body.subject ? String(body.subject) : item.subject || `Quick idea for ${item.lead.companyName}`;
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

  return NextResponse.json({ item: updated, delivery });
}
