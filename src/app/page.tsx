import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  MousePointerClick,
  Radar,
  Send,
  ShieldCheck,
  Target,
} from "lucide-react";
import { HomepageCommandForm, OnboardingCta } from "@/components/HomepageCommandForm";
import { SectionTracker } from "@/components/VegaLandingClient";
import {
  GhostProductAttribution,
  VegaAvatar,
  VegaConsultationAttribution,
  VegaDirectorPanel,
  VegaGlowPanel,
  VegaMessageBubble,
  VegaPipelineStep,
  VegaPlanCard,
  VegaSectionEyebrow,
  VegaStatusBadge,
  VegaWordmark,
} from "@/components/vega";
import { brand, publicMetadata } from "@/config/brand";
import { vegaAssets } from "@/config/vega-assets";
import { publicOperatingProof, publicPromptExamples, publicVegaPlans } from "@/lib/public-homepage";

export const metadata: Metadata = {
  metadataBase: new URL(brand.productUrl),
  title: publicMetadata.title,
  description: publicMetadata.description,
  openGraph: {
    title: publicMetadata.openGraphTitle,
    description: publicMetadata.openGraphDescription,
    url: brand.productUrl,
    siteName: brand.productName,
    images: [
      {
        url: vegaAssets.heroArtwork,
        width: 640,
        height: 960,
        alt: `${brand.aiDirectorName}, ${brand.aiDirectorTitle} for ${brand.productName}`,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: publicMetadata.openGraphTitle,
    description: "Tell Vega who you want to reach and start building a qualified customer pipeline.",
    images: [vegaAssets.heroArtwork],
  },
};

const commandSteps = [
  {
    icon: Radar,
    title: "Find",
    text: "Vega identifies companies, decision-makers, referral partners, and buyer signals inside your target market.",
  },
  {
    icon: Target,
    title: "Qualify",
    text: "Every prospect is ranked by fit, need, contactability, urgency, and potential value before outreach.",
  },
  {
    icon: Send,
    title: "Reach",
    text: "Vega creates personalized outreach, manages approvals, follows up, and protects sender health.",
  },
  {
    icon: CalendarCheck2,
    title: "Convert",
    text: "Replies, calls, callbacks, and booking workflows move qualified interest toward real appointments.",
  },
];

const customerMetrics = [
  ["Connected Sources", "Maps, business data, web research, public signals, and connected lead providers"],
  ["AI Sales Director", "Vega coordinates sourcing, qualification, outreach, follow-up, and conversion workflows"],
  ["Human Control", "Your team, Ghost operators, or both"],
  ["Primary Goal", "Qualified conversations, booked calls, and measurable pipeline"],
];

const fitGroups = [
  "local service businesses",
  "B2B service companies",
  "contractors and home-service companies",
  "professional service firms",
  "agencies",
  "teams with an employee or assistant available for follow-up",
  "businesses that want Ghost to manage more of the process",
];

const vegaWorksBest = [
  "the business has capacity for new customers",
  "the offer is clear",
  "someone can respond to interested prospects",
  "the customer is willing to refine targeting and messaging",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--ghost-paper)] text-[var(--ghost-ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--ghost-border)] bg-[#fbfcfa]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label={`${brand.productName} home`}>
            <VegaWordmark />
          </Link>

          <div className="mx-auto hidden w-full max-w-xl md:block">
            <HomepageCommandForm examples={publicPromptExamples} compact section="nav" />
          </div>

          <nav className="ml-auto hidden items-center gap-5 whitespace-nowrap text-sm font-medium text-[#3d4842] xl:flex" aria-label="Primary navigation">
            {[
              ["How it works", "#how-it-works"],
              ["Solutions", "#solutions"],
              ["Plans", "#plans"],
              ["Results", "#results"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="hover:text-[var(--vega-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--vega-focus-ring)]">
                {label}
              </a>
            ))}
            <Link href="/command" className="hover:text-[var(--vega-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--vega-focus-ring)]">
              Sign in
            </Link>
          </nav>

          <OnboardingCta
            section="nav"
            className="ml-auto inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[var(--vega-purple)] px-3 text-xs font-bold text-white transition hover:bg-[var(--vega-purple-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-focus-ring)] sm:px-4 sm:text-sm xl:ml-2"
          >
            Start with Vega
          </OnboardingCta>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e3e8e3]">
        <div className="absolute inset-x-0 top-12 h-[30rem] bg-[var(--vega-hero-gradient)]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,#f7f8f6)]" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[700px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_480px] lg:px-8">
          <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <VegaSectionEyebrow>AI-guided customer acquisition</VegaSectionEyebrow>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[var(--vega-ink)] sm:text-6xl">
              Tell Vega who you want to sell to.
              <span className="block">She&apos;ll build the pipeline.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--ghost-muted)] lg:mx-0">
              Describe what you offer, where you operate, and the customers you want. Vega finds and qualifies the right
              prospects, starts personalized outreach, supports follow-up, and helps move real interest toward booked calls.
            </p>

            <HomepageCommandForm examples={publicPromptExamples} section="hero" />
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <VegaDirectorPanel />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <VegaSectionEyebrow>How it works</VegaSectionEyebrow>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">From a plain-language goal to a worked pipeline.</h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {commandSteps.map((step, index) => (
            <VegaPipelineStep
              key={step.title}
              icon={step.icon}
              title={step.title}
              text={step.text}
              index={index}
              showConnector={index < commandSteps.length - 1}
            />
          ))}
        </div>
      </section>

      <section id="solutions" className="border-y border-[var(--ghost-border)] bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <VegaSectionEyebrow>AI-Guided Campaign Setup</VegaSectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Start with a conversation, not a complicated form.</h2>
            <p className="mt-5 leading-8 text-[var(--ghost-muted)]">
              Tell Vega about your business in your own words. She will research what she can, ask only the questions that
              matter, recommend the right target market, and build a campaign for your approval.
            </p>
            <VegaConsultationAttribution className="mt-4" />
            <OnboardingCta
              section="ai_consultation_preview"
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--vega-ink)] px-5 text-sm font-black text-white transition hover:bg-[#26332c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-focus-ring)]"
            >
              Start my Vega consultation
              <Bot size={18} aria-hidden="true" />
            </OnboardingCta>
          </div>

          <VegaGlowPanel className="p-5">
            {[
              ["Vega", "Tell me what your business does and what kind of customers you want more of.", "vega"],
              ["Customer", "I run a mobile detailing company in Tyler and want dealership and fleet accounts.", "customer"],
              [
                "Vega",
                "That is a strong recurring-revenue opportunity. I recommend beginning with dealerships, fleet operators, RV dealers, and automotive referral partners within 40 miles. Who will handle follow-up calls, your team or Ghost?",
                "vega",
              ],
              ["Customer", "My office manager.", "customer"],
              [
                "Vega",
                "Vega Convert is likely the best fit. I will source and qualify the accounts, prepare outreach, monitor responses, and create prioritized phone-assist tasks for your team.",
                "vega",
              ],
            ].map(([speaker, message, side]) => (
              <VegaMessageBubble key={`${speaker}-${message}`} speaker={speaker} side={side === "customer" ? "customer" : "vega"} className="mb-3 last:mb-0">
                {message}
              </VegaMessageBubble>
            ))}
          </VegaGlowPanel>
        </div>
      </section>

      <section id="proof" className="relative border-b border-[var(--ghost-border)] bg-[var(--ghost-paper)]">
        <SectionTracker event="proof section viewed" section="proof" />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <VegaSectionEyebrow>More than another lead list</VegaSectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Built for the messy middle between leads and booked calls.</h2>
            <p className="mt-5 leading-8 text-[var(--ghost-muted)]">
              Vega does more than add names to a spreadsheet. She watches lead quality, message performance, delivery
              risk, replies, phone follow-up, and calendar movement so your team knows where real opportunities are coming from.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {customerMetrics.map(([label, value]) => (
              <div key={label} className="rounded-md border border-[var(--ghost-border)] bg-white p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#5f6b64]">{label}</p>
                <p className="mt-3 text-lg font-black leading-7 text-[var(--vega-ink)]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTracker event="pricing section viewed" section="plans" />
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <VegaSectionEyebrow>Plans</VegaSectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Choose how much of the sales process Vega handles.</h2>
            <p className="mt-5 max-w-3xl leading-8 text-[var(--ghost-muted)]">
              Plans scale based on qualified lead volume, outreach volume, territories, integrations, and the level of
              human support required. The AI onboarding experience recommends the right level after understanding your needs.
            </p>
          </div>
          <OnboardingCta
            section="plans_header"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--vega-ink)] px-5 text-sm font-black text-white transition hover:bg-[#26332c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-focus-ring)]"
          >
            Compare Vega options
            <MousePointerClick size={17} aria-hidden="true" />
          </OnboardingCta>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {publicVegaPlans.map((plan) => (
            <VegaPlanCard
              key={plan.code}
              name={plan.name}
              priceLabel={plan.priceLabel}
              target={plan.target}
              vegaHandles={plan.vegaHandles}
              customerHandles={plan.customerHandles}
              outcome={plan.outcome}
              emphasized={plan.code === "vega_convert"}
              label={"label" in plan ? plan.label : undefined}
            >
              <OnboardingCta
                section="product_card"
                productCode={plan.code}
                event="product card selected"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-[#cfd8d1] px-4 text-sm font-black transition hover:border-[var(--vega-teal)] hover:text-[var(--vega-teal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-focus-ring)]"
              >
                Explore {plan.name}
              </OnboardingCta>
            </VegaPlanCard>
          ))}
        </div>
      </section>

      <section id="results" className="relative border-y border-[var(--ghost-border)] bg-white">
        <SectionTracker event="results section viewed" section="results" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <VegaSectionEyebrow>Vega in active use</VegaSectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Internal Ghost AI Solutions operating data.</h2>
            <p className="mt-5 leading-8 text-[var(--ghost-muted)]">
              These are internal operating signals from Ghost AI Solutions workflows. They are not guarantees, testimonials,
              or promised customer outcomes.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {publicOperatingProof.map((proof) => (
              <div key={proof.label} className="rounded-md border border-[var(--ghost-border)] bg-[var(--ghost-paper)] p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#5f6b64]">{proof.label}</p>
                <p className="mt-3 font-mono text-4xl font-black text-[var(--vega-ink)]">{proof.value}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--ghost-muted)]">{proof.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <VegaSectionEyebrow>Who Vega is for</VegaSectionEyebrow>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Built for businesses that need a repeatable pipeline.</h2>
            <div className="mt-8 flex flex-wrap gap-2">
              {fitGroups.map((group) => (
                <span key={group} className="rounded-md border border-[var(--ghost-border)] bg-white px-3 py-2 text-sm font-bold text-[#3f4a43]">
                  {group}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--ghost-border)] bg-white p-6">
            <h3 className="text-2xl font-black">Vega works best when:</h3>
            <div className="mt-5 grid gap-3">
              {vegaWorksBest.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-[var(--ghost-muted)]">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--vega-teal)]" size={18} aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-md bg-[var(--ghost-subtle)] p-4 text-sm leading-6 text-[#3f4a43]">
              Vega is not a guaranteed-sales product or a mass-spam system. It is a supervised customer-acquisition
              platform designed to create and work qualified pipeline.
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-lg bg-[var(--vega-deep)] px-6 py-10 text-white shadow-[var(--vega-glow)] sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[var(--vega-lime)]">
                <ShieldCheck size={20} aria-hidden="true" />
                <span className="text-sm font-black uppercase tracking-[0.18em]">Supervised autonomy</span>
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Start with control. Scale with automation.</h2>
              <p className="mt-4 max-w-3xl leading-8 text-[#d6e1dc]">
                Approve every step, let Vega handle selected tasks, or have Ghost manage the full campaign. You decide how
                much control to keep.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <VegaAvatar size="sm" showStatus caption="Vega is ready" />
                <VegaStatusBadge label="Vega is ready" status="ready" />
                <GhostProductAttribution className="text-[#b8cac5]" />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <OnboardingCta
                section="final_cta"
                event="final CTA clicked"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[var(--vega-lime)] px-6 text-sm font-black text-[var(--vega-ink)] transition hover:bg-[var(--vega-lime-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-lime)]"
              >
                Start my Vega consultation
                <Bot size={18} aria-hidden="true" />
              </OnboardingCta>
              <OnboardingCta
                section="final_compare"
                event="final CTA clicked"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/20 px-6 text-sm font-black text-white transition hover:border-[var(--vega-lime)] hover:text-[var(--vega-lime)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vega-lime)]"
              >
                Compare Vega options
                <ArrowRight size={18} aria-hidden="true" />
              </OnboardingCta>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--ghost-border)] px-4 py-8 text-sm text-[#68736d] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <GhostProductAttribution className="mb-2" />
            <p className="font-semibold text-[var(--vega-ink)]">{brand.legalAttributionText}</p>
            <p className="mt-1">Support: {brand.publicSupportEmail}</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href={brand.publicCompanyUrl} className="hover:text-[var(--vega-ink)]">
              Ghost AI Solutions
            </Link>
            <Link href="/privacy" className="hover:text-[var(--vega-ink)]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[var(--vega-ink)]">
              Terms
            </Link>
            <Link href="/command" className="hover:text-[var(--vega-ink)]">
              Sign in
            </Link>
            <Link href={brand.onboardingUrl} className="hover:text-[var(--vega-ink)]">
              AI onboarding
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
