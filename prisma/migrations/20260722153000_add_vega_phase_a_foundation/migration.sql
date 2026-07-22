DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IntentSignalType') THEN
    CREATE TYPE "IntentSignalType" AS ENUM (
      'WEBSITE_VISIT','FORM_SUBMISSION','CONTENT_DOWNLOAD','EMAIL_OPEN','EMAIL_CLICK','EMAIL_REPLY','REPEAT_EMAIL_ENGAGEMENT',
      'LINKEDIN_REACTION','LINKEDIN_COMMENT','LINKEDIN_SHARE','LINKEDIN_PROFILE_ENGAGEMENT','LINKEDIN_REPEAT_ENGAGEMENT',
      'COMPETITOR_ENGAGEMENT','SOCIAL_MENTION','SOCIAL_FOLLOW','JOB_CHANGE','LEADERSHIP_CHANGE','COMPANY_HIRING','FUNDING_EVENT',
      'LOCATION_EXPANSION','NEW_SERVICE_LAUNCH','TECHNOLOGY_CHANGE','NEGATIVE_REVIEW_PATTERN','MISSED_CALL_REVIEW_SIGNAL',
      'SCHEDULING_COMPLAINT','SLOW_RESPONSE_COMPLAINT','WEBSITE_CONVERSION_GAP','WEBSITE_FORM_FAILURE','SEARCH_VISIBILITY_GAP',
      'GOOGLE_PROFILE_GAP','CRM_REACTIVATION_SIGNAL','PREVIOUS_OPPORTUNITY_REOPENED','REFERRAL_SIGNAL','MANUAL_OPERATOR_SIGNAL',
      'THIRD_PARTY_INTENT_SIGNAL'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaCapabilityGroup') THEN
    CREATE TYPE "VegaCapabilityGroup" AS ENUM ('VEGA_DISCOVER','VEGA_SIGNAL','VEGA_REACH','VEGA_ENGAGE','VEGA_CONVERT','VEGA_INTELLIGENCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialProfileType') THEN
    CREATE TYPE "SocialProfileType" AS ENUM ('CUSTOMER_TEAM_MEMBER','COMPETITOR','PARTNER','INDUSTRY_INFLUENCER','TARGET_ACCOUNT','INVESTOR','CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SocialSignalTier') THEN
    CREATE TYPE "SocialSignalTier" AS ENUM ('LOW','MEDIUM','HIGH','VERY_HIGH');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NextBestChannel') THEN
    CREATE TYPE "NextBestChannel" AS ENUM (
      'AUTO_EMAIL','APPROVAL_EMAIL','CALL_FIRST','PHONE_ASSIST_AFTER_EMAIL','WEBSITE_CONTACT_FORM','LINKEDIN_MANUAL_TASK',
      'SOCIAL_RESPONSE_TASK','SMS_INBOUND_ONLY','SMS_FOLLOW_UP','CHAT_ENGAGEMENT','WHATSAPP_INBOUND','RESEARCH_MORE',
      'NURTURE','SUPPRESS','NO_ACTION'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InboundConversationStatus') THEN
    CREATE TYPE "InboundConversationStatus" AS ENUM ('OPEN','AI_ACTIVE','HUMAN_TAKEOVER','QUALIFIED','BOOKING_OFFERED','BOOKED','CLOSED','SUPPRESSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReplyCategory') THEN
    CREATE TYPE "ReplyCategory" AS ENUM (
      'POSITIVE_INTEREST','PRICING_REQUEST','MEETING_REQUEST','INFORMATION_REQUEST','QUALIFICATION_ANSWER','REFERRAL',
      'CORRECT_CONTACT','OBJECTION','NOT_NOW','NURTURE','NOT_INTERESTED','WRONG_PERSON','UNSUBSCRIBE','STOP',
      'OUT_OF_OFFICE','SPAM','UNKNOWN'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationPolicyMode') THEN
    CREATE TYPE "ConversationPolicyMode" AS ENUM ('DRAFT_ONLY','HUMAN_APPROVAL','CONTROLLED_AUTO_REPLY','HUMAN_TAKEOVER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliverabilityState') THEN
    CREATE TYPE "DeliverabilityState" AS ENUM ('HEALTHY','CAUTION','RESTRICTED','STOP');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExperimentStatus') THEN
    CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT','PROPOSED','APPROVED','REJECTED','RUNNING','PAUSED','COMPLETED','INCONCLUSIVE','ROLLED_BACK');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "IntentSignal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "leadId" TEXT,
  "companyId" TEXT,
  "contactId" TEXT,
  "signalType" "IntentSignalType" NOT NULL,
  "sourceProvider" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "sourceUrl" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "normalizedPayload" JSONB,
  "summary" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "intentStrength" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "scoreImpact" INTEGER NOT NULL DEFAULT 0,
  "accountLevel" BOOLEAN NOT NULL DEFAULT false,
  "personLevel" BOOLEAN NOT NULL DEFAULT false,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "evidence" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntentSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialProfileWatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "profileUrl" TEXT NOT NULL,
  "profileType" "SocialProfileType" NOT NULL,
  "watchReason" TEXT NOT NULL,
  "associatedCompanyId" TEXT,
  "associatedContactId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialProfileWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialPostWatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "platform" TEXT NOT NULL,
  "postUrl" TEXT NOT NULL,
  "watchReason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialPostWatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialEngagementEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "postWatchId" TEXT,
  "platform" TEXT NOT NULL,
  "engagementType" TEXT NOT NULL,
  "engagerName" TEXT,
  "engagerTitle" TEXT,
  "engagerCompany" TEXT,
  "engagerProfileUrl" TEXT,
  "sourceUrl" TEXT,
  "rawPayload" JSONB,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialEngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SocialSignalMatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "leadId" TEXT,
  "tier" "SocialSignalTier" NOT NULL,
  "icpMatched" BOOLEAN NOT NULL DEFAULT false,
  "recommendedAction" "NextBestChannel" NOT NULL,
  "scoreImpact" INTEGER NOT NULL DEFAULT 0,
  "reasons" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialSignalMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LookalikeSeed" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT,
  "outcomeType" TEXT NOT NULL,
  "features" JSONB NOT NULL,
  "selectedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LookalikeSeed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LookalikeModelVersion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "seedRecords" JSONB NOT NULL,
  "featureWeights" JSONB NOT NULL,
  "exclusions" JSONB,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "LookalikeModelVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LocalMarketProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "primaryLocation" TEXT NOT NULL,
  "radiusMiles" INTEGER,
  "includedCities" JSONB,
  "excludedCities" JSONB,
  "includedCounties" JSONB,
  "travelConstraints" JSONB,
  "targetBusinessCategories" JSONB,
  "referralPartnerCategories" JSONB,
  "estimatedMarketSize" INTEGER,
  "activeBusinessCount" INTEGER,
  "reachableAccountEstimate" INTEGER,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "evidence" JSONB,
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocalMarketProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboundConversation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "leadId" TEXT,
  "contactId" TEXT,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalConversationId" TEXT,
  "status" "InboundConversationStatus" NOT NULL DEFAULT 'OPEN',
  "assignedAgent" TEXT,
  "assignedHuman" TEXT,
  "qualificationState" TEXT,
  "bookingState" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "InboundConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboundMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "leadId" TEXT,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "classification" "ReplyCategory",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QualificationPlaybook" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "industry" TEXT NOT NULL,
  "service" TEXT,
  "approvedQuestions" JSONB NOT NULL,
  "requiredFacts" JSONB NOT NULL,
  "disqualifiers" JSONB,
  "escalationRules" JSONB,
  "bookingThreshold" INTEGER NOT NULL DEFAULT 70,
  "approvalStatus" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualificationPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CommunicationPolicy" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "permittedChannels" JSONB NOT NULL,
  "channelPurpose" JSONB,
  "consentRequirements" JSONB,
  "firstTouchRules" JSONB,
  "followUpRules" JSONB,
  "quietHours" JSONB,
  "timezone" TEXT,
  "maximumTouches" INTEGER,
  "cooldownDays" INTEGER,
  "humanApprovalRules" JSONB,
  "automaticReplyRules" JSONB,
  "optOutLanguage" TEXT,
  "complianceNotes" TEXT,
  "approvedTemplates" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SalesPlaybook" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "industry" TEXT NOT NULL,
  "persona" TEXT NOT NULL,
  "callOpeners" JSONB NOT NULL,
  "qualifyingQuestions" JSONB NOT NULL,
  "objections" JSONB,
  "approvedResponses" JSONB,
  "bookingAsk" TEXT,
  "followUpLanguage" JSONB,
  "prohibitedClaims" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SourceQualityProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "provider" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "segment" TEXT,
  "recordsReturned" INTEGER NOT NULL DEFAULT 0,
  "validBusinessRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "verifiedEmailRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "phoneAvailability" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "decisionMakerAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deliveredRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hardBounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "replyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reachedContactRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "conversationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "meetingRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costPerValidRecord" DOUBLE PRECISION,
  "costPerQualifiedLead" DOUBLE PRECISION,
  "costPerConversation" DOUBLE PRECISION,
  "costPerMeeting" DOUBLE PRECISION,
  "score" INTEGER NOT NULL DEFAULT 50,
  "state" TEXT NOT NULL DEFAULT 'insufficient_sample',
  "sampleSize" INTEGER NOT NULL DEFAULT 0,
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceQualityProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExperimentProposal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "hypothesis" TEXT NOT NULL,
  "currentConfiguration" JSONB NOT NULL,
  "proposedConfiguration" JSONB NOT NULL,
  "targetMetric" TEXT NOT NULL,
  "guardrailMetrics" JSONB,
  "sampleSize" INTEGER NOT NULL,
  "duration" INTEGER NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "recommendationReason" TEXT NOT NULL,
  "supportingEvidence" JSONB,
  "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
  "approvedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExperimentProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgencyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyMembership" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "userEmail" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyClientWorkspace" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyClientWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgencyBrandConfiguration" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT,
  "whiteLabelEnabled" BOOLEAN NOT NULL DEFAULT false,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "AgencyBrandConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IntentSignal_workspaceId_idempotencyKey_key" ON "IntentSignal"("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "IntentSignal_workspaceId_signalType_idx" ON "IntentSignal"("workspaceId", "signalType");
CREATE INDEX IF NOT EXISTS "IntentSignal_workspaceId_observedAt_idx" ON "IntentSignal"("workspaceId", "observedAt");
CREATE INDEX IF NOT EXISTS "IntentSignal_leadId_idx" ON "IntentSignal"("leadId");
CREATE INDEX IF NOT EXISTS "IntentSignal_companyId_idx" ON "IntentSignal"("companyId");
CREATE INDEX IF NOT EXISTS "IntentSignal_contactId_idx" ON "IntentSignal"("contactId");
CREATE INDEX IF NOT EXISTS "SocialProfileWatch_workspaceId_platform_idx" ON "SocialProfileWatch"("workspaceId", "platform");
CREATE INDEX IF NOT EXISTS "SocialProfileWatch_workspaceId_active_idx" ON "SocialProfileWatch"("workspaceId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialPostWatch_workspaceId_platform_postUrl_key" ON "SocialPostWatch"("workspaceId", "platform", "postUrl");
CREATE INDEX IF NOT EXISTS "SocialPostWatch_workspaceId_active_idx" ON "SocialPostWatch"("workspaceId", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "SocialEngagementEvent_workspaceId_idempotencyKey_key" ON "SocialEngagementEvent"("workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "SocialEngagementEvent_workspaceId_platform_idx" ON "SocialEngagementEvent"("workspaceId", "platform");
CREATE INDEX IF NOT EXISTS "SocialEngagementEvent_workspaceId_observedAt_idx" ON "SocialEngagementEvent"("workspaceId", "observedAt");
CREATE INDEX IF NOT EXISTS "SocialSignalMatch_workspaceId_tier_idx" ON "SocialSignalMatch"("workspaceId", "tier");
CREATE INDEX IF NOT EXISTS "SocialSignalMatch_leadId_idx" ON "SocialSignalMatch"("leadId");
CREATE INDEX IF NOT EXISTS "LookalikeSeed_workspaceId_outcomeType_idx" ON "LookalikeSeed"("workspaceId", "outcomeType");
CREATE UNIQUE INDEX IF NOT EXISTS "LookalikeModelVersion_workspaceId_version_key" ON "LookalikeModelVersion"("workspaceId", "version");
CREATE INDEX IF NOT EXISTS "LookalikeModelVersion_workspaceId_active_idx" ON "LookalikeModelVersion"("workspaceId", "active");
CREATE INDEX IF NOT EXISTS "LocalMarketProfile_workspaceId_primaryLocation_idx" ON "LocalMarketProfile"("workspaceId", "primaryLocation");
CREATE INDEX IF NOT EXISTS "LocalMarketProfile_campaignId_idx" ON "LocalMarketProfile"("campaignId");
CREATE INDEX IF NOT EXISTS "InboundConversation_workspaceId_status_idx" ON "InboundConversation"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "InboundConversation_leadId_idx" ON "InboundConversation"("leadId");
CREATE INDEX IF NOT EXISTS "InboundConversation_contactId_idx" ON "InboundConversation"("contactId");
CREATE INDEX IF NOT EXISTS "InboundMessage_conversationId_idx" ON "InboundMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "InboundMessage_leadId_idx" ON "InboundMessage"("leadId");
CREATE INDEX IF NOT EXISTS "InboundMessage_classification_idx" ON "InboundMessage"("classification");
CREATE INDEX IF NOT EXISTS "QualificationPlaybook_workspaceId_industry_idx" ON "QualificationPlaybook"("workspaceId", "industry");
CREATE INDEX IF NOT EXISTS "QualificationPlaybook_campaignId_idx" ON "QualificationPlaybook"("campaignId");
CREATE INDEX IF NOT EXISTS "CommunicationPolicy_workspaceId_enabled_idx" ON "CommunicationPolicy"("workspaceId", "enabled");
CREATE INDEX IF NOT EXISTS "CommunicationPolicy_campaignId_idx" ON "CommunicationPolicy"("campaignId");
CREATE INDEX IF NOT EXISTS "SalesPlaybook_workspaceId_industry_idx" ON "SalesPlaybook"("workspaceId", "industry");
CREATE INDEX IF NOT EXISTS "SalesPlaybook_campaignId_idx" ON "SalesPlaybook"("campaignId");
CREATE UNIQUE INDEX IF NOT EXISTS "SourceQualityProfile_workspaceId_campaignId_provider_sourceType_segment_key" ON "SourceQualityProfile"("workspaceId", "campaignId", "provider", "sourceType", "segment");
CREATE INDEX IF NOT EXISTS "SourceQualityProfile_workspaceId_provider_idx" ON "SourceQualityProfile"("workspaceId", "provider");
CREATE INDEX IF NOT EXISTS "SourceQualityProfile_campaignId_idx" ON "SourceQualityProfile"("campaignId");
CREATE INDEX IF NOT EXISTS "ExperimentProposal_workspaceId_status_idx" ON "ExperimentProposal"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "ExperimentProposal_campaignId_idx" ON "ExperimentProposal"("campaignId");
CREATE INDEX IF NOT EXISTS "AgencyMembership_agencyId_idx" ON "AgencyMembership"("agencyId");
CREATE INDEX IF NOT EXISTS "AgencyMembership_workspaceId_idx" ON "AgencyMembership"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyClientWorkspace_agencyId_workspaceId_key" ON "AgencyClientWorkspace"("agencyId", "workspaceId");
CREATE INDEX IF NOT EXISTS "AgencyClientWorkspace_workspaceId_idx" ON "AgencyClientWorkspace"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyBrandConfiguration_agencyId_key" ON "AgencyBrandConfiguration"("agencyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntentSignal_workspaceId_fkey') THEN
    ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntentSignal_campaignId_fkey') THEN
    ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntentSignal_leadId_fkey') THEN
    ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntentSignal_companyId_fkey') THEN
    ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntentSignal_contactId_fkey') THEN
    ALTER TABLE "IntentSignal" ADD CONSTRAINT "IntentSignal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundMessage_conversationId_fkey') THEN
    ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "InboundConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialProfileWatch_workspaceId_fkey') THEN
    ALTER TABLE "SocialProfileWatch" ADD CONSTRAINT "SocialProfileWatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialProfileWatch_associatedCompanyId_fkey') THEN
    ALTER TABLE "SocialProfileWatch" ADD CONSTRAINT "SocialProfileWatch_associatedCompanyId_fkey" FOREIGN KEY ("associatedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialProfileWatch_associatedContactId_fkey') THEN
    ALTER TABLE "SocialProfileWatch" ADD CONSTRAINT "SocialProfileWatch_associatedContactId_fkey" FOREIGN KEY ("associatedContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPostWatch_workspaceId_fkey') THEN
    ALTER TABLE "SocialPostWatch" ADD CONSTRAINT "SocialPostWatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialPostWatch_campaignId_fkey') THEN
    ALTER TABLE "SocialPostWatch" ADD CONSTRAINT "SocialPostWatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialEngagementEvent_workspaceId_fkey') THEN
    ALTER TABLE "SocialEngagementEvent" ADD CONSTRAINT "SocialEngagementEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialEngagementEvent_postWatchId_fkey') THEN
    ALTER TABLE "SocialEngagementEvent" ADD CONSTRAINT "SocialEngagementEvent_postWatchId_fkey" FOREIGN KEY ("postWatchId") REFERENCES "SocialPostWatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialSignalMatch_workspaceId_fkey') THEN
    ALTER TABLE "SocialSignalMatch" ADD CONSTRAINT "SocialSignalMatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialSignalMatch_eventId_fkey') THEN
    ALTER TABLE "SocialSignalMatch" ADD CONSTRAINT "SocialSignalMatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SocialEngagementEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SocialSignalMatch_leadId_fkey') THEN
    ALTER TABLE "SocialSignalMatch" ADD CONSTRAINT "SocialSignalMatch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LookalikeSeed_workspaceId_fkey') THEN
    ALTER TABLE "LookalikeSeed" ADD CONSTRAINT "LookalikeSeed_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LookalikeSeed_leadId_fkey') THEN
    ALTER TABLE "LookalikeSeed" ADD CONSTRAINT "LookalikeSeed_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LookalikeModelVersion_workspaceId_fkey') THEN
    ALTER TABLE "LookalikeModelVersion" ADD CONSTRAINT "LookalikeModelVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocalMarketProfile_workspaceId_fkey') THEN
    ALTER TABLE "LocalMarketProfile" ADD CONSTRAINT "LocalMarketProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocalMarketProfile_campaignId_fkey') THEN
    ALTER TABLE "LocalMarketProfile" ADD CONSTRAINT "LocalMarketProfile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundConversation_workspaceId_fkey') THEN
    ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundConversation_campaignId_fkey') THEN
    ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundConversation_leadId_fkey') THEN
    ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundConversation_contactId_fkey') THEN
    ALTER TABLE "InboundConversation" ADD CONSTRAINT "InboundConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboundMessage_leadId_fkey') THEN
    ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualificationPlaybook_workspaceId_fkey') THEN
    ALTER TABLE "QualificationPlaybook" ADD CONSTRAINT "QualificationPlaybook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualificationPlaybook_campaignId_fkey') THEN
    ALTER TABLE "QualificationPlaybook" ADD CONSTRAINT "QualificationPlaybook_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationPolicy_workspaceId_fkey') THEN
    ALTER TABLE "CommunicationPolicy" ADD CONSTRAINT "CommunicationPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationPolicy_campaignId_fkey') THEN
    ALTER TABLE "CommunicationPolicy" ADD CONSTRAINT "CommunicationPolicy_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesPlaybook_workspaceId_fkey') THEN
    ALTER TABLE "SalesPlaybook" ADD CONSTRAINT "SalesPlaybook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalesPlaybook_campaignId_fkey') THEN
    ALTER TABLE "SalesPlaybook" ADD CONSTRAINT "SalesPlaybook_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SourceQualityProfile_workspaceId_fkey') THEN
    ALTER TABLE "SourceQualityProfile" ADD CONSTRAINT "SourceQualityProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SourceQualityProfile_campaignId_fkey') THEN
    ALTER TABLE "SourceQualityProfile" ADD CONSTRAINT "SourceQualityProfile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExperimentProposal_workspaceId_fkey') THEN
    ALTER TABLE "ExperimentProposal" ADD CONSTRAINT "ExperimentProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExperimentProposal_campaignId_fkey') THEN
    ALTER TABLE "ExperimentProposal" ADD CONSTRAINT "ExperimentProposal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyMembership_agencyId_fkey') THEN
    ALTER TABLE "AgencyMembership" ADD CONSTRAINT "AgencyMembership_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "AgencyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyMembership_workspaceId_fkey') THEN
    ALTER TABLE "AgencyMembership" ADD CONSTRAINT "AgencyMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyClientWorkspace_agencyId_fkey') THEN
    ALTER TABLE "AgencyClientWorkspace" ADD CONSTRAINT "AgencyClientWorkspace_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "AgencyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyClientWorkspace_workspaceId_fkey') THEN
    ALTER TABLE "AgencyClientWorkspace" ADD CONSTRAINT "AgencyClientWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgencyBrandConfiguration_agencyId_fkey') THEN
    ALTER TABLE "AgencyBrandConfiguration" ADD CONSTRAINT "AgencyBrandConfiguration_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "AgencyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
