import { NextResponse } from "next/server";
import { generateSalesText } from "@/lib/ai";

const allowedKinds = new Set(["outreach", "call-prep", "proposal", "classifier"]);

export async function POST(request: Request) {
  const body = await request.json();
  const kind = String(body.kind || "outreach");

  if (!allowedKinds.has(kind)) {
    return NextResponse.json({ error: "Unsupported generation kind" }, { status: 400 });
  }

  const result = await generateSalesText({
    kind: kind as "outreach" | "call-prep" | "proposal" | "classifier",
    lead: body.lead,
    input: body.input,
  });

  return NextResponse.json(result);
}
