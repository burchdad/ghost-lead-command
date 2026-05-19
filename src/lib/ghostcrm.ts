import type { Lead } from "@prisma/client";

function clean(value: string | undefined) {
  return value?.trim() || "";
}

export function getGhostCrmStatus() {
  return {
    configured: Boolean(clean(process.env.GHOSTCRM_SYNC_URL) && clean(process.env.GHOSTCRM_API_KEY)),
    syncUrl: clean(process.env.GHOSTCRM_SYNC_URL) ? "configured" : "missing",
    organizationId: clean(process.env.GHOSTCRM_ORGANIZATION_ID) ? "configured" : "missing",
  };
}

export function mapLeadToGhostCrm(lead: Lead & { contact?: { email?: string | null; phone?: string | null } | null }) {
  return {
    externalId: lead.id,
    organizationId: clean(process.env.GHOSTCRM_ORGANIZATION_ID) || undefined,
    title: lead.name || lead.companyName,
    firstName: lead.name.split(" ")[0] || "",
    lastName: lead.name.split(" ").slice(1).join(" ") || "",
    email: lead.contact?.email || undefined,
    phone: lead.contact?.phone || undefined,
    company: lead.companyName,
    source: lead.source,
    stage: mapStage(lead.stage),
    priority: lead.score >= 85 ? "high" : lead.score >= 70 ? "medium" : "low",
    value: lead.value,
    leadScore: lead.score,
    description: lead.nextAction,
    tags: ["ghost-lead-command", lead.niche].filter(Boolean),
    customFields: {
      niche: lead.niche,
      lastTouch: lead.lastTouch,
      commandStatus: lead.status,
    },
  };
}

export async function pushLeadToGhostCrm(
  lead: Lead & { contact?: { email?: string | null; phone?: string | null } | null },
) {
  const status = getGhostCrmStatus();
  const url = clean(process.env.GHOSTCRM_SYNC_URL);
  const apiKey = clean(process.env.GHOSTCRM_API_KEY);

  if (!status.configured) {
    return {
      status: "queued" as const,
      provider: "ghostcrm",
      dryRun: true,
      message: "GhostCRM sync is not configured. Lead marked ready for CRM sync.",
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lead: mapLeadToGhostCrm(lead) }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      status: "failed" as const,
      provider: "ghostcrm",
      dryRun: false,
      message: payload?.error || payload?.message || `GhostCRM returned ${response.status}.`,
    };
  }

  return {
    status: "synced" as const,
    provider: "ghostcrm",
    dryRun: false,
    message: "Lead synced to GhostCRM.",
    payload,
  };
}

function mapStage(stage: string) {
  const normalized = stage.toLowerCase();
  if (normalized.includes("won")) return "closed_won";
  if (normalized.includes("proposal")) return "proposal";
  if (normalized.includes("booked") || normalized.includes("replied")) return "qualified";
  if (normalized.includes("contacted")) return "contacted";
  return "new";
}
