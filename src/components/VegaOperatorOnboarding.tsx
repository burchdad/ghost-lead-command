"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Gauge,
  HeartPulse,
  Loader2,
  MailCheck,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type CalibrationItem = {
  id: string;
  verdict?: string | null;
  notes?: string | null;
  snapshot: {
    contactName?: string;
    companyName?: string;
    title?: string;
    niche?: string;
    source?: string;
    score?: number;
    email?: string;
    phone?: string;
    website?: string;
    evidence?: string;
  };
};

type ReadinessPayload = {
  workspace: { id: string; name: string; slug: string };
  readiness: {
    state: string;
    salesProfile?: Record<string, unknown>;
    icps?: string[];
    offers?: string[];
    territories?: string[];
    qualificationRules?: Record<string, unknown>;
    teamResponsibilities?: Record<string, unknown>;
    outreachPolicy?: Record<string, unknown>;
    integrationSnapshot?: {
      sourceConfigured?: boolean;
      providers?: Record<string, boolean>;
      sendgridConfigured?: boolean;
      crmConfigured?: boolean;
      crmReachable?: boolean;
      slackConfigured?: boolean;
    };
    healthSnapshot?: {
      sender?: { mode?: string; bounceRate?: number; targetBounceRate?: number };
      suppression?: { total?: number; lastSevenDays?: number; state?: string };
    };
    calibrationTarget: number;
    calibrationReviewed: number;
    calibrationScore: number;
    autonomyRequested: boolean;
    policyVersion: string;
    lastEvaluatedAt?: string;
    calibrationItems: CalibrationItem[];
  };
  blockers: { hard: string[]; warnings: string[] };
};

const verdicts = [
  ["GOOD", "Good"],
  ["BAD_FIT", "Bad fit"],
  ["WRONG_PERSON", "Wrong person"],
  ["WRONG_COMPANY", "Wrong company"],
  ["NEEDS_RESEARCH", "Needs research"],
] as const;

function text(value: unknown) {
  return String(value || "");
}

function lines(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("\n") : "";
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export default function VegaOperatorOnboarding() {
  const [data, setData] = useState<ReadinessPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setError("");
    try {
      const response = await fetch("/api/onboarding/operator", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Unable to load readiness.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load readiness.");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function action(payload: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/onboarding/operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data?.workspace.id, ...payload }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.detail || next.error || "Vega readiness action failed.");
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vega readiness action failed.");
    } finally {
      setBusy("");
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action({
      action: "save",
      autonomyRequested: form.get("autonomyRequested") === "on",
      calibrationTarget: Number(form.get("calibrationTarget") || 10),
      configuration: {
        salesProfile: {
          businessName: text(form.get("businessName")),
          senderName: text(form.get("senderName")),
          senderEmail: text(form.get("senderEmail")),
          valueProposition: text(form.get("valueProposition")),
        },
        icps: splitLines(form.get("icps")),
        offers: splitLines(form.get("offers")),
        territories: splitLines(form.get("territories")),
        qualificationRules: {
          minimumScore: Number(form.get("minimumScore") || 75),
          requireDecisionMaker: form.get("requireDecisionMaker") === "on",
          requireBusinessEvidence: form.get("requireBusinessEvidence") === "on",
        },
        teamResponsibilities: {
          salesOwner: text(form.get("salesOwner")),
          callOwner: text(form.get("callOwner")),
          escalationOwner: text(form.get("escalationOwner")),
        },
        outreachPolicy: {
          mode: text(form.get("mode")),
          minimumScore: Number(form.get("minimumScore") || 75),
          dailySendLimit: Number(form.get("dailySendLimit") || 10),
          requireVerifiedEmail: true,
          requireSuppressionCheck: true,
          humanApprovalForRisk: form.get("humanApprovalForRisk") === "on",
        },
      },
    }, "save");
  }

  const readiness = data?.readiness;
  const sales = readiness?.salesProfile || {};
  const qualification = readiness?.qualificationRules || {};
  const team = readiness?.teamResponsibilities || {};
  const policy = readiness?.outreachPolicy || {};
  const progress = useMemo(() => {
    const target = readiness?.calibrationTarget || 10;
    return Math.min(100, Math.round(((readiness?.calibrationReviewed || 0) / target) * 100));
  }, [readiness]);

  return (
    <main className="min-h-screen bg-[#071013] text-[#f4faf7]">
      <header className="border-b border-[#244044] bg-[#0d171a]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[#75d5c5]"><Bot size={16} /> Internal control plane</div>
            <h1 className="mt-1 text-2xl font-semibold">Vega Operational Onboarding</h1>
            <p className="mt-1 text-sm text-[#9db4b1]">Verify the sales system, lock deterministic policy, and calibrate lead judgment before autonomy.</p>
          </div>
          <div className="flex items-center gap-3">
            <StateBadge state={readiness?.state || "LOADING"} />
            <button type="button" onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-md border border-[#355257] bg-[#101d20]" title="Re-evaluate readiness">
              <RefreshCw size={17} className={busy === "load" ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-5">
        {error ? <div className="mb-5 flex items-start gap-3 rounded-md border border-[#8b3b42] bg-[#2a1317] p-4 text-sm text-[#ffb4b9]"><AlertTriangle size={18} />{error}</div> : null}
        {data?.blockers.hard.length ? (
          <section className="mb-5 border-l-4 border-[#ff6b72] bg-[#1b1518] px-5 py-4">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} className="text-[#ff6b72]" /> Hard blockers</div>
            <div className="mt-2 grid gap-1 text-sm text-[#d9c5c7] md:grid-cols-2">{data.blockers.hard.map((item) => <div key={item}>• {item}</div>)}</div>
          </section>
        ) : null}

        <form onSubmit={save} className="space-y-5">
          <section className="grid gap-px overflow-hidden rounded-md border border-[#244044] bg-[#244044] md:grid-cols-4">
            <Metric icon={Gauge} label="Readiness" value={(readiness?.state || "Loading").replaceAll("_", " ")} />
            <Metric icon={Target} label="Calibration" value={`${readiness?.calibrationReviewed || 0} / ${readiness?.calibrationTarget || 10}`} detail={`${readiness?.calibrationScore || 0}% quality score`} />
            <Metric icon={HeartPulse} label="Sender" value={text(readiness?.healthSnapshot?.sender?.mode || "unknown")} detail={`${readiness?.healthSnapshot?.sender?.bounceRate || 0}% risky events`} />
            <Metric icon={ShieldCheck} label="Suppressions" value={text(readiness?.healthSnapshot?.suppression?.total || 0)} detail={`${readiness?.healthSnapshot?.suppression?.lastSevenDays || 0} added in 7 days`} />
          </section>

          <section className="rounded-md border border-[#244044] bg-[#0d171a]">
            <SectionTitle icon={Target} title="Authoritative sales profile" detail="These approved facts ground every Vega agent. LLM output cannot change them." />
            <div className="grid gap-4 border-t border-[#244044] p-5 md:grid-cols-2 lg:grid-cols-4">
              <Field name="businessName" label="Business" defaultValue={text(sales.businessName)} placeholder="Ghost AI Solutions" />
              <Field name="senderName" label="Approved sender" defaultValue={text(sales.senderName)} placeholder="Stephen Burch" />
              <Field name="senderEmail" label="Sender email" defaultValue={text(sales.senderEmail)} placeholder="sales@ghostai.solutions" type="email" />
              <Field name="valueProposition" label="Core value proposition" defaultValue={text(sales.valueProposition)} placeholder="Turn qualified demand into booked conversations" />
              <TextArea name="icps" label="Ideal customer profiles" defaultValue={lines(readiness?.icps)} placeholder="One approved ICP per line" />
              <TextArea name="offers" label="Approved offers" defaultValue={lines(readiness?.offers)} placeholder="One approved offer per line" />
              <TextArea name="territories" label="Territories" defaultValue={lines(readiness?.territories)} placeholder="One territory per line" />
              <div className="grid gap-3">
                <Field name="minimumScore" label="Minimum qualification score" defaultValue={text(qualification.minimumScore || 75)} type="number" />
                <Check name="requireDecisionMaker" label="Require decision-maker evidence" defaultChecked={qualification.requireDecisionMaker !== false} />
                <Check name="requireBusinessEvidence" label="Require public business evidence" defaultChecked={qualification.requireBusinessEvidence !== false} />
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-md border border-[#244044] bg-[#0d171a]">
              <SectionTitle icon={Users} title="Responsibilities and autonomy" detail="Operators own the policy. Vega executes inside it." />
              <div className="grid gap-4 border-t border-[#244044] p-5 md:grid-cols-2">
                <Field name="salesOwner" label="Sales owner" defaultValue={text(team.salesOwner)} placeholder="Stephen" />
                <Field name="callOwner" label="Call follow-up owner" defaultValue={text(team.callOwner)} placeholder="Stephen or VA" />
                <Field name="escalationOwner" label="Escalation owner" defaultValue={text(team.escalationOwner)} placeholder="Stephen" />
                <label className="text-sm text-[#b8ccca]">Outreach mode<select name="mode" defaultValue={text(policy.mode || "approval")} className="mt-2 h-11 w-full rounded-md border border-[#355257] bg-[#081215] px-3 text-[#f4faf7]"><option value="draft-only">Draft only</option><option value="approval">Approval mode</option><option value="managed-autonomy">Managed autonomy</option></select></label>
                <Field name="dailySendLimit" label="Daily first-touch limit" defaultValue={text(policy.dailySendLimit || 10)} type="number" />
                <Field name="calibrationTarget" label="Calibration sample" defaultValue={text(readiness?.calibrationTarget || 10)} type="number" />
                <Check name="humanApprovalForRisk" label="Human review for strategic or risky accounts" defaultChecked={policy.humanApprovalForRisk !== false} />
                <Check name="autonomyRequested" label="Request managed autonomy after calibration" defaultChecked={Boolean(readiness?.autonomyRequested)} />
              </div>
            </section>

            <section className="rounded-md border border-[#244044] bg-[#0d171a]">
              <SectionTitle icon={Database} title="Provider and integration health" detail="Live status is evaluated from the same services Vega uses." />
              <div className="grid gap-px border-t border-[#244044] bg-[#244044] sm:grid-cols-2">
                <Health label="Lead sources" ok={Boolean(readiness?.integrationSnapshot?.sourceConfigured)} detail={enabledProviders(readiness?.integrationSnapshot?.providers)} />
                <Health label="SendGrid" ok={Boolean(readiness?.integrationSnapshot?.sendgridConfigured)} detail="Controlled delivery" />
                <Health label="GhostCRM" ok={Boolean(readiness?.integrationSnapshot?.crmConfigured && readiness?.integrationSnapshot?.crmReachable)} detail={readiness?.integrationSnapshot?.crmReachable ? "Configured and reachable" : "Needs attention"} />
                <Health label="Slack" ok={Boolean(readiness?.integrationSnapshot?.slackConfigured)} detail="Executive reporting and escalation" warning />
              </div>
            </section>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={Boolean(busy)} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#caff4d] px-5 font-semibold text-[#071013] disabled:opacity-50">
              {busy === "save" ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Save and evaluate
            </button>
          </div>
        </form>

        <section className="mt-5 rounded-md border border-[#244044] bg-[#0d171a]">
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold"><MailCheck size={18} className="text-[#75d5c5]" /> Controlled lead calibration</div>
              <p className="mt-1 text-sm text-[#9db4b1]">Dry run only. Reviewing these leads creates persistent evidence for Vega Sales Memory; nothing is sent.</p>
            </div>
            <button type="button" disabled={Boolean(busy)} onClick={() => void action({ action: "start-calibration", target: readiness?.calibrationTarget || 10 }, "calibrate")} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#75d5c5] px-4 text-sm font-semibold text-[#9ff1e4] disabled:opacity-50">
              {busy === "calibrate" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Load dry-run leads
            </button>
          </div>
          <div className="h-2 bg-[#162529]"><div className="h-full bg-[#75d5c5]" style={{ width: `${progress}%` }} /></div>
          <div className="divide-y divide-[#244044] border-t border-[#244044]">
            {readiness?.calibrationItems?.length ? readiness.calibrationItems.map((item, index) => (
              <CalibrationRow key={item.id} item={item} index={index} busy={busy} onLabel={(verdict) => void action({ action: "label", itemId: item.id, verdict }, `label-${item.id}`)} />
            )) : <div className="p-8 text-center text-sm text-[#78908d]">Load 10–20 existing leads to begin the no-send calibration.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}

function StateBadge({ state }: { state: string }) {
  const okay = state === "MANAGED_AUTONOMY";
  const blocked = state === "BLOCKED";
  return <span className={`rounded-sm border px-3 py-2 text-xs font-semibold uppercase ${okay ? "border-[#75d5c5] bg-[#0d2826] text-[#9ff1e4]" : blocked ? "border-[#8b3b42] bg-[#2a1317] text-[#ffb4b9]" : "border-[#6f632a] bg-[#28230d] text-[#f2dd7b]"}`}>{state.replaceAll("_", " ")}</span>;
}

function SectionTitle({ icon: Icon, title, detail }: { icon: typeof Target; title: string; detail: string }) {
  return <div className="flex items-start gap-3 p-5"><Icon size={19} className="mt-0.5 text-[#75d5c5]" /><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-[#9db4b1]">{detail}</p></div></div>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Gauge; label: string; value: string; detail?: string }) {
  return <div className="min-h-28 bg-[#0d171a] p-5"><Icon size={18} className="text-[#75d5c5]" /><div className="mt-3 text-xs uppercase text-[#78908d]">{label}</div><div className="mt-1 font-mono text-lg uppercase">{value}</div>{detail ? <div className="mt-1 text-xs text-[#9db4b1]">{detail}</div> : null}</div>;
}

function Field({ name, label, defaultValue, placeholder, type = "text" }: { name: string; label: string; defaultValue: string; placeholder?: string; type?: string }) {
  return <label className="text-sm text-[#b8ccca]">{label}<input key={`${name}-${defaultValue}`} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="mt-2 h-11 w-full rounded-md border border-[#355257] bg-[#081215] px-3 text-[#f4faf7] placeholder:text-[#58706d]" /></label>;
}

function TextArea({ name, label, defaultValue, placeholder }: { name: string; label: string; defaultValue: string; placeholder: string }) {
  return <label className="text-sm text-[#b8ccca]">{label}<textarea key={`${name}-${defaultValue}`} name={name} defaultValue={defaultValue} placeholder={placeholder} rows={6} className="mt-2 w-full resize-y rounded-md border border-[#355257] bg-[#081215] p-3 text-[#f4faf7] placeholder:text-[#58706d]" /></label>;
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return <label className="flex items-center gap-3 text-sm text-[#b8ccca]"><input key={`${name}-${defaultChecked}`} name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 accent-[#75d5c5]" />{label}</label>;
}

function Health({ label, ok, detail, warning }: { label: string; ok: boolean; detail: string; warning?: boolean }) {
  return <div className="min-h-24 bg-[#0d171a] p-4"><div className="flex items-center justify-between"><span className="font-semibold">{label}</span>{ok ? <CheckCircle2 size={17} className="text-[#75d5c5]" /> : warning ? <AlertTriangle size={17} className="text-[#f2dd7b]" /> : <AlertTriangle size={17} className="text-[#ff6b72]" />}</div><p className="mt-2 text-xs text-[#9db4b1]">{detail}</p></div>;
}

function enabledProviders(providers?: Record<string, boolean>) {
  const names = Object.entries(providers || {}).filter(([, enabled]) => enabled).map(([name]) => name);
  return names.length ? names.join(", ") : "No source provider configured";
}

function CalibrationRow({ item, index, busy, onLabel }: { item: CalibrationItem; index: number; busy: string; onLabel: (verdict: string) => void }) {
  const lead = item.snapshot;
  return <article className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-[#78908d]">{String(index + 1).padStart(2, "0")}</span><h3 className="font-semibold">{lead.companyName || "Unknown company"}</h3><span className="rounded-sm bg-[#15292b] px-2 py-1 text-xs text-[#9ff1e4]">Score {lead.score || 0}</span>{item.verdict ? <span className="rounded-sm bg-[#28230d] px-2 py-1 text-xs text-[#f2dd7b]">{item.verdict.replaceAll("_", " ")}</span> : null}</div><p className="mt-1 text-sm text-[#b8ccca]">{lead.contactName || "Unknown contact"}{lead.title ? ` · ${lead.title}` : ""}</p><p className="mt-2 line-clamp-2 text-xs text-[#78908d]">{lead.source || "Unknown source"} · {lead.email || lead.phone || lead.website || "No verified contact path"} · {lead.evidence || "No evidence summary"}</p></div>
    <div className="flex flex-wrap gap-2 lg:max-w-[440px] lg:justify-end">{verdicts.map(([value, label]) => <button key={value} type="button" disabled={Boolean(busy)} onClick={() => onLabel(value)} className={`h-9 rounded-md border px-3 text-xs font-semibold ${item.verdict === value ? "border-[#caff4d] bg-[#caff4d] text-[#071013]" : "border-[#355257] bg-[#101d20] text-[#c8d8d6]"}`}>{busy === `label-${item.id}` ? <Loader2 size={14} className="animate-spin" /> : label}</button>)}</div>
  </article>;
}
