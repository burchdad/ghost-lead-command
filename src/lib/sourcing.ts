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

export function getSourcingStatus() {
  return {
    pdlConfigured: Boolean(clean(process.env.PDL_API_KEY)),
    ghostLeadAgentConfigured: Boolean(clean(process.env.GHOST_LEAD_AGENT_SEARCH_URL)),
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
    return {
      provider: "pdl" as const,
      dryRun: true,
      total: mockLeads(input).length,
      scrollToken: null,
      leads: mockLeads(input),
      message: "PDL_API_KEY is not configured. Showing mock fresh leads so the workflow can be tested.",
    };
  }

  const response = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      query: buildPdlQuery(input),
      size: clampSize(input.size),
      scroll_token: input.scrollToken || undefined,
      dataset: "email,phone,mobile_phone,resume",
      titlecase: true,
    }),
  });

  if (!response.ok) {
    return {
      provider: "pdl" as const,
      dryRun: false,
      total: 0,
      scrollToken: null,
      leads: [],
      message: `People Data Labs returned ${response.status}.`,
    };
  }

  const payload = (await response.json()) as {
    data?: RawPdlPerson[];
    total?: number;
    scroll_token?: string;
  };

  return {
    provider: "pdl" as const,
    dryRun: false,
    total: payload.total || 0,
    scrollToken: payload.scroll_token || null,
    leads: (payload.data || []).map((person) => normalizePdlPerson(person)),
  };
}

async function searchGhostLeadAgent(input: SourceSearchInput) {
  const url = clean(process.env.GHOST_LEAD_AGENT_SEARCH_URL);
  if (!url) {
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

function buildPdlQuery(input: SourceSearchInput) {
  const terms = [input.query, input.location, ...(input.titles || []), ...(input.industries || [])]
    .map((term) => clean(term))
    .filter(Boolean);

  const must = terms.map((term) => ({
    query_string: {
      query: escapeQueryString(term),
      fields: [
        "job_title",
        "job_title_role",
        "job_company_name",
        "job_company_industry",
        "location_name",
        "job_company_location_name",
      ],
    },
  }));

  return {
    query: must.length ? { bool: { must } } : { match_all: {} },
  };
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
    score: scoreLead({ title, email, phone, niche }),
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
    score: Number(lead.score || scoreLead({ title, email, phone, niche })),
    confidence: String(lead.confidence || (email || phone ? "contactable" : "needs enrichment")),
  };
}

function scoreLead({
  title,
  email,
  phone,
  niche,
}: {
  title: string;
  email: string;
  phone: string;
  niche: string;
}) {
  let score = 45;
  const text = `${title} ${niche}`.toLowerCase();
  if (email) score += 15;
  if (phone) score += 15;
  if (text.includes("owner") || text.includes("founder") || text.includes("ceo")) score += 15;
  if (text.includes("operations") || text.includes("marketing") || text.includes("growth")) score += 8;
  if (text.includes("dental") || text.includes("hvac") || text.includes("roofing") || text.includes("med spa")) {
    score += 7;
  }
  return Math.min(100, score);
}

function escapeQueryString(value: string) {
  return value.replace(/[+\-=&|><!(){}[\]^"~*?:\\/]/g, "\\$&");
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
