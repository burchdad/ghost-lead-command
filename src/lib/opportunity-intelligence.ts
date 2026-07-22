import type { Lead, OutreachQueueItem } from "@prisma/client";
import { buildSignalScoreboard } from "@/lib/intent-scoreboard";

export type OpportunityDecisionLane =
  | "AUTO_EMAIL"
  | "APPROVAL_EMAIL"
  | "CALL_FIRST"
  | "RESEARCH"
  | "SUPPRESS_REVIEW";

export type OpportunityIntelligence = {
  leadFit: number | null;
  intent: number;
  opportunityTrust: number;
  contactConfidence: number;
  decisionLane: OpportunityDecisionLane;
  sendReady: boolean;
  cardTitle: string;
  cardText: string;
  reasons: string[];
  risks: string[];
  nextAction: string;
};

type QueueItemWithLead = OutreachQueueItem & { lead?: Lead | null };

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hasBusinessEmail(item: QueueItemWithLead) {
  const text = [item.body, item.reason, item.lead?.nextAction].join(" ");
  if (!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return false;
  return !/@(example|test|domain)\./i.test(text);
}

function extractScore(text: string, label: RegExp) {
  const match = text.match(label);
  return match ? Number(match[1]) : null;
}

function contactConfidence(item: QueueItemWithLead) {
  const text = [item.channel, item.provider, item.subject, item.body, item.reason, item.lead?.nextAction].join(" ");
  const hasEmail = item.channel === "email" && item.provider === "sendgrid" && hasBusinessEmail(item);
  if (hasEmail) return 92;
  if (/email discovered|direct email path available/i.test(text) && item.channel === "email") return 82;
  if (/phone|call path|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/i.test(text) && /website|contact form|http/i.test(text)) return 58;
  if (/phone|call path|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/i.test(text)) return 48;
  if (/website|contact form|http/i.test(text)) return 38;
  return 12;
}

export function evaluateOpportunityQueueItem(item: QueueItemWithLead): OpportunityIntelligence {
  const lead = item.lead;
  const scoreboard = lead
    ? buildSignalScoreboard({
        companyName: lead.companyName,
        name: lead.name,
        niche: lead.niche,
        source: lead.source,
        score: lead.score,
        nextAction: `${lead.nextAction} ${item.reason || ""} ${item.body || ""}`,
        stage: lead.stage,
        value: lead.value,
      })
    : null;
  const allText = [item.channel, item.provider, item.subject, item.body, item.reason, lead?.nextAction].join(" ");
  const parsedSignal = extractScore(allText, /Signal score\s+(\d+)/i);
  const intent = clamp(parsedSignal ?? scoreboard?.total ?? lead?.score ?? 0);
  const leadFit = typeof lead?.score === "number" ? clamp(lead.score) : null;
  const confidence = contactConfidence(item);
  const risks = [
    ...(scoreboard?.risks || []),
    /buyer role is unclear/i.test(allText) ? "No verified decision-maker." : "",
    /no contact path yet|contact path but no public email|manual contact path/i.test(allText) ? "No verified email contact." : "",
    /Channel:\s*enrich|channel:\s*enrich/i.test(allText) ? "Lead is still in enrichment." : "",
    /suppressed|bounce|failed/i.test(allText) ? "Deliverability or suppression risk." : "",
  ].filter(Boolean);
  const reasons = [
    ...(scoreboard?.reasons || []),
    leadFit && leadFit >= 80 ? "Strong ICP fit." : "",
    confidence >= 80 ? "Verified email path available." : "",
  ].filter(Boolean);

  let decisionLane: OpportunityDecisionLane = "RESEARCH";
  const emailEligible = item.channel === "email" && item.provider === "sendgrid" && confidence >= 80;
  if (/suppressed|bounce|failed/i.test(allText) || scoreboard?.nextBestChannel === "suppress-review") {
    decisionLane = "SUPPRESS_REVIEW";
  } else if (/Channel:\s*enrich|channel:\s*enrich|no contact path yet/i.test(allText)) {
    decisionLane = "RESEARCH";
  } else if (emailEligible && risks.length === 0 && intent >= 75) {
    decisionLane = "AUTO_EMAIL";
  } else if (emailEligible && intent >= 55 && !/Channel:\s*enrich/i.test(allText)) {
    decisionLane = "APPROVAL_EMAIL";
  } else if (/phone|phone-website|contact-form|call path/i.test(allText) && confidence >= 38) {
    decisionLane = "CALL_FIRST";
  }

  const sendReady = decisionLane === "AUTO_EMAIL" || decisionLane === "APPROVAL_EMAIL";
  const opportunityTrust = clamp(Math.min(intent || 0, sendReady ? confidence : Math.max(10, confidence + 10)));
  const cardTitle =
    decisionLane === "SUPPRESS_REVIEW"
      ? "VEGA SUPPRESSION REVIEW"
      : decisionLane === "CALL_FIRST"
        ? "VEGA CALL-FIRST TASK"
        : sendReady
          ? "Lead Command approval ready"
          : "VEGA RESEARCH REQUIRED";
  const nextAction =
    decisionLane === "CALL_FIRST"
      ? "Call the business or use the website contact form before email outreach."
      : sendReady
        ? "Approve or auto-send only after the copy and recipient are acceptable."
        : decisionLane === "SUPPRESS_REVIEW"
          ? "Review suppression and deliverability risk before any outreach."
          : "Find the owner, operator, office manager, or verified business email before drafting outreach.";

  return {
    leadFit,
    intent,
    opportunityTrust,
    contactConfidence: confidence,
    decisionLane,
    sendReady,
    cardTitle,
    cardText: `${cardTitle}: ${lead?.companyName || "Lead Command lead"}`,
    reasons: [...new Set(reasons)].slice(0, 4),
    risks: [...new Set(risks)].slice(0, 4),
    nextAction,
  };
}

export function softenUnsupportedPainClaims(copy: { subject: string; body: string }, evidenceText: string) {
  const hasEvidence = /missed call|missed-call|slow response|slow follow-up|form failure|estimate request|quote request|old crm|old form|stale request|reply|clicked|opened|pricing/i.test(evidenceText);
  if (hasEvidence) return copy;
  const safer =
    "I was reviewing companies in your market and noticed there may be an opportunity to tighten how website and phone inquiries are followed up.";
  let body = copy.body
    .replace(/I noticed[^.\n]*(missed|stale|old form|slow follow-up|slow response|estimate|quote)[^.\n]*[.\n]/gi, `${safer}\n`)
    .replace(/missed requests/gi, "website inquiries")
    .replace(/old form fills/gi, "website inquiries")
    .replace(/stale requests/gi, "older inquiries")
    .replace(/missed conversations/gi, "open conversations")
    .replace(/slow follow-up/gi, "follow-up");
  if (/^Team,/i.test(body.trim())) {
    body = body.replace(/^Team,/i, "Hi,");
  }
  return { ...copy, body };
}
