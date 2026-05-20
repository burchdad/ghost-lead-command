import { NextResponse } from "next/server";
import { generateSalesText } from "@/lib/ai";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { isSlackActionAuthorized, notifySlackOutreachApproval } from "@/lib/slack";

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
    include: { lead: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  if (item.status !== "pending") {
    return NextResponse.json({ error: `Queue item is already ${item.status}`, item }, { status: 409 });
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
  const subject = sanitizeSubject(subjectMatch?.[1]?.trim() || item.subject);
  const body = sanitizeCustomerMessage(text.replace(/^Subject:\s*.+$/im, "").trim() || item.body, {
    channel: item.channel,
  });

  const updated = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      subject,
      body,
      reason: "Rewritten from Slack.",
    },
    include: { lead: true },
  });

  await notifySlackOutreachApproval(updated);

  const url = new URL(request.url);
  const destination = new URL("/?view=queue", url.origin);
  destination.searchParams.set("slackAction", "rewritten");
  return NextResponse.redirect(destination);
}
