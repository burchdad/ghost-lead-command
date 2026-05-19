import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const campaigns = await prisma.sourcingCampaign.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });

    return NextResponse.json({ campaigns });
  } catch (error) {
    return NextResponse.json(
      { error: "Source campaigns unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();

  const campaign = await prisma.sourcingCampaign.create({
    data: {
      workspaceId: workspace.id,
      name: String(body.name || "Untitled Source Campaign"),
      provider: String(body.provider || "pdl"),
      query: String(body.query || ""),
      location: body.location ? String(body.location) : null,
      industries: Array.isArray(body.industries)
        ? body.industries.join(", ")
        : body.industries
          ? String(body.industries)
          : null,
      titles: Array.isArray(body.titles)
        ? body.titles.join(", ")
        : body.titles
          ? String(body.titles)
          : null,
      dailyLimit: Number(body.dailyLimit || 25),
      scoreThreshold: Number(body.scoreThreshold || 70),
      status: String(body.status || "draft"),
    },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
