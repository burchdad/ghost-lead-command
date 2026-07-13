import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalize(text: string) {
  return clean(text).toLowerCase();
}

export function isWarmLeadRequest(text: string) {
  return /\b(?:warmest|warm leads?|top leads?|priority leads?|best leads?|who should (?:we|vega) work|work next)\b/.test(normalize(text));
}

export function isBookingDiagnosisRequest(text: string) {
  const normalized = normalize(text);
  return (
    /\b(?:why|what).*\b(?:not|no|aren't|isn't).*\b(?:book|booking|appointments?|calls?)\b/.test(normalized) ||
    /\b(?:booking problem|booking blocker|not booking|no booked calls|no appointments|why no calls)\b/.test(normalized)
  );
}

function eventCount(events: Array<{ classification: string | null }>, names: string[]) {
  const allowed = new Set(names);
  return events.filter((event) => allowed.has(String(event.classification || "").toLowerCase())).length;
}

function latestTouchDate(input: {
  updatedAt: Date;
  replies: Array<{ createdAt: Date }>;
  interactions: Array<{ createdAt: Date }>;
  outreachQueue: Array<{ updatedAt: Date }>;
}) {
  return [
    input.updatedAt,
    ...input.replies.map((reply) => reply.createdAt),
    ...input.interactions.map((event) => event.createdAt),
    ...input.outreachQueue.map((item) => item.updatedAt),
  ].sort((a, b) => b.getTime() - a.getTime())[0];
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function compact(text: string, max = 180) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export async function getWarmLeadPriorityReport(input: { limit?: number; createEvent?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(20, Math.max(1, Number(input.limit || 5)));
  const leads = await prisma.lead.findMany({
    where: { workspaceId: workspace.id, status: "active" },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
    take: 120,
    include: {
      contact: true,
      replies: { orderBy: { createdAt: "desc" }, take: 5 },
      interactions: { orderBy: { createdAt: "desc" }, take: 12 },
      outreachQueue: { orderBy: { updatedAt: "desc" }, take: 8 },
      bookingTasks: { orderBy: { updatedAt: "desc" }, take: 3 },
      sequenceSteps: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const ranked = leads
    .map((lead) => {
      const replyScore = lead.replies.some((reply) => reply.classification === "booked")
        ? 35
        : lead.replies.some((reply) => reply.classification === "hot")
          ? 30
          : lead.replies.some((reply) => reply.classification === "objection")
            ? 20
            : lead.replies.some((reply) => reply.classification === "nurture")
              ? 10
              : 0;
      const opened = eventCount(lead.interactions, ["open"]);
      const clicked = eventCount(lead.interactions, ["click"]);
      const delivered = eventCount(lead.interactions, ["delivered"]);
      const failed = eventCount(lead.interactions, ["bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"]);
      const pending = lead.outreachQueue.filter((item) => item.status === "pending").length;
      const sent = lead.outreachQueue.filter((item) => ["sent", "queued"].includes(item.status)).length;
      const bookingReady = lead.bookingTasks.filter((task) => task.status === "ready").length;
      const bookingHandoff = lead.bookingTasks.filter((task) => task.status === "handoff_sent").length;
      const bookingScheduled = lead.bookingTasks.filter((task) => task.status === "scheduled").length;
      const bookingBlocked = lead.bookingTasks.filter((task) => task.status === "blocked").length;
      const openFollowUps = lead.sequenceSteps.filter((step) => ["draft", "active"].includes(step.status)).length;
      const contactable = Boolean(lead.contact?.email || lead.contact?.phone);
      const latest = latestTouchDate(lead);
      const staleDays = daysSince(latest);
      const score =
        lead.score +
        replyScore +
        clicked * 10 +
        opened * 5 +
        delivered * 2 +
        sent * 3 +
        pending * 2 +
        bookingReady * 25 +
        bookingHandoff * 18 +
        bookingScheduled * 35 +
        bookingBlocked * 8 +
        openFollowUps * 4 -
        failed * 25 -
        Math.min(12, staleDays);
      const nextMove = bookingReady
        ? "Move booking task to calendar now."
        : bookingHandoff
          ? "Watch booking handoff and confirm appointment time."
          : bookingScheduled
            ? "Prep the scheduled call."
        : lead.replies.some((reply) => ["booked", "hot"].includes(reply.classification))
          ? "Work reply and push booking."
          : clicked
            ? "Review click-intent follow-up and push toward a call."
          : pending
            ? "Review/approve pending outreach."
            : bookingBlocked
              ? "Unblock booking config or meeting link."
              : openFollowUps
                ? "Approve due follow-up step."
                : !contactable
                  ? "Find email/phone or use website contact path."
                  : sent && !lead.replies.length
                    ? "Refresh copy angle before next touch."
                    : "Queue a source-aware opener.";
      const signal = [
        lead.replies[0] ? `${lead.replies[0].classification} reply` : "",
        clicked ? `${clicked} click${clicked === 1 ? "" : "s"}` : "",
        opened ? `${opened} open${opened === 1 ? "" : "s"}` : "",
        bookingReady ? `${bookingReady} booking task${bookingReady === 1 ? "" : "s"} ready` : "",
        bookingHandoff ? `${bookingHandoff} booking handoff${bookingHandoff === 1 ? "" : "s"} queued` : "",
        bookingScheduled ? `${bookingScheduled} appointment${bookingScheduled === 1 ? "" : "s"} scheduled` : "",
        bookingBlocked ? `${bookingBlocked} booking blocked` : "",
        pending ? `${pending} pending approval${pending === 1 ? "" : "s"}` : "",
        failed ? `${failed} failed send event${failed === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(", ") || "high score / no recent conversion signal";

      return {
        id: lead.id,
        name: lead.name,
        companyName: lead.companyName,
        niche: lead.niche,
        stage: lead.stage,
        source: lead.source,
        score: Math.round(score),
        leadScore: lead.score,
        value: lead.value,
        email: lead.contact?.email || "",
        phone: lead.contact?.phone || "",
        signal,
        nextMove,
        daysSinceTouch: staleDays,
        reply: lead.replies[0]?.body ? compact(lead.replies[0].body) : "",
      };
    })
    .filter((lead) => lead.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const summary = ranked.length
    ? `Top warm account: ${ranked[0].companyName} (${ranked[0].score}). Next: ${ranked[0].nextMove}`
    : "No warm leads found yet. Vega should source, approve, and monitor a small qualified batch.";

  if (input.createEvent !== false) {
    await createAutomationEvent({
      title: "Vega warm lead priority report",
      detail: summary,
      status: ranked.length ? "done" : "needs_review",
      type: "agent",
      payload: { limit, ranked },
    });
  }

  return { summary, leads: ranked };
}

export async function getBookingDiagnosisReport(input: { createEvent?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    sent24,
    delivered24,
    opened24,
    clicked24,
    replies24,
    hotReplies24,
    pendingApprovals,
    sendgridReady,
    manualTasks,
    bookingReady,
    bookingBlocked,
    failedPending,
    failedEvents24,
  ] = await Promise.all([
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "sent", sentAt: { gte: since } } }),
    prisma.interaction.count({ where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid", classification: "delivered", createdAt: { gte: since } } }),
    prisma.interaction.count({ where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid", classification: "open", createdAt: { gte: since } } }),
    prisma.interaction.count({ where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid", classification: "click", createdAt: { gte: since } } }),
    prisma.reply.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
    prisma.reply.count({ where: { workspaceId: workspace.id, createdAt: { gte: since }, classification: { in: ["hot", "booked", "objection"] } } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending" } }),
    prisma.outreachQueueItem.count({
      where: {
        workspaceId: workspace.id,
        status: "pending",
        channel: "email",
        lead: { is: { contact: { is: { email: { not: null } } } } },
      },
    }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "pending", channel: "manual" } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: "ready" } }),
    prisma.bookingTask.count({ where: { workspaceId: workspace.id, status: "blocked" } }),
    prisma.outreachQueueItem.count({ where: { workspaceId: workspace.id, status: "failed" } }),
    prisma.interaction.count({
      where: {
        lead: { is: { workspaceId: workspace.id } },
        channel: "email:sendgrid",
        classification: { in: ["bounce", "dropped", "spamreport"] },
        createdAt: { gte: since },
      },
    }),
  ]);

  const blockers = [
    sendgridReady ? `${sendgridReady} SendGrid-ready approvals need release.` : "",
    manualTasks ? `${manualTasks} manual contact-path tasks are not email-ready.` : "",
    bookingReady ? `${bookingReady} booking tasks are ready but not moved to calendar.` : "",
    bookingBlocked ? `${bookingBlocked} booking tasks are blocked by calendar/link/config.` : "",
    failedPending || failedEvents24 ? `${failedPending + failedEvents24} failed/risky sends need deliverability cleanup.` : "",
    sent24 >= 10 && replies24 === 0 ? "Delivered volume is not producing replies; tighten niche, signal, and first-line copy." : "",
    sent24 < 10 && pendingApprovals === 0 ? "Not enough fresh send volume; run a focused source sprint." : "",
  ].filter(Boolean);
  const nextMoves = [
    bookingReady ? "Vega, push bookings" : "",
    sendgridReady ? `Vega, approve ${Math.min(10, sendgridReady)}` : "",
    manualTasks ? "Vega, work contact paths" : "",
    failedPending || failedEvents24 ? "Vega, protect deliverability" : "",
    !sendgridReady && !bookingReady ? "Vega, need 20 new qualified leads score 75" : "",
  ].filter(Boolean);
  const summary = blockers.length
    ? `Booking is blocked by: ${blockers[0]}`
    : "No obvious booking blocker found. Keep watch mode running and work the warmest accounts.";

  if (input.createEvent !== false) {
    await createAutomationEvent({
      title: "Vega booking diagnosis",
      detail: `${summary} Next: ${nextMoves[0] || "work warm leads"}`,
      status: blockers.length ? "needs_review" : "done",
      type: "agent",
      payload: { sent24, delivered24, opened24, clicked24, replies24, hotReplies24, pendingApprovals, sendgridReady, manualTasks, bookingReady, bookingBlocked, failedPending, failedEvents24, blockers, nextMoves },
    });
  }

  return {
    summary,
    metrics: { sent24, delivered24, opened24, clicked24, replies24, hotReplies24, pendingApprovals, sendgridReady, manualTasks, bookingReady, bookingBlocked, failedPending, failedEvents24 },
    blockers,
    nextMoves,
  };
}
