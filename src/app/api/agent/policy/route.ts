import { NextResponse } from "next/server";
import { getOperatorCaps, prepareOperatorRun } from "@/lib/operator-policy";
import { getDefaultWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const workspace = await getDefaultWorkspace();
    const caps = getOperatorCaps();
    const policy = await prepareOperatorRun({
      workspaceId: workspace.id,
      requestedSize: Math.min(50, caps.dailySourceLimit),
      requestedQueueLimit: Math.min(10, caps.dailyQueueLimit),
      requestedMinScore: Number(process.env.AGENT_MIN_LEAD_SCORE || 80),
    });

    return NextResponse.json({ caps, policy });
  } catch (error) {
    return NextResponse.json(
      { error: "Operator policy unavailable", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    );
  }
}
