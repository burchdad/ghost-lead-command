import type { Prisma } from "@prisma/client";
import { createAutomationEvent } from "@/lib/automation";
import { sendTransactionalEmail, type DeliveryResult } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type ClientCampaignUpdateConfig = {
  clientName: string;
  campaignName?: string;
  recipientEmail: string;
  recipientName?: string;
  cadence: "daily" | "after-run" | "daily-and-after-run";
  alertOn: Array<"warm-lead" | "reply" | "click" | "call-due" | "quote-request" | "booking-request">;
  source: "onboarding" | "operator" | "system";
};

export type ClientCampaignDigestInput = {
  clientName: string;
  campaignName?: string;
  recipientEmail: string;
  recipientName?: string;
  generatedAt?: string;
  summary: string;
  metrics: {
    leadsFound?: number;
    qualified?: number;
    emailsSent?: number;
    emailQualified?: number;
    callTasksDue?: number;
    replies?: number;
    warmLeads?: number;
    quoteOpportunities?: number;
    bookedMeetings?: number;
    suppressed?: number;
  };
  humanActions: string[];
  notableLeads?: Array<{
    companyName: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    nextAction: string;
    reason?: string | null;
  }>;
};

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildClientCampaignDigestEmail(input: ClientCampaignDigestInput) {
  const generatedAt = input.generatedAt ? new Date(input.generatedAt) : new Date();
  const subject = `${input.clientName} Lead Brief: ${input.metrics.callTasksDue || 0} calls due, ${input.metrics.warmLeads || 0} warm prospects`;
  const metricLines = [
    `Leads found: ${input.metrics.leadsFound ?? 0}`,
    `Qualified: ${input.metrics.qualified ?? 0}`,
    `Emails sent: ${input.metrics.emailsSent ?? 0}`,
    `Email-qualified: ${input.metrics.emailQualified ?? 0}`,
    `Calls due: ${input.metrics.callTasksDue ?? 0}`,
    `Replies: ${input.metrics.replies ?? 0}`,
    `Warm leads: ${input.metrics.warmLeads ?? 0}`,
    `Quote opportunities: ${input.metrics.quoteOpportunities ?? 0}`,
    `Booked meetings: ${input.metrics.bookedMeetings ?? 0}`,
    `Suppressed/bad contacts: ${input.metrics.suppressed ?? 0}`,
  ];
  const actions = input.humanActions.length
    ? input.humanActions.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "1. No urgent sales-manager action is due right now.";
  const leads = input.notableLeads?.length
    ? input.notableLeads
        .slice(0, 10)
        .map((lead, index) => {
          const contact = [lead.contactName, lead.email, lead.phone].map(clean).filter(Boolean).join(" | ");
          return `${index + 1}. ${lead.companyName}${contact ? ` (${contact})` : ""}\n   Next: ${lead.nextAction}${lead.reason ? `\n   Why: ${lead.reason}` : ""}`;
        })
        .join("\n")
    : "No individual lead callouts yet.";

  return {
    subject,
    text: [
      `Hi${input.recipientName ? ` ${input.recipientName}` : ""},`,
      "",
      `Vega lead update for ${input.clientName}${input.campaignName ? ` (${input.campaignName})` : ""}.`,
      `Generated: ${generatedAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} CT`,
      "",
      "Summary",
      input.summary,
      "",
      "Metrics",
      metricLines.join("\n"),
      "",
      "Human actions",
      actions,
      "",
      "Notable leads",
      leads,
      "",
      "Reply to this email with corrections, call outcomes, or booking notes and Vega can fold them into the next lead brief.",
      "",
      "Best,",
      "Vega",
      "Ghost Lead Command",
    ].join("\n"),
  };
}

export async function registerClientCampaignUpdateRecipient(config: ClientCampaignUpdateConfig) {
  if (!isLikelyEmail(config.recipientEmail)) {
    throw new Error("A valid sales update recipient email is required.");
  }

  const event = await createAutomationEvent({
    title: "Client campaign update recipient configured",
    detail: `${config.clientName} lead updates will be emailed to ${config.recipientEmail}.`,
    status: "done",
    type: "client-update-config",
    payload: config as unknown as Record<string, unknown>,
  });

  return event;
}

export async function findClientCampaignUpdateConfigs(input: { campaignName?: string; clientName?: string } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const events = await prisma.automationEvent.findMany({
    where: { workspaceId: workspace.id, type: "client-update-config", status: "done" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const seen = new Set<string>();
  return events
    .map((event) => event.payload as Prisma.JsonObject | null)
    .map((payload) => payloadToConfig(payload))
    .filter((config): config is ClientCampaignUpdateConfig => Boolean(config))
    .filter((config) => {
      const key = `${config.clientName}:${config.campaignName || ""}:${config.recipientEmail}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((config) => {
      const campaignMatch = input.campaignName ? clean(config.campaignName).toLowerCase() === clean(input.campaignName).toLowerCase() : true;
      const clientMatch = input.clientName ? clean(config.clientName).toLowerCase() === clean(input.clientName).toLowerCase() : true;
      return campaignMatch && clientMatch;
    });
}

export async function sendClientCampaignDigest(input: ClientCampaignDigestInput): Promise<DeliveryResult> {
  if (!isLikelyEmail(input.recipientEmail)) {
    return {
      status: "failed",
      provider: "sendgrid",
      channel: "email",
      dryRun: true,
      message: "Client campaign digest was not sent because the recipient email is invalid.",
    };
  }

  const email = buildClientCampaignDigestEmail(input);
  const result = await sendTransactionalEmail({
    to: input.recipientEmail,
    subject: email.subject,
    text: email.text,
  });

  const workspace = await getDefaultWorkspace();
  const prisma = getPrisma();
  await prisma.automationEvent.create({
    data: {
      workspaceId: workspace.id,
      title: "Client lead update email",
      detail: `${input.clientName} lead update email ${result.status} for ${input.recipientEmail}.`,
      status: result.status === "failed" ? "blocked" : "done",
      type: "client-update-email",
      payload: { input, result } as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

function payloadToConfig(payload: Prisma.JsonObject | null): ClientCampaignUpdateConfig | null {
  if (!payload) return null;
  const recipientEmail = clean(payload.recipientEmail);
  const clientName = clean(payload.clientName);
  if (!recipientEmail || !clientName || !isLikelyEmail(recipientEmail)) return null;
  const cadence = clean(payload.cadence);
  const alertOn = Array.isArray(payload.alertOn) ? payload.alertOn.map(clean).filter(Boolean) : [];
  return {
    clientName,
    campaignName: clean(payload.campaignName) || undefined,
    recipientEmail,
    recipientName: clean(payload.recipientName) || undefined,
    cadence: cadence === "daily" || cadence === "after-run" || cadence === "daily-and-after-run" ? cadence : "daily-and-after-run",
    alertOn: alertOn.length ? (alertOn as ClientCampaignUpdateConfig["alertOn"]) : ["warm-lead", "reply", "call-due", "quote-request", "booking-request"],
    source: clean(payload.source) === "operator" || clean(payload.source) === "system" ? (clean(payload.source) as "operator" | "system") : "onboarding",
  };
}
