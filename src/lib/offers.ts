type OfferLead = {
  companyName?: string | null;
  niche?: string | null;
  stage?: string | null;
  score?: number | null;
  value?: number | null;
  source?: string | null;
  nextAction?: string | null;
};

type OfferInteraction = {
  channel?: string | null;
  direction?: string | null;
  body?: string | null;
  classification?: string | null;
};

export type OfferRecommendation = {
  planName: string;
  setupFee: number;
  monthlyFee: number;
  revSharePct: number;
  pilotDays: number;
  estimatedPipelineValue: number;
  painSignal: string;
  pricingRationale: string;
  scope: string[];
  decisionCriteria: string[];
  paymentTerms: string;
  disclaimer: string;
};

export function buildOfferRecommendation(
  lead: OfferLead,
  interactions: OfferInteraction[] = [],
): OfferRecommendation {
  const company = lead.companyName || "the client";
  const niche = lead.niche || "business";
  const score = Number(lead.score || 0);
  const estimatedPipelineValue = Math.max(Number(lead.value || 0), 3500);
  const source = (lead.source || "").toLowerCase();
  const stage = (lead.stage || "").toLowerCase();
  const context = interactions
    .map((interaction) => `${interaction.classification || ""} ${interaction.body || ""}`)
    .join(" ")
    .toLowerCase();

  const isFreshSourced =
    source.includes("people data labs") ||
    source.includes("ghost lead agent") ||
    lead.nextAction?.toLowerCase().includes("first-touch");
  const hasBuyingSignal =
    score >= 90 ||
    stage.includes("booked") ||
    stage.includes("replied") ||
    /\b(pricing|price|cost|interested|book|schedule|call|demo|proposal)\b/.test(context);

  const setupFee = estimatedPipelineValue >= 10000 || score >= 95 ? 3500 : estimatedPipelineValue >= 6500 ? 2500 : 1500;
  const monthlyFee = hasBuyingSignal ? 1500 : 1000;
  const revSharePct = estimatedPipelineValue >= 10000 ? 10 : 12;
  const planName = isFreshSourced ? "Fresh Lead Capture Sprint" : "Lead Recovery Sprint";
  const painSignal = isFreshSourced
    ? `${company} needs a fast first-touch workflow that turns sourced ${niche.toLowerCase()} contacts into qualified replies without manual list work.`
    : `${company} likely has paid-for leads, calls, or inquiries that need structured follow-up before more acquisition spend is added.`;

  return {
    planName,
    setupFee,
    monthlyFee,
    revSharePct,
    pilotDays: 7,
    estimatedPipelineValue,
    painSignal,
    pricingRationale: `Pricing is anchored to an estimated $${estimatedPipelineValue.toLocaleString()} opportunity, score ${score || "n/a"}, and ${hasBuyingSignal ? "visible buying intent" : "early-stage qualification"}.`,
    scope: [
      "Confirm the highest-leverage lead segment and import or source the first batch.",
      "Score and dedupe contacts before any outreach is queued.",
      "Draft email/SMS touches with operator approval and suppression guardrails.",
      "Classify replies into hot, nurture, objection, booked, or do-not-contact.",
      "Route booked opportunities into call prep, proposal follow-up, CRM sync, and attribution.",
    ],
    decisionCriteria: [
      "Qualified replies created from the selected segment.",
      "Booked calls or clear buying signals surfaced inside the command center.",
      "Follow-up speed improves without adding manual admin work.",
      "Pipeline value and source attribution are visible enough to decide whether to expand.",
    ],
    paymentTerms:
      "50% of the setup fee is due to start. The remaining 50% is due at pilot completion before ongoing monthly optimization begins.",
    disclaimer:
      "Client remains responsible for hosting, licensing, API usage, phone/email provider costs, compliance approvals, and any third-party platform fees required to operate the system.",
  };
}

export function formatOfferContext(offer: OfferRecommendation) {
  return [
    `Recommended offer: ${offer.planName}`,
    `Setup fee: $${offer.setupFee.toLocaleString()}`,
    `Monthly response desk: $${offer.monthlyFee.toLocaleString()}/mo`,
    `Optional upside share: ${offer.revSharePct}%`,
    `Pilot length: ${offer.pilotDays} days`,
    `Pain signal: ${offer.painSignal}`,
    `Pricing rationale: ${offer.pricingRationale}`,
    `Scope: ${offer.scope.join(" | ")}`,
    `Decision criteria: ${offer.decisionCriteria.join(" | ")}`,
    `Payment terms: ${offer.paymentTerms}`,
    `Disclaimer: ${offer.disclaimer}`,
  ].join("\n");
}
