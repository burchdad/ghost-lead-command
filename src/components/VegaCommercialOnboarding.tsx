"use client";

import Image from "next/image";
import { ArrowRight, Check, FileText, Loader2, MessageCircle, Send, Volume2, VolumeX } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { vegaAssets } from "@/config/vega-assets";

type Message = { id: string; role: string; content: string; visibleToCustomer: boolean };
type Proposal = {
  id: string;
  version: number;
  status: string;
  productCode: string;
  fulfillmentMode?: string;
  vegaResponsibilities?: string[];
  customerResponsibilities?: string[];
  setupScope?: string[];
  recurringScope?: string[];
  limitations?: string[];
  termsReference?: string;
  billingSummary?: { setupFeeCents?: number; recurringAmountCents?: number };
};
type SessionPayload = { id: string; status: string; messages: Message[]; commercialProposals: Proposal[] };

const initialMessage: Message = {
  id: "initial-vega-prompt",
  role: "assistant",
  content: "Hi, I’m Vega, your AI sales director. Tell me what your business does and the kind of customers you would like more of. I’ll help shape a practical plan with you.",
  visibleToCustomer: true,
};
const sessionStorageKey = "vega-commercial-onboarding-session";
const conversationRecoveryMessage = "Vega is having trouble saving this part of the conversation. Your message is still here, so please try again in a moment.";

export default function VegaCommercialOnboarding() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [message, setMessage] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [notice] = useState(initialCheckoutNotice);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenMessageId = useRef("");

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
      if (!response.ok) throw new Error(data.error || conversationRecoveryMessage);
      const nextSession = data.session || data.provisioned || data;
      if (nextSession?.messages) setSession(nextSession);
      if (nextSession?.id) window.localStorage.setItem(sessionStorageKey, nextSession.id);
      return data;
    } catch (err) {
      if (typeof payload.message === "string") setMessage(payload.message);
      setError(err instanceof Error ? err.message : conversationRecoveryMessage);
      return null;
    } finally {
      setBusy(false);
      setPendingMessage("");
    }
  }

  useEffect(() => {
    const conversation = messagesRef.current;
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [session?.messages.length, pendingMessage, proposalOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storedSessionId = params.get("sessionId") || window.localStorage.getItem(sessionStorageKey);
    if (!storedSessionId) return;
    const controller = new AbortController();
    fetch(`/api/onboarding/ai?sessionId=${encodeURIComponent(storedSessionId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.error || "Unable to resume your conversation.");
        setSession(data.session);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        window.localStorage.removeItem(sessionStorageKey);
      });
    return () => controller.abort();
  }, []);

  const visibleMessages = useMemo(
    () => (!session ? [initialMessage] : session.messages).filter((item) => item.visibleToCustomer !== false),
    [session],
  );
  const latestAssistantMessage = useMemo(() => [...visibleMessages].reverse().find((item) => item.role !== "customer"), [visibleMessages]);
  const proposal = session?.commercialProposals?.[0];

  useEffect(() => {
    if (!latestAssistantMessage || latestAssistantMessage.id === lastSpokenMessageId.current) return;
    lastSpokenMessageId.current = latestAssistantMessage.id;
    const startTimer = window.setTimeout(() => setSpeaking(true), 0);
    const timer = window.setTimeout(() => setSpeaking(false), Math.min(7000, 1800 + latestAssistantMessage.content.length * 18));
    if (voiceEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latestAssistantMessage.content);
      utterance.rate = 0.98;
      utterance.pitch = 1.02;
      utterance.onend = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
    return () => { window.clearTimeout(startTimer); window.clearTimeout(timer); };
  }, [latestAssistantMessage, voiceEnabled]);

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = message.trim();
    if (busy) return;
    if (!content) return setError("Type a message so Vega knows how to help.");
    setMessage("");
    setPendingMessage(content);
    void runAction({ action: session ? "message" : "start", message: content });
  }

  async function acceptProposal() {
    if (!proposal) return;
    const data = await runAction({ action: "checkout", proposalId: proposal.id });
    const checkoutUrl = data?.checkout?.url;
    if (checkoutUrl) window.location.assign(checkoutUrl);
  }

  function requestChanges() {
    setProposalOpen(false);
    setMessage("I’d like to adjust the plan. ");
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function askQuestion() {
    setMessage("I have a question about the plan: ");
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <main className="relative min-h-screen bg-[#071013] text-[#f7fbf8]">
      <button
        type="button"
        onClick={() => {
          setVoiceEnabled((enabled) => !enabled);
          if (voiceEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
        }}
        className="fixed right-4 top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#0c191c]/90 text-[#c9d7d4] shadow-[0_8px_30px_rgba(0,0,0,0.3)] ring-1 ring-[#2b4549] backdrop-blur hover:bg-[#102428] sm:right-6 sm:top-6"
        aria-label={voiceEnabled ? "Turn Vega voice off" : "Turn Vega voice on"}
        title={voiceEnabled ? "Turn Vega voice off" : "Hear Vega speak"}
      >
        {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      <div className="mx-auto grid min-h-screen max-w-7xl gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(380px,0.9fr)_minmax(0,1.3fr)] lg:gap-8 lg:py-6">
        <VegaMeetingStage busy={busy} speaking={speaking} />
        <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden lg:h-[calc(100vh-3rem)] lg:min-h-[680px]">
          <div className="px-1 pb-4 pt-2 sm:px-3">
            <p className="text-base font-semibold">Conversation with Vega</p>
            <p className="mt-1 text-sm text-[#8fa5a2]">Talk naturally. Vega will remember the details and guide the next step.</p>
          </div>
          <div ref={messagesRef} className="flex-1 space-y-4 overflow-y-auto px-1 py-2 sm:px-3">
            {notice ? <div className="rounded-md border border-[#55c9b8]/40 bg-[#0d2a27] p-3 text-sm text-[#c9f3ec]">{notice}</div> : null}
            {visibleMessages.map((item) => {
              const isCustomer = item.role === "customer";
              const isLatestVega = item.id === latestAssistantMessage?.id;
              return (
                <div key={item.id} className={`flex gap-3 ${isCustomer ? "justify-end" : "justify-start"}`}>
                  {!isCustomer ? <Image src={vegaAssets.avatarSmall} alt="" width={32} height={32} className="mt-1 h-8 w-8 rounded-full object-cover" /> : null}
                  <div className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${isCustomer ? "bg-[#caff4d] text-[#111811]" : "border border-[#dcd5f7] bg-[#f5f2ff] text-[#171321]"}`}>
                    <p className="whitespace-pre-wrap">{item.content}</p>
                    {proposal && isLatestVega ? (
                      <ProposalConversationActions proposal={proposal} open={proposalOpen} busy={busy} onToggle={() => setProposalOpen((open) => !open)} onAccept={acceptProposal} onChanges={requestChanges} onQuestion={askQuestion} />
                    ) : null}
                  </div>
                </div>
              );
            })}
            {pendingMessage ? <div className="flex justify-end"><div className="max-w-[86%] rounded-lg bg-[#caff4d] px-4 py-3 text-sm leading-6 text-[#111811] sm:max-w-[78%]">{pendingMessage}</div></div> : null}
            {busy && pendingMessage ? (
              <div className="flex items-center gap-3">
                <Image src={vegaAssets.thinking} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                <div className="inline-flex items-center gap-2 rounded-lg border border-[#dcd5f7] bg-[#f5f2ff] px-4 py-3 text-sm text-[#171321]" role="status"><Loader2 className="animate-spin" size={16} /><span>Vega is thinking...</span></div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
          {error ? <div className="mx-1 mb-3 rounded-md border border-[#f87171]/40 bg-[#351313] p-3 text-sm text-[#fecaca] sm:mx-3">{error}</div> : null}
          <form onSubmit={sendMessage} className="px-1 pb-1 pt-3 sm:px-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                name="message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
                placeholder="Message Vega..."
                aria-label="Message Vega"
                className="min-h-14 max-h-40 flex-1 resize-none rounded-lg border border-[#2b4549] bg-[#071013] px-4 py-3 text-sm text-[#f7fbf8] outline-none focus:border-[#8c74ff] focus:ring-2 focus:ring-[#8c74ff]/25"
              />
              <button type="submit" disabled={busy || !message.trim()} className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#7c5cff] text-white hover:bg-[#6848e8] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message" title="Send message">
                {busy ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function VegaMeetingStage({ busy, speaking }: { busy: boolean; speaking: boolean }) {
  const state = busy ? "Thinking" : speaking ? "Speaking" : "Listening";
  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <div className={`vega-meeting-stage relative h-[390px] overflow-hidden sm:h-[470px] lg:h-[calc(100vh-3rem)] lg:min-h-[680px] ${speaking ? "is-speaking" : ""} ${busy ? "is-thinking" : ""}`}>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-start p-3 sm:p-4">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs text-white"><span className={`h-2 w-2 rounded-full ${busy ? "bg-[#f7c948]" : "bg-[#55c9b8]"}`} />{state}</span>
        </div>
        <div className="vega-meeting-light absolute inset-0" />
        <div className="vega-meeting-avatar absolute inset-x-0 bottom-0 top-8 flex items-end justify-center lg:top-10">
          <Image
            src={busy ? vegaAssets.thinking : vegaAssets.portrait}
            alt="Vega, AI Sales Director"
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 520px"
            className="object-contain object-bottom"
          />
        </div>
      </div>
    </aside>
  );
}

function ProposalConversationActions({ proposal, open, busy, onToggle, onAccept, onChanges, onQuestion }: { proposal: Proposal; open: boolean; busy: boolean; onToggle: () => void; onAccept: () => void; onChanges: () => void; onQuestion: () => void }) {
  const accepted = proposal.status === "ACCEPTED";
  return (
    <div className="mt-4 border-t border-[#171321]/15 pt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onToggle} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#171321] px-4 py-2 text-sm font-semibold text-white"><FileText size={16} /> {open ? "Hide plan" : "Review plan"}</button>
        <button type="button" onClick={onQuestion} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#171321]/20 bg-white px-4 py-2 text-sm font-semibold text-[#171321]"><MessageCircle size={16} /> Ask a question</button>
      </div>
      {open ? (
        <ProposalPreview proposal={proposal}>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onAccept} disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#008f75] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {accepted ? <ArrowRight size={17} /> : <Check size={17} />}{accepted ? "Continue to secure checkout" : "Accept plan"}
            </button>
            {!accepted ? <button type="button" onClick={onChanges} className="min-h-11 rounded-md border border-[#171321]/20 bg-white px-4 py-2 text-sm font-semibold text-[#171321]">Request changes</button> : null}
          </div>
        </ProposalPreview>
      ) : null}
    </div>
  );
}

function ProposalPreview({ proposal, children }: { proposal: Proposal; children: React.ReactNode }) {
  const setupFee = proposal.billingSummary?.setupFeeCents || 0;
  const recurringAmount = proposal.billingSummary?.recurringAmountCents || 0;
  return (
    <section className="mt-3 rounded-md border border-[#171321]/15 bg-white p-4 text-[#171321]">
      <p className="text-xs font-semibold uppercase text-[#5d5770]">Your recommended plan</p>
      <h3 className="mt-1 text-lg font-semibold">{humanizeProductCode(proposal.productCode)}</h3>
      <div className="mt-4 grid grid-cols-2 gap-2"><ProposalMetric label="One-time setup" value={money(setupFee)} /><ProposalMetric label="Ongoing" value={`${money(recurringAmount)}/mo`} /></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><ProposalList title="Getting started" items={proposal.setupScope} /><ProposalList title="What Vega handles" items={proposal.vegaResponsibilities} /><ProposalList title="Ongoing support" items={proposal.recurringScope} /><ProposalList title="What your team handles" items={proposal.customerResponsibilities} /></div>
      {proposal.termsReference ? <p className="mt-4 border-t border-[#171321]/10 pt-3 text-xs leading-5 text-[#625d70]">{proposal.termsReference}</p> : null}
      {children}
    </section>
  );
}

function ProposalMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-[#f2effa] p-3"><p className="text-xs text-[#625d70]">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function ProposalList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return <div><p className="text-xs font-semibold text-[#625d70]">{title}</p><ul className="mt-2 space-y-1 text-sm leading-5">{items.map((item) => <li key={item}>• {humanize(item)}</li>)}</ul></div>;
}

function initialPrompt() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("prompt") || "";
}

function initialCheckoutNotice() {
  if (typeof window === "undefined") return "";
  const checkout = new URLSearchParams(window.location.search).get("checkout");
  if (checkout === "success") return "Payment received. Vega is confirming your workspace and launch details now.";
  if (checkout === "canceled") return "Checkout was closed. Your plan is still here whenever you are ready.";
  return "";
}

function humanizeProductCode(value: string) { return humanize(value.replace(/^VEGA_/, "Vega ")); }
function humanize(value: string) { const normalized = value.replace(/[_-]+/g, " ").trim(); return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() : value; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
