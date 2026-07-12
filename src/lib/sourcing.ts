export type SourceProvider = "pdl" | "ghost-lead-agent" | "google-maps";

export type SourceSearchInput = {
  provider: SourceProvider;
  query: string;
  location?: string;
  locations?: string[];
  titles?: string[];
  industries?: string[];
  size?: number;
  scrollToken?: string;
};

export type SourceLead = {
  id: string;
  name: string;
  companyName: string;
  title: string;
  email: string;
  phone: string;
  niche: string;
  location: string;
  source: string;
  website?: string;
  sourceUrl?: string;
  score: number;
  confidence: string;
  buyerFit: string;
  intentSignals: string[];
  signalSummary: string;
};

export type SourceDiagnostics = {
  marketsSearched?: string[];
  rawFound: number;
  strictQualified: number;
  reviewReady: number;
  contactable: number;
  missingContact: number;
  suppressed: Record<string, number>;
};

type RawPdlPerson = {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  job_company_name?: string;
  job_company_industry?: string;
  location_name?: string;
  work_email?: string;
  emails?: { address?: string; type?: string }[];
  mobile_phone?: string;
  phone_numbers?: string[];
  linkedin_url?: string;
  job_company_website?: string;
  job_company_size?: string;
  job_company_linkedin_url?: string;
};

type PdlEmail = {
  address?: string;
  type?: string;
};

type SerpApiMapsResult = {
  place_id?: string;
  data_id?: string;
  title?: string;
  type?: string;
  types?: string[];
  address?: string;
  phone?: string;
  website?: string;
  link?: string;
  rating?: number;
  reviews?: number;
  gps_coordinates?: { latitude?: number; longitude?: number };
};

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pdlEmails(value: RawPdlPerson["emails"] | unknown): PdlEmail[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, PdlEmail>);
  return [];
}

function pdlPhoneNumbers(value: RawPdlPerson["phone_numbers"] | unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function clampSize(size: number | undefined) {
  return Math.min(100, Math.max(1, Number(size || 25)));
}

function mockSourceEnabled() {
  return process.env.LEAD_COMMAND_ALLOW_MOCK_SOURCING === "true" || process.env.NODE_ENV !== "production";
}

export function getSourcingStatus() {
  return {
    pdlConfigured: Boolean(clean(process.env.PDL_API_KEY)),
    ghostLeadAgentConfigured: Boolean(clean(process.env.GHOST_LEAD_AGENT_SEARCH_URL)),
    googleMapsConfigured: Boolean(clean(process.env.SERPAPI_API_KEY)),
    mockSourceEnabled: mockSourceEnabled(),
    maxPreviewSize: 100,
  };
}

export async function searchFreshLeads(input: SourceSearchInput) {
  if (input.provider === "ghost-lead-agent") return searchGhostLeadAgent(input);
  if (input.provider === "google-maps") return searchGoogleMaps(input);
  return searchPeopleDataLabs(input);
}

async function searchGoogleMaps(input: SourceSearchInput) {
  const apiKey = clean(process.env.SERPAPI_API_KEY);
  if (!apiKey) {
    if (!mockSourceEnabled()) {
      return {
        provider: "google-maps" as const,
        dryRun: false,
        total: 0,
        scrollToken: null,
        leads: [],
        message: "SerpAPI is not configured. Add SERPAPI_API_KEY to use the built-in Google Maps source.",
      };
    }

    return {
      provider: "google-maps" as const,
      dryRun: true,
      total: mockLeads(input).length,
      scrollToken: null,
      leads: mockLeads(input).map((lead) => ({ ...lead, source: "Google Maps mock" })),
      message: "SERPAPI_API_KEY is not configured. Showing mock Google Maps leads.",
    };
  }

  const markets = sourceMarkets(input).slice(0, 8);
  const perMarketSize = Math.max(5, Math.ceil(clampSize(input.size) / Math.max(1, markets.length)) + 2);
  const fetched = await Promise.all(markets.map((market) => fetchGoogleMapsMarket(input, market, perMarketSize)));
  const failed = fetched.find((result) => result.error);
  if (failed && fetched.every((result) => result.error)) {
    return {
      provider: "google-maps" as const,
      dryRun: false,
      total: 0,
      scrollToken: null,
      leads: [],
      reviewLeads: [],
      diagnostics: emptyDiagnostics(markets),
      message: failed.error,
    };
  }

  const rawResults = dedupeMapsResults(fetched.flatMap((result) => result.results));
  const leads = await Promise.all(
    rawResults.slice(0, clampSize(input.size) * 2).map((result, index) => normalizeGoogleMapsResult(result, index, input)),
  );
  const classified = classifySourceLeads(leads);
  const qualified = classified.qualified
    .sort((a, b) => b.score - a.score)
    .slice(0, clampSize(input.size));
  const reviewLeads = classified.review
    .sort((a, b) => b.score - a.score)
    .slice(0, clampSize(input.size));
  const diagnostics = sourceDiagnostics(leads, qualified, reviewLeads, markets);

  return {
    provider: "google-maps" as const,
    dryRun: false,
    total: rawResults.length,
    scrollToken: fetched.find((result) => result.scrollToken)?.scrollToken || null,
    leads: qualified,
    reviewLeads,
    diagnostics,
    message:
      qualified.length === 0
        ? `Google Maps found ${rawResults.length} businesses across ${markets.length} market${markets.length === 1 ? "" : "s"}, but ${reviewLeads.length} need review/enrichment before email outreach.`
        : undefined,
  };
}

async function fetchGoogleMapsMarket(input: SourceSearchInput, market: string, size: number) {
  const query = [input.query, market].map(clean).filter(Boolean).join(" ");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", query || "B2B services United States");
  url.searchParams.set("api_key", clean(process.env.SERPAPI_API_KEY));
  url.searchParams.set("hl", "en");
  url.searchParams.set("type", "search");
  if (input.scrollToken) url.searchParams.set("next_page_token", input.scrollToken);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      results: [] as SerpApiMapsResult[],
      scrollToken: null,
      error: `SerpAPI Google Maps returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`,
    };
  }

  const payload = (await response.json()) as {
    local_results?: SerpApiMapsResult[];
    place_results?: SerpApiMapsResult;
    serpapi_pagination?: { next_page_token?: string };
    error?: string;
  };
  const results = payload.local_results || (payload.place_results ? [payload.place_results] : []);
  return {
    results: results.slice(0, size),
    scrollToken: payload.serpapi_pagination?.next_page_token || null,
    error: payload.error || null,
  };
}

async function searchPeopleDataLabs(input: SourceSearchInput) {
  const apiKey = clean(process.env.PDL_API_KEY);
  if (!apiKey) {
    if (!mockSourceEnabled()) {
      return {
        provider: "pdl" as const,
        dryRun: false,
        total: 0,
        scrollToken: null,
        leads: [],
        message: "People Data Labs is not configured. Add PDL_API_KEY or set LEAD_COMMAND_ALLOW_MOCK_SOURCING=true for demos.",
      };
    }

    return {
      provider: "pdl" as const,
      dryRun: true,
      total: mockLeads(input).length,
      scrollToken: null,
      leads: mockLeads(input),
      message: "PDL_API_KEY is not configured. Showing mock fresh leads so the workflow can be tested.",
    };
  }

  const sql = buildPdlSql(input);
  const response = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      sql,
      size: clampSize(input.size),
      scroll_token: input.scrollToken || undefined,
      dataset: "email,phone,mobile_phone,resume",
      titlecase: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      provider: "pdl" as const,
      dryRun: false,
      total: 0,
      scrollToken: null,
      leads: [],
      message: `People Data Labs returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`,
    };
  }

  const payload = (await response.json()) as {
    data?: RawPdlPerson[];
    total?: number;
    scroll_token?: string;
    error?: string;
    message?: string;
  };
  const leads = (payload.data || []).map((person) => normalizePdlPerson(person));
  const qualified = leads
    .filter((lead) => !isSuppressedSourceLead(lead))
    .sort((a, b) => b.score - a.score);

  return {
    provider: "pdl" as const,
    dryRun: false,
    total: payload.total || 0,
    scrollToken: payload.scroll_token || null,
    leads: qualified,
    message:
      qualified.length === 0
        ? payload.message ||
          payload.error ||
          "People Data Labs returned matches, but none passed the owner/operator quality filter. Try a city/state or broaden titles."
        : undefined,
  };
}

async function searchGhostLeadAgent(input: SourceSearchInput) {
  const url = clean(process.env.GHOST_LEAD_AGENT_SEARCH_URL);
  if (!url) {
    if (!mockSourceEnabled()) {
      return {
        provider: "ghost-lead-agent" as const,
        dryRun: false,
        total: 0,
        scrollToken: null,
        leads: [],
        message: "Ghost Lead Agent is not configured. Add GHOST_LEAD_AGENT_SEARCH_URL or enable mock sourcing for demos.",
      };
    }

    return {
      provider: "ghost-lead-agent" as const,
      dryRun: true,
      total: mockLeads(input).length,
      scrollToken: null,
      leads: mockLeads(input).map((lead) => ({ ...lead, source: "Ghost Lead Intelligence mock" })),
      message: "GHOST_LEAD_AGENT_SEARCH_URL is not configured. Showing mock fresh leads.",
    };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = clean(process.env.GHOST_LEAD_AGENT_API_KEY);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      urls: input.query
        .split(/[\n,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, clampSize(input.size)),
      persist: false,
      draft: false,
      limit: clampSize(input.size),
    }),
  });

  if (!response.ok) {
    return {
      provider: "ghost-lead-agent" as const,
      dryRun: false,
      total: 0,
      scrollToken: null,
      leads: [],
      message: `Ghost Lead Intelligence endpoint returned ${response.status}.`,
    };
  }

  const payload = await response.json();
  const rawLeads = Array.isArray(payload.leads) ? payload.leads : Array.isArray(payload.data) ? payload.data : [];

  return {
    provider: "ghost-lead-agent" as const,
    dryRun: false,
    total: Number(payload.total || rawLeads.length),
    scrollToken: payload.scrollToken || payload.scroll_token || null,
    leads: rawLeads.map((lead: Record<string, unknown>, index: number) =>
      normalizeGenericLead(lead, index, "Ghost Lead Intelligence"),
    ),
  };
}

function buildPdlSql(input: SourceSearchInput) {
  const queryTerms = tokenizeSearch(input.query).slice(0, 4);
  const industries = (input.industries || [])
    .flatMap((term) => tokenizeSearch(term))
    .slice(0, 4)
    .filter(Boolean);
  const titles = (input.titles?.length ? input.titles : ["Owner", "Founder", "CEO", "President"])
    .flatMap((term) => tokenizeSearch(term))
    .filter(Boolean);
  const where = ["(work_email IS NOT NULL OR mobile_phone IS NOT NULL)"];

  const titleClause = orLike("job_title", titles);
  if (titleClause) {
    where.push(titleClause);
  }

  const industryTerms = industries.length ? industries : queryTerms;
  const industryClause = orLikeMany(["job_company_industry", "job_company_name"], industryTerms);
  if (industryClause) {
    where.push(industryClause);
  }

  const location = clean(input.location).toLowerCase();
  if (location) {
    where.push(orLikeMany(["location_name", "job_company_location_name"], [location]));
  }

  return `SELECT * FROM person WHERE ${where.filter(Boolean).join(" AND ")}`;
}

function normalizePdlPerson(person: RawPdlPerson): SourceLead {
  const emails = pdlEmails(person.emails);
  const phoneNumbers = pdlPhoneNumbers(person.phone_numbers);
  const name =
    clean(person.full_name) ||
    [person.first_name, person.last_name].map((part) => clean(part)).filter(Boolean).join(" ") ||
    "Unknown Contact";
  const email =
    clean(person.work_email) ||
    clean(emails.find((email) => email.type === "professional")?.address) ||
    clean(emails[0]?.address);
  const phone = clean(person.mobile_phone) || clean(phoneNumbers[0]);
  const niche = clean(person.job_company_industry) || "General";
  const companyName = clean(person.job_company_name) || "Unknown Company";
  const title = clean(person.job_title) || "Decision maker";

  const buyerFit = classifyBuyerFit({ title, companyName });
  const intentSignals = inferIntentSignals({
    title,
    niche,
    companyName,
    hasEmail: Boolean(email),
    hasPhone: Boolean(phone),
    website: person.job_company_website,
    linkedinUrl: person.job_company_linkedin_url || person.linkedin_url,
    companySize: person.job_company_size,
  });

  return {
    id: person.id || `${name}:${companyName}`,
    name,
    companyName,
    title,
    email,
    phone,
    niche,
    location: clean(person.location_name),
    source: "People Data Labs",
    score: scoreLead({ title, email, phone, niche, companyName, intentSignals }),
    confidence: email || phone ? "contactable" : "needs enrichment",
    buyerFit,
    intentSignals,
    signalSummary: summarizeSignals(intentSignals),
  };
}

function normalizeGenericLead(
  lead: Record<string, unknown>,
  index: number,
  source: string,
): SourceLead {
  const name = String(lead.name || lead.full_name || lead.contact || "Unknown Contact");
  const companyName = String(lead.companyName || lead.company_name || lead.company || "Unknown Company");
  const title = String(lead.title || lead.job_title || lead.role || "Decision maker");
  const email = String(lead.email || lead.work_email || "");
  const phone = String(lead.phone || lead.mobile_phone || lead.mobile || "");
  const niche = String(lead.niche || lead.industry || lead.company_industry || "General");
  const buyerFit = String(lead.buyerFit || lead.buyer_fit || classifyBuyerFit({ title, companyName }));
  const intentSignals = normalizeSignals(lead.intentSignals || lead.intent_signals || lead.signals).length
    ? normalizeSignals(lead.intentSignals || lead.intent_signals || lead.signals)
    : inferIntentSignals({
        title,
        niche,
        companyName,
        hasEmail: Boolean(email),
        hasPhone: Boolean(phone),
        website: String(lead.website || lead.domain || ""),
        linkedinUrl: String(lead.linkedin || lead.linkedin_url || ""),
        companySize: String(lead.companySize || lead.company_size || ""),
      });

  return {
    id: String(lead.id || `${source}:${index}:${name}:${companyName}`),
    name,
    companyName,
    title,
    email,
    phone,
    niche,
    location: String(lead.location || lead.location_name || ""),
    source,
    score: Number(lead.score || scoreLead({ title, email, phone, niche, companyName, intentSignals })),
    confidence: String(lead.confidence || (email || phone ? "contactable" : "needs enrichment")),
    buyerFit,
    intentSignals,
    signalSummary: String(lead.signalSummary || lead.signal_summary || summarizeSignals(intentSignals)),
  };
}

async function normalizeGoogleMapsResult(
  result: SerpApiMapsResult,
  index: number,
  input: SourceSearchInput,
): Promise<SourceLead> {
  const companyName = clean(result.title) || "Unknown Company";
  const website = normalizeWebsite(result.website || "");
  const websiteContact = website ? await extractWebsiteContact(website) : { email: "", phone: "" };
  const phone = clean(result.phone) || websiteContact.phone;
  const email = websiteContact.email;
  const niche = clean(result.type) || clean(result.types?.[0]) || clean(input.industries?.[0]) || "Local Business";
  const location = clean(result.address) || clean(input.location);
  const reviews = Number(result.reviews || 0);
  const rating = Number(result.rating || 0);
  const title = "Owner or Growth Operator";
  const intentSignals = [
    "Google Maps business matched search intent",
    website ? "website available for offer audit" : "",
    email ? "public website email discovered" : "",
    phone ? "phone path available for follow-up" : "",
    reviews ? `${reviews} Google reviews` : "",
    rating ? `${rating.toFixed(1)} Google rating` : "",
    result.link ? "Google business profile available for context" : "",
  ].filter(Boolean);

  return {
    id: result.place_id || result.data_id || `google-maps:${index}:${companyName}`,
    name: `Team at ${companyName}`,
    companyName,
    title,
    email,
    phone,
    niche,
    location,
    source: "Google Maps via SerpAPI",
    website,
    sourceUrl: result.link,
    score: scoreLead({ title, email, phone, niche, companyName, intentSignals }),
    confidence: email || phone ? "contactable" : "needs enrichment",
    buyerFit: classifyBuyerFit({ title, companyName }),
    intentSignals,
    signalSummary: summarizeSignals(intentSignals),
  };
}

function scoreLead({
  title,
  email,
  phone,
  niche,
  companyName,
  intentSignals = [],
}: {
  title: string;
  email: string;
  phone: string;
  niche: string;
  companyName: string;
  intentSignals?: string[];
}) {
  let score = 38;
  const text = `${title} ${niche} ${companyName}`.toLowerCase();
  const buyerFit = classifyBuyerFit({ title, companyName });
  const strongSignals = intentSignals.filter((signal) =>
    /hiring|growth|ad|paid|funding|launch|review|traffic|booking|conversion|leak|demo|forms?|chat|calendar/i.test(signal),
  );
  if (email) score += 12;
  if (phone) score += 8;
  if (buyerFit === "Owner") score += 16;
  if (buyerFit === "Operator") score += 11;
  if (text.includes("operations") || text.includes("marketing") || text.includes("growth")) score += 4;
  if (text.includes("dental") || text.includes("hvac") || text.includes("roofing") || text.includes("med spa")) {
    score += 7;
  }
  score += Math.min(14, intentSignals.length * 3);
  score += Math.min(14, strongSignals.length * 5);
  if (intentSignals.some((signal) => /slow follow-up|missed|leak|conversion|booking/i.test(signal))) score += 6;
  if (isInstitutionalCompany(companyName)) score -= 25;
  if (isVendorCompany(companyName) || buyerFit === "Vendor risk") score -= 20;
  if (isNonBuyerTitle(title)) score -= 10;
  const eliteCap = strongSignals.length >= 2 && (email || phone);
  const cap =
    eliteCap ? 100 :
    buyerFit === "Owner" ? 94 :
    buyerFit === "Operator" ? 91 :
    buyerFit === "Manager" ? 88 :
    buyerFit === "Vendor risk" ? 74 :
    buyerFit === "Institutional risk" ? 60 :
    80;
  return Math.max(0, Math.min(cap, score));
}

function normalizeWebsite(value: unknown) {
  const site = clean(value);
  if (!site) return "";
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

async function extractWebsiteContact(website: string) {
  const candidates = websiteContactUrls(website);
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
        headers: {
          "User-Agent": "GhostLeadCommand/1.0 (+https://ghostai.solutions)",
        },
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
      const html = await response.text();
      const email = extractEmail(html);
      const phone = extractPhone(html);
      if (email || phone) return { email, phone };
    } catch {
      continue;
    }
  }
  return { email: "", phone: "" };
}

function websiteContactUrls(website: string) {
  try {
    const base = new URL(website);
    base.hash = "";
    base.search = "";
    const origin = base.origin;
    return [
      base.toString(),
      `${origin}/contact`,
      `${origin}/contact-us`,
      `${origin}/about`,
      `${origin}/about-us`,
    ];
  } catch {
    return [];
  }
}

function extractEmail(html: string) {
  const mailto = html.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
  const plain = html.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i)?.[0];
  const email = clean(mailto || plain).toLowerCase();
  if (!email || /(example|domain|sentry|wixpress|schema|placeholder)/i.test(email)) return "";
  return email;
}

function extractPhone(html: string) {
  const tel = html.match(/tel:([+\d().\-\s]{7,})/i)?.[1];
  const plain = html.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
  return clean(tel || plain);
}

function sourceMarkets(input: SourceSearchInput) {
  const explicit = (input.locations || []).map(clean).filter(Boolean);
  if (explicit.length) return Array.from(new Set(explicit));
  const location = clean(input.location);
  return location ? [location] : ["United States"];
}

function dedupeMapsResults(results: SerpApiMapsResult[]) {
  const seen = new Set<string>();
  const deduped: SerpApiMapsResult[] = [];
  for (const result of results) {
    const key = [
      clean(result.place_id),
      clean(result.data_id),
      clean(result.title).toLowerCase(),
      clean(result.phone).replace(/\D/g, ""),
      clean(result.address).toLowerCase(),
    ]
      .filter(Boolean)
      .join(":");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function sourceDiagnostics(
  allLeads: SourceLead[],
  qualified: SourceLead[],
  reviewLeads: SourceLead[],
  marketsSearched?: string[],
): SourceDiagnostics {
  const suppressed: Record<string, number> = {};
  for (const lead of allLeads) {
    for (const reason of sourceLeadIssues(lead)) {
      suppressed[reason] = (suppressed[reason] || 0) + 1;
    }
  }

  return {
    marketsSearched,
    rawFound: allLeads.length,
    strictQualified: qualified.length,
    reviewReady: reviewLeads.length,
    contactable: allLeads.filter((lead) => lead.email || lead.phone).length,
    missingContact: allLeads.filter((lead) => !lead.email && !lead.phone).length,
    suppressed,
  };
}

function emptyDiagnostics(marketsSearched?: string[]): SourceDiagnostics {
  return {
    marketsSearched,
    rawFound: 0,
    strictQualified: 0,
    reviewReady: 0,
    contactable: 0,
    missingContact: 0,
    suppressed: {},
  };
}

function classifySourceLeads(leads: SourceLead[]) {
  const qualified: SourceLead[] = [];
  const review: SourceLead[] = [];

  for (const lead of leads) {
    const issues = sourceLeadIssues(lead);
    if (!issues.length) {
      qualified.push(lead);
      continue;
    }
    if (isReviewReadySourceLead(lead, issues)) review.push(lead);
  }

  return { qualified, review };
}

function isReviewReadySourceLead(lead: SourceLead, issues = sourceLeadIssues(lead)) {
  if (!lead.companyName || lead.companyName === "Unknown Company") return false;
  if (isInstitutionalCompany(lead.companyName)) return false;
  if (issues.includes("institutional-company") || issues.includes("vendor-risk")) return false;
  if (isVendorCompany(lead.companyName) || lead.buyerFit === "Vendor risk") return false;
  if (!lead.email && !lead.phone && !lead.website) return false;
  if (lead.score < 45) return false;
  const softIssues = [...issues, !lead.email ? "missing-email" : "", !lead.phone ? "missing-phone" : ""].filter(Boolean);
  return softIssues.some((reason) =>
    ["missing-email", "missing-phone", "below-source-score", "unclear-buyer-fit", "generic-contact", "generic-title"].includes(reason),
  );
}

function sourceLeadIssues(lead: SourceLead) {
  const issues: string[] = [];
  if (!lead.email && !lead.phone) issues.push("missing-contact-path");
  if (!lead.companyName || lead.companyName === "Unknown Company") issues.push("missing-company");
  if (!lead.name || lead.name === "Unknown Contact") issues.push("generic-contact");
  if (!lead.title || lead.title === "Decision maker") issues.push("generic-title");
  if (isInstitutionalCompany(lead.companyName) || isGovernmentWebsite(lead) || isBareMunicipalityLead(lead)) {
    issues.push("institutional-company");
  }
  if (isVendorCompany(lead.companyName) || lead.buyerFit === "Vendor risk") issues.push("vendor-risk");
  if (lead.buyerFit === "Unclear") issues.push("unclear-buyer-fit");
  if (lead.score < 60) issues.push("below-source-score");
  return issues;
}

function isSuppressedSourceLead(lead: SourceLead) {
  return sourceLeadIssues(lead).length > 0;
}

function classifyBuyerFit({ title, companyName }: { title: string; companyName: string }) {
  const role = title.toLowerCase();
  if (isInstitutionalCompany(companyName)) return "Institutional risk";
  if (isVendorCompany(companyName) || isVendorTitle(title)) return "Vendor risk";
  if (["vice president", "vp ", "general manager", "managing partner", "operator", "operations"].some((term) => role.includes(term))) {
    return "Operator";
  }
  if (["owner", "founder", "ceo", "president", "principal"].some((term) => role.includes(term))) return "Owner";
  if (["manager", "director", "head of"].some((term) => role.includes(term))) return "Manager";
  return "Unclear";
}

function isInstitutionalCompany(companyName: string) {
  const company = companyName.toLowerCase();
  return [
    "association",
    "institute",
    "university",
    "college",
    "school",
    "government",
    "municipal",
    "department",
    "foundation",
    "nonprofit",
    "non-profit",
    "city of",
    "county of",
    "state of",
  ].some((term) => company.includes(term));
}

function isGovernmentWebsite(lead: SourceLead) {
  const website = clean((lead as SourceLead & { website?: string }).website).toLowerCase();
  if (!website) return false;
  return (
    /\.gov(\/|$)/.test(website) ||
    /\b(cityof|city-of|county|municipal|txdot|texas\.gov|tx\.gov)\b/.test(website)
  );
}

function isBareMunicipalityLead(lead: SourceLead) {
  const company = clean(lead.companyName).toLowerCase();
  const location = clean(lead.location).toLowerCase();
  if (!company || !location) return false;
  if (company.split(/\s+/).length > 3) return false;
  if (
    /\b(hvac|heating|air|cooling|roof|plumb|electric|service|services|contract|contractor|company|llc|inc|co)\b/.test(
      company,
    )
  ) {
    return false;
  }
  return (
    location.includes(`${company},`) ||
    location.includes(`${company} tx`) ||
    location.includes(`${company} texas`)
  );
}

function isNonBuyerTitle(title: string) {
  const role = title.toLowerCase();
  return ["intern", "assistant", "student", "recruiter", "future executives"].some((term) => role.includes(term));
}

function isVendorCompany(companyName: string) {
  const company = companyName.toLowerCase();
  return ["career coach", "life coach", "student consultant", "freelance recruiter"].some((term) =>
    company.includes(term),
  );
}

function isVendorTitle(title: string) {
  const role = title.toLowerCase();
  return ["career coach", "life coach", "student recruiter"].some((term) => role.includes(term));
}

function tokenizeSearch(value: unknown) {
  return clean(value)
    .split(/[\s,]+/)
    .map((term) => term.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter((term) => term.length > 2 && !["and", "the", "for", "with", "businesses", "owners"].includes(term));
}

function normalizeSignals(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 6);
  }
  if (typeof value === "string") {
    return value
      .split(/[|;,]\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}

function inferIntentSignals({
  title,
  niche,
  companyName,
  hasEmail,
  hasPhone,
  website,
  linkedinUrl,
  companySize,
}: {
  title: string;
  niche: string;
  companyName: string;
  hasEmail: boolean;
  hasPhone: boolean;
  website?: string;
  linkedinUrl?: string;
  companySize?: string;
}) {
  const text = `${title} ${niche} ${companyName}`.toLowerCase();
  const signals = new Set<string>();

  if (hasEmail) signals.add("direct business email available");
  if (hasPhone) signals.add("phone path available for follow-up");
  if (website) signals.add("website available for offer audit");
  if (linkedinUrl) signals.add("social/company profile available for context");
  if (companySize) signals.add(`company size signal: ${companySize}`);
  if (/growth|marketing|demand|revenue|sales/.test(text)) signals.add("growth or revenue owner identified");
  if (/operations|operator|general manager|vice president|vp /.test(text)) signals.add("operator likely owns process leakage");
  if (/owner|founder|ceo|president|principal/.test(text)) signals.add("economic buyer identified");
  if (/software|saas|technology|consulting|agency|service|home|health|dental|roofing|hvac|med spa/.test(text)) {
    signals.add("service business likely has speed-to-lead pressure");
  }

  return Array.from(signals).slice(0, 6);
}

function summarizeSignals(signals: string[]) {
  if (!signals.length) return "Contact matched ICP, but needs deeper intent enrichment before outreach.";
  return signals.slice(0, 3).join("; ");
}

function sqlValue(value: string) {
  return value.replace(/'/g, "''");
}

function like(field: string, value: string) {
  return `${field} LIKE '%${sqlValue(value)}%'`;
}

function orLike(field: string, values: string[]) {
  return `(${values.map((value) => like(field, value)).join(" OR ")})`;
}

function orLikeMany(fields: string[], values: string[]) {
  const clauses = values.flatMap((value) => fields.map((field) => like(field, value)));
  return clauses.length ? `(${clauses.join(" OR ")})` : "";
}

function mockLeads(input: SourceSearchInput): SourceLead[] {
  const niche = input.industries?.[0] || input.query || "Local services";
  const location = input.location || "United States";

  return [
    {
      id: "mock:1",
      name: "Avery Brooks",
      companyName: "Brooks Family Dental",
      title: "Owner",
      email: "avery@example.com",
      phone: "555-4101",
      niche,
      location,
      source: "People Data Labs mock",
      score: 92,
      confidence: "contactable",
      buyerFit: "Owner",
      intentSignals: ["economic buyer identified", "website available for offer audit", "slow follow-up risk"],
      signalSummary: "economic buyer identified; website available for offer audit; slow follow-up risk",
    },
    {
      id: "mock:2",
      name: "Jordan Miles",
      companyName: "Miles HVAC",
      title: "Founder",
      email: "jordan@example.com",
      phone: "555-4102",
      niche,
      location,
      source: "People Data Labs mock",
      score: 90,
      confidence: "contactable",
      buyerFit: "Owner",
      intentSignals: ["economic buyer identified", "phone path available for follow-up", "service business with speed-to-lead pressure"],
      signalSummary: "economic buyer identified; phone path available for follow-up; service business with speed-to-lead pressure",
    },
    {
      id: "mock:3",
      name: "Taylor Chen",
      companyName: "Chen Med Spa",
      title: "Marketing Director",
      email: "taylor@example.com",
      phone: "",
      niche,
      location,
      source: "People Data Labs mock",
      score: 76,
      confidence: "contactable",
      buyerFit: "Manager",
      intentSignals: ["growth or revenue owner identified", "direct business email available", "booking conversion risk"],
      signalSummary: "growth or revenue owner identified; direct business email available; booking conversion risk",
    },
  ].slice(0, clampSize(input.size));
}
