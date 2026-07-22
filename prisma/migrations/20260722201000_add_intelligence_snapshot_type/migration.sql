CREATE TYPE "IntelligenceSnapshotType" AS ENUM (
  'QUALIFICATION',
  'SIGNAL_UPDATE',
  'DECISION',
  'PRE_EXECUTION',
  'DELIVERY_EVENT',
  'ENGAGEMENT_EVENT',
  'REPLY',
  'CALL_OUTCOME',
  'MEETING_EVENT',
  'MANUAL_OVERRIDE',
  'POLICY_CHANGE',
  'OUTCOME'
);

ALTER TABLE "OpportunityIntelligenceSnapshot"
ADD COLUMN "snapshotType" "IntelligenceSnapshotType" NOT NULL DEFAULT 'DECISION';

UPDATE "OpportunityIntelligenceSnapshot"
SET "snapshotType" = CASE
  WHEN "triggerType" = 'lead_qualified' THEN 'QUALIFICATION'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'new_intent_signal' THEN 'SIGNAL_UPDATE'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'outreach_generated' THEN 'PRE_EXECUTION'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'send_decision' THEN 'DECISION'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'email_event' THEN 'DELIVERY_EVENT'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'reply_received' THEN 'REPLY'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'call_outcome' THEN 'CALL_OUTCOME'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'meeting_requested' THEN 'MEETING_EVENT'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'meeting_booked' THEN 'MEETING_EVENT'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'campaign_policy_change' THEN 'POLICY_CHANGE'::"IntelligenceSnapshotType"
  WHEN "triggerType" = 'manual_override' THEN 'MANUAL_OVERRIDE'::"IntelligenceSnapshotType"
  ELSE 'DECISION'::"IntelligenceSnapshotType"
END;

CREATE INDEX "OpportunityIntelligenceSnapshot_workspaceId_snapshotType_createdAt_idx"
ON "OpportunityIntelligenceSnapshot"("workspaceId", "snapshotType", "createdAt");
