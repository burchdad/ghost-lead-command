import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";

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

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#05090a] text-white">
      <section className="relative isolate min-h-[92vh] overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[#05090a]" />
        <div className="absolute inset-0 opacity-80">
          <div className="h-full w-full bg-[linear-gradient(rgba(216,255,95,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(131,208,194,0.05)_1px,transparent_1px)] bg-[size:44px_44px]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05090a] to-transparent" />

        <div className="absolute right-[-4rem] top-24 hidden w-[58rem] max-w-[64vw] rotate-[-3deg] lg:block">
          <div className="rounded-md border border-white/10 bg-[#0d1416]/90 p-4 shadow-2xl shadow-black/60 backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#83d0c2]">Vega command view</p>
                <p className="mt-1 text-lg font-semibold">Live lead operating system</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#d8ff5f]">
                <span className="h-2 w-2 rounded-full bg-[#d8ff5f]" />
                Online
              </div>
            </div>
            <div className="grid gap-3 pt-4 md:grid-cols-3">
              {proofPoints.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-md border border-white/10 bg-[#111b1d] p-4">
                  <Icon className="text-[#d8ff5f]" size={22} />
                  <p className="mt-4 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#aebbb7]">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-md border border-white/10 bg-[#071011] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Waitlist contestants</p>
                  <Users size={18} className="text-[#83d0c2]" />
                </div>
                {lanes.map((lane) => (
                  <div key={lane.name} className="mb-3 rounded-md border border-white/10 bg-[#101719] p-3 last:mb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{lane.name}</p>
                      <span className="rounded-sm bg-[#d8ff5f] px-2 py-1 text-xs font-semibold text-[#101417]">
                        {lane.count}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#aebbb7]">{lane.detail}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-white/10 bg-[#111719] p-4">
                <p className="text-sm font-semibold">Next best actions</p>
                <div className="mt-4 space-y-3">
                  {workflow.slice(0, 3).map((item) => (
                    <div key={item} className="flex gap-3 text-sm text-[#dfe7e3]">
                      <CheckCircle2 className="mt-0.5 shrink-0 text-[#d8ff5f]" size={18} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto flex min-h-[92vh] max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md bg-[#d8ff5f] text-[#101417]">
                <Bot size={22} />
              </span>
              <span>
                <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-[#83d0c2]">
                  Ghost AI Solutions
                </span>
                <span className="block text-sm text-[#aebbb7]">Lead Command</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={waitlistHref}
                className="hidden items-center gap-2 rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-[#d8ff5f] hover:text-[#d8ff5f] sm:inline-flex"
              >
                <Sparkles size={16} />
                Join waitlist
              </Link>
              <Link
                href="/access?next=/command"
                className="inline-flex size-10 items-center justify-center rounded-md border border-white/15 text-[#aebbb7] transition hover:border-[#83d0c2] hover:text-white"
                aria-label="Operator access"
              >
                <LockKeyhole size={18} />
              </Link>
            </div>
          </header>

          <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[0.88fr_1.12fr]">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-sm border border-[#83d0c2]/35 bg-[#0d1617]/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#83d0c2]">
                <ShieldCheck size={15} />
                Private beta intake is open
              </p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
                Vega Lead Command
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#d7dfdc] sm:text-xl">
                An AI sales operating system for discovering qualified prospects, reading buying signals, drafting outreach, and turning replies into booked revenue.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={waitlistHref}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[#d8ff5f] px-5 py-3 text-sm font-semibold text-[#101417] transition hover:bg-white"
                >
                  Enter the Vega waitlist
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="#system"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#83d0c2] hover:text-[#83d0c2]"
                >
                  See the system
                  <Layers3 size={18} />
                </Link>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-[#8f9d99]">
                Early access is prioritized for teams that can actively test Vega, share feedback, and prove where the lead-generation workflow should go next.
              </p>
            </div>

            <div className="lg:hidden">
              <div className="rounded-md border border-white/10 bg-[#0d1416] p-4 shadow-2xl shadow-black/50">
                <p className="text-sm font-semibold">Vega waitlist lanes</p>
                <div className="mt-4 space-y-3">
                  {lanes.map((lane) => (
                    <div key={lane.name} className="rounded-md border border-white/10 bg-[#101719] p-3">
                      <p className="text-sm font-semibold">{lane.name}</p>
                      <p className="mt-1 text-xs leading-5 text-[#aebbb7]">{lane.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="system" className="border-b border-white/10 bg-[#081011] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#83d0c2]">What Vega runs</p>
              <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">A sales operator with a waitlist brain built in.</h2>
              <p className="mt-4 text-base leading-7 text-[#aebbb7]">
                The public intake does more than collect emails. It scores fit, captures source attribution, routes contestants into CRM records, and gives operators a private dashboard for choosing beta and design-partner candidates.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map((item) => (
                <div key={item} className="rounded-md border border-white/10 bg-[#0f1719] p-5">
                  <CheckCircle2 className="text-[#d8ff5f]" size={22} />
                  <p className="mt-4 text-sm font-semibold leading-6">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#05090a] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#83d0c2]">Early access</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Join the contestant pool for the private Vega rollout.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#aebbb7]">
              Tell Vega what your sales motion looks like, what tools you use now, and where your lead flow breaks. Strong matches are flagged for review in the operator dashboard.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link
              href={waitlistHref}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#d8ff5f] px-5 py-3 text-sm font-semibold text-[#101417] transition hover:bg-white"
            >
              Join the waitlist
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/access?next=/command"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-[#83d0c2] hover:text-[#83d0c2]"
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
