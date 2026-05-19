import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const leads = await prisma.lead.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      include: {
        opportunities: true,
        interactions: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    return NextResponse.json(
      { error: "Leads unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();

  const company = await prisma.company.create({
    data: {
      workspaceId: workspace.id,
      name: String(body.companyName || body.company || "Unknown Company"),
      niche: String(body.niche || "General"),
      crmSource: String(body.source || "manual"),
    },
  });

  const contact = await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      companyId: company.id,
      name: String(body.name || "Unknown Contact"),
      email: body.email ? String(body.email) : null,
      phone: body.phone ? String(body.phone) : null,
      role: body.role ? String(body.role) : null,
    },
  });

  const score = Number(body.score || 50);
  const value = Number(body.value || 2500);
  const lead = await prisma.lead.create({
    data: {
      workspaceId: workspace.id,
      companyId: company.id,
      contactId: contact.id,
      name: contact.name,
      companyName: company.name,
      niche: company.niche,
      stage: String(body.stage || "Imported"),
      score,
      value,
      source: String(body.source || "manual"),
      lastTouch: String(body.lastTouch || "Never"),
      nextAction:
        String(body.nextAction || "").trim() ||
        "Run first revival opener and watch for hot replies.",
      opportunities: {
        create: {
          companyId: company.id,
          title: `${company.name} AI revival install`,
          stage: String(body.stage || "Imported"),
          value,
          probability: Math.min(95, Math.max(20, score)),
        },
      },
    },
    include: { opportunities: true },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
