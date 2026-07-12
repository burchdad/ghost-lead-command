import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { buildCompanyAccountBrief } from "@/lib/perplexity";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const leadId = String(body.leadId || "").trim();
    const prisma = getPrisma();
    const workspace = await getDefaultWorkspace();
    const lead = leadId
      ? await prisma.lead.findFirst({
          where: { id: leadId, workspaceId: workspace.id },
          include: { company: true },
        })
      : null;

    const result = await buildCompanyAccountBrief({
      companyName: lead?.companyName || String(body.companyName || ""),
      contactName: lead?.name || String(body.contactName || ""),
      niche: lead?.niche || String(body.niche || ""),
      website: lead?.company?.website || String(body.website || ""),
      location: String(body.location || ""),
      signalSummary: lead?.nextAction || String(body.signalSummary || ""),
    });

    await createAutomationEvent({
      title: "Perplexity account intel generated",
      detail: result.brief ? `Generated account intel for ${lead?.companyName || body.companyName || "requested company"}.` : result.message,
      status: result.brief ? "done" : "blocked",
      type: "agent",
      leadId: lead?.id || null,
      payload: { leadId: lead?.id || null, message: result.message, model: result.model },
    });

    return NextResponse.json(result, { status: result.brief ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      { error: "Account intel failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
