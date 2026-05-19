import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const proposals = await prisma.proposal.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    include: { opportunity: true },
  });

  return NextResponse.json({ proposals });
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();

  const proposal = await prisma.proposal.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: body.opportunityId ? String(body.opportunityId) : null,
      title: String(body.title || "AI Dead Lead Revival Install"),
      status: String(body.status || "draft"),
      setupFee: Number(body.setupFee || 2500),
      monthlyFee: Number(body.monthlyFee || 1000),
      revSharePct: Number(body.revSharePct || 12),
      summary: String(
        body.summary ||
          "Import stale leads, revive conversations, classify replies, book calls, and attribute recovered revenue."
      ),
    },
  });

  return NextResponse.json({ proposal }, { status: 201 });
}
