"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    setStatus("loading");
    setMessage("");

    // Attribution: grab ?source= or ?utm_source= if present.
    let source: string | null = null;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      source = params.get("source") ?? params.get("utm_source");
    }

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, useCase, source }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyJoined?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(
        data.alreadyJoined
          ? "You're already on the list — we'll be in touch soon."
          : "You're on the list. Watch your inbox for early access.",
      );
      setEmail("");
      setUseCase("");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-6 text-center"
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/20 text-2xl">
          ✓
        </div>
        <p className="text-lg font-semibold text-emerald-200">{message}</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-3 text-sm text-emerald-300/70 underline-offset-4 hover:underline"
        >
          Add another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="email" className="sr-only">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-base text-white placeholder:text-mist outline-none transition focus:border-accent-soft/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-xl bg-gradient-to-r from-accent to-glow px-6 py-3.5 text-base font-semibold text-ink shadow-lg shadow-accent/25 transition hover:shadow-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>

      <label htmlFor="useCase" className="sr-only">
        What would you automate first?
      </label>
      <input
        id="useCase"
        type="text"
        placeholder="Optional: what would you automate first?"
        value={useCase}
        onChange={(e) => setUseCase(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-mist outline-none transition focus:border-accent-soft/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/30"
      />

      {status === "error" && (
        <p role="alert" className="text-sm text-rose-300">
          {message}
        </p>
      )}
      <p className="text-xs text-mist">
        No spam. We&apos;ll only email you about early access.
      </p>
    </form>
  );
}
