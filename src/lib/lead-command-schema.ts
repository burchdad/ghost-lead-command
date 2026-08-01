import { getPrisma } from "@/lib/prisma";

const ensureByWorkspace = new Map<string, Promise<void>>();

const workspaceTables = [
  "Company",
  "Contact",
  "Lead",
  "Campaign",
  "SuppressionRecord",
  "OutreachQueueItem",
  "Reply",
  "IntegrationHealth",
  "Proposal",
  "AgentTemplate",
  "PromptTemplate",
  "AutomationEvent",
  "BookingTask",
  "SequenceStep",
];

export function ensureLeadCommandCoreSchema(workspaceId: string) {
  const key = workspaceId || "default";
  if (!ensureByWorkspace.has(key)) {
    ensureByWorkspace.set(
      key,
      createLeadCommandCoreSchema(workspaceId).catch((error) => {
        ensureByWorkspace.delete(key);
        throw error;
      }),
    );
  }

  return ensureByWorkspace.get(key);
}

async function createLeadCommandCoreSchema(workspaceId: string) {
  const prisma = getPrisma();
  const escapedWorkspaceId = workspaceId.replace(/'/g, "''");

  for (const table of workspaceTables) {
    const escapedTable = table.replace(/"/g, '""');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF to_regclass('public."${escapedTable}"') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = '${escapedTable}'
              AND column_name = 'workspaceId'
          ) THEN
            ALTER TABLE "${escapedTable}" ADD COLUMN "workspaceId" TEXT;
          END IF;

          UPDATE "${escapedTable}"
          SET "workspaceId" = '${escapedWorkspaceId}'
          WHERE "workspaceId" IS NULL;

          CREATE INDEX IF NOT EXISTS "${escapedTable}_workspaceId_idx" ON "${escapedTable}"("workspaceId");
        END IF;
      END $$;
    `);
  }
}
