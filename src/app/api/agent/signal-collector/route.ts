import { NextResponse } from "next/server";
import { createAutomationEvent } from "@/lib/automation";
import { ingestExternalSourceLeads, type IntakeLead } from "@/lib/source-intake";
import { signalPlays, getSignalPlay } from "@/lib/signal-plays";
import { searchFreshLeads, type SourceLead } from "@/lib/sourcing";

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}

function toIntakeLead(lead: SourceLead, playSignal: string): IntakeLead {
  return {
    id: lead.id,
    name: lead.name,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    title: lead.title,
    niche: lead.niche,
    location: lead.location,
    website: lead.website,
    sourceUrl: lead.sourceUrl,
    source: `signal-collector:${lead.source}`,
    score: lead.score,
    buyerFit: lead.buyerFit,
    confidence: lead.confidence,
    buyingSignals: [playSignal, ...(lead.intentSignals || [])],
    signalSummary: lead.signalSummary || playSignal,
  };
}

export async function GET() {
  return NextResponse.json({
    plays: signalPlays,
    defaults: {
      commit: false,
      autoQueue: true,
      queueLimit: 8,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const selectedIds = Array.isArray(body.playIds) && body.playIds.length ? body.playIds.map(String) : signalPlays.slice(0, 2).map((play) => play.id);
    const selected = selectedIds.map(getSignalPlay).filter(Boolean) as typeof signalPlays;
    const commit = boolValue(body.commit);
    const autoQueue = body.autoQueue == null ? true : boolValue(body.autoQueue);
    const autoSend = boolValue(body.autoSend);
    const queueLimit = Math.max(0, Number(body.queueLimit || 8));
    const perPlaySize = Math.min(50, Math.max(5, Number(body.size || 20)));
    const runs = [];
    const allQualified: IntakeLead[] = [];

    for (const play of selected) {
      const result = await searchFreshLeads({
        provider: play.provider,
        query: body.query ? String(body.query) : play.query,
        location: body.location ? String(body.location) : play.location,
        industries: play.industries,
        titles: play.titles,
        size: Math.min(play.size, perPlaySize),
      });
      const qualified = result.leads
        .filter((lead: SourceLead) => lead.score >= Math.max(play.minScore, Number(body.minScore || 0)))
        .filter((lead: SourceLead) => lead.signalSummary?.trim() || lead.intentSignals?.length)
        .map((lead: SourceLead) => toIntakeLead(lead, play.signal));

      allQualified.push(...qualified);
      runs.push({
        playId: play.id,
        name: play.name,
        provider: play.provider,
        found: result.leads.length,
        qualified: qualified.length,
        message: result.message || null,
      });
    }

    const intake = commit
      ? await ingestExternalSourceLeads(allQualified, {
          source: "signal-collector",
          autoQueue,
          autoSend,
          queueLimit,
        })
      : null;

    await createAutomationEvent({
      title: commit ? "Signal collector imported leads" : "Signal collector previewed leads",
      detail: `${selected.length} plays ran, ${allQualified.length} qualified signals${intake ? `, ${intake.count} imported, ${intake.queued} queued` : ""}.`,
      status: allQualified.length ? "done" : "blocked",
      type: "agent",
      payload: { runs, commit, imported: intake?.count || 0, queued: intake?.queued || 0 },
    });

    return NextResponse.json({
      ok: true,
      commit,
      runs,
      qualified: allQualified.slice(0, 50),
      imported: intake?.count || 0,
      queued: intake?.queued || 0,
      skipped: intake?.skipped || {},
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Signal collector failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
