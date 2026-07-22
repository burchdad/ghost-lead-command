import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import {
  buildSenderRecoveryPlan,
  getSenderHealth,
  recalculateSourceQualityFromOutcomes,
  reconcileSendGridEvents,
  suppressFailedSendGridContacts,
} from "@/lib/sender-health";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: Request) {
  const workspace = await getDefaultWorkspace();
  const url = new URL(request.url);
  const scope = {
    workspaceId: workspace.id,
    senderEmail: clean(url.searchParams.get("senderEmail")) || undefined,
    senderDomain: clean(url.searchParams.get("senderDomain")) || undefined,
    campaignName: clean(url.searchParams.get("campaignName")) || undefined,
    sourceProvider: clean(url.searchParams.get("sourceProvider")) || undefined,
    days: Number(url.searchParams.get("days") || process.env.VEGA_SENDER_HEALTH_WINDOW_DAYS || 7),
  };
  const [workspaceHealth, scopedHealth, recovery] = await Promise.all([
    getSenderHealth({ workspaceId: workspace.id, days: scope.days }),
    getSenderHealth(scope),
    buildSenderRecoveryPlan(scope),
  ]);

  return NextResponse.json({
    workspaceHealth,
    scopedHealth,
    recovery,
  });
}

export async function POST(request: Request) {
  const workspace = await getDefaultWorkspace();
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);
  if (action === "suppress-invalid") {
    const result = await suppressFailedSendGridContacts({ workspaceId: workspace.id });
    await createAutomationEvent({
      title: "Sender recovery suppressions reviewed",
      detail: `Reviewed ${result.reviewed} failed SendGrid outcomes and confirmed ${result.suppressed} suppressions.`,
      status: "done",
      type: "sendgrid",
      payload: result,
    });
    return NextResponse.json(result);
  }

  if (action === "recalculate-source-quality") {
    const result = await recalculateSourceQualityFromOutcomes({ workspaceId: workspace.id });
    return NextResponse.json(result);
  }

  if (action === "historical-reconciliation-dry-run") {
    const prisma = getPrisma();
    const interactions = await prisma.interaction.findMany({
      where: { lead: { is: { workspaceId: workspace.id } }, channel: "email:sendgrid" },
      orderBy: { createdAt: "asc" },
      take: 5000,
      include: { lead: true },
    });
    const events = interactions.map((interaction) => {
      const messageMatch = interaction.body.match(/message\s+([^\s-]+)/i);
      return {
        providerMessageId: messageMatch?.[1] || `${interaction.leadId || "unknown"}:${interaction.createdAt.toISOString()}:${interaction.classification || "unknown"}`,
        eventType: interaction.classification || "unknown",
        timestamp: Math.floor(interaction.createdAt.getTime() / 1000),
        rawPayload: {
          interactionId: interaction.id,
          leadId: interaction.leadId,
          body: interaction.body,
        },
      };
    });
    const normalized = reconcileSendGridEvents(events);
    const rawRisky = interactions.filter((item) => ["bounce", "dropped", "spamreport"].includes(clean(item.classification).toLowerCase())).length;
    const normalizedRisky = normalized.filter((item) => ["HARD_BOUNCE", "DROPPED", "BLOCKED", "SPAM_COMPLAINT"].includes(item.finalOutcome)).length;
    return NextResponse.json({
      dryRun: true,
      rawEvents: interactions.length,
      rawRisky,
      uniqueMessages: normalized.length,
      normalizedRisky,
      rawRiskRate: interactions.length ? Math.round((rawRisky / interactions.length) * 1000) / 10 : 0,
      normalizedRiskRate: normalized.length ? Math.round((normalizedRisky / normalized.length) * 1000) / 10 : 0,
    });
  }

  return NextResponse.json({ error: "Unsupported sender-health action" }, { status: 400 });
}
