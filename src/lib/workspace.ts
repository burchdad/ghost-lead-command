import { getPrisma } from "@/lib/prisma";

export async function getDefaultWorkspace() {
  const prisma = getPrisma();
  return prisma.workspace.upsert({
    where: { slug: "ghost-ai-solutions" },
    update: {},
    create: {
      name: "Ghost AI Solutions",
      slug: "ghost-ai-solutions",
    },
  });
}
