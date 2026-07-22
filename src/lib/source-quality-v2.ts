export type SourceQualityMetrics = {
  recordsReturned: number;
  validBusinessCount: number;
  verifiedEmailCount: number;
  phoneAvailableCount: number;
  decisionMakerCount: number;
  sentCount: number;
  deliveredCount: number;
  hardBounceCount: number;
  replyCount: number;
  reachedContactCount: number;
  conversationCount: number;
  meetingCount: number;
  providerCost?: number;
};

function pct(count: number, denominator: number) {
  return denominator > 0 ? Math.round((count / denominator) * 1000) / 10 : 0;
}

function cost(cost: number | undefined, denominator: number) {
  return cost && denominator > 0 ? Math.round((cost / denominator) * 100) / 100 : null;
}

export function scoreSourceQuality(metrics: SourceQualityMetrics, input: { minSampleSize?: number } = {}) {
  const minSampleSize = input.minSampleSize || 25;
  const sampleSize = Math.max(metrics.recordsReturned, metrics.sentCount, metrics.deliveredCount + metrics.hardBounceCount);
  const validBusinessRate = pct(metrics.validBusinessCount, metrics.recordsReturned);
  const verifiedEmailRate = pct(metrics.verifiedEmailCount, metrics.recordsReturned);
  const phoneAvailability = pct(metrics.phoneAvailableCount, metrics.recordsReturned);
  const decisionMakerAccuracy = pct(metrics.decisionMakerCount, metrics.recordsReturned);
  const deliveredRate = pct(metrics.deliveredCount, Math.max(metrics.sentCount, metrics.deliveredCount + metrics.hardBounceCount));
  const hardBounceRate = pct(metrics.hardBounceCount, Math.max(metrics.sentCount, metrics.deliveredCount + metrics.hardBounceCount));
  const replyRate = pct(metrics.replyCount, Math.max(metrics.sentCount, 1));
  const reachedContactRate = pct(metrics.reachedContactCount, Math.max(metrics.phoneAvailableCount, 1));
  const conversationRate = pct(metrics.conversationCount, Math.max(metrics.reachedContactCount, 1));
  const meetingRate = pct(metrics.meetingCount, Math.max(metrics.conversationCount, 1));

  let score = 50;
  score += validBusinessRate >= 80 ? 10 : validBusinessRate >= 60 ? 4 : -8;
  score += verifiedEmailRate >= 50 ? 10 : verifiedEmailRate >= 25 ? 4 : -6;
  score += phoneAvailability >= 60 ? 6 : phoneAvailability >= 30 ? 2 : -3;
  score += decisionMakerAccuracy >= 60 ? 8 : decisionMakerAccuracy >= 30 ? 2 : -6;
  score += deliveredRate >= 90 ? 10 : deliveredRate >= 80 ? 5 : -10;
  score += hardBounceRate <= 3 ? 10 : hardBounceRate <= 8 ? -6 : -18;
  score += replyRate >= 8 ? 10 : replyRate >= 3 ? 4 : 0;
  score += meetingRate >= 15 ? 8 : meetingRate >= 5 ? 3 : 0;
  score = Math.min(100, Math.max(0, score));

  const state =
    sampleSize < minSampleSize ? "insufficient_sample" :
    hardBounceRate >= 12 ? "penalize" :
    score >= 75 ? "scale" :
    score >= 55 ? "monitor" :
    "reduce";

  return {
    validBusinessRate,
    verifiedEmailRate,
    phoneAvailability,
    decisionMakerAccuracy,
    deliveredRate,
    hardBounceRate,
    replyRate,
    reachedContactRate,
    conversationRate,
    meetingRate,
    costPerValidRecord: cost(metrics.providerCost, metrics.validBusinessCount),
    costPerQualifiedLead: cost(metrics.providerCost, metrics.decisionMakerCount),
    costPerConversation: cost(metrics.providerCost, metrics.conversationCount),
    costPerMeeting: cost(metrics.providerCost, metrics.meetingCount),
    score,
    sampleSize,
    state,
    minimumSampleSatisfied: sampleSize >= minSampleSize,
  };
}
