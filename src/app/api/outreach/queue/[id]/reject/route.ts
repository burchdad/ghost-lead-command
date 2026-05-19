import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json().catch(() => ({}));
  const item = await prisma.outreachQueueItem.update({
    where: { id },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      reason: body.reason ? String(body.reason) : "Rejected from approval queue",
    },
    include: { lead: true },
  });

  return NextResponse.json({ item });
}
