import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStripeCheckoutLineItems } from "./stripe-checkout.ts";

test("Stripe checkout contains versioned setup and recurring plan charges", () => {
  const items = buildStripeCheckoutLineItems({ productCode: "VEGA_SCOUT", setupFeeCents: 95000, recurringAmountCents: 65000 });
  assert.equal(items.length, 2);
  assert.equal(items[0].price_data?.unit_amount, 95000);
  assert.equal(items[1].price_data?.unit_amount, 65000);
  assert.equal(items[1].price_data?.recurring?.interval, "month");
});

test("Stripe checkout rejects an empty accepted proposal", () => {
  assert.throws(
    () => buildStripeCheckoutLineItems({ productCode: "VEGA_SCOUT", setupFeeCents: 0, recurringAmountCents: 0 }),
    /payable amount/,
  );
});

test("onboarding checkout is proposal-bound and Stripe webhook provisioning is signature-bound", () => {
  const launchSource = readFileSync(new URL("./vega-launch-team.ts", import.meta.url), "utf8");
  const checkoutSource = readFileSync(new URL("./stripe-checkout.ts", import.meta.url), "utf8");
  const webhookSource = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  assert.match(launchSource, /proposalId && proposal\.id !== proposalId/);
  assert.match(launchSource, /CommercialProposalStatus\.ACCEPTED/);
  assert.match(checkoutSource, /idempotencyKey/);
  assert.match(checkoutSource, /onboardingSessionId/);
  assert.match(webhookSource, /stripe-signature/);
  assert.match(webhookSource, /checkout\.payment_status !== "paid"/);
  assert.match(webhookSource, /onboarding\.provisioningStatus/);
  assert.match(webhookSource, /verified_\$\{event\.id\}/);
});
