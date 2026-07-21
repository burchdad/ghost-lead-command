import type { ElementType, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  Brain,
  CheckCircle2,
  CircleDashed,
  Compass,
  PhoneCall,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { brand } from "@/config/brand";
import { vegaAssets, type VegaAssetSlot } from "@/config/vega-assets";

const avatarSizes = {
  xs: { className: "size-8", pixels: 64 },
  sm: { className: "size-10", pixels: 80 },
  md: { className: "size-14", pixels: 112 },
  lg: { className: "size-24", pixels: 192 },
  xl: { className: "size-32", pixels: 256 },
} as const;

type VegaStatus = "online" | "ready" | "watching" | "review" | "success" | "warning" | "danger" | "neutral";

const statusStyles: Record<VegaStatus, string> = {
  online: "border-[var(--vega-teal-300)] bg-[var(--vega-teal-50)] text-[var(--vega-teal-900)]",
  ready: "border-[var(--vega-lime-300)] bg-[var(--vega-lime-100)] text-[var(--vega-ink)]",
  watching: "border-[var(--vega-purple-300)] bg-[var(--vega-purple-50)] text-[var(--vega-purple-900)]",
  review: "border-[var(--vega-amber-300)] bg-[var(--vega-amber-50)] text-[var(--vega-amber-900)]",
  success: "border-[var(--vega-lime-300)] bg-[var(--vega-lime-100)] text-[var(--vega-ink)]",
  warning: "border-[var(--vega-amber-300)] bg-[var(--vega-amber-50)] text-[var(--vega-amber-900)]",
  danger: "border-[var(--vega-danger-300)] bg-[var(--vega-danger-50)] text-[var(--vega-danger-900)]",
  neutral: "border-[var(--ghost-border)] bg-white text-[var(--ghost-muted)]",
};

export function VegaAvatar({
  size = "md",
  state = "neutral",
  caption,
  showStatus = false,
  className = "",
  priority = false,
}: {
  size?: keyof typeof avatarSizes;
  state?: VegaAssetSlot;
  caption?: string;
  showStatus?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const sizing = avatarSizes[size];
  const src = vegaAssets[state] || vegaAssets.neutral;

  return (
    <div className={`vega-float relative inline-flex flex-col items-center ${className}`}>
      <div className="vega-avatar-glow relative">
        <Image
          src={src}
          alt={`${brand.aiDirectorName}, ${brand.aiDirectorTitle}`}
          width={sizing.pixels}
          height={Math.round(sizing.pixels * 1.5)}
          className={`${sizing.className} relative z-10 rounded-md object-contain drop-shadow-[0_0_30px_rgba(124,58,237,0.35)]`}
          loading={priority ? undefined : "eager"}
          priority={priority}
        />
        <span className="vega-scan absolute inset-x-3 bottom-2 top-2 z-20 rounded-full opacity-50" aria-hidden="true" />
      </div>
      {showStatus ? (
        <div className="relative z-20 -mt-4 rounded-md border border-[var(--vega-purple-300)] bg-[var(--vega-deep)]/90 px-3 py-2 text-center shadow-[var(--vega-glow)] backdrop-blur">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--vega-purple-100)]">
            {caption || `${brand.aiDirectorName} is ready`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function VegaWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--vega-lime)] text-[var(--vega-ink)]">
        <Sparkles size={19} aria-hidden="true" />
      </span>
      <span className="min-w-0 max-[380px]:hidden">
        <span className="block truncate text-base font-black tracking-tight text-[var(--vega-ink)] sm:text-lg">
          {brand.productName}
        </span>
        <span className="hidden truncate text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[var(--ghost-muted)] sm:block">
          {brand.productAttributionText}
        </span>
      </span>
    </span>
  );
}

export function VegaIdentity({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <VegaAvatar size={compact ? "sm" : "md"} />
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--vega-purple-500)]">{brand.aiDirectorName}</p>
        <p className="text-base font-black text-inherit">{brand.aiDirectorTitle}</p>
        <p className="text-xs font-semibold text-[var(--ghost-muted)]">{brand.productName}</p>
      </div>
    </div>
  );
}

export function VegaStatusBadge({ label, status = "neutral" }: { label: string; status?: VegaStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-black ${statusStyles[status]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

export function VegaGlowPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg border border-[var(--vega-purple-200)] bg-white shadow-[var(--vega-soft-glow)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[var(--vega-panel-gradient)]" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function VegaSectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--vega-teal)]">{children}</p>;
}

export function VegaPipelineStep({
  icon: Icon,
  title,
  text,
  index,
  showConnector,
}: {
  icon: ElementType;
  title: string;
  text: string;
  index: number;
  showConnector?: boolean;
}) {
  return (
    <div className="relative rounded-md border border-[var(--ghost-border)] bg-white p-5">
      {showConnector ? (
        <CircleDashed className="absolute right-3 top-8 hidden bg-white text-[var(--vega-purple-300)] md:block" size={24} aria-hidden="true" />
      ) : null}
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-md bg-[var(--vega-teal-50)] text-[var(--vega-teal)]">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="font-mono text-sm font-black text-[var(--vega-purple-500)]">0{index + 1}</span>
      </div>
      <h3 className="mt-5 text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--ghost-muted)]">{text}</p>
    </div>
  );
}

export function VegaAgentCard({
  name,
  detail,
  status = "ready",
  icon: Icon = Bot,
}: {
  name: string;
  detail: string;
  status?: VegaStatus;
  icon?: ElementType;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="shrink-0 text-[var(--vega-teal-200)]" size={17} aria-hidden="true" />
          <p className="truncate font-bold text-white">{name}</p>
        </div>
        <VegaStatusBadge label={status === "online" ? "Online" : status === "watching" ? "Watching" : "Ready"} status={status} />
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--ghost-dark-muted)]">{detail}</p>
    </div>
  );
}

export function VegaMessageBubble({
  speaker,
  children,
  side = "vega",
  className = "",
}: {
  speaker?: string;
  children: ReactNode;
  side?: "vega" | "customer";
  className?: string;
}) {
  const isCustomer = side === "customer";
  return (
    <div className={`flex gap-3 ${isCustomer ? "justify-end" : "justify-start"} ${className}`}>
      {!isCustomer ? <VegaAvatar size="xs" /> : null}
      <div
        className={`max-w-[86%] rounded-md px-4 py-3 ${
          isCustomer
            ? "bg-[var(--vega-ink)] text-white"
            : "border border-[var(--vega-purple-100)] bg-[var(--vega-purple-50)] text-[var(--vega-ink)]"
        }`}
      >
        {speaker ? (
          <p className={`text-xs font-black uppercase tracking-[0.14em] ${isCustomer ? "text-[var(--vega-lime)]" : "text-[var(--vega-purple-600)]"}`}>
            {speaker}
          </p>
        ) : null}
        <div className="mt-1 text-sm leading-6">{children}</div>
      </div>
    </div>
  );
}

export function VegaCommandInput({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-[var(--vega-purple-200)] bg-white shadow-[var(--vega-soft-glow)] ${className}`}>
      {children}
    </div>
  );
}

export function VegaPlanCard({
  name,
  priceLabel,
  target,
  vegaHandles,
  customerHandles,
  outcome,
  emphasized = false,
  label,
  children,
}: {
  name: string;
  priceLabel: string;
  target: string;
  vegaHandles: string;
  customerHandles: string;
  outcome: string;
  emphasized?: boolean;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`flex rounded-md border p-6 ${emphasized ? "border-[var(--vega-purple-300)] bg-[var(--vega-purple-50)]" : "border-[var(--ghost-border)] bg-white"} ${name.includes("Managed") ? "bg-[var(--vega-ink)] text-white" : ""}`}>
      <div className="flex w-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            {label ? <VegaStatusBadge label={label} status={emphasized ? "watching" : "neutral"} /> : null}
            <h3 className="mt-3 text-2xl font-black">{name}</h3>
            <p className={`mt-2 text-sm font-black ${name.includes("Managed") ? "text-[var(--vega-lime)]" : "text-[var(--vega-teal)]"}`}>
              {priceLabel}
            </p>
          </div>
          <CheckCircle2 className="shrink-0 text-[var(--vega-teal)]" size={22} aria-hidden="true" />
        </div>
        <p className="mt-5 font-bold">{target}</p>
        <p className={`mt-3 text-sm leading-6 ${name.includes("Managed") ? "text-[var(--ghost-dark-muted)]" : "text-[var(--ghost-muted)]"}`}>{vegaHandles}</p>
        <p className={`mt-3 text-sm leading-6 ${name.includes("Managed") ? "text-[var(--ghost-dark-muted)]" : "text-[var(--ghost-muted)]"}`}>
          <span className={name.includes("Managed") ? "font-bold text-white" : "font-bold text-[var(--vega-ink)]"}>Customer role:</span> {customerHandles}
        </p>
        <p className="mt-3 text-sm font-bold leading-6">{outcome}</p>
        {children}
      </div>
    </div>
  );
}

export function VegaThinkingState() {
  return <VegaStatusBadge label="Thinking through fit" status="watching" />;
}

export function VegaResearchState() {
  return <VegaStatusBadge label="Researching public signals" status="online" />;
}

export function VegaApprovalState() {
  return <VegaStatusBadge label="Waiting for approval" status="review" />;
}

export function GhostProductAttribution({ className = "" }: { className?: string }) {
  return <p className={`text-xs font-bold uppercase tracking-[0.16em] text-[var(--ghost-muted)] ${className}`}>{brand.productAttributionText}</p>;
}

export function PoweredByGhost({ className = "" }: { className?: string }) {
  return (
    <Link href={brand.publicCompanyUrl} className={`text-xs font-bold uppercase tracking-[0.16em] text-inherit underline-offset-4 hover:underline ${className}`}>
      {brand.poweredByText}
    </Link>
  );
}

export function VegaDirectorPanel() {
  const agents = [
    { name: "Market Scout", detail: "Finds businesses that match the market, territory, and buyer signal.", icon: Compass },
    { name: "Offer Strategist", detail: "Turns the service into a clear reason for prospects to respond.", icon: Brain },
    { name: "Sender Guardian", detail: "Protects sender reputation and blocks risky sends before scale.", icon: ShieldCheck, status: "watching" as VegaStatus },
    { name: "Call Assist", detail: "Prepares human follow-up tasks after successful outreach.", icon: PhoneCall },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-[var(--vega-deep)] p-4 shadow-[0_32px_90px_rgba(17,24,17,0.24)]">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <VegaAvatar size="md" state="neutral" priority />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--vega-teal-200)]">{brand.aiDirectorName}</p>
          <h2 className="text-xl font-black text-white">{brand.aiDirectorTitle}</h2>
          <PoweredByGhost className="text-[var(--ghost-dark-muted)]" />
        </div>
        <VegaStatusBadge label="Online" status="online" />
      </div>

      <div className="mt-4 grid gap-3">
        {agents.map((agent) => (
          <VegaAgentCard key={agent.name} name={agent.name} detail={agent.detail} icon={agent.icon} status={agent.status || "ready"} />
        ))}
      </div>

      <div className="mt-4 rounded-md bg-[var(--vega-lime-100)] p-4 text-[var(--vega-ink)]">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--vega-teal)]">Your next step</p>
        <p className="mt-2 text-lg font-black">Tell Vega what you sell and she&apos;ll design the first campaign with you.</p>
      </div>
    </div>
  );
}

export function VegaConsultationAttribution({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm leading-6 text-[var(--ghost-muted)] ${className}`}>
      {brand.aiDirectorName} is the {brand.aiDirectorTitle} inside {brand.productName}, a product of {brand.companyName}.
    </p>
  );
}
