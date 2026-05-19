import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prisma = getPrisma();
  const body = await request.json().catch(() => ({}));
  const existing = await prisma.outreachQueueItem.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: `Queue item is already ${existing.status}`, item: existing },
      { status: 409 },
    );
  }

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
