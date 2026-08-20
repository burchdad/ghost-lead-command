DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaOperationalReadinessState') THEN
    CREATE TYPE "VegaOperationalReadinessState" AS ENUM (
      'NOT_CONFIGURED',
      'CALIBRATING',
      'APPROVAL_MODE',
      'MANAGED_AUTONOMY',
      'BLOCKED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaCalibrationVerdict') THEN
    CREATE TYPE "VegaCalibrationVerdict" AS ENUM (
      'GOOD',
      'BAD_FIT',
      'WRONG_PERSON',
      'WRONG_COMPANY',
      'NEEDS_RESEARCH'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "VegaOperationalReadiness" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "state" "VegaOperationalReadinessState" NOT NULL DEFAULT 'NOT_CONFIGURED',
  "salesProfile" JSONB,
  "icps" JSONB,
  "offers" JSONB,
  "territories" JSONB,
  "qualificationRules" JSONB,
  "teamResponsibilities" JSONB,
  "outreachPolicy" JSONB,
  "integrationSnapshot" JSONB,
  "healthSnapshot" JSONB,
  "blockerSnapshot" JSONB,
  "calibrationTarget" INTEGER NOT NULL DEFAULT 10,
  "calibrationReviewed" INTEGER NOT NULL DEFAULT 0,
  "calibrationScore" INTEGER NOT NULL DEFAULT 0,
  "autonomyRequested" BOOLEAN NOT NULL DEFAULT false,
  "policyVersion" TEXT NOT NULL DEFAULT 'vega-operator-v1',
  "lastEvaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VegaOperationalReadiness_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VegaOperationalReadiness_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "VegaCalibrationItem" (
  "id" TEXT NOT NULL,
  "readinessId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT,
  "snapshot" JSONB NOT NULL,
  "verdict" "VegaCalibrationVerdict",
  "notes" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "memoryEvidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VegaCalibrationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VegaCalibrationItem_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "VegaOperationalReadiness"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VegaCalibrationItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "VegaOperationalReadiness_workspaceId_key" ON "VegaOperationalReadiness"("workspaceId");
CREATE INDEX IF NOT EXISTS "VegaOperationalReadiness_state_idx" ON "VegaOperationalReadiness"("state");
CREATE UNIQUE INDEX IF NOT EXISTS "VegaCalibrationItem_readinessId_leadId_key" ON "VegaCalibrationItem"("readinessId", "leadId");
CREATE INDEX IF NOT EXISTS "VegaCalibrationItem_workspaceId_verdict_idx" ON "VegaCalibrationItem"("workspaceId", "verdict");
CREATE INDEX IF NOT EXISTS "VegaCalibrationItem_readinessId_reviewedAt_idx" ON "VegaCalibrationItem"("readinessId", "reviewedAt");

-- Some production databases still carry a legacy organizationId constraint from
-- the pre-workspace schema. Vega is workspace-scoped now, so retain the column for
-- compatibility but remove the invalid write requirement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SuppressionRecord'
      AND column_name = 'organizationId'
  ) THEN
    ALTER TABLE "SuppressionRecord" ALTER COLUMN "organizationId" DROP NOT NULL;
  END IF;
END $$;
