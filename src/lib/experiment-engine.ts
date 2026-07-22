import type { ExperimentStatus, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type ExperimentProposalInput = {
  workspaceId: string;
  campaignId?: string | null;
  hypothesis: string;
  currentConfiguration: Prisma.InputJsonValue;
  proposedConfiguration: Prisma.InputJsonValue;
  targetMetric: string;
  guardrailMetrics?: Prisma.InputJsonValue;
  sampleSize: number;
  duration: number;
  riskLevel: "low" | "medium" | "high";
  recommendationReason: string;
  supportingEvidence?: Prisma.InputJsonValue;
};

export function requiresExperimentApproval(input: { changes: string[]; volumeIncreasePct?: number }) {
  const material = [
    "target_market",
    "territory",
    "central_offer",
    "qualification_threshold",
    "active_icp",
    "new_channel",
    "client_strategy",
  ];
  return input.changes.some((change) => material.includes(change)) || Number(input.volumeIncreasePct || 0) >= 25;
}

export function canAutoApplyLearning(input: { action: string }) {
  return [
    "suppress_bad_contact",
    "prioritize_positive_engagement",
    "reduce_sender_risk",
    "reschedule_callback",
    "prevent_duplicate",
    "stop_sequence_after_reply",
    "stop_sequence_after_booking",
  ].includes(input.action);
}

export async function proposeExperiment(input: ExperimentProposalInput) {
  const prisma = getPrisma();
  return prisma.experimentProposal.create({
    data: {
      workspaceId: input.workspaceId,
      campaignId: input.campaignId || null,
      hypothesis: input.hypothesis,
      currentConfiguration: input.currentConfiguration,
      proposedConfiguration: input.proposedConfiguration,
      targetMetric: input.targetMetric,
      guardrailMetrics: input.guardrailMetrics,
      sampleSize: input.sampleSize,
      duration: input.duration,
      riskLevel: input.riskLevel,
      recommendationReason: input.recommendationReason,
      supportingEvidence: input.supportingEvidence,
      status: "PROPOSED",
    },
  });
}

export function transitionExperimentStatus(current: ExperimentStatus, next: ExperimentStatus) {
  const allowed: Record<ExperimentStatus, ExperimentStatus[]> = {
    DRAFT: ["PROPOSED", "REJECTED"],
    PROPOSED: ["APPROVED", "REJECTED", "PAUSED"],
    APPROVED: ["RUNNING", "PAUSED", "ROLLED_BACK"],
    REJECTED: [],
    RUNNING: ["PAUSED", "COMPLETED", "INCONCLUSIVE", "ROLLED_BACK"],
    PAUSED: ["RUNNING", "REJECTED", "ROLLED_BACK"],
    COMPLETED: [],
    INCONCLUSIVE: ["ROLLED_BACK"],
    ROLLED_BACK: [],
  };
  if (!allowed[current].includes(next)) {
    return { ok: false as const, reason: `${current} cannot transition to ${next}.` };
  }
  return { ok: true as const };
}
