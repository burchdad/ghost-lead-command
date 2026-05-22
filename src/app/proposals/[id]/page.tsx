import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import ProposalPrintButton from "./ProposalPrintButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function money(value: number) {
  return `$${value.toLocaleString()}`;
}

function splitSections(summary: string) {
  const headings = [
    "Summary",
    "Project Overview",
    "Deliverables",
    "Scope of Work",
    "Estimated Cost",
    "Additional Notes",
    "Next Step",
  ];
  const lines = summary.split(/\r?\n/);
  const sections: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const clean = line.trim();
    if (headings.includes(clean)) {
      if (current) sections.push(current);
      current = { title: clean, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }

  if (current) sections.push(current);
  if (sections.length) return sections;

  return [{ title: "Proposal", body: [summary] }];
}

export default async function ProposalPage({ params }: PageProps) {
  const { id } = await params;
  const prisma = getPrisma();
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      opportunity: {
        include: {
          company: true,
          lead: {
            include: {
              contact: true,
              company: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    notFound();
  }

  const lead = proposal.opportunity?.lead;
  const companyName = lead?.companyName || proposal.opportunity?.company.name || proposal.title.replace(/\s+Proposal$/i, "");
  const contactName = lead?.contact?.name || lead?.name || "Client";
  const sections = splitSections(proposal.summary);

  return (
    <main className="min-h-screen bg-[#07100f] px-6 py-10 text-[#eef5f1] print:bg-white print:px-0 print:py-0 print:text-[#101417]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#83d0c2]">Ghost AI Solutions</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-white">{proposal.title}</h1>
          </div>
          <ProposalPrintButton />
        </div>

        <article className="overflow-hidden rounded-md border border-white/10 bg-[#101716] shadow-2xl print:rounded-none print:border-0 print:bg-white print:shadow-none">
          <section className="border-b border-white/10 p-8 print:border-[#d7dedb]">
            <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#d8ff5f] print:text-[#33413d]">Project Proposal</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-normal text-white print:text-[#101417]">{companyName}</h2>
                <p className="mt-3 text-[#b8c9c4] print:text-[#33413d]">Prepared for {contactName}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-5 text-sm print:border print:border-[#d7dedb] print:bg-white">
                <p className="text-[#b8c9c4] print:text-[#52615d]">Prepared by</p>
                <p className="mt-1 font-semibold text-white print:text-[#101417]">Ghost AI Solutions</p>
                <p className="mt-4 text-[#b8c9c4] print:text-[#52615d]">Date</p>
                <p className="mt-1 font-semibold text-white print:text-[#101417]">
                  {proposal.createdAt.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 border-b border-white/10 p-8 md:grid-cols-3 print:border-[#d7dedb]">
            <div className="rounded-md bg-white/[0.04] p-5 print:border print:border-[#d7dedb] print:bg-white">
              <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Setup</p>
              <p className="mt-2 text-2xl font-semibold text-white print:text-[#101417]">{money(proposal.setupFee)}</p>
            </div>
            <div className="rounded-md bg-white/[0.04] p-5 print:border print:border-[#d7dedb] print:bg-white">
              <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Monthly</p>
              <p className="mt-2 text-2xl font-semibold text-white print:text-[#101417]">{money(proposal.monthlyFee)}/mo</p>
            </div>
            <div className="rounded-md bg-white/[0.04] p-5 print:border print:border-[#d7dedb] print:bg-white">
              <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Upside Share</p>
              <p className="mt-2 text-2xl font-semibold text-white print:text-[#101417]">{proposal.revSharePct}%</p>
            </div>
          </section>

          <section className="space-y-8 p-8">
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xl font-semibold text-white print:text-[#101417]">{section.title}</h3>
                <div className="mt-3 whitespace-pre-line text-sm leading-7 text-[#d6dfdc] print:text-[#26332f]">
                  {section.body.join("\n").trim()}
                </div>
              </div>
            ))}
          </section>
        </article>
      </div>
    </main>
  );
}
