import type { SourceLead } from "@/lib/sourcing";

export type SignalScoreboard = {
  total: number;
  tier: "hot" | "warm" | "research" | "hold";
  categories: {
    icpFit: number;
    buyerRole: number;
    contactability: number;
    buyingIntent: number;
    webProof: number;
    socialProof: number;
    offerFit: number;
    deliverabilitySafety: number;
  };
  reasons: string[];
  risks: string[];
  nextBestChannel: "email" | "phone" | "contact-form" | "linkedin-task" | "enrich" | "suppress-review";
  offerAngle: string;
  nextMove: string;
};

type ScoreboardInput = Partial<SourceLead> & {
  company?: { website?: string | null } | null;
  contact?: { email?: string | null; phone?: string | null; role?: string | null } | null;
  nextAction?: string | null;
  stage?: string | null;
  value?: number | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function cap(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function titleText(input: ScoreboardInput) {
  return clean(input.title || input.contact?.role);
}

function signalText(input: ScoreboardInput) {
  return [
    input.companyName,
    input.niche,
    input.source,
    titleText(input),
    input.buyerFit,
    input.confidence,
    input.signalSummary,
    input.nextAction,
    ...(input.intentSignals || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function contactPaths(input: ScoreboardInput) {
  const email = clean(input.email || input.contact?.email);
  const phone = clean(input.phone || input.contact?.phone);
  const website = clean(input.website || input.company?.website);
  return { email, phone, website };
}

function offerAngle(input: ScoreboardInput, text: string) {
  const niche = clean(input.niche).toLowerCase();
  if (includesAny(`${niche} ${text}`, ["hvac", "roofing", "contractor", "home service", "construction"])) {
    return "missed-call, estimate-request, and slow follow-up recovery sprint";
  }
  if (includesAny(text, ["hiring", "sales rep", "growth", "expansion", "funding", "launch"])) {
    return "speed-to-lead and booked-call conversion system for growth teams";
  }
  if (includesAny(text, ["review", "google", "rating", "local search", "maps"])) {
    return "local intent capture and review-to-booking workflow";
  }
  if (includesAny(text, ["linkedin", "social", "post", "comment", "profile", "competitor"])) {
    return "warm-signal outreach path from public intent into booked calls";
  }
  if (includesAny(text, ["reply", "booked", "pricing", "interested"])) {
    return "reply-to-calendar booking concierge";
  }
  return "lightweight AI follow-up layer that turns stale or missed conversations into booked calls";
}

function nextChannel(input: ScoreboardInput, risks: string[]) {
  const { email, phone, website } = contactPaths(input);
  const text = signalText(input);
  if (risks.some((risk) => /suppression|bounce|institutional|vendor/.test(risk))) return "suppress-review" as const;
  if (email) return "email" as const;
  if (includesAny(text, ["linkedin", "sales navigator", "profile"]) && !email) return "linkedin-task" as const;
  if (phone) return "phone" as const;
  if (website) return "contact-form" as const;
  return "enrich" as const;
}

export function buildSignalScoreboard(input: ScoreboardInput): SignalScoreboard {
  const text = signalText(input);
  const title = titleText(input).toLowerCase();
  const { email, phone, website } = contactPaths(input);
  const reasons: string[] = [];
  const risks: string[] = [];

  const icpFit = cap(
    8 +
      (input.score ? Math.round(Number(input.score) / 10) : 0) +
      (includesAny(text, ["hvac", "roofing", "contractor", "service", "saas", "consulting", "agency"]) ? 8 : 0) +
      (includesAny(text, ["association", "school", "university", "government", "city of", "municipal"]) ? -10 : 0),
    20,
  );
  if (icpFit >= 15) reasons.push("ICP match is strong enough for a money-path test");
  if (icpFit <= 8) risks.push("weak ICP or institutional/vendor fit");

  const buyerRole = cap(
    (includesAny(title, ["founder", "owner", "ceo", "president", "principal", "managing partner"]) ? 18 : 0) +
      (includesAny(title, ["vp", "head", "growth", "sales", "operations", "general manager", "director"]) ? 12 : 0) +
      (input.buyerFit && !/unclear|risk/i.test(input.buyerFit) ? 4 : 0),
    20,
  );
  if (buyerRole >= 12) reasons.push("decision-maker or operator role");
  if (!buyerRole) risks.push("buyer role is unclear");

  const contactability = cap((email ? 20 : 0) + (phone ? 10 : 0) + (website ? 6 : 0), 20);
  if (email) reasons.push("direct email path available");
  else if (phone || website) reasons.push("manual phone or website path available");
  else risks.push("no contact path yet");

  const buyingIntent = cap(
    (includesAny(text, ["missed", "quote", "estimate", "booking", "calendar", "lead flow", "follow-up", "conversion"]) ? 18 : 0) +
      (includesAny(text, ["hiring", "funding", "launch", "expansion", "growth", "paid ads", "traffic"]) ? 14 : 0) +
      (includesAny(text, ["interested", "pricing", "reply", "booked", "demo"]) ? 18 : 0) +
      Math.min(8, (input.intentSignals || []).length * 2),
    20,
  );
  if (buyingIntent >= 12) reasons.push("buyer-intent trigger present");
  if (buyingIntent < 6) risks.push("needs stronger trigger evidence");

  const webProof = cap(
    (website ? 8 : 0) +
      (includesAny(text, ["google", "maps", "review", "rating", "website", "search"]) ? 10 : 0) +
      (includesAny(text, ["perplexity", "public web", "mention"]) ? 6 : 0),
    15,
  );
  if (webProof >= 8) reasons.push("public web or Google signal supports context");

  const socialProof = cap(
    (includesAny(text, ["linkedin", "sales navigator", "profile", "social", "post", "comment", "competitor", "event"]) ? 14 : 0) +
      (input.source && /linkedin|sales navigator/i.test(input.source) ? 6 : 0),
    15,
  );
  if (socialProof >= 8) reasons.push("social or LinkedIn context can personalize outreach");

  const angle = offerAngle(input, text);
  const offerFit = cap(
    8 +
      (includesAny(angle, ["booking", "booked", "follow-up", "missed", "intent", "reply"]) ? 7 : 0) +
      (Number(input.value || 0) >= 5000 ? 3 : 0),
    10,
  );

  const deliverabilitySafety = cap(
    10 -
      (includesAny(text, ["bounce", "failed", "suppressed", "invalid email", "spam"]) ? 8 : 0) -
      (email && /@(gmail|yahoo|hotmail|outlook)\./i.test(email) ? 2 : 0),
    10,
  );
  if (deliverabilitySafety <= 4) risks.push("deliverability risk needs review");

  const categories = {
    icpFit,
    buyerRole,
    contactability,
    buyingIntent,
    webProof,
    socialProof,
    offerFit,
    deliverabilitySafety,
  };
  const total = cap(Object.values(categories).reduce((sum, value) => sum + value, 0), 100);
  const nextBestChannel = nextChannel(input, risks);
  const tier = total >= 85 ? "hot" : total >= 70 ? "warm" : total >= 55 ? "research" : "hold";
  const nextMove =
    nextBestChannel === "email"
      ? "Queue a short signal-led opener, then watch opens/clicks/replies."
      : nextBestChannel === "phone"
        ? "Call or verify email before email outreach."
        : nextBestChannel === "contact-form"
          ? "Use website/contact form or enrich a direct email."
          : nextBestChannel === "linkedin-task"
            ? "Create a manual Sales Navigator touch before email."
            : nextBestChannel === "suppress-review"
              ? "Hold outreach until suppression/deliverability risk is reviewed."
              : "Run enrichment before outreach.";

  return {
    total,
    tier,
    categories,
    reasons: reasons.slice(0, 5),
    risks: risks.slice(0, 5),
    nextBestChannel,
    offerAngle: angle,
    nextMove,
  };
}

export function signalScoreboardSummary(scoreboard: SignalScoreboard) {
  const reasons = scoreboard.reasons.length ? scoreboard.reasons.join("; ") : "needs more evidence";
  const risks = scoreboard.risks.length ? ` Risk: ${scoreboard.risks.join("; ")}.` : "";
  return `Signal score ${scoreboard.total} (${scoreboard.tier}). Channel: ${scoreboard.nextBestChannel}. Offer: ${scoreboard.offerAngle}. Why: ${reasons}.${risks}`;
}

