import type { NextBestChannel } from "@prisma/client";
import type { IntentSignalLike } from "@/lib/intent-engine";
import { scoreIntentSignals } from "@/lib/intent-engine";

export type ChannelDecisionInput = {
  emailConfidence: number;
  phoneConfidence: number;
  decisionMakerConfidence: number;
  contactConfidence?: number;
  signals?: IntentSignalLike[];
  priorInteractions?: string[];
  permittedChannels: string[];
  channelConsent?: Record<string, boolean>;
  senderState: "HEALTHY" | "CAUTION" | "RESTRICTED" | "STOP";
  providerHealthy?: boolean;
  sourceQualityScore?: number;
  suppressed?: boolean;
  cooldownActive?: boolean;
  socialSignalTier?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  workspaceAllowsAutoEmail?: boolean;
  campaignAllowsAutoEmail?: boolean;
  requiresHumanApproval?: boolean;
};

export type ChannelDecision = {
  selectedPrimaryChannel: NextBestChannel;
  allowedSecondaryChannels: NextBestChannel[];
  prohibitedChannels: NextBestChannel[];
  reasons: string[];
  confidence: number;
  requiredApproval: boolean;
  scheduledTime?: Date | null;
  fallbackAction: NextBestChannel;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function has(input: ChannelDecisionInput, channel: string) {
  return input.permittedChannels.map((item) => item.toLowerCase()).includes(channel.toLowerCase());
}

function consent(input: ChannelDecisionInput, channel: string) {
  return input.channelConsent?.[channel] !== false;
}

export function selectNextBestChannel(input: ChannelDecisionInput): ChannelDecision {
  const intent = scoreIntentSignals(input.signals || []);
  const reasons: string[] = [];
  const prohibited = new Set<NextBestChannel>();
  const allowed = new Set<NextBestChannel>();

  if (input.suppressed) {
    return {
      selectedPrimaryChannel: "SUPPRESS",
      allowedSecondaryChannels: [],
      prohibitedChannels: ["AUTO_EMAIL", "APPROVAL_EMAIL", "SMS_FOLLOW_UP", "LINKEDIN_MANUAL_TASK"],
      reasons: ["Suppression match blocks outreach."],
      confidence: 1,
      requiredApproval: false,
      fallbackAction: "NO_ACTION",
    };
  }

  if (input.cooldownActive) reasons.push("Contact cooldown is active.");
  if (!input.providerHealthy) reasons.push("Provider health is not clear.");
  if (intent.blockers.length) reasons.push(...intent.blockers);

  const emailAllowed = has(input, "cold_outbound_email") && consent(input, "email") && input.emailConfidence >= 0.7;
  const callAllowed = has(input, "phone_calls") && consent(input, "phone") && input.phoneConfidence >= 0.55;
  const socialAllowed = has(input, "linkedin_manual_actions") || has(input, "social_manual_actions");
  const smsAllowed = has(input, "outbound_sms") && consent(input, "sms");

  if (!emailAllowed) prohibited.add("AUTO_EMAIL").add("APPROVAL_EMAIL");
  if (!smsAllowed) prohibited.add("SMS_FOLLOW_UP");
  if (!socialAllowed) prohibited.add("LINKEDIN_MANUAL_TASK").add("SOCIAL_RESPONSE_TASK");

  if (emailAllowed) allowed.add("APPROVAL_EMAIL");
  if (callAllowed) allowed.add("CALL_FIRST");
  if (socialAllowed) allowed.add("LINKEDIN_MANUAL_TASK");

  const sourceQuality = input.sourceQualityScore ?? 50;
  const senderSafeForFirstTouch = input.senderState === "HEALTHY" || input.senderState === "CAUTION";
  const autoEmailSafe =
    emailAllowed &&
    senderSafeForFirstTouch &&
    input.providerHealthy !== false &&
    sourceQuality >= 60 &&
    input.decisionMakerConfidence >= 0.65 &&
    input.workspaceAllowsAutoEmail &&
    input.campaignAllowsAutoEmail &&
    !input.requiresHumanApproval &&
    !input.cooldownActive &&
    intent.totalIntentScore >= 45 &&
    !intent.blockers.length;

  let primary: NextBestChannel = "RESEARCH_MORE";
  let requiredApproval = true;
  if (autoEmailSafe) {
    primary = "AUTO_EMAIL";
    requiredApproval = false;
    reasons.push("Safe email contact, acceptable sender health, decision-maker confidence, and current intent support auto-send.");
  } else if (input.senderState === "STOP" && callAllowed) {
    primary = "CALL_FIRST";
    reasons.push("Sender governor is STOP, so first-touch email is prohibited while calls remain actionable.");
  } else if (emailAllowed && input.senderState !== "STOP" && intent.totalIntentScore >= 25 && !input.cooldownActive) {
    primary = "APPROVAL_EMAIL";
    reasons.push("Email is available, but Vega needs human approval or stronger proof before automatic send.");
  } else if (callAllowed && intent.totalIntentScore >= 20) {
    primary = "CALL_FIRST";
    reasons.push("Phone path is stronger than email or sender policy is holding first-touch email.");
  } else if (socialAllowed && input.socialSignalTier && ["HIGH", "VERY_HIGH"].includes(input.socialSignalTier)) {
    primary = "LINKEDIN_MANUAL_TASK";
    reasons.push("Authorized social evidence is strong, but automated social messaging is not permitted.");
  } else if (intent.totalIntentScore < 25) {
    primary = "NURTURE";
    reasons.push("Intent score is not high enough for immediate outreach.");
  }

  const confidence = clamp(
    (input.emailConfidence + input.phoneConfidence + input.decisionMakerConfidence + (input.sourceQualityScore || 50) / 100 + intent.confidence) / 5,
  );
  const fallbackAction: NextBestChannel =
    primary === "AUTO_EMAIL" ? "PHONE_ASSIST_AFTER_EMAIL" :
    callAllowed ? "CALL_FIRST" :
    socialAllowed ? "LINKEDIN_MANUAL_TASK" :
    "RESEARCH_MORE";

  return {
    selectedPrimaryChannel: primary,
    allowedSecondaryChannels: [...allowed].filter((channel) => channel !== primary),
    prohibitedChannels: [...prohibited],
    reasons,
    confidence: Math.round(confidence * 100) / 100,
    requiredApproval,
    scheduledTime: null,
    fallbackAction,
  };
}
