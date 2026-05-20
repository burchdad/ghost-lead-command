import { getPrisma } from "@/lib/prisma";
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

