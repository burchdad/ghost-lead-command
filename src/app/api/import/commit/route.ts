import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { findSuppressionMatch } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

type ImportRecord = {
  name?: string;
  companyName?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
  domain?: string;
  niche?: string;
  source?: string;
  score?: number;
  value?: number;
};

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const body = await request.json();
  const records = Array.isArray(body.records) ? (body.records as ImportRecord[]) : [];

  if (!records.length) {
    return NextResponse.json({ error: "No records provided" }, { status: 400 });
  }

  const created = [];
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  function skip(reason: string) {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
  }

  for (const record of records.slice(0, 250)) {
    const companyName = String(record.companyName || record.company || "Unknown Company").trim();
    const contactName = String(record.name || "Unknown Contact").trim();
    const niche = String(record.niche || "General").trim();
    const score = Number(record.score || 50);
    const value = Number(record.value || 2500);
    const email = record.email ? String(record.email).trim().toLowerCase() : "";
    const phone = record.phone ? String(record.phone).trim() : "";
    const website = record.website ? String(record.website).trim() : "";
    const domain = normalizeDomain(record.domain ? String(record.domain) : website);

    const suppression = await findSuppressionMatch({
      email,
      phone,
      domain: domain || website,
      companyName,
    });

    if (suppression) {
      skip("suppressed");
      continue;
    }

    const duplicateChecks: Prisma.ContactWhereInput[] = [
      { name: contactName, company: { is: { name: companyName } } },
    ];
    if (email) duplicateChecks.push({ email });
    if (phone) duplicateChecks.push({ phone });

    const [existingContact, existingLead, existingCompany] = await Promise.all([
      prisma.contact.findFirst({
        where: {
          workspaceId: workspace.id,
          OR: duplicateChecks,
        },
        select: { id: true },
      }),
      prisma.lead.findFirst({
        where: {
          workspaceId: workspace.id,
          OR: [
            { name: contactName, companyName },
            ...(email ? [{ contact: { is: { email } } }] : []),
            ...(phone ? [{ contact: { is: { phone } } }] : []),
          ],
        },
        select: { id: true },
      }),
      prisma.company.findFirst({
        where: {
          workspaceId: workspace.id,
          OR: [
            { name: companyName },
            ...(domain ? [{ website: { contains: domain, mode: "insensitive" as const } }] : []),
          ],
        },
        select: { id: true, name: true },
      }),
    ]);

    if (existingContact || existingLead || existingCompany) {
      skip("duplicate");
      continue;
    }

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: companyName,
        niche,
        website: website || domain || null,
        crmSource: String(record.source || "csv"),
      },
    });

    const contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        name: contactName,
        email: email || null,
        phone: phone || null,
        role: "Owner",
      },
    });

    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        companyId: company.id,
        contactId: contact.id,
        name: contact.name,
        companyName: company.name,
        niche,
        stage: "Imported",
        score,
        value,
        source: String(record.source || "csv"),
        lastTouch: "Never",
        nextAction: "Run first revival opener and watch for hot replies.",
        opportunities: {
          create: {
            companyId: company.id,
            title: `${company.name} AI revival install`,
            stage: "Imported",
            value,
            probability: Math.min(95, Math.max(20, score)),
          },
        },
      },
      include: { opportunities: true },
    });

    created.push(lead);
  }

  return NextResponse.json({ created, count: created.length, skipped, skipReasons }, { status: 201 });
}
