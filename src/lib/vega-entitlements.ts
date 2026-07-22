import type { VegaProductCode } from "@prisma/client";

export type VegaCapability =
  | "local_discovery"
  | "b2b_discovery"
  | "intent_scores"
  | "lead_export"
  | "limited_signal_monitoring"
  | "outbound_email"
  | "approval_mode"
  | "controlled_auto_send"
  | "follow_ups"
  | "delivery_tracking"
  | "manual_social_tasks"
  | "inbound_qualification"
  | "reply_handling"
  | "phone_assist"
  | "call_outcomes"
  | "booking"
  | "crm_notes"
  | "multi_channel_inbound"
  | "managed_operations"
  | "managed_call_allowance"
  | "campaign_strategy"
  | "weekly_proof_report"
  | "controlled_experiments"
  | "priority_support"
  | "agency_portfolio"
  | "client_workspaces"
  | "approved_branding"
  | "reseller_controls"
  | "custom_entitlements";

const PLAN_CAPABILITIES: Record<VegaProductCode, VegaCapability[]> = {
  VEGA_SCOUT: ["local_discovery", "b2b_discovery", "intent_scores", "lead_export", "limited_signal_monitoring"],
  VEGA_REACH: [
    "local_discovery",
    "b2b_discovery",
    "intent_scores",
    "lead_export",
    "limited_signal_monitoring",
    "outbound_email",
    "approval_mode",
    "controlled_auto_send",
    "follow_ups",
    "delivery_tracking",
    "manual_social_tasks",
  ],
  VEGA_CONVERT: [
    "local_discovery",
    "b2b_discovery",
    "intent_scores",
    "lead_export",
    "limited_signal_monitoring",
    "outbound_email",
    "approval_mode",
    "controlled_auto_send",
    "follow_ups",
    "delivery_tracking",
    "manual_social_tasks",
    "inbound_qualification",
    "reply_handling",
    "phone_assist",
    "call_outcomes",
    "booking",
    "crm_notes",
    "multi_channel_inbound",
  ],
  VEGA_MANAGED: [
    "local_discovery",
    "b2b_discovery",
    "intent_scores",
    "lead_export",
    "limited_signal_monitoring",
    "outbound_email",
    "approval_mode",
    "controlled_auto_send",
    "follow_ups",
    "delivery_tracking",
    "manual_social_tasks",
    "inbound_qualification",
    "reply_handling",
    "phone_assist",
    "call_outcomes",
    "booking",
    "crm_notes",
    "multi_channel_inbound",
    "managed_operations",
    "managed_call_allowance",
    "campaign_strategy",
    "weekly_proof_report",
    "controlled_experiments",
    "priority_support",
  ],
  VEGA_WHITE_LABEL: [
    "local_discovery",
    "b2b_discovery",
    "intent_scores",
    "lead_export",
    "limited_signal_monitoring",
    "outbound_email",
    "approval_mode",
    "controlled_auto_send",
    "follow_ups",
    "delivery_tracking",
    "manual_social_tasks",
    "inbound_qualification",
    "reply_handling",
    "phone_assist",
    "call_outcomes",
    "booking",
    "crm_notes",
    "multi_channel_inbound",
    "managed_operations",
    "managed_call_allowance",
    "campaign_strategy",
    "weekly_proof_report",
    "controlled_experiments",
    "priority_support",
    "agency_portfolio",
    "client_workspaces",
    "approved_branding",
    "reseller_controls",
    "custom_entitlements",
  ],
};

export function getVegaPlanCapabilities(plan: VegaProductCode = "VEGA_SCOUT") {
  return PLAN_CAPABILITIES[plan];
}

export function hasVegaCapability(plan: VegaProductCode = "VEGA_SCOUT", capability: VegaCapability) {
  return PLAN_CAPABILITIES[plan].includes(capability);
}
