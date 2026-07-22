CREATE TABLE "OpportunityIntelligenceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "intelligenceVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "leadScore" INTEGER NOT NULL,
    "intentScore" INTEGER NOT NULL,
    "trustScore" INTEGER NOT NULL,
    "contactConfidence" INTEGER NOT NULL,
    "sourceQuality" INTEGER NOT NULL,
    "messageQuality" INTEGER,
    "campaignFit" INTEGER NOT NULL,
    "senderHealth" INTEGER NOT NULL,
    "conversationProbability" DOUBLE PRECISION,
    "meetingProbability" DOUBLE PRECISION,
    "closeProbability" DOUBLE PRECISION,
    "bounceProbability" DOUBLE PRECISION,
    "recommendedChannel" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "decisionLane" TEXT NOT NULL,
    "overallConfidence" INTEGER NOT NULL,
    "explanation" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityIntelligenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpportunityIntelligenceSnapshot_workspaceId_leadId_createdAt_idx" ON "OpportunityIntelligenceSnapshot"("workspaceId", "leadId", "createdAt");
CREATE INDEX "OpportunityIntelligenceSnapshot_workspaceId_campaignId_createdAt_idx" ON "OpportunityIntelligenceSnapshot"("workspaceId", "campaignId", "createdAt");

ALTER TABLE "OpportunityIntelligenceSnapshot" ADD CONSTRAINT "OpportunityIntelligenceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpportunityIntelligenceSnapshot" ADD CONSTRAINT "OpportunityIntelligenceSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
