type JsonObject = Record<string, unknown>;

type PortalLeadInput = {
  id?: string;
  source?: string | null;
  score?: number | null;
  customFields?: unknown;
  contact?: {
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    title?: string | null;
  } | null;
  company?: {
    website?: string | null;
    domain?: string | null;
    crmSource?: string | null;
  } | null;
};

function clean(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function normalizeUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function sourceName(value: string) {
  return value
    .replace(/^lead command:/i, "")
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function buildPortalLeadEvidence(lead: PortalLeadInput) {
  const fields = asObject(lead.customFields);
  const email = clean(lead.contact?.email);
  const phone = clean(lead.contact?.phone);
  const website = normalizeUrl(lead.company?.website || fields.website || lead.company?.domain);
  const sourceUrl = normalizeUrl(fields.sourceUrl);
  const sourceProvider = clean(fields.sourceProvider || lead.source || lead.company?.crmSource);
  const sourceSignals = asStringArray(fields.intentSignals);
  const sourceEvidence = unique([
    sourceProvider,
    clean(lead.source),
    clean(lead.company?.crmSource),
    sourceUrl ? "Source profile URL" : "",
    website ? "Company website" : "",
    email ? "Verified email on contact" : "",
    phone ? "Phone path on contact" : "",
    ...sourceSignals,
  ]);

  const sourceLabels = unique([
    sourceProvider ? sourceName(sourceProvider) : "",
    clean(lead.source) && clean(lead.source) !== sourceProvider ? sourceName(clean(lead.source)) : "",
    sourceUrl ? "source profile" : "",
    website ? "website" : "",
  ]);

  return {
    email: {
      address: email || null,
      status: email ? "ready" : "needs_enrichment",
      display: email || "Email blocked until a verified address is found",
      canSend: Boolean(email),
    },
    phone: {
      number: phone || null,
      status: phone ? "callable" : "missing",
      display: phone || "No callable phone captured yet",
      canCall: Boolean(phone),
    },
    website: {
      url: website || null,
      status: website ? "found" : "missing",
      display: website || "No website captured yet",
      canOpen: Boolean(website),
    },
    source: {
      primary: sourceProvider || clean(lead.source) || null,
      labels: sourceLabels,
      sourceUrl: sourceUrl || null,
      evidence: sourceEvidence,
      verificationCount: sourceEvidence.length,
      confidence: sourceEvidence.length >= 4 ? "multi-signal" : sourceEvidence.length >= 2 ? "single-source-plus-context" : "needs-confirmation",
    },
  };
}
