import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VegaProductCode } from "@prisma/client";
import {
  buildLaunchQa,
  buildPricingInput,
  calculatePricing,
  inferFactsFromMessage,
  parseAiOnboardingFacts,
  recommendProduct,
  selectNextMissingFact,
  upsertFact,
  type CommercialFact,
} from "@/lib/vega-launch-team";

const now = new Date().toISOString();

function fact(key: CommercialFact["key"], value: string, confirmed = true): CommercialFact {
  return {
    key,
    value,
    source: confirmed ? "customer" : "inference",
    confidence: confirmed ? 0.95 : 0.78,
    inferred: !confirmed,
    confirmed,
    requiredFor: ["proposal", "pricing", "launch"],
    evidence: [value],
    updatedAt: now,
  };
}

describe("Vega Launch Team fact engine", () => {
  it("selects the highest-impact missing fact without repeating known facts", () => {
    const facts = [
      fact("businessIdentity", "Bright Mobile Detail"),
      fact("businessWebsite", "https://bright.example"),
      fact("serviceOrProduct", "mobile detailing"),
    ];

    const first = selectNextMissingFact(facts);
    assert.equal(first?.key, "targetCustomer");

    const updated = upsertFact(facts, fact("targetCustomer", "dealerships and fleets"));
    const second = selectNextMissingFact(updated);
    assert.equal(second?.key, "territory");
  });

  it("keeps inferred facts separate from customer-confirmed facts", () => {
    const facts = inferFactsFromMessage("I run a mobile detailing company in Tyler, Texas within 40 miles.");
    const target = facts.find((item) => item.key === "targetCustomer");
    const service = facts.find((item) => item.key === "serviceOrProduct");

    assert.equal(service?.confirmed, true);
    assert.equal(target?.inferred, true);
    assert.equal(target?.confirmed, false);
  });

  it("captures the sales manager lead-update email as its own onboarding fact", () => {
    const facts = inferFactsFromMessage("Send daily lead updates to the sales manager at manager@naks.example.");
    const updateEmail = facts.find((item) => item.key === "salesUpdateRecipientEmail");

    assert.equal(updateEmail?.value, "manager@naks.example");
    assert.equal(updateEmail?.confirmed, true);
  });

  it("captures a commercial exterior-cleaning client brief from one message", () => {
    const facts = inferFactsFromMessage(
      "Naks Exterior Services wants commercial window cleaning and exterior cleaning contracts around Tyler, Texas. Send daily lead updates and call tasks to sales@naks.com. The sales manager will handle phone follow-up.",
    );
    const business = facts.find((item) => item.key === "businessIdentity");
    const service = facts.find((item) => item.key === "serviceOrProduct");
    const target = facts.find((item) => item.key === "targetCustomer");
    const updateEmail = facts.find((item) => item.key === "salesUpdateRecipientEmail");
    const phoneOwner = facts.find((item) => item.key === "phoneFollowUpResponsibility");

    assert.equal(business?.value, "Naks Exterior Services");
    assert.equal(service?.value, "commercial window cleaning and exterior cleaning");
    assert.match(target?.value || "", /property managers/);
    assert.match(facts.find((item) => item.key === "territory")?.value || "", /Tyler, Texas/);
    assert.equal(updateEmail?.value, "sales@naks.com");
    assert.equal(phoneOwner?.value, "client sales manager");
  });

  it("treats a short confirmation as approval of Vega's pending inferred fact", () => {
    const initial = inferFactsFromMessage(
      "Naks Exterior Services wants commercial window cleaning and exterior cleaning contracts around Tyler, Texas. Send daily lead updates and call tasks to sales@naks.com. The sales manager will handle phone follow-up.",
    );
    const before = initial.find((item) => item.key === "targetCustomer");
    assert.equal(before?.confirmed, false);

    const confirmed = inferFactsFromMessage("thats correct", initial);
    const target = confirmed.find((item) => item.key === "targetCustomer");
    const next = selectNextMissingFact(confirmed);

    assert.equal(target?.confirmed, true);
    assert.equal(target?.inferred, false);
    assert.notEqual(next?.key, "targetCustomer");
  });

  it("accepts natural-language confirmation without repeating the same question", () => {
    const initial = inferFactsFromMessage(
      "Naks Exterior Services wants commercial window cleaning and exterior cleaning contracts around Tyler, Texas. Send daily lead updates and call tasks to sales@naks.com. The sales manager will handle phone follow-up.",
    );
    const confirmed = inferFactsFromMessage("that is correct", initial);
    const target = confirmed.find((item) => item.key === "targetCustomer");
    const next = selectNextMissingFact(confirmed);

    assert.equal(target?.confirmed, true);
    assert.equal(target?.source, "customer");
    assert.notEqual(next?.key, "targetCustomer");
  });

  it("does not let secondary website discovery block commercial progression", () => {
    const initial = [
      fact("businessIdentity", "Naks Exterior Services"),
      fact("serviceOrProduct", "commercial window cleaning and exterior cleaning"),
      fact("targetCustomer", "property managers and storefronts"),
      fact("territory", "Tyler, Texas"),
    ];
    assert.equal(selectNextMissingFact(initial)?.key, "desiredOutcome");
    assert.notEqual(selectNextMissingFact(initial)?.key, "businessWebsite");
  });

  it("captures secondary operating evidence when the customer provides context", () => {
    const initial = [
      fact("businessIdentity", "Naks Exterior Services"),
      fact("businessWebsite", "No public website yet"),
      fact("serviceOrProduct", "commercial window cleaning and exterior cleaning"),
      fact("targetCustomer", "property managers and storefronts"),
      fact("territory", "Tyler, Texas"),
    ];
    const facts = inferFactsFromMessage("We can handle 30 new customers or jobs per month", initial);
    const capacity = facts.find((item) => item.key === "serviceCapacity");

    assert.equal(capacity?.value, "30 new customers or jobs per month");
    assert.equal(capacity?.confirmed, true);
    assert.equal(capacity?.source, "customer");
    assert.equal(selectNextMissingFact(facts)?.key, "desiredOutcome");
  });

  it("extracts several secondary facts from one natural-language answer", () => {
    const throughCapacity = [
      fact("businessIdentity", "Naks Exterior Services"),
      fact("businessWebsite", "No public website yet"),
      fact("serviceOrProduct", "commercial window cleaning and exterior cleaning"),
      fact("targetCustomer", "property managers and storefronts"),
      fact("territory", "Tyler, Texas"),
      fact("serviceCapacity", "30 new customers or jobs per month"),
    ];

    const withValue = inferFactsFromMessage("A customer is worth about $1500 and we want 40 qualified leads per month", throughCapacity);
    assert.equal(withValue.find((item) => item.key === "averageCustomerValue")?.value, "$1500 per customer or job");
    assert.equal(withValue.find((item) => item.key === "desiredLeadVolume")?.value, "40 qualified leads per month");
  });

  it("advances through launch-critical facts without forcing the secondary questionnaire", () => {
    const answers: Partial<Record<CommercialFact["key"], string>> = {
      businessIdentity: "Naks Exterior Services",
      serviceOrProduct: "commercial window and exterior cleaning",
      targetCustomer: "property managers and commercial building owners",
      territory: "Tyler and nearby cities",
      desiredOutcome: "booked appointments",
      outreachResponsibility: "Vega should auto-send inside guardrails",
      phoneFollowUpResponsibility: "my sales manager",
      salesUpdateRecipientEmail: "sales@naks.com",
    };
    let facts: CommercialFact[] = [];
    const visited: string[] = [];

    for (let step = 0; step < 30; step += 1) {
      const next = selectNextMissingFact(facts);
      if (!next) break;
      if (next.reason === "inferred-fact-confirmation") {
        const before = next.key;
        facts = inferFactsFromMessage("that is correct", facts);
        assert.notEqual(selectNextMissingFact(facts)?.key, before, `Vega repeated confirmation for ${before}`);
        continue;
      }
      visited.push(next.key);
      const answer = answers[next.key];
      assert.ok(answer, `Missing regression answer for ${next.key}`);
      const before = next.key;
      facts = inferFactsFromMessage(answer, facts);
      assert.notEqual(selectNextMissingFact(facts)?.key, before, `Vega repeated ${before}`);
    }

    assert.equal(selectNextMissingFact(facts), null);
    for (const key of Object.keys(answers) as CommercialFact["key"][]) {
      const captured = facts.find((item) => item.key === key);
      assert.equal(captured?.confirmed, true, `${key} was not confirmed`);
    }
    const launchCritical = new Set(["businessIdentity", "serviceOrProduct", "targetCustomer", "territory", "desiredOutcome", "outreachResponsibility", "phoneFollowUpResponsibility", "salesUpdateRecipientEmail"]);
    assert.ok(visited.length >= 5, "The flow should still collect a useful commercial brief");
    assert.ok(visited.every((key) => launchCritical.has(key)), "Secondary facts must not become blocking questionnaire steps");
  });

  it("turns a rejected inferred confirmation into a direct correction", () => {
    const initial = [
      fact("businessIdentity", "Naks Exterior Services"),
      fact("businessWebsite", "No public website yet"),
      fact("serviceOrProduct", "commercial exterior cleaning"),
      fact("targetCustomer", "homeowners", false),
    ];

    const corrected = inferFactsFromMessage("No, property managers and commercial building owners", initial);
    const target = corrected.find((item) => item.key === "targetCustomer");

    assert.equal(target?.confirmed, true);
    assert.match(target?.value || "", /property managers/);
    assert.notEqual(selectNextMissingFact(corrected)?.key, "targetCustomer");
  });

  it("parses OpenAI onboarding facts from structured JSON without accepting unknown keys", () => {
    const facts = parseAiOnboardingFacts(
      {
        facts: [
          {
            key: "averageCustomerValue",
            value: "$1,200 per commercial cleaning contract",
            confidence: 0.91,
            confirmed: true,
            evidence: "Most commercial cleaning contracts are around $1,200.",
          },
          {
            key: "unknownField",
            value: "should be ignored",
            confidence: 0.99,
            confirmed: true,
            evidence: "bad",
          },
        ],
        notes: [],
      },
      "Most commercial cleaning contracts are around $1,200.",
    );

    assert.equal(facts.length, 1);
    assert.equal(facts[0]?.key, "averageCustomerValue");
    assert.equal(facts[0]?.confirmed, true);
  });
});

describe("Vega Launch Team product and pricing", () => {
  it("recommends Reach for customer-assisted auto-send campaigns", () => {
    const facts = [
      fact("desiredLeadVolume", "60"),
      fact("automationPreference", "auto-send inside Vega safety guardrails"),
      fact("phoneFollowUpResponsibility", "customer team or VA"),
    ];

    const recommendation = recommendProduct(facts);
    assert.equal(recommendation.productCode, VegaProductCode.VEGA_REACH);
  });

  it("calculates deterministic pricing and quote expiration", () => {
    const input = buildPricingInput(VegaProductCode.VEGA_REACH, [fact("desiredLeadVolume", "80")]);
    const quote = calculatePricing(input);

    assert.equal(quote.currency, "usd");
    assert.equal(quote.billingInterval, "month");
    assert.ok(quote.setupFeeCents > 0);
    assert.ok(quote.recurringAmountCents > 0);
    assert.ok(new Date(quote.expiration).getTime() > Date.now());
  });

  it("rejects unauthorized discounts", () => {
    assert.throws(
      () => calculatePricing({
        productCode: VegaProductCode.VEGA_CONVERT,
        leadAllowance: 100,
        outreachAllowance: 50,
        campaignCount: 1,
        territoryCount: 1,
        researchAllowance: 100,
        managedCallAllowance: 0,
        integrations: [],
        setupComplexity: "standard",
        contractTermMonths: 1,
        authorizedDiscountCents: 100000,
      }),
      /Unauthorized discount/,
    );
  });
});

describe("Vega Launch Team launch QA", () => {
  it("blocks launch when required facts, payment, sender, or scheduling are missing", () => {
    const qa = buildLaunchQa({
      facts: [fact("businessIdentity", "Bright Mobile Detail"), fact("serviceOrProduct", "mobile detailing")],
      quoteAccepted: false,
      paymentVerified: false,
      senderIdentityReady: false,
      schedulingReady: false,
      dryRunOnly: true,
    });

    assert.equal(qa.status, "NOT_READY");
    assert.ok(qa.blockers.some((blocker) => blocker.key === "planAcceptance"));
    assert.ok(qa.blockers.some((blocker) => blocker.key === "senderIdentity"));
  });
});
