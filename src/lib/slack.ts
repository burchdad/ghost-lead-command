import type { Lead, OutreachQueueItem } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import type { AgentPlan } from "@/lib/autopilot";
import type { CallAssistTask } from "@/lib/human-followup";
import { buildSignalScoreboard, signalScoreboardSummary } from "@/lib/intent-scoreboard";
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

function outreachActionValue(itemId: string, action: "approve" | "redo" | "discard" | "suppress") {
  return JSON.stringify({
    action: `outreach_${action}`,
    itemId,
    token: actionToken(),
  });
}

function batchApproveValue(limit: number) {
  return JSON.stringify({
    action: "vega_batch_approve",
    limit,
    token: actionToken(),
  });
}

function planActionValue(action: "approve" | "deny", plan: AgentPlan) {
  return JSON.stringify({
    action: `plan_${action}`,
    token: actionToken(),
    plan: {
      provider: plan.provider,
      niche: plan.niche,
      query: plan.query,
      location: plan.location,
      locations: plan.locations,
      industries: plan.industries,
      minScore: plan.minScore,
      queueLimit: plan.queueLimit,
      size: plan.size,
      rationale: plan.rationale,
      source: plan.source,
    },
  });
}

function appViewUrl(view: string) {
  const url = new URL("/", appBaseUrl());
  url.searchParams.set("view", view);
  return url.toString();
}

function compactReasonCounts(label: string, counts?: Record<string, number>) {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (!entries.length) return "";
  return `*${label}:* ${entries.map(([reason, count]) => `${reason} ${count}`).join(", ")}`;
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

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isValidSlackSignature(request: Request, rawBody: string) {
  const signingSecret = clean(process.env.SLACK_SIGNING_SECRET);
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";
  if (!timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 60 * 5) return false;

  if (!signingSecret) return true;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  return safeEqual(expected, signature);
}

export function isSlackEventAuthorized(payload: SlackEventPayload, request: Request, rawBody = "") {
  if (isValidSlackSignature(request, rawBody)) return true;

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
  const scoreboard = lead
    ? buildSignalScoreboard({
        companyName: lead.companyName,
        name: lead.name,
        niche: lead.niche,
        source: lead.source,
        score: lead.score,
        nextAction: `${lead.nextAction} ${item.reason || ""}`,
        stage: lead.stage,
        value: lead.value,
      })
    : null;
  const signalSummary = scoreboard ? signalScoreboardSummary(scoreboard) : clean(item.reason || undefined);
  const signalPreview = signalSummary.length > 620 ? `${signalSummary.slice(0, 617)}...` : signalSummary;
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
        ...(signalPreview
          ? [
              {
                type: "section",
                text: { type: "mrkdwn", text: `*Vega signal read:*\n${signalPreview}` },
              },
            ]
          : []),
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
              action_id: "outreach_approve",
              value: outreachActionValue(item.id, "approve"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Redo", emoji: false },
              action_id: "outreach_redo",
              value: outreachActionValue(item.id, "redo"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Discard", emoji: false },
              style: "danger",
              action_id: "outreach_discard",
              value: outreachActionValue(item.id, "discard"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Suppress", emoji: false },
              style: "danger",
              action_id: "outreach_suppress",
              value: outreachActionValue(item.id, "suppress"),
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

export async function notifySlackWaitlistCandidate(input: {
  name: string;
  company: string;
  role: string;
  score: number;
  segment: string;
  monthlyLeadVolume: string;
  tools: string[];
  challenge: string;
  nextAction: string;
}) {
  const webhookUrl = clean(process.env.SLACK_WEBHOOK_URL);
  if (!webhookUrl) {
    return { configured: false, sent: false, message: "Missing SLACK_WEBHOOK_URL." };
  }

  const waitlistUrl = new URL("/command?view=waitlist", appBaseUrl()).toString();
  const challenge = input.challenge.length > 520 ? `${input.challenge.slice(0, 517)}...` : input.challenge;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `New high-priority Vega waitlist contestant: ${input.name}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "New high-priority Vega waitlist contestant", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${input.name}* - ${input.role} at *${input.company}*\n*Score:* ${input.score}\n*Segment:* ${input.segment}\n*Lead volume:* ${input.monthlyLeadVolume}/month\n*Tools:* ${input.tools.join(", ") || "None"}`,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Challenge:*\n${challenge}` },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `*Next move:* ${input.nextAction}` }],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Vega Waitlist", emoji: false },
              style: "primary",
              url: waitlistUrl,
            },
          ],
        },
      ],
    }),
  });

  return {
    configured: true,
    sent: response.ok,
    message: response.ok ? "Slack waitlist notification sent." : `Slack webhook returned ${response.status}.`,
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
              action_id: "plan_approve",
              value: planActionValue("approve", plan),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Different Plan", emoji: false },
              action_id: "plan_deny",
              value: planActionValue("deny", plan),
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

export async function notifySlackVegaOpsBrief(input: {
  summary: string;
  bottleneck: string;
  nextMove: string;
  closeness: string;
  metrics: {
    targetCloses: number;
    targetBooked: number;
    leadsThisWeek: number;
    sentThisWeek: number;
    repliesThisWeek: number;
    hotRepliesThisWeek: number;
    bookedCalls: number;
    wonDeals: number;
    pendingApprovals: number;
    sendgridReady: number;
    manualTasks: number;
    failedSends: number;
    openSequenceSteps: number;
    bookingTasksReady: number;
    bookingTasksBlocked: number;
  };
  orders: { agent: string; status: string; report: string; order: string }[];
  executed: { name: string; status: string; detail: string }[];
  stephenAsk: string;
  novaDirective: string;
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const directorName = leadDirectorAgentName();
  const orderLines = input.orders
    .slice(0, 8)
    .map((order) => `- *${order.agent}:* ${order.status} - ${order.report}\n  _Order:_ ${order.order}`)
    .join("\n");
  const executedLines = input.executed.length
    ? input.executed.slice(0, 6).map((item) => `- *${item.name}:* ${item.status} - ${item.detail}`).join("\n")
    : "No execution requested; brief only.";

  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega ops brief: ${input.bottleneck}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Vega Lead Command Ops Brief", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*From:* ${directorName}\n*Summary:* ${input.summary}\n*Bottleneck:* ${input.bottleneck}\n*Next move:* ${input.nextMove}\n*GojiBerry closeness:* ${input.closeness}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Won / target*\n${input.metrics.wonDeals}/${input.metrics.targetCloses}` },
            { type: "mrkdwn", text: `*Booked / target*\n${input.metrics.bookedCalls}/${input.metrics.targetBooked}` },
            { type: "mrkdwn", text: `*Leads this week*\n${input.metrics.leadsThisWeek}` },
            { type: "mrkdwn", text: `*Sent this week*\n${input.metrics.sentThisWeek}` },
            { type: "mrkdwn", text: `*Replies / hot*\n${input.metrics.repliesThisWeek}/${input.metrics.hotRepliesThisWeek}` },
            { type: "mrkdwn", text: `*SendGrid-ready*\n${input.metrics.sendgridReady}` },
            { type: "mrkdwn", text: `*Manual tasks*\n${input.metrics.manualTasks}` },
            { type: "mrkdwn", text: `*Failed sends*\n${input.metrics.failedSends}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Sub-agent reports to Vega*\n${orderLines.slice(0, 2900)}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Executed lanes*\n${executedLines.slice(0, 1800)}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Nova directive*\n${input.novaDirective}\n\n*Stephen ask*\n${input.stephenAsk}` },
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
    message: result.sent ? `Vega ops brief sent to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackRevenueWatch(input: {
  summary: string;
  nextMove: string;
  escalations: string[];
  eventCounts: Record<string, number>;
  pendingApprovals: number;
  bookingReady: number;
  bookingBlocked: number;
  replies: number;
  hotReplies: number;
  topSources: {
    source: string;
    leads: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    replies: number;
    booked: number;
    replyRate: number;
    failRate: number;
    verdict: string;
    nextMove: string;
  }[];
  executed: { name: string; status: string; detail: string }[];
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const eventLines = Object.entries(input.eventCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([event, count]) => `${event}: ${count}`)
    .join(", ") || "No SendGrid events in the last 24h.";
  const sourceLines = input.topSources.length
    ? input.topSources
        .map((source) =>
          `- *${source.source}:* ${source.verdict} - ${source.leads} leads, ${source.sent} sent, ${source.replies} replies, ${source.booked} booked, ${source.replyRate}% reply, ${source.failRate}% fail`,
        )
        .join("\n")
    : "No source rows available yet.";
  const escalationLines = input.escalations.length
    ? input.escalations.map((item) => `- ${item}`).join("\n")
    : "No urgent escalations right now.";
  const executedLines = input.executed.length
    ? input.executed.slice(0, 6).map((item) => `- *${item.name}:* ${item.status} - ${item.detail}`).join("\n")
    : "No lanes executed.";

  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega revenue watch: ${input.summary}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Vega Reply + Booking Watch", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Summary:* ${input.summary}\n*Next move:* ${input.nextMove}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Replies 24h*\n${input.replies}` },
            { type: "mrkdwn", text: `*Hot replies 24h*\n${input.hotReplies}` },
            { type: "mrkdwn", text: `*Booking ready*\n${input.bookingReady}` },
            { type: "mrkdwn", text: `*Booking blocked*\n${input.bookingBlocked}` },
            { type: "mrkdwn", text: `*Pending approvals*\n${input.pendingApprovals}` },
            { type: "mrkdwn", text: `*SendGrid events*\n${eventLines.slice(0, 180)}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Escalations*\n${escalationLines.slice(0, 1800)}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Source scorecard*\n${sourceLines.slice(0, 2400)}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Executed lanes*\n${executedLines.slice(0, 1500)}` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Open Inbox", emoji: false },
              style: "primary",
              url: appViewUrl("inbox"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Queue", emoji: false },
              url: appViewUrl("queue"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Analytics", emoji: false },
              url: appViewUrl("analytics"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Revenue watch posted to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackLeadCommandAudit(input: {
  executiveSummary: string;
  bottleneck: string;
  nextMove: string;
  metrics: {
    leads: number;
    pending: number;
    emailReady?: number;
    manualPending?: number;
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
            { type: "mrkdwn", text: `*SendGrid-ready*\n${input.metrics.emailReady ?? "n/a"}` },
            { type: "mrkdwn", text: `*Manual tasks*\n${input.metrics.manualPending ?? "n/a"}` },
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

export async function notifySlackBatchApprovalResult(input: {
  requested: number;
  attempted: number;
  approved: number;
  failed: number;
  sent: number;
  dryRunQueued: number;
  emailReadyBefore: number;
  manualPending: number;
  otherPending: number;
  callAssistQueued?: number;
  callAssistTasks?: CallAssistTask[];
  blocked?: boolean;
  blockReason?: string;
  health?: { mode?: string; bounceRate?: number; targetBounceRate?: number };
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const callAssistLine = input.callAssistTasks?.length
    ? `\n*Phone assists:* ${input.callAssistTasks
        .slice(0, 5)
        .map((task) => `${task.contactName} at ${task.companyName} - ${task.phone} (${task.dueLabel})`)
        .join("; ")}${input.callAssistTasks.length > 5 ? ` +${input.callAssistTasks.length - 5} more` : ""}`
    : "";
  const summary = input.blocked
    ? `Paused by Vega quality gate: ${input.blockReason || "sender health or contact quality needs review."}`
    : input.attempted
      ? `Approved ${input.approved}/${input.attempted}. Sent ${input.sent}. Phone assists ${input.callAssistQueued || 0}. Dry-run queued ${input.dryRunQueued}. Failed ${input.failed}.`
      : `No SendGrid-ready email approvals found. Manual pending ${input.manualPending}; other pending ${input.otherPending}.`;
  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega batch approval result: ${summary}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Vega batch approval result", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Status:* ${summary}${callAssistLine}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Requested*\n${input.requested}` },
            { type: "mrkdwn", text: `*SendGrid-ready before click*\n${input.emailReadyBefore}` },
            { type: "mrkdwn", text: `*Attempted*\n${input.attempted}` },
            { type: "mrkdwn", text: `*Actually sent*\n${input.sent}` },
            { type: "mrkdwn", text: `*Phone assists queued*\n${input.callAssistQueued || 0}` },
            { type: "mrkdwn", text: `*Dry-run queued*\n${input.dryRunQueued}` },
            { type: "mrkdwn", text: `*Failed*\n${input.failed}` },
            { type: "mrkdwn", text: `*Manual tasks pending*\n${input.manualPending}` },
            { type: "mrkdwn", text: `*Other pending*\n${input.otherPending}` },
            { type: "mrkdwn", text: `*Sender health*\n${input.health?.mode || "unknown"}${input.health?.bounceRate != null ? ` · ${input.health.bounceRate}%` : ""}` },
          ],
        },
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
    message: result.sent ? `Batch approval result posted to ${result.channel || channelName}.` : result.message,
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
    locations?: string[];
  };
  result?: {
    found: number;
    rawFound?: number;
    qualified: number;
    queued: number;
    reviewReady?: number;
    message?: string;
    guardrails?: {
      requested?: { minScore?: number };
      effective?: { minScore?: number; size?: number; queueLimit?: number };
      caps?: { requireEmail?: boolean; requireBuyerSignal?: boolean };
    };
    diagnostics?: {
      marketsSearched?: string[];
      rawFound?: number;
      strictQualified?: number;
      reviewReady?: number;
      contactable?: number;
      missingContact?: number;
      suppressed?: Record<string, number>;
      policySkipped?: Record<string, number>;
      searchRuns?: Array<{
        query?: string;
        found?: number;
        strictQualified?: number;
        reviewReady?: number;
      }>;
    };
  };
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const fields =
    input.plan && input.result
      ? [
          { type: "mrkdwn", text: `*Niche*\n${input.plan.niche}` },
          { type: "mrkdwn", text: `*Provider*\n${input.plan.provider}` },
          { type: "mrkdwn", text: `*Location*\n${input.plan.location}${input.plan.locations?.length ? ` (${input.plan.locations.length} markets)` : ""}` },
          { type: "mrkdwn", text: `*Found*\n${input.result.rawFound ?? input.result.found}` },
          { type: "mrkdwn", text: `*Qualified*\n${input.result.qualified}` },
          { type: "mrkdwn", text: `*Queued*\n${input.result.queued}` },
          { type: "mrkdwn", text: `*Review-ready*\n${input.result.reviewReady ?? input.result.diagnostics?.reviewReady ?? 0}` },
          { type: "mrkdwn", text: `*Contactable*\n${input.result.diagnostics?.contactable ?? "n/a"}` },
          { type: "mrkdwn", text: `*Score policy*\n${input.result.guardrails?.requested?.minScore ?? "n/a"} requested / ${input.result.guardrails?.effective?.minScore ?? "n/a"} effective` },
          { type: "mrkdwn", text: `*Email required*\n${input.result.guardrails?.caps?.requireEmail === false ? "no" : "yes"}` },
        ]
      : [];
  const diagnosticsText = input.result?.diagnostics
    ? [
        input.result.diagnostics.marketsSearched?.length
          ? `*Markets searched:* ${input.result.diagnostics.marketsSearched.slice(0, 8).join(", ")}`
          : "",
        input.result.diagnostics.searchRuns?.length
          ? `*Search passes:* ${input.result.diagnostics.searchRuns
              .slice(0, 4)
              .map((run) => `${run.found || 0} found / ${run.strictQualified || 0} qualified (${clean(run.query).slice(0, 52)})`)
              .join("; ")}`
          : "",
        compactReasonCounts("Source filters", input.result.diagnostics.suppressed),
        compactReasonCounts("Policy skips", input.result.diagnostics.policySkipped),
        input.result.message ? `*Detail:* ${input.result.message}` : "",
      ].filter(Boolean).join("\n")
    : input.result?.message
      ? `*Detail:* ${input.result.message}`
      : "";

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
        ...(diagnosticsText
          ? [
              {
                type: "section",
                text: { type: "mrkdwn", text: diagnosticsText.slice(0, 2800) },
              },
            ]
          : []),
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

export async function notifySlackClosingSprintResult(input: {
  instruction: string;
  status: "received" | "finished" | "failed";
  summary: string;
  bottleneck?: string;
  metrics?: {
    targetCloses: number;
    targetBooked: number;
    leadsThisWeek: number;
    sentThisWeek: number;
    repliesThisWeek: number;
    hotRepliesThisWeek: number;
    bookedCalls: number;
    wonDeals: number;
    pendingApprovals: number;
    sendgridReady: number;
    manualTasks: number;
    failedSends: number;
  };
  actions?: { name: string; status: string; detail: string }[];
  nextMoves?: string[];
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const actionLines = input.actions?.length
    ? input.actions.slice(0, 6).map((action) => `- *${action.name}:* ${action.status} - ${action.detail}`).join("\n")
    : "No sprint actions have finished yet.";
  const nextMoveLines = input.nextMoves?.length
    ? input.nextMoves.slice(0, 5).map((move) => `- ${move}`).join("\n")
    : "- Vega is preparing the next sprint move.";

  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega closing sprint ${input.status}: ${input.summary}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: input.status === "received" ? "Vega closing sprint received" : "Vega closing sprint report",
            emoji: false,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Instruction:* ${input.instruction}\n*Status:* ${input.summary}${input.bottleneck ? `\n*Bottleneck:* ${input.bottleneck}` : ""}`,
          },
        },
        ...(input.metrics
          ? [
              {
                type: "section",
                fields: [
                  { type: "mrkdwn", text: `*Close target*\n${input.metrics.wonDeals}/${input.metrics.targetCloses}` },
                  { type: "mrkdwn", text: `*Booked target*\n${input.metrics.bookedCalls}/${input.metrics.targetBooked}` },
                  { type: "mrkdwn", text: `*Leads this week*\n${input.metrics.leadsThisWeek}` },
                  { type: "mrkdwn", text: `*Sent this week*\n${input.metrics.sentThisWeek}` },
                  { type: "mrkdwn", text: `*Replies this week*\n${input.metrics.repliesThisWeek}` },
                  { type: "mrkdwn", text: `*Hot replies*\n${input.metrics.hotRepliesThisWeek}` },
                  { type: "mrkdwn", text: `*Pending approvals*\n${input.metrics.pendingApprovals}` },
                  { type: "mrkdwn", text: `*SendGrid-ready*\n${input.metrics.sendgridReady}` },
                  { type: "mrkdwn", text: `*Manual tasks*\n${input.metrics.manualTasks}` },
                  { type: "mrkdwn", text: `*Failed sends*\n${input.metrics.failedSends}` },
                ],
              },
            ]
          : []),
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Actions run*\n${actionLines.slice(0, 2800)}` },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Next moves*\n${nextMoveLines.slice(0, 1800)}` },
        },
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
              text: { type: "plain_text", text: "Open Inbox", emoji: false },
              url: appViewUrl("inbox"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Agents", emoji: false },
              url: appViewUrl("agents"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Proposal", emoji: false },
              url: appViewUrl("proposal"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Vega closing sprint update posted to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackMorningStandup(input: {
  location: string;
  bottleneck: string;
  metrics: {
    targetCloses: number;
    targetBooked: number;
    leadsThisWeek: number;
    sentThisWeek: number;
    repliesThisWeek: number;
    hotRepliesThisWeek: number;
    bookedCalls: number;
    wonDeals: number;
    pendingApprovals: number;
    sendgridReady: number;
    manualTasks: number;
    failedSends: number;
  };
  targets: {
    daysLeft: number;
    bookedGap: number;
    closeGap: number;
    bookedToday: number;
    closeToday: number;
    sendTarget: number;
    sourceTarget: number;
    approvalTarget: number;
  };
  warmLeads?: Array<{
    companyName: string;
    name: string;
    score: number;
    signal: string;
    nextMove: string;
  }>;
  bookingDiagnosis?: {
    summary: string;
    blockers: string[];
    nextMoves: string[];
  };
  novaDirective: string;
  vegaOrders: string[];
  stephenAsk: string;
  nextMoves: string[];
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const directorName = leadDirectorAgentName();
  const orders = input.vegaOrders.map((order) => `- \`${order}\``).join("\n");
  const nextMoves = input.nextMoves.map((move) => `- ${move}`).join("\n");
  const warmLeadLines = (input.warmLeads || [])
    .slice(0, 5)
    .map((lead, index) => `${index + 1}. *${lead.companyName}* (${lead.score}) - ${lead.signal}. Next: ${lead.nextMove}`)
    .join("\n");
  const blockerLines = input.bookingDiagnosis?.blockers?.length
    ? input.bookingDiagnosis.blockers.slice(0, 5).map((blocker) => `- ${blocker}`).join("\n")
    : "- No urgent booking blocker detected.";
  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Morning Lead Command standup: bottleneck ${input.bottleneck}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Nova x Vega morning lead-gen standup", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Stephen + Nova + ${directorName}*\n*Market focus:* ${input.location}\n*Bottleneck:* ${input.bottleneck}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Won / target*\n${input.metrics.wonDeals}/${input.metrics.targetCloses}` },
            { type: "mrkdwn", text: `*Booked / target*\n${input.metrics.bookedCalls}/${input.metrics.targetBooked}` },
            { type: "mrkdwn", text: `*Days left*\n${input.targets.daysLeft}` },
            { type: "mrkdwn", text: `*Leads this week*\n${input.metrics.leadsThisWeek}` },
            { type: "mrkdwn", text: `*Sent this week*\n${input.metrics.sentThisWeek}` },
            { type: "mrkdwn", text: `*Replies / hot*\n${input.metrics.repliesThisWeek}/${input.metrics.hotRepliesThisWeek}` },
            { type: "mrkdwn", text: `*Pending approvals*\n${input.metrics.pendingApprovals}` },
            { type: "mrkdwn", text: `*SendGrid-ready*\n${input.metrics.sendgridReady}` },
            { type: "mrkdwn", text: `*Manual tasks*\n${input.metrics.manualTasks}` },
            { type: "mrkdwn", text: `*Failed sends*\n${input.metrics.failedSends}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Nova CEO directive*\n${input.novaDirective}\n\n*Stephen ask*\n${input.stephenAsk}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Warmest accounts for Vega*\n${warmLeadLines || "No warm accounts found yet. Run a focused sourcing batch."}\n\n*Booking diagnosis*\n${input.bookingDiagnosis?.summary || "No diagnosis available."}\n${blockerLines}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Vega execution orders for today*\n${orders}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Daily targets*\n- Source ${input.targets.sourceTarget} leads\n- Send/approve ${input.targets.sendTarget} touches\n- Book ${input.targets.bookedToday} call${input.targets.bookedToday === 1 ? "" : "s"}\n- Push ${input.targets.closeToday} close${input.targets.closeToday === 1 ? "" : "s"}\n\n*Next moves*\n${nextMoves}`,
          },
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
            {
              type: "button",
              text: { type: "plain_text", text: "Open Source", emoji: false },
              url: appViewUrl("source"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Inbox", emoji: false },
              url: appViewUrl("inbox"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Morning standup posted to ${result.channel || channelName}.` : result.message,
  };
}

export async function notifySlackReplyWorkResult(input: {
  instruction: string;
  summary: string;
  reviewed: number;
  queued: number;
  alreadyPending: number;
  missingContact: number;
  bookingReady: number;
  bookingBlocked: number;
  results?: {
    companyName: string;
    classification: string;
    responseQueued: boolean;
    responseReason?: string | null;
    bookingStatus?: string;
  }[];
}) {
  const channelName = clean(process.env.SLACK_C_SUITE_CHANNEL_NAME) || "c-suite-talks";
  const topResults = (input.results || []).slice(0, 6);
  const resultLines = topResults.length
    ? topResults
        .map((result) => {
          const draft = result.responseQueued ? "draft queued" : result.responseReason || "no draft";
          return `- *${result.companyName}* (${result.classification}): ${draft}; booking ${result.bookingStatus || "n/a"}`;
        })
        .join("\n")
    : "No engaged replies were ready to work.";

  const result = await postSlackPayload({
    webhookUrl:
      clean(process.env.SLACK_C_SUITE_WEBHOOK_URL) ||
      clean(process.env.SLACK_EXECUTIVE_WEBHOOK_URL) ||
      clean(process.env.SLACK_WEBHOOK_URL),
    botToken: clean(process.env.SLACK_BOT_TOKEN),
    channelId: clean(process.env.SLACK_C_SUITE_CHANNEL_ID),
    payload: {
      text: `Vega reply work result: ${input.summary}`,
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "Vega reply-to-booking sweep", emoji: false },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel:* #${channelName}\n*Instruction:* ${input.instruction}\n*Status:* ${input.summary}`,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Reviewed*\n${input.reviewed}` },
            { type: "mrkdwn", text: `*Response drafts*\n${input.queued}` },
            { type: "mrkdwn", text: `*Already pending*\n${input.alreadyPending}` },
            { type: "mrkdwn", text: `*Missing email*\n${input.missingContact}` },
            { type: "mrkdwn", text: `*Booking ready*\n${input.bookingReady}` },
            { type: "mrkdwn", text: `*Booking blocked*\n${input.bookingBlocked}` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: resultLines.slice(0, 2800) },
        },
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
              text: { type: "plain_text", text: "Open Inbox", emoji: false },
              url: appViewUrl("inbox"),
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Open Proposal", emoji: false },
              url: appViewUrl("proposal"),
            },
          ],
        },
      ],
    },
  });

  return {
    ...result,
    message: result.sent ? `Vega reply work update posted to ${result.channel || channelName}.` : result.message,
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
  responseQueued?: boolean;
  responseNote?: string | null;
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
              text: [
                input.nextAction || "Lead Command updated the lead stage and next action.",
                input.responseQueued
                  ? "Vega queued a reviewed response draft for approval."
                  : input.responseNote || "",
              ]
                .filter(Boolean)
                .join(" "),
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
