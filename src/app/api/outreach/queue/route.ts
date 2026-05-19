import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";
import { findSuppressionMatch } from "@/lib/suppression";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const items = await prisma.outreachQueueItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { lead: true },
    });

    return NextResponse.json({ items });
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
        channel: String(body.channel || "email"),
        status: "pending",
      },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return NextResponse.json({ item: existing, duplicate: true }, { status: 200 });
    }
  }

  const item = await prisma.outreachQueueItem.create({
    data: {
      workspaceId: workspace.id,
      leadId,
      channel: String(body.channel || "email"),
      provider: String(body.provider || (body.channel === "sms" ? "telnyx" : "sendgrid")),
      subject: body.subject ? String(body.subject) : null,
      body: String(body.body || ""),
      status: "pending",
      reason: body.reason ? String(body.reason) : null,
      scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : null,
    },
    include: { lead: true },
  });

  return NextResponse.json({ item }, { status: 201 });
}
