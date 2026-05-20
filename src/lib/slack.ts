import type { Lead, OutreachQueueItem } from "@prisma/client";

function clean(value: string | undefined) {
  return value?.trim() || "";
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

function actionUrl(itemId: string, action: "approve" | "redo" | "discard") {
  const url = new URL(`/api/slack/actions/outreach/${itemId}/${action}`, appBaseUrl());
  const token = actionToken();
  if (token) url.searchParams.set("token", token);
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
  const subject = item.subject || `Quick idea for ${title}`;
  const preview = item.body.length > 420 ? `${item.body.slice(0, 417)}...` : item.body;
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
