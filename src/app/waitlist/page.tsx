"use client";

import { ArrowRight, Check, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import VegaAvatar from "@/components/VegaAvatar";

type SubmitState = "idle" | "submitting" | "success" | "error";

const benefits = [
  "Priority beta access",
  "Founding-member pricing opportunities",
  "Direct influence over Vega's roadmap",
  "Complimentary lead-generation assessment",
  "Potential access to an extended pilot",
];

const currentToolsOptions = [
  "Apollo",
  "Clay",
  "GoHighLevel",
  "HubSpot",
  "Salesforce",
  "LinkedIn Sales Navigator",
  "GojiBerry",
  "Instantly",
  "Smartlead",
  "Manual outreach",
  "None",
  "Other",
] as const;

const monthlyLeadVolumeOptions = ["Under 50", "50-100", "101-500", "501-1,000", "Over 1,000"] as const;

const betaInterestOptions = [
  "Yes, I want to actively test and provide feedback",
  "Maybe, tell me more",
  "No, just keep me updated",
] as const;

export default function WaitlistPage() {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const success = state === "success";

  const submitLabel = useMemo(() => {
    if (state === "submitting") return "Submitting";
    return "Enter the Vega Early Access Contest";
  }, [state]);

  function toggleTool(tool: string) {
    setSelectedTools((current) => current.includes(tool) ? current.filter((item) => item !== tool) : [...current, tool]);
  }

  async function track(event: string, metadata: Record<string, unknown> = {}) {
    await fetch("/api/waitlist/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, source: "vega-waitlist", metadata }),
    }).catch(() => undefined);
  }

  useEffect(() => {
    void track("waitlist route entered", {
      search: window.location.search,
      referrer: document.referrer,
    });
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      firstName: form.get("firstName"),
      lastName: form.get("lastName"),
      email: form.get("email"),
      phone: form.get("phone"),
      companyName: form.get("companyName"),
      companyWebsite: form.get("companyWebsite"),
      role: form.get("role"),
      biggestChallenge: form.get("biggestChallenge"),
      currentTools: selectedTools,
      otherTool: form.get("otherTool"),
      monthlyLeadVolume: form.get("monthlyLeadVolume"),
      betaInterest: form.get("betaInterest"),
      additionalNotes: form.get("additionalNotes"),
      consent: form.get("consent") === "on",
      website: form.get("website"),
    };

    await track("waitlist form submitted", { tools: selectedTools.length });
    const response = await fetch(`/api/waitlist${window.location.search}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setState("error");
      setError(body.error || "Vega could not accept the submission. Please try again.");
      await track("waitlist submission failed", { status: response.status });
      return;
    }

    setState("success");
    await track("waitlist submission succeeded");
  }

  function onStart() {
    if (!started) {
      setStarted(true);
      void track("waitlist form started");
    }
  }

  return (
    <main className="min-h-screen bg-[#08070d] text-white">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.24),transparent_34%),linear-gradient(135deg,#08070d_0%,#11101c_48%,#08070d_100%)]" />
        <div className="relative mx-auto grid min-h-screen max-w-7xl gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:py-12">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#c4b5fd]">
                <Sparkles size={17} />
                Vega
              </Link>
              <div className="mt-10 grid max-w-2xl gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#ddd6fe]">
                  Private early access
                </p>
                <h1 className="text-[0] font-semibold leading-[1.05] tracking-normal text-white">
                  Meet Vega — Your AI Lead Command Team
                  <span className="block text-4xl sm:text-6xl">Meet Vega, your AI Lead Command Team</span>
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-[#d8d4e8] sm:text-lg">
                  Join the private waitlist for early access to an AI sales operating system that discovers prospects, identifies buying signals, creates personalized outreach, manages follow-ups, and helps turn replies into revenue.
                </p>
                </div>
                <VegaAvatar size="md" caption="Intake online" className="hidden sm:inline-flex" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <Check size={18} className="mt-0.5 shrink-0 text-[#a78bfa]" />
                  <p className="text-sm leading-5 text-[#ebe7ff]">{benefit}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-full rounded-lg border border-white/10 bg-[#0f0d18]/90 p-4 shadow-2xl shadow-violet-950/30 backdrop-blur sm:p-6">
              {success ? (
                <div className="grid min-h-[560px] place-items-center text-center">
                  <div className="max-w-md">
                    <VegaAvatar size="md" caption="You are in" className="mx-auto" />
                    <h2 className="mt-6 text-3xl font-semibold">You&apos;re on the Vega waitlist.</h2>
                    <p className="mt-4 leading-7 text-[#d8d4e8]">
                      Your information has been received. Vega will review early-access contestants and prioritize businesses that can actively test the platform and provide meaningful feedback.
                    </p>
                    <p className="mt-4 text-sm text-[#aaa2c7]">
                      Watch your inbox for product updates, beta invitations, and founding-member opportunities.
                    </p>
                    <Link
                      href="/"
                      className="mt-8 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#100d18] transition hover:bg-[#ddd6fe]"
                    >
                      Return to Vega
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubmit} onChange={onStart} className="grid gap-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold">Early access intake</h2>
                      <p className="mt-1 text-sm text-[#aaa2c7]">Tell Vega where your lead engine needs leverage.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <VegaAvatar size="sm" showStatus={false} className="hidden sm:inline-flex" />
                      <ShieldCheck className="text-[#a78bfa]" />
                    </div>
                  </div>

                  <div className="hidden">
                    <label>
                      Website
                      <input name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field name="firstName" label="First name" required />
                    <Field name="lastName" label="Last name" required />
                    <Field name="email" label="Email" type="email" required />
                    <Field name="phone" label="Phone number" type="tel" />
                    <Field name="companyName" label="Company name" required />
                    <Field name="companyWebsite" label="Company website" type="url" />
                    <Field name="role" label="Role or job title" required className="sm:col-span-2" />
                  </div>

                  <label className="grid gap-2 text-sm text-[#d8d4e8]">
                    Biggest lead-generation or sales challenge
                    <textarea
                      name="biggestChallenge"
                      required
                      rows={4}
                      className="rounded-md border border-white/10 bg-[#171323] px-3 py-2 text-white outline-none transition focus:border-[#a78bfa]"
                    />
                  </label>

                  <div className="grid gap-2">
                    <p className="text-sm text-[#d8d4e8]">Current lead-generation tools</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {currentToolsOptions.map((tool) => (
                        <button
                          type="button"
                          key={tool}
                          onClick={() => toggleTool(tool)}
                          className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition ${
                            selectedTools.includes(tool)
                              ? "border-[#a78bfa] bg-[#7c3aed]/30 text-white"
                              : "border-white/10 bg-[#171323] text-[#cfc8e8] hover:border-[#a78bfa]/70"
                          }`}
                        >
                          {tool}
                        </button>
                      ))}
                    </div>
                    {selectedTools.includes("Other") ? <Field name="otherTool" label="Other tool" /> : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select name="monthlyLeadVolume" label="Estimated monthly lead volume" options={monthlyLeadVolumeOptions} />
                    <Select name="betaInterest" label="Beta testing interest" options={betaInterestOptions} />
                  </div>

                  <label className="grid gap-2 text-sm text-[#d8d4e8]">
                    Notes or anything else they want Vega to know
                    <textarea
                      name="additionalNotes"
                      rows={3}
                      className="rounded-md border border-white/10 bg-[#171323] px-3 py-2 text-white outline-none transition focus:border-[#a78bfa]"
                    />
                  </label>

                  <label className="flex gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-[#d8d4e8]">
                    <input name="consent" type="checkbox" required className="mt-1 size-4 accent-[#8b5cf6]" />
                    <span>
                      By joining, you agree to receive Vega early-access and product communications. You can unsubscribe at any time. <Link href="/privacy" className="text-[#c4b5fd] underline">Privacy notice</Link>.
                    </span>
                  </label>

                  <p className="text-xs leading-5 text-[#9188b1]">
                    Joining the waitlist does not guarantee beta access, pricing, founding-member offers, or a free pilot.
                  </p>

                  {error ? <p className="rounded-md border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</p> : null}

                  <button
                    type="submit"
                    disabled={state === "submitting"}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-[#8b5cf6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {state === "submitting" ? <LoaderCircle size={18} className="animate-spin" /> : null}
                    {submitLabel}
                    {state !== "submitting" ? <ArrowRight size={17} /> : null}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`grid gap-2 text-sm text-[#d8d4e8] ${className}`}>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className="rounded-md border border-white/10 bg-[#171323] px-3 py-2 text-white outline-none transition focus:border-[#a78bfa]"
      />
    </label>
  );
}

function Select({ label, name, options }: { label: string; name: string; options: readonly string[] }) {
  return (
    <label className="grid gap-2 text-sm text-[#d8d4e8]">
      {label}
      <select
        name={name}
        required
        defaultValue=""
        className="rounded-md border border-white/10 bg-[#171323] px-3 py-2 text-white outline-none transition focus:border-[#a78bfa]"
      >
        <option value="" disabled>Select one</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
