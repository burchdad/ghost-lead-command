import type { Metadata } from "next";
import {
  ArrowRight,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  MailCheck,
  MessageCircle,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import VegaAvatar from "@/components/VegaAvatar";
import { SectionTracker, TrackedDetails, TrackedLink } from "@/components/VegaLandingClient";

export const metadata: Metadata = {
  metadataBase: new URL("https://leadgen.ghostai.solutions"),
  title: "Vega Lead Command | AI Prospecting, Outreach and Sales Operations",
  description:
    "Vega is an AI lead command system that discovers high-fit prospects, identifies buying signals, prepares personalized outreach, manages follow-up, and helps move replies toward booked meetings.",
  openGraph: {
    title: "Vega Lead Command | AI Prospecting, Outreach and Sales Operations",
    description:
      "Discover high-fit prospects, identify buying signals, prepare personalized outreach, manage follow-up, and move replies toward booked meetings.",
    url: "https://leadgen.ghostai.solutions",
    siteName: "Ghost AI Solutions",
    images: [{ url: "/vega-avatar.png", width: 640, height: 960, alt: "Vega AI lead command avatar" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vega Lead Command",
    description: "AI prospecting, outreach, and sales operations for teams that need more than another lead list.",
    images: ["/vega-avatar.png"],
  },
};

const navLinks = [
  { label: "How Vega Works", href: "#workflow" },
  { label: "Specialist Team", href: "#specialists" },
  { label: "Integrations", href: "#integrations" },
  { label: "Comparison", href: "#comparison" },
  { label: "FAQ", href: "#faq" },
];

const simpleWorkflow = [
  {
    title: "First, Vega finds businesses that match your ideal customer.",
    detail: "Targets are shaped by your offer, territory, industries, exclusions, and sales goals.",
    icon: Target,
  },
  {
    title: "Then Vega watches for buying signals and researches what matters.",
    detail: "Intent cues, website context, social signals, and account facts are collected before outreach.",
    icon: Radar,
  },
  {
    title: "Vega prepares personalized outreach and follow-ups for your approval.",
    detail: "Drafts stay in an approval workflow so operators can review before anything important moves.",
    icon: MailCheck,
  },
  {
    title: "When prospects reply, Vega helps move them toward the next action.",
    detail: "Replies are classified, tasks are prepared, and booking-ready opportunities stay visible.",
    icon: MessageCircle,
  },
];

const operatingMetrics = [
  ["Qualified prospects ranked", "14"],
  ["Outreach drafts prepared", "6"],
  ["Follow-ups due", "9"],
  ["Replies classified", "2"],
  ["Booking tasks created", "3"],
  ["Active lead sources", "7"],
];

const commandCallouts: Array<{ label: string; detail: string; icon: LucideIcon }> = [
  { label: "14 prospects ranked", detail: "ICP match, location, signal strength", icon: Radar },
  { label: "6 outreach drafts ready", detail: "Human approval required", icon: MailCheck },
  { label: "2 replies need attention", detail: "Hot and objection lanes", icon: MessageCircle },
];

const startSteps = [
  {
    title: "Tell Vega who you sell to",
    copy: "Add your ideal customer, offer, target location, preferred industries, and sales goals.",
  },
  {
    title: "Vega finds and prepares opportunities",
    copy: "Prospects are discovered, researched, scored, and turned into approval-ready actions.",
  },
  {
    title: "You approve. Vega keeps working.",
    copy: "Outreach, follow-ups, replies, booking tasks, and CRM updates stay organized in one workflow.",
  },
];

const prospectJourney = [
  {
    stage: "Signal detected",
    copy: "The company is hiring sales representatives and increasing local advertising activity.",
    icon: Radar,
  },
  {
    stage: "Account intelligence",
    copy: "The website has no instant lead-response workflow and weak follow-up visibility.",
    icon: BrainCircuit,
  },
  {
    stage: "Vega recommendation",
    copy: "Offer an AI lead-response and sales follow-up system.",
    icon: Sparkles,
  },
  {
    stage: "Outreach draft",
    copy: "Noticed East Texas Roofing is expanding its sales effort. We help service businesses respond faster, prioritize qualified inquiries, and keep follow-up from going cold. Would it be useful to compare your current process with an AI-assisted lead command workflow?",
    icon: MailCheck,
  },
  {
    stage: "Reply classified",
    copy: "This sounds interesting. What would something like this cost?",
    meta: "Classification: Hot",
    icon: MessageCircle,
  },
  {
    stage: "Next action",
    copy: "Booking Concierge prepares meeting options and updates the CRM.",
    icon: CalendarCheck,
  },
];

const specialists = [
  ["Intent Scout", "Finds buying signals, competitor cues, and high-fit accounts.", "Live"],
  ["Account Intelligence", "Researches companies, contacts, websites, and qualification context.", "Assisted"],
  ["Copy Chief", "Scores and improves outreach before operator approval.", "Live"],
  ["Cadence Orchestrator", "Keeps eligible follow-ups moving without overwhelming the queue.", "Live"],
  ["Reply Agent", "Classifies responses and prepares recommended next steps.", "Live"],
  ["Booking Concierge", "Moves interested prospects toward calendar-ready actions.", "Beta"],
  ["Deliverability Governor", "Protects sender health and suppresses risky contacts.", "Live"],
  ["Revenue Watch", "Tracks which sources, signals, and plays create pipeline movement.", "Assisted"],
];

const lifecycle = ["Discover", "Research", "Score", "Draft", "Approve", "Follow up", "Classify replies", "Book", "Update CRM", "Learn"];

const capabilityGroups = [
  ["Lead discovery", "Google, LinkedIn imports, PDL, websites, social signals, and external sources."],
  ["Intent intelligence", "Buying signals, competitor cues, social context, and contactability."],
  ["Personalized outreach", "Email, social-task, manual-contact, and SMS-ready workflows."],
  ["Reply conversion", "Classification, response drafts, objections, and next actions."],
  ["Booking workflow", "Tasks, calendar handoff, follow-up prompts, and CRM updates."],
  ["Revenue learning", "Source performance, signal quality, reply rates, and winning plays."],
];

const integrationGroups = [
  {
    title: "Prospecting and intelligence",
    items: [
      ["Google", "Beta"],
      ["LinkedIn", "Import supported"],
      ["People Data Labs", "Beta"],
      ["Perplexity", "Beta"],
      ["Apollo", "Import supported"],
      ["Clay", "Import supported"],
    ],
  },
  {
    title: "CRM and pipeline",
    items: [
      ["Ghost CRM", "Available"],
      ["GoHighLevel", "Planned"],
      ["HubSpot", "Planned"],
      ["Salesforce", "Planned"],
    ],
  },
  {
    title: "Outreach and communications",
    items: [
      ["SendGrid", "Available"],
      ["Twilio", "Beta"],
      ["Telnyx", "Planned"],
      ["Slack", "Available"],
    ],
  },
  {
    title: "Infrastructure and AI",
    items: [
      ["OpenAI", "Available"],
      ["PostgreSQL", "Available"],
      ["Vercel", "Available"],
      ["Railway", "Planned"],
    ],
  },
];

const comparisonRows = [
  ["Multi-source lead discovery", "Included", "Usually one database or source"],
  ["Buying-signal prioritization", "Built into ranking", "Often a separate add-on"],
  ["Account research", "Connected to lead context", "Usually manual"],
  ["Human-approved outreach", "Native approval workflow", "Templates or uncontrolled automation"],
  ["Reply and booking workflow", "Included", "Separate inbox and calendar steps"],
  ["CRM and revenue view", "Connected to pipeline activity", "Often disconnected"],
  ["Specialist AI agents", "Coordinated team", "Single assistant or feature"],
  ["Learning from outcomes", "Source and signal feedback loop", "Campaign reporting only"],
];

const audiences = [
  "Agencies",
  "B2B service businesses",
  "Consultants",
  "Founders running outbound",
  "Sales teams",
  "Local service companies",
  "Fractional executives",
  "Multi-location businesses",
];

const strongFits = [
  "leads come from multiple sources",
  "follow-ups are inconsistent",
  "sales activity is difficult to prioritize",
  "operators need approval before sending",
  "CRM updates are falling behind",
  "buying signals are being missed",
];

const notDesignedFor = [
  "mass spam",
  "purchased-list blasting",
  "zero-oversight auto-sending",
  "deceptive outreach",
  "teams unwilling to review early beta workflows",
];

const productFacts = [
  "12 specialist lane types are defined in the current Vega specialist runner.",
  "Lead sources include source intake, CSV/import paths, LinkedIn task lanes, social intent, and intent-feed routes.",
  "Approval-queue routes support approve, redo, reject, suppress, and batch approval actions.",
  "Reply classification, booking-task workflow, deliverability suppression, CRM sync, adaptive learning, and Slack command routes exist in the production codebase.",
];

const betaBenefits = [
  "Priority beta access",
  "Direct influence over Vega's roadmap",
  "Integration-request prioritization",
  "Founding-member pricing opportunities",
  "Complimentary workflow assessment",
  "Potential extended pilot access for selected businesses",
];

const faqs = [
  {
    question: "Is Vega replacing my sales team?",
    answer:
      "No. Vega supports operators and sales teams by preparing and coordinating work. Humans keep control over approvals, relationships, strategy, pricing, and closing.",
  },
  {
    question: "Who gets priority beta access?",
    answer:
      "Active businesses and sales teams with real workflows, meaningful lead volume, and willingness to provide feedback receive priority.",
  },
  {
    question: "Does joining guarantee beta access?",
    answer:
      "No. Joining the waitlist helps us understand fit, but invitations depend on testing readiness, rollout capacity, and available support.",
  },
  {
    question: "Can Vega work with my existing stack?",
    answer:
      "Vega currently supports selected imports, APIs, CRM activity, Slack commands, and configured outreach infrastructure. The private beta will prioritize deeper integrations based on active operator demand.",
  },
  {
    question: "Does Vega send messages automatically?",
    answer:
      "Vega is built around approval controls. Automation depends on configuration, sender health, suppression rules, and operator policy.",
  },
  {
    question: "What types of businesses is Vega designed for?",
    answer:
      "Vega is designed for agencies, B2B service businesses, consultants, founders running outbound, sales teams, local service companies, fractional executives, and multi-location businesses.",
  },
  {
    question: "How does Vega handle data and suppression?",
    answer:
      "The system includes validation, suppression records, unsubscribe handling, sender-health checks, and deliverability safeguards before risky contacts move forward.",
  },
  {
    question: "How much will Vega cost?",
    answer:
      "Final pricing has not been announced. Selected beta participants may receive founding-member opportunities based on fit and participation.",
  },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">{children}</p>;
}

function PrimaryCta({ content, event = "hero primary CTA clicked" }: { content: string; event?: string }) {
  return (
    <TrackedLink
      preserveAttribution
      content={content}
      event={event}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.48)] transition hover:bg-[#a855f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]"
    >
      Join the Vega Private Beta
      <ArrowRight size={18} />
    </TrackedLink>
  );
}

function SecondaryCta({ content = "secondary_cta", event = "hero secondary CTA clicked" }: { content?: string; event?: string }) {
  return (
    <TrackedLink
      href="#workflow"
      content={content}
      event={event}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-[#8b5cf6]/45 bg-[#090713]/70 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#c084fc] hover:text-[#c084fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]"
    >
      See How Vega Works
      <Layers3 size={18} />
    </TrackedLink>
  );
}

function CommandVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative ${compact ? "" : "rotate-[-1deg]"}`}>
      <div className="rounded-md border border-[#8b5cf6]/30 bg-[#090713]/95 p-4 shadow-2xl shadow-[#3b0764]/50 backdrop-blur">
        <div className="flex items-center justify-between border-b border-[#8b5cf6]/25 pb-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[#c084fc]">Example Vega command view</p>
            <p className="mt-1 text-lg font-semibold text-[#f5f3ff]">Pipeline movement board</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#c084fc]">
            <span className="h-2 w-2 rounded-full bg-[#a855f7] shadow-[0_0_18px_rgba(168,85,247,0.95)]" />
            Demo
          </div>
        </div>

        <div className="grid gap-3 pt-4 md:grid-cols-3">
          {commandCallouts.map(({ label, detail, icon: Icon }) => (
            <div key={label} className="rounded-md border border-[#8b5cf6]/25 bg-[#120c22] p-4">
              <Icon className="text-[#a855f7]" size={22} />
              <p className="mt-4 text-sm font-semibold text-[#f5f3ff]">{label}</p>
              <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-md border border-[#8b5cf6]/25 bg-[#07040f] p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#f5f3ff]">Opportunity queue</p>
              <Users size={18} className="text-[#c084fc]" />
            </div>
            {[
              ["High-fit local services", "Sales hiring signal, weak follow-up system", "Priority"],
              ["Agency operations", "Inbound volume and CRM gap", "Draft"],
              ["Founder-led outbound", "Manual prospecting bottleneck", "Research"],
            ].map(([name, detail, status]) => (
              <div key={name} className="mb-3 rounded-md border border-[#8b5cf6]/20 bg-[#120c22] p-3 last:mb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f5f3ff]">{name}</p>
                  <span className="rounded-sm bg-[#7c3aed] px-2 py-1 text-xs font-semibold text-white shadow-[0_0_18px_rgba(124,58,237,0.55)]">
                    {status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">{detail}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-[#8b5cf6]/25 bg-[#120c22] p-4">
            <p className="text-sm font-semibold text-[#f5f3ff]">Next best actions</p>
            <div className="mt-4 space-y-3">
              {[
                "Review six personalized drafts before sending",
                "Classify two replies and prepare meeting options",
                "Suppress risky contacts before the next cadence step",
              ].map((item) => (
                <div key={item} className="flex gap-3 text-sm text-[#ede9fe]">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-[#a855f7]" size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#03020a] text-white">
      <section className="relative isolate overflow-hidden border-b border-[#7c3aed]/25">
        <div className="absolute inset-0 bg-[#03020a]" />
        <div className="absolute inset-0 opacity-80">
          <div className="h-full w-full bg-[linear-gradient(rgba(139,92,246,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.09)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>
        <div className="absolute left-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_26%_18%,rgba(124,58,237,0.46),transparent_34%),radial-gradient(circle_at_60%_58%,rgba(76,29,149,0.35),transparent_32%)]" />
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_22%,rgba(127,29,29,0.2),transparent_32%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#03020a] to-transparent" />

        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10">
          <header className="sticky top-3 z-40 flex items-center justify-between gap-4 rounded-md border border-[#8b5cf6]/20 bg-[#05030b]/78 px-3 py-3 shadow-[0_0_28px_rgba(3,2,10,0.65)] backdrop-blur">
            <Link href="/" className="flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]">
              <span className="grid size-11 place-items-center overflow-hidden rounded-md border border-[#c084fc]/50 bg-[#160a2d] shadow-[0_0_24px_rgba(124,58,237,0.5)]">
                <VegaAvatar size="xs" showStatus={false} />
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">
                  Ghost AI Solutions
                </span>
                <span className="block text-sm text-[#d8d4e8]">Lead Command</span>
              </span>
            </Link>
            <nav aria-label="Public Vega navigation" className="hidden items-center gap-5 text-sm font-semibold text-[#c7bdf0] lg:flex">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <TrackedLink
                preserveAttribution
                content="nav_cta"
                event="hero primary CTA clicked"
                className="hidden min-h-10 items-center gap-2 rounded-md border border-[#8b5cf6]/45 bg-[#10091f]/80 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#c084fc] hover:text-[#c084fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc] sm:inline-flex"
              >
                <Sparkles size={16} />
                Join Private Beta
              </TrackedLink>
              <Link
                href="/access?next=/command"
                className="inline-flex size-10 items-center justify-center rounded-md border border-[#8b5cf6]/35 text-[#c4b5fd] transition hover:border-[#c084fc] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]"
                aria-label="Operator access"
              >
                <KeyRound size={18} />
              </Link>
            </div>
          </header>

          <div className="grid min-h-[78vh] items-center gap-12 pt-14 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-sm border border-[#8b5cf6]/45 bg-[#120822]/85 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c084fc]">
                <ShieldCheck size={15} />
                Private beta intake is open
              </p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-[#f7f4ff] sm:text-6xl lg:text-7xl">
                Turn buying signals into qualified conversations.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#ded7f7] sm:text-xl">
                Vega finds high-fit prospects, researches what matters, drafts personalized outreach, manages follow-up, and helps move interested replies toward booked meetings.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrimaryCta content="hero_primary_cta" />
                <SecondaryCta />
              </div>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#b9afd3]">
                Early access is prioritized for business owners, agencies, and sales teams that can actively test Vega and provide meaningful feedback.
              </p>
            </div>

            <div className="relative">
              <CommandVisual />
              <VegaAvatar
                size="md"
                caption="Signal lock"
                className="mx-auto mt-5 lg:absolute lg:-left-14 lg:bottom-[-4.25rem]"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="relative border-b border-[#7c3aed]/25 bg-[#05030b] px-5 py-20 sm:px-8 lg:px-10">
        <SectionTracker event="workflow section viewed" section="workflow" />
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <Eyebrow>How Vega Works</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Understand Vega in one short scroll.</h2>
              <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
                Tell Vega who you want to reach. Vega finds and prepares the opportunities. You approve the work. Vega keeps the pipeline moving.
              </p>
              <VegaAvatar size="md" caption="Guiding the workflow" className="mt-8" />
            </div>
            <div className="grid gap-4">
              {simpleWorkflow.map(({ title, detail, icon: Icon }, index) => (
                <div key={title} className="grid gap-4 rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5 sm:grid-cols-[auto_1fr]">
                  <div className="flex items-center gap-3 sm:block">
                    <span className="grid size-11 place-items-center rounded-md border border-[#8b5cf6]/35 bg-[#160a2d] text-[#c084fc]">
                      <Icon size={22} />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8f83ad]">0{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold leading-7 text-[#f5f3ff]">{title}</h3>
                    <p className="mt-2 text-base leading-7 text-[#c7bdf0]">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <Eyebrow>Live Operating View</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Vega keeps the pipeline moving.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              Instead of waiting for someone to remember the next step, Vega continually reviews signals, drafts, replies, follow-ups, booking tasks, and CRM activity.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#9c91ba]">
              Metrics below are representative demo/system-example data inside a product mockup, not verified customer outcomes.
            </p>
          </div>
          <div className="rounded-md border border-[#8b5cf6]/25 bg-[#0b0615] p-5">
            <div className="flex items-center justify-between gap-4 border-b border-[#8b5cf6]/20 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[#c084fc]">Example Vega command view</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Operational pulse</h3>
              </div>
              <Gauge className="text-[#a855f7]" size={28} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {operatingMetrics.map(([label, value]) => (
                <div key={label} className="rounded-md border border-[#8b5cf6]/20 bg-[#120c22] p-4">
                  <p className="text-3xl font-semibold text-white motion-safe:animate-[vegaMetric_900ms_ease-out_both]">{value}</p>
                  <p className="mt-2 text-sm leading-5 text-[#c7bdf0]">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Eyebrow>3 Steps To Get Started</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">From targeting to an active lead command system.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {startSteps.map(({ title, copy }, index) => (
              <div key={title} className="relative rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-6">
                {index < startSteps.length - 1 ? (
                  <ChevronRight className="absolute -right-6 top-1/2 hidden text-[#a855f7] md:block" size={28} />
                ) : null}
                <span className="grid size-11 place-items-center rounded-md bg-[#7c3aed] text-sm font-semibold text-white">0{index + 1}</span>
                <h3 className="mt-6 text-xl font-semibold text-[#f5f3ff]">{title}</h3>
                <p className="mt-3 text-base leading-7 text-[#c7bdf0]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <SectionTracker event="prospect journey viewed" section="prospect_journey" />
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <Eyebrow>Product Demonstration Example</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">See one prospect move through Vega.</h2>
              <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
                This fictional East Texas Roofing Co. example shows how discovery, research, outreach, reply handling, and booking coordination fit together.
              </p>
              <VegaAvatar size="md" caption="Watching the stage" className="mt-8" />
            </div>
            <div className="grid gap-3">
              {prospectJourney.map(({ stage, copy, meta, icon: Icon }, index) => (
                <div key={stage} className="grid gap-4 rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5 sm:grid-cols-[auto_1fr]">
                  <span className="grid size-11 place-items-center rounded-md border border-[#8b5cf6]/35 bg-[#160a2d] text-[#c084fc]">
                    <Icon size={22} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-[#f5f3ff]">{stage}</h3>
                      <span className="rounded-sm border border-[#8b5cf6]/30 px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">
                        Stage {index + 1}
                      </span>
                    </div>
                    <p className="mt-2 text-base leading-7 text-[#c7bdf0]">{copy}</p>
                    {meta ? <p className="mt-2 text-sm font-semibold text-[#c084fc]">{meta}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="specialists" className="relative border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <SectionTracker event="specialist section viewed" section="specialists" />
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <Eyebrow>One Command Layer. A Team Of Specialists.</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Meet the agents Vega coordinates.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              Vega decides which specialist should act, what requires approval, and what should happen next.
            </p>
            <div className="mt-8 flex justify-center lg:justify-start">
              <VegaAvatar size="lg" caption="Command coordinator" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {specialists.map(([name, detail, status]) => (
              <div key={name} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#f5f3ff]">{name}</h3>
                  <span className="rounded-sm border border-[#8b5cf6]/35 px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">{status}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#c7bdf0]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <Eyebrow>Lead To Revenue</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Vega works the whole lead-to-revenue path.</h2>
          </div>
          <div className="mt-10 overflow-x-auto pb-2">
            <div className="flex min-w-[920px] items-center gap-2">
              {lifecycle.map((item, index) => (
                <div key={item} className="flex items-center gap-2">
                  <div className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] px-4 py-3 text-sm font-semibold text-[#f5f3ff]">{item}</div>
                  {index < lifecycle.length - 1 ? <ChevronRight className="text-[#a855f7]" size={18} /> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilityGroups.map(([title, copy]) => (
              <div key={title} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <h3 className="text-lg font-semibold text-[#f5f3ff]">{title}</h3>
                <p className="mt-3 text-base leading-7 text-[#c7bdf0]">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="integrations" className="relative border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <SectionTracker event="integration section viewed" section="integrations" />
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Eyebrow>Works With Your Stack</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Vega works around the tools you already use.</h2>
              <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
                The private beta helps prioritize the integrations that matter most to active operators. Status labels reflect current repo capabilities and roadmap posture.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-[#8b5cf6]/30 bg-[#10091f] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">
                <Globe2 size={16} />
                Integration requests shape the roadmap
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {integrationGroups.map((group) => (
                <div key={group.title} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                  <h3 className="text-lg font-semibold text-[#f5f3ff]">{group.title}</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {group.items.map(([name, status]) => (
                      <span key={name} className="inline-flex items-center gap-2 rounded-sm border border-[#8b5cf6]/25 bg-[#07040f] px-3 py-2 text-sm text-[#ede9fe]">
                        {name}
                        <span className="text-xs font-semibold text-[#a78bfa]">{status}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="comparison" className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>One Operator, Not Another Tab</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Vega is the command layer across the sales workflow.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              This comparison is intentionally factual: Vega coordinates the work across prospecting, approval, replies, booking, CRM, and learning.
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-[#8b5cf6]/25 bg-[#10091f]">
            <table className="min-w-[720px] text-left text-sm">
              <thead className="bg-[#160a2d] text-[#f5f3ff]">
                <tr>
                  <th className="px-4 py-4 font-semibold">Capability</th>
                  <th className="px-4 py-4 font-semibold">Vega</th>
                  <th className="px-4 py-4 font-semibold">Typical lead tool</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#8b5cf6]/20">
                {comparisonRows.map(([capability, vega, typical]) => (
                  <tr key={capability}>
                    <td className="px-4 py-4 font-semibold text-[#f5f3ff]">{capability}</td>
                    <td className="px-4 py-4 text-[#c7bdf0]">{vega}</td>
                    <td className="px-4 py-4 text-[#9c91ba]">{typical}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <Eyebrow>Fit</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Built for teams that need more than another lead list.</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {audiences.map((audience) => (
              <div key={audience} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-4 text-base font-semibold text-[#f5f3ff]">
                {audience}
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-6">
              <h3 className="text-xl font-semibold text-[#f5f3ff]">Vega is a strong fit when:</h3>
              <ul className="mt-4 grid gap-3 text-base leading-7 text-[#c7bdf0]">
                {strongFits.map((item) => (
                  <li key={item} className="flex gap-3"><CheckCircle2 className="mt-1 shrink-0 text-[#a855f7]" size={18} />{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-6">
              <h3 className="text-xl font-semibold text-[#f5f3ff]">Vega is not designed for:</h3>
              <ul className="mt-4 grid gap-3 text-base leading-7 text-[#c7bdf0]">
                {notDesignedFor.map((item) => (
                  <li key={item} className="flex gap-3"><ShieldCheck className="mt-1 shrink-0 text-[#a855f7]" size={18} />{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <Eyebrow>Product Proof</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Built and tested in a real operating environment.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              Vega began as Ghost AI Solutions&apos; internal lead command system, connecting prospect discovery, qualification, outreach approval, follow-up, replies, booking tasks, CRM activity, and revenue learning.
            </p>
          </div>
          <div className="grid gap-4">
            {productFacts.map((fact) => (
              <div key={fact} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <CheckCircle2 className="text-[#a855f7]" size={22} />
                <p className="mt-3 text-base leading-7 text-[#c7bdf0]">{fact}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl">
          <CommandVisual compact />
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
          <div className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-6 text-center">
            <VegaAvatar size="md" caption="Ghost AI built" className="mx-auto" />
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">Founder photo TODO</p>
            <p className="mt-2 text-sm leading-6 text-[#c7bdf0]">No approved founder image was found in the repository, so this section uses Vega until a real Stephen Burch photo is added.</p>
          </div>
          <div>
            <Eyebrow>Founder</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Built by operators who needed a better way to sell.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              Vega began as Ghost AI Solutions&apos; internal command system. We needed one place to discover prospects, prioritize intent, prepare outreach, manage replies, and understand which activities were actually creating revenue. We are now preparing Vega for selected teams outside Ghost.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {["AI systems development", "CRM and automation workflows", "lead-generation infrastructure", "software engineering", "client delivery experience"].map((item) => (
                <div key={item} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-4 text-sm font-semibold text-[#f5f3ff]">{item}</div>
              ))}
            </div>
            <div className="mt-8">
              <PrimaryCta content="founder_cta" event="final CTA clicked" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <Eyebrow>Private Beta</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Help shape the sales operator you actually want.</h2>
            <p className="mt-5 text-lg leading-8 text-[#c7bdf0]">
              Private beta access will be limited to a small group of active operators.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {betaBenefits.map((benefit) => (
              <div key={benefit} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <Sparkles className="text-[#a855f7]" size={22} />
                <p className="mt-3 text-base font-semibold leading-7 text-[#f5f3ff]">{benefit}</p>
              </div>
            ))}
            <div className="rounded-md border border-[#8b5cf6]/25 bg-[#160a2d] p-5 sm:col-span-2">
              <p className="text-base leading-7 text-[#d8d4e8]">
                Joining the waitlist does not guarantee beta access, pricing, or a free pilot. Invitations are based on fit, testing readiness, and available capacity.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Questions before Vega joins the team?</h2>
          </div>
          <div className="mt-10 divide-y divide-[#8b5cf6]/20 overflow-hidden rounded-md border border-[#8b5cf6]/25 bg-[#10091f]">
            {faqs.map(({ question, answer }) => (
              <TrackedDetails key={question} question={question}>
                <p>{answer}</p>
              </TrackedDetails>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#03020a] px-5 py-20 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_0.55fr_0.75fr] lg:items-center">
          <div>
            <Eyebrow>Early Access</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-5xl">Ready to put Vega on your sales team?</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c7bdf0]">
              Join the private beta waitlist and tell us how your team currently finds, qualifies, contacts, and follows up with prospects.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#9c91ba]">
              No guarantee of access. No uncontrolled sending. Human approval remains central.
            </p>
          </div>
          <div className="hidden justify-center lg:flex">
            <VegaAvatar size="md" caption="Ready to qualify" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row xl:justify-end">
            <PrimaryCta content="final_primary_cta" event="final CTA clicked" />
            <SecondaryCta content="final_secondary_cta" event="hero secondary CTA clicked" />
          </div>
        </div>
      </section>
    </main>
  );
}
