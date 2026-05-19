import { NextResponse } from "next/server";
import { sendEmail, sendSms } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";

type Channel = "email" | "sms";

export async function POST(request: Request) {
  const prisma = getPrisma();
  const body = await request.json();
  const channel = String(body.channel || "sms") as Channel;
  const leadId = String(body.leadId || "");
  const messageBody = String(body.body || "").trim();

  if (!leadId || !messageBody) {
    return NextResponse.json({ error: "leadId and body are required" }, { status: 400 });
  }

  if (channel !== "email" && channel !== "sms") {
    return NextResponse.json({ error: "channel must be email or sms" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true, opportunities: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const missingDestination = channel === "email" ? !lead.contact?.email : !lead.contact?.phone;
  const delivery = missingDestination
    ? {
        status: "queued" as const,
        provider: channel === "email" ? ("sendgrid" as const) : ("telnyx" as const),
        channel,
        dryRun: true,
        message: `No ${channel === "email" ? "email" : "phone"} on this contact. Saved as a manual queue item.`,
      }
    : channel === "email"
      ? await sendEmail({
          to: lead.contact?.email || "",
          subject: String(body.subject || `Quick idea for ${lead.companyName}`),
          text: messageBody,
        })
      : await sendSms({
          to: lead.contact?.phone || "",
          text: messageBody,
        });

  const interaction = await prisma.interaction.create({
    data: {
      leadId: lead.id,
      contactId: lead.contactId,
      channel: `${channel}:${delivery.provider}`,
      direction: "outbound",
      body: messageBody,
      classification: delivery.dryRun ? "queued" : delivery.status,
    },
  });

  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastTouch: "Just now",
      stage: lead.stage === "Imported" ? "Contacted" : lead.stage,
    },
    include: {
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      opportunities: true,
    },
  });

  return NextResponse.json({ delivery, interaction, lead: updatedLead }, { status: 201 });
}
