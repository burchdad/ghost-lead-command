import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const [agents, prompts] = await Promise.all([
    prisma.agentTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
    }),
    prisma.promptTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
  ]);

  return NextResponse.json({ agents, prompts });
}
