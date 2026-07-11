import type { IntakeLead } from "@/lib/source-intake";

type VisionLead = {
  name?: string;
  title?: string;
  companyName?: string;
  company?: string;
  niche?: string;
  industry?: string;
  location?: string;
  profileUrl?: string;
  notes?: string;
  signals?: string[];
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function extractJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) return trimmed.slice(firstArray, lastArray + 1);
  return trimmed;
}

export function visionLeadsToCsv(leads: IntakeLead[]) {
  const headers = ["Name", "Title", "Company", "Industry", "Location", "LinkedIn URL", "Notes"];
  const rows = leads.map((lead) =>
    [
      lead.name,
      lead.title,
      lead.companyName,
      lead.niche,
      lead.location,
      lead.profileUrl || lead.sourceUrl,
      lead.signalSummary || (Array.isArray(lead.intentSignals) ? lead.intentSignals.join("; ") : ""),
    ].map(csvCell).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

function csvCell(value: unknown) {
  const text = clean(value).replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

function scoreScreenshotLead(lead: IntakeLead) {
  const text = `${lead.title || ""} ${lead.companyName || ""} ${lead.signalSummary || ""}`.toLowerCase();
  const signals = Array.isArray(lead.intentSignals) ? lead.intentSignals : [];
  let score = 58;

  if (/founder|owner|ceo|president|principal/.test(text)) score += 16;
  if (/vp|head of|growth|revenue|sales|marketing|operations|demand/.test(text)) score += 12;
  if (/hiring|posted|changed|funding|growth|intent|competitor|engaged|saved|viewed/.test(text)) score += 8;
  if (lead.profileUrl || lead.sourceUrl) score += 4;
  score += Math.min(12, signals.length * 3);

  return Math.max(0, Math.min(82, score));
}

export async function extractSalesNavScreenshotLeads(images: string[]) {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return {
      provider: "missing-openai",
      model: "none",
      leads: [] as IntakeLead[],
      error: "OPENAI_API_KEY is required for Sales Navigator screenshot extraction.",
    };
  }

  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const content = [
    {
      type: "input_text",
      text: [
        "Extract visible LinkedIn Sales Navigator lead cards from these screenshots.",
        "Return only JSON array. No prose. No markdown.",
        "Each item must use: name, title, companyName, niche, location, profileUrl, notes, signals.",
        "Only include clearly visible people. If a field is not visible, use an empty string.",
        "Use notes/signals for visible context like posted about hiring, changed jobs, mutual connection, saved lead, viewed profile, or account activity.",
      ].join("\n"),
    },
    ...images.slice(0, 9).map((image) => ({
      type: "input_image",
      image_url: image,
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      max_output_tokens: 1800,
    }),
  });

  if (!response.ok) {
    return {
      provider: "openai",
      model,
      leads: [] as IntakeLead[],
      error: `OpenAI vision extraction returned ${response.status}.`,
    };
  }

  const payload = await response.json();
  const outputText =
    payload.output_text ||
    payload.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || [])
      .map((item: { text?: string }) => item.text)
      .filter(Boolean)
      .join("\n") ||
    "[]";

  let parsed: VisionLead[] = [];
  try {
    parsed = JSON.parse(extractJson(outputText)) as VisionLead[];
  } catch {
    parsed = [];
  }

  const leads = parsed
    .map((lead, index) => {
      const name = clean(lead.name);
      const companyName = clean(lead.companyName || lead.company);
      const title = clean(lead.title);
      const niche = clean(lead.niche || lead.industry) || "B2B Services";
      const signals = [
        "Sales Navigator screenshot extraction",
        ...(Array.isArray(lead.signals) ? lead.signals.map(clean) : []),
        clean(lead.notes),
      ].filter(Boolean);

      const candidate = {
        id: `sales-nav-screenshot:${index}:${name}:${companyName}`,
        name,
        companyName,
        title,
        niche,
        location: clean(lead.location),
        profileUrl: clean(lead.profileUrl),
        sourceUrl: clean(lead.profileUrl),
        source: "LinkedIn Sales Navigator screenshot",
        buyingSignals: signals,
        socialSignals: "Sales Navigator screenshot",
        intentSignals: signals,
        signalSummary: signals.slice(0, 4).join("; "),
      } satisfies IntakeLead;

      return {
        ...candidate,
        score: scoreScreenshotLead(candidate),
        value: scoreScreenshotLead(candidate) >= 78 ? 5000 : 3500,
      } satisfies IntakeLead;
    })
    .filter((lead) => lead.name && lead.companyName);

  return { provider: "openai", model, leads };
}
