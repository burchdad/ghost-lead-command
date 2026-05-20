import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isSlackActionAuthorized } from "@/lib/slack";

function emailDomain(email: string | null | undefined) {
  return email?.split("@")[1]?.trim().toLowerCase() || "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSlackActionAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: { include: { contact: true, company: true } } },
  });

  if (!item?.lead) {
    return NextResponse.json({ error: "Queue item or lead not found" }, { status: 404 });
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

  await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      reason: "Suppressed from Slack approval.",
    },
  });

  const url = new URL(request.url);
  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", "suppressed");
  return NextResponse.redirect(destination);
}
