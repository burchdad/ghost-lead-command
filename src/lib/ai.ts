type GenerateArgs = {
  kind: "outreach" | "call-prep" | "proposal" | "classifier";
  lead?: {
    name?: string;
    companyName?: string;
    niche?: string;
    stage?: string;
    score?: number;
    value?: number;
    source?: string;
    nextAction?: string;
  };
  input?: string;
};

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export async function generateSalesText(args: GenerateArgs) {
  const apiKey = process.env.OPENAI_API_KEY;
  const prompt = buildPrompt(args);

  if (!apiKey) {
    return {
      provider: "fallback",
      model: "local-template",
      text: buildFallback(args),
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 650,
    }),
  });

  if (!response.ok) {
    return {
      provider: "fallback",
      model: "local-template",
      text: buildFallback(args),
      warning: `OpenAI request failed with status ${response.status}.`,
    };
  }

  const payload = await response.json();
  return {
    provider: "openai",
    model,
    text:
      payload.output_text ||
      payload.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || [])
        .map((item: { text?: string }) => item.text)
        .filter(Boolean)
        .join("\n") ||
      buildFallback(args),
  };
}

function buildPrompt({ kind, lead, input }: GenerateArgs) {
  return [
    "You are Ghost Lead Command, an AI consultant sales operator.",
    "Write concise, practical sales copy that helps close AI automation retainers.",
    `Task: ${kind}`,
    `Lead: ${JSON.stringify(lead || {})}`,
    `Context: ${input || ""}`,
    "Return only the usable output. No markdown preamble.",
  ].join("\n");
}

function buildFallback({ kind, lead, input }: GenerateArgs) {
  const firstName = lead?.name?.split(" ")[0] || "there";
  const company = lead?.companyName || "your business";
  const niche = lead?.niche || "local business";
  const freshSourced =
    lead?.source?.toLowerCase().includes("people data labs") ||
    lead?.nextAction?.toLowerCase().includes("first-touch");

  if (kind === "call-prep") {
    if (freshSourced) {
      return [
        `Agenda: confirm how ${company} handles missed calls, estimate requests, form fills, and follow-up ownership today.`,
        `Likely pain: ${niche.toLowerCase()} leads leak when speed-to-lead is slow, calls are missed, or follow-up stops after one touch.`,
        "Demo path: show fresh lead intake, source-aware outreach, approval queue, reply classification, and the booked-call board.",
        "Proof angle: frame the system as a lightweight follow-up layer, not a CRM replacement.",
        "Pricing angle: offer a small install plus monthly optimization once they see where lead waste is happening.",
        "Close question: if this recovered even one extra booked job a month, would it be worth piloting for 7 days?",
      ].join("\n");
    }

    return [
      `Agenda: confirm how many old ${niche.toLowerCase()} contacts are sitting untouched and what offers they previously responded to.`,
      `Likely pain: old ${niche.toLowerCase()} inquiries are not being followed up fast enough.`,
      "Demo path: show dead-lead import, revival sequence, reply classification, and booked-call tracking.",
      "Proof angle: position the install as recovered revenue from contacts they already paid to acquire.",
      "Pricing angle: setup fee, monthly optimization, and optional recovered-revenue share.",
      "Close question: should we run a 7-day pilot against one old segment and measure booked calls?",
    ].join("\n");
  }

  if (kind === "proposal") {
    return [
      "Option 1: Revival Install - $2,500 setup. Import old leads, launch follow-up, classify replies, and book calls.",
      "Option 2: Revival + AI Ops - $2,500 setup + $1,000/mo. Includes ongoing sequence optimization, call prep, proposal support, and reporting.",
      "Optional: 12% of recovered revenue attributed to the campaign.",
    ].join("\n");
  }

  if (kind === "classifier") {
    const text = input?.toLowerCase() || "";
    if (text.includes("book") || text.includes("call") || text.includes("interested")) return "hot";
    if (text.includes("price") || text.includes("cost")) return "objection";
    if (text.includes("later") || text.includes("not now")) return "nurture";
    return "needs review";
  }

  if (freshSourced) {
    return [
      `Subject: quick ${niche.toLowerCase()} follow-up idea`,
      "",
      `${firstName}, quick idea for ${company}.`,
      "",
      `I help ${niche.toLowerCase()} companies catch and follow up with missed estimate requests, old form fills, and unworked calls using a lightweight AI follow-up system.`,
      "",
      "Worth a quick look if I showed you the workflow against your current lead flow?",
    ].join("\n");
  }

  return `Hey ${firstName}, quick question: does ${company} have old leads sitting in the CRM that never converted? I built an AI revival system that follows up, qualifies replies, and books interested prospects. Want me to show you what it would look like with your list?`;
}
