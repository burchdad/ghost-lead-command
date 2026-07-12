import { createAutomationEvent } from "@/lib/automation";

type LinkedInEvent = {
  id?: string | number;
  vanityName?: string;
  organizer?: string;
  startsAt?: number;
  leadGenForm?: string;
  name?: { localized?: Record<string, string> };
};

type LinkedInListResponse<T> = {
  elements?: T[];
  paging?: {
    count?: number;
    start?: number;
    total?: number;
  };
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function boolEnv(name: string, fallback = false) {
  const value = clean(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on", "enabled", "provisioned"].includes(value);
}

export function getLinkedInProductStatus() {
  const token = clean(process.env.LINKEDIN_ACCESS_TOKEN);
  const organizationUrn = clean(process.env.LINKEDIN_ORGANIZATION_URN || process.env.LINKEDIN_ORG_URN);
  const leadSyncStatus = clean(process.env.LINKEDIN_LEAD_SYNC_STATUS || "review_in_progress");
  const eventsEnabled = boolEnv("LINKEDIN_EVENTS_MANAGEMENT_ENABLED", Boolean(token));
  return {
    configured: Boolean(token || (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)),
    accessToken: token ? "configured" : "missing",
    organizationUrn: organizationUrn ? "configured" : "missing",
    version: clean(process.env.LINKEDIN_VERSION) || "202606",
    products: {
      adLibrary: "default",
      shareOnLinkedIn: "default",
      advertisingApi: "development",
      eventsManagement: eventsEnabled ? "provisioned" : "not_enabled",
      leadSync: leadSyncStatus,
    },
    ready: {
      eventsManagement: Boolean(token && organizationUrn && eventsEnabled),
      leadSync: Boolean(token && organizationUrn && /^approved|provisioned|enabled$/i.test(leadSyncStatus)),
    },
    nextSteps: [
      token ? "" : "Add LINKEDIN_ACCESS_TOKEN after OAuth/token generation.",
      organizationUrn ? "" : "Add LINKEDIN_ORGANIZATION_URN, for example urn:li:organization:123456.",
      eventsEnabled ? "" : "Set LINKEDIN_EVENTS_MANAGEMENT_ENABLED=true after product access is provisioned.",
      /^approved|provisioned|enabled$/i.test(leadSyncStatus)
        ? ""
        : "Keep LINKEDIN_LEAD_SYNC_STATUS=review_in_progress until LinkedIn approves Lead Sync.",
    ].filter(Boolean),
  };
}

function headers() {
  const status = getLinkedInProductStatus();
  return {
    Authorization: `Bearer ${clean(process.env.LINKEDIN_ACCESS_TOKEN)}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Linkedin-Version": status.version,
    "X-Restli-Protocol-Version": "2.0.0",
    "X-LI-R2-W-MsgType": "REST",
  };
}

async function linkedinFetch<T>(path: string) {
  const response = await fetch(`https://api.linkedin.com${path}`, {
    headers: headers(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LinkedIn returned ${response.status}: ${JSON.stringify(body).slice(0, 320)}`);
  }
  return body as T;
}

export async function listLinkedInEvents(input: {
  count?: number;
  start?: number;
  leadGenOnly?: boolean;
  lifeCycleState?: "UPCOMING" | "ONGOING" | "PAST";
} = {}) {
  const status = getLinkedInProductStatus();
  if (!status.ready.eventsManagement) {
    return {
      ok: false,
      status,
      events: [] as LinkedInEvent[],
      message: "LinkedIn Events Management is not ready. Check token, organization URN, and product enablement.",
    };
  }

  const organizationUrn = clean(process.env.LINKEDIN_ORGANIZATION_URN || process.env.LINKEDIN_ORG_URN);
  const params = new URLSearchParams({
    organizer: organizationUrn,
    start: String(Math.max(0, Number(input.start || 0))),
    count: String(Math.min(50, Math.max(1, Number(input.count || 10)))),
    q: input.leadGenOnly ? "organizerLeadGenFormEnabledEvents" : "eventsByOrganizer",
  });

  if (!input.leadGenOnly) {
    params.set("excludeCancelled", "true");
    params.set("sortOrder", "START_TIME_ASC");
    if (input.lifeCycleState) params.set("timeBasedFilter", `(lifeCycleState:${input.lifeCycleState})`);
  }

  const payload = await linkedinFetch<LinkedInListResponse<LinkedInEvent>>(`/rest/events?${params.toString()}`);
  const events = payload.elements || [];
  await createAutomationEvent({
    title: input.leadGenOnly ? "LinkedIn lead-gen events checked" : "LinkedIn events checked",
    detail: `Fetched ${events.length} LinkedIn event records from Events Management API.`,
    status: "done",
    type: "linkedin",
    payload: { count: events.length, paging: payload.paging, leadGenOnly: Boolean(input.leadGenOnly) },
  });
  return {
    ok: true,
    status,
    events,
    paging: payload.paging,
    message: `Fetched ${events.length} LinkedIn events.`,
  };
}

export async function getLinkedInLeadSyncReadiness() {
  const status = getLinkedInProductStatus();
  return {
    ok: status.ready.leadSync,
    status,
    message: status.ready.leadSync
      ? "LinkedIn Lead Sync is ready for lead form response retrieval."
      : "LinkedIn Lead Sync is still under review, so Lead Command will keep using Sales Navigator paste/screenshot and Events Management until approval lands.",
    supportedLeadTypes: ["SPONSORED", "EVENT", "COMPANY", "ORGANIZATION_PRODUCT"],
  };
}
