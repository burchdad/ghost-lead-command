import type { VegaCapabilityGroup } from "@prisma/client";
import type { VegaFeatureFlag } from "@/lib/vega-feature-flags";
import type { VegaCapability } from "@/lib/vega-entitlements";

export type VegaCapabilityRegistryEntry = {
  group: VegaCapabilityGroup;
  label: string;
  purpose: string;
  agents: string[];
  services: string[];
  routes: string[];
  models: string[];
  requiredCapabilities: VegaCapability[];
  featureFlags: VegaFeatureFlag[];
};

export const VEGA_CAPABILITY_REGISTRY: VegaCapabilityRegistryEntry[] = [
  {
    group: "VEGA_DISCOVER",
    label: "Vega Discover",
    purpose: "Find companies, contacts, buyers, referral partners, and local-market opportunities.",
    agents: ["Source Agents", "Business Discovery Agent"],
    services: ["sourcing", "agent", "linkedin-sales-nav"],
    routes: ["/api/source/search", "/api/source/import", "/api/linkedin/sales-nav"],
    models: ["Lead", "Company", "Contact", "LocalMarketProfile"],
    requiredCapabilities: ["local_discovery", "b2b_discovery"],
    featureFlags: [],
  },
  {
    group: "VEGA_SIGNAL",
    label: "Vega Signal",
    purpose: "Detect and explain intent, engagement, social, local, CRM, and web signals.",
    agents: ["Intent Signal Agent", "Web Helper Agent", "Signal Feed Agent"],
    services: ["intent-engine", "intent-feed", "social-intent", "signal-plays"],
    routes: ["/api/agent/intent-feed", "/api/agent/signal-collector"],
    models: ["IntentSignal", "SocialEngagementEvent", "SocialSignalMatch"],
    requiredCapabilities: ["intent_scores", "limited_signal_monitoring"],
    featureFlags: ["VEGA_INTENT_ENGINE_V2", "VEGA_SOCIAL_SIGNALS"],
  },
  {
    group: "VEGA_REACH",
    label: "Vega Reach",
    purpose: "Create and execute permitted outbound outreach with approval, suppression, and sender health.",
    agents: ["Outreach Agent", "Deliverability Governor"],
    services: ["outreach", "approval", "conversion-quality", "next-best-channel"],
    routes: ["/api/outreach/send", "/api/outreach/queue", "/api/slack/interactions"],
    models: ["OutreachQueueItem", "SequenceStep", "CommunicationPolicy"],
    requiredCapabilities: ["outbound_email", "approval_mode", "delivery_tracking"],
    featureFlags: ["VEGA_DELIVERABILITY_V2"],
  },
  {
    group: "VEGA_ENGAGE",
    label: "Vega Engage",
    purpose: "Handle inbound inquiries and active conversations with qualification and human takeover.",
    agents: ["Reply Agent", "Inbound Concierge"],
    services: ["replies", "conversation-qualification"],
    routes: ["/api/sendgrid/inbound", "/api/replies"],
    models: ["InboundConversation", "InboundMessage", "QualificationPlaybook"],
    requiredCapabilities: ["inbound_qualification", "reply_handling"],
    featureFlags: ["VEGA_INBOUND_CONVERSATIONS"],
  },
  {
    group: "VEGA_CONVERT",
    label: "Vega Convert",
    purpose: "Coordinate phone follow-up, callbacks, booking handoffs, meetings, proposals, and CRM notes.",
    agents: ["Booking Concierge Agent", "Call Assist Agent", "GhostCRM Revenue Agent"],
    services: ["phone-assist", "vega-call-assist-work", "warm-leads", "ghostcrm"],
    routes: ["/api/agent/calls", "/api/automation/booking", "/api/crm/sync"],
    models: ["BookingTask", "Opportunity", "Proposal", "SalesPlaybook"],
    requiredCapabilities: ["phone_assist", "call_outcomes", "booking", "crm_notes"],
    featureFlags: ["VEGA_AUTO_BOOKING"],
  },
  {
    group: "VEGA_INTELLIGENCE",
    label: "Vega Intelligence",
    purpose: "Measure results, rank sources, recommend controlled experiments, and improve strategy with approval.",
    agents: ["Production Proof Agent", "Learning Agent", "Source Quality Agent"],
    services: ["production-proof", "source-quality-v2", "experiment-engine", "conversion-learning"],
    routes: ["/api/agent/production-proof", "/api/agent/learning", "/api/agent/adaptive-learning"],
    models: ["SourceQualityProfile", "ExperimentProposal", "LookalikeModelVersion"],
    requiredCapabilities: ["weekly_proof_report", "controlled_experiments"],
    featureFlags: ["VEGA_EXPERIMENT_ENGINE", "VEGA_LOOKALIKE_MODEL"],
  },
];
