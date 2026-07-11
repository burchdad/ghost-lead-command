import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { enrichSalesNavigatorLead } from "@/lib/linkedin-sales-nav";
import { extractSalesNavScreenshotLeads, visionLeadsToCsv } from "@/lib/sales-nav-vision";
import { ingestExternalSourceLeads } from "@/lib/source-intake";
import type { IntakeLead } from "@/lib/source-intake";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function POST(request: Request) {
  const body = await request.json();
  const images = Array.isArray(body.images) ? body.images.map(String).filter(Boolean) : [];
  const commit = Boolean(body.commit);
  const enrich = body.enrich !== false;
  const autoQueue = body.autoQueue !== false;
  const autoSend = Boolean(body.autoSend);
  const queueLimit = Math.max(0, Number(body.queueLimit || 10));
  const minScore = Math.max(0, Number(body.minScore || 68));

  if (!images.length) {
    return NextResponse.json({ error: "Upload at least one Sales Navigator screenshot." }, { status: 400 });
  }

  const extraction = await extractSalesNavScreenshotLeads(images.slice(0, 9));
  if (extraction.error) {
    return NextResponse.json({ error: extraction.error }, { status: 503 });
  }

  const withDefaults: IntakeLead[] = extraction.leads.map((lead) => ({
    ...lead,
    niche: lead.niche || String(body.defaultNiche || "B2B Services"),
    location: lead.location || String(body.defaultLocation || "United States"),
  }));
  const enriched = enrich ? await Promise.all(withDefaults.map((lead) => enrichSalesNavigatorLead(lead))) : withDefaults;
  const qualified = enriched.filter((lead) => Number(lead.score || 0) >= minScore);
  const contactable = qualified.filter((lead) => lead.email || lead.phone);
  const needsContact = qualified.length - contactable.length;

  let intake: Awaited<ReturnType<typeof ingestExternalSourceLeads>> | null = null;
  if (commit) {
    intake = await ingestExternalSourceLeads(contactable, {
      source: "linkedin-sales-navigator-screenshot",
      autoQueue,
      autoSend,
      queueLimit,
    });

    const workspace = await getDefaultWorkspace();
    await getPrisma().automationEvent.create({
      data: {
        workspaceId: workspace.id,
        title: "Sales Navigator screenshots processed",
        detail: `${images.length} screenshots, ${extraction.leads.length} extracted, ${qualified.length} qualified, ${intake.count} imported, ${intake.queued} queued.`,
        status: "done",
        type: "agent",
        payload: {
          screenshots: images.length,
          extracted: extraction.leads.length,
          qualified: qualified.length,
          contactable: contactable.length,
          needsContact,
          skipped: intake.skipped,
        },
      },
    });
  }

  return NextResponse.json({
    commit,
    enrich,
    provider: extraction.provider,
    model: extraction.model,
    parsed: extraction.leads.length,
    qualified: qualified.length,
    contactable: contactable.length,
    needsContact,
    preview: (qualified.length ? qualified : enriched).slice(0, 50),
    rawCsv: visionLeadsToCsv(extraction.leads),
    imported: intake?.count || 0,
    queued: intake?.queued || 0,
    skipped: intake?.skipped || {},
    pdlEnrichment: Boolean(process.env.PDL_API_KEY),
  });
}
