import type { Prisma } from "@prisma/client";
import {
  AIOnboardingStatus,
  CommercialProposalStatus,
  LaunchReadinessStatus,
  VegaLaunchAgentType,
  VegaProductCode,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type CommercialFactKey =
  | "businessIdentity"
  | "businessWebsite"
  | "serviceOrProduct"
  | "targetCustomer"
  | "territory"
  | "serviceCapacity"
  | "averageCustomerValue"
  | "growthObjective"
  | "desiredLeadVolume"
  | "desiredOutcome"
  | "outreachResponsibility"
  | "phoneFollowUpResponsibility"
  | "bestOffer"
  | "differentiators"
  | "contactIdentity"
  | "replyPath"
  | "schedulingPath"
  | "automationPreference"
  | "planAcceptance"
  | "billingConfirmation";

export type CommercialFact = {
  key: CommercialFactKey;
  value: string;
  source: "customer" | "research" | "inference" | "system";
  confidence: number;
  inferred: boolean;
  confirmed: boolean;
  requiredFor: string[];
  evidence: string[];
  updatedAt: string;
};

export type LaunchAgentContract = {
  agentType: VegaLaunchAgentType;
  purpose: string;
  allowedInputs: string[];
  outputSchema: Record<string, string>;
  allowedTools: string[];
  workspaceScope: "none" | "session" | "workspace";
  customerVisible: boolean;
  promptVersion: string;
  model: string;
  timeoutMs: number;
  costBudgetCents: number;
  escalationConditions: string[];
};

export type PricingInput = {
  productCode: VegaProductCode;
  leadAllowance: number;
  outreachAllowance: number;
  campaignCount: number;
  territoryCount: number;
  researchAllowance: number;
  managedCallAllowance: number;
  integrations: string[];
  setupComplexity: "standard" | "advanced" | "white_label";
  contractTermMonths: number;
  authorizedDiscountCents?: number;
  customOverrideApproved?: boolean;
};

export type PricingQuoteOutput = {
  setupFeeCents: number;
  recurringAmountCents: number;
  billingInterval: "month";
  includedAllowances: {
    leads: number;
    outreach: number;
    campaigns: number;
    territories: number;
    research: number;
    managedCalls: number;
  };
  overageRules: string[];
  discount: { amountCents: number; reason: string };
  subtotal: number;
  finalAmount: number;
  currency: "usd";
  priceVersion: string;
  expiration: string;
  lineItems: Array<{ label: string; amountCents: number; type: "setup" | "recurring" | "discount" }>;
};

const PRICE_VERSION = "vega-commercial-2026-07-20";
const PROMPT_VERSION = "vega-launch-team-v1";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export const VEGA_LAUNCH_TEAM_CONTRACTS: Record<VegaLaunchAgentType, LaunchAgentContract> = {
  VEGA_CONCIERGE: contract(
    VegaLaunchAgentType.VEGA_CONCIERGE,
    "Customer-facing supervisor that runs the commercial onboarding conversation and delegates to specialists.",
    ["customer message", "session state", "specialist outputs"],
    { response: "customer-visible answer", nextQuestion: "highest-leverage adaptive question" },
    true,
    ["low confidence", "security concern", "billing dispute", "human requested"],
  ),
  BUSINESS_DISCOVERY_AGENT: contract(
    VegaLaunchAgentType.BUSINESS_DISCOVERY_AGENT,
    "Collects and researches business identity, services, sales process, capacity, and bottlenecks.",
    ["commercial facts", "website", "customer statements"],
    { businessProfileDraft: "grounded business profile", missingInformation: "unanswered discovery facts" },
    false,
    ["contradictory identity", "regulated business", "unsupported claim"],
  ),
  MARKET_STRATEGY_AGENT: contract(
    VegaLaunchAgentType.MARKET_STRATEGY_AGENT,
    "Recommends buyer categories, territories, signals, exclusions, and qualification criteria.",
    ["business profile", "customer corrections", "territory"],
    { targetMarketDraft: "structured market strategy", recommendations: "buyer segment recommendations" },
    false,
    ["unusual compliance", "market too broad", "low confidence"],
  ),
  OFFER_ARCHITECT: contract(
    VegaLaunchAgentType.OFFER_ARCHITECT,
    "Turns confirmed services into grounded positioning, CTA, proof, objections, and phone openers.",
    ["business profile", "target market", "confirmed claims"],
    { offerDraft: "campaign-ready offer", prohibitedClaims: "claims Vega must not make" },
    false,
    ["performance guarantee requested", "unconfirmed proof point"],
  ),
  CAMPAIGN_ARCHITECT: contract(
    VegaLaunchAgentType.CAMPAIGN_ARCHITECT,
    "Builds dry-run campaign configuration, channel policy, sequence, and success metrics.",
    ["offer", "target market", "capacity", "automation preference"],
    { campaignDraft: "dry-run campaign config", liveSendReadiness: "safety state" },
    false,
    ["live sending requested before approval", "sender-health risk"],
  ),
  PRODUCT_ADVISOR: contract(
    VegaLaunchAgentType.PRODUCT_ADVISOR,
    "Recommends the right Vega product and explains responsibilities, exclusions, and alternatives.",
    ["business goals", "capacity", "campaign complexity", "budget signals"],
    { productRecommendation: "product fit with alternatives" },
    true,
    ["white-label request", "managed scope beyond capacity"],
  ),
  PRICING_AGENT: contract(
    VegaLaunchAgentType.PRICING_AGENT,
    "Explains deterministic pricing quotes without altering authorized values.",
    ["product recommendation", "pricing input", "authorized discounts"],
    { pricingQuote: "server-calculated quote explanation" },
    true,
    ["custom pricing", "unauthorized discount", "contract negotiation"],
  ),
  PROPOSAL_AGENT: contract(
    VegaLaunchAgentType.PROPOSAL_AGENT,
    "Creates versioned commercial proposals from approved campaign, product, and quote data.",
    ["campaign draft", "offer draft", "quote"],
    { proposal: "versioned proposal summary" },
    true,
    ["revision requiring repricing", "contract negotiation"],
  ),
  BILLING_CONCIERGE: contract(
    VegaLaunchAgentType.BILLING_CONCIERGE,
    "Confirms billing terms and hands the customer to a hosted checkout provider.",
    ["accepted proposal", "explicit billing confirmation"],
    { checkoutAction: "hosted checkout link or mock adapter state" },
    true,
    ["billing dispute", "refund request", "payment failure"],
  ),
  PROVISIONING_AGENT: contract(
    VegaLaunchAgentType.PROVISIONING_AGENT,
    "Idempotently creates workspace, subscription, entitlements, tasks, and launch checklist after verified payment.",
    ["verified payment event", "accepted proposal"],
    { provisioningStatus: "idempotent provisioning result" },
    false,
    ["workspace authorization issue", "duplicate webhook conflict"],
  ),
  LAUNCH_QA_AGENT: contract(
    VegaLaunchAgentType.LAUNCH_QA_AGENT,
    "Blocks or approves dry-run and live launch readiness using server-side safety checks.",
    ["workspace", "subscription", "campaign", "provider health"],
    { launchReadiness: "readiness status with blockers and remediations" },
    false,
    ["provider health blocked", "sender identity missing", "live-send unsafe"],
  ),
};

function contract(
  agentType: VegaLaunchAgentType,
  purpose: string,
  allowedInputs: string[],
  outputSchema: Record<string, string>,
  customerVisible: boolean,
  escalationConditions: string[],
): LaunchAgentContract {
  return {
    agentType,
    purpose,
    allowedInputs,
    outputSchema: {
      ...outputSchema,
      confidence: "0-1 confidence score",
      missingInformation: "missing facts or empty array",
      inferredFacts: "facts inferred but not confirmed",
      factsRequiringConfirmation: "facts that need customer confirmation",
      recommendations: "structured recommendations",
      blockers: "hard blockers",
      nextRecommendedAgent: "next Vega Launch Team specialist",
    },
    allowedTools: ["session-facts", "public-research-adapter", "deterministic-pricing", "mock-checkout", "launch-qa"],
    workspaceScope: agentType === VegaLaunchAgentType.VEGA_CONCIERGE ? "session" : "workspace",
    customerVisible,
    promptVersion: PROMPT_VERSION,
    model: MODEL,
    timeoutMs: 30000,
    costBudgetCents: customerVisible ? 12 : 8,
    escalationConditions,
  };
}

const requiredFacts: CommercialFactKey[] = [
  "businessIdentity",
  "businessWebsite",
  "serviceOrProduct",
  "targetCustomer",
  "territory",
  "serviceCapacity",
  "averageCustomerValue",
  "growthObjective",
  "desiredLeadVolume",
  "desiredOutcome",
  "outreachResponsibility",
  "phoneFollowUpResponsibility",
  "bestOffer",
  "differentiators",
  "contactIdentity",
  "replyPath",
  "schedulingPath",
  "automationPreference",
  "planAcceptance",
  "billingConfirmation",
];

const factQuestions: Record<CommercialFactKey, string> = {
  businessIdentity: "What is the business name Vega should build this around?",
  businessWebsite: "Do you have a website or public page Vega can use to understand the business?",
  serviceOrProduct: "What service or product are we selling first?",
  targetCustomer: "Who are the best customers to win first?",
  territory: "What territory should Vega focus on?",
  serviceCapacity: "How many new customers or jobs can the team realistically handle per month?",
  averageCustomerValue: "Roughly what is a good new customer worth?",
  growthObjective: "What growth target should this campaign support?",
  desiredLeadVolume: "How many qualified leads do you want Vega to source each month?",
  desiredOutcome: "What outcome matters most: more replies, booked calls, proposals, or closed jobs?",
  outreachResponsibility: "Should Vega draft only, send after approval, or auto-send inside guardrails?",
  phoneFollowUpResponsibility: "Who will call warm leads after email: you, your team, a VA, or Ghost?",
  bestOffer: "What is the lowest-friction offer we can put in front of prospects?",
  differentiators: "What makes this business meaningfully different from competitors?",
  contactIdentity: "Who should prospects see as the sender or point of contact?",
  replyPath: "Where should replies go so nothing gets missed?",
  schedulingPath: "What calendar or booking path should Vega use for interested prospects?",
  automationPreference: "How much autonomy do you want Vega to have at launch?",
  planAcceptance: "Do you approve the recommended Vega plan and scope?",
  billingConfirmation: "Please confirm the exact setup fee, recurring amount, billing interval, allowances, overage behavior, and cancellation terms before checkout.",
};

export function normalizeFacts(input: unknown): CommercialFact[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isCommercialFact);
}

function isCommercialFact(value: unknown): value is CommercialFact {
  const candidate = value as Partial<CommercialFact>;
  return Boolean(candidate && typeof candidate.key === "string" && typeof candidate.value === "string");
}

export function upsertFact(facts: CommercialFact[], fact: Omit<CommercialFact, "updatedAt">) {
  const next: CommercialFact = { ...fact, updatedAt: new Date().toISOString() };
  return [...facts.filter((item) => item.key !== fact.key), next];
}

export function selectNextMissingFact(facts: CommercialFact[]) {
  const known = new Set(facts.filter((fact) => fact.confirmed || (fact.inferred && fact.confidence >= 0.86)).map((fact) => fact.key));
  const confirmationNeeded = facts.find((fact) => fact.inferred && !fact.confirmed && fact.confidence < 0.95);
  if (confirmationNeeded) {
    return {
      key: confirmationNeeded.key,
      question: `I have ${confirmationNeeded.key} as "${confirmationNeeded.value}". Is that right?`,
      reason: "inferred-fact-confirmation",
    };
  }

  const missing = requiredFacts.find((key) => !known.has(key));
  if (!missing) return null;
  return { key: missing, question: factQuestions[missing], reason: "highest-impact-missing-fact" };
}

export function inferFactsFromMessage(message: string, existingFacts: CommercialFact[] = []) {
  const facts = [...existingFacts];
  const text = message.trim();
  const lower = text.toLowerCase();
  const add = (key: CommercialFactKey, value: string, confidence = 0.78, confirmed = true) => {
    facts.splice(
      0,
      facts.length,
      ...upsertFact(facts, {
        key,
        value,
        source: confirmed ? "customer" : "inference",
        confidence,
        inferred: !confirmed,
        confirmed,
        requiredFor: ["proposal", "pricing", "launch"],
        evidence: [text.slice(0, 240)],
      }),
    );
  };

  const website = text.match(/https?:\/\/[^\s]+|(?:www\.)[^\s]+/i)?.[0];
  if (website) add("businessWebsite", website);

  const desiredVolume = lower.match(/(?:need|want|source|get|generate)\s+(\d{1,4})\s+(?:new\s+)?(?:leads|prospects|appointments)/);
  if (desiredVolume) add("desiredLeadVolume", desiredVolume[1]);

  const radius = lower.match(/within\s+(\d{1,3})\s*(?:mile|mi)/);
  const location = text.match(/\bin\s+([A-Z][A-Za-z .'-]+,\s*[A-Z]{2}|[A-Z][A-Za-z .'-]+,\s*Texas)/);
  if (location || radius) add("territory", `${location?.[1] || "customer-defined area"}${radius ? ` within ${radius[1]} miles` : ""}`);

  if (/\b(detailing|mobile detail|auto detail|automobile detailing|car detailing)\b/.test(lower)) {
    add("serviceOrProduct", "mobile automobile detailing");
    add("targetCustomer", "dealerships, fleets, auto referral partners, and local vehicle-heavy businesses", 0.72, false);
  } else if (/\b(hvac|air conditioning|heating)\b/.test(lower)) {
    add("serviceOrProduct", "HVAC services");
    add("targetCustomer", "homeowners, property managers, contractors, and local service referral partners", 0.7, false);
  }

  if (/\b(dealership|fleet|fleets)\b/.test(lower)) add("targetCustomer", "dealerships and fleet operators");
  if (/\b(auto[- ]?send|automate|automatic)\b/.test(lower)) add("automationPreference", "auto-send inside Vega safety guardrails");
  if (/\b(office manager|va|assistant|team)\b/.test(lower)) add("phoneFollowUpResponsibility", "customer team or VA");
  if (/\b(?:ghost handles calls|managed calls|done for me)\b/.test(lower)) add("phoneFollowUpResponsibility", "Ghost managed calling");

  return facts;
}

export function recommendProduct(facts: CommercialFact[]) {
  const byKey = factMap(facts);
  const volume = Number(byKey.desiredLeadVolume?.value || 0);
  const phone = byKey.phoneFollowUpResponsibility?.value.toLowerCase() || "";
  const automation = byKey.automationPreference?.value.toLowerCase() || "";
  const wantsManaged = phone.includes("ghost") || automation.includes("done for");
  const productCode =
    wantsManaged ? VegaProductCode.VEGA_MANAGED :
    volume >= 150 ? VegaProductCode.VEGA_CONVERT :
    volume >= 40 || automation.includes("auto") ? VegaProductCode.VEGA_REACH :
    VegaProductCode.VEGA_SCOUT;

  const alternatives = {
    lower: productCode === VegaProductCode.VEGA_SCOUT ? null : VegaProductCode.VEGA_SCOUT,
    higher: productCode === VegaProductCode.VEGA_MANAGED ? VegaProductCode.VEGA_WHITE_LABEL : VegaProductCode.VEGA_MANAGED,
  };

  return {
    productCode,
    why:
      productCode === VegaProductCode.VEGA_MANAGED
        ? "The campaign needs Ghost involvement beyond software coordination."
        : productCode === VegaProductCode.VEGA_REACH
          ? "The business wants sourced leads plus outreach automation, while still keeping human follow-up in-house."
          : productCode === VegaProductCode.VEGA_CONVERT
            ? "The desired lead volume needs deeper routing, phone-assist, and conversion workflow."
            : "The business is still validating source quality and can start with scout-level intelligence.",
    vegaHandles: ["source and qualify accounts", "build dry-run campaign", "draft compliant outreach", "track replies and engagement"],
    customerHandles: wantsManaged ? ["approve scope", "attend sales calls"] : ["approve launch", "handle phone follow-up", "confirm booking path"],
    excluded: ["unverified claims", "live billing without hosted checkout", "live outreach during onboarding", "guaranteed revenue outcomes"],
    alternatives,
  };
}

export function calculatePricing(input: PricingInput): PricingQuoteOutput {
  if ((input.authorizedDiscountCents || 0) > 50000 && !input.customOverrideApproved) {
    throw new Error("Unauthorized discount requires HUMAN_REVIEW.");
  }
  const base = {
    VEGA_SCOUT: { setup: 75000, recurring: 50000, leads: 50, outreach: 0, research: 50, calls: 0 },
    VEGA_REACH: { setup: 150000, recurring: 100000, leads: 150, outreach: 75, research: 150, calls: 0 },
    VEGA_CONVERT: { setup: 250000, recurring: 175000, leads: 300, outreach: 150, research: 300, calls: 50 },
    VEGA_MANAGED: { setup: 400000, recurring: 350000, leads: 500, outreach: 250, research: 500, calls: 150 },
    VEGA_WHITE_LABEL: { setup: 750000, recurring: 500000, leads: 750, outreach: 350, research: 750, calls: 200 },
  }[input.productCode];

  const extraCampaigns = Math.max(0, input.campaignCount - 1) * 35000;
  const extraTerritories = Math.max(0, input.territoryCount - 1) * 20000;
  const advancedSetup = input.setupComplexity === "advanced" ? 75000 : input.setupComplexity === "white_label" ? 200000 : 0;
  const integrationSetup = input.integrations.length * 15000;
  const setupFeeCents = base.setup + extraCampaigns + extraTerritories + advancedSetup + integrationSetup;
  const recurringAmountCents =
    base.recurring +
    Math.max(0, input.leadAllowance - base.leads) * 600 +
    Math.max(0, input.outreachAllowance - base.outreach) * 900 +
    Math.max(0, input.managedCallAllowance - base.calls) * 1200;
  const discountAmount = Math.max(0, input.authorizedDiscountCents || 0);
  const subtotal = setupFeeCents + recurringAmountCents;
  const expiration = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

  return {
    setupFeeCents,
    recurringAmountCents,
    billingInterval: "month",
    includedAllowances: {
      leads: Math.max(input.leadAllowance, base.leads),
      outreach: Math.max(input.outreachAllowance, base.outreach),
      campaigns: input.campaignCount,
      territories: input.territoryCount,
      research: Math.max(input.researchAllowance, base.research),
      managedCalls: Math.max(input.managedCallAllowance, base.calls),
    },
    overageRules: [
      "$6 per additional researched lead",
      "$9 per additional approved outreach send",
      "$12 per additional managed call attempt when managed calling is purchased",
    ],
    discount: { amountCents: discountAmount, reason: discountAmount ? "Authorized Ghost discount" : "None" },
    subtotal,
    finalAmount: subtotal - discountAmount,
    currency: "usd",
    priceVersion: PRICE_VERSION,
    expiration,
    lineItems: [
      { label: "One-time setup", amountCents: setupFeeCents, type: "setup" },
      { label: "Monthly Vega subscription", amountCents: recurringAmountCents, type: "recurring" },
      ...(discountAmount ? [{ label: "Authorized discount", amountCents: -discountAmount, type: "discount" as const }] : []),
    ],
  };
}

export function buildPricingInput(productCode: VegaProductCode, facts: CommercialFact[]): PricingInput {
  const byKey = factMap(facts);
  const requested = Math.max(25, Number(byKey.desiredLeadVolume?.value || 75));
  const managedCalls = byKey.phoneFollowUpResponsibility?.value.toLowerCase().includes("ghost") ? Math.ceil(requested / 2) : 0;
  return {
    productCode,
    leadAllowance: requested,
    outreachAllowance: productCode === VegaProductCode.VEGA_SCOUT ? 0 : Math.ceil(requested / 2),
    campaignCount: 1,
    territoryCount: Math.max(1, (byKey.territory?.value.match(/,/g)?.length || 0) + 1),
    researchAllowance: requested,
    managedCallAllowance: managedCalls,
    integrations: [],
    setupComplexity: productCode === VegaProductCode.VEGA_WHITE_LABEL ? "white_label" : "standard",
    contractTermMonths: 1,
  };
}

export function buildLaunchQa(input: {
  facts: CommercialFact[];
  quoteAccepted?: boolean;
  paymentVerified?: boolean;
  senderIdentityReady?: boolean;
  schedulingReady?: boolean;
  dryRunOnly?: boolean;
}) {
  const confirmed = new Set(input.facts.filter((fact) => fact.confirmed).map((fact) => fact.key));
  const blockers: Array<{ key: string; remediation: string }> = requiredFacts
    .filter((key) => !["planAcceptance", "billingConfirmation"].includes(key))
    .filter((key) => !confirmed.has(key))
    .map((key) => ({ key, remediation: factQuestions[key] }));
  if (!input.quoteAccepted) blockers.push({ key: "planAcceptance", remediation: "Customer must explicitly approve the proposal scope." });
  if (!input.paymentVerified) blockers.push({ key: "billingConfirmation", remediation: "Use hosted checkout or authorized manual activation before provisioning." });
  if (!input.senderIdentityReady) blockers.push({ key: "senderIdentity", remediation: "Verify sender identity before live sending." });
  if (!input.schedulingReady) blockers.push({ key: "schedulingPath", remediation: "Connect or confirm a calendar booking path." });

  const status =
    blockers.length === 0 && !input.dryRunOnly
      ? LaunchReadinessStatus.READY_FOR_LIVE
      : blockers.length <= 3
        ? LaunchReadinessStatus.READY_FOR_CUSTOMER_REVIEW
        : input.facts.length >= 8
          ? LaunchReadinessStatus.READY_FOR_DRY_RUN
          : LaunchReadinessStatus.NOT_READY;

  return { status, blockers, remediations: blockers.map((item) => item.remediation) };
}

export async function startCommercialOnboarding(input: { visitorId?: string; message?: string }) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.create({
    data: {
      visitorId: input.visitorId,
      status: AIOnboardingStatus.STARTED,
      currentAgent: VegaLaunchAgentType.VEGA_CONCIERGE,
      currentObjective: "Understand the business and growth goal.",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    },
  });

  await prisma.aIOnboardingMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      agentType: VegaLaunchAgentType.VEGA_CONCIERGE,
      content: "Tell me about your business and the customers you want more of. I will shape the lead engine around how you actually sell.",
    },
  });

  if (input.message) {
    return continueCommercialOnboarding({ sessionId: session.id, message: input.message });
  }

  return getCommercialOnboardingSession(session.id);
}

export async function continueCommercialOnboarding(input: { sessionId: string; message: string }) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: input.sessionId }, include: { messages: true } });
  if (!session) throw new Error("Onboarding session not found.");

  await prisma.aIOnboardingMessage.create({
    data: { sessionId: session.id, role: "customer", content: input.message },
  });

  const facts = inferFactsFromMessage(input.message, normalizeFacts(session.collectedFacts));
  const recommendation = recommendProduct(facts);
  const quoteInput = buildPricingInput(recommendation.productCode, facts);
  const quote = calculatePricing(quoteInput);
  const qa = buildLaunchQa({ facts, dryRunOnly: true });
  const next = selectNextMissingFact(facts);
  const status = next
    ? statusForMissingFact(next.key)
    : AIOnboardingStatus.REVIEWING_PROPOSAL;

  const agentOutput = {
    confidence: facts.length >= 6 ? 0.84 : 0.68,
    missingInformation: next ? [next.key] : [],
    inferredFacts: facts.filter((fact) => fact.inferred && !fact.confirmed),
    factsRequiringConfirmation: facts.filter((fact) => fact.inferred && !fact.confirmed),
    recommendations: [recommendation],
    blockers: qa.blockers,
    nextRecommendedAgent: next ? VegaLaunchAgentType.VEGA_CONCIERGE : VegaLaunchAgentType.PROPOSAL_AGENT,
  };

  await recordAgentRun({
    onboardingSessionId: session.id,
    workspaceId: session.workspaceId || undefined,
    agentType: VegaLaunchAgentType.VEGA_CONCIERGE,
    input: { message: input.message, currentStatus: session.status },
    structuredOutput: agentOutput,
    confidence: agentOutput.confidence,
  });

  const reply = next
    ? buildConciergeQuestion(facts, recommendation, next.question)
    : buildProposalReadyMessage(recommendation, quote);

  const updated = await prisma.aIOnboardingSession.update({
    where: { id: session.id },
    data: {
      status,
      currentAgent: VegaLaunchAgentType.VEGA_CONCIERGE,
      currentObjective: next ? `Collect ${next.key}` : "Review proposal and pricing.",
      collectedFacts: facts as unknown as Prisma.InputJsonValue,
      confirmedFacts: facts.filter((fact) => fact.confirmed) as unknown as Prisma.InputJsonValue,
      inferredFacts: facts.filter((fact) => fact.inferred) as unknown as Prisma.InputJsonValue,
      missingRequiredFacts: (next ? [next.key] : []) as Prisma.InputJsonValue,
      businessProfileDraft: buildBusinessProfileDraft(facts) as Prisma.InputJsonValue,
      targetMarketDraft: buildTargetMarketDraft(facts) as Prisma.InputJsonValue,
      offerDraft: buildOfferDraft(facts) as Prisma.InputJsonValue,
      campaignDraft: buildCampaignDraft(facts, recommendation.productCode) as Prisma.InputJsonValue,
      productRecommendation: recommendation as unknown as Prisma.InputJsonValue,
      launchReadiness: qa.status,
      lastActivityAt: new Date(),
    },
  });

  await prisma.aIOnboardingMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: reply,
      agentType: VegaLaunchAgentType.VEGA_CONCIERGE,
      structuredParts: { recommendation, nextQuestion: next, launchReadiness: qa } as unknown as Prisma.InputJsonValue,
    },
  });

  return getCommercialOnboardingSession(updated.id);
}

export async function createCommercialQuote(sessionId: string) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Onboarding session not found.");
  const facts = normalizeFacts(session.collectedFacts);
  const recommendation = recommendProduct(facts);
  const input = buildPricingInput(recommendation.productCode, facts);
  const quote = calculatePricing(input);
  const record = await prisma.pricingQuote.create({
    data: {
      workspaceId: session.workspaceId,
      onboardingSessionId: session.id,
      productCode: recommendation.productCode,
      inputConfiguration: input as unknown as Prisma.InputJsonValue,
      lineItems: quote.lineItems as unknown as Prisma.InputJsonValue,
      totals: quote as unknown as Prisma.InputJsonValue,
      authorizedDiscounts: quote.discount as unknown as Prisma.InputJsonValue,
      priceVersion: quote.priceVersion,
      expiresAt: new Date(quote.expiration),
    },
  });
  await prisma.aIOnboardingSession.update({ where: { id: session.id }, data: { pricingQuoteId: record.id, status: AIOnboardingStatus.PRICING } });
  return record;
}

export async function createCommercialProposal(sessionId: string) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: sessionId }, include: { commercialProposals: true } });
  if (!session) throw new Error("Onboarding session not found.");
  const quote = session.pricingQuoteId
    ? await prisma.pricingQuote.findUnique({ where: { id: session.pricingQuoteId } })
    : await createCommercialQuote(session.id);
  if (!quote) throw new Error("Pricing quote not found.");

  const version = Math.max(0, ...session.commercialProposals.map((proposal) => proposal.version)) + 1;
  const campaign = (session.campaignDraft || {}) as Prisma.JsonObject;
  const proposal = await prisma.commercialProposal.create({
    data: {
      onboardingSessionId: session.id,
      workspaceId: session.workspaceId,
      version,
      productCode: quote.productCode,
      fulfillmentMode: quote.productCode === VegaProductCode.VEGA_MANAGED ? "managed" : "customer-assisted",
      campaignSummary: campaign,
      targetMarket: (session.targetMarketDraft || {}) as Prisma.InputJsonValue,
      territory: { value: factMap(normalizeFacts(session.collectedFacts)).territory?.value || "to confirm" },
      offer: (session.offerDraft || {}) as Prisma.InputJsonValue,
      vegaResponsibilities: ["source", "score", "draft", "monitor", "coordinate phone-assist"] as Prisma.InputJsonValue,
      customerResponsibilities: ["approve launch", "complete follow-up calls unless managed", "attend booked meetings"] as Prisma.InputJsonValue,
      allowances: (quote.totals as Prisma.JsonObject)?.includedAllowances || {},
      setupScope: ["business profile", "target market", "dry-run campaign", "approval workflow"] as Prisma.InputJsonValue,
      recurringScope: ["lead sourcing", "outreach coordination", "reply monitoring", "reporting"] as Prisma.InputJsonValue,
      billingSummary: quote.totals || {},
      limitations: ["No live outreach during onboarding", "No invented claims", "No guaranteed revenue outcomes"] as Prisma.InputJsonValue,
      termsReference: "Ghost AI Solutions standard commercial terms; final legal terms reviewed at checkout.",
      pricingQuoteId: quote.id,
      status: CommercialProposalStatus.PRESENTED,
    },
  });
  await prisma.aIOnboardingSession.update({ where: { id: session.id }, data: { proposalId: proposal.id, status: AIOnboardingStatus.REVIEWING_PROPOSAL } });
  return proposal;
}

export async function createHostedCheckout(sessionId: string, explicitBillingConfirmation: string) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: sessionId } });
  if (!session?.proposalId) throw new Error("Proposal must be presented before checkout.");
  if (!hasExplicitBillingConfirmation(explicitBillingConfirmation)) {
    await createHumanReviewTask(sessionId, "Billing confirmation was not explicit enough for checkout.");
    throw new Error("Explicit billing confirmation is required before hosted checkout.");
  }
  const checkoutSessionId = `mock_checkout_${session.proposalId}`;
  await prisma.aIOnboardingSession.update({
    where: { id: session.id },
    data: { checkoutSessionId, status: AIOnboardingStatus.AWAITING_CHECKOUT, lastActivityAt: new Date() },
  });
  return {
    checkoutSessionId,
    provider: "mock-hosted-checkout",
    url: `${process.env.NEXT_PUBLIC_APP_URL || "https://leadgen.ghostai.solutions"}/onboarding/ai?checkout=${checkoutSessionId}`,
  };
}

export async function provisionCommercialWorkspace(sessionId: string, paymentEventId: string) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Onboarding session not found.");
  if (!paymentEventId.startsWith("verified_") && !paymentEventId.startsWith("manual_")) {
    throw new Error("Provisioning requires verified payment or authorized manual activation.");
  }
  const workspace = session.workspaceId ? { id: session.workspaceId } : await getDefaultWorkspace();
  const updated = await prisma.aIOnboardingSession.update({
    where: { id: session.id },
    data: {
      workspaceId: workspace.id,
      subscriptionId: session.subscriptionId || `sub_${session.id}`,
      status: AIOnboardingStatus.PROVISIONING,
      provisioningStatus: "workspace-entitlements-and-launch-checklist-created",
      lastActivityAt: new Date(),
    },
  });
  await recordAgentRun({
    onboardingSessionId: session.id,
    workspaceId: workspace.id,
    agentType: VegaLaunchAgentType.PROVISIONING_AGENT,
    input: { paymentEventId },
    structuredOutput: { provisioningStatus: updated.provisioningStatus, idempotent: true },
    confidence: 0.98,
  });
  return updated;
}

export async function getCommercialOnboardingSession(sessionId: string) {
  const prisma = getPrisma();
  return prisma.aIOnboardingSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      launchAgentRuns: { orderBy: { createdAt: "desc" }, take: 10 },
      pricingQuotes: { orderBy: { createdAt: "desc" }, take: 3 },
      commercialProposals: { orderBy: [{ version: "desc" }], take: 3 },
      humanReviewTasks: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

async function recordAgentRun(input: {
  onboardingSessionId: string;
  workspaceId?: string;
  agentType: VegaLaunchAgentType;
  input: Record<string, unknown>;
  structuredOutput: Record<string, unknown>;
  confidence: number;
}) {
  const prisma = getPrisma();
  return prisma.launchAgentRun.create({
    data: {
      onboardingSessionId: input.onboardingSessionId,
      workspaceId: input.workspaceId,
      agentType: input.agentType,
      status: "completed",
      input: input.input as Prisma.InputJsonValue,
      structuredOutput: input.structuredOutput as Prisma.InputJsonValue,
      promptVersion: PROMPT_VERSION,
      model: MODEL,
      confidence: input.confidence,
      cost: 0,
      completedAt: new Date(),
    },
  });
}

async function createHumanReviewTask(sessionId: string, reason: string) {
  const prisma = getPrisma();
  const session = await prisma.aIOnboardingSession.findUnique({ where: { id: sessionId } });
  return prisma.humanReviewTask.create({
    data: {
      workspaceId: session?.workspaceId,
      onboardingSessionId: sessionId,
      reason,
      priority: "high",
      payload: { reason } as Prisma.InputJsonValue,
    },
  });
}

function factMap(facts: CommercialFact[]) {
  return facts.reduce<Partial<Record<CommercialFactKey, CommercialFact>>>((acc, fact) => {
    acc[fact.key] = fact;
    return acc;
  }, {});
}

function statusForMissingFact(key: CommercialFactKey) {
  if (["businessIdentity", "businessWebsite", "serviceOrProduct", "serviceCapacity"].includes(key)) return AIOnboardingStatus.DISCOVERING_BUSINESS;
  if (["targetCustomer", "territory", "desiredLeadVolume"].includes(key)) return AIOnboardingStatus.RESEARCHING_MARKET;
  if (["bestOffer", "differentiators"].includes(key)) return AIOnboardingStatus.BUILDING_OFFER;
  if (["outreachResponsibility", "phoneFollowUpResponsibility", "replyPath", "schedulingPath", "automationPreference"].includes(key)) {
    return AIOnboardingStatus.DESIGNING_CAMPAIGN;
  }
  if (key === "billingConfirmation") return AIOnboardingStatus.AWAITING_CHECKOUT;
  return AIOnboardingStatus.RECOMMENDING_PRODUCT;
}

function buildConciergeQuestion(facts: CommercialFact[], recommendation: ReturnType<typeof recommendProduct>, question: string) {
  const profile = buildBusinessProfileDraft(facts);
  return [
    profile.service ? `Got it. I am shaping this around ${profile.service}.` : "Got it. I am starting the commercial brief.",
    `Right now I would likely steer this toward ${recommendation.productCode.replace("VEGA_", "Vega ")} because ${recommendation.why}`,
    question,
  ].join("\n\n");
}

function buildProposalReadyMessage(recommendation: ReturnType<typeof recommendProduct>, quote: PricingQuoteOutput) {
  return [
    `I have enough to prepare a proposal. The current fit is ${recommendation.productCode.replace("VEGA_", "Vega ")}.`,
    `Deterministic quote: ${money(quote.setupFeeCents)} setup and ${money(quote.recurringAmountCents)}/mo before any authorized discount.`,
    "I can present the proposal for confirmation, then hand you to secure hosted checkout. I will keep launch in dry-run until payment, sender identity, reply path, and scheduling are verified.",
  ].join("\n\n");
}

function buildBusinessProfileDraft(facts: CommercialFact[]) {
  const byKey = factMap(facts);
  return {
    businessName: byKey.businessIdentity?.value || "to confirm",
    website: byKey.businessWebsite?.value || "to confirm",
    service: byKey.serviceOrProduct?.value || "to confirm",
    growthObjective: byKey.growthObjective?.value || "to confirm",
    averageCustomerValue: byKey.averageCustomerValue?.value || "to confirm",
    confirmedKeys: facts.filter((fact) => fact.confirmed).map((fact) => fact.key),
  };
}

function buildTargetMarketDraft(facts: CommercialFact[]) {
  const byKey = factMap(facts);
  return {
    targetCustomerGroups: byKey.targetCustomer?.value || "to confirm",
    territory: byKey.territory?.value || "to confirm",
    exclusions: [],
    buyingSignals: ["recent demand signal", "public website/contact path", "service fit"],
    qualificationCriteria: ["reachable contact", "territory match", "offer fit"],
  };
}

function buildOfferDraft(facts: CommercialFact[]) {
  const byKey = factMap(facts);
  const service = byKey.serviceOrProduct?.value || "service";
  return {
    offerName: `${service} growth conversation`,
    primaryValueProposition: `Help qualified prospects understand whether ${service} is the right next step.`,
    customerProblem: "Good prospects do not always get timely, relevant follow-up.",
    lowFrictionEntryOffer: byKey.bestOffer?.value || "short consultation or estimate review",
    callToAction: "Compare the current process with a focused lead-to-appointment workflow.",
    approvedClaims: facts.filter((fact) => fact.confirmed).map((fact) => `${fact.key}: ${fact.value}`),
    prohibitedClaims: ["guaranteed revenue", "fake testimonials", "unconfirmed certifications"],
    phoneOpener: "I am following up on a quick note about a lead-flow opportunity we noticed for your business.",
  };
}

function buildCampaignDraft(facts: CommercialFact[], productCode: VegaProductCode) {
  const byKey = factMap(facts);
  return {
    campaignName: `${byKey.serviceOrProduct?.value || "Vega"} launch campaign`,
    serviceIndustry: byKey.serviceOrProduct?.value || "to confirm",
    targetCustomerGroups: byKey.targetCustomer?.value || "to confirm",
    territory: byKey.territory?.value || "to confirm",
    leadQuantity: Number(byKey.desiredLeadVolume?.value || 50),
    qualificationThreshold: 75,
    outreachChannels: productCode === VegaProductCode.VEGA_SCOUT ? ["research"] : ["email", "phone-assist"],
    approvalBehavior: "Slack or dashboard approval required until launch QA approves more autonomy.",
    dryRun: true,
    liveSendReadiness: "not-ready-during-onboarding",
  };
}

function hasExplicitBillingConfirmation(message: string) {
  const lower = message.toLowerCase();
  return (
    /\b(confirm|approved|approve|accept|accepted|agree)\b/.test(lower) &&
    /\b(setup|one[- ]time)\b/.test(lower) &&
    /\b(month|monthly|recurring)\b/.test(lower) &&
    /\b(allowance|included|overage)\b/.test(lower)
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
