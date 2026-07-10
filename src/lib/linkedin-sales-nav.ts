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

function clean(value: unknown) {
  return String(value || "").trim();
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

  if (!response || !response.ok) return lead;
  const person = (await response.json().catch(() => ({}))) as PdlEnrichedPerson;
  const email =
    clean(person.work_email) ||
    clean(person.emails?.find((item) => item.type === "professional")?.address) ||
    clean(person.emails?.[0]?.address);
  const phone = clean(person.mobile_phone) || clean(person.phone_numbers?.[0]);

  const enriched: IntakeLead = {
    ...lead,
    id: person.id || lead.id,
    name: clean(person.full_name) || lead.name,
    title: clean(person.job_title) || lead.title,
    companyName: clean(person.job_company_name) || lead.companyName,
    niche: clean(person.job_company_industry) || lead.niche,
    location: clean(person.location_name) || lead.location,
    email,
    phone,
    website: clean(person.job_company_website) || lead.website,
    profileUrl: clean(person.linkedin_url) || lead.profileUrl,
    sourceUrl: clean(person.linkedin_url) || lead.sourceUrl,
    socialSignals: ["Sales Navigator lead", "PDL person enrichment match"],
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
