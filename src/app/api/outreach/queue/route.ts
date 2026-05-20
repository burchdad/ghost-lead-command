import { NextResponse } from "next/server";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";
import { findSuppressionMatch } from "@/lib/suppression";
import { notifySlackOutreachApproval } from "@/lib/slack";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const items = await prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { lead: true },
    });

    const safeItems = items.map((item) => ({
      ...item,
      subject: item.subject ? sanitizeSubject(item.subject) : item.subject,
      body: sanitizeCustomerMessage(item.body, { channel: item.channel }),
      reason: sanitizeInternalReason(item.reason),
    }));

    return NextResponse.json({ items: safeItems });
  } catch (error) {
    return NextResponse.json(
      { error: "Outreach queue unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();
  const leadId = body.leadId ? String(body.leadId) : null;
  const channel = String(body.channel || "email");
  const subject = body.subject ? sanitizeSubject(String(body.subject)) : null;
  const message = sanitizeCustomerMessage(String(body.body || ""), { channel });
  const reason = sanitizeInternalReason(body.reason ? String(body.reason) : null);
  const lead = leadId
    ? await prisma.lead.findUnique({ where: { id: leadId }, include: { contact: true, company: true } })
    : null;

  const suppression = lead
    ? await findSuppressionMatch({
        email: lead.contact?.email,
        phone: lead.contact?.phone,
        domain: lead.company?.website,
        companyName: lead.companyName,
      })
    : null;

  if (suppression) {
    return NextResponse.json(
      { error: "Suppressed lead", suppression },
      { status: 409 },
    );
  }

  if (leadId) {
    const existing = await prisma.outreachQueueItem.findFirst({
      where: {
        workspaceId: workspace.id,
        leadId,
        channel,
        status: "pending",
      },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const updated = await prisma.outreachQueueItem.update({
        where: { id: existing.id },
        data: {
          provider: String(body.provider || (channel === "sms" ? "telnyx" : "sendgrid")),
          subject,
          body: message || existing.body,
          reason: reason || sanitizeInternalReason(existing.reason),
          scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : existing.scheduledFor,
        },
        include: { lead: true },
      });
      const slack = await notifySlackOutreachApproval(updated);
      return NextResponse.json({ item: updated, duplicate: true, refreshed: true, slack }, { status: 200 });
    }
  }

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: workspace.id,
      leadId,
      channel,
      provider: String(body.provider || (channel === "sms" ? "telnyx" : "sendgrid")),
      subject,
      body: message,
      status: "pending",
      reason,
      scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : null,
    },
    include: { lead: true },
  });

  const slack = await notifySlackOutreachApproval(item);

  return NextResponse.json({ item, slack }, { status: 201 });
}
