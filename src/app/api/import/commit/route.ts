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

  for (const record of records.slice(0, 250)) {
    const companyName = String(record.companyName || record.company || "Unknown Company").trim();
    const contactName = String(record.name || "Unknown Contact").trim();
    const niche = String(record.niche || "General").trim();
    const score = Number(record.score || 50);
    const value = Number(record.value || 2500);
    const email = record.email ? String(record.email).trim().toLowerCase() : "";
    const phone = record.phone ? String(record.phone).trim() : "";
    const website = record.website ? String(record.website).trim() : "";
    const domain = record.domain ? String(record.domain).trim().toLowerCase() : "";

    const suppression = await findSuppressionMatch({
      email,
      phone,
      domain: domain || website,
      companyName,
    });

    if (suppression) {
      skipped += 1;
      continue;
    }

    const duplicateChecks: Prisma.ContactWhereInput[] = [
      { name: contactName, company: { is: { name: companyName } } },
    ];
    if (email) duplicateChecks.push({ email });
    if (phone) duplicateChecks.push({ phone });

    const existingContact = await prisma.contact.findFirst({
      where: {
        workspaceId: workspace.id,
        OR: duplicateChecks,
      },
      select: { id: true },
    });

    if (existingContact) {
      skipped += 1;
      continue;
    }

    const company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: companyName,
        niche,
        website: website || null,
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

  return NextResponse.json({ created, count: created.length, skipped }, { status: 201 });
}
