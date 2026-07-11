import { NextResponse } from "next/server";
import { runLeadGenDirector } from "@/lib/lead-gen-director";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function boolParam(value: string | null) {
  if (!value) return undefined;
  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const result = await runLeadGenDirector({
      mode: url.searchParams.get("mode") === "daily" ? "daily" : "sprint",
      autoSend: boolParam(url.searchParams.get("autoSend")),
      location: url.searchParams.get("location") || undefined,
      queueLimit: url.searchParams.get("queueLimit") ? Number(url.searchParams.get("queueLimit")) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Lead Gen Director failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runLeadGenDirector({
      mode: body.mode === "daily" ? "daily" : "sprint",
      autoSend: typeof body.autoSend === "boolean" ? body.autoSend : undefined,
      location: body.location ? String(body.location) : undefined,
      queueLimit: body.queueLimit ? Number(body.queueLimit) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Lead Gen Director failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
