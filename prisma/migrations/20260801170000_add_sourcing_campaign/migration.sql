CREATE TABLE IF NOT EXISTS "SourcingCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "location" TEXT,
  "industries" TEXT,
  "titles" TEXT,
  "dailyLimit" INTEGER NOT NULL DEFAULT 25,
  "scoreThreshold" INTEGER NOT NULL DEFAULT 70,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourcingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SourcingCampaign_workspaceId_idx" ON "SourcingCampaign"("workspaceId");
CREATE INDEX IF NOT EXISTS "SourcingCampaign_status_idx" ON "SourcingCampaign"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SourcingCampaign_workspaceId_fkey') THEN
    ALTER TABLE "SourcingCampaign"
      ADD CONSTRAINT "SourcingCampaign_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
