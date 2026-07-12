import { createAutomationEvent } from "@/lib/automation";
import { ingestExternalSourceLeads, type IntakeLead } from "@/lib/source-intake";
import { signalPlays } from "@/lib/signal-plays";
import { searchFreshLeads, type SourceLead } from "@/lib/sourcing";

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
    source: `social-intent:${lead.source}`,
    score: lead.score,
    buyerFit: lead.buyerFit,
    confidence: lead.confidence,
    buyingSignals: [playSignal, ...(lead.intentSignals || [])],
    socialSignals: [playSignal],
    signalSummary: lead.signalSummary || playSignal,
  };
}

export async function runSocialIntentScout(input: { limit?: number; commit?: boolean; autoQueue?: boolean; autoSend?: boolean } = {}) {
  const limit = Math.min(40, Math.max(5, Number(input.limit || 15)));
  const commit = input.commit !== false;
  const selected = signalPlays
    .filter((play) => /social|competitor|linkedin|event|community/i.test(`${play.id} ${play.name} ${play.signal}`))
    .slice(0, 3);
  const runs = [];
  const qualified: IntakeLead[] = [];

  for (const play of selected) {
    const result = await searchFreshLeads({
      provider: play.provider,
      query: play.query,
      location: play.location,
      industries: play.industries,
      titles: play.titles,
      size: Math.min(play.size, Math.ceil(limit / Math.max(1, selected.length)) + 6),
    });
    const playQualified = result.leads
      .filter((lead: SourceLead) => lead.score >= Math.max(72, play.minScore - 8))
      .filter((lead: SourceLead) => lead.signalSummary?.trim() || lead.intentSignals?.length)
      .map((lead: SourceLead) => toIntakeLead(lead, play.signal));
    qualified.push(...playQualified);
    runs.push({
      playId: play.id,
      name: play.name,
      provider: play.provider,
      found: result.leads.length,
      qualified: playQualified.length,
      message: result.message || null,
    });
  }

  const intake = commit
    ? await ingestExternalSourceLeads(qualified.slice(0, limit), {
        source: "social-intent-scout",
        autoQueue: input.autoQueue !== false,
        autoSend: Boolean(input.autoSend),
        queueLimit: Math.min(8, Math.max(1, Math.ceil(limit / 2))),
      })
    : null;

  await createAutomationEvent({
    title: commit ? "Vega Social Intent Scout imported leads" : "Vega Social Intent Scout previewed leads",
    detail: `${selected.length} social/competitor plays ran. Qualified ${qualified.length}${intake ? `, imported ${intake.count}, queued ${intake.queued}` : ""}.`,
    status: qualified.length ? "done" : "blocked",
    type: "agent",
    payload: { runs, commit, imported: intake?.count || 0, queued: intake?.queued || 0, skipped: intake?.skipped || {} },
  });

  return {
    ok: true,
    commit,
    runs,
    qualified: qualified.slice(0, limit),
    imported: intake?.count || 0,
    queued: intake?.queued || 0,
    skipped: intake?.skipped || {},
  };
}
