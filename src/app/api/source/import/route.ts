import { NextResponse } from "next/server";
import { ingestExternalSourceLeads, type IntakeLead } from "@/lib/source-intake";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawLeads = Array.isArray(body.leads) ? body.leads : Array.isArray(body.records) ? body.records : [];
    const leads = rawLeads.filter(Boolean) as IntakeLead[];

    if (!leads.length) {
      return NextResponse.json({ error: "No source leads provided" }, { status: 400 });
    }

    const result = await ingestExternalSourceLeads(leads, {
      source: body.source ? String(body.source) : "source-ui-import",
      autoQueue: body.autoQueue !== false,
      autoSend: Boolean(body.autoSend),
      queueLimit: body.queueLimit ? Number(body.queueLimit) : 8,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Source import failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
