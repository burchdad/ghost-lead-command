import { NextResponse } from "next/server";
import { getGhostCrmStatus } from "@/lib/ghostcrm";
import { getOutreachStatus } from "@/lib/outreach";
import { getSourcingStatus } from "@/lib/sourcing";

export async function GET() {
  const outreach = getOutreachStatus();
  const sourcing = getSourcingStatus();
  const ghostUrl = process.env.GHOST_LEAD_AGENT_SEARCH_URL || "";
  let ghostLeadAgent = {
    configured: Boolean(ghostUrl),
    reachable: false,
    detail: ghostUrl ? "Not checked" : "Missing GHOST_LEAD_AGENT_SEARCH_URL",
  };

  if (ghostUrl) {
    try {
      const healthUrl = ghostUrl.replace(/\/enrich\/?$/, "/health");
      const response = await fetch(healthUrl, { cache: "no-store" });
      ghostLeadAgent = {
        configured: true,
        reachable: response.ok,
        detail: response.ok ? "Healthy" : `Returned ${response.status}`,
      };
    } catch (error) {
      ghostLeadAgent = {
        configured: true,
        reachable: false,
        detail: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  return NextResponse.json({
    pdl: { configured: sourcing.pdlConfigured },
    ghostLeadAgent,
    sendgrid: { configured: outreach.sendgridConfigured, mode: outreach.mode },
    telnyx: { configured: outreach.telnyxConfigured, preferred: outreach.smsProvider === "telnyx" },
    twilio: { configured: outreach.twilioConfigured, preferred: outreach.smsProvider === "twilio" },
    ghostcrm: getGhostCrmStatus(),
  });
}
