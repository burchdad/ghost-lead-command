import type { NextBestChannel, Prisma } from "@prisma/client";
import { emailQualityTier, isDecisionMakerTitle, isValidBusinessEmail } from "@/lib/conversion-quality";
import { scoreIntentSignals, type IntentSignalLike } from "@/lib/intent-engine";
import { selectNextBestChannel } from "@/lib/next-best-channel";
import { getPrisma } from "@/lib/prisma";
import { scoreSourceQuality, type SourceQualityMetrics } from "@/lib/source-quality-v2";
import type { SourceLead } from "@/lib/sourcing";

export const VEGA_INTELLIGENCE_VERSION = "vega-intelligence-fusion.v1";
export const VEGA_POLICY_VERSION = "vega-trust-policy.v2";

export type VegaDecisionLane = "auto-send" | "call-first" | "research" | "suppress" | "executive-review";

export type FusionPolicy = {
  minScore: number;
  autoSendTrustThreshold: number;
  executiveReviewTrustThreshold: number;
  senderMode: string;
  senderRemaining: number;
  senderBounceRate: number;
  workspaceAllowsAutoEmail?: boolean;
  campaignAllowsAutoEmail?: boolean;
};

export type OpportunityIntelligence = {
  leadScore: number;
  intentScore: number;
  trustScore: number;
  contactConfidence: number;
  sourceQuality: number;
  messageQuality: number;
  campaignFit: number;
  senderHealth: number;
  accountStrength: number;
  buyingSignalStrength: number;
  predictedConversationProbability: number;
  predictedMeetingProbability: number;
  predictedCloseProbability: number;
  predictedRevenueProbability: number;
  needMoreResearchProbability: number;
  bounceProbability: number;
  complaintProbability: number;
  recommendedChannel: NextBestChannel;
  recommendedAction: string;
  decisionLane: VegaDecisionLane;
  overallConfidence: number;
  explanation: DecisionExplanation;
};

export type DecisionExplanation = {
  decision: VegaDecisionLane;
  reason: string;
  metrics: {
    label: string;
    value: string | number;
    ok?: boolean;
  }[];
  blockers: string[];
  evidence: string[];
};

export type IntelligenceTimelineEvent = {
  at: Date;
  type: string;
  label: string;
  detail: string;
  source: string;
};

export type UnifiedMemory = {
  company: string[];
  contacts: Record<string, string[]>;
  campaign: string[];
  workspace: string[];
  operator: string[];
};

export type VegaIntelligenceGraph = {
  workspace: { id: string; name: string; slug: string };
  campaign?: { id: string; name: string; status: string } | null;
  company?: { id: string; name: string; niche: string; website?: string | null } | null;
  contacts: { id: string; name: string; email?: string | null; phone?: string | null; title?: string | null }[];
  lead?: { id: string; name: string; companyName: string; stage: string; score: number; source: string } | null;
  opportunityIntelligence: OpportunityIntelligence | null;
  snapshots: OpportunityIntelligenceSnapshotView[];
  snapshotComparison: OpportunityIntelligenceSnapshotComparison | null;
  timeline: IntelligenceTimelineEvent[];
  memory: UnifiedMemory;
};

export type OpportunityIntelligenceSnapshotView = {
  id: string;
  snapshotType: string;
  triggerType: string;
  triggerId?: string | null;
  createdAt: Date;
  intelligenceVersion: string;
  policyVersion: string;
  leadScore: number;
  intentScore: number;
  trustScore: number;
  contactConfidence: number;
  sourceQuality: number;
  messageQuality?: number | null;
  campaignFit: number;
  senderHealth: number;
  conversationProbability?: number | null;
  meetingProbability?: number | null;
  closeProbability?: number | null;
  bounceProbability?: number | null;
  recommendedChannel: string;
  recommendedAction: string;
  decisionLane: string;
  overallConfidence: number;
  explanation: Prisma.JsonValue;
  evidence: Prisma.JsonValue;
  blockers: Prisma.JsonValue;
  confidenceLabel: "Directional" | "Calibrating" | "Observed";
  evidenceBasis: string;
  calibrationStatus: string;
};

export type OpportunityIntelligenceSnapshotComparison = {
  fromSnapshotId: string;
  toSnapshotId: string;
  trustDelta: number;
  meetingProbabilityDelta: number;
  confidenceDelta: number;
  decisionChanged: boolean;
  actionChanged: boolean;
};

export type CampaignHealthInput = {
  name: string;
  leads: number;
  sent: number;
  replies: number;
  conversations: number;
  meetings: number;
  revenue: number;
  riskyEvents: number;
  sourceQuality: number;
  trust: number;
};

export type CampaignHealth = {
  name: string;
  health: number;
  momentum: "Growing" | "Stable" | "Stalled";
  velocity: number;
  risk: "Low" | "Medium" | "High";
  trust: number;
  pipeline: number;
  conversationRate: number;
  meetingRate: number;
  revenue: number;
  recommendation: string;
  requiresStephenApproval: boolean;
};

export type ExecutiveDashboard = {
  revenuePipeline: number;
  todaysConversations: number;
  meetings: number;
  estimatedRevenue: number;
  humanTasks: number;
  campaignRisks: string[];
  growthOpportunities: string[];
  bestPerformingSource: string;
  worstPerformingSource: string;
  biggestBottleneck: string;
  recommendedActions: string[];
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function probability(score: number, floor = 1, ceiling = 95) {
  return clamp(score, floor, ceiling);
}

function normalizeSenderMode(mode: string) {
  const value = clean(mode).replace(/-/g, "_").toUpperCase();
  if (value === "STOP") return "STOP";
  if (value === "CAUTION") return "CAUTION";
  if (value === "RESTRICTED") return "RESTRICTED";
  if (value === "RECOVERY") return "RESTRICTED";
  if (value === "INSUFFICIENT_DATA") return "CAUTION";
  return "HEALTHY";
}

function hasStrategicReviewRisk(input: {
  companyName?: string | null;
  niche?: string | null;
  title?: string | null;
  signalSummary?: string | null;
}) {
  const text = `${input.companyName || ""} ${input.niche || ""} ${input.title || ""} ${input.signalSummary || ""}`.toLowerCase();
  return /\b(fortune\s*500|enterprise|hospital|health system|medical center|attorney|law firm|legal|bank|financial institution|government|municipal|school|university)\b/.test(text);
}

function sourceQualityScore(metrics?: Partial<SourceQualityMetrics>) {
  if (!metrics) return 70;
  return scoreSourceQuality({
    recordsReturned: metrics.recordsReturned || 0,
    validBusinessCount: metrics.validBusinessCount || 0,
    verifiedEmailCount: metrics.verifiedEmailCount || 0,
    phoneAvailableCount: metrics.phoneAvailableCount || 0,
    decisionMakerCount: metrics.decisionMakerCount || 0,
    sentCount: metrics.sentCount || 0,
    deliveredCount: metrics.deliveredCount || 0,
    hardBounceCount: metrics.hardBounceCount || 0,
    replyCount: metrics.replyCount || 0,
    reachedContactCount: metrics.reachedContactCount || 0,
    conversationCount: metrics.conversationCount || 0,
    meetingCount: metrics.meetingCount || 0,
    providerCost: metrics.providerCost,
  }).score;
}

export function buildOpportunityIntelligence(input: {
  leadScore: number;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyName?: string | null;
  niche?: string | null;
  signalSummary?: string | null;
  buyerFit?: string | null;
  intentSignals?: IntentSignalLike[];
  sourceQualityMetrics?: Partial<SourceQualityMetrics>;
  priorInteractions?: string[];
  campaignApproved?: boolean;
  messageQuality?: number;
  policy: FusionPolicy;
}): OpportunityIntelligence {
  const intent = scoreIntentSignals(input.intentSignals || []);
  const email = clean(input.email);
  const phone = clean(input.phone);
  const validEmail = isValidBusinessEmail(email);
  const emailTier = emailQualityTier(email);
  const decisionMaker = isDecisionMakerTitle(input.title);
  const strategicReview = hasStrategicReviewRisk(input);
  const sourceQuality = sourceQualityScore(input.sourceQualityMetrics);
  const leadScore = clamp(input.leadScore);
  const intentScore = clamp(intent.totalIntentScore);
  const contactConfidence = clamp((validEmail ? 58 : 0) + (phone ? 18 : 0) + (decisionMaker ? 18 : 0) + (emailTier === "named-business" ? 6 : 0));
  const messageQuality = clamp(input.messageQuality ?? (82 + (input.signalSummary || intent.evidence.length ? 8 : -6) + (strategicReview ? -8 : 0)));
  const campaignFit = clamp((input.campaignApproved === false ? 45 : 82) + (leadScore >= input.policy.minScore ? 10 : -12) + (strategicReview ? -8 : 0));
  const senderHealth = clamp(
    normalizeSenderMode(input.policy.senderMode) === "STOP"
      ? 25
      : normalizeSenderMode(input.policy.senderMode) === "RESTRICTED"
        ? 50
        : normalizeSenderMode(input.policy.senderMode) === "CAUTION"
          ? 78
          : 96,
  );
  const accountStrength = clamp((leadScore * 0.55) + (intent.accountLevelScore * 0.25) + (sourceQuality * 0.2));
  const buyingSignalStrength = clamp(Math.max(intentScore, input.signalSummary ? 70 : 0));
  const trustScore = clamp(
    leadScore * 0.22 +
      intentScore * 0.16 +
      contactConfidence * 0.18 +
      sourceQuality * 0.12 +
      messageQuality * 0.1 +
      campaignFit * 0.1 +
      senderHealth * 0.12,
  );
  const overallConfidence = clamp((trustScore * 0.45) + (contactConfidence * 0.2) + (sourceQuality * 0.15) + (intent.confidence * 100 * 0.2));
  const bounceProbability = clamp(emailTier === "invalid" ? 92 : emailTier === "personal" ? 24 : emailTier === "generic" ? 18 : Math.max(2, 18 - sourceQuality / 8));
  const complaintProbability = clamp(strategicReview ? 16 : Math.max(1, 12 - trustScore / 12));
  const needMoreResearchProbability = clamp(100 - ((contactConfidence * 0.45) + (intentScore * 0.25) + (sourceQuality * 0.3)));
  const predictedConversationProbability = probability((intentScore * 0.38) + (leadScore * 0.24) + (messageQuality * 0.18) + (contactConfidence * 0.2));
  const predictedMeetingProbability = probability((predictedConversationProbability * 0.46) + (buyingSignalStrength * 0.24) + (accountStrength * 0.18) + (campaignFit * 0.12));
  const predictedCloseProbability = probability((predictedMeetingProbability * 0.42) + (accountStrength * 0.28) + (campaignFit * 0.2) + (sourceQuality * 0.1));
  const predictedRevenueProbability = probability((predictedCloseProbability * 0.7) + (accountStrength * 0.3));

  const channel = selectNextBestChannel({
    emailConfidence: validEmail ? contactConfidence / 100 : 0,
    phoneConfidence: phone ? 0.9 : 0,
    decisionMakerConfidence: decisionMaker ? 0.9 : 0.45,
    contactConfidence: contactConfidence / 100,
    signals: input.intentSignals || [],
    priorInteractions: input.priorInteractions,
    permittedChannels: ["cold_outbound_email", "phone_calls", "linkedin_manual_actions"],
    senderState: normalizeSenderMode(input.policy.senderMode),
    providerHealthy: normalizeSenderMode(input.policy.senderMode) !== "STOP",
    sourceQualityScore: sourceQuality,
    suppressed: /institutional|vendor risk/i.test(input.buyerFit || ""),
    workspaceAllowsAutoEmail: input.policy.workspaceAllowsAutoEmail !== false,
    campaignAllowsAutoEmail: input.policy.campaignAllowsAutoEmail !== false && input.campaignApproved !== false,
    requiresHumanApproval: strategicReview,
  });

  const blockers = [
    leadScore < input.policy.minScore ? "Lead score is below policy threshold." : "",
    !validEmail && !phone ? "No verified email or phone path." : "",
    normalizeSenderMode(input.policy.senderMode) === "STOP" ? "Sender governor is STOP." : "",
    input.policy.senderRemaining <= 0 ? "Today's safe sender capacity is exhausted." : "",
    strategicReview ? "Strategic or regulated account requires executive review." : "",
    ...intent.blockers,
  ].filter(Boolean);

  let decisionLane: VegaDecisionLane = "research";
  if (channel.selectedPrimaryChannel === "SUPPRESS") decisionLane = "suppress";
  else if (!validEmail && phone) decisionLane = "call-first";
  else if (trustScore >= input.policy.autoSendTrustThreshold && validEmail && !strategicReview && input.policy.senderRemaining > 0 && normalizeSenderMode(input.policy.senderMode) !== "STOP") decisionLane = "auto-send";
  else if (trustScore >= input.policy.executiveReviewTrustThreshold || strategicReview) decisionLane = "executive-review";
  else if (channel.selectedPrimaryChannel === "CALL_FIRST") decisionLane = "call-first";

  const recommendedChannel =
    decisionLane === "auto-send" ? "AUTO_EMAIL" :
    decisionLane === "executive-review" ? "APPROVAL_EMAIL" :
    decisionLane === "call-first" ? "CALL_FIRST" :
    decisionLane === "suppress" ? "SUPPRESS" :
    channel.selectedPrimaryChannel;
  const recommendedAction =
    decisionLane === "auto-send" ? "Send safe first-touch email now." :
    decisionLane === "executive-review" ? "Send to Vega Executive Review with explanation." :
    decisionLane === "call-first" ? "Create phone assist or manual contact task." :
    decisionLane === "suppress" ? "Suppress or avoid outreach." :
    "Research or enrich before outreach.";

  const explanation: DecisionExplanation = {
    decision: decisionLane,
    reason:
      decisionLane === "auto-send"
        ? "Evidence and sender health are strong enough for Vega to act without human babysitting."
        : decisionLane === "executive-review"
          ? "The account is high-impact, uncertain, or below autonomous trust threshold."
          : decisionLane === "call-first"
            ? "Phone/manual path is stronger than email for the next move."
            : decisionLane === "suppress"
              ? "Policy or fit risk blocks outreach."
              : "Additional enrichment is needed before action.",
    metrics: [
      { label: "Lead Score", value: leadScore, ok: leadScore >= input.policy.minScore },
      { label: "Intent", value: intentScore, ok: intentScore >= 25 },
      { label: "Verified Email", value: validEmail ? "YES" : "NO", ok: validEmail },
      { label: "Campaign Fit", value: campaignFit, ok: campaignFit >= 70 },
      { label: "Source Quality", value: sourceQuality, ok: sourceQuality >= 60 },
      { label: "Sender Health", value: normalizeSenderMode(input.policy.senderMode), ok: senderHealth >= 70 },
      { label: "Overall Trust", value: trustScore, ok: trustScore >= input.policy.autoSendTrustThreshold },
    ],
    blockers,
    evidence: [
      clean(input.signalSummary),
      ...intent.evidence,
      ...channel.reasons,
    ].filter(Boolean).slice(0, 8),
  };

  return {
    leadScore,
    intentScore,
    trustScore,
    contactConfidence,
    sourceQuality,
    messageQuality,
    campaignFit,
    senderHealth,
    accountStrength,
    buyingSignalStrength,
    predictedConversationProbability,
    predictedMeetingProbability,
    predictedCloseProbability,
    predictedRevenueProbability,
    needMoreResearchProbability,
    bounceProbability,
    complaintProbability,
    recommendedChannel,
    recommendedAction,
    decisionLane,
    overallConfidence,
    explanation,
  };
}

export function buildOpportunityIntelligenceFromSourceLead(input: {
  lead: SourceLead;
  policy: FusionPolicy;
  sourceQualityMetrics?: Partial<SourceQualityMetrics>;
  campaignApproved?: boolean;
  messageQuality?: number;
}) {
  return buildOpportunityIntelligence({
    leadScore: input.lead.score,
    email: input.lead.email,
    phone: input.lead.phone,
    title: input.lead.title,
    companyName: input.lead.companyName,
    niche: input.lead.niche,
    signalSummary: input.lead.signalSummary,
    buyerFit: input.lead.buyerFit,
    intentSignals: (input.lead.intentSignals || []).map((summary, index) => ({
      signalType: index === 0 ? "THIRD_PARTY_INTENT_SIGNAL" : "MANUAL_OPERATOR_SIGNAL",
      observedAt: new Date(),
      confidence: 0.85,
      intentStrength: 0.8,
      scoreImpact: index === 0 ? 28 : 16,
      accountLevel: true,
      personLevel: index === 0,
      verified: true,
      summary,
      sourceProvider: input.lead.source,
    })),
    sourceQualityMetrics: input.sourceQualityMetrics,
    campaignApproved: input.campaignApproved,
    messageQuality: input.messageQuality,
    policy: input.policy,
  });
}

function pushTimeline(events: IntelligenceTimelineEvent[], event: IntelligenceTimelineEvent) {
  events.push(event);
}

export function buildUnifiedCompanyTimeline(input: {
  lead?: { createdAt?: Date; source?: string; stage?: string; score?: number; companyName?: string } | null;
  intentSignals?: { observedAt: Date; summary: string; sourceProvider: string; signalType: string }[];
  interactions?: { createdAt: Date; channel: string; direction: string; classification?: string | null; body?: string | null }[];
  replies?: { createdAt: Date; classification: string; body: string; source: string }[];
  queueItems?: { createdAt: Date; updatedAt: Date; channel: string; provider: string; status: string; reason?: string | null }[];
  bookingTasks?: { createdAt: Date; updatedAt: Date; status: string; meetingTitle: string }[];
  opportunities?: { createdAt: Date; updatedAt: Date; stage: string; title: string; value: number }[];
  proposals?: { createdAt: Date; updatedAt: Date; status: string; title: string; setupFee: number; monthlyFee: number }[];
}) {
  const events: IntelligenceTimelineEvent[] = [];
  if (input.lead?.createdAt) {
    pushTimeline(events, {
      at: input.lead.createdAt,
      type: "prospect_found",
      label: "Prospect Found",
      detail: `${input.lead.companyName || "Company"} sourced from ${input.lead.source || "unknown source"} at score ${input.lead.score ?? "n/a"}.`,
      source: input.lead.source || "lead",
    });
  }
  for (const signal of input.intentSignals || []) {
    pushTimeline(events, { at: signal.observedAt, type: "intent_signal", label: "Intent Signal", detail: signal.summary, source: signal.sourceProvider || signal.signalType });
  }
  for (const item of input.queueItems || []) {
    pushTimeline(events, { at: item.createdAt, type: "execution", label: `${item.channel.toUpperCase()} ${item.status}`, detail: item.reason || `${item.provider} ${item.status}`, source: item.provider });
  }
  for (const interaction of input.interactions || []) {
    pushTimeline(events, { at: interaction.createdAt, type: "interaction", label: `${interaction.direction} ${interaction.channel}`, detail: interaction.classification || clean(interaction.body).slice(0, 120), source: interaction.channel });
  }
  for (const reply of input.replies || []) {
    pushTimeline(events, { at: reply.createdAt, type: "reply", label: `Reply ${reply.classification}`, detail: clean(reply.body).slice(0, 160), source: reply.source });
  }
  for (const task of input.bookingTasks || []) {
    pushTimeline(events, { at: task.updatedAt || task.createdAt, type: "meeting", label: `Booking ${task.status}`, detail: task.meetingTitle, source: "booking" });
  }
  for (const opportunity of input.opportunities || []) {
    pushTimeline(events, { at: opportunity.updatedAt || opportunity.createdAt, type: "opportunity", label: opportunity.stage, detail: `${opportunity.title} $${opportunity.value}`, source: "pipeline" });
  }
  for (const proposal of input.proposals || []) {
    pushTimeline(events, { at: proposal.updatedAt || proposal.createdAt, type: "proposal", label: `Proposal ${proposal.status}`, detail: `${proposal.title}: $${proposal.setupFee} setup / $${proposal.monthlyFee} monthly`, source: "proposal" });
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function appendUnique(memory: string[], value: string) {
  const item = clean(value);
  if (item && !memory.includes(item)) memory.push(item);
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function buildCampaignHealth(input: CampaignHealthInput): CampaignHealth {
  const conversationRate = pct(input.conversations || input.replies, input.sent);
  const meetingRate = pct(input.meetings, Math.max(input.conversations, input.replies, 1));
  const riskRate = pct(input.riskyEvents, Math.max(input.sent, 1));
  const velocity = clamp((input.replies * 8) + (input.conversations * 12) + (input.meetings * 18));
  const risk: CampaignHealth["risk"] = riskRate >= 8 || input.sourceQuality < 45 ? "High" : riskRate >= 3 || input.sourceQuality < 60 ? "Medium" : "Low";
  const health = clamp((input.sourceQuality * 0.24) + (input.trust * 0.26) + (conversationRate * 1.8) + (meetingRate * 1.4) + (risk === "High" ? -18 : risk === "Medium" ? -6 : 8));
  const momentum: CampaignHealth["momentum"] = input.meetings > 0 || conversationRate >= 8 ? "Growing" : input.replies > 0 || input.sent > 0 ? "Stable" : "Stalled";
  const recommendation =
    risk === "High"
      ? `Pause or reduce ${input.name} until source quality and sender risk improve.`
      : health >= 80 && input.trust >= 85
        ? `Increase ${input.name} safe send limit by 15%.`
        : momentum === "Stalled"
          ? `Research and refresh ${input.name} before adding send volume.`
          : `Keep ${input.name} steady and watch conversation-to-meeting conversion.`;

  return {
    name: input.name,
    health,
    momentum,
    velocity,
    risk,
    trust: clamp(input.trust),
    pipeline: input.leads,
    conversationRate,
    meetingRate,
    revenue: input.revenue,
    recommendation,
    requiresStephenApproval: recommendation.includes("Increase") || recommendation.includes("Pause"),
  };
}

export function buildExecutiveDashboard(input: {
  opportunities: { value: number; probability?: number | null; stage?: string | null }[];
  conversationsToday: number;
  meetings: number;
  humanTasks: number;
  campaigns: CampaignHealth[];
  sourcePerformance?: { source: string; score: number }[];
}) {
  const revenuePipeline = input.opportunities.reduce((sum, opportunity) => sum + Number(opportunity.value || 0), 0);
  const estimatedRevenue = Math.round(input.opportunities.reduce((sum, opportunity) => sum + Number(opportunity.value || 0) * (Number(opportunity.probability || 0) / 100), 0));
  const campaignRisks = input.campaigns.filter((campaign) => campaign.risk !== "Low").map((campaign) => `${campaign.name}: ${campaign.risk}`);
  const growthOpportunities = input.campaigns.filter((campaign) => campaign.health >= 75 && campaign.risk === "Low").map((campaign) => campaign.recommendation);
  const sources = [...(input.sourcePerformance || [])].sort((a, b) => b.score - a.score);
  const biggestBottleneck =
    input.humanTasks > 0 ? "Human tasks need decisions." :
    campaignRisks.length ? campaignRisks[0] :
    input.meetings === 0 && input.conversationsToday > 0 ? "Conversations are not converting to meetings." :
    input.conversationsToday === 0 ? "No conversations today." :
    "No major bottleneck detected.";
  const recommendedActions = [
    ...growthOpportunities.slice(0, 2),
    ...input.campaigns.filter((campaign) => campaign.risk === "High").slice(0, 2).map((campaign) => campaign.recommendation),
    biggestBottleneck,
  ].filter(Boolean);

  return {
    revenuePipeline,
    todaysConversations: input.conversationsToday,
    meetings: input.meetings,
    estimatedRevenue,
    humanTasks: input.humanTasks,
    campaignRisks,
    growthOpportunities,
    bestPerformingSource: sources[0]?.source || "n/a",
    worstPerformingSource: sources.at(-1)?.source || "n/a",
    biggestBottleneck,
    recommendedActions: Array.from(new Set(recommendedActions)).slice(0, 6),
  } satisfies ExecutiveDashboard;
}

export function buildUnifiedMemory(input: {
  companyName?: string | null;
  contacts?: { name: string; email?: string | null; phone?: string | null; title?: string | null }[];
  timeline: IntelligenceTimelineEvent[];
  campaignName?: string | null;
  workspaceName?: string | null;
}) {
  const memory: UnifiedMemory = { company: [], contacts: {}, campaign: [], workspace: [], operator: [] };
  appendUnique(memory.company, `${input.companyName || "Company"} has ${input.timeline.length} recorded intelligence event${input.timeline.length === 1 ? "" : "s"}.`);
  for (const event of input.timeline.slice(-12)) {
    if (event.type === "reply") appendUnique(memory.company, `Recent reply: ${event.label} - ${event.detail}`);
    if (event.type === "meeting") appendUnique(memory.company, `Meeting state: ${event.label}`);
    if (event.type === "proposal") appendUnique(memory.company, `Proposal state: ${event.label}`);
    if (event.type === "execution") appendUnique(memory.operator, `${event.label}: ${event.detail}`);
  }
  for (const contact of input.contacts || []) {
    memory.contacts[contact.name] = [
      contact.title ? `Role: ${contact.title}` : "",
      contact.email ? `Email known: ${contact.email}` : "Email unknown",
      contact.phone ? `Phone known: ${contact.phone}` : "Phone unknown",
    ].filter(Boolean);
  }
  appendUnique(memory.campaign, input.campaignName ? `Campaign context: ${input.campaignName}` : "No campaign context attached.");
  appendUnique(memory.workspace, input.workspaceName ? `Workspace: ${input.workspaceName}` : "Workspace context loaded.");
  return memory;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function confidenceLabel(snapshot: { triggerType: string; evidence: Prisma.JsonValue }) {
  const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence.length : 0;
  if (/reply|meeting|call_outcome|email_event/i.test(snapshot.triggerType) && evidence >= 3) return "Observed";
  if (evidence >= 2) return "Calibrating";
  return "Directional";
}

function snapshotComparison(snapshots: OpportunityIntelligenceSnapshotView[]) {
  if (snapshots.length < 2) return null;
  const latest = snapshots[0];
  const previous = snapshots[1];
  return {
    fromSnapshotId: previous.id,
    toSnapshotId: latest.id,
    trustDelta: latest.trustScore - previous.trustScore,
    meetingProbabilityDelta: Number(latest.meetingProbability || 0) - Number(previous.meetingProbability || 0),
    confidenceDelta: latest.overallConfidence - previous.overallConfidence,
    decisionChanged: latest.decisionLane !== previous.decisionLane,
    actionChanged: latest.recommendedAction !== previous.recommendedAction,
  } satisfies OpportunityIntelligenceSnapshotComparison;
}

export async function buildVegaIntelligenceGraph(input: { workspaceId: string; leadId: string }): Promise<VegaIntelligenceGraph> {
  const prisma = getPrisma();
  const [workspace, lead] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } }),
    prisma.lead.findUniqueOrThrow({
      where: { id: input.leadId },
      include: {
        company: { include: { contacts: true } },
        contact: true,
        opportunities: true,
      },
    }),
  ]);
  const campaignName = clean(jsonObject(lead.customFields).campaignName);
  const [campaign, intentSignals, interactions, replies, queueItems, bookingTasks, proposals] = await Promise.all([
    campaignName
      ? prisma.campaign.findFirst({ where: { workspaceId: input.workspaceId, name: campaignName } })
      : null,
    prisma.intentSignal.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          { leadId: lead.id },
          lead.companyId ? { companyId: lead.companyId } : {},
          lead.contactId ? { contactId: lead.contactId } : {},
        ].filter((item) => Object.keys(item).length),
      },
      orderBy: { observedAt: "desc" },
      take: 100,
    }),
    prisma.interaction.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.reply.findMany({ where: { workspaceId: input.workspaceId, leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.outreachQueueItem.findMany({ where: { workspaceId: input.workspaceId, leadId: lead.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.bookingTask.findMany({ where: { workspaceId: input.workspaceId, leadId: lead.id }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.proposal.findMany({ where: { workspaceId: input.workspaceId, opportunityId: { in: lead.opportunities.map((opportunity) => opportunity.id) } }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  const rawSnapshots = await prisma.opportunityIntelligenceSnapshot.findMany({
    where: { workspaceId: input.workspaceId, leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  const snapshots: OpportunityIntelligenceSnapshotView[] = rawSnapshots.map((snapshot) => ({
    id: snapshot.id,
    snapshotType: snapshot.snapshotType,
    triggerType: snapshot.triggerType,
    triggerId: snapshot.triggerId,
    createdAt: snapshot.createdAt,
    intelligenceVersion: snapshot.intelligenceVersion,
    policyVersion: snapshot.policyVersion,
    leadScore: snapshot.leadScore,
    intentScore: snapshot.intentScore,
    trustScore: snapshot.trustScore,
    contactConfidence: snapshot.contactConfidence,
    sourceQuality: snapshot.sourceQuality,
    messageQuality: snapshot.messageQuality,
    campaignFit: snapshot.campaignFit,
    senderHealth: snapshot.senderHealth,
    conversationProbability: snapshot.conversationProbability,
    meetingProbability: snapshot.meetingProbability,
    closeProbability: snapshot.closeProbability,
    bounceProbability: snapshot.bounceProbability,
    recommendedChannel: snapshot.recommendedChannel,
    recommendedAction: snapshot.recommendedAction,
    decisionLane: snapshot.decisionLane,
    overallConfidence: snapshot.overallConfidence,
    explanation: snapshot.explanation,
    evidence: snapshot.evidence,
    blockers: snapshot.blockers,
    confidenceLabel: confidenceLabel(snapshot),
    evidenceBasis: Array.isArray(snapshot.evidence) ? `${snapshot.evidence.length} evidence item${snapshot.evidence.length === 1 ? "" : "s"}` : "Stored evidence object",
    calibrationStatus: "Heuristic v1; calibrating until enough outcome data is collected.",
  }));
  const timeline = buildUnifiedCompanyTimeline({ lead, intentSignals, interactions, replies, queueItems, bookingTasks, opportunities: lead.opportunities, proposals });
  const contacts = lead.company?.contacts?.length ? lead.company.contacts : lead.contact ? [lead.contact] : [];
  const memory = buildUnifiedMemory({
    companyName: lead.companyName,
    contacts,
    timeline,
    campaignName,
    workspaceName: workspace.name,
  });
  const sourceSignals: IntentSignalLike[] = intentSignals.map((signal) => ({
    signalType: signal.signalType,
    observedAt: signal.observedAt,
    expiresAt: signal.expiresAt,
    confidence: signal.confidence,
    intentStrength: signal.intentStrength,
    scoreImpact: signal.scoreImpact,
    accountLevel: signal.accountLevel,
    personLevel: signal.personLevel,
    verified: signal.verified,
    summary: signal.summary,
    evidence: signal.evidence,
    sourceProvider: signal.sourceProvider,
  }));
  const opportunityIntelligence = buildOpportunityIntelligence({
    leadScore: lead.score,
    email: lead.contact?.email,
    phone: lead.contact?.phone,
    title: lead.title || lead.contact?.title || lead.contact?.role,
    companyName: lead.companyName,
    niche: lead.niche,
    signalSummary: clean(jsonObject(lead.customFields).signalSummary) || lead.nextAction,
    intentSignals: sourceSignals,
    priorInteractions: interactions.map((interaction) => interaction.classification || interaction.channel),
    campaignApproved: campaign?.status !== "paused",
    policy: {
      minScore: 80,
      autoSendTrustThreshold: 90,
      executiveReviewTrustThreshold: 80,
      senderMode: "clear",
      senderRemaining: 1,
      senderBounceRate: 0,
      workspaceAllowsAutoEmail: true,
      campaignAllowsAutoEmail: campaign?.status !== "paused",
    },
  });

  return {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    campaign: campaign ? { id: campaign.id, name: campaign.name, status: campaign.status } : null,
    company: lead.company ? { id: lead.company.id, name: lead.company.name, niche: lead.company.niche, website: lead.company.website } : null,
    contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, title: contact.title || contact.role })),
    lead: { id: lead.id, name: lead.name, companyName: lead.companyName, stage: lead.stage, score: lead.score, source: lead.source },
    opportunityIntelligence,
    snapshots,
    snapshotComparison: snapshotComparison(snapshots),
    timeline,
    memory,
  };
}
