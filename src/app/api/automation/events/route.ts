import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma() as any;
    const workspace = await getDefaultWorkspace();
    const events = await prisma.automationEvent.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: true },
    });
    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: "Automation events unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = await createAutomationEvent({
      leadId: body.leadId ? String(body.leadId) : null,
      title: String(body.title || "Automation event"),
      detail: String(body.detail || ""),
      status: body.status ? String(body.status) : "done",
      type: body.type ? String(body.type) : "system",
      payload: body.payload && typeof body.payload === "object" ? body.payload : undefined,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Automation event failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
