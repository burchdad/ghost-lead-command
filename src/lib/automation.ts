import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { improveOfferCopy } from "@/lib/offer-copy-brain";
import { getOperatorQueueCapacity } from "@/lib/operator-policy";
import { notifySlackOutreachApproval } from "@/lib/slack";
import { findSuppressionMatch } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

export function getBookingReadiness() {
  const calendarConfigured = Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID);
  const calendarProvider = process.env.GOOGLE_CALENDAR_CLIENT_ID ? "google" : process.env.OUTLOOK_CLIENT_ID ? "outlook" : "";
  const staticMeetingUrl = process.env.DEFAULT_MEETING_URL || "";
  const zoomConfigured = Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
  return {
    calendarConfigured,
    calendarProvider,
    ownerEmail: process.env.BOOKING_OWNER_EMAIL || "",
    defaultDuration: Number(process.env.DEFAULT_MEETING_DURATION_MINUTES || 30),
    meetingLink: staticMeetingUrl,
    zoomConfigured,
  };
}

export function getSlackReadiness() {
  return {
    configured: Boolean(process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN),
    channel: process.env.SLACK_OPS_CHANNEL || "",
  };
}

export async function createAutomationEvent(input: {
  leadId?: string | null;
  title: string;
  detail: string;
  status?: string;
  type?: string;
  payload?: unknown;
}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  return prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      leadId: input.leadId || null,
      title: input.title,
      detail: input.detail,
      status: input.status || "done",
      type: input.type || "system",
      payload: input.payload === undefined ? undefined : (input.payload as Prisma.InputJsonValue),
    },
    include: { lead: true },
  });
}

export async function createSlackOpsEvent(input: {
  leadId?: string | null;
  title: string;
  detail: string;
  payload?: unknown;
}) {
  const slack = getSlackReadiness();
  const event = await createAutomationEvent({
    ...input,
    status: slack.configured && slack.channel ? "done" : "blocked",
    type: "slack",
    payload: {
      ...(typeof input.payload === "object" && input.payload && !Array.isArray(input.payload)
        ? (input.payload as Record<string, unknown>)
        : {}),
      slackConfigured: slack.configured,
      slackChannel: slack.channel || "missing",
    },
  });

  return {
    event,
    notification: {
      provider: "slack",
      configured: slack.configured,
      channel: slack.channel || null,
      status: slack.configured && slack.channel ? "ready" : "blocked",
      message: slack.configured && slack.channel ? "Slack payload ready." : "Slack config missing.",
    },
  };
}

export async function createBookingTaskForLead(input: {
  leadId: string;
  replyBody?: string;
  classification?: string;
}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) return null;

  const readiness = getBookingReadiness();
  const blocked = !readiness.calendarConfigured || !readiness.ownerEmail || (!readiness.meetingLink && !readiness.zoomConfigured);
  const prepNotes = [
    `Reply classification: ${input.classification || "hot"}.`,
    input.replyBody ? `Prospect said: ${input.replyBody}` : "",
    `Prep: confirm ${lead.companyName}'s current lead flow, identify missed requests, show the Lead Command workflow, and offer a simple pilot.`,
  ]
    .filter(Boolean)
    .join("\n");

  const existing = await prisma.bookingTask.findFirst({
    where: { workspaceId: workspace.id, leadId: lead.id, status: { in: ["blocked", "ready"] } },
    orderBy: { createdAt: "desc" },
  });

  const task = existing
    ? await prisma.bookingTask.update({
        where: { id: existing.id },
        data: {
          ownerEmail: readiness.ownerEmail || existing.ownerEmail,
          status: blocked ? "blocked" : "ready",
          meetingLink: readiness.meetingLink || existing.meetingLink,
          calendarProvider: readiness.calendarProvider || existing.calendarProvider,
          durationMinutes: readiness.defaultDuration,
          prepNotes,
        },
        include: { lead: true },
      })
    : await prisma.bookingTask.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          ownerEmail: readiness.ownerEmail || null,
          status: blocked ? "blocked" : "ready",
          meetingTitle: `Discovery call: ${lead.companyName}`,
          meetingLink: readiness.meetingLink || null,
          calendarProvider: readiness.calendarProvider || null,
          durationMinutes: readiness.defaultDuration,
          prepNotes,
        },
        include: { lead: true },
      });

  await createAutomationEvent({
    leadId: lead.id,
    title: blocked ? "Booking task blocked" : "Booking task ready",
    detail: blocked
      ? `${lead.companyName} needs calendar owner and meeting-link config before booking.`
      : `${lead.companyName} is ready for calendar scheduling.`,
    status: blocked ? "blocked" : "done",
    type: "booking",
    payload: { taskId: task.id, readiness },
  });

  return { task, readiness, blocked };
}

export async function pushReadyBookingTasks(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const readiness = getBookingReadiness();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const tasks = await prisma.bookingTask.findMany({
    where: { workspaceId: workspace.id, status: "ready" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
    take: limit,
    include: { lead: { include: { contact: true } } },
  });

  let queued = 0;
  let scheduled = 0;
  let blocked = 0;
  let alreadyPending = 0;
  const moved: Array<{ taskId: string; leadId: string | null; companyName: string; status: string }> = [];

  for (const task of tasks) {
    const lead = task.lead;
    if (!lead) {
      blocked += 1;
      await prisma.bookingTask.update({ where: { id: task.id }, data: { status: "blocked" } });
      continue;
    }

    if (task.scheduledFor) {
      scheduled += 1;
      await prisma.$transaction([
        prisma.bookingTask.update({ where: { id: task.id }, data: { status: "scheduled" } }),
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            stage: "Call Booked",
            lastTouch: "Just now",
            nextAction: "Calendar event is scheduled. Prep the discovery call and confirm meeting link.",
          },
        }),
        prisma.interaction.create({
          data: {
            leadId: lead.id,
            contactId: lead.contactId,
            channel: "calendar",
            direction: "internal",
            classification: "appointment-set",
            body: `Appointment set for ${lead.companyName}. ${task.meetingLink ? `Meeting link: ${task.meetingLink}` : ""}`.trim(),
            metadata: { taskId: task.id, scheduledFor: task.scheduledFor.toISOString() },
          },
        }),
      ]);
      moved.push({ taskId: task.id, leadId: lead.id, companyName: lead.companyName, status: "scheduled" });
      continue;
    }

    const email = lead.contact?.email || "";
    const meetingLink = task.meetingLink || readiness.meetingLink || "";
    if (!email || !meetingLink) {
      blocked += 1;
      await prisma.bookingTask.update({ where: { id: task.id }, data: { status: "blocked" } });
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: lead.stage === "Imported" ? "Contacted" : lead.stage,
          nextAction: !email
            ? "Booking handoff blocked: no direct email is available for the reply follow-up."
            : "Booking handoff blocked: meeting link is missing.",
        },
      });
      continue;
    }

    const existingHandoff = await prisma.outreachQueueItem.findFirst({
      where: {
        workspaceId: workspace.id,
        leadId: lead.id,
        channel: "email",
        status: "pending",
        reason: { contains: "booking handoff" },
      },
      orderBy: { createdAt: "desc" },
    });

    const hasPendingHandoff = Boolean(existingHandoff);

    if (hasPendingHandoff) {
      alreadyPending += 1;
    } else {
      const firstName = lead.name.split(" ")[0] || "there";
      await prisma.outreachQueueItem.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          channel: "email",
          provider: "sendgrid",
          subject: sanitizeSubject(`Quick time for ${lead.companyName}?`),
          body: sanitizeCustomerMessage(
            `${firstName}, happy to show you what this would look like.\n\nHere is the quickest next step: grab a time that works here:\n${meetingLink}\n\nOn the call, I can map where leads are leaking, show the follow-up/booking workflow, and give you the simplest pilot path if it fits.\n\nBest,\nStephen Burch\nGhost AI Solutions`,
            { channel: "email" },
          ),
          status: "pending",
          reason: "Vega booking handoff prepared from a hot/booked reply.",
        },
      });
      queued += 1;
    }

    await prisma.$transaction([
      prisma.bookingTask.update({
        where: { id: task.id },
        data: {
          status: "handoff_sent",
          meetingLink,
          ownerEmail: task.ownerEmail || readiness.ownerEmail || null,
          calendarProvider: task.calendarProvider || readiness.calendarProvider || null,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: ["Call Booked", "Proposal Sent", "Won"].includes(lead.stage) ? lead.stage : "Confirmed Opportunity",
          lastTouch: "Just now",
          nextAction: hasPendingHandoff
            ? "Booking handoff already pending approval. Review/send the calendar follow-up."
            : "Booking handoff queued. Approve/send the calendar follow-up and watch for scheduled time.",
        },
      }),
      prisma.interaction.create({
        data: {
          leadId: lead.id,
          contactId: lead.contactId,
          channel: "email",
          direction: "outbound",
          classification: "booking-handoff",
          body: `Vega prepared booking handoff for ${lead.companyName}. Calendar link: ${meetingLink}`,
          metadata: { taskId: task.id, queueStatus: hasPendingHandoff ? "already-pending" : "queued" },
        },
      }),
    ]);
    moved.push({ taskId: task.id, leadId: lead.id, companyName: lead.companyName, status: "handoff_sent" });
  }

  await createAutomationEvent({
    title: "Vega booking handoff push",
    detail: `Reviewed ${tasks.length} ready booking tasks. Queued ${queued}, already pending ${alreadyPending}, scheduled ${scheduled}, blocked ${blocked}.`,
    status: queued || scheduled || alreadyPending ? "done" : tasks.length ? "needs_review" : "blocked",
    type: "booking",
    payload: { reviewed: tasks.length, queued, alreadyPending, scheduled, blocked, moved },
  });

  return { reviewed: tasks.length, queued, alreadyPending, scheduled, blocked, moved };
}

export async function createFollowUpSequenceForLead(input: {
  leadId: string;
  provider?: string | null;
  seedSubject?: string | null;
  seedBody?: string | null;
}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) return [];

  const existing = await prisma.sequenceStep.count({
    where: { workspaceId: workspace.id, leadId: lead.id, status: { in: ["draft", "active"] } },
  });
  if (existing > 0) return [];

  const firstName = lead.name.split(" ")[0] || "there";
  const niche = lead.niche || "business";
  const provider = input.provider || "sendgrid";
  const improve = (subject: string, body: string) => {
    const copy = improveOfferCopy({
      subject,
      body,
      lead: {
        name: lead.name,
        companyName: lead.companyName,
        niche: lead.niche,
        source: lead.source,
        nextAction: lead.nextAction,
        score: lead.score,
        value: lead.value,
      },
      mode: "follow-up",
    });
    return { subject: copy.subject, body: copy.body };
  };
  const step1 = improve(
    input.seedSubject || `Quick follow-up for ${lead.companyName}`,
    `${firstName}, quick follow-up on this.\n\nIf missed requests, slow follow-up, or old form fills are costing ${lead.companyName} opportunities, I can show the simple workflow I had in mind.\n\nWorth a quick look this week?`,
  );
  const step2 = improve(
    `Missed ${niche.toLowerCase()} lead flow`,
    `${firstName}, one more angle: most teams do not need a full CRM rebuild to recover missed conversations.\n\nThe useful part is a lightweight layer that catches stale requests, writes the follow-up, classifies replies, and routes the interested ones into booking.\n\nShould I send a quick example using ${lead.companyName}'s current lead flow?`,
  );
  const step3 = improve(
    `Close the loop?`,
    `${firstName}, closing the loop here.\n\nIf improving lead follow-up is not a priority right now, no worries. If it is, I can show where an AI follow-up workflow usually finds the fastest wins.\n\nWant me to leave this alone or send over a quick breakdown?`,
  );
  const steps = [
    {
      stepNumber: 1,
      dayOffset: 2,
      channel: "email",
      provider,
      subject: sanitizeSubject(step1.subject),
      body: sanitizeCustomerMessage(step1.body, { channel: "email" }),
    },
    {
      stepNumber: 2,
      dayOffset: 5,
      channel: "email",
      provider,
      subject: sanitizeSubject(step2.subject),
      body: sanitizeCustomerMessage(step2.body, { channel: "email" }),
    },
    {
      stepNumber: 3,
      dayOffset: 9,
      channel: "email",
      provider,
      subject: sanitizeSubject(step3.subject),
      body: sanitizeCustomerMessage(step3.body, { channel: "email" }),
    },
  ];

  const created = await prisma.$transaction(
    steps.map((step) =>
      prisma.sequenceStep.create({
        data: {
          workspaceId: workspace.id,
          leadId: lead.id,
          ...step,
          status: "draft",
        },
      }),
    ),
  );

  await createAutomationEvent({
    leadId: lead.id,
    title: "Follow-up sequence drafted",
    detail: `${created.length} follow-up steps drafted after approved outreach.`,
    status: "done",
    type: "sequence",
    payload: { sequenceStepIds: created.map((step: { id: string }) => step.id) },
  });

  return created;
}

function isDue(step: { createdAt: Date; dayOffset: number; scheduledFor: Date | null }, now: Date) {
  if (step.scheduledFor) return step.scheduledFor <= now;
  const dueAt = new Date(step.createdAt);
  dueAt.setDate(dueAt.getDate() + step.dayOffset);
  return dueAt <= now;
}

export async function runDueSequenceSteps(input: { limit?: number } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const now = new Date();
  const requestedLimit = Number.isFinite(input.limit) && Number(input.limit) > 0 ? Number(input.limit) : 5;
  const queuePolicy = await getOperatorQueueCapacity(workspace.id);
  const limit = Math.min(requestedLimit, queuePolicy.capacity);

  if (limit <= 0) {
    await createAutomationEvent({
      title: "Sequence runner paused",
      detail: queuePolicy.blockedReasons.join(" ") || "No sequence queue capacity remains.",
      status: "blocked",
      type: "sequence",
      payload: { queuePolicy },
    });
    return { queued: 0, skipped: 0, blocked: true, queuePolicy, items: [] };
  }

  const candidates = await prisma.sequenceStep.findMany({
    where: { workspaceId: workspace.id, status: { in: ["draft", "active"] } },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: Math.max(limit * 4, 10),
    include: { lead: { include: { contact: true, company: true } } },
  });

  const due = candidates.filter((step: { createdAt: Date; dayOffset: number; scheduledFor: Date | null }) =>
    isDue(step, now),
  );
  const items = [];
  let skipped = 0;

  for (const step of due) {
    if (items.length >= limit) break;

    const lead = step.lead;
    if (!lead) {
      skipped += 1;
      await prisma.sequenceStep.update({ where: { id: step.id }, data: { status: "skipped" } });
      continue;
    }

    const [recentReply, suppression, existingQueueItem] = await Promise.all([
      prisma.reply.findFirst({
        where: { workspaceId: workspace.id, leadId: lead.id, createdAt: { gte: step.createdAt } },
        orderBy: { createdAt: "desc" },
      }),
      findSuppressionMatch({
        email: lead.contact?.email,
        phone: lead.contact?.phone,
        domain: lead.company?.website,
        companyName: lead.companyName,
      }),
      prisma.outreachQueueItem.findFirst({
        where: {
          workspaceId: workspace.id,
          leadId: lead.id,
          channel: step.channel,
          status: { in: ["pending", "queued", "sent"] },
          subject: step.subject,
        },
      }),
    ]);

    if (recentReply || suppression || existingQueueItem || ["Confirmed Opportunity", "Call Booked", "Proposal Sent", "Won"].includes(lead.stage)) {
      skipped += 1;
      await prisma.sequenceStep.update({
        where: { id: step.id },
        data: { status: recentReply ? "paused" : "skipped" },
      });
      await createAutomationEvent({
        leadId: lead.id,
        title: recentReply ? "Follow-up paused" : "Follow-up skipped",
        detail: recentReply
          ? `${lead.companyName} replied after this step was drafted.`
          : `${lead.companyName} follow-up was not queued because it is no longer eligible.`,
        status: recentReply ? "blocked" : "done",
        type: "sequence",
        payload: { sequenceStepId: step.id, suppression, existingQueueItemId: existingQueueItem?.id || null },
      });
      continue;
    }

    const item = await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead.id,
        channel: step.channel,
        provider: step.provider || (step.channel === "sms" ? "telnyx" : "sendgrid"),
        subject: step.subject ? sanitizeSubject(step.subject) : null,
        body: sanitizeCustomerMessage(step.body, { channel: step.channel }),
        status: "pending",
        reason: `Queued from follow-up sequence step ${step.stepNumber}.`,
        scheduledFor: now,
      },
      include: { lead: true },
    });

    await prisma.sequenceStep.update({
      where: { id: step.id },
      data: { status: "queued", scheduledFor: step.scheduledFor || now },
    });

    const slack = await notifySlackOutreachApproval(item);
    await createAutomationEvent({
      leadId: lead.id,
      title: "Follow-up queued for approval",
      detail: `${lead.companyName} sequence step ${step.stepNumber} is waiting for operator approval.`,
      status: "done",
      type: "sequence",
      payload: { sequenceStepId: step.id, queueItemId: item.id, slack },
    });
    items.push(item);
  }

  return { queued: items.length, skipped, blocked: false, queuePolicy, items };
}
