import { NextResponse } from "next/server";
import { handleNovaOrganizationInstruction } from "@/lib/nova-organization-assistant";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text || body.message || body.instruction || "").trim();

    if (!text) {
      return NextResponse.json(
        {
          error: "Nova needs an instruction.",
          examples: [
            "Nova, new lead: John at ABC Roofing, 903-555-1212, wants a quote next week, setter Alex.",
            "Nova, book ABC Roofing with Alex tomorrow at 2pm.",
            "Nova, send end of day report to alex@example.com.",
          ],
        },
        { status: 400 },
      );
    }

    const result = await handleNovaOrganizationInstruction(text);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: "Nova organization assistant failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
