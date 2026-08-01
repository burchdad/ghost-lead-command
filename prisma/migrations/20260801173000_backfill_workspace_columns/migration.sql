DO $$
DECLARE
  default_workspace_id TEXT;
  table_name TEXT;
  tables TEXT[] := ARRAY[
    'Company',
    'Contact',
    'Lead',
    'Campaign',
    'SuppressionRecord',
    'OutreachQueueItem',
    'Reply',
    'IntegrationHealth',
    'Proposal',
    'AgentTemplate',
    'PromptTemplate',
    'AutomationEvent',
    'BookingTask',
    'SequenceStep'
  ];
BEGIN
  SELECT "id" INTO default_workspace_id FROM "Workspace" WHERE "slug" = 'ghost-ai-solutions' LIMIT 1;

  IF default_workspace_id IS NULL THEN
    default_workspace_id := 'ghost-ai-solutions-default';
    INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
    VALUES (default_workspace_id, 'Ghost AI Solutions', 'ghost-ai-solutions', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("slug") DO NOTHING;
    SELECT "id" INTO default_workspace_id FROM "Workspace" WHERE "slug" = 'ghost-ai-solutions' LIMIT 1;
  END IF;

  FOREACH table_name IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND information_schema.columns.table_name = table_name
          AND column_name = 'workspaceId'
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN "workspaceId" TEXT', table_name);
      END IF;

      EXECUTE format('UPDATE %I SET "workspaceId" = $1 WHERE "workspaceId" IS NULL', table_name)
      USING default_workspace_id;

      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("workspaceId")', table_name || '_workspaceId_idx', table_name);
    END IF;
  END LOOP;
END $$;
