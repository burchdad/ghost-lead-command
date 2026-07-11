import type { Lead, OutreachQueueItem } from "@prisma/client";
import type { AgentPlan } from "@/lib/autopilot";
import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";
import { getOperatorCaps } from "@/lib/operator-policy";

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function leadDirectorAgentName() {
  return clean(process.env.LEAD_DIRECTOR_AGENT_NAME) || "Vega Lead Director AI";
}

function appBaseUrl() {
  const explicit = clean(process.env.LEAD_COMMAND_APP_URL) || clean(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return normalizeUrl(explicit).replace(/\/$/, "");

  const vercelUrl = clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) || clean(process.env.VERCEL_URL);
  if (vercelUrl) return normalizeUrl(vercelUrl).replace(/\/$/, "");

  return "https://ghost-lead-command.vercel.app";
}

function normalizeUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function actionToken() {
  return clean(process.env.SLACK_ACTION_TOKEN) || clean(process.env.LEAD_COMMAND_ACCESS_KEY);
}

function actionUrl(itemId: string, action: "approve" | "redo" | "discard" | "suppress") {
  const url = new URL(`/api/slack/actions/outreach/${itemId}/${action}`, appBaseUrl());
  const token = actionToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function batchApproveValue(limit: number) {
  return JSON.stringify({
    action: "vega_batch_approve",
    limit,
    token: actionToken(),
  });
}

function appViewUrl(view: string) {
  const url = new URL("/", appBaseUrl());
  url.searchParams.set("view", view);
  return url.toString();
}

async function postSlackPayload(input: {
  payload: Record<string, unknown>;
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
}) {
  const webhookUrl = clean(input.webhookUrl);
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
    });
    return {
      configured: true,
      sent: response.ok,
      channel: "webhook",
      message: response.ok ? "Slack webhook message sent." : `Slack webhook returned ${response.status}.`,
    };
  }

  const botToken = clean(input.botToken);
  const channelId = clean(input.channelId);
  if (botToken && channelId) {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel: channelId,
        ...input.payload,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return {
      configured: true,
      sent: Boolean(response.ok && body.ok),
      channel: channelId,
      message: response.ok && body.ok ? "Slack bot message sent." : `Slack bot returned ${body.error || response.status}.`,
    };
  }

  return { configured: false, sent: false, channel: "", message: "Missing Slack webhook or bot channel configuration." };
}

function planActionUrl(action: "approve" | "deny", plan: AgentPlan) {
  const url = new URL(`/api/slack/actions/plan/${action}`, appBaseUrl());
  const token = actionToken();
  if (token) url.searchParams.set("token", token);
  url.searchParams.set("provider", plan.provider);
  url.searchParams.set("niche", plan.niche);
  url.searchParams.set("query", plan.query);
  url.searchParams.set("location", plan.location);
  url.searchParams.set("minScore", String(plan.minScore));
  url.searchParams.set("queueLimit", String(plan.queueLimit));
  url.searchParams.set("size", String(plan.size));
  plan.industries.forEach((industry) => url.searchParams.append("industries", industry));
  return url.toString();
}

function nicheActionUrl(action: "approve" | "deny", params: Record<string, string | number | string[]>) {
  const url = new URL(`/api/slack/actions/niche/${action}`, appBaseUrl());
  const token = actionToken();
  if (token) url.searchParams.set("token", token);
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

export function isSlackActionAuthorized(request: Request) {
  const expected = actionToken();
  if (!expected) return false;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("x-slack-action-token") || "";
  return token === expected;
}

export function isSlackCommandAuthorized(form: URLSearchParams, request: Request) {
  const expected =
    clean(process.env.SLACK_COMMAND_TOKEN) ||
    clean(process.env.SLACK_VERIFICATION_TOKEN) ||
    actionToken();
  if (!expected) return false;

  const formToken = form.get("token") || "";
  const headerToken = request.headers.get("x-slack-action-token") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return [formToken, headerToken, queryToken].includes(expected);
}

export function isSlackEventAuthorized(payload: SlackEventPayload, request: Request) {
  const expected =
    clean(process.env.SLACK_EVENTS_TOKEN) ||
    clean(process.env.SLACK_VERIFICATION_TOKEN) ||
    clean(process.env.SLACK_COMMAND_TOKEN) ||
    actionToken();
  if (!expected) return true;

  const headerToken = request.headers.get("x-slack-action-token") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return [payload.token, headerToken, queryToken].includes(expected);
}

export function isSlackInteractionAuthorized(payload: SlackInteractionPayload, request: Request) {
  const expected =
    clean(process.env.SLACK_COMMAND_TOKEN) ||
    clean(process.env.SLACK_VERIFICATION_TOKEN) ||
    actionToken();
  if (!expected) return false;

  const valueToken = payload.actions
    .map((action) => {
      if (!action.value) return "";
      try {
        const parsed = JSON.parse(action.value) as { token?: string };
        return parsed.token || "";
      } catch {
        return "";
      }
    })
    .find(Boolean);
  const headerToken = request.headers.get("x-slack-action-token") || "";
  const queryToken = new URL(request.url).searchParams.get("token") || "";
  return [payload.token, valueToken, headerToken, queryToken].includes(expected);
}

export type SlackInteractionPayload = {
  type?: string;
  token?: string;
  user?: { id?: string; username?: string; name?: string };
  channel?: { id?: string; name?: string };
  response_url?: string;
  actions: {
    action_id?: string;
    value?: string;
  }[];
};

export type SlackEventPayload = {
  token?: string;
  challenge?: string;
  type?: "url_verification" | "event_callback" | string;
  event_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string;
  };
};

export async function notifySlackOutreachApproval(
  item: OutreachQueueItem & { lead?: Lead | null },
) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const lead = item.lead;
  const title = lead?.companyName || "Lead Command outreach";
  const score = typeof lead?.score === "number" ? String(lead.score) : "n/a";
  const value = typeof lead?.value === "number" ? `$${lead.value.toLocaleString()}` : "n/a";
  const subject = sanitizeSubject(item.subject || `Quick idea for ${title}`);
  const body = sanitizeCustomerMessage(item.body, { channel: item.channel });
  const preview = body.length > 420 ? `${body.slice(0, 417)}...` : body;
  const queueUrl = new URL("/?view=queue", appBaseUrl()).toString();

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Approval ready: ${title}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Lead Command approval ready", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${title}*\n${item.channel}:${item.provider} | score ${score} | ${value}\n*Subject:* ${subject}`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `\`\`\`${preview}\`\`\`` },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Approve sends in live mode or records a dry-run approval. Redo marks it for rewrite. Discard rejects it.",
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve", emoji: false },
              style: "primary",
              url: actionUrl(item.id, "approve"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Redo", emoji: false },
              url: actionUrl(item.id, "redo"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Discard", emoji: false },
              style: "danger",
              url: actionUrl(item.id, "discard"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Suppress", emoji: false },
              style: "danger",
              url: actionUrl(item.id, "suppress"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: queueUrl,
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack approval notification sent." : `Slack webhook returned ${response.status}.`,
  };
}

export async function notifySlackAgentPlan(plan: AgentPlan) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const caps = getOperatorCaps();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Lead Command plan: ${plan.niche}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Lead Command operator plan", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${plan.niche}*\n*Provider:* ${plan.provider}\n*Query:* ${plan.query}\n*Location:* ${plan.location}\n*Run:* ${plan.size} sourced | score ${plan.minScore}+ | queue ${plan.queueLimit} approvals\n*Guardrails:* daily source ${caps.dailySourceLimit} | daily queue ${caps.dailyQueueLimit} | pending max ${caps.maxPendingApprovals}`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: plan.rationale.map((item) => `- ${item}`).join("\n") },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Approve starts sourcing, dedupe, scoring, draft generation, and Slack approval cards.",
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve Plan", emoji: false },
              style: "primary",
              url: planActionUrl("approve", plan),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Different Plan", emoji: false },
              url: planActionUrl("deny", plan),
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack agent plan sent." : `Slack webhook returned ${response.status}.`,
  };
}

export async function notifySlackDailyDigest(input: {
  leadsSourced: number;
  outreachQueued: number;
  sentOrApproved: number;
  replies: number;
  hotReplies: number;
  pendingApprovals: number;
  recentEvents: { title: string; detail: string; status: string; lead: string | null }[];
}) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const queueUrl = new URL("/?view=queue", appBaseUrl()).toString();
  const recentEvents = input.recentEvents.length
    ? input.recentEvents
        .slice(0, 5)
        .map((event) => `- ${event.title}: ${event.lead ? `${event.lead} - ` : ""}${event.detail}`)
        .join("\n")
    : "- No major events recorded in the last 24 hours.";

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "Lead Command daily ops digest",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Lead Command daily digest", emoji: false },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*New leads*\n${input.leadsSourced}` },
            { type: "mrkdwn", text: `*Queued drafts*\n${input.outreachQueued}` },
            { type: "mrkdwn", text: `*Approved/sent*\n${input.sentOrApproved}` },
            { type: "mrkdwn", text: `*Replies*\n${input.replies}` },
            { type: "mrkdwn", text: `*Hot replies*\n${input.hotReplies}` },
            { type: "mrkdwn", text: `*Pending approvals*\n${input.pendingApprovals}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Recent activity*\n${recentEvents}` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: queueUrl,
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack digest sent." : `Slack webhook returned ${response.status}.`,
  };
}

export async function notifySlackDirectorNovaBrief(input: {
  targetAgent: string;
  brief: string;
  nextMove: string;
  metrics: {
    leadsToday: number;
    pending: number;
    sentOrQueued: number;
    replies: number;
    booked: number;
  };
}) {
  const preview = input.brief.length > 900 ? `${input.brief.slice(0, 897)}...` : input.brief;
  const directorName = leadDirectorAgentName();
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Lead Gen Director briefing for ${input.targetAgent}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: `${directorName} to Nova`, emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*To:* ${input.targetAgent}\n*From:* ${directorName}\n*Next move:* ${input.nextMove}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*New leads*\n${input.metrics.leadsToday}` },
            { type: "mrkdwn", text: `*Pending approvals*\n${input.metrics.pending}` },
            { type: "mrkdwn", text: `*Sent/queued*\n${input.metrics.sentOrQueued}` },
            { type: "mrkdwn", text: `*Replies*\n${input.metrics.replies}` },
            { type: "mrkdwn", text: `*Booked calls*\n${input.metrics.booked}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `\`\`\`${preview}\`\`\`` },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Nova can use this as the CEO-level command brief for the next lead-gen move.",
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Agents", emoji: false },
              style: "primary",
              url: appViewUrl("agents"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: appViewUrl("queue"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Director-to-Nova brief sent to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackLeadCommandAudit(input: {
  executiveSummary: string;
  bottleneck: string;
  nextMove: string;
  metrics: {
    leads: number;
    pending: number;
    sent: number;
    replies: number;
    booked: number;
    failed: number;
  };
  agents: { name: string; status: string; detail: string }[];
  approveLimit?: number;
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const approveLimit = Math.min(25, Math.max(1, Number(input.approveLimit || process.env.VEGA_APPROVAL_BATCH_LIMIT || 10)));
  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Lead Command audit: ${input.bottleneck}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Lead Command full audit", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Executive summary:* ${input.executiveSummary}\n*Bottleneck:* ${input.bottleneck}\n*Next move:* ${input.nextMove}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Leads*\n${input.metrics.leads}` },
            { type: "mrkdwn", text: `*Pending approvals*\n${input.metrics.pending}` },
            { type: "mrkdwn", text: `*Sent/queued*\n${input.metrics.sent}` },
            { type: "mrkdwn", text: `*Replies*\n${input.metrics.replies}` },
            { type: "mrkdwn", text: `*Booked*\n${input.metrics.booked}` },
            { type: "mrkdwn", text: `*Failed*\n${input.metrics.failed}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Agent status*\n${input.agents
              .slice(0, 8)
              .map((agent) => `- *${agent.name}:* ${agent.status} - ${agent.detail}`)
              .join("\n")}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: `Stephen approve ${approveLimit}`, emoji: false },
              style: "primary",
              action_id: "vega_batch_approve",
              value: batchApproveValue(approveLimit),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: appViewUrl("queue"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Agents", emoji: false },
              url: appViewUrl("agents"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Lead Command audit posted to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackVegaLeadRequestResult(input: {
  instruction: string;
  status: "received" | "finished" | "failed";
  summary: string;
  plan?: {
    niche: string;
    provider: string;
    location: string;
  };
  result?: {
    found: number;
    qualified: number;
    queued: number;
    message?: string;
  };
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const fields =
    input.plan && input.result
      ? [
          { type: "mrkdwn", text: `*Niche*\n${input.plan.niche}` },
          { type: "mrkdwn", text: `*Provider*\n${input.plan.provider}` },
          { type: "mrkdwn", text: `*Location*\n${input.plan.location}` },
          { type: "mrkdwn", text: `*Found*\n${input.result.found}` },
          { type: "mrkdwn", text: `*Qualified*\n${input.result.qualified}` },
          { type: "mrkdwn", text: `*Queued*\n${input.result.queued}` },
        ]
      : [];

  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega lead request ${input.status}: ${input.summary}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: input.status === "received" ? "Vega lead request received" : "Vega lead request result",
            emoji: false,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Instruction:* ${input.instruction}\n*Status:* ${input.summary}`,
          },
        },
        ...(fields.length ? [{ type: "section", fields }] : []),
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: appViewUrl("queue"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Source", emoji: false },
              url: appViewUrl("source"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Vega lead request update posted to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackNicheRecommendation(input: {
  niche: string;
  query: string;
  location: string;
  industries: string[];
  minScore: number;
  queueLimit: number;
  rationale: string[];
}) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const approveUrl = nicheActionUrl("approve", {
    niche: input.niche,
    query: input.query,
    location: input.location,
    minScore: input.minScore,
    queueLimit: input.queueLimit,
    industries: input.industries,
  });
  const denyUrl = nicheActionUrl("deny", {
    exclude: input.niche,
    location: input.location,
    minScore: input.minScore,
    queueLimit: input.queueLimit,
  });

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Daily niche recommendation: ${input.niche}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Daily Lead Command recommendation", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Recommended niche:* ${input.niche}\n*Query:* ${input.query}\n*Market:* ${input.location}\n*Guardrails:* score ${input.minScore}+ | queue up to ${input.queueLimit} approvals`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: input.rationale.map((item) => `- ${item}`).join("\n"),
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve Scan", emoji: false },
              style: "primary",
              url: approveUrl,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Different Niche", emoji: false },
              url: denyUrl,
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack niche recommendation sent." : `Slack webhook returned ${response.status}.`,
  };
}

export async function notifySlackReplyAlert(input: {
  leadId?: string | null;
  companyName: string;
  contactName?: string | null;
  classification: string;
  body: string;
  nextAction?: string | null;
}) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const inboxUrl = new URL("/?view=inbox", appBaseUrl()).toString();
  const proposalUrl = new URL("/?view=proposal", appBaseUrl()).toString();
  const preview = input.body.length > 520 ? `${input.body.slice(0, 517)}...` : input.body;
  const hot = ["hot", "booked", "objection"].includes(input.classification);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Lead reply: ${input.companyName}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: hot ? "Hot reply captured" : "Reply captured", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${input.companyName}*\n${input.contactName || "Contact"} | *${input.classification}*`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `\`\`\`${preview}\`\`\`` },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: input.nextAction || "Lead Command updated the lead stage and next action.",
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Inbox", emoji: false },
              style: "primary",
              url: inboxUrl,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Prep Proposal", emoji: false },
              url: proposalUrl,
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack reply alert sent." : `Slack webhook returned ${response.status}.`,
  };
}
