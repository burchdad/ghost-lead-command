"use client";

import {
  Bot,
  CheckCircle2,
  CreditCard,
  FileText,
  Loader2,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Message = {
  id: string;
  role: string;
  content: string;
  visibleToCustomer: boolean;
  agentType?: string;
};

type SessionPayload = {
  id: string;
  status: string;
  currentObjective?: string;
  currentAgent: string;
  launchReadiness: string;
  collectedFacts?: Array<{ key: string; value: string; confirmed: boolean; inferred: boolean }>;
  missingRequiredFacts?: string[];
  productRecommendation?: {
    productCode?: string;
    why?: string;
    vegaHandles?: string[];
    customerHandles?: string[];
  };
  messages: Message[];
  pricingQuotes: Array<{ id: string; totals?: { setupFeeCents?: number; recurringAmountCents?: number; finalAmount?: number; includedAllowances?: Record<string, number> } }>;
  commercialProposals: Array<{ id: string; version: number; status: string; productCode: string; billingSummary?: { setupFeeCents?: number; recurringAmountCents?: number } }>;
  humanReviewTasks: Array<{ id: string; reason: string; status: string }>;
};

const progressOrder = [
  "STARTED",
  "DISCOVERING_BUSINESS",
  "RESEARCHING_MARKET",
  "BUILDING_OFFER",
  "DESIGNING_CAMPAIGN",
  "RECOMMENDING_PRODUCT",
  "PRICING",
  "REVIEWING_PROPOSAL",
  "AWAITING_CHECKOUT",
  "PROVISIONING",
  "LAUNCH_REVIEW",
  "READY",
];

const initialMessage: Message = {
  id: "initial-vega-prompt",
  role: "assistant",
  content: "Tell me about your business and the customers you want more of. I will shape the lead engine around how you actually sell.",
  visibleToCustomer: true,
  agentType: "VEGA_CONCIERGE",
};

export default function VegaCommercialOnboarding() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    if (prompt) return prompt;
    const productInterest = params.get("product_interest");
    const fulfillment = params.get("fulfillment");
    const context = [
      productInterest ? `I am interested in ${productInterest.replace(/_/g, " ")}.` : "",
      fulfillment ? `I want to explore ${fulfillment.replace(/_/g, " ")} fulfillment.` : "",
    ].filter(Boolean);
    return context.join(" ");
  });
  const [billingConfirmation, setBillingConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  async function runAction(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session?.id, ...payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Vega onboarding action failed.");
      setSession(data.session || data.provisioned || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vega onboarding action failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length]);

  const progress = useMemo(() => {
    const index = Math.max(0, progressOrder.indexOf(session?.status || "STARTED"));
    return Math.min(100, Math.round(((index + 1) / progressOrder.length) * 100));
  }, [session?.status]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (!content || busy) return;
    setMessage("");
    void runAction({ action: session ? "message" : "start", message: content });
  }

  const facts = Array.isArray(session?.collectedFacts) ? session.collectedFacts : [];
  const quote = session?.pricingQuotes?.[0];
  const proposal = session?.commercialProposals?.[0];

  return (
    <main className="min-h-screen bg-[#071013] text-[#f7fbf8]">
      <div className="grid min-h-screen lg:grid-cols-[360px_1fr]">
        <aside className="border-r border-[#244044] bg-[#0d171a] p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-[#caff4d] text-[#071013]">
              <Sparkles size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#78dcca]">Vega Launch Team</p>
              <h1 className="text-xl font-semibold">Commercial Onboarding</h1>
            </div>
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#b8ccca]">Progress</span>
              <span className="font-mono text-[#caff4d]">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-sm bg-[#162529]">
              <div className="h-full bg-[#caff4d]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <StatusRow icon={Bot} label="Current agent" value={session?.currentAgent || "VEGA_CONCIERGE"} />
            <StatusRow icon={CheckCircle2} label="Status" value={session?.status || "STARTING"} />
            <StatusRow icon={ShieldCheck} label="Launch QA" value={session?.launchReadiness || "NOT_READY"} />
          </div>

          <section className="mt-6 rounded-md border border-[#244044] bg-[#101d20] p-4">
            <h2 className="text-sm font-semibold">Known facts</h2>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {facts.length ? facts.map((fact) => (
                <div key={fact.key} className="rounded-sm bg-[#081113] p-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[#78dcca]">{fact.key}</p>
                  <p className="mt-1 text-sm text-[#e8f1ef]">{fact.value}</p>
                  <p className="mt-1 text-xs text-[#91a8a5]">{fact.confirmed ? "confirmed" : fact.inferred ? "needs confirmation" : "captured"}</p>
                </div>
              )) : <p className="text-sm text-[#91a8a5]">Vega is waiting for the first business description.</p>}
            </div>
          </section>

          <section className="mt-4 rounded-md border border-[#244044] bg-[#101d20] p-4">
            <h2 className="text-sm font-semibold">Commercial guardrails</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#b8ccca]">
              <li>No live outreach during onboarding.</li>
              <li>Pricing comes from deterministic rules.</li>
              <li>Checkout uses a hosted provider boundary.</li>
              <li>Launch QA blocks unsafe campaigns.</li>
            </ul>
          </section>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#244044] bg-[#0b1417] px-5 py-4">
            <p className="text-sm uppercase tracking-[0.18em] text-[#78dcca]">AI-led consultation</p>
            <h2 className="mt-1 text-2xl font-semibold">Tell Vega what you sell. Vega builds the commercial launch plan.</h2>
          </header>

          <div className="grid flex-1 gap-4 p-5 xl:grid-cols-[1fr_360px]">
            <div className="flex min-h-[640px] flex-col rounded-md border border-[#244044] bg-[#0d171a]">
              <div className="flex-1 space-y-4 overflow-auto p-5">
                {(!session ? [initialMessage] : session.messages).filter((item) => item.visibleToCustomer !== false).map((item) => (
                  <div key={item.id} className={item.role === "customer" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[780px] rounded-md p-4 ${item.role === "customer" ? "bg-[#caff4d] text-[#071013]" : "bg-[#162529] text-[#e8f1ef]"}`}>
                      <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
                      {item.agentType ? <p className="mt-3 text-xs uppercase tracking-[0.14em] opacity-70">{item.agentType}</p> : null}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {error ? <div className="mx-5 mb-3 rounded-md border border-[#f87171]/40 bg-[#3b1111] p-3 text-sm text-[#fecaca]">{error}</div> : null}

              <form onSubmit={sendMessage} className="border-t border-[#244044] p-4">
                <div className="flex gap-3">
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Example: I run a mobile detailing company in Tyler and want dealership and fleet work within 40 miles."
                    className="min-h-20 flex-1 resize-none rounded-md border border-[#244044] bg-[#071013] p-3 text-sm text-[#f7fbf8] outline-none focus:border-[#78dcca]"
                  />
                  <button
                    type="submit"
                    disabled={busy || !message.trim()}
                    className="inline-flex min-w-24 items-center justify-center gap-2 rounded-md bg-[#caff4d] px-4 py-3 text-sm font-semibold text-[#071013] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    Send
                  </button>
                </div>
              </form>
            </div>

            <aside className="space-y-4">
              <ActionPanel
                title="Product recommendation"
                icon={Rocket}
                body={session?.productRecommendation?.why || "Vega will recommend Scout, Reach, Convert, Managed, or White Label once enough facts are known."}
                meta={session?.productRecommendation?.productCode}
              />

              <ActionPanel
                title="Pricing"
                icon={CreditCard}
                body={quote ? `${money(quote.totals?.setupFeeCents || 0)} setup and ${money(quote.totals?.recurringAmountCents || 0)}/mo.` : "Create a deterministic quote when the scope is ready."}
                button="Create quote"
                onClick={() => runAction({ action: "quote" })}
                disabled={!session || busy}
              />

              <ActionPanel
                title="Proposal"
                icon={FileText}
                body={proposal ? `Version ${proposal.version} is ${proposal.status.toLowerCase()}.` : "Generate a versioned proposal after pricing exists."}
                button="Present proposal"
                onClick={() => runAction({ action: "proposal" })}
                disabled={!session || busy}
              />

              <section className="rounded-md border border-[#244044] bg-[#0d171a] p-4">
                <h3 className="text-sm font-semibold">Hosted checkout boundary</h3>
                <p className="mt-2 text-sm leading-6 text-[#b8ccca]">
                  Vega needs explicit billing confirmation before creating checkout. No card data is collected here.
                </p>
                <textarea
                  value={billingConfirmation}
                  onChange={(event) => setBillingConfirmation(event.target.value)}
                  placeholder="I confirm the setup fee, monthly amount, billing interval, included allowances, overage rules, and cancellation terms."
                  className="mt-3 min-h-24 w-full resize-none rounded-md border border-[#244044] bg-[#071013] p-3 text-sm text-[#f7fbf8] outline-none focus:border-[#78dcca]"
                />
                <button
                  type="button"
                  onClick={() => runAction({ action: "checkout", billingConfirmation })}
                  disabled={!session || busy || !proposal}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[#78dcca] px-4 py-2 text-sm font-semibold text-[#071013] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CreditCard size={17} />
                  Create hosted checkout
                </button>
              </section>

              {session?.humanReviewTasks?.length ? (
                <section className="rounded-md border border-[#fbbf24]/40 bg-[#221906] p-4">
                  <h3 className="text-sm font-semibold text-[#fde68a]">Human review</h3>
                  <div className="mt-3 space-y-2">
                    {session.humanReviewTasks.map((task) => (
                      <p key={task.id} className="text-sm leading-6 text-[#fef3c7]">{task.reason}</p>
                    ))}
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({ icon: Icon, label, value }: { icon: typeof Bot; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[#244044] bg-[#101d20] p-3">
      <Icon className="mt-0.5 text-[#78dcca]" size={18} />
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-[#91a8a5]">{label}</p>
        <p className="mt-1 break-words font-mono text-xs text-[#f7fbf8]">{value}</p>
      </div>
    </div>
  );
}

function ActionPanel({
  title,
  icon: Icon,
  body,
  meta,
  button,
  onClick,
  disabled,
}: {
  title: string;
  icon: typeof Bot;
  body: string;
  meta?: string;
  button?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-md border border-[#244044] bg-[#0d171a] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Icon className="text-[#78dcca]" size={18} />
      </div>
      {meta ? <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-[#caff4d]">{meta}</p> : null}
      <p className="mt-2 text-sm leading-6 text-[#b8ccca]">{body}</p>
      {button ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#caff4d] px-4 py-2 text-sm font-semibold text-[#071013] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {button}
        </button>
      ) : null}
    </section>
  );
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
