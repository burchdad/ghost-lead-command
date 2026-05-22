import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

const allowedStages = new Set([
  "Imported",
  "Contacted",
  "Networking Contact",
  "Potential Client",
  "Referral Partner",
  "Vendor",
  "Friend of Business",
  "Replied",
  "Call Booked",
  "Proposal Sent",
  "Won",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      opportunities: true,
      interactions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ lead });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json();

  const stage = body.stage ? String(body.stage) : undefined;
  if (stage && !allowedStages.has(stage)) {
    return NextResponse.json({ error: "Unsupported lead stage" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      stage,
      score: body.score === undefined ? undefined : Number(body.score),
      value: body.value === undefined ? undefined : Number(body.value),
      nextAction: body.nextAction === undefined ? undefined : String(body.nextAction),
      lastTouch: body.lastTouch === undefined ? undefined : String(body.lastTouch),
      opportunities: stage
        ? {
            updateMany: {
              where: { leadId: id },
              data: {
                stage,
                value: body.value === undefined ? undefined : Number(body.value),
              },
            },
          }
        : undefined,
    },
    include: {
      opportunities: true,
      interactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return NextResponse.json({ lead });
}
