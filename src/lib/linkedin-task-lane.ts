import { createAutomationEvent } from "@/lib/automation";
import { selectOfferAngle } from "@/lib/offer-copy-brain";
import { getPrisma } from "@/lib/prisma";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

function firstName(name: string) {
  return clean(name).split(/\s+/)[0] || "there";
}

function linkedinSignal(lead: {
  source: string;
  nextAction: string;
  score: number;
  contact?: { email?: string | null; phone?: string | null } | null;
}) {
  const text = `${lead.source} ${lead.nextAction}`.toLowerCase();
  if (/linkedin|sales navigator|sales nav|profile|social|post|comment/.test(text)) return true;
  if (lead.score >= 82 && !lead.contact?.email) return true;
  return false;
}

function buildLinkedInTaskBody(lead: {
  name: string;
  companyName: string;
  niche: string;
  source: string;
  nextAction: string;
  score: number;
  value: number;
}) {
  const name = firstName(lead.name);
  const niche = clean(lead.niche).toLowerCase() || "your market";
  const angle = selectOfferAngle({
    name: lead.name,
    companyName: lead.companyName,
    niche: lead.niche,
    source: lead.source,
    nextAction: lead.nextAction,
    score: lead.score,
    value: lead.value,
  });
  const signal = clean(lead.nextAction) || `${lead.companyName} looks like a fit for a signal-to-meeting workflow`;

  return sanitizeCustomerMessage(
    [
      `Manual LinkedIn/Sales Navigator task for ${lead.companyName}`,
      "",
      `Context: ${signal}`,
      `Offer angle: ${angle}`,
      "",
      "Connection note:",
      `${name}, saw ${lead.companyName} while mapping ${niche} teams that may be leaking qualified conversations before they hit the calendar. Open to connecting?`,
      "",
      "DM after accepted:",
      `${name}, quick idea. I help teams spot warm buyer signals, enrich the contact, send the right first touch, and route replies into booked calls. Worth me showing the workflow I would run for ${lead.companyName}?`,
      "",
      "Operator move: send connection note or profile message manually, then record reply in Lead Command.",
    ].join("\n"),
    { channel: "manual" },
  );
}

export async function runLinkedInTaskLane(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const leads = await prisma.lead.findMany({
    where: {
      workspaceId: workspace.id,
      status: "active",
      stage: { in: ["Imported", "Contacted"] },
    },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
    take: 100,
    include: {
      contact: true,
      outreachQueue: {
        where: { channel: "linkedin", status: { in: ["pending", "queued", "sent"] } },
        take: 1,
      },
    },
  });

  let reviewed = 0;
  let queued = 0;
  let alreadyPending = 0;
  let skipped = 0;
  const tasks: { leadId: string; companyName: string; score: number; subject: string }[] = [];

  for (const lead of leads) {
    if (queued >= limit) break;
    if (!linkedinSignal(lead)) {
      skipped += 1;
      continue;
    }
    reviewed += 1;
    if (lead.outreachQueue.length) {
      alreadyPending += 1;
      continue;
    }

    const subject = sanitizeSubject(`LinkedIn touch for ${lead.companyName}`);
    await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead.id,
        channel: "linkedin",
        provider: "sales-nav-manual",
        subject,
        body: buildLinkedInTaskBody(lead),
        status: "pending",
        scheduledFor: new Date(),
        reason: sanitizeInternalReason("Vega LinkedIn Task Agent queued a manual Sales Navigator touch."),
      },
    });
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        nextAction: "LinkedIn/Sales Navigator task queued for manual connection or profile message.",
      },
    });
    queued += 1;
    tasks.push({ leadId: lead.id, companyName: lead.companyName, score: lead.score, subject });
  }

  await createAutomationEvent({
    title: "Vega LinkedIn Task Agent sweep",
    detail: `Reviewed ${reviewed} LinkedIn-fit leads and queued ${queued} manual Sales Navigator tasks.`,
    status: queued ? "done" : reviewed ? "needs_review" : "blocked",
    type: "agent",
    payload: { reviewed, queued, alreadyPending, skipped, tasks },
  });

  return {
    ok: true,
    reviewed,
    queued,
    alreadyPending,
    skipped,
    tasks,
    message: queued
      ? `Queued ${queued} LinkedIn/Sales Navigator manual touches.`
      : "No LinkedIn-fit leads were ready for a new manual task.",
  };
}
