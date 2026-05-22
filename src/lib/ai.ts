import { customerSignature, outreachBrandName, outreachSenderName, sanitizeCustomerMessage } from "@/lib/message-sanitizer";

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
      text: sanitizeGeneratedText(args, buildFallback(args)),
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
      max_output_tokens: args.kind === "proposal" ? 1200 : 650,
    }),
  });

  if (!response.ok) {
    return {
      provider: "fallback",
      model: "local-template",
      text: sanitizeGeneratedText(args, buildFallback(args)),
      warning: `OpenAI request failed with status ${response.status}.`,
    };
  }

  const payload = await response.json();
  return {
    provider: "openai",
    model,
    text: sanitizeGeneratedText(args,
      payload.output_text ||
      payload.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || [])
        .map((item: { text?: string }) => item.text)
        .filter(Boolean)
        .join("\n") ||
      buildFallback(args)),
  };
}

function buildPrompt({ kind, lead, input }: GenerateArgs) {
  if (kind === "proposal") {
    return [
      "You are writing a project-based proposal draft for an AI automation consulting sale.",
      "Make it specific to the lead, their niche, source, stage, estimated value, and any conversation context.",
      "Use these sections exactly: Situation, Project Objective, Recommended Build, Pilot Scope, Option A, Option B, Optional Upside Share, Decision Criteria, Next Step.",
      "Do not write a generic menu. Tie every line to the buyer's likely lead-flow pain and the selected project.",
      "Keep pricing clear. Prefer a 7-day pilot, setup fee, monthly response desk, and optional attribution-based upside share.",
      "No markdown tables. No fake claims. No guarantees.",
      `Lead: ${JSON.stringify(lead || {})}`,
      `Context: ${input || ""}`,
      "Return only the proposal draft.",
    ].join("\n");
  }

  return [
    "You are Ghost Lead Command, an AI consultant sales operator.",
    "Write concise, practical sales copy that helps close AI automation retainers.",
    "Use proven sales principles without copying any author or book: clear offer math, painful problem awareness, curiosity-led questions, consequence framing, objection-aware phrasing, low-friction next steps, and plain human language.",
    "Every outbound message should diagnose before pitching, avoid hype, avoid fake familiarity, avoid guarantees, avoid pressure, and make one specific ask.",
    "Favor short consultative questions over claims. Make the buyer feel understood, not cornered.",
    "Keep compliance in mind: no deceptive claims, no pressure language, and no misleading urgency.",
    `Customer-facing email signatures must be exactly:\n${customerSignature()}`,
    `Never include placeholders like [Your Name], internal tool names, OpenAI, AI operator, queue metadata, or ${outreachBrandName()} command-center status lines in customer-facing copy.`,
    `If you mention the sender, use ${outreachSenderName()} from ${outreachBrandName()}.`,
    `Task: ${kind}`,
    `Lead: ${JSON.stringify(lead || {})}`,
    `Context: ${input || ""}`,
    "Return only the usable output. No markdown preamble.",
  ].join("\n");
}

function sanitizeGeneratedText(args: GenerateArgs, text: string) {
  if (args.kind !== "outreach") return text;
  return sanitizeCustomerMessage(text, { channel: "email" });
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
      `${company} Project Proposal`,
      "",
      `Situation: ${company} appears to have a ${niche.toLowerCase()} lead-flow problem worth tightening before more demand is purchased. Current stage is ${lead?.stage || "active"} with an estimated opportunity value of $${Number(lead?.value || 7500).toLocaleString()}.`,
      "",
      "Recommended Build: AI Lead Recovery Sprint",
      `- Map where ${company} loses replies, calls, form fills, and follow-up ownership.`,
      "- Launch an approved first-touch follow-up workflow for qualified contacts.",
      "- Classify replies into hot, nurture, objection, booked, or do-not-contact.",
      "- Route booked opportunities into calendar prep, proposal prep, and CRM sync.",
      "",
      "Option A: 7-Day Recovery Pilot",
      "- Setup: $2,500",
      "- Outcome: prove whether the workflow can create qualified replies and booked calls from one narrow segment.",
      "- Includes: import/scoring, approval queue, reply classifier, booked-call board, and daily operator summary.",
      "",
      "Option B: Recovery Pilot + AI Response Desk",
      "- Setup: $2,500",
      "- Monthly: $1,000/mo",
      "- Outcome: keep improving outreach, reply handling, call prep, proposal follow-up, and reporting after the pilot.",
      "",
      "Optional Upside Share",
      "- 12% of recovered revenue attributed to the campaign, only where attribution is visible.",
      "",
      "Next Step: approve one narrow segment, run the pilot for 7 days, and review booked calls plus pipeline value before expanding.",
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
