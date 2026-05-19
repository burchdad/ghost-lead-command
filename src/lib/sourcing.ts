export type SourceProvider = "pdl" | "ghost-lead-agent";

export type SourceSearchInput = {
  provider: SourceProvider;
  query: string;
  location?: string;
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
  score: number;
  confidence: string;
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
};

function clean(value: string | undefined) {
  return value?.trim() || "";
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
    mockSourceEnabled: mockSourceEnabled(),
    maxPreviewSize: 100,
  };
}

export async function searchFreshLeads(input: SourceSearchInput) {
  if (input.provider === "ghost-lead-agent") return searchGhostLeadAgent(input);
  return searchPeopleDataLabs(input);
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
  const name =
    clean(person.full_name) ||
    [person.first_name, person.last_name].map((part) => clean(part)).filter(Boolean).join(" ") ||
    "Unknown Contact";
  const email =
    clean(person.work_email) ||
    clean(person.emails?.find((email) => email.type === "professional")?.address) ||
    clean(person.emails?.[0]?.address);
  const phone = clean(person.mobile_phone) || clean(person.phone_numbers?.[0]);
  const niche = clean(person.job_company_industry) || "General";
  const companyName = clean(person.job_company_name) || "Unknown Company";
  const title = clean(person.job_title) || "Decision maker";

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
    score: scoreLead({ title, email, phone, niche, companyName }),
    confidence: email || phone ? "contactable" : "needs enrichment",
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
    score: Number(lead.score || scoreLead({ title, email, phone, niche, companyName })),
    confidence: String(lead.confidence || (email || phone ? "contactable" : "needs enrichment")),
  };
}

function scoreLead({
  title,
  email,
  phone,
  niche,
  companyName,
}: {
  title: string;
  email: string;
  phone: string;
  niche: string;
  companyName: string;
}) {
  let score = 45;
  const text = `${title} ${niche} ${companyName}`.toLowerCase();
  if (email) score += 15;
  if (phone) score += 15;
  if (text.includes("owner") || text.includes("founder") || text.includes("ceo") || text.includes("president")) {
    score += 20;
  }
  if (text.includes("general manager") || text.includes("managing partner") || text.includes("operator")) score += 12;
  if (text.includes("operations") || text.includes("marketing") || text.includes("growth")) score += 4;
  if (text.includes("dental") || text.includes("hvac") || text.includes("roofing") || text.includes("med spa")) {
    score += 7;
  }
  if (isInstitutionalCompany(companyName)) score -= 25;
  if (isNonBuyerTitle(title)) score -= 10;
  return Math.min(100, score);
}

function isSuppressedSourceLead(lead: SourceLead) {
  if (!lead.email && !lead.phone) return true;
  if (isInstitutionalCompany(lead.companyName)) return true;
  if (lead.score < 60) return true;
  return false;
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
  ].some((term) => company.includes(term));
}

function isNonBuyerTitle(title: string) {
  const role = title.toLowerCase();
  return ["intern", "assistant", "student", "recruiter", "future executives"].some((term) => role.includes(term));
}

function tokenizeSearch(value: string | undefined) {
  return clean(value)
    .split(/[\s,]+/)
    .map((term) => term.toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter((term) => term.length > 2 && !["and", "the", "for", "with", "businesses", "owners"].includes(term));
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
    },
  ].slice(0, clampSize(input.size));
}
