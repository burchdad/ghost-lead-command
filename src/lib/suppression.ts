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
  type: string;
  value: string;
  reason?: string;
  source?: string;
}) {
  const workspace = await getDefaultWorkspace();
  const prisma = getPrisma();
  const type = clean(input.type);
  const value = clean(input.value);

  return prisma.suppressionRecord.upsert({
    where: {
      workspaceId_type_value: {
        workspaceId: workspace.id,
        type,
        value,
      },
    },
    update: {
      reason: input.reason || "Suppressed",
      source: input.source || "manual",
    },
    create: {
      workspaceId: workspace.id,
      type,
      value,
      reason: input.reason || "Suppressed",
      source: input.source || "manual",
    },
  });
}
