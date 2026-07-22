export type VegaFeatureFlag =
  | "VEGA_INTENT_ENGINE_V2"
  | "VEGA_SOCIAL_SIGNALS"
  | "VEGA_LOOKALIKE_MODEL"
  | "VEGA_INBOUND_CONVERSATIONS"
  | "VEGA_SMS"
  | "VEGA_WHATSAPP"
  | "VEGA_WEBSITE_CHAT"
  | "VEGA_AUTO_BOOKING"
  | "VEGA_AGENCY_PORTFOLIO"
  | "VEGA_EXPERIMENT_ENGINE"
  | "VEGA_ENRICHMENT_WATERFALL"
  | "VEGA_DELIVERABILITY_V2";

const INTERNAL_DEFAULTS: Record<VegaFeatureFlag, boolean> = {
  VEGA_INTENT_ENGINE_V2: true,
  VEGA_SOCIAL_SIGNALS: true,
  VEGA_LOOKALIKE_MODEL: false,
  VEGA_INBOUND_CONVERSATIONS: false,
  VEGA_SMS: false,
  VEGA_WHATSAPP: false,
  VEGA_WEBSITE_CHAT: false,
  VEGA_AUTO_BOOKING: false,
  VEGA_AGENCY_PORTFOLIO: false,
  VEGA_EXPERIMENT_ENGINE: true,
  VEGA_ENRICHMENT_WATERFALL: true,
  VEGA_DELIVERABILITY_V2: true,
};

const EXTERNAL_DEFAULTS: Record<VegaFeatureFlag, boolean> = {
  VEGA_INTENT_ENGINE_V2: false,
  VEGA_SOCIAL_SIGNALS: false,
  VEGA_LOOKALIKE_MODEL: false,
  VEGA_INBOUND_CONVERSATIONS: false,
  VEGA_SMS: false,
  VEGA_WHATSAPP: false,
  VEGA_WEBSITE_CHAT: false,
  VEGA_AUTO_BOOKING: false,
  VEGA_AGENCY_PORTFOLIO: false,
  VEGA_EXPERIMENT_ENGINE: false,
  VEGA_ENRICHMENT_WATERFALL: false,
  VEGA_DELIVERABILITY_V2: true,
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function boolFromEnv(name: string) {
  const value = clean(process.env[name]).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

export function isInternalGhostWorkspace(input: { workspaceSlug?: string | null; workspaceName?: string | null }) {
  return /ghost|ghost ai|ghostai/i.test(`${input.workspaceSlug || ""} ${input.workspaceName || ""}`);
}

export function isVegaFeatureEnabled(
  flag: VegaFeatureFlag,
  input: { workspaceSlug?: string | null; workspaceName?: string | null; override?: boolean } = {},
) {
  if (typeof input.override === "boolean") return input.override;
  const envOverride = boolFromEnv(flag);
  if (typeof envOverride === "boolean") return envOverride;
  return (isInternalGhostWorkspace(input) ? INTERNAL_DEFAULTS : EXTERNAL_DEFAULTS)[flag];
}

export function vegaFeatureFlagSnapshot(input: { workspaceSlug?: string | null; workspaceName?: string | null } = {}) {
  return (Object.keys(INTERNAL_DEFAULTS) as VegaFeatureFlag[]).reduce<Record<VegaFeatureFlag, boolean>>((snapshot, flag) => {
    snapshot[flag] = isVegaFeatureEnabled(flag, input);
    return snapshot;
  }, {} as Record<VegaFeatureFlag, boolean>);
}
