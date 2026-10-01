import Link from "next/link";
import { brand } from "@/config/brand";
import { policyEffectiveDate, type PolicySection } from "@/config/service-policies";
export function ServicePolicyPage({ title, sections }: { title: string; sections: PolicySection[] }) {
  return <main className="min-h-screen bg-[var(--ghost-paper)] px-5 py-12 text-[var(--ghost-ink)] sm:px-8"><article className="mx-auto max-w-3xl">
    <Link href="/" className="text-sm font-bold underline underline-offset-4">Back to {brand.productName}</Link>
    <p className="mt-8 text-sm font-bold uppercase tracking-widest">{brand.companyName}</p><h1 className="mt-3 text-4xl font-bold tracking-tight">{title}</h1>
    <p className="mt-4 text-sm text-[var(--ghost-muted)]">Effective {policyEffectiveDate}</p>
    <div className="mt-8 space-y-8">{sections.map(section => <section key={section.title}><h2 className="text-xl font-bold">{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 text-base leading-8 text-[var(--ghost-muted)]">{paragraph}</p>)}</section>)}</div>
    <nav aria-label="Service policy navigation" className="mt-10 flex flex-wrap gap-5 border-t border-[var(--ghost-border)] pt-6 text-sm font-semibold"><Link href="/privacy" className="underline">Privacy notice</Link><Link href="/terms" className="underline">Service terms</Link><a href={`mailto:${brand.publicSupportEmail}`} className="underline">Contact support</a></nav>
  </article></main>;
}
