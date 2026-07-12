import { NextResponse } from "next/server";
import { getGhostCrmHealth } from "@/lib/ghostcrm";
import { getLinkedInProductStatus } from "@/lib/linkedin-products";
import { getOperatorCaps } from "@/lib/operator-policy";
import { getOutreachStatus, getTwilioReadiness } from "@/lib/outreach";
import { getSourcingStatus } from "@/lib/sourcing";

export async function GET() {
  const outreach = getOutreachStatus();
  const sourcing = getSourcingStatus();
  const linkedInProducts = getLinkedInProductStatus();
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
    leadIntake: {
      configured: Boolean(process.env.LEAD_INTAKE_SECRET),
      route: "/api/source/intake",
      mode: process.env.LEAD_INTAKE_SECRET ? "secured" : "missing secret",
    },
    serpapi: {
      configured: Boolean(process.env.SERPAPI_API_KEY),
      useCase: "Google search, Maps, and local/business intent collectors",
    },
    linkedin: {
      configured: linkedInProducts.configured,
      accessToken: linkedInProducts.accessToken,
      oauthClient: process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET ? "configured" : "missing",
      redirectUri: process.env.LINKEDIN_REDIRECT_URI ? "configured" : "missing",
      organizationUrn: linkedInProducts.organizationUrn,
      eventsManagement: linkedInProducts.products.eventsManagement,
      eventsReady: linkedInProducts.ready.eventsManagement,
      leadSync: linkedInProducts.products.leadSync,
      leadSyncReady: linkedInProducts.ready.leadSync,
    },
    ghostLeadAgent,
    sendgrid: {
      configured: outreach.sendgridConfigured,
      mode: outreach.mode,
      inbound: {
        route: "/api/sendgrid/inbound",
        secret: process.env.SENDGRID_INBOUND_SECRET || process.env.CRON_SECRET ? "configured" : "missing",
      },
    },
    telnyx: { configured: outreach.telnyxConfigured, preferred: outreach.smsProvider === "telnyx" },
    twilio: getTwilioReadiness(),
    ghostcrm: await getGhostCrmHealth(),
    calendar: {
      configured: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID),
      provider: process.env.GOOGLE_CALENDAR_CLIENT_ID ? "google" : process.env.OUTLOOK_CLIENT_ID ? "outlook" : "missing",
      owner: process.env.BOOKING_OWNER_EMAIL ? "configured" : "missing",
      defaultDuration: process.env.DEFAULT_MEETING_DURATION_MINUTES || "30",
    },
    zoom: {
      configured: Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET),
      meetingLink: process.env.DEFAULT_MEETING_URL ? "static" : "missing",
    },
    slack: {
      configured: Boolean(process.env.SLACK_WEBHOOK_URL || process.env.SLACK_BOT_TOKEN),
      channel: process.env.SLACK_OPS_CHANNEL ? "configured" : "missing",
    },
    operator: {
      configured: true,
      ...getOperatorCaps(),
    },
  });
}
