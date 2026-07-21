import type { Metadata } from "next";
import Image from "next/image";
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
  Sparkles,
  Target,
} from "lucide-react";
import { HomepageCommandForm, OnboardingCta } from "@/components/HomepageCommandForm";
import { SectionTracker } from "@/components/VegaLandingClient";
import { publicOperatingProof, publicPromptExamples, publicVegaPlans } from "@/lib/public-homepage";

export const metadata: Metadata = {
  metadataBase: new URL("https://leadgen.ghostai.solutions"),
  title: "Vega AI Sales Director | Build Qualified Pipeline with Ghost Lead Command",
  description:
    "Tell Vega what you sell, where you operate, and who you want to reach. Vega finds and qualifies prospects, creates personalized outreach, supports follow-up, and helps move real interest toward booked calls.",
  openGraph: {
    title: "Vega AI Sales Director | Ghost Lead Command",
    description:
      "Start with an AI consultation. Vega helps find qualified prospects, prepare outreach, support follow-up, and move real interest toward booked calls.",
    url: "https://leadgen.ghostai.solutions",
    siteName: "Ghost Lead Command",
    images: [{ url: "/vega-avatar.png", width: 640, height: 960, alt: "Vega AI sales director avatar" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vega AI Sales Director",
    description: "Tell Vega who you want to reach and start building a qualified customer pipeline.",
    images: ["/vega-avatar.png"],
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
  ["Live Sources", "Maps, business data, web research, public signals, and connected lead providers"],
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

function SectionLabel({ children }: { children: string }) {
  return <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#008f75]">{children}</p>;
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#121614]">
      <header className="sticky top-0 z-30 border-b border-[#dfe4df] bg-[#fbfcfa]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Ghost Lead Command home">
            <span className="grid size-9 place-items-center rounded-md bg-[#caff4d] text-[#111811]">
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <span className="hidden text-lg font-bold tracking-tight sm:inline">Ghost Lead Command</span>
          </Link>

          <div className="mx-auto hidden w-full max-w-xl md:block">
            <HomepageCommandForm examples={publicPromptExamples} compact section="nav" />
          </div>

          <nav className="ml-auto hidden items-center gap-5 text-sm font-medium text-[#3d4842] xl:flex" aria-label="Primary navigation">
            <a href="#how-it-works" className="hover:text-[#111811] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a885]">
              How it works
            </a>
            <a href="#solutions" className="hover:text-[#111811] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a885]">
              Solutions
            </a>
            <a href="#plans" className="hover:text-[#111811] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a885]">
              Plans
            </a>
            <a href="#results" className="hover:text-[#111811] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a885]">
              Results
            </a>
            <Link href="/command" className="hover:text-[#111811] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00a885]">
              Sign in
            </Link>
          </nav>

          <OnboardingCta
            section="nav"
            className="ml-auto inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[#00a885] px-4 text-sm font-bold text-white transition hover:bg-[#07866e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00a885] xl:ml-2"
          >
            Start with Vega
          </OnboardingCta>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e3e8e3]">
        <div className="absolute inset-x-0 top-20 h-80 bg-[radial-gradient(circle_at_center,#d9dbff_0,#eef0ff_35%,transparent_68%)] opacity-80" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,#f7f8f6)]" aria-hidden="true" />

        <div className="relative mx-auto grid min-h-[700px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_480px] lg:px-8">
          <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <SectionLabel>AI-guided customer acquisition</SectionLabel>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[#111811] sm:text-6xl">
              Tell Vega who you want to sell to.
              <span className="block">She&apos;ll build the pipeline.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#4d5952] lg:mx-0">
              Describe what you offer, where you operate, and the customers you want. Vega finds and qualifies the right
              prospects, starts personalized outreach, supports follow-up, and helps move real interest toward booked calls.
            </p>

            <HomepageCommandForm examples={publicPromptExamples} section="hero" />
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <div className="rounded-lg border border-[#d5ddd6] bg-[#101817] p-4 shadow-[0_32px_90px_rgba(17,24,17,0.24)]">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <Image
                  src="/vega-avatar.png"
                  width={54}
                  height={54}
                  alt="Vega AI sales director avatar"
                  className="rounded-md border border-[#caff4d]/30 bg-[#1b2522]"
                  priority
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#82ded0]">Online director</p>
                  <h2 className="text-xl font-black text-white">Vega is ready</h2>
                </div>
                <span className="ml-auto rounded-md bg-[#caff4d] px-2 py-1 text-xs font-black text-[#111811]">Online</span>
              </div>

              <div className="mt-4 grid gap-3">
                {[
                  ["Market Scout", "Finding businesses that match your ideal customer", "Ready"],
                  ["Offer Strategist", "Turning your service into a reason prospects respond", "Ready"],
                  ["Sender Guardian", "Protecting sender reputation and blocking risky sends", "Watching"],
                  ["Call Assist", "Preparing your team to follow up at the right time", "Ready"],
                ].map(([name, detail, state]) => (
                  <div key={name} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-white">{name}</p>
                      <span className="rounded-sm bg-[#1e322d] px-2 py-1 text-xs font-bold text-[#9df5df]">{state}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#b8cac5]">{detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-md bg-[#eefce6] p-4 text-[#111811]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#227666]">Your next step</p>
                <p className="mt-2 text-lg font-black">Tell Vega what you sell and she&apos;ll design the first campaign with you.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">From a plain-language goal to a worked pipeline.</h2>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {commandSteps.map((step, index) => (
            <div key={step.title} className="relative rounded-md border border-[#dfe6e0] bg-white p-5">
              {index < commandSteps.length - 1 ? (
                <ArrowRight className="absolute right-2 top-8 z-10 hidden rounded-full bg-[#f7f8f6] p-1 text-[#99a49d] md:block" size={26} aria-hidden="true" />
              ) : null}
              <step.icon className="text-[#00a885]" size={24} aria-hidden="true" />
              <h3 className="mt-5 text-xl font-black">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#4f5b54]">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="solutions" className="border-y border-[#e1e6e2] bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <SectionLabel>AI-Guided Campaign Setup</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Start with a conversation, not a complicated form.</h2>
            <p className="mt-5 leading-8 text-[#4f5b54]">
              Tell Vega about your business in your own words. She will research what she can, ask only the questions that
              matter, recommend the right target market, and build a campaign for your approval.
            </p>
            <OnboardingCta
              section="ai_consultation_preview"
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#111811] px-5 text-sm font-black text-white transition hover:bg-[#26332c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00a885]"
            >
              Start my Vega consultation
              <Bot size={18} aria-hidden="true" />
            </OnboardingCta>
          </div>

          <div className="rounded-lg border border-[#dfe6e0] bg-[#f8faf7] p-5">
            {[
              ["Vega", "Tell me what your business does and what kind of customers you want more of."],
              ["Customer", "I run a mobile detailing company in Tyler and want dealership and fleet accounts."],
              [
                "Vega",
                "That is a strong recurring-revenue opportunity. I recommend beginning with dealerships, fleet operators, RV dealers, and automotive referral partners within 40 miles. Who will handle follow-up calls, your team or Ghost?",
              ],
              ["Customer", "My office manager."],
              [
                "Vega",
                "Vega Convert is likely the best fit. I will source and qualify the accounts, prepare outreach, monitor responses, and create prioritized phone-assist tasks for your team.",
              ],
            ].map(([speaker, message]) => (
              <div key={`${speaker}-${message}`} className={`mb-3 flex ${speaker === "Customer" ? "justify-end" : "justify-start"} last:mb-0`}>
                <div className={`max-w-[86%] rounded-md px-4 py-3 ${speaker === "Customer" ? "bg-[#111811] text-white" : "bg-white text-[#121614] shadow-sm"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#008f75]">{speaker}</p>
                  <p className="mt-2 text-sm leading-6">{message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="relative border-b border-[#e1e6e2] bg-[#f7f8f6]">
        <SectionTracker event="proof section viewed" section="proof" />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <SectionLabel>More than another lead list</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Built for the messy middle between leads and booked calls.</h2>
            <p className="mt-5 leading-8 text-[#4f5b54]">
              Vega does more than add names to a spreadsheet. She watches lead quality, message performance, delivery
              risk, replies, phone follow-up, and calendar movement so your team knows where real opportunities are coming from.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {customerMetrics.map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#dfe6e0] bg-white p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#5f6b64]">{label}</p>
                <p className="mt-3 text-lg font-black leading-7 text-[#111811]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTracker event="pricing section viewed" section="plans" />
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <SectionLabel>Plans</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Choose how much of the sales process Vega handles.</h2>
            <p className="mt-5 max-w-3xl leading-8 text-[#4f5b54]">
              Plans scale based on qualified lead volume, outreach volume, territories, integrations, and the level of
              human support required. The AI onboarding experience recommends the right level after understanding your needs.
            </p>
          </div>
          <OnboardingCta
            section="plans_header"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#111811] px-5 text-sm font-black text-white transition hover:bg-[#26332c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00a885]"
          >
            Compare Vega options
            <MousePointerClick size={17} aria-hidden="true" />
          </OnboardingCta>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {publicVegaPlans.map((plan) => (
            <div key={plan.code} className="flex rounded-md border border-[#dfe6e0] bg-white p-6">
              <div className="flex w-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p className="mt-2 text-sm font-black text-[#008f75]">{plan.priceLabel}</p>
                  </div>
                  <CheckCircle2 className="shrink-0 text-[#00a885]" size={22} aria-hidden="true" />
                </div>
                <p className="mt-5 font-bold text-[#354039]">{plan.target}</p>
                <p className="mt-3 text-sm leading-6 text-[#4f5b54]">{plan.vegaHandles}</p>
                <p className="mt-3 text-sm leading-6 text-[#4f5b54]">
                  <span className="font-bold text-[#111811]">Customer role:</span> {plan.customerHandles}
                </p>
                <p className="mt-3 text-sm font-bold leading-6 text-[#111811]">{plan.outcome}</p>
                <OnboardingCta
                  section="product_card"
                  productCode={plan.code}
                  event="product card selected"
                  className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-[#cfd8d1] px-4 text-sm font-black text-[#111811] transition hover:border-[#00a885] hover:text-[#00745f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00a885]"
                >
                  Explore {plan.name}
                </OnboardingCta>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="results" className="relative border-y border-[#e1e6e2] bg-white">
        <SectionTracker event="results section viewed" section="results" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <SectionLabel>Vega in active use</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Internal Ghost AI Solutions operating data.</h2>
            <p className="mt-5 leading-8 text-[#4f5b54]">
              These are internal operating signals from Ghost AI Solutions workflows. They are not guarantees, testimonials,
              or promised customer outcomes.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {publicOperatingProof.map((proof) => (
              <div key={proof.label} className="rounded-md border border-[#dfe6e0] bg-[#f8faf7] p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#5f6b64]">{proof.label}</p>
                <p className="mt-3 font-mono text-4xl font-black text-[#111811]">{proof.value}</p>
                <p className="mt-3 text-sm leading-6 text-[#4f5b54]">{proof.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <SectionLabel>Who Vega is for</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Built for businesses that need a repeatable pipeline.</h2>
            <div className="mt-8 flex flex-wrap gap-2">
              {fitGroups.map((group) => (
                <span key={group} className="rounded-md border border-[#dfe6e0] bg-white px-3 py-2 text-sm font-bold text-[#3f4a43]">
                  {group}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#dfe6e0] bg-white p-6">
            <h3 className="text-2xl font-black">Vega works best when:</h3>
            <div className="mt-5 grid gap-3">
              {vegaWorksBest.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-[#4f5b54]">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#00a885]" size={18} aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-md bg-[#f1f5f1] p-4 text-sm leading-6 text-[#3f4a43]">
              Vega is not a guaranteed-sales product or a mass-spam system. It is a supervised customer-acquisition
              platform designed to create and work qualified pipeline.
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-lg bg-[#111811] px-6 py-10 text-white sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[#caff4d]">
                <ShieldCheck size={20} aria-hidden="true" />
                <span className="text-sm font-black uppercase tracking-[0.18em]">Supervised autonomy</span>
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Start with control. Scale with automation.</h2>
              <p className="mt-4 max-w-3xl leading-8 text-[#d6e1dc]">
                Approve every step, let Vega handle selected tasks, or have Ghost manage the full campaign. You decide how
                much control to keep.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <OnboardingCta
                section="final_cta"
                event="final CTA clicked"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#caff4d] px-6 text-sm font-black text-[#111811] transition hover:bg-[#bdf137] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caff4d]"
              >
                Start my Vega consultation
                <Bot size={18} aria-hidden="true" />
              </OnboardingCta>
              <OnboardingCta
                section="final_compare"
                event="final CTA clicked"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/20 px-6 text-sm font-black text-white transition hover:border-[#caff4d] hover:text-[#caff4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#caff4d]"
              >
                Compare Vega options
                <ArrowRight size={18} aria-hidden="true" />
              </OnboardingCta>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#dfe4df] px-4 py-8 text-sm text-[#68736d] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Ghost Lead Command</p>
          <div className="flex flex-wrap gap-4">
            <Link href="#how-it-works" className="hover:text-[#111811]">
              How it works
            </Link>
            <Link href="#plans" className="hover:text-[#111811]">
              Plans
            </Link>
            <Link href="/command" className="hover:text-[#111811]">
              Sign in
            </Link>
            <Link href="/onboarding/ai" className="hover:text-[#111811]">
              AI onboarding
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
