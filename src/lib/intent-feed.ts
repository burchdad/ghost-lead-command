import { createAutomationEvent } from "@/lib/automation";
import { buildSignalScoreboard } from "@/lib/intent-scoreboard";
import { selectOfferAngle } from "@/lib/offer-copy-brain";
import { buildCompanyAccountBrief, findPublicCompanySignals, getPerplexityStatus } from "@/lib/perplexity";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type IntentFeedItem = {
  leadId: string;
  companyName: string;
  contactName: string;
  niche: string;
  source: string;
  score: number;
  stage: string;
  contactability: "email" | "phone" | "website" | "missing";
  signalScore: number;
  signalType: string;
  signalSummary: string;
  offerAngle: string;
  accountBrief?: string;
  nextMove: string;
  sources: { title: string; url: string; snippet: string }[];
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function signalType(text: string) {
  const lower = text.toLowerCase();
  if (/linkedin|social|profile|post|comment|follow/.test(lower)) return "linkedin-social";
  if (/hiring|job|funding|launch|expansion|growth|headcount/.test(lower)) return "company-change";
  if (/google|review|rating|website|search/.test(lower)) return "web-search";
  if (/quote|estimate|missed|booking|calendar|follow-up|lead flow|speed/.test(lower)) return "pipeline-leak";
  if (/email|phone|contact|form/.test(lower)) return "contact-path";
  return "icp-fit";
}

function contactability(lead: {
  contact?: { email?: string | null; phone?: string | null } | null;
  company?: { website?: string | null } | null;
}) {
  if (lead.contact?.email) return "email";
  if (lead.contact?.phone) return "phone";
  if (lead.company?.website) return "website";
  return "missing";
}

function baseSignalScore(input: {
  score: number;
  stage: string;
  nextAction: string;
  contactability: string;
  replies: number;
  sent: number;
}) {
  let score = Math.min(60, Math.max(0, input.score * 0.55));
  if (input.contactability === "email") score += 15;
  if (input.contactability === "phone") score += 10;
  if (input.contactability === "website") score += 6;
  if (/linkedin|social|profile|sales navigator/i.test(input.nextAction)) score += 12;
  if (/hiring|funding|growth|launch|expansion|review|missed|quote|booking|follow-up/i.test(input.nextAction)) score += 12;
  if (input.replies > 0) score += 20;
  if (input.sent > 0) score += 5;
  if (["Replied", "Potential Client", "Call Booked", "Proposal Sent"].includes(input.stage)) score += 18;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function getIntentFeed(input: { limit?: number; enrich?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(50, Math.max(5, Number(input.limit || 25)));
  const leads = await prisma.lead.findMany({
    where: { workspaceId: workspace.id, status: "active" },
    orderBy: [{ updatedAt: "desc" }, { score: "desc" }],
    take: Math.max(limit * 2, 50),
    include: {
      contact: true,
      company: true,
      replies: { orderBy: { createdAt: "desc" }, take: 5 },
      outreachQueue: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  const items: IntentFeedItem[] = [];
  const accountBriefs: Record<string, string> = {};
  let briefsUsed = 0;
  for (const lead of leads) {
    const contact = contactability(lead);
    const sent = lead.outreachQueue.filter((item) => ["queued", "sent"].includes(item.status)).length;
    const signalSummary = clean(lead.nextAction) || "No signal captured yet.";
    const base = baseSignalScore({
      score: lead.score,
      stage: lead.stage,
      nextAction: signalSummary,
      contactability: contact,
      replies: lead.replies.length,
      sent,
    });
    const scoreboard = buildSignalScoreboard({
      companyName: lead.companyName,
      name: lead.name,
      title: lead.contact?.role || "",
      email: lead.contact?.email || "",
      phone: lead.contact?.phone || "",
      website: lead.company?.website || "",
      niche: lead.niche,
      source: lead.source,
      score: lead.score,
      signalSummary,
      nextAction: lead.nextAction,
      stage: lead.stage,
      value: lead.value,
    });
    let publicSignals: string[] = [];
    let sources: IntentFeedItem["sources"] = [];

    if (input.enrich && base >= 65) {
      const web = await findPublicCompanySignals({
        companyName: lead.companyName,
        niche: lead.niche,
        website: lead.company?.website,
      });
      publicSignals = web.signals;
      sources = web.sources.map((source) => ({
        title: source.title,
        url: source.url,
        snippet: source.snippet,
      }));
      if (briefsUsed < 1 && base >= 78) {
        const brief = await buildCompanyAccountBrief({
          companyName: lead.companyName,
          contactName: lead.name,
          niche: lead.niche,
          website: lead.company?.website,
          signalSummary,
        });
        if (brief.brief) {
          accountBriefs[lead.id] = brief.brief.slice(0, 900);
          briefsUsed += 1;
        }
      }
    }

    const mergedSignal = [signalSummary, ...publicSignals].filter(Boolean).slice(0, 5).join("; ");
    const finalSignalType = signalType(mergedSignal);
    const signalScore = Math.min(100, Math.max(base, scoreboard.total) + Math.min(15, publicSignals.length * 5));
    const angle = selectOfferAngle({
      name: lead.name,
      companyName: lead.companyName,
      niche: lead.niche,
      source: lead.source,
      nextAction: mergedSignal,
      score: lead.score,
      value: lead.value,
    });

    items.push({
      leadId: lead.id,
      companyName: lead.companyName,
      contactName: lead.name,
      niche: lead.niche,
      source: lead.source,
      score: lead.score,
      stage: lead.stage,
      contactability: contact,
      signalScore,
      signalType: finalSignalType,
      signalSummary: mergedSignal,
      offerAngle: angle,
      accountBrief: accountBriefs[lead.id],
      nextMove:
        lead.replies.length > 0
          ? "Work reply and push booking."
          : contact === "email"
            ? scoreboard.nextMove
            : contact === "phone" || contact === "website"
              ? scoreboard.nextMove
              : "Enrich before outreach.",
      sources,
    });
  }

  return {
    ok: true,
    perplexity: getPerplexityStatus(),
    items: items.sort((a, b) => b.signalScore - a.signalScore).slice(0, limit),
  };
}

export async function runIntentFeedScout(input: { limit?: number; enrich?: boolean } = {}) {
  const feed = await getIntentFeed(input);
  const top = feed.items.slice(0, 8);
  await createAutomationEvent({
    title: "Vega intent signal feed refreshed",
    detail: `${feed.items.length} intent-ranked leads ready. Top signal: ${top[0]?.companyName || "none"}.`,
    status: feed.items.length ? "done" : "blocked",
    type: "agent",
    payload: { top, perplexity: feed.perplexity },
  });
  return feed;
}
