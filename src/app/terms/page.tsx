import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Terms | ${brand.productName}`,
  description: `Basic public terms for ${brand.productName}, a product of ${brand.companyName}.`,
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--ghost-paper)] px-4 py-16 text-[var(--ghost-ink)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-[var(--ghost-border)] bg-white p-8">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--vega-teal)]">{brand.productName}</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Terms</h1>
        <p className="mt-5 leading-8 text-[var(--ghost-muted)]">
          {brand.legalAttributionText} This page is a public placeholder for the commercial terms reviewed during customer
          onboarding and checkout.
        </p>
        <div className="mt-8 grid gap-4 text-sm leading-7 text-[var(--ghost-muted)]">
          <p>Use of this product requires permission from Ghost AI Solutions and may be governed by a separate written agreement.</p>
          <p>Lead generation, outreach, deliverability, and booked-call outcomes are not guaranteed.</p>
          <p>Customers remain responsible for lawful use of prospect data, outreach approval, sales follow-up, and offer claims.</p>
        </div>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--vega-purple)] px-5 text-sm font-black text-white">
          Back to {brand.productName}
        </Link>
      </div>
    </main>
  );
}
