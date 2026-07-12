export type PerplexitySearchResult = {
  title: string;
  url: string;
  snippet: string;
  date?: string | null;
  last_updated?: string | null;
};

export type PerplexityAccountBrief = {
  configured: boolean;
  brief: string;
  message: string;
  model?: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

export function getPerplexityStatus() {
  return {
    configured: Boolean(clean(process.env.PERPLEXITY_API_KEY)),
    searchApi: "https://api.perplexity.ai/search",
    responsesApi: "https://api.perplexity.ai/v1/responses",
    recommendedUse: "web intent, public company signal discovery, and account briefs",
  };
}

export async function perplexitySearch(input: {
  query: string;
  limit?: number;
  domains?: string[];
}) {
  const apiKey = clean(process.env.PERPLEXITY_API_KEY);
  if (!apiKey) {
    return {
      configured: false,
      results: [] as PerplexitySearchResult[],
      message: "PERPLEXITY_API_KEY is not configured.",
    };
  }

  const response = await fetch("https://api.perplexity.ai/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      max_results: Math.min(10, Math.max(1, Number(input.limit || 5))),
      search_context_size: "high",
      country: "US",
      ...(input.domains?.length ? { search_domain_filter: input.domains } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      configured: true,
      results: [] as PerplexitySearchResult[],
      message: `Perplexity Search returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    results?: PerplexitySearchResult[];
  };

  return {
    configured: true,
    results: (payload.results || []).slice(0, Math.min(10, Math.max(1, Number(input.limit || 5)))),
    message: "Perplexity Search completed.",
  };
}

export async function perplexityAgentResponse(input: {
  prompt: string;
  preset?: string;
}) {
  const apiKey = clean(process.env.PERPLEXITY_API_KEY);
  if (!apiKey) {
    return {
      configured: false,
      brief: "",
      message: "PERPLEXITY_API_KEY is not configured.",
    } satisfies PerplexityAccountBrief;
  }

  const response = await fetch("https://api.perplexity.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      preset: input.preset || "fast-search",
      input: input.prompt,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      configured: true,
      brief: "",
      message: `Perplexity Responses returned ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}.`,
    } satisfies PerplexityAccountBrief;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    output_text?: string;
    text?: string;
    model?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };
  const brief =
    clean(payload.output_text) ||
    clean(payload.text) ||
    clean(payload.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("\n"));

  return {
    configured: true,
    brief,
    message: brief ? "Perplexity Responses completed." : "Perplexity Responses returned no text.",
    model: payload.model,
  } satisfies PerplexityAccountBrief;
}

export async function buildCompanyAccountBrief(input: {
  companyName: string;
  contactName?: string | null;
  niche?: string | null;
  website?: string | null;
  location?: string | null;
  signalSummary?: string | null;
}): Promise<PerplexityAccountBrief> {
  const company = clean(input.companyName);
  if (!company) {
    return {
      configured: Boolean(clean(process.env.PERPLEXITY_API_KEY)),
      brief: "",
      message: "Company name is required for a Perplexity account brief.",
    } satisfies PerplexityAccountBrief;
  }

  return perplexityAgentResponse({
    preset: "fast-search",
    prompt: [
      `Research ${company}${input.website ? ` (${input.website})` : ""}.`,
      input.contactName ? `Relevant contact: ${input.contactName}.` : "",
      input.niche ? `Market/niche: ${input.niche}.` : "",
      input.location ? `Location: ${input.location}.` : "",
      input.signalSummary ? `Known Lead Command signal: ${input.signalSummary}.` : "",
      "Return a concise B2B outbound account brief with: 1) likely business context, 2) relevant public trigger or signal, 3) best Ghost AI Solutions offer angle, 4) one low-pressure opening question. Do not invent private facts.",
    ].filter(Boolean).join("\n"),
  });
}

export async function findPublicCompanySignals(input: {
  companyName: string;
  niche?: string | null;
  website?: string | null;
  location?: string | null;
}) {
  const company = clean(input.companyName);
  if (!company) return { configured: false, signals: [] as string[], sources: [] as PerplexitySearchResult[] };

  const query = [
    `"${company}"`,
    clean(input.niche),
    clean(input.location),
    "hiring growth reviews expansion funding leadership LinkedIn website contact",
  ]
    .filter(Boolean)
    .join(" ");

  const search = await perplexitySearch({ query, limit: 5 });
  const signals = search.results
    .map((result) => inferSignalFromResult(result, company))
    .filter(Boolean)
    .slice(0, 5) as string[];

  return {
    configured: search.configured,
    signals: Array.from(new Set(signals)),
    sources: search.results,
    message: search.message,
  };
}

function inferSignalFromResult(result: PerplexitySearchResult, companyName: string) {
  const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();
  const company = companyName.toLowerCase();
  if (!text.includes(company.split(/\s+/)[0])) return "";
  if (/linkedin|post|comment|profile|social/.test(text)) return "public social/company profile signal";
  if (/hiring|careers|jobs|headcount|recruit/.test(text)) return "hiring or headcount-change signal";
  if (/funding|raised|investment|acquisition|launch|expansion/.test(text)) return "company change or expansion signal";
  if (/review|rating|google|yelp|bbb/.test(text)) return "review/reputation signal";
  if (/contact|quote|estimate|appointment|booking|schedule/.test(text)) return "contact or booking path signal";
  return "public web mention available for context";
}
