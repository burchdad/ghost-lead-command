import { getPrisma } from "@/lib/prisma";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
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
  payload?: Record<string, unknown>;
}) {
  const prisma = getPrisma() as any;
  const workspace = await getDefaultWorkspace();
  return prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      leadId: input.leadId || null,
      title: input.title,
      detail: input.detail,
      status: input.status || "done",
      type: input.type || "system",
      payload: input.payload || undefined,
    },
    include: { lead: true },
  });
}

export async function createSlackOpsEvent(input: {
  leadId?: string | null;
  title: string;
  detail: string;
  payload?: Record<string, unknown>;
}) {
  const slack = getSlackReadiness();
  const event = await createAutomationEvent({
    ...input,
    status: slack.configured && slack.channel ? "done" : "blocked",
    type: "slack",
    payload: {
      ...input.payload,
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
  const prisma = getPrisma() as any;
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

export async function createFollowUpSequenceForLead(input: {
  leadId: string;
  provider?: string | null;
  seedSubject?: string | null;
  seedBody?: string | null;
}) {
  const prisma = getPrisma() as any;
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
  const steps = [
    {
      stepNumber: 1,
      dayOffset: 2,
      channel: "email",
      provider,
      subject: sanitizeSubject(input.seedSubject || `Quick follow-up for ${lead.companyName}`),
      body: sanitizeCustomerMessage(
        `${firstName}, quick follow-up on this.\n\nIf missed requests, slow follow-up, or old form fills are costing ${lead.companyName} opportunities, I can show the simple workflow I had in mind.\n\nWorth a quick look this week?`,
        { channel: "email" },
      ),
    },
    {
      stepNumber: 2,
      dayOffset: 5,
      channel: "email",
      provider,
      subject: sanitizeSubject(`Missed ${niche.toLowerCase()} lead flow`),
      body: sanitizeCustomerMessage(
        `${firstName}, one more angle: most teams do not need a full CRM rebuild to recover missed conversations.\n\nThe useful part is a lightweight layer that catches stale requests, writes the follow-up, classifies replies, and routes the interested ones into booking.\n\nShould I send a quick example using ${lead.companyName}'s current lead flow?`,
        { channel: "email" },
      ),
    },
    {
      stepNumber: 3,
      dayOffset: 9,
      channel: "email",
      provider,
      subject: sanitizeSubject(`Close the loop?`),
      body: sanitizeCustomerMessage(
        `${firstName}, closing the loop here.\n\nIf improving lead follow-up is not a priority right now, no worries. If it is, I can show where an AI follow-up workflow usually finds the fastest wins.\n\nWant me to leave this alone or send over a quick breakdown?`,
        { channel: "email" },
      ),
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
