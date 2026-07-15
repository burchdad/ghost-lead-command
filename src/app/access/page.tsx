"use client";

import { LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function AccessForm() {
  const searchParams = useSearchParams();
  const [accessKey, setAccessKey] = useState("");
  const [status, setStatus] = useState("Enter the command key to continue.");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("Checking access...");

    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey: accessKey.trim() }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setLoading(false);
        setStatus(payload.error || "That key did not work.");
        return;
      }

      const next = searchParams.get("next") || "/command";
      setStatus("Access granted. Opening command center...");
      window.location.replace(next === "/access" ? "/command" : next);
    } catch {
      setLoading(false);
      setStatus("Access check failed. Try again in a moment.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#080c0d] px-5 text-white">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-md border border-white/10 bg-[#111719] p-6 shadow-2xl shadow-black/40"
      >
        <div className="grid size-12 place-items-center rounded-md bg-[#d8ff5f] text-[#101417]">
          <LockKeyhole size={24} />
        </div>
        <p className="mt-5 text-sm uppercase tracking-[0.18em] text-[#83d0c2]">Ghost Lead Command</p>
        <h1 className="mt-2 text-2xl font-semibold">Private operator access</h1>
        <label className="mt-6 grid gap-2 text-sm text-[#aebbb7]">
          Access key
          <input
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="rounded-md border border-white/10 bg-[#080c0d] px-3 py-3 text-white outline-none focus:border-[#83d0c2]"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !accessKey.trim()}
          className="mt-4 w-full rounded-md bg-[#d8ff5f] px-4 py-3 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
        >
          {loading ? "Unlocking..." : "Enter Command"}
        </button>
        <p className="mt-4 text-sm text-[#83d0c2]">{status}</p>
      </form>
    </main>
  );
}

export default function AccessPage() {
  return (
    <Suspense fallback={null}>
      <AccessForm />
    </Suspense>
  );
}
