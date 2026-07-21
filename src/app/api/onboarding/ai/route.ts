import { NextResponse } from "next/server";
import {
  continueCommercialOnboarding,
  createCommercialProposal,
  createCommercialQuote,
  createHostedCheckout,
  getCommercialOnboardingSession,
  provisionCommercialWorkspace,
  startCommercialOnboarding,
} from "@/lib/vega-launch-team";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await getCommercialOnboardingSession(sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "message");

    if (action === "start") {
      const session = await startCommercialOnboarding({
        visitorId: body.visitorId ? String(body.visitorId) : undefined,
        message: body.message ? String(body.message) : undefined,
      });
      return NextResponse.json({ session });
    }

    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required for this action" }, { status: 400 });
    }
    const sessionId = String(body.sessionId);

    if (action === "message") {
      const session = await continueCommercialOnboarding({ sessionId, message: String(body.message || "") });
      return NextResponse.json({ session });
    }

    if (action === "quote") {
      const quote = await createCommercialQuote(sessionId);
      const session = await getCommercialOnboardingSession(sessionId);
      return NextResponse.json({ quote, session });
    }

    if (action === "proposal") {
      const proposal = await createCommercialProposal(sessionId);
      const session = await getCommercialOnboardingSession(sessionId);
      return NextResponse.json({ proposal, session });
    }

    if (action === "checkout") {
      const checkout = await createHostedCheckout(sessionId, String(body.billingConfirmation || ""));
      const session = await getCommercialOnboardingSession(sessionId);
      return NextResponse.json({ checkout, session });
    }

    if (action === "provision") {
      const provisioned = await provisionCommercialWorkspace(sessionId, String(body.paymentEventId || ""));
      const session = await getCommercialOnboardingSession(provisioned.id);
      return NextResponse.json({ provisioned, session });
    }

    return NextResponse.json({ error: `Unsupported onboarding action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "Vega commercial onboarding failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
