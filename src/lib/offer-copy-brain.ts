import { sanitizeCustomerMessage, sanitizeSubject } from "@/lib/message-sanitizer";

export type OfferAngle =
  | "missed-call recovery"
  | "quote follow-up"
  | "dead lead revival"
  | "speed-to-lead"
  | "booked-call engine"
  | "no-show recovery"
  | "old CRM reactivation";

export type OfferCopyLead = {
  name?: string | null;
  companyName?: string | null;
  niche?: string | null;
  source?: string | null;
  nextAction?: string | null;
  score?: number | null;
  value?: number | null;
};

export type OfferCopyScorecard = {
  total: number;
  specificity: number;
  pain: number;
  offer: number;
  question: number;
  plainLanguage: number;
  oneAsk: number;
  notes: string[];
  angle: OfferAngle;
};

type ImproveInput = {
  subject?: string | null;
  body?: string | null;
  lead?: OfferCopyLead | null;
  mode?: "first-touch" | "rewrite" | "follow-up";
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function firstName(name?: string | null) {
  const value = clean(name);
  if (!value || /^team at/i.test(value)) return "there";
  return value.split(/\s+/)[0] || "there";
}

function lowerText(input: ImproveInput) {
  return [
    input.subject,
    input.body,
    input.lead?.niche,
    input.lead?.source,
    input.lead?.nextAction,
    input.lead?.companyName,
  ].map(clean).join(" ").toLowerCase();
}

export function selectOfferAngle(lead?: OfferCopyLead | null): OfferAngle {
  const text = [
    lead?.niche,
    lead?.source,
    lead?.nextAction,
    lead?.companyName,
  ].map(clean).join(" ").toLowerCase();

  if (/dead|old crm|reactivat|stale/.test(text)) return "dead lead revival";
  if (/quote|estimate|proposal|bid/.test(text)) return "quote follow-up";
  if (/missed call|phone|call path|call/.test(text)) return "missed-call recovery";
  if (/no[-\s]?show|appointment/.test(text)) return "no-show recovery";
  if (/form fill|speed|respond|follow-up|lead flow/.test(text)) return "speed-to-lead";
  if (/crm|database|pipeline/.test(text)) return "old CRM reactivation";
  return "booked-call engine";
}

function painFor(angle: OfferAngle, niche: string) {
  const label = niche.toLowerCase();
  switch (angle) {
    case "missed-call recovery":
      return `missed calls and after-hours requests from ${label} buyers`;
    case "quote follow-up":
      return `quotes or estimate requests that do not get followed up until the buyer answers`;
    case "dead lead revival":
      return `older leads that showed interest once but never turned into a booked conversation`;
    case "speed-to-lead":
      return `new inquiries that go cold because follow-up is too slow or inconsistent`;
    case "no-show recovery":
      return `no-shows and half-interested prospects that still need a clean next step`;
    case "old CRM reactivation":
      return `unworked CRM contacts that could still turn into booked calls`;
    default:
      return `interested ${label} buyers who never make it onto the calendar`;
  }
}

function outcomeFor(angle: OfferAngle) {
  switch (angle) {
    case "missed-call recovery":
      return "catch missed conversations and turn more of them into booked calls";
    case "quote follow-up":
      return "keep following up on open quotes until buyers book, reply, or opt out";
    case "dead lead revival":
      return "revive old contacts and route interested replies into booking";
    case "speed-to-lead":
      return "respond faster, classify replies, and move interested people toward a call";
    case "no-show recovery":
      return "recover no-shows with clean follow-up and booking prompts";
    case "old CRM reactivation":
      return "turn stale CRM records into fresh conversations";
    default:
      return "find the leads already leaking and turn them into sales conversations";
  }
}

function subjectFor(angle: OfferAngle) {
  switch (angle) {
    case "missed-call recovery":
      return "missed call follow-up";
    case "quote follow-up":
      return "quote follow-up question";
    case "dead lead revival":
      return "old lead follow-up";
    case "speed-to-lead":
      return "speed-to-lead question";
    case "no-show recovery":
      return "no-show follow-up";
    case "old CRM reactivation":
      return "old CRM leads";
    default:
      return "quick lead-flow question";
  }
}

export function offerCopyPrompt(lead?: OfferCopyLead | null) {
  const angle = selectOfferAngle(lead);
  const niche = clean(lead?.niche) || "business";
  return [
    "Use this outbound strategy layer:",
    `- Primary offer angle: ${angle}.`,
    `- Pain to surface: ${painFor(angle, niche)}.`,
    `- Outcome to imply: ${outcomeFor(angle)}.`,
    "- Copy posture: question-led, plainspoken, low-pressure, and diagnosis before pitch.",
    "- Strong draft checks: specific reason for this prospect, concrete pain, concrete outcome, one curiosity question, no hype, no guarantee, no calendar-link ask in the first touch.",
    "- Do not name sales books, frameworks, or persuasion methods in customer-facing copy.",
  ].join("\n");
}

function removeHype(body: string) {
  return body
    .replace(/\b(revolutionary|game[-\s]?changing|unlock|transform|skyrocket|guaranteed|explode your|dominate)\b/gi, "improve")
    .replace(/\bAI-powered\b/gi, "lightweight")
    .replace(/\s+$/gm, "");
}

function wordCount(value: string) {
  return clean(value).split(/\s+/).filter(Boolean).length;
}

function questionCount(value: string) {
  return (value.match(/\?/g) || []).length;
}

function buildFormulaEmail(input: ImproveInput) {
  const lead = input.lead || {};
  const angle = selectOfferAngle(lead);
  const company = clean(lead.companyName) || "your team";
  const niche = clean(lead.niche) || "business";
  const name = firstName(lead.name);
  const pain = painFor(angle, niche);
  const outcome = outcomeFor(angle);
  const signal = clean(lead.nextAction)
    .replace(/^AI agent sourced\s+/i, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);

  const opener = signal && !/manual contact path/i.test(signal)
    ? `Noticed ${signal.charAt(0).toLowerCase()}${signal.slice(1)}`
    : `Noticed ${company} looks like a fit for a tighter ${niche.toLowerCase()} follow-up path.`;

  const body = [
    `${name}, quick question.`,
    "",
    `${opener}`,
    "",
    `Are you doing anything right now to catch ${pain} before they go cold?`,
    "",
    `Reason I ask: we help teams ${outcome} without replacing the CRM or adding more admin work.`,
    "",
    "Worth me showing where this usually finds the fastest wins?",
  ].join("\n");

  return {
    subject: subjectFor(angle),
    body,
  };
}

export function scoreOfferCopy(input: ImproveInput): OfferCopyScorecard {
  const text = lowerText(input);
  const body = clean(input.body);
  const lead = input.lead || {};
  const company = clean(lead.companyName).toLowerCase();
  const niche = clean(lead.niche).toLowerCase();
  const angle = selectOfferAngle(lead);
  const notes: string[] = [];

  const specificity =
    (company && text.includes(company) ? 16 : 0) +
    (niche && text.includes(niche) ? 10 : 0) +
    (/noticed|saw|looks like|signal|around|near|local|team at/i.test(body) ? 9 : 0);
  if (specificity < 20) notes.push("Needs a clearer prospect-specific reason.");

  const pain = /missed|slow|old|stale|quote|estimate|form|follow[-\s]?up|no[-\s]?show|leak|cold|unworked|calendar/i.test(body) ? 20 : 0;
  if (!pain) notes.push("Needs a concrete business pain.");

  const offer = /booked call|booked calls|reply|replies|recover|catch|route|calendar|conversation|crm|admin/i.test(body) ? 18 : 0;
  if (!offer) notes.push("Needs a concrete outcome.");

  const questions = questionCount(body);
  const question = questions >= 1 ? 14 : 0;
  if (!question) notes.push("Needs a curiosity-led question.");

  const hypeFree = !/\b(revolutionary|game[-\s]?changing|unlock|transform|skyrocket|guaranteed|dominate)\b/i.test(body);
  const plainLanguage = hypeFree && wordCount(body) <= 130 ? 16 : hypeFree ? 9 : 0;
  if (plainLanguage < 16) notes.push("Too long or too hype-heavy.");

  const oneAsk = questions <= 2 && !/calendly|book a demo|schedule a demo|click here/i.test(body) ? 12 : 0;
  if (!oneAsk) notes.push("Use one low-friction ask, not a demo push.");

  return {
    total: Math.min(100, specificity + pain + offer + question + plainLanguage + oneAsk),
    specificity: Math.min(35, specificity),
    pain,
    offer,
    question,
    plainLanguage,
    oneAsk,
    notes,
    angle,
  };
}

export function improveOfferCopy(input: ImproveInput) {
  const generated = {
    subject: sanitizeSubject(input.subject || subjectFor(selectOfferAngle(input.lead))),
    body: sanitizeCustomerMessage(removeHype(input.body || ""), { channel: "email" }),
  };

  const score = scoreOfferCopy({ ...input, ...generated });
  const needsRepair = score.total < 76 || wordCount(generated.body) > 135 || questionCount(generated.body) === 0;
  const repaired = needsRepair ? buildFormulaEmail(input) : generated;
  const final = {
    subject: sanitizeSubject(repaired.subject),
    body: sanitizeCustomerMessage(removeHype(repaired.body), { channel: "email" }),
  };
  const finalScore = scoreOfferCopy({ ...input, ...final });

  return {
    ...final,
    scorecard: finalScore,
    repaired: needsRepair,
    reason: `Offer copy ${needsRepair ? "repaired" : "approved"}: ${finalScore.total}/100, angle ${finalScore.angle}.`,
  };
}
