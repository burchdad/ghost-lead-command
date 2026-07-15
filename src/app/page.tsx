import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  LockKeyhole,
  MailCheck,
  MessageCircle,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Link from "next/link";
import VegaAvatar from "@/components/VegaAvatar";

const waitlistHref =
  "/waitlist?utm_source=site&utm_medium=landing&utm_campaign=vega_public_home&utm_content=primary_cta";

const proofPoints = [
  { label: "Signal capture", value: "Intent, referrals, replies", icon: Radar },
  { label: "Lead command", value: "Score, route, follow up", icon: Target },
  { label: "Operator view", value: "Pipeline, outreach, waitlist", icon: Gauge },
];

const workflow = [
  "Find qualified prospects and buying signals",
  "Draft personal outreach with human approval",
  "Track replies, booking chances, and next actions",
  "Review Vega early-access contestants in one command lane",
];

const lanes = [
  { name: "Founding fit", detail: "High urgency, active tester, real lead volume", count: "Priority" },
  { name: "Private beta", detail: "Strong workflow match and feedback appetite", count: "Next" },
  { name: "Product updates", detail: "Keep warm until the right access window opens", count: "Nurture" },
];

const storyLines = [
  "Vega finds the right prospects before your calendar goes quiet.",
  "Then she watches intent, writes outreach, and keeps follow-up moving.",
  "Your team approves the work while Vega keeps the pipeline awake.",
];

const steps = [
  {
    title: "Join the waitlist",
    detail: "Tell Vega your lead volume, current tools, sales motion, and where follow-up breaks.",
    icon: Sparkles,
  },
  {
    title: "Get scored by fit",
    detail: "Vega segments founding, private-beta, and nurture candidates for operator review.",
    icon: Target,
  },
  {
    title: "Pilot the command loop",
    detail: "Selected testers get a guided path for discovery, outreach, replies, booking, and CRM updates.",
    icon: Workflow,
  },
];

const commandSignals = [
  { label: "Lead discovery", value: "PDL, Google, LinkedIn, web, social", icon: Search },
  { label: "Intent intelligence", value: "Buying signals, competitor cues, profile activity", icon: Radar },
  { label: "Account intelligence", value: "Research context and qualification notes", icon: BrainCircuit },
  { label: "Outreach generation", value: "Personalized email, social, SMS-ready drafts", icon: MailCheck },
  { label: "Reply conversion", value: "Classify replies, prep answers, route hot leads", icon: MessageCircle },
  { label: "Booking handoff", value: "Tasks, calendar-ready next steps, follow-up prompts", icon: CalendarCheck },
  { label: "Revenue ops", value: "CRM, pipeline, proposals, source attribution", icon: BarChart3 },
  { label: "Always-on learning", value: "Performance signals improve the next play", icon: Zap },
];

const integrations = ["Google", "LinkedIn", "HubSpot", "Salesforce", "Apollo", "Clay", "GoHighLevel", "SendGrid"];

const comparisonRows = [
  ["Multi-source prospecting", "Included", "Manual or fragmented"],
  ["Intent scoring", "Built in", "Usually separate"],
  ["Human-approved outreach", "Native", "Requires workflow glue"],
  ["Waitlist and beta qualification", "Native", "Usually forms only"],
  ["CRM and revenue view", "Operator dashboard", "Often disconnected"],
];

const faqs = [
  {
    question: "Is Vega replacing my sales team?",
    answer: "No. Vega does the lead-command work around the team: discovery, signal watching, drafts, follow-up prompts, and routing. Humans still approve strategy and relationships.",
  },
  {
    question: "Who gets priority access?",
    answer: "Teams with clear lead volume, active testing intent, and a sales motion where Vega can prove measurable lift get reviewed first.",
  },
  {
    question: "Does joining guarantee beta access?",
    answer: "No. The waitlist helps Vega qualify good testers, but invitations depend on fit, rollout capacity, and feedback potential.",
  },
  {
    question: "Can Vega work with my existing stack?",
    answer: "The product is designed around CRM, outreach, signal, and enrichment tools. Early access helps prioritize which integrations become first-class.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#03020a] text-white">
      <section className="relative isolate min-h-[92vh] overflow-hidden border-b border-[#7c3aed]/25">
        <div className="absolute inset-0 bg-[#03020a]" />
        <div className="absolute inset-0 opacity-80">
          <div className="h-full w-full bg-[linear-gradient(rgba(139,92,246,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.09)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>
        <div className="absolute left-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_26%_18%,rgba(124,58,237,0.46),transparent_34%),radial-gradient(circle_at_60%_58%,rgba(76,29,149,0.35),transparent_32%)]" />
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_80%_22%,rgba(127,29,29,0.24),transparent_32%)]" />
        <div className="absolute left-1/2 top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-[#a855f7] to-transparent opacity-70 lg:block" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#03020a] to-transparent" />

        <div className="absolute right-[-4rem] top-24 hidden w-[58rem] max-w-[64vw] rotate-[-3deg] lg:block">
          <div className="rounded-md border border-[#8b5cf6]/30 bg-[#090713]/90 p-4 shadow-2xl shadow-[#3b0764]/50 backdrop-blur">
            <div className="flex items-center justify-between border-b border-[#8b5cf6]/25 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#c084fc]">Vega command view</p>
                <p className="mt-1 text-lg font-semibold text-[#f5f3ff]">Live lead operating system</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#c084fc]">
                <span className="h-2 w-2 rounded-full bg-[#a855f7] shadow-[0_0_18px_rgba(168,85,247,0.95)]" />
                Online
              </div>
            </div>
            <div className="grid gap-3 pt-4 md:grid-cols-3">
              {proofPoints.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-md border border-[#8b5cf6]/25 bg-[#120c22] p-4">
                  <Icon className="text-[#a855f7]" size={22} />
                  <p className="mt-4 text-sm font-semibold text-[#f5f3ff]">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-md border border-[#8b5cf6]/25 bg-[#07040f] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#f5f3ff]">Waitlist contestants</p>
                  <Users size={18} className="text-[#c084fc]" />
                </div>
                {lanes.map((lane) => (
                  <div key={lane.name} className="mb-3 rounded-md border border-[#8b5cf6]/20 bg-[#120c22] p-3 last:mb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#f5f3ff]">{lane.name}</p>
                      <span className="rounded-sm bg-[#7c3aed] px-2 py-1 text-xs font-semibold text-white shadow-[0_0_18px_rgba(124,58,237,0.55)]">
                        {lane.count}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">{lane.detail}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-[#8b5cf6]/25 bg-[#120c22] p-4">
                <p className="text-sm font-semibold text-[#f5f3ff]">Next best actions</p>
                <div className="mt-4 space-y-3">
                  {workflow.slice(0, 3).map((item) => (
                    <div key={item} className="flex gap-3 text-sm text-[#ede9fe]">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-[#a855f7]" size={18} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <VegaAvatar
            size="md"
            caption="Vega watching"
            className="absolute -left-16 bottom-[-3.5rem] rotate-[3deg]"
          />
        </div>

        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
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
            <div className="flex items-center gap-2">
              <Link
                href={waitlistHref}
                className="hidden items-center gap-2 rounded-md border border-[#8b5cf6]/45 bg-[#10091f]/70 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#c084fc] hover:text-[#c084fc] sm:inline-flex"
              >
                <Sparkles size={16} />
                Join waitlist
              </Link>
              <Link
                href="/access?next=/command"
                className="inline-flex size-10 items-center justify-center rounded-md border border-[#8b5cf6]/35 text-[#c4b5fd] transition hover:border-[#c084fc] hover:text-white"
                aria-label="Operator access"
              >
                <LockKeyhole size={18} />
              </Link>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[0.78fr_0.42fr_0.8fr]">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-sm border border-[#8b5cf6]/45 bg-[#120822]/85 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c084fc]">
                <ShieldCheck size={15} />
                Private beta intake is open
              </p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-[#f7f4ff] sm:text-6xl lg:text-7xl">
                Vega Lead Command
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#ded7f7] sm:text-xl">
                An AI sales operating system for discovering qualified prospects, reading buying signals, drafting outreach, and turning replies into booked revenue.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={waitlistHref}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.48)] transition hover:bg-[#a855f7]"
                >
                  Enter the Vega waitlist
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="#system"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-[#8b5cf6]/45 bg-[#090713]/70 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#c084fc] hover:text-[#c084fc]"
                >
                  See the system
                  <Layers3 size={18} />
                </Link>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#aaa0c7]">
                Early access is prioritized for teams that can actively test Vega, share feedback, and prove where the lead-generation workflow should go next.
              </p>
            </div>

            <div className="relative z-20 hidden justify-center lg:flex">
              <VegaAvatar size="lg" caption="I build your pipeline" />
            </div>

            <div className="lg:hidden">
              <div className="rounded-md border border-[#8b5cf6]/30 bg-[#090713] p-4 shadow-2xl shadow-[#3b0764]/40">
                <div className="mb-4 flex items-center gap-4">
                  <VegaAvatar size="sm" showStatus={false} className="shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#f5f3ff]">Vega waitlist lanes</p>
                    <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">Your AI lead command teammate is sorting early access fit.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {lanes.map((lane) => (
                    <div key={lane.name} className="rounded-md border border-[#8b5cf6]/25 bg-[#120c22] p-3">
                      <p className="text-sm font-semibold text-[#f5f3ff]">{lane.name}</p>
                      <p className="mt-1 text-xs leading-5 text-[#c4b5fd]">{lane.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#05030b] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-5xl gap-8 text-center">
          <VegaAvatar size="md" caption="Always learning" className="mx-auto" />
          <div className="grid gap-4">
            {storyLines.map((line) => (
              <p key={line} className="text-xl font-semibold leading-8 text-[#f5f3ff] sm:text-2xl">
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section id="system" className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">What Vega runs</p>
              <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">A sales operator with a waitlist brain built in.</h2>
              <p className="mt-4 text-base leading-7 text-[#b9afd3]">
                The public intake does more than collect emails. It scores fit, captures source attribution, routes contestants into CRM records, and gives operators a private dashboard for choosing beta and design-partner candidates.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map((item) => (
                <div key={item} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                  <CheckCircle2 className="text-[#a855f7]" size={22} />
                  <p className="mt-4 text-sm font-semibold leading-6 text-[#f5f3ff]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">3 steps to get started</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">From waitlist to working lead command.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(({ title, detail, icon: Icon }, index) => (
              <div key={title} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <div className="flex items-center justify-between">
                  <Icon className="text-[#a855f7]" size={24} />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c4b5fd]">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#f5f3ff]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#b9afd3]">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">Command signals</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">Vega works the whole lead-to-revenue path.</h2>
            <p className="mt-4 text-base leading-7 text-[#b9afd3]">
              Like the Soro flow, the story should keep proving what happens after the first click. Vega follows the prospect from signal to outreach to reply to booked opportunity.
            </p>
            <VegaAvatar size="md" caption="Signal lock" className="mt-8" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {commandSignals.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] p-5">
                <Icon className="text-[#a855f7]" size={22} />
                <h3 className="mt-4 text-base font-semibold text-[#f5f3ff]">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-[#b9afd3]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">Works with your stack</p>
              <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">Vega learns where your current tools stop.</h2>
              <p className="mt-4 text-base leading-7 text-[#b9afd3]">
                The waitlist helps prioritize the first-class integrations that matter most to real operators.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-[#8b5cf6]/30 bg-[#10091f] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#c4b5fd]">
                <Globe2 size={16} />
                Integration requests shape the roadmap
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {integrations.map((integration) => (
                <div key={integration} className="rounded-md border border-[#8b5cf6]/25 bg-[#10091f] px-4 py-5 text-center text-sm font-semibold text-[#ede9fe]">
                  {integration}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#07040f] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">One operator, not another tab</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">Vega is the command layer across the sales workflow.</h2>
            <p className="mt-4 text-base leading-7 text-[#b9afd3]">
              The goal is not another dashboard to babysit. Vega helps decide who to pursue, what to say, and what needs action next.
            </p>
          </div>
          <div className="overflow-hidden rounded-md border border-[#8b5cf6]/25 bg-[#10091f]">
            {comparisonRows.map(([item, vega, other], index) => (
              <div key={item} className={`grid gap-3 px-4 py-4 text-sm sm:grid-cols-[1.1fr_0.75fr_0.75fr] ${index ? "border-t border-[#8b5cf6]/20" : ""}`}>
                <span className="font-semibold text-[#f5f3ff]">{item}</span>
                <span className="inline-flex items-center gap-2 text-[#c4b5fd]">
                  <CheckCircle2 size={16} className="text-[#a855f7]" />
                  {vega}
                </span>
                <span className="text-[#8f83ad]">{other}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#7c3aed]/25 bg-[#03020a] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">FAQ</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">Questions before Vega joins the team?</h2>
          </div>
          <div className="mt-10 divide-y divide-[#8b5cf6]/20 overflow-hidden rounded-md border border-[#8b5cf6]/25 bg-[#10091f]">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-[#f5f3ff]">
                  {question}
                  <Star className="shrink-0 text-[#a855f7] transition group-open:rotate-45" size={18} />
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#b9afd3]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#03020a] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_0.55fr_0.75fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c084fc]">Early access</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#f7f4ff] sm:text-4xl">Join the contestant pool for the private Vega rollout.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#b9afd3]">
              Tell Vega what your sales motion looks like, what tools you use now, and where your lead flow breaks. Strong matches are flagged for review in the operator dashboard.
            </p>
          </div>
          <div className="hidden justify-center lg:flex">
            <VegaAvatar size="md" caption="Ready to qualify" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href={waitlistHref}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(124,58,237,0.48)] transition hover:bg-[#a855f7]"
            >
              Join the waitlist
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/access?next=/command"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[#8b5cf6]/45 bg-[#090713]/70 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#c084fc] hover:text-[#c084fc]"
            >
              Operator access
              <KeyRound size={18} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
