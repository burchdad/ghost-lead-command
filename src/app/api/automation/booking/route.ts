import { NextResponse } from "next/server";
import { createBookingTaskForLead, createSlackOpsEvent, getBookingReadiness } from "@/lib/automation";
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
    const body = await request.json();
    const leadId = body.leadId ? String(body.leadId) : null;
    const lead = leadId ? await prisma.lead.findUnique({ where: { id: leadId } }) : null;
    const booking = leadId
      ? await createBookingTaskForLead({
          leadId,
          replyBody: body.prepNotes ? String(body.prepNotes) : lead?.nextAction,
          classification: "booked",
        })
      : null;

    if (!booking) {
      return NextResponse.json({ error: "Lead not found for booking task" }, { status: 404 });
    }

    const { task, readiness, blocked } = booking;

    if (body.scheduledFor || body.meetingTitle || body.prepNotes) {
      await prisma.bookingTask.update({
        where: { id: task.id },
        data: {
          meetingTitle: body.meetingTitle ? String(body.meetingTitle) : task.meetingTitle,
          scheduledFor: body.scheduledFor ? new Date(String(body.scheduledFor)) : task.scheduledFor,
          prepNotes: body.prepNotes ? String(body.prepNotes) : task.prepNotes,
        },
      });
    }

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
