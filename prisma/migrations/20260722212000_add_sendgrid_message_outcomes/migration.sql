CREATE TYPE "SendGridMessageOutcomeStatus" AS ENUM (
  'PROCESSED',
  'DELIVERED',
  'HARD_BOUNCE',
  'SOFT_BOUNCE',
  'DROPPED',
  'BLOCKED',
  'DEFERRED',
  'SPAM_COMPLAINT',
  'UNSUBSCRIBED',
  'UNKNOWN'
);

CREATE TYPE "SenderGovernorState" AS ENUM (
  'INSUFFICIENT_DATA',
  'HEALTHY',
  'CAUTION',
  'RESTRICTED',
  'RECOVERY',
  'STOP'
);

CREATE TABLE "SendGridEventLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'sendgrid',
  "providerEventId" TEXT,
  "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventTimestamp" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SendGridEventLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SendGridMessageOutcome" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT,
  "campaignId" TEXT,
  "queueItemId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'sendgrid',
  "providerMessageId" TEXT NOT NULL,
  "senderEmail" TEXT,
  "senderDomain" TEXT,
  "sendingIdentity" TEXT,
  "sourceProvider" TEXT,
  "campaignName" TEXT,
  "recipientEmail" TEXT,
  "finalOutcome" "SendGridMessageOutcomeStatus" NOT NULL DEFAULT 'UNKNOWN',
  "final" BOOLEAN NOT NULL DEFAULT false,
  "severity" INTEGER NOT NULL DEFAULT 0,
  "lastEventType" TEXT,
  "firstEventAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "eventCount" INTEGER NOT NULL DEFAULT 0,
  "rawEvents" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SendGridMessageOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SendGridEventLog_workspaceId_provider_providerEventId_key" ON "SendGridEventLog"("workspaceId", "provider", "providerEventId");
CREATE INDEX "SendGridEventLog_workspaceId_providerMessageId_idx" ON "SendGridEventLog"("workspaceId", "providerMessageId");
CREATE INDEX "SendGridEventLog_workspaceId_eventType_createdAt_idx" ON "SendGridEventLog"("workspaceId", "eventType", "createdAt");

CREATE UNIQUE INDEX "SendGridMessageOutcome_workspaceId_provider_providerMessageId_key" ON "SendGridMessageOutcome"("workspaceId", "provider", "providerMessageId");
CREATE INDEX "SendGridMessageOutcome_workspaceId_senderEmail_finalOutcome_last_idx" ON "SendGridMessageOutcome"("workspaceId", "senderEmail", "finalOutcome", "lastEventAt");
CREATE INDEX "SendGridMessageOutcome_workspaceId_campaignName_finalOutcome_lastE_idx" ON "SendGridMessageOutcome"("workspaceId", "campaignName", "finalOutcome", "lastEventAt");
CREATE INDEX "SendGridMessageOutcome_workspaceId_sourceProvider_finalOutcome_last_idx" ON "SendGridMessageOutcome"("workspaceId", "sourceProvider", "finalOutcome", "lastEventAt");
CREATE INDEX "SendGridMessageOutcome_workspaceId_senderDomain_finalOutcome_lastE_idx" ON "SendGridMessageOutcome"("workspaceId", "senderDomain", "finalOutcome", "lastEventAt");

ALTER TABLE "SendGridEventLog" ADD CONSTRAINT "SendGridEventLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendGridEventLog" ADD CONSTRAINT "SendGridEventLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SendGridMessageOutcome" ADD CONSTRAINT "SendGridMessageOutcome_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SendGridMessageOutcome" ADD CONSTRAINT "SendGridMessageOutcome_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
