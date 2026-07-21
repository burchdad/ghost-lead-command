import { NextResponse } from "next/server";
import { approveAgentPlan, createAgentPlan, sendAgentPlan } from "@/lib/autopilot";
import { notifySlackVegaLeadRequestResult } from "@/lib/slack";

function cronAuthorized(request: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const exclude = [
    ...url.searchParams.getAll("exclude"),
    ...(url.searchParams.get("excludeCsv") || "").split(","),
  ].map((item) => item.trim()).filter(Boolean);
  const previewOnly =
    url.searchParams.get("preview") === "true" ||
    url.searchParams.get("autoSend") === "false" ||
    process.env.VEGA_DAILY_AUTO_SEND_SLATE === "false";
  if (!previewOnly) {
    const plan = createAgentPlan({ exclude, source: "daily" });
    const result = await approveAgentPlan(plan, { autoSend: true });
    const slack = await notifySlackVegaLeadRequestResult({
      instruction: `Daily auto-send slate: ${plan.niche}`,
      status: "finished",
      summary: `Vega ran today's auto-send slate. ${result.message}`,
      plan: {
        niche: plan.niche,
        provider: plan.provider,
        location: plan.location,
        locations: plan.locations,
      },
      result: {
        found: result.found,
        rawFound: result.rawFound,
        qualified: result.qualified,
        queued: result.queued,
        reviewReady: result.reviewReady,
        message: [
          result.autoSendSummary.sentCompanies.length
            ? `Contacted today: ${result.autoSendSummary.sentCompanies.slice(0, 10).join(", ")}${result.autoSendSummary.sentCompanies.length > 10 ? ` +${result.autoSendSummary.sentCompanies.length - 10} more` : ""}`
            : "Contacted today: none yet.",
          result.autoSendSummary.callAssistTasks.length
            ? `Phone assists queued: ${result.autoSendSummary.callAssistTasks.length}`
            : "",
          result.autoSendSummary.manualCompanies.length
            ? `Manual contact paths: ${result.autoSendSummary.manualCompanies.slice(0, 8).join(", ")}`
            : "",
          result.autoSendSummary.blockedCompanies.length
            ? `Blocked by quality gate: ${result.autoSendSummary.blockedCompanies.slice(0, 8).join(", ")}`
            : "",
          result.autoSendSummary.failedCompanies.length
            ? `Failed sends: ${result.autoSendSummary.failedCompanies.slice(0, 8).join(", ")}`
            : "",
        ].filter(Boolean).join("\n"),
        guardrails: result.guardrails,
        diagnostics: result.diagnostics,
      },
    });
    return NextResponse.json({ autoSend: true, plan, result, slack });
  }
  const result = await sendAgentPlan({ exclude, source: "daily" });
  return NextResponse.json({ autoSend: false, ...result });
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const exclude = Array.isArray(body.exclude) ? body.exclude.map(String) : [];
  if (body.autoSend !== false && process.env.VEGA_DAILY_AUTO_SEND_SLATE !== "false") {
    const plan = createAgentPlan({ exclude, source: "daily" });
    const result = await approveAgentPlan(plan, { autoSend: true });
    const slack = await notifySlackVegaLeadRequestResult({
      instruction: `Daily auto-send slate: ${plan.niche}`,
      status: "finished",
      summary: `Vega ran today's auto-send slate. ${result.message}`,
      plan: {
        niche: plan.niche,
        provider: plan.provider,
        location: plan.location,
        locations: plan.locations,
      },
      result: {
        found: result.found,
        rawFound: result.rawFound,
        qualified: result.qualified,
        queued: result.queued,
        reviewReady: result.reviewReady,
        message: result.autoSendSummary.sentCompanies.length
          ? `Contacted today: ${result.autoSendSummary.sentCompanies.slice(0, 10).join(", ")}${result.autoSendSummary.sentCompanies.length > 10 ? ` +${result.autoSendSummary.sentCompanies.length - 10} more` : ""}`
          : "Contacted today: none yet. Check blocked/manual details in the queue.",
        guardrails: result.guardrails,
        diagnostics: result.diagnostics,
      },
    });
    return NextResponse.json({ autoSend: true, plan, result, slack });
  }
  const result = await sendAgentPlan({ exclude, source: "daily" });
  return NextResponse.json({ autoSend: false, ...result });
}
