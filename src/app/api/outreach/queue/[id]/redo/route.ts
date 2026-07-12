import { NextResponse } from "next/server";

import { generateSalesText } from "@/lib/ai";
import { improveOfferCopy } from "@/lib/offer-copy-brain";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = getPrisma();
  const item = await prisma.outreachQueueItem.findUnique({
    where: { id },
    include: { lead: true },
  });

  if (!item) return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: `Queue item is already ${item.status}`, item }, { status: 409 });
  }
  if (item.channel !== "email") {
    return NextResponse.json(
      { error: "Redo is only available for email drafts. Manual tasks should be reviewed or rejected." },
      { status: 400 },
    );
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
      "Rewrite this queued outreach from the in-app approval queue.",
      "Make it sharper, question-led, plainspoken, and focused on a concrete lead-flow pain.",
      "Use the Ghost AI offer brain: clear ICP, painful problem, outcome, proof angle, and low-friction CTA.",
      "End with one simple question. Do not push a demo or calendar link.",
      `Previous subject: ${item.subject || ""}`,
      `Previous draft:\n${item.body}`,
    ].join("\n"),
  });

  const text = generated.text.trim();
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  const body = text.replace(/^Subject:\s*.+$/im, "").trim() || item.body;
  const copy = improveOfferCopy({
    subject: subjectMatch?.[1]?.trim() || item.subject,
    body: sanitizeCustomerMessage(body, { channel: item.channel }),
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
      reason: `Rewritten from approval queue. ${copy.reason}`,
    },
    include: { lead: true },
  });

  return NextResponse.json({ item: updated, copyScore: copy.scorecard, repaired: copy.repaired });
}
