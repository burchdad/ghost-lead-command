export const currentToolsOptions = [
  "Apollo",
  "Clay",
  "GoHighLevel",
  "HubSpot",
  "Salesforce",
  "LinkedIn Sales Navigator",
  "GojiBerry",
  "Instantly",
  "Smartlead",
  "Manual outreach",
  "None",
  "Other",
] as const;

export const monthlyLeadVolumeOptions = ["Under 50", "50-100", "101-500", "501-1,000", "Over 1,000"] as const;

export const betaInterestOptions = [
  "Yes, I want to actively test and provide feedback",
  "Maybe, tell me more",
  "No, just keep me updated",
] as const;

export type QualificationSegment =
  | "Founding Design Partner Candidate"
  | "Private Beta Candidate"
  | "General Waitlist";

export type QualificationInput = {
  betaInterest: string;
  role: string;
  monthlyLeadVolume: string;
  currentTools: string[];
  biggestChallenge: string;
  phone?: string;
  companyWebsite?: string;
};

export function isActiveBetaInterest(betaInterest: string) {
  return betaInterest.startsWith("Yes");
}

export function isMaybeBetaInterest(betaInterest: string) {
  return betaInterest.startsWith("Maybe");
}

export function roleIsDecisionMaker(role: string) {
  return /\b(founder|owner|ceo|coo|cmo|cro|chief|president|partner|principal|executive|vp|vice president|head of|director|sales leader|revenue leader|agency owner)\b/i.test(role);
}

export function hasRealPlatform(tools: string[]) {
  return tools.some((tool) => !/^none$/i.test(tool));
}

export function usesCompetitorPlatform(tools: string[]) {
  return tools.some((tool) =>
    /\b(gojiberry|apollo|clay|instantly|smartlead|gohighlevel|hubspot|salesforce|sales navigator)\b/i.test(tool),
  );
}

export function highLeadVolume(volume: string) {
  return ["101-500", "501-1,000", "Over 1,000"].includes(volume);
}

export function scoreWaitlist(input: QualificationInput) {
  let score = 0;
  if (isActiveBetaInterest(input.betaInterest)) score += 25;
  if (isMaybeBetaInterest(input.betaInterest)) score += 10;
  if (roleIsDecisionMaker(input.role)) score += 20;
  if (input.monthlyLeadVolume === "101-500") score += 15;
  if (input.monthlyLeadVolume === "501-1,000") score += 20;
  if (input.monthlyLeadVolume === "Over 1,000") score += 25;
  if (hasRealPlatform(input.currentTools)) score += 10;
  if (usesCompetitorPlatform(input.currentTools)) score += 5;
  if (input.biggestChallenge.trim().length >= 80) score += 10;
  if (input.phone) score += 5;
  if (input.companyWebsite) score += 5;
  return Math.min(100, score);
}

export function priorityFromScore(score: number) {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function segmentWaitlist(input: QualificationInput, score: number): QualificationSegment {
  const decisionMaker = roleIsDecisionMaker(input.role);
  const active = isActiveBetaInterest(input.betaInterest);
  const maybe = isMaybeBetaInterest(input.betaInterest);
  const meaningfulChallenge = input.biggestChallenge.trim().length >= 60;
  const platform = hasRealPlatform(input.currentTools);
  const volume = highLeadVolume(input.monthlyLeadVolume);

  if (score >= 80 && decisionMaker && active && volume && meaningfulChallenge && platform) {
    return "Founding Design Partner Candidate";
  }

  if (score >= 55 && (active || maybe) && meaningfulChallenge && (volume || platform)) {
    return "Private Beta Candidate";
  }

  return "General Waitlist";
}
