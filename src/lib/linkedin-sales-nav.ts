import { parseCsv } from "@/lib/csv";
import type { IntakeLead } from "@/lib/source-intake";

export type SalesNavParseOptions = {
  defaultNiche?: string;
  defaultLocation?: string;
  enrich?: boolean;
  limit?: number;
};

type PdlEnrichedPerson = {
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
  job_company_linkedin_url?: string;
};

type PdlEmail = {
  address?: string;
  type?: string;
};

type SerpOrganicResult = {
  link?: string;
  title?: string;
  snippet?: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function pdlEmails(value: PdlEnrichedPerson["emails"] | unknown): PdlEmail[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, PdlEmail>);
  return [];
}

function pdlPhoneNumbers(value: PdlEnrichedPerson["phone_numbers"] | unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function first(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = clean(record[key]);
    if (value) return value;
  }
  return "";
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

function sqlValue(value: string) {
  return value.replace(/'/g, "''");
}

function like(field: string, value: string) {
  return `${field} LIKE '%${sqlValue(value)}%'`;
}

function normalizeWebsite(value: string) {
  const site = clean(value);
  if (!site) return "";
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function normalizeDomain(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function inferSignals(lead: IntakeLead) {
  const signals = new Set<string>();
  const text = `${lead.title || ""} ${lead.niche || ""} ${lead.companyName || ""}`.toLowerCase();

  signals.add("Sales Navigator saved-search match");
  if (lead.profileUrl || lead.sourceUrl) signals.add("LinkedIn profile available for context");
  if (/founder|owner|ceo|president|principal/.test(text)) signals.add("economic buyer identified");
  if (/growth|revenue|sales|marketing|operations|demand/.test(text)) signals.add("go-to-market owner identified");
  if (lead.email) signals.add("direct business email enriched");
  if (lead.phone) signals.add("phone path enriched");
  if (lead.website || lead.domain) signals.add("company website enriched");

  return Array.from(signals).slice(0, 8);
}

function scoreSalesNavLead(lead: IntakeLead) {
  const signals = Array.isArray(lead.intentSignals) ? lead.intentSignals : [];
  const title = clean(lead.title || lead.role).toLowerCase();
  let score = 54;

  if (lead.email) score += 14;
  if (lead.phone) score += 8;
  if (lead.website || lead.domain) score += 4;
  if (/founder|owner|ceo|president|principal/.test(title)) score += 18;
  if (/vp|head of|growth|revenue|sales|marketing|operations|demand/.test(title)) score += 12;
  if (lead.profileUrl || lead.sourceUrl) score += 5;
  score += Math.min(14, signals.length * 3);

  const cap = lead.email || lead.phone ? 100 : 82;
  return Math.max(0, Math.min(cap, score));
}

function normalizeRecord(record: Record<string, string>, options: SalesNavParseOptions): IntakeLead {
  const name =
    first(record, ["name", "full_name", "lead_name", "contact", "person", "profile_name"]) ||
    [first(record, ["first_name"]), first(record, ["last_name"])].filter(Boolean).join(" ");
  const companyName = first(record, ["company", "company_name", "current_company", "account", "organization"]);
  const title = first(record, ["title", "job_title", "current_title", "position", "role", "headline"]);
  const profileUrl = first(record, ["linkedin", "linkedin_url", "profile_url", "lead_url", "sales_nav_url", "url"]);
  const niche = first(record, ["industry", "niche", "company_industry"]) || options.defaultNiche || "B2B Services";
  const location = first(record, ["location", "geo", "region", "city"]) || options.defaultLocation || "";

  const lead: IntakeLead = {
    id: first(record, ["id", "lead_id", "profile_id"]) || `sales-nav:${name}:${companyName}`,
    name,
    companyName,
    title,
    email: first(record, ["email", "work_email", "business_email"]),
    phone: first(record, ["phone", "mobile", "mobile_phone", "phone_number"]),
    niche,
    location,
    website: first(record, ["website", "company_website", "domain"]),
    domain: first(record, ["domain"]),
    source: "LinkedIn Sales Navigator",
    sourceUrl: profileUrl,
    profileUrl,
    buyingSignals: first(record, ["signal", "signals", "notes", "lead_notes", "trigger"]),
    socialSignals: "Sales Navigator list or saved search",
  };

  const signals = inferSignals(lead);
  return {
    ...lead,
    intentSignals: signals,
    signalSummary: signals.slice(0, 4).join("; "),
    score: scoreSalesNavLead({ ...lead, intentSignals: signals }),
    value: scoreSalesNavLead({ ...lead, intentSignals: signals }) >= 88 ? 7500 : 5000,
  };
}

function contactFromPdlPerson(person: PdlEnrichedPerson) {
  const emails = pdlEmails(person.emails);
  const phoneNumbers = pdlPhoneNumbers(person.phone_numbers);
  return {
    email:
      clean(person.work_email) ||
      clean(emails.find((item) => item.type === "professional")?.address) ||
      clean(emails[0]?.address),
    phone: clean(person.mobile_phone) || clean(phoneNumbers[0]),
  };
}

function isLikelyOfficialWebsite(url: string) {
  const domain = normalizeDomain(url);
  if (!domain || !domain.includes(".")) return false;
  return ![
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "crunchbase.com",
    "zoominfo.com",
    "apollo.io",
    "pitchbook.com",
    "glassdoor.com",
    "indeed.com",
    "wikipedia.org",
    "bloomberg.com",
    "dnb.com",
  ].some((blocked) => domain.includes(blocked));
}

function mergePdlPerson(lead: IntakeLead, person: PdlEnrichedPerson, sourceSignal: string) {
  const contact = contactFromPdlPerson(person);
  const enriched: IntakeLead = {
    ...lead,
    id: person.id || lead.id,
    name: clean(person.full_name) || lead.name,
    title: clean(person.job_title) || lead.title,
    companyName: clean(person.job_company_name) || lead.companyName,
    niche: clean(person.job_company_industry) || lead.niche,
    location: clean(person.location_name) || lead.location,
    email: contact.email || lead.email,
    phone: contact.phone || lead.phone,
    website: clean(person.job_company_website) || lead.website,
    profileUrl: clean(person.linkedin_url) || lead.profileUrl,
    sourceUrl: clean(person.linkedin_url) || lead.sourceUrl,
    socialSignals: ["Sales Navigator lead", sourceSignal],
  };
  const signals = inferSignals(enriched);
  return {
    ...enriched,
    intentSignals: signals,
    signalSummary: signals.slice(0, 4).join("; "),
    score: scoreSalesNavLead({ ...enriched, intentSignals: signals }),
    value: scoreSalesNavLead({ ...enriched, intentSignals: signals }) >= 88 ? 7500 : 5000,
  };
}

async function searchPdlPersonFallback(apiKey: string, lead: IntakeLead) {
  const companyName = clean(lead.companyName || lead.company);
  const name = clean(lead.name || lead.contactName);
  const { firstName, lastName } = splitName(name);
  if (!companyName || !firstName || !lastName || name.includes("...")) return null;

  const where = [
    "(work_email IS NOT NULL OR mobile_phone IS NOT NULL)",
    like("job_company_name", companyName),
    `(${like("full_name", name)} OR (${like("first_name", firstName)} AND ${like("last_name", lastName)}))`,
  ];

  const title = clean(lead.title || lead.role);
  if (title && !/chief|founder|owner|president|ceo|co-founder/i.test(title)) {
    where.push(like("job_title", title.split(/[|/,-]/)[0].trim()));
  }

  const response = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      sql: `SELECT * FROM person WHERE ${where.join(" AND ")}`,
      size: 1,
      dataset: "email,phone,mobile_phone,resume",
      titlecase: true,
    }),
  }).catch(() => null);

  if (!response || !response.ok) return null;
  const payload = (await response.json().catch(() => ({}))) as { data?: PdlEnrichedPerson[] };
  return payload.data?.[0] || null;
}

async function discoverCompanyWebsite(lead: IntakeLead) {
  const existing = normalizeWebsite(clean(lead.website || lead.domain));
  if (existing) return existing;

  const apiKey = clean(process.env.SERPAPI_API_KEY);
  const companyName = clean(lead.companyName || lead.company);
  if (!apiKey || !companyName) return "";

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", `${companyName} official website ${clean(lead.location)}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("num", "5");

  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return "";
  const payload = (await response.json().catch(() => ({}))) as { organic_results?: SerpOrganicResult[] };
  const result = (payload.organic_results || []).find((item) => item.link && isLikelyOfficialWebsite(item.link));
  return normalizeWebsite(result?.link || "");
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
      `${origin}/team`,
    ];
  } catch {
    return [];
  }
}

function extractEmail(html: string) {
  const emails = [
    ...html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi),
    ...html.matchAll(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi),
  ]
    .map((match) => clean(match[1] || match[0]).toLowerCase())
    .filter((email) => !/(example|domain|sentry|wixpress|schema|placeholder|privacy@|abuse@)/i.test(email));

  return emails.find((email) => /^(hello|info|contact|sales|founder|admin|team|support)@/i.test(email)) || emails[0] || "";
}

function extractPhone(html: string) {
  const tel = html.match(/tel:([+\d().\-\s]{7,})/i)?.[1];
  const plain = html.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0];
  return clean(tel || plain);
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

async function companyContactFallback(lead: IntakeLead) {
  const website = await discoverCompanyWebsite(lead);
  if (!website) return lead;

  const contact = await extractWebsiteContact(website);
  const enriched: IntakeLead = {
    ...lead,
    website,
    domain: normalizeDomain(website),
    email: clean(lead.email) || contact.email,
    phone: clean(lead.phone) || contact.phone,
    confidence: contact.email || contact.phone ? "company contact path" : lead.confidence,
    socialSignals: ["Sales Navigator lead", "company website contact fallback"],
  };
  const signals = inferSignals(enriched);
  return {
    ...enriched,
    intentSignals: signals,
    signalSummary: signals.slice(0, 4).join("; "),
    score: scoreSalesNavLead({ ...enriched, intentSignals: signals }),
    value: scoreSalesNavLead({ ...enriched, intentSignals: signals }) >= 88 ? 7500 : 5000,
  };
}

function parseLooseLines(raw: string, options: SalesNavParseOptions) {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/\t| {2,}|\s\|\s/).map((part) => part.trim()).filter(Boolean);
      const url = line.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i)?.[0] || "";
      const name = parts[0] || line.replace(url, "").trim();
      const title = parts[1] || "";
      const companyName = parts[2] || "";
      const lead: IntakeLead = {
        id: `sales-nav-paste:${index}:${name}:${companyName}`,
        name,
        title,
        companyName,
        niche: options.defaultNiche || "B2B Services",
        location: options.defaultLocation || "",
        profileUrl: url,
        sourceUrl: url,
        source: "LinkedIn Sales Navigator",
        socialSignals: "Sales Navigator manual paste",
      };
      const signals = inferSignals(lead);
      return {
        ...lead,
        intentSignals: signals,
        signalSummary: signals.slice(0, 4).join("; "),
        score: scoreSalesNavLead({ ...lead, intentSignals: signals }),
        value: 5000,
      };
    });
}

export function parseSalesNavigatorLeads(raw: string, options: SalesNavParseOptions = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
  const parsed = parseCsv(raw);
  const records = parsed.headers.length >= 2 ? parsed.records : [];
  const leads = records.length
    ? records.map((record) => normalizeRecord(record, options))
    : parseLooseLines(raw, options);

  return leads
    .filter((lead) => clean(lead.name) && clean(lead.companyName))
    .slice(0, limit);
}

export async function enrichSalesNavigatorLead(lead: IntakeLead): Promise<IntakeLead> {
  const apiKey = clean(process.env.PDL_API_KEY);
  if (!apiKey || lead.email || lead.phone) return lead;

  const profile = clean(lead.profileUrl || lead.sourceUrl);
  const { firstName, lastName } = splitName(clean(lead.name || lead.contactName));
  const response = await fetch("https://api.peopledatalabs.com/v5/person/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      name: lead.name,
      first_name: firstName || undefined,
      last_name: lastName || undefined,
      company: lead.companyName,
      profile: profile || undefined,
      location: lead.location || undefined,
      titlecase: true,
    }),
  }).catch(() => null);

  if (response?.ok) {
    const person = (await response.json().catch(() => ({}))) as PdlEnrichedPerson;
    const direct = mergePdlPerson(lead, person, "PDL person enrichment match");
    if (direct.email || direct.phone) return direct;
  }

  const fallback = await searchPdlPersonFallback(apiKey, lead);
  const pdl = fallback ? mergePdlPerson(lead, fallback, "PDL person search fallback match") : lead;
  return pdl.email || pdl.phone ? pdl : companyContactFallback(pdl);
}
