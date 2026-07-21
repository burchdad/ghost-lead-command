DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaLaunchAgentType') THEN
    CREATE TYPE "VegaLaunchAgentType" AS ENUM (
      'VEGA_CONCIERGE',
      'BUSINESS_DISCOVERY_AGENT',
      'MARKET_STRATEGY_AGENT',
      'OFFER_ARCHITECT',
      'CAMPAIGN_ARCHITECT',
      'PRODUCT_ADVISOR',
      'PRICING_AGENT',
      'PROPOSAL_AGENT',
      'BILLING_CONCIERGE',
      'PROVISIONING_AGENT',
      'LAUNCH_QA_AGENT'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AIOnboardingStatus') THEN
    CREATE TYPE "AIOnboardingStatus" AS ENUM (
      'STARTED',
      'DISCOVERING_BUSINESS',
      'RESEARCHING_MARKET',
      'BUILDING_OFFER',
      'DESIGNING_CAMPAIGN',
      'RECOMMENDING_PRODUCT',
      'PRICING',
      'REVIEWING_PROPOSAL',
      'AWAITING_CHECKOUT',
      'PAYMENT_PROCESSING',
      'PAID',
      'PROVISIONING',
      'LAUNCH_REVIEW',
      'READY',
      'LAUNCHED',
      'ABANDONED',
      'HUMAN_REVIEW',
      'BLOCKED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaProductCode') THEN
    CREATE TYPE "VegaProductCode" AS ENUM (
      'VEGA_SCOUT',
      'VEGA_REACH',
      'VEGA_CONVERT',
      'VEGA_MANAGED',
      'VEGA_WHITE_LABEL'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LaunchReadinessStatus') THEN
    CREATE TYPE "LaunchReadinessStatus" AS ENUM (
      'NOT_READY',
      'READY_FOR_DRY_RUN',
      'READY_FOR_CUSTOMER_REVIEW',
      'READY_FOR_LIVE',
      'BLOCKED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommercialProposalStatus') THEN
    CREATE TYPE "CommercialProposalStatus" AS ENUM (
      'DRAFT',
      'PRESENTED',
      'REVISION_REQUESTED',
      'ACCEPTED',
      'DECLINED',
      'EXPIRED',
      'HUMAN_REVIEW'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HumanReviewStatus') THEN
    CREATE TYPE "HumanReviewStatus" AS ENUM (
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED',
      'CANCELED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AIOnboardingSession" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "visitorId" TEXT,
  "authenticatedUserId" TEXT,
  "status" "AIOnboardingStatus" NOT NULL DEFAULT 'STARTED',
  "currentObjective" TEXT,
  "currentAgent" "VegaLaunchAgentType" NOT NULL DEFAULT 'VEGA_CONCIERGE',
  "collectedFacts" JSONB,
  "confirmedFacts" JSONB,
  "inferredFacts" JSONB,
  "missingRequiredFacts" JSONB,
  "rejectedRecommendations" JSONB,
  "businessProfileDraft" JSONB,
  "targetMarketDraft" JSONB,
  "offerDraft" JSONB,
  "campaignDraft" JSONB,
  "productRecommendation" JSONB,
  "pricingQuoteId" TEXT,
  "proposalId" TEXT,
  "checkoutSessionId" TEXT,
  "subscriptionId" TEXT,
  "provisioningStatus" TEXT,
  "launchReadiness" "LaunchReadinessStatus" NOT NULL DEFAULT 'NOT_READY',
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIOnboardingSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AIOnboardingMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "structuredParts" JSONB,
  "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
  "agentType" "VegaLaunchAgentType",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIOnboardingMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LaunchAgentRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "onboardingSessionId" TEXT NOT NULL,
  "agentType" "VegaLaunchAgentType" NOT NULL,
  "status" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "structuredOutput" JSONB,
  "promptVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "cost" DOUBLE PRECISION,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LaunchAgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PricingQuote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "onboardingSessionId" TEXT NOT NULL,
  "productCode" "VegaProductCode" NOT NULL,
  "inputConfiguration" JSONB NOT NULL,
  "lineItems" JSONB NOT NULL,
  "totals" JSONB NOT NULL,
  "authorizedDiscounts" JSONB,
  "priceVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "PricingQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CommercialProposal" (
  "id" TEXT NOT NULL,
  "onboardingSessionId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "version" INTEGER NOT NULL,
  "productCode" "VegaProductCode" NOT NULL,
  "fulfillmentMode" TEXT NOT NULL,
  "campaignSummary" JSONB NOT NULL,
  "targetMarket" JSONB NOT NULL,
  "territory" JSONB NOT NULL,
  "offer" JSONB NOT NULL,
  "vegaResponsibilities" JSONB NOT NULL,
  "customerResponsibilities" JSONB NOT NULL,
  "allowances" JSONB NOT NULL,
  "setupScope" JSONB NOT NULL,
  "recurringScope" JSONB NOT NULL,
  "billingSummary" JSONB NOT NULL,
  "limitations" JSONB NOT NULL,
  "termsReference" TEXT NOT NULL,
  "pricingQuoteId" TEXT NOT NULL,
  "status" "CommercialProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommercialProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HumanReviewTask" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "onboardingSessionId" TEXT,
  "reason" TEXT NOT NULL,
  "status" "HumanReviewStatus" NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "payload" JSONB,
  "resolution" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HumanReviewTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIOnboardingSession_workspaceId_idx" ON "AIOnboardingSession"("workspaceId");
CREATE INDEX IF NOT EXISTS "AIOnboardingSession_status_idx" ON "AIOnboardingSession"("status");
CREATE INDEX IF NOT EXISTS "AIOnboardingSession_visitorId_idx" ON "AIOnboardingSession"("visitorId");
CREATE INDEX IF NOT EXISTS "AIOnboardingSession_lastActivityAt_idx" ON "AIOnboardingSession"("lastActivityAt");
CREATE INDEX IF NOT EXISTS "AIOnboardingMessage_sessionId_idx" ON "AIOnboardingMessage"("sessionId");
CREATE INDEX IF NOT EXISTS "AIOnboardingMessage_agentType_idx" ON "AIOnboardingMessage"("agentType");
CREATE INDEX IF NOT EXISTS "LaunchAgentRun_workspaceId_idx" ON "LaunchAgentRun"("workspaceId");
CREATE INDEX IF NOT EXISTS "LaunchAgentRun_onboardingSessionId_idx" ON "LaunchAgentRun"("onboardingSessionId");
CREATE INDEX IF NOT EXISTS "LaunchAgentRun_agentType_idx" ON "LaunchAgentRun"("agentType");
CREATE INDEX IF NOT EXISTS "LaunchAgentRun_status_idx" ON "LaunchAgentRun"("status");
CREATE INDEX IF NOT EXISTS "PricingQuote_workspaceId_idx" ON "PricingQuote"("workspaceId");
CREATE INDEX IF NOT EXISTS "PricingQuote_onboardingSessionId_idx" ON "PricingQuote"("onboardingSessionId");
CREATE INDEX IF NOT EXISTS "PricingQuote_productCode_idx" ON "PricingQuote"("productCode");
CREATE INDEX IF NOT EXISTS "PricingQuote_expiresAt_idx" ON "PricingQuote"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialProposal_onboardingSessionId_version_key" ON "CommercialProposal"("onboardingSessionId", "version");
CREATE INDEX IF NOT EXISTS "CommercialProposal_workspaceId_idx" ON "CommercialProposal"("workspaceId");
CREATE INDEX IF NOT EXISTS "CommercialProposal_pricingQuoteId_idx" ON "CommercialProposal"("pricingQuoteId");
CREATE INDEX IF NOT EXISTS "CommercialProposal_status_idx" ON "CommercialProposal"("status");
CREATE INDEX IF NOT EXISTS "HumanReviewTask_workspaceId_idx" ON "HumanReviewTask"("workspaceId");
CREATE INDEX IF NOT EXISTS "HumanReviewTask_onboardingSessionId_idx" ON "HumanReviewTask"("onboardingSessionId");
CREATE INDEX IF NOT EXISTS "HumanReviewTask_status_idx" ON "HumanReviewTask"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIOnboardingSession_workspaceId_fkey') THEN
    ALTER TABLE "AIOnboardingSession" ADD CONSTRAINT "AIOnboardingSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AIOnboardingMessage_sessionId_fkey') THEN
    ALTER TABLE "AIOnboardingMessage" ADD CONSTRAINT "AIOnboardingMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AIOnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LaunchAgentRun_workspaceId_fkey') THEN
    ALTER TABLE "LaunchAgentRun" ADD CONSTRAINT "LaunchAgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LaunchAgentRun_onboardingSessionId_fkey') THEN
    ALTER TABLE "LaunchAgentRun" ADD CONSTRAINT "LaunchAgentRun_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "AIOnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PricingQuote_workspaceId_fkey') THEN
    ALTER TABLE "PricingQuote" ADD CONSTRAINT "PricingQuote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PricingQuote_onboardingSessionId_fkey') THEN
    ALTER TABLE "PricingQuote" ADD CONSTRAINT "PricingQuote_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "AIOnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommercialProposal_workspaceId_fkey') THEN
    ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommercialProposal_onboardingSessionId_fkey') THEN
    ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "AIOnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommercialProposal_pricingQuoteId_fkey') THEN
    ALTER TABLE "CommercialProposal" ADD CONSTRAINT "CommercialProposal_pricingQuoteId_fkey" FOREIGN KEY ("pricingQuoteId") REFERENCES "PricingQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HumanReviewTask_workspaceId_fkey') THEN
    ALTER TABLE "HumanReviewTask" ADD CONSTRAINT "HumanReviewTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HumanReviewTask_onboardingSessionId_fkey') THEN
    ALTER TABLE "HumanReviewTask" ADD CONSTRAINT "HumanReviewTask_onboardingSessionId_fkey" FOREIGN KEY ("onboardingSessionId") REFERENCES "AIOnboardingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
