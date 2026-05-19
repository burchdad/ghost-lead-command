import { NextResponse } from "next/server";
import { addSuppressionRecord } from "@/lib/suppression";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const records = await prisma.suppressionRecord.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.type || !body.value) {
    return NextResponse.json({ error: "type and value are required" }, { status: 400 });
  }

  const record = await addSuppressionRecord({
    type: String(body.type),
    value: String(body.value),
    reason: body.reason ? String(body.reason) : undefined,
    source: body.source ? String(body.source) : "manual",
  });

  return NextResponse.json({ record }, { status: 201 });
}
