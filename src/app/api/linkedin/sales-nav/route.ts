import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { enrichSalesNavigatorLead, parseSalesNavigatorLeads } from "@/lib/linkedin-sales-nav";
import { ingestExternalSourceLeads } from "@/lib/source-intake";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_CLIENT_ID),
    salesNavigator: true,
    pdlEnrichment: Boolean(process.env.PDL_API_KEY),
    mode: "manual-paste-or-csv",
    guidance: [
      "Create a Sales Navigator saved search for one ICP.",
      "Paste/export the visible leads with name, title, company, profile URL, industry, and location.",
      "Lead Command enriches contact paths, scores buyer fit, imports qualified records, and queues first-touch outreach.",
    ],
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const raw = String(body.raw || body.csv || "");
  const commit = Boolean(body.commit);
  const enrich = body.enrich !== false;
  const autoQueue = body.autoQueue !== false;
  const autoSend = Boolean(body.autoSend);
  const queueLimit = Math.max(0, Number(body.queueLimit || 10));
  const minScore = Math.max(0, Number(body.minScore || 68));

  if (!raw.trim()) {
    return NextResponse.json({ error: "Paste Sales Navigator rows or CSV first." }, { status: 400 });
  }

  const parsed = parseSalesNavigatorLeads(raw, {
    defaultNiche: String(body.defaultNiche || "B2B Services"),
    defaultLocation: String(body.defaultLocation || "United States"),
    limit: Number(body.limit || 50),
  });

  const enriched = enrich ? await Promise.all(parsed.map((lead) => enrichSalesNavigatorLead(lead))) : parsed;
  const qualified = enriched.filter((lead) => Number(lead.score || 0) >= minScore);
  const contactable = qualified.filter((lead) => lead.email || lead.phone);
  const needsContact = qualified.length - contactable.length;

  let intake: Awaited<ReturnType<typeof ingestExternalSourceLeads>> | null = null;
  if (commit) {
    intake = await ingestExternalSourceLeads(contactable, {
      source: "linkedin-sales-navigator",
      autoQueue,
      autoSend,
      queueLimit,
    });

    const workspace = await getDefaultWorkspace();
    await getPrisma().automationEvent.create({
      data: {
        workspaceId: workspace.id,
        title: "Sales Navigator leads processed",
        detail: `${parsed.length} parsed, ${qualified.length} qualified, ${contactable.length} contactable, ${intake.count} imported, ${intake.queued} queued.`,
        status: "done",
        type: "agent",
        payload: {
          parsed: parsed.length,
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
    parsed: parsed.length,
    qualified: qualified.length,
    contactable: contactable.length,
    needsContact,
    preview: (qualified.length ? qualified : enriched).slice(0, 50),
    imported: intake?.count || 0,
    queued: intake?.queued || 0,
    skipped: intake?.skipped || {},
    pdlEnrichment: Boolean(process.env.PDL_API_KEY),
  });
}
