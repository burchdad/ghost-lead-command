ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "domain" TEXT;

ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "source" TEXT;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "priority" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "leadScore" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "tags" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "crmSyncStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "crmSyncedAt" TIMESTAMP(3);

ALTER TABLE "Interaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE TABLE IF NOT EXISTS "WaitlistSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "crmContactId" TEXT,
    "crmLeadId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Company_domain_idx" ON "Company"("domain");
CREATE INDEX IF NOT EXISTS "Lead_crmSyncStatus_idx" ON "Lead"("crmSyncStatus");
CREATE INDEX IF NOT EXISTS "WaitlistSubmission_workspaceId_idx" ON "WaitlistSubmission"("workspaceId");
CREATE INDEX IF NOT EXISTS "WaitlistSubmission_email_idx" ON "WaitlistSubmission"("email");
CREATE INDEX IF NOT EXISTS "WaitlistSubmission_status_idx" ON "WaitlistSubmission"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WaitlistSubmission_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WaitlistSubmission"
    ADD CONSTRAINT "WaitlistSubmission_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
