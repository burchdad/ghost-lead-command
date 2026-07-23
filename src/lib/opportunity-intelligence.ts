import type { Lead, OutreachQueueItem } from "@prisma/client";
import { buildSignalScoreboard } from "@/lib/intent-scoreboard";

export type OpportunityDecisionLane =
  | "AUTO_EMAIL"
  | "APPROVAL_EMAIL"
  | "CALL_FIRST"
  | "MANUAL_CONTACT_FORM"
  | "RESEARCH"
  | "SUPPRESS_REVIEW";

export type OpportunityIntelligence = {
  leadFit: number | null;
  intent: number;
  researchSignalScore: number | null;
  opportunityTrust: number;
  contactConfidence: number;
  decisionLane: OpportunityDecisionLane;
  sendReady: boolean;
  cardTitle: string;
  cardText: string;
  executionStatus: string;
  researchObjective: string;
  proposedOutreachAngle: string;
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

function hasConfirmedBuyerIntent(text: string) {
  return /form submission|submitted|requested pricing|asked for pricing|reply|replied|clicked|email click|booked|meeting requested|recent hiring|hiring for|new location|expansion|funding|active ad|ad increase|public post asking|technology change|direct inquiry|estimate request from|quote request from/i.test(text);
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

function hasPhonePath(text: string) {
  if (/(no|missing|without)\s+(phone|call path|callable path)/i.test(text)) return false;
  return /call path|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}|phone (available|path|number|route)|callable path/i.test(text);
}

function hasWebsitePath(text: string) {
  return /website|contact form|https?:\/\//i.test(text);
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
  const confirmedIntent = hasConfirmedBuyerIntent(allText);
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
    leadFit && leadFit >= 80 && !confirmedIntent ? "Market-fit signal present; active buying intent not confirmed." : "",
    confidence >= 80 ? "Verified email path available." : "",
  ]
    .filter(Boolean)
    .filter((reason) => confirmedIntent || !/buyer-intent trigger present/i.test(reason));

  let decisionLane: OpportunityDecisionLane = "RESEARCH";
  const emailEligible = item.channel === "email" && item.provider === "sendgrid" && confidence >= 80;
  const phonePath = hasPhonePath(allText);
  const websitePath = hasWebsitePath(allText);
  if (/suppressed|bounce|failed/i.test(allText) || scoreboard?.nextBestChannel === "suppress-review") {
    decisionLane = "SUPPRESS_REVIEW";
  } else if (/Channel:\s*enrich|channel:\s*enrich|no contact path yet/i.test(allText)) {
    decisionLane = "RESEARCH";
  } else if (emailEligible && risks.length === 0 && intent >= 75) {
    decisionLane = "AUTO_EMAIL";
  } else if (emailEligible && intent >= 55 && !/Channel:\s*enrich/i.test(allText)) {
    decisionLane = "APPROVAL_EMAIL";
  } else if (phonePath && confidence >= 38) {
    decisionLane = "CALL_FIRST";
  } else if (websitePath && confidence >= 38) {
    decisionLane = "MANUAL_CONTACT_FORM";
  }

  const sendReady = decisionLane === "AUTO_EMAIL" || decisionLane === "APPROVAL_EMAIL";
  const opportunityTrust = clamp(Math.min(intent || 0, sendReady ? confidence : Math.max(10, confidence + 10)));
  const cardTitle =
    decisionLane === "SUPPRESS_REVIEW"
      ? "VEGA SUPPRESSION REVIEW"
      : decisionLane === "CALL_FIRST"
        ? "VEGA CALL-FIRST TASK"
        : decisionLane === "MANUAL_CONTACT_FORM"
          ? "VEGA MANUAL CONTACT TASK"
        : sendReady
          ? "Lead Command approval ready"
          : "VEGA RESEARCH REQUIRED";
  const nextAction =
    decisionLane === "CALL_FIRST"
      ? "Call the business or use the website contact form before email outreach."
      : decisionLane === "MANUAL_CONTACT_FORM"
        ? "Use the website contact form or research a verified phone/email path before email outreach."
      : sendReady
        ? "Approve or auto-send only after the copy and recipient are acceptable."
        : decisionLane === "SUPPRESS_REVIEW"
          ? "Review suppression and deliverability risk before any outreach."
          : "Find the owner, operator, office manager, or verified business email before drafting outreach.";
  const executionStatus = sendReady
    ? `${item.channel}:${item.provider}`
    : decisionLane === "CALL_FIRST"
      ? "Execution status: Call-first ready; email blocked until verified"
      : decisionLane === "MANUAL_CONTACT_FORM"
        ? "Execution status: Contact-form ready; email blocked until verified"
    : item.channel === "email"
      ? `Proposed channel: Email | Provider: ${item.provider || "n/a"} | Execution status: Blocked pending enrichment`
      : item.channel === "manual"
        ? `Proposed channel: Manual | Provider: ${item.provider || "operator"} | Execution status: Contact path research required`
        : `Proposed channel: ${item.channel || "n/a"} | Provider: ${item.provider || "n/a"} | Execution status: Blocked pending decision`;
  const researchObjective =
    decisionLane === "CALL_FIRST"
      ? "Confirm the best phone/contact-form path and identify who handles sales, estimates, operations, or vendor conversations."
      : decisionLane === "MANUAL_CONTACT_FORM"
        ? "Use the company website/contact form while researching a named decision-maker, verified email, or direct phone path."
      : decisionLane === "SUPPRESS_REVIEW"
        ? "Verify whether this lead, domain, or contact should stay suppressed before any new outreach."
        : "Identify the owner, operator, office manager, or verified business email.";
  const proposedOutreachAngle =
    confirmedIntent && scoreboard?.offerAngle && !/stale|missed|estimate request|quote request|old form|slow follow-up|slow response/i.test(scoreboard.offerAngle)
      ? scoreboard.offerAngle
      : lead?.niche
        ? `${lead.niche} inquiry follow-up and lead-response improvement`
        : "Lead-response and follow-up improvement";

  return {
    leadFit,
    intent,
    researchSignalScore: parsedSignal,
    opportunityTrust,
    contactConfidence: confidence,
    decisionLane,
    sendReady,
    cardTitle,
    cardText: `${cardTitle}: ${lead?.companyName || "Lead Command lead"}`,
    executionStatus,
    researchObjective,
    proposedOutreachAngle,
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
