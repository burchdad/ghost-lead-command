import { NextResponse } from "next/server";
import { ingestExternalSourceLeads, type IntakeLead } from "@/lib/source-intake";

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}

function boolValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}

function authorized(request: Request) {
  const secret =
    clean(process.env.LEAD_INTAKE_SECRET) ||
    clean(process.env.GHOST_LEAD_AGENT_API_KEY) ||
    clean(process.env.CRON_SECRET);

  if (!secret) return false;

  const auth = request.headers.get("authorization") || "";
  const intakeHeader = request.headers.get("x-lead-intake-secret") || "";
  return auth === `Bearer ${secret}` || intakeHeader === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const rawLeads = Array.isArray(body.leads) ? body.leads : Array.isArray(body.records) ? body.records : [body.lead || body];
    const leads = rawLeads.filter(Boolean) as IntakeLead[];

    if (!leads.length) {
      return NextResponse.json({ error: "No leads provided" }, { status: 400 });
    }

    const result = await ingestExternalSourceLeads(leads, {
      source: body.source ? String(body.source) : undefined,
      autoQueue: boolValue(body.autoQueue),
      autoSend: boolValue(body.autoSend),
      queueLimit: body.queueLimit ? Number(body.queueLimit) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Source intake failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
