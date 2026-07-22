import { IntelligenceSnapshotType, type Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  buildVegaIntelligenceGraph,
  VEGA_INTELLIGENCE_VERSION,
  VEGA_POLICY_VERSION,
  type OpportunityIntelligence,
} from "@/lib/vega-intelligence-fusion";

export const MEANINGFUL_INTELLIGENCE_TRIGGERS = new Set([
  "lead_qualified",
  "new_intent_signal",
  "outreach_generated",
  "send_decision",
  "email_event",
  "reply_received",
  "call_outcome",
  "meeting_requested",
  "meeting_booked",
  "campaign_policy_change",
  "manual_override",
]);

type PersistSnapshotInput = {
  workspaceId: string;
  leadId: string;
  campaignId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  triggerType: string;
  triggerId?: string | null;
  intelligence?: OpportunityIntelligence | null;
  evidence?: unknown;
};

export function snapshotTypeForTrigger(triggerType: string) {
  if (triggerType === "lead_qualified") return IntelligenceSnapshotType.QUALIFICATION;
  if (triggerType === "new_intent_signal") return IntelligenceSnapshotType.SIGNAL_UPDATE;
  if (triggerType === "outreach_generated") return IntelligenceSnapshotType.PRE_EXECUTION;
  if (triggerType === "send_decision") return IntelligenceSnapshotType.DECISION;
  if (triggerType === "email_event") return IntelligenceSnapshotType.DELIVERY_EVENT;
  if (triggerType === "reply_received") return IntelligenceSnapshotType.REPLY;
  if (triggerType === "call_outcome") return IntelligenceSnapshotType.CALL_OUTCOME;
  if (triggerType === "meeting_requested" || triggerType === "meeting_booked") return IntelligenceSnapshotType.MEETING_EVENT;
  if (triggerType === "campaign_policy_change") return IntelligenceSnapshotType.POLICY_CHANGE;
  if (triggerType === "manual_override") return IntelligenceSnapshotType.MANUAL_OVERRIDE;
  return IntelligenceSnapshotType.DECISION;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) return {};
  return value as Prisma.InputJsonValue;
}

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function persistOpportunityIntelligenceSnapshot(input: PersistSnapshotInput) {
  if (!MEANINGFUL_INTELLIGENCE_TRIGGERS.has(input.triggerType)) {
    return { created: false as const, reason: "not-meaningful-trigger" };
  }

  const prisma = getPrisma();
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, workspaceId: input.workspaceId },
    select: {
      id: true,
      workspaceId: true,
      companyId: true,
      contactId: true,
      customFields: true,
    },
  });

  if (!lead) return { created: false as const, reason: "lead-not-found" };

  const graph = input.intelligence
    ? null
    : await buildVegaIntelligenceGraph({ workspaceId: input.workspaceId, leadId: input.leadId });
  const intelligence = input.intelligence || graph?.opportunityIntelligence;
  if (!intelligence) return { created: false as const, reason: "missing-intelligence" };

  const customFields =
    lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
      ? lead.customFields as Record<string, unknown>
      : {};
  const campaignId = input.campaignId || (typeof customFields.campaignId === "string" ? customFields.campaignId : null);
  const evidence = input.evidence ?? intelligence.explanation.evidence;
  const snapshot = await prisma.opportunityIntelligenceSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      campaignId,
      leadId: lead.id,
      companyId: input.companyId ?? lead.companyId,
      contactId: input.contactId ?? lead.contactId,
      intelligenceVersion: VEGA_INTELLIGENCE_VERSION,
      policyVersion: VEGA_POLICY_VERSION,
      leadScore: intelligence.leadScore,
      intentScore: intelligence.intentScore,
      trustScore: intelligence.trustScore,
      contactConfidence: intelligence.contactConfidence,
      sourceQuality: intelligence.sourceQuality,
      messageQuality: intelligence.messageQuality,
      campaignFit: intelligence.campaignFit,
      senderHealth: intelligence.senderHealth,
      conversationProbability: intelligence.predictedConversationProbability,
      meetingProbability: intelligence.predictedMeetingProbability,
      closeProbability: intelligence.predictedCloseProbability,
      bounceProbability: intelligence.bounceProbability,
      recommendedChannel: String(intelligence.recommendedChannel),
      recommendedAction: intelligence.recommendedAction,
      decisionLane: intelligence.decisionLane,
      overallConfidence: intelligence.overallConfidence,
      snapshotType: snapshotTypeForTrigger(input.triggerType),
      explanation: toJson(intelligence.explanation),
      evidence: toJson(jsonArray(evidence)),
      blockers: toJson(jsonArray(intelligence.explanation.blockers)),
      triggerType: input.triggerType,
      triggerId: input.triggerId || null,
    },
  });

  return { created: true as const, snapshot };
}

export async function getLatestOpportunityIntelligenceSnapshot(input: { workspaceId: string; leadId: string }) {
  return getPrisma().opportunityIntelligenceSnapshot.findFirst({
    where: { workspaceId: input.workspaceId, leadId: input.leadId },
    orderBy: { createdAt: "desc" },
  });
}
