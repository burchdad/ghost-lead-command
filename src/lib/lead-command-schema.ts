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
  "SourcingCampaign",
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

  await createMissingCoreTables();
  await addMissingCoreColumns();

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

  await createCoreIndexes();
}

async function addMissingCoreColumns() {
  const prisma = getPrisma();

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Company"
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Unknown Company',
      ADD COLUMN IF NOT EXISTS "niche" TEXT NOT NULL DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS "website" TEXT,
      ADD COLUMN IF NOT EXISTS "domain" TEXT,
      ADD COLUMN IF NOT EXISTS "crmSource" TEXT,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Contact"
      ADD COLUMN IF NOT EXISTS "companyId" TEXT,
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Unknown Contact',
      ADD COLUMN IF NOT EXISTS "firstName" TEXT,
      ADD COLUMN IF NOT EXISTS "lastName" TEXT,
      ADD COLUMN IF NOT EXISTS "email" TEXT,
      ADD COLUMN IF NOT EXISTS "phone" TEXT,
      ADD COLUMN IF NOT EXISTS "role" TEXT,
      ADD COLUMN IF NOT EXISTS "title" TEXT,
      ADD COLUMN IF NOT EXISTS "source" TEXT,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Lead"
      ADD COLUMN IF NOT EXISTS "companyId" TEXT,
      ADD COLUMN IF NOT EXISTS "contactId" TEXT,
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Unknown Contact',
      ADD COLUMN IF NOT EXISTS "title" TEXT,
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "companyName" TEXT NOT NULL DEFAULT 'Unknown Company',
      ADD COLUMN IF NOT EXISTS "niche" TEXT NOT NULL DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT 'Imported',
      ADD COLUMN IF NOT EXISTS "priority" TEXT,
      ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "leadScore" INTEGER,
      ADD COLUMN IF NOT EXISTS "value" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS "lastTouch" TEXT NOT NULL DEFAULT 'Never',
      ADD COLUMN IF NOT EXISTS "nextAction" TEXT NOT NULL DEFAULT 'Review and follow up.',
      ADD COLUMN IF NOT EXISTS "tags" JSONB,
      ADD COLUMN IF NOT EXISTS "customFields" JSONB,
      ADD COLUMN IF NOT EXISTS "crmSyncStatus" TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "crmSyncedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Opportunity"
      ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL DEFAULT 'unassigned-company',
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Lead Command opportunity',
      ADD COLUMN IF NOT EXISTS "stage" TEXT NOT NULL DEFAULT 'Imported',
      ADD COLUMN IF NOT EXISTS "value" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "probability" INTEGER NOT NULL DEFAULT 50,
      ADD COLUMN IF NOT EXISTS "closeDate" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Interaction"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "contactId" TEXT,
      ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'internal',
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "classification" TEXT,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Campaign"
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Lead Command campaign',
      ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'revival',
      ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'Lead Command audience',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "replyTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "bookingTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CampaignStep"
      ADD COLUMN IF NOT EXISTS "campaignId" TEXT,
      ADD COLUMN IF NOT EXISTS "dayOffset" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SourcingCampaign"
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Lead Command source play',
      ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'google-maps',
      ADD COLUMN IF NOT EXISTS "query" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "location" TEXT,
      ADD COLUMN IF NOT EXISTS "industries" TEXT,
      ADD COLUMN IF NOT EXISTS "titles" TEXT,
      ADD COLUMN IF NOT EXISTS "dailyLimit" INTEGER NOT NULL DEFAULT 25,
      ADD COLUMN IF NOT EXISTS "scoreThreshold" INTEGER NOT NULL DEFAULT 70,
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "lastRunAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SuppressionRecord"
      ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "value" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT 'Suppressed',
      ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "OutreachQueueItem"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'sendgrid',
      ADD COLUMN IF NOT EXISTS "subject" TEXT,
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "reason" TEXT,
      ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Reply"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "from" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "IntegrationHealth"
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS "detail" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Proposal"
      ADD COLUMN IF NOT EXISTS "opportunityId" TEXT,
      ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Lead Command proposal',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "setupFee" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "monthlyFee" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "revSharePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "summary" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AgentTemplate"
      ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Lead Command Agent',
      ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS "useCase" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "price" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "demoScript" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "PromptTemplate"
      ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Prompt',
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AutomationEvent"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Automation event',
      ADD COLUMN IF NOT EXISTS "detail" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'done',
      ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS "payload" JSONB,
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BookingTask"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT,
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'blocked',
      ADD COLUMN IF NOT EXISTS "meetingTitle" TEXT NOT NULL DEFAULT 'Lead Command meeting',
      ADD COLUMN IF NOT EXISTS "meetingLink" TEXT,
      ADD COLUMN IF NOT EXISTS "calendarProvider" TEXT,
      ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "prepNotes" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "SequenceStep"
      ADD COLUMN IF NOT EXISTS "leadId" TEXT,
      ADD COLUMN IF NOT EXISTS "stepNumber" INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "dayOffset" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS "provider" TEXT,
      ADD COLUMN IF NOT EXISTS "subject" TEXT,
      ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);
}

async function createCoreIndexes() {
  const prisma = getPrisma();

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Company_workspaceId_idx" ON "Company"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Contact_workspaceId_idx" ON "Contact"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Contact_companyId_idx" ON "Contact"("companyId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Lead_workspaceId_idx" ON "Lead"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Lead_stage_idx" ON "Lead"("stage");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Lead_score_idx" ON "Lead"("score");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Opportunity_companyId_idx" ON "Opportunity"("companyId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Interaction_leadId_idx" ON "Interaction"("leadId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CampaignStep_campaignId_idx" ON "CampaignStep"("campaignId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SourcingCampaign_workspaceId_idx" ON "SourcingCampaign"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SourcingCampaign_status_idx" ON "SourcingCampaign"("status");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SuppressionRecord_workspaceId_type_value_key" ON "SuppressionRecord"("workspaceId", "type", "value");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OutreachQueueItem_workspaceId_idx" ON "OutreachQueueItem"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OutreachQueueItem_leadId_idx" ON "OutreachQueueItem"("leadId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OutreachQueueItem_status_idx" ON "OutreachQueueItem"("status");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Reply_workspaceId_idx" ON "Reply"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationHealth_workspaceId_name_key" ON "IntegrationHealth"("workspaceId", "name");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AutomationEvent_workspaceId_idx" ON "AutomationEvent"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BookingTask_workspaceId_idx" ON "BookingTask"("workspaceId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SequenceStep_workspaceId_idx" ON "SequenceStep"("workspaceId");`);
}

async function createMissingCoreTables() {
  const prisma = getPrisma();

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Company" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "niche" TEXT NOT NULL,
      "website" TEXT,
      "domain" TEXT,
      "crmSource" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Contact" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "companyId" TEXT,
      "name" TEXT NOT NULL,
      "firstName" TEXT,
      "lastName" TEXT,
      "email" TEXT,
      "phone" TEXT,
      "role" TEXT,
      "title" TEXT,
      "source" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Lead" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "companyId" TEXT,
      "contactId" TEXT,
      "name" TEXT NOT NULL,
      "title" TEXT,
      "description" TEXT,
      "companyName" TEXT NOT NULL,
      "niche" TEXT NOT NULL,
      "stage" TEXT NOT NULL,
      "priority" TEXT,
      "score" INTEGER NOT NULL DEFAULT 0,
      "leadScore" INTEGER,
      "value" INTEGER NOT NULL DEFAULT 0,
      "source" TEXT NOT NULL,
      "lastTouch" TEXT NOT NULL,
      "nextAction" TEXT NOT NULL,
      "tags" JSONB,
      "customFields" JSONB,
      "crmSyncStatus" TEXT NOT NULL DEFAULT 'pending',
      "crmSyncedAt" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Opportunity" (
      "id" TEXT NOT NULL,
      "companyId" TEXT NOT NULL,
      "leadId" TEXT,
      "title" TEXT NOT NULL,
      "stage" TEXT NOT NULL,
      "value" INTEGER NOT NULL,
      "probability" INTEGER NOT NULL DEFAULT 50,
      "closeDate" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Interaction" (
      "id" TEXT NOT NULL,
      "leadId" TEXT,
      "contactId" TEXT,
      "channel" TEXT NOT NULL,
      "direction" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "classification" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Campaign" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "mode" TEXT NOT NULL,
      "audience" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "replyTarget" DOUBLE PRECISION NOT NULL,
      "bookingTarget" DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CampaignStep" (
      "id" TEXT NOT NULL,
      "campaignId" TEXT NOT NULL,
      "dayOffset" INTEGER NOT NULL,
      "channel" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
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
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SuppressionRecord" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SuppressionRecord_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "OutreachQueueItem" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "leadId" TEXT,
      "channel" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "subject" TEXT,
      "body" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "reason" TEXT,
      "scheduledFor" TIMESTAMP(3),
      "approvedAt" TIMESTAMP(3),
      "sentAt" TIMESTAMP(3),
      "rejectedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OutreachQueueItem_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Reply" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "leadId" TEXT,
      "channel" TEXT NOT NULL,
      "from" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "classification" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationHealth" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "IntegrationHealth_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Proposal" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "opportunityId" TEXT,
      "title" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "setupFee" INTEGER NOT NULL,
      "monthlyFee" INTEGER NOT NULL,
      "revSharePct" DOUBLE PRECISION NOT NULL,
      "summary" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AgentTemplate" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "useCase" TEXT NOT NULL,
      "price" TEXT NOT NULL,
      "demoScript" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromptTemplate" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AutomationEvent" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "leadId" TEXT,
      "title" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'system',
      "payload" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BookingTask" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "leadId" TEXT,
      "ownerEmail" TEXT,
      "status" TEXT NOT NULL DEFAULT 'blocked',
      "meetingTitle" TEXT NOT NULL,
      "meetingLink" TEXT,
      "calendarProvider" TEXT,
      "durationMinutes" INTEGER NOT NULL DEFAULT 30,
      "scheduledFor" TIMESTAMP(3),
      "prepNotes" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "BookingTask_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SequenceStep" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "leadId" TEXT,
      "stepNumber" INTEGER NOT NULL,
      "dayOffset" INTEGER NOT NULL,
      "channel" TEXT NOT NULL,
      "provider" TEXT,
      "subject" TEXT,
      "body" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "scheduledFor" TIMESTAMP(3),
      "approvedAt" TIMESTAMP(3),
      "sentAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
    );
  `);

}
