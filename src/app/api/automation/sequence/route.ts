import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma() as any;
    const workspace = await getDefaultWorkspace();
    const steps = await prisma.sequenceStep.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { lead: true },
    });
    return NextResponse.json({ steps });
  } catch (error) {
    return NextResponse.json(
      { error: "Sequence steps unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const prisma = getPrisma() as any;
    const workspace = await getDefaultWorkspace();
    const body = await request.json();
    const leadId = body.leadId ? String(body.leadId) : null;
    const steps = Array.isArray(body.steps) ? body.steps : [];

    const created = await prisma.$transaction(
      steps.map((step: Record<string, unknown>, index: number) =>
        prisma.sequenceStep.create({
          data: {
            workspaceId: workspace.id,
            leadId,
            stepNumber: Number(step.stepNumber || index + 1),
            dayOffset: Number(step.dayOffset || 0),
            channel: String(step.channel || "email").toLowerCase(),
            provider: step.provider ? String(step.provider) : null,
            subject: step.subject ? String(step.subject) : null,
            body: String(step.body || ""),
            status: "draft",
            scheduledFor: step.scheduledFor ? new Date(String(step.scheduledFor)) : null,
          },
        }),
      ),
    );

    await createAutomationEvent({
      leadId,
      title: "Sequence drafted",
      detail: `${created.length} outreach steps are ready for approval queueing.`,
      status: "done",
      type: "sequence",
      payload: { sequenceStepIds: created.map((step: { id: string }) => step.id) },
    });

    return NextResponse.json({ steps: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Sequence draft failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
