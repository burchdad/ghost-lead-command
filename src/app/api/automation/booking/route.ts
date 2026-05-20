import { NextResponse } from "next/server";
import { createAutomationEvent, createSlackOpsEvent, getBookingReadiness } from "@/lib/automation";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const prisma = getPrisma() as any;
    const workspace = await getDefaultWorkspace();
    const tasks = await prisma.bookingTask.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: true },
    });
    return NextResponse.json({ tasks, readiness: getBookingReadiness() });
  } catch (error) {
    return NextResponse.json(
      { error: "Booking tasks unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
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
    const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null;
    const readiness = getBookingReadiness();
    const blocked = !readiness.calendarConfigured || !readiness.ownerEmail || (!readiness.meetingLink && !readiness.zoomConfigured);
    const meetingTitle = String(body.meetingTitle || `Discovery call${lead ? `: ${lead.companyName}` : ""}`);
    const prepNotes = String(body.prepNotes || lead?.nextAction || "Confirm pain, demo workflow, and agree on next step.");

    const task = await prisma.bookingTask.create({
      data: {
        workspaceId: workspace.id,
        leadId,
        ownerEmail: readiness.ownerEmail || null,
        status: blocked ? "blocked" : "ready",
        meetingTitle,
        meetingLink: readiness.meetingLink || null,
        calendarProvider: readiness.calendarProvider || null,
        durationMinutes: readiness.defaultDuration,
        scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : null,
        prepNotes,
      },
      include: { lead: true },
    });

    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: "Call Booked",
          lastTouch: "Just now",
          nextAction: blocked
            ? "Booking task created, but calendar or meeting link config is missing."
            : "Confirm calendar invite, meeting link, and call prep.",
        },
      });
    }

    await createAutomationEvent({
      leadId,
      title: "Booking task created",
      detail: blocked
        ? "Booking task saved, but calendar or meeting-link config is missing."
        : "Booking task ready for calendar scheduling.",
      status: blocked ? "blocked" : "done",
      type: "booking",
      payload: { taskId: task.id, readiness },
    });

    const slack = await createSlackOpsEvent({
      leadId,
      title: "Booked call alert",
      detail: `${lead?.companyName || "A lead"} has a booking task ready for operator review.`,
      payload: { taskId: task.id },
    });

    return NextResponse.json({ task, readiness, slack }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Booking task failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
