import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createLeadFromContactCardPayload } from "@/lib/contact-card-automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

function isAuthorized(request: Request) {
  const expectedSecret = process.env.CONTACT_CARD_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    return true;
  }

  const authorization = request.headers.get("authorization") || "";
  const providedSecret = authorization.replace(/^Bearer\s+/i, "").trim();

  return providedSecret === expectedSecret;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = asObject(await request.json());
    const recordType = asString(payload.recordType, "event");
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const shouldCreateLead = ["lead", "product_intake", "stripe_checkout_completed"].includes(recordType);
    const lead = shouldCreateLead ? await createLeadFromContactCardPayload(payload) : null;

    const event = await prisma.automationEvent.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead?.id || null,
        title: `Contact card ${recordType}`,
        detail: asString(payload.sourceDetail, asString(payload.eventName, "Inbound contact card payload")),
        status: "received",
        type: "contact_card_webhook",
        payload: payload as Prisma.InputJsonObject,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        received: true,
        recordType,
        leadId: lead?.id || null,
        eventId: event.id,
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
