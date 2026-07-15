"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source"];

type TrackPayload = {
  event: string;
  metadata?: Record<string, unknown>;
};

function landingAttribution() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return attributionKeys.reduce<Record<string, string>>((acc, key) => {
    const value = params.get(key);
    if (value) acc[key] = value;
    return acc;
  }, {});
}

export function waitlistHref(content: string) {
  if (typeof window === "undefined") {
    return `/waitlist?utm_source=site&utm_medium=landing&utm_campaign=vega_public_home&utm_content=${content}`;
  }

  const target = new URL("/waitlist", window.location.origin);
  const current = new URLSearchParams(window.location.search);
  for (const key of attributionKeys) {
    const value = current.get(key);
    if (value) target.searchParams.set(key, value);
  }
  if (!target.searchParams.has("utm_source")) target.searchParams.set("utm_source", "site");
  if (!target.searchParams.has("utm_medium")) target.searchParams.set("utm_medium", "landing");
  if (!target.searchParams.has("utm_campaign")) target.searchParams.set("utm_campaign", "vega_public_home");
  target.searchParams.set("utm_content", content);
  return `${target.pathname}${target.search}`;
}

export function trackLandingEvent({ event, metadata = {} }: TrackPayload) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({
    event,
    source: "vega-landing",
    metadata: {
      ...metadata,
      path: window.location.pathname,
      attribution: landingAttribution(),
    },
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/waitlist/analytics", new Blob([payload], { type: "application/json" }));
    return;
  }

  void fetch("/api/waitlist/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

type TrackedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  children: ReactNode;
  content?: string;
  event: string;
  href?: string;
  preserveAttribution?: boolean;
};

export function TrackedLink({
  children,
  content = "cta",
  event,
  href,
  preserveAttribution = false,
  onClick,
  ...props
}: TrackedLinkProps) {
  const fallbackHref = preserveAttribution
    ? `/waitlist?utm_source=site&utm_medium=landing&utm_campaign=vega_public_home&utm_content=${content}`
    : href || "/waitlist";

  return (
    <Link
      href={fallbackHref}
      onClick={(action) => {
        const resolvedHref = preserveAttribution ? waitlistHref(content) : fallbackHref;
        trackLandingEvent({ event, metadata: { content, href: resolvedHref } });
        onClick?.(action);
        if (preserveAttribution && typeof window !== "undefined") {
          action.preventDefault();
          window.location.assign(resolvedHref);
        }
      }}
      {...props}
    >
      {children}
    </Link>
  );
}

export function SectionTracker({ event, section }: { event: string; section: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || tracked.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || tracked.current) return;
        tracked.current = true;
        trackLandingEvent({ event, metadata: { section } });
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [event, section]);

  return <span ref={ref} aria-hidden="true" className="absolute left-0 top-1/2 h-px w-px opacity-0" />;
}

export function TrackedDetails({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const iconLabel = useMemo(() => (opened ? "Collapse answer" : "Expand answer"), [opened]);

  return (
    <details
      className="group p-5"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpened(isOpen);
        if (isOpen) trackLandingEvent({ event: "faq opened", metadata: { question } });
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-[#f5f3ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c084fc]">
        {question}
        <span
          aria-label={iconLabel}
          className="grid size-7 shrink-0 place-items-center rounded-sm border border-[#8b5cf6]/35 text-[#c084fc] transition group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 text-sm leading-6 text-[#c7bdf0]">{children}</div>
    </details>
  );
}
