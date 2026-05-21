import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getLeadShape(payload: Record<string, unknown>) {
  if (payload.recordType === "product_intake") {
    const buyer = asObject(payload.buyer);
    return {
      name: asString(buyer.name, "Contact Card Buyer"),
      email: asString(buyer.email),
      phone: asString(buyer.phone),
      companyName: asString(buyer.businessName, "Contact Card Buyer"),
      niche: "Contact Card Product",
      stage: "Product Intake",
      score: 82,
      value: 499,
      source: "contact_card_product_page",
      nextAction: "Review intake and start the contact card build."
    };
  }

  if (payload.recordType === "stripe_checkout_completed") {
    const buyer = asObject(payload.buyer);
    const product = asObject(payload.product);
    const commission = asObject(payload.commission);
    const sale = asObject(commission.sale);
    const plan = asString(product.selectedPlan, "contact-card");
    const amount = asNumber(sale.amount, 0);
    return {
      name: asString(buyer.name, "Stripe Buyer"),
      email: asString(buyer.email),
      phone: asString(buyer.phone),
      companyName: asString(buyer.name, "Stripe Contact Card Buyer"),
      niche: "Contact Card Product",
      stage: "Paid",
      score: 92,
      value: Math.round(amount || 499),
      source: `stripe_${plan}`,
      nextAction: "Confirm payment details and send the intake/start link."
    };
  }

  const lead = asObject(payload.lead);
  return {
    name: asString(lead.name, "QR Contact"),
    email: asString(lead.email),
    phone: asString(lead.phone),
    companyName: asString(lead.company || lead.businessName, "QR Contact Card Lead"),
    niche: "Business Growth Systems",
    stage: "New QR Lead",
    score: 78,
    value: 2500,
    source: asString(payload.source, "qr_contact_card"),
    nextAction: "Review QR contact card lead brief and follow up."
  };
}

async function createLeadFromPayload(payload: Record<string, unknown>) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const leadShape = getLeadShape(payload);

  const company = await prisma.company.create({
    data: {
      workspaceId: workspace.id,
      name: leadShape.companyName,
      niche: leadShape.niche,
      crmSource: leadShape.source
    }
  });

  const contact = await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      companyId: company.id,
      name: leadShape.name,
      email: leadShape.email || null,
      phone: leadShape.phone || null
    }
  });

  return prisma.lead.create({
    data: {
      workspaceId: workspace.id,
      companyId: company.id,
      contactId: contact.id,
      name: contact.name,
      companyName: company.name,
      niche: company.niche,
      stage: leadShape.stage,
      score: leadShape.score,
      value: leadShape.value,
      source: leadShape.source,
      lastTouch: "Contact card webhook",
      nextAction: leadShape.nextAction,
      opportunities: {
        create: {
          companyId: company.id,
          title: `${company.name} growth system opportunity`,
          stage: leadShape.stage,
          value: leadShape.value,
          probability: Math.min(95, Math.max(20, leadShape.score))
        }
      }
    },
    include: { opportunities: true }
  });
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
    const lead = shouldCreateLead ? await createLeadFromPayload(payload) : null;

    const event = await prisma.automationEvent.create({
      data: {
        workspaceId: workspace.id,
        leadId: lead?.id || null,
        title: `Contact card ${recordType}`,
        detail: asString(payload.sourceDetail, asString(payload.eventName, "Inbound contact card payload")),
        status: "received",
        type: "contact_card_webhook",
        payload: payload as Prisma.InputJsonObject
      }
    });

    return NextResponse.json(
      {
        ok: true,
        received: true,
        recordType,
        leadId: lead?.id || null,
        eventId: event.id
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
