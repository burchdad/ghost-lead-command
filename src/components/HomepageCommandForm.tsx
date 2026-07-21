"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { FormEvent, ReactNode, useRef, useState } from "react";
import { trackLandingEvent } from "@/components/VegaLandingClient";

type PromptExample = {
  id: string;
  text: string;
};

const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source"];

function onboardingHref({
  prompt,
  section,
  exampleId,
  productCode,
  fulfillment,
}: {
  prompt?: string;
  section: string;
  exampleId?: string;
  productCode?: string;
  fulfillment?: string;
}) {
  if (typeof window === "undefined") {
    const params = new URLSearchParams({ referring_section: section });
    if (prompt) params.set("prompt", prompt);
    if (exampleId) params.set("example", exampleId);
    if (productCode) params.set("product_interest", productCode);
    if (fulfillment) params.set("fulfillment", fulfillment);
    return `/onboarding/ai?${params.toString()}`;
  }

  const target = new URL("/onboarding/ai", window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of attributionKeys) {
    const value = current.get(key);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set("referring_section", section);
  if (prompt) target.searchParams.set("prompt", prompt);
  if (exampleId) target.searchParams.set("example", exampleId);
  if (productCode) target.searchParams.set("product_interest", productCode);
  if (fulfillment) target.searchParams.set("fulfillment", fulfillment);
  return `${target.pathname}${target.search}`;
}

export function HomepageCommandForm({
  examples,
  compact = false,
  section = "hero",
}: {
  examples: PromptExample[];
  compact?: boolean;
  section?: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [selectedExampleId, setSelectedExampleId] = useState<string | undefined>();
  const trackedInput = useRef(false);

  function markInputStarted() {
    if (trackedInput.current) return;
    trackedInput.current = true;
    trackLandingEvent({ event: "hero input started", metadata: { section } });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackLandingEvent({
      event: "hero CTA clicked",
      metadata: { section, hasPrompt: Boolean(prompt.trim()), selectedExampleId },
    });
    window.location.assign(onboardingHref({ prompt: prompt.trim(), section, exampleId: selectedExampleId }));
  }

  return (
    <div>
      <form
        onSubmit={submit}
        className={
          compact
            ? "flex w-full items-center"
            : "mx-auto mt-9 flex max-w-2xl flex-col gap-3 rounded-lg border border-[#ced8d1] bg-white p-2 shadow-[0_24px_80px_rgba(34,43,38,0.12)] sm:flex-row lg:mx-0"
        }
      >
        <label className="sr-only" htmlFor={compact ? "nav-prompt" : "hero-prompt"}>
          Tell Vega what you sell and who you want to reach
        </label>
        <input
          id={compact ? "nav-prompt" : "hero-prompt"}
          value={prompt}
          onFocus={markInputStarted}
          onChange={(event) => {
            setPrompt(event.target.value);
            markInputStarted();
          }}
          className={
            compact
              ? "h-10 min-w-0 flex-1 rounded-l-md border border-[#cfd8d1] bg-white px-4 text-sm outline-none transition focus:border-[#7f8cff] focus:ring-2 focus:ring-[#7f8cff]/20"
              : "min-h-14 min-w-0 flex-1 rounded-md px-4 text-base outline-none focus:ring-2 focus:ring-[#7f8cff]/30"
          }
          placeholder={compact ? "Enter your lead task, market, or customer type" : "Tell Vega what you sell and who you want to reach..."}
        />
        <button
          className={
            compact
              ? "grid h-10 w-12 place-items-center rounded-r-md bg-[#111811] text-white transition hover:bg-[#243129] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f8cff]"
              : "inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-[#7c5cff] px-6 text-base font-black text-white transition hover:bg-[#6848e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7f8cff]"
          }
          type="submit"
          aria-label={compact ? "Start Vega consultation" : undefined}
        >
          {compact ? (
            <Search size={18} aria-hidden="true" />
          ) : (
            <>
              Build my pipeline
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      {!compact ? (
        <div className="mx-auto mt-4 flex max-w-2xl flex-wrap gap-2 lg:mx-0">
          {examples.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => {
                setPrompt(example.text);
                setSelectedExampleId(example.id);
                trackLandingEvent({
                  event: "example command selected",
                  metadata: { section, selectedExampleId: example.id },
                });
              }}
              className="rounded-md border border-[#d9dfda] bg-white/80 px-3 py-2 text-left text-sm font-semibold text-[#465049] transition hover:border-[#00a885] hover:text-[#0a715f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00a885]"
            >
              {example.text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OnboardingCta({
  children,
  section,
  productCode,
  fulfillment,
  event = "AI consultation started",
  className,
}: {
  children: ReactNode;
  section: string;
  productCode?: string;
  fulfillment?: string;
  event?: string;
  className: string;
}) {
  const href = onboardingHref({ section, productCode, fulfillment });

  return (
    <Link
      href={href}
      className={className}
      onClick={(clickEvent) => {
        trackLandingEvent({
          event,
          metadata: { section, productCode, fulfillment },
        });
        if (typeof window !== "undefined") {
          clickEvent.preventDefault();
          window.location.assign(onboardingHref({ section, productCode, fulfillment }));
        }
      }}
    >
      {children}
    </Link>
  );
}
