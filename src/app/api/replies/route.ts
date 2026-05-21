import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { recordInboundReply } from "@/lib/replies";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const replies = await prisma.reply.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: { lead: true },
    });

    return NextResponse.json({ replies });
  } catch (error) {
    return NextResponse.json(
      { error: "Replies unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = await recordInboundReply({
    leadId: body.leadId ? String(body.leadId) : null,
    channel: String(body.channel || "email"),
    from: String(body.from || ""),
    body: String(body.body || ""),
    classification: body.classification ? String(body.classification) : null,
    source: String(body.source || "manual"),
  });

  return NextResponse.json(result, { status: 201 });
}
