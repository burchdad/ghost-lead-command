import { servicePlanName } from "@/config/service-plans";
import Stripe from "stripe";

type CheckoutAmounts = {
  setupFeeCents: number;
  recurringAmountCents: number;
};

type CheckoutContext = CheckoutAmounts & {
  sessionId: string;
  proposalId: string;
  proposalVersion: number;
  productCode: string;
};

function stripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Secure checkout is not configured yet. Please ask Ghost Director for help.");
  return new Stripe(secretKey);
}

function publicAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

function planName(productCode: string) {
  return `Ghost Lead Command ${servicePlanName(productCode)}`;
}

export function buildStripeCheckoutLineItems(input: CheckoutAmounts & { productCode: string }): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const name = planName(input.productCode);

  if (input.setupFeeCents > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: input.setupFeeCents,
        product_data: { name: `${name} setup` },
      },
    });
  }

  if (input.recurringAmountCents > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: input.recurringAmountCents,
        recurring: { interval: "month" },
        product_data: { name: `${name} monthly service` },
      },
    });
  }

  if (!items.length) throw new Error("The accepted proposal does not contain a payable amount.");
  return items;
}

export async function createStripeCheckoutSession(input: CheckoutContext) {
  const stripe = stripeClient();
  const appUrl = publicAppUrl();
  const metadata = {
    onboardingSessionId: input.sessionId,
    proposalId: input.proposalId,
    proposalVersion: String(input.proposalVersion),
    productCode: input.productCode,
  };

  const checkout = await stripe.checkout.sessions.create(
    {
      mode: input.recurringAmountCents > 0 ? "subscription" : "payment",
      client_reference_id: input.sessionId,
      line_items: buildStripeCheckoutLineItems(input),
      metadata,
      subscription_data: input.recurringAmountCents > 0 ? { metadata } : undefined,
      success_url: `${appUrl}/onboarding/ai?sessionId=${encodeURIComponent(input.sessionId)}&checkout=success`,
      cancel_url: `${appUrl}/onboarding/ai?sessionId=${encodeURIComponent(input.sessionId)}&checkout=canceled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    },
    { idempotencyKey: `onboarding:${input.sessionId}:proposal:${input.proposalId}:v${input.proposalVersion}` },
  );
  if (!checkout.url) throw new Error("Stripe did not return a secure checkout URL.");
  return checkout;
}

export function constructStripeEvent(payload: string, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return stripeClient().webhooks.constructEvent(payload, signature, webhookSecret);
}
