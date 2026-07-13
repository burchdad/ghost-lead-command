ALTER TABLE "Company" ADD COLUMN "domain" TEXT;

ALTER TABLE "Contact" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "title" TEXT;
ALTER TABLE "Contact" ADD COLUMN "source" TEXT;

ALTER TABLE "Lead" ADD COLUMN "title" TEXT;
ALTER TABLE "Lead" ADD COLUMN "description" TEXT;
ALTER TABLE "Lead" ADD COLUMN "priority" TEXT;
ALTER TABLE "Lead" ADD COLUMN "leadScore" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "tags" JSONB;
ALTER TABLE "Lead" ADD COLUMN "customFields" JSONB;
ALTER TABLE "Lead" ADD COLUMN "crmSyncStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Lead" ADD COLUMN "crmSyncedAt" TIMESTAMP(3);

ALTER TABLE "Interaction" ADD COLUMN "metadata" JSONB;

CREATE TABLE "WaitlistSubmission" (
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

CREATE INDEX "Company_domain_idx" ON "Company"("domain");
CREATE INDEX "Lead_crmSyncStatus_idx" ON "Lead"("crmSyncStatus");
CREATE INDEX "WaitlistSubmission_workspaceId_idx" ON "WaitlistSubmission"("workspaceId");
CREATE INDEX "WaitlistSubmission_email_idx" ON "WaitlistSubmission"("email");
CREATE INDEX "WaitlistSubmission_status_idx" ON "WaitlistSubmission"("status");

ALTER TABLE "WaitlistSubmission" ADD CONSTRAINT "WaitlistSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
