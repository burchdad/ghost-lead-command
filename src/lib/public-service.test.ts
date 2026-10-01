import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { servicePlans } from "../config/service-plans";
import { publicVegaPlans } from "./public-homepage";
import { calculatePricing } from "./vega-launch-team";
import { buildStripeCheckoutLineItems } from "./stripe-checkout";

test("service policies are public while operator pages and APIs stay protected", async () => {
  const oldKey = process.env.LEAD_COMMAND_ACCESS_KEY;
  process.env.LEAD_COMMAND_ACCESS_KEY = "public-policy-regression-test";
  try {
    for (const path of ["/privacy", "/terms"]) {
      const response = await middleware(new NextRequest(`https://example.com${path}`));
      assert.equal(response.headers.get("x-middleware-next"), "1");
      assert.equal(response.headers.get("location"), null);
    }
    const operator = await middleware(new NextRequest("https://example.com/command"));
    assert.equal(operator.status, 307);
    assert.match(operator.headers.get("location") || "", /\/access\?next=%2Fcommand$/);
    const api = await middleware(new NextRequest("https://example.com/api/leads"));
    assert.equal(api.status, 401);
  } finally {
    if (oldKey === undefined) delete process.env.LEAD_COMMAND_ACCESS_KEY;
    else process.env.LEAD_COMMAND_ACCESS_KEY = oldKey;
  }
});

test("public prices, quotes, and Stripe charges agree for every public base plan", () => {
  for (const plan of publicVegaPlans) {
    const code = plan.code.toUpperCase() as keyof typeof servicePlans;
    const scope = servicePlans[code];
    const quote = calculatePricing({ productCode: code, leadAllowance: scope.leads, outreachAllowance: scope.outreach, researchAllowance: scope.research, managedCallAllowance: scope.calls, campaignCount: 1, territoryCount: 1, integrations: [], setupComplexity: "standard", contractTermMonths: 1 });
    assert.equal(quote.setupFeeCents, scope.setup);
    assert.equal(quote.recurringAmountCents, scope.recurring);
    assert.equal(quote.includedAllowances.leads, scope.leads);
    assert.equal(plan.name, scope.name);
    if (code !== "VEGA_MANAGED") assert.ok(plan.priceLabel.includes(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(scope.recurring / 100)));
    const items = buildStripeCheckoutLineItems({ productCode: code, setupFeeCents: quote.setupFeeCents, recurringAmountCents: quote.recurringAmountCents });
    assert.equal(items[0].price_data?.unit_amount, scope.setup);
    assert.equal(items[1].price_data?.unit_amount, scope.recurring);
    assert.equal(items[1].price_data?.product_data?.name, `Ghost Lead Command ${scope.name} monthly service`);
  }
});
