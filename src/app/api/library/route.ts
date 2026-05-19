import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const agents = await prisma.agentTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
    });
    const prompts = await prisma.promptTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    });

    return NextResponse.json({ agents, prompts });
  } catch (error) {
    return NextResponse.json(
      { error: "Library unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
