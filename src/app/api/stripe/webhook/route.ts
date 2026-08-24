import type Stripe from "stripe";
import { AIOnboardingStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { constructStripeEvent } from "@/lib/stripe-checkout";
import { provisionCommercialWorkspace } from "@/lib/vega-launch-team";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  try {
    const event = constructStripeEvent(await request.text(), signature);
    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
      return NextResponse.json({ received: true });
    }

    const checkout = event.data.object as Stripe.Checkout.Session;
    const onboardingSessionId = checkout.metadata?.onboardingSessionId || checkout.client_reference_id;
    if (!onboardingSessionId) throw new Error("Checkout is missing onboarding session metadata.");
    if (checkout.payment_status !== "paid") {
      return NextResponse.json({ received: true, paymentPending: true });
    }

    const prisma = getPrisma();
    const onboarding = await prisma.aIOnboardingSession.findUnique({ where: { id: onboardingSessionId } });
    if (!onboarding) throw new Error("Checkout references an unknown onboarding session.");
    if (onboarding.provisioningStatus) return NextResponse.json({ received: true, alreadyProvisioned: true });

    await prisma.aIOnboardingSession.update({
      where: { id: onboardingSessionId },
      data: {
        checkoutSessionId: checkout.id,
        subscriptionId: typeof checkout.subscription === "string" ? checkout.subscription : undefined,
        status: AIOnboardingStatus.PAID,
        lastActivityAt: new Date(),
      },
    });
    await provisionCommercialWorkspace(onboardingSessionId, `verified_${event.id}`);
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Stripe webhook failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
