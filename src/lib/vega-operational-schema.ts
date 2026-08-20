import type { PrismaClient } from "@prisma/client";

let ensurePromise: Promise<void> | null = null;

export function ensureVegaOperationalSchema(prisma: PrismaClient) {
  ensurePromise ||= ensureSchema(prisma);
  return ensurePromise;
}

async function ensureSchema(prisma: PrismaClient) {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

const statements = [
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaOperationalReadinessState') THEN
      CREATE TYPE "VegaOperationalReadinessState" AS ENUM ('NOT_CONFIGURED','CALIBRATING','APPROVAL_MODE','MANAGED_AUTONOMY','BLOCKED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VegaCalibrationVerdict') THEN
      CREATE TYPE "VegaCalibrationVerdict" AS ENUM ('GOOD','BAD_FIT','WRONG_PERSON','WRONG_COMPANY','NEEDS_RESEARCH');
    END IF;
  END $$;`,
  `CREATE TABLE IF NOT EXISTS "VegaOperationalReadiness" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "state" "VegaOperationalReadinessState" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "salesProfile" JSONB, "icps" JSONB, "offers" JSONB, "territories" JSONB,
    "qualificationRules" JSONB, "teamResponsibilities" JSONB, "outreachPolicy" JSONB,
    "integrationSnapshot" JSONB, "healthSnapshot" JSONB, "blockerSnapshot" JSONB,
    "calibrationTarget" INTEGER NOT NULL DEFAULT 10, "calibrationReviewed" INTEGER NOT NULL DEFAULT 0,
    "calibrationScore" INTEGER NOT NULL DEFAULT 0, "autonomyRequested" BOOLEAN NOT NULL DEFAULT false,
    "policyVersion" TEXT NOT NULL DEFAULT 'vega-operator-v1', "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VegaOperationalReadiness_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VegaOperationalReadiness_workspaceId_key" ON "VegaOperationalReadiness"("workspaceId");`,
  `CREATE INDEX IF NOT EXISTS "VegaOperationalReadiness_state_idx" ON "VegaOperationalReadiness"("state");`,
  `CREATE TABLE IF NOT EXISTS "VegaCalibrationItem" (
    "id" TEXT NOT NULL, "readinessId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "leadId" TEXT,
    "snapshot" JSONB NOT NULL, "verdict" "VegaCalibrationVerdict", "notes" TEXT, "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3), "memoryEvidence" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "VegaCalibrationItem_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VegaCalibrationItem_readinessId_leadId_key" ON "VegaCalibrationItem"("readinessId", "leadId");`,
  `CREATE INDEX IF NOT EXISTS "VegaCalibrationItem_workspaceId_verdict_idx" ON "VegaCalibrationItem"("workspaceId", "verdict");`,
  `CREATE INDEX IF NOT EXISTS "VegaCalibrationItem_readinessId_reviewedAt_idx" ON "VegaCalibrationItem"("readinessId", "reviewedAt");`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaOperationalReadiness_workspaceId_fkey') THEN
      ALTER TABLE "VegaOperationalReadiness" ADD CONSTRAINT "VegaOperationalReadiness_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaCalibrationItem_readinessId_fkey') THEN
      ALTER TABLE "VegaCalibrationItem" ADD CONSTRAINT "VegaCalibrationItem_readinessId_fkey"
      FOREIGN KEY ("readinessId") REFERENCES "VegaOperationalReadiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VegaCalibrationItem_workspaceId_fkey') THEN
      ALTER TABLE "VegaCalibrationItem" ADD CONSTRAINT "VegaCalibrationItem_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
  END $$;`,
];
