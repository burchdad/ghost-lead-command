import { VegaCalibrationVerdict } from "@prisma/client";
import { NextResponse } from "next/server";
import { isLeadCommandRequestAuthorized } from "@/lib/access";
import {
  evaluateOperationalReadiness,
  labelCalibrationItem,
  saveOperationalConfiguration,
  startLeadCalibration,
} from "@/lib/vega-operational-readiness";

function selector(url: URL, body?: Record<string, unknown>) {
  return {
    workspaceId: String(body?.workspaceId || url.searchParams.get("workspaceId") || "").trim() || undefined,
    workspaceSlug: String(body?.workspaceSlug || url.searchParams.get("workspaceSlug") || "").trim() || undefined,
  };
}

export async function GET(request: Request) {
  if (!(await isLeadCommandRequestAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await evaluateOperationalReadiness(selector(new URL(request.url))));
  } catch (error) {
    return NextResponse.json({ error: "Unable to evaluate Vega readiness", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isLeadCommandRequestAuthorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "evaluate");
    const target = selector(new URL(request.url), body);

    if (action === "save") {
      return NextResponse.json(await saveOperationalConfiguration({
        ...target,
        configuration: (body.configuration || {}) as Parameters<typeof saveOperationalConfiguration>[0]["configuration"],
        autonomyRequested: Boolean(body.autonomyRequested),
        calibrationTarget: Number(body.calibrationTarget || 10),
      }));
    }
    if (action === "start-calibration") {
      return NextResponse.json(await startLeadCalibration({ ...target, target: Number(body.target || 10) }));
    }
    if (action === "label") {
      const verdict = String(body.verdict || "") as VegaCalibrationVerdict;
      if (!Object.values(VegaCalibrationVerdict).includes(verdict)) {
        return NextResponse.json({ error: "Invalid calibration verdict" }, { status: 400 });
      }
      return NextResponse.json(await labelCalibrationItem({
        itemId: String(body.itemId || ""),
        verdict,
        notes: String(body.notes || ""),
        reviewedBy: String(body.reviewedBy || "Vega operator"),
      }));
    }
    if (action === "evaluate") return NextResponse.json(await evaluateOperationalReadiness(target));
    return NextResponse.json({ error: `Unsupported operator onboarding action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Vega operational onboarding failed", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
