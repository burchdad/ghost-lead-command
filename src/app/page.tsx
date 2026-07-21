import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  MousePointerClick,
  Radar,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

export const metadata = {
  title: "Ghost Lead Command | AI Lead Generation Directed by Vega",
  description:
    "Tell Vega what customers you need. Ghost Lead Command sources, scores, writes, sends, follows up, and routes booking-ready leads.",
};

const promptChips = [
  "Need 30 HVAC leads near Tyler, TX",
  "Find B2B service founders ready for AI follow-up",
  "Build a detailing lead sprint within 40 miles",
];

const commandSteps = [
  {
    icon: Radar,
    title: "Source",
    text: "Vega pulls from Maps, PDL, LinkedIn context, web intent, and saved signals.",
  },
  {
    icon: Target,
    title: "Qualify",
    text: "Lead fit, contactability, signal strength, and deliverability risk are scored before outreach.",
  },
  {
    icon: Send,
    title: "Reach",
    text: "ChatGPT-written emails, Slack approvals, controlled auto-send, and phone-assist tasks.",
  },
  {
    icon: CalendarCheck2,
    title: "Convert",
    text: "Replies, clicks, call outcomes, and booking handoffs move the pipeline forward.",
  },
];

const operatorMetrics = [
  ["Live sources", "Maps, PDL, LinkedIn, Perplexity"],
  ["Director", "Vega Lead Director AI"],
  ["Human loop", "Stephen, VA, Nova"],
  ["Goal", "Booked calls and retained clients"],
];

const plans = [
  {
    name: "Scout",
    target: "Find the market",
    detail: "Audience search, signal ranking, and source comparison before spending send volume.",
  },
  {
    name: "Reach",
    target: "Start conversations",
    detail: "Offer-aware email generation, approvals, auto-send limits, and event tracking.",
  },
  {
    name: "Convert",
    target: "Book the call",
    detail: "Reply classification, phone-assist tasks, booking handoffs, and CRM movement.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#121614]">
      <header className="sticky top-0 z-30 border-b border-[#dfe4df] bg-[#fbfcfa]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Ghost Lead Command home">
            <span className="grid size-9 place-items-center rounded-md bg-[#caff4d] text-[#111811]">
              <Sparkles size={19} />
            </span>
            <span className="hidden text-lg font-bold tracking-tight sm:inline">Ghost Lead Command</span>
          </Link>

          <form action="/onboarding/ai" className="mx-auto hidden w-full max-w-xl items-center md:flex">
            <label className="sr-only" htmlFor="nav-prompt">
              Enter your lead-generation task
            </label>
            <input
              id="nav-prompt"
              name="prompt"
              className="h-10 min-w-0 flex-1 rounded-l-md border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition focus:border-[#7f8cff] focus:ring-2 focus:ring-[#7f8cff]/20"
              placeholder="Enter your lead task, market, or customer type"
            />
            <button
              className="grid h-10 w-12 place-items-center rounded-r-md bg-[#111811] text-white transition hover:bg-[#243129]"
              type="submit"
              aria-label="Start lead task"
            >
              <Search size={18} />
            </button>
          </form>

          <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-[#3d4842] lg:flex">
            <a href="#system" className="hover:text-[#111811]">
              System
            </a>
            <a href="#plans" className="hover:text-[#111811]">
              Plans
            </a>
            <a href="#proof" className="hover:text-[#111811]">
              Proof
            </a>
          </nav>

          <Link
            href="/onboarding/ai"
            className="ml-auto inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[#00a885] px-4 text-sm font-bold text-white transition hover:bg-[#07866e] lg:ml-2"
          >
            Start with Vega
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#e3e8e3]">
        <div className="absolute inset-x-0 top-20 h-80 bg-[radial-gradient(circle_at_center,#d9dbff_0,#eef0ff_35%,transparent_68%)] opacity-80" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,transparent,#f7f8f6)]" />

        <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_480px] lg:px-8">
          <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#00a885]">Vega lead-to-cash command</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[#111811] sm:text-6xl">
              Tell Vega what customers you need next.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#58645d] lg:mx-0">
              A command center for sourcing, scoring, outreach, phone follow-up, booking handoffs, and revenue
              attribution, built around your instructions in Slack.
            </p>

            <form
              action="/onboarding/ai"
              className="mx-auto mt-9 flex max-w-2xl flex-col gap-3 rounded-lg border border-[#ced8d1] bg-white p-2 shadow-[0_24px_80px_rgba(34,43,38,0.12)] sm:flex-row lg:mx-0"
            >
              <label className="sr-only" htmlFor="hero-prompt">
                Lead command
              </label>
              <input
                id="hero-prompt"
                name="prompt"
                className="min-h-14 min-w-0 flex-1 rounded-md px-4 text-base outline-none"
                placeholder="Example: Need 30 detailing leads near Tyler, TX"
              />
              <button
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-[#7c5cff] px-6 text-base font-black text-white transition hover:bg-[#6848e8]"
                type="submit"
              >
                Start now
                <ArrowRight size={18} />
              </button>
            </form>

            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap gap-2 lg:mx-0">
              {promptChips.map((chip) => (
                <Link
                  key={chip}
                  href={`/onboarding/ai?prompt=${encodeURIComponent(chip)}`}
                  className="rounded-md border border-[#d9dfda] bg-white/80 px-3 py-2 text-sm font-semibold text-[#465049] transition hover:border-[#00a885] hover:text-[#0a715f]"
                >
                  {chip}
                </Link>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <div className="rounded-lg border border-[#d5ddd6] bg-[#101817] p-4 shadow-[0_32px_90px_rgba(17,24,17,0.24)]">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <Image
                  src="/vega-avatar.png"
                  width={54}
                  height={54}
                  alt="Vega AI agent avatar"
                  className="rounded-md border border-[#caff4d]/30 bg-[#1b2522]"
                  priority
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#82ded0]">Online director</p>
                  <h2 className="text-xl font-black text-white">Vega is coordinating</h2>
                </div>
                <span className="ml-auto rounded-md bg-[#caff4d] px-2 py-1 text-xs font-black text-[#111811]">live</span>
              </div>

              <div className="mt-4 grid gap-3">
                {[
                  ["Source Agent", "finding intent-matched accounts", "active"],
                  ["Offer Agent", "rewriting outreach with buyer pain", "active"],
                  ["Deliverability Agent", "protecting sender health", "watching"],
                  ["Phone Assist Agent", "routing follow-up calls", "ready"],
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
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#227666]">Next best action</p>
                <p className="mt-2 text-lg font-black">Approve the warmest daily batch and push phone assist after delivery.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="system" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-4">
          {commandSteps.map((step) => (
            <div key={step.title} className="rounded-md border border-[#dfe6e0] bg-white p-5">
              <step.icon className="text-[#00a885]" size={24} />
              <h3 className="mt-5 text-xl font-black">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#5b6760]">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="proof" className="border-y border-[#e1e6e2] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#00a885]">Operator proof</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Built for the messy middle between leads and booked calls.</h2>
            <p className="mt-5 leading-8 text-[#5b6760]">
              Vega does more than add names to a list. She watches source quality, message performance, bounce risk,
              clicks, call assists, reply intent, and calendar movement so the system learns where revenue is actually
              coming from.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {operatorMetrics.map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#dfe6e0] bg-[#f8faf7] p-5">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#6d7972]">{label}</p>
                <p className="mt-3 text-xl font-black text-[#111811]">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#00a885]">Commercial motion</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Three lanes. One director.</h2>
          </div>
          <Link
            href="/onboarding/ai"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#111811] px-5 text-sm font-black text-white transition hover:bg-[#26332c]"
          >
            Build my lead engine
            <MousePointerClick size={17} />
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className="rounded-md border border-[#dfe6e0] bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black">{plan.name}</h3>
                <CheckCircle2 className="text-[#00a885]" size={22} />
              </div>
              <p className="mt-4 font-bold text-[#354039]">{plan.target}</p>
              <p className="mt-3 text-sm leading-6 text-[#5b6760]">{plan.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-lg bg-[#111811] px-6 py-10 text-white sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-[#caff4d]">
                <ShieldCheck size={20} />
                <span className="text-sm font-black uppercase tracking-[0.18em]">Supervised autonomy</span>
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight">Let Vega run the next campaign with a real human safety loop.</h2>
            </div>
            <Link
              href="/onboarding/ai"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#caff4d] px-6 text-sm font-black text-[#111811] transition hover:bg-[#bdf137]"
            >
              Open AI onboarding
              <Bot size={18} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#dfe4df] px-4 py-8 text-sm text-[#68736d] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>Ghost Lead Command</p>
          <div className="flex gap-4">
            <Link href="/command" className="hover:text-[#111811]">
              Command
            </Link>
            <Link href="/waitlist" className="hover:text-[#111811]">
              Waitlist
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
