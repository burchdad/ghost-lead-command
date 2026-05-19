import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId: workspace.id },
    include: { steps: { orderBy: { dayOffset: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();

  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: String(body.name || "Dead Lead Revival"),
      mode: String(body.mode || "revival"),
      audience: String(body.audience || "Old CRM contacts"),
      status: String(body.status || "draft"),
      replyTarget: Number(body.replyTarget || 0.15),
      bookingTarget: Number(body.bookingTarget || 0.05),
      steps: {
        create: Array.isArray(body.steps)
          ? body.steps.map((step: { dayOffset?: number; channel?: string; body?: string }) => ({
              dayOffset: Number(step.dayOffset || 0),
              channel: String(step.channel || "sms"),
              body: String(step.body || ""),
            }))
          : [],
      },
    },
    include: { steps: true },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
