export type ProviderCapability =
  | "send"
  | "fetch"
  | "event_handling"
  | "credential_validation"
  | "usage_reporting"
  | "retry"
  | "idempotency";

export type ProviderHealth = {
  provider: string;
  healthy: boolean;
  status: "ok" | "degraded" | "missing_credentials" | "blocked";
  detail: string;
};

export type NormalizedProviderResponse<T = unknown> = {
  provider: string;
  status: "success" | "retryable_failure" | "permanent_failure" | "skipped";
  externalId?: string;
  cost?: number;
  latencyMs?: number;
  raw?: T;
  errorClass?: "auth" | "rate_limit" | "validation" | "provider" | "network" | "policy";
  idempotencyKey?: string;
};

export interface VegaProviderAdapter<TSendInput = unknown, TFetchInput = unknown, TEvent = unknown> {
  providerName: string;
  capabilities: ProviderCapability[];
  healthCheck(): Promise<ProviderHealth>;
  validateCredentials(): Promise<ProviderHealth>;
  send?(input: TSendInput): Promise<NormalizedProviderResponse>;
  fetch?(input: TFetchInput): Promise<NormalizedProviderResponse>;
  handleEvent?(event: TEvent): Promise<NormalizedProviderResponse>;
  retryPolicy: {
    maxAttempts: number;
    retryableErrors: string[];
  };
  classifyError(error: unknown): NormalizedProviderResponse;
}

export function createConfiguredSendGridAdapter(input: { apiKey?: string | null }): VegaProviderAdapter {
  const configured = Boolean(input.apiKey?.trim());
  return {
    providerName: "sendgrid",
    capabilities: ["send", "event_handling", "credential_validation", "usage_reporting", "retry", "idempotency"],
    retryPolicy: {
      maxAttempts: 2,
      retryableErrors: ["rate_limit", "network", "provider"],
    },
    async healthCheck() {
      return {
        provider: "sendgrid",
        healthy: configured,
        status: configured ? "ok" : "missing_credentials",
        detail: configured ? "SendGrid adapter configured." : "SENDGRID_API_KEY is not configured.",
      };
    },
    async validateCredentials() {
      return this.healthCheck();
    },
    classifyError(error) {
      const message = error instanceof Error ? error.message : String(error || "Unknown provider error");
      const errorClass = /401|403|auth|key/i.test(message) ? "auth" : /429|rate/i.test(message) ? "rate_limit" : "provider";
      return {
        provider: "sendgrid",
        status: errorClass === "auth" ? "permanent_failure" : "retryable_failure",
        errorClass,
        raw: { message },
      };
    },
  };
}
