import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VegaProductCode } from "@prisma/client";
import {
  buildLaunchQa,
  buildPricingInput,
  calculatePricing,
  inferFactsFromMessage,
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
