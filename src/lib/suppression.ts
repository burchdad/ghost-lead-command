import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

function clean(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export async function findSuppressionMatch(input: {
  email?: string | null;
  phone?: string | null;
  domain?: string | null;
  companyName?: string | null;
}) {
  const workspace = await getDefaultWorkspace();
  const prisma = getPrisma();
  const values = [
    input.email ? { type: "email", value: clean(input.email) } : null,
    input.phone ? { type: "phone", value: clean(input.phone) } : null,
    input.domain ? { type: "domain", value: clean(input.domain).replace(/^www\./, "") } : null,
    input.companyName ? { type: "company", value: clean(input.companyName) } : null,
  ].filter(Boolean) as { type: string; value: string }[];

  if (!values.length) return null;

  return prisma.suppressionRecord.findFirst({
    where: {
      workspaceId: workspace.id,
      OR: values,
    },
  });
}

export async function addSuppressionRecord(input: {
  workspaceId?: string;
  type: string;
  value: string;
  reason?: string;
  source?: string;
}) {
  const workspace = input.workspaceId ? { id: input.workspaceId } : await getDefaultWorkspace();
  const prisma = getPrisma();
  const type = clean(input.type);
  const value = clean(input.value);
  await ensureSuppressionRecordCompatibility();

  const data = buildSuppressionRecordData({
    workspaceId: workspace.id,
    type,
    value,
    reason: input.reason,
    source: input.source,
  });

  return prisma.suppressionRecord.upsert({
    where: {
      workspaceId_type_value: {
        workspaceId: workspace.id,
        type,
        value,
      },
    },
    update: { reason: data.reason, source: data.source },
    create: data,
  });
}

export function buildSuppressionRecordData(input: {
  workspaceId: string;
  type: string;
  value: string;
  reason?: string;
  source?: string;
}) {
  const workspaceId = String(input.workspaceId || "").trim();
  if (!workspaceId) throw new Error("Suppression records require a workspace tenant.");
  if (!clean(input.type) || !clean(input.value)) throw new Error("Suppression records require a type and value.");
  return {
    workspaceId,
    type: clean(input.type),
    value: clean(input.value),
    reason: input.reason || "Suppressed",
    source: input.source || "manual",
  };
}

let compatibilityPromise: Promise<void> | null = null;

export function ensureSuppressionRecordCompatibility() {
  compatibilityPromise ||= getPrisma().$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'SuppressionRecord' AND column_name = 'organizationId'
      ) THEN
        ALTER TABLE "SuppressionRecord" ALTER COLUMN "organizationId" DROP NOT NULL;
      END IF;
    END $$;
  `).then(() => undefined);
  return compatibilityPromise;
}
