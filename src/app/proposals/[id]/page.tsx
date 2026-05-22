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

const business = {
  name: "Ghost AI Solutions",
  phone: "+1 903 483 4214",
  email: "stephen.burch@ghostai.solutions",
  support: "support@ghostai.solutions",
  website: "https://www.ghostai.solutions",
  privacy: "https://www.ghostai.solutions/privacy-policy",
  terms: "https://www.ghostai.solutions/terms",
};

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
  const allSections = splitSections(proposal.summary);
  const costSection = allSections.find((section) => section.title === "Estimated Cost");
  const sections = allSections.filter((section) => section.title !== "Estimated Cost");
  const beforeCostSections = sections.filter((section) =>
    ["Summary", "Project Overview", "Deliverables", "Scope of Work"].includes(section.title),
  );
  const afterCostSections = sections.filter((section) =>
    ["Additional Notes", "Next Step"].includes(section.title),
  );
  const toc = [
    "Project Overview",
    "Deliverables",
    "Scope of Work",
    "Cost Estimates",
    "Additional Notes",
    "Contact",
  ];
  const halfSetup = Math.round(proposal.setupFee / 2);

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
          <section className="border-b border-white/10 p-8 print:min-h-[520px] print:border-[#d7dedb]">
            <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#d8ff5f] print:text-[#33413d]">Project Proposal</p>
                <h2 className="mt-4 text-4xl font-semibold tracking-normal text-white print:text-[#101417]">{companyName}</h2>
                <p className="mt-3 text-[#b8c9c4] print:text-[#33413d]">Prepared for {contactName}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-5 text-sm print:border print:border-[#d7dedb] print:bg-white">
                <p className="text-[#b8c9c4] print:text-[#52615d]">Prepared by</p>
                <p className="mt-1 font-semibold text-white print:text-[#101417]">{business.name}</p>
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
            <div className="mt-12 grid gap-4 md:grid-cols-3 print:mt-20">
              <div className="rounded-md bg-white/[0.04] p-4 print:border print:border-[#d7dedb] print:bg-white">
                <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Website</p>
                <p className="mt-2 text-sm text-white print:text-[#101417]">{business.website}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-4 print:border print:border-[#d7dedb] print:bg-white">
                <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Email</p>
                <p className="mt-2 text-sm text-white print:text-[#101417]">{business.email}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-4 print:border print:border-[#d7dedb] print:bg-white">
                <p className="text-xs uppercase tracking-[0.18em] text-[#83d0c2] print:text-[#52615d]">Phone</p>
                <p className="mt-2 text-sm text-white print:text-[#101417]">{business.phone}</p>
              </div>
            </div>
          </section>

          <section className="border-b border-white/10 p-8 print:border-[#d7dedb]">
            <h3 className="text-xl font-semibold text-white print:text-[#101417]">Table of Contents</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {toc.map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-md bg-white/[0.04] px-4 py-3 text-sm print:border print:border-[#d7dedb] print:bg-white">
                  <span className="font-semibold text-white print:text-[#101417]">{String(index + 1).padStart(2, "0")} {item}</span>
                  <span className="text-[#83d0c2] print:text-[#52615d]">Included</span>
                </div>
              ))}
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
            {beforeCostSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xl font-semibold text-white print:text-[#101417]">{section.title}</h3>
                <div className="mt-3 whitespace-pre-line text-sm leading-7 text-[#d6dfdc] print:text-[#26332f]">
                  {section.body.join("\n").trim()}
                </div>
              </div>
            ))}
          </section>

          <section className="border-t border-white/10 p-8 print:border-[#d7dedb]">
            <h3 className="text-xl font-semibold text-white print:text-[#101417]">Cost Estimates</h3>
            <div className="mt-5 overflow-hidden rounded-md border border-white/10 print:border-[#d7dedb]">
              {[
                ["AI lead workflow setup and pilot build", money(proposal.setupFee)],
                ["Monthly AI response desk and optimization", `${money(proposal.monthlyFee)}/mo`],
                ["Optional recovered-revenue upside share", `${proposal.revSharePct}%`],
                ["Pilot review, launch support, and attribution setup", "Included"],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-4 border-b border-white/10 px-4 py-3 text-sm last:border-b-0 print:border-[#d7dedb]">
                  <span className="text-[#d6dfdc] print:text-[#26332f]">{label}</span>
                  <span className="font-semibold text-white print:text-[#101417]">{value}</span>
                </div>
              ))}
            </div>
            {costSection && (
              <div className="mt-5 whitespace-pre-line text-sm leading-7 text-[#d6dfdc] print:text-[#26332f]">
                {costSection.body.join("\n").trim()}
              </div>
            )}
            <div className="mt-5 rounded-md bg-white/[0.04] p-5 text-sm leading-7 text-[#d6dfdc] print:border print:border-[#d7dedb] print:bg-white print:text-[#26332f]">
              <p>
                <strong className="text-white print:text-[#101417]">Payments:</strong> 50% of the setup fee ({money(halfSetup)}) is due after acceptance to begin. The remaining 50% ({money(proposal.setupFee - halfSetup)}) is due at pilot completion before monthly optimization begins.
              </p>
              <p className="mt-3">
                <strong className="text-white print:text-[#101417]">Disclaimer:</strong> Client is responsible for licensing fees, API usage, LLM token usage, hosting, phone/email provider costs, compliance approvals, and other third-party operating expenses required for the system.
              </p>
              <p className="mt-3">
                Additional features, integrations, or scope expansions beyond the approved deliverables may require separate approval and billing. No specific revenue, reply volume, or conversion outcome is guaranteed.
              </p>
            </div>
          </section>

          <section className="space-y-8 border-t border-white/10 p-8 print:border-[#d7dedb]">
            {afterCostSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xl font-semibold text-white print:text-[#101417]">{section.title}</h3>
                <div className="mt-3 whitespace-pre-line text-sm leading-7 text-[#d6dfdc] print:text-[#26332f]">
                  {section.body.join("\n").trim()}
                </div>
              </div>
            ))}
          </section>

          <section className="border-t border-white/10 p-8 print:border-[#d7dedb]">
            <h3 className="text-xl font-semibold text-white print:text-[#101417]">Let's Work Together</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-md bg-white/[0.04] p-5 text-sm leading-7 print:border print:border-[#d7dedb] print:bg-white">
                <p className="font-semibold text-white print:text-[#101417]">{business.name}</p>
                <p className="text-[#d6dfdc] print:text-[#26332f]">{business.phone}</p>
                <p className="text-[#d6dfdc] print:text-[#26332f]">{business.email}</p>
                <p className="text-[#d6dfdc] print:text-[#26332f]">Support: {business.support}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-5 text-sm leading-7 print:border print:border-[#d7dedb] print:bg-white">
                <p className="font-semibold text-white print:text-[#101417]">Legal</p>
                <p className="text-[#d6dfdc] print:text-[#26332f]">Privacy Policy: {business.privacy}</p>
                <p className="text-[#d6dfdc] print:text-[#26332f]">Terms of Service: {business.terms}</p>
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
