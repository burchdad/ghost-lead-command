import type { Lead } from "@prisma/client";

function clean(value: string | undefined) {
  return value?.trim() || "";
}

export function getGhostCrmStatus() {
  const syncUrl = clean(process.env.GHOSTCRM_SYNC_URL);
  const apiKey = clean(process.env.GHOSTCRM_API_KEY);
  const organizationId = clean(process.env.GHOSTCRM_ORGANIZATION_ID);

  return {
    configured: Boolean(syncUrl && apiKey),
    syncUrl: syncUrl ? "configured" : "missing",
    apiKey: apiKey ? "configured" : "missing",
    organizationId: organizationId ? "configured" : "api-key-default",
  };
}

export async function getGhostCrmHealth() {
  const status = getGhostCrmStatus();
  const syncUrl = clean(process.env.GHOSTCRM_SYNC_URL);

  if (!status.configured || !syncUrl) {
    return {
      ...status,
      reachable: false,
      detail: "Missing GhostCRM sync URL or API key.",
    };
  }

  try {
    const healthUrl = deriveHealthUrl(syncUrl);
    const response = await fetch(healthUrl, { cache: "no-store" });

    return {
      ...status,
      reachable: response.ok,
      detail: response.ok ? "Reachable" : `Health returned ${response.status}`,
    };
  } catch (error) {
    return {
      ...status,
      reachable: false,
      detail: error instanceof Error ? error.message : "Health check failed",
    };
  }
}

function deriveHealthUrl(syncUrl: string) {
  const url = new URL(normalizeUrl(syncUrl));
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function mapLeadToGhostCrm(lead: Lead & { contact?: { email?: string | null; phone?: string | null } | null }) {
  const customFields =
    lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
      ? lead.customFields
      : {};
  const tags = Array.isArray(lead.tags)
    ? lead.tags.filter((tag): tag is string => typeof tag === "string")
    : ["ghost-lead-command", lead.niche].filter(Boolean);

  return {
    externalId: lead.id,
    organizationId: clean(process.env.GHOSTCRM_ORGANIZATION_ID) || undefined,
    title: lead.title || lead.name || lead.companyName,
    firstName: lead.name.split(" ")[0] || "",
    lastName: lead.name.split(" ").slice(1).join(" ") || "",
    email: lead.contact?.email || undefined,
    phone: lead.contact?.phone || undefined,
    company: lead.companyName,
    source: lead.source,
    stage: mapStage(lead.stage),
    priority: lead.priority || (lead.score >= 85 ? "high" : lead.score >= 70 ? "medium" : "low"),
    value: lead.value,
    leadScore: lead.leadScore || lead.score,
    description: lead.description || lead.nextAction,
    tags,
    customFields: {
      niche: lead.niche,
      lastTouch: lead.lastTouch,
      commandStatus: lead.status,
      ...customFields,
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

  let syncUrl: string;
  try {
    syncUrl = normalizeUrl(url);
    new URL(syncUrl);
  } catch {
    return {
      status: "failed" as const,
      provider: "ghostcrm",
      dryRun: false,
      message: "GhostCRM sync URL is invalid. Use the full public Railway URL ending in /api/lead-command/sync.",
    };
  }

  const response = await fetch(syncUrl, {
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
  if (normalized.includes("waitlist")) return "waitlist";
  return "new";
}
