import WaitlistForm from "@/components/WaitlistForm";

const automations = [
  {
    title: "Inbox & ticket triage",
    body: "Agents read incoming email and support tickets, route them, draft replies, and escalate the ones that actually need a human.",
    icon: "✉️",
  },
  {
    title: "Data entry & sync",
    body: "Pull data out of PDFs, forms, and spreadsheets and push it into your CRM, ERP, or database — accurately, every time.",
    icon: "🔁",
  },
  {
    title: "Reporting on autopilot",
    body: "Recurring reports assembled from your live data and delivered to the right people, in plain language, on schedule.",
    icon: "📊",
  },
  {
    title: "Document processing",
    body: "Invoices, contracts, and onboarding docs read, classified, and filed — with the key fields extracted and verified.",
    icon: "📄",
  },
  {
    title: "Lead & CRM hygiene",
    body: "Enrich new leads, dedupe records, and keep your pipeline clean without anyone copy-pasting between tabs.",
    icon: "🧲",
  },
  {
    title: "Custom workflows",
    body: "If it's repetitive and rule-shaped, we can automate it. Tell us the busywork and we'll design the agent.",
    icon: "⚙️",
  },
];

const steps = [
  {
    n: "01",
    title: "Map the busywork",
    body: "We sit with your team for a day and find the repetitive, high-volume tasks eating the most hours.",
  },
  {
    n: "02",
    title: "Build the automation",
    body: "We design and ship a custom AI workflow wired into your existing tools — no rip-and-replace.",
  },
  {
    n: "03",
    title: "Measure & expand",
    body: "We track hours saved and accuracy, tune the agents, then roll automation into the next workflow.",
  },
];

const faqs = [
  {
    q: "What kind of work can Autonoma actually automate?",
    a: "Anything repetitive and rule-shaped: reading and routing messages, moving data between systems, extracting fields from documents, generating recurring reports, and chaining those steps into end-to-end workflows. If a person does it the same way dozens of times a week, it's a candidate.",
  },
  {
    q: "Do we need to replace our existing software?",
    a: "No. Autonoma plugs into the tools you already use — email, CRM, spreadsheets, databases, and internal apps — through their APIs. We automate the work that happens between your tools, not the tools themselves.",
  },
  {
    q: "How do you keep a human in the loop?",
    a: "Every automation has guardrails. Low-risk tasks run autonomously; anything ambiguous or high-stakes is flagged for a person to approve. You decide where that line sits, and you can see every action an agent takes.",
  },
  {
    q: "What does it cost?",
    a: "Pricing scales with the work we take off your plate. Waitlist members get early-access pricing and a free automation audit. Join below and we'll share details as we open up spots.",
  },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
        <div className="aurora absolute right-[-10%] top-[20%] h-[400px] w-[400px] rounded-full bg-glow/10 blur-[100px]" />
      </div>

      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-glow text-ink">
            ◎
          </span>
          <span className="text-lg">Autonoma</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-mist md:flex">
          <a href="#what" className="transition hover:text-white">
            What we automate
          </a>
          <a href="#how" className="transition hover:text-white">
            How it works
          </a>
          <a href="#faq" className="transition hover:text-white">
            FAQ
          </a>
        </nav>
        <a
          href="#waitlist"
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition hover:border-white/30 hover:bg-white/10"
        >
          Join waitlist
        </a>
      </header>

      {/* Hero */}
      <section id="top" className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-mist">
            <span className="h-1.5 w-1.5 rounded-full bg-glow" />
            Now onboarding early-access partners
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Put your busywork on{" "}
            <span className="bg-gradient-to-r from-accent-soft to-glow bg-clip-text text-transparent">
              autopilot.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-mist md:text-xl">
            Autonoma builds custom AI automations that take the repetitive,
            manual work off your team&apos;s plate — so the people you hired can
            do the work you actually hired them for.
          </p>

          <div id="waitlist" className="mx-auto mt-10 max-w-xl scroll-mt-24">
            <WaitlistForm />
          </div>

          <p className="mt-6 text-sm text-mist">
            Join <span className="font-semibold text-white">the waitlist</span>{" "}
            for early access, founder pricing, and a free automation audit.
          </p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-white/5 bg-ink-soft/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 text-center md:grid-cols-4">
          {[
            ["40+ hrs", "saved per month, per automated workflow"],
            ["Days, not months", "from idea to a working automation"],
            ["Your stack", "we plug into the tools you already use"],
            ["Human-approved", "guardrails on every high-stakes action"],
          ].map(([stat, label]) => (
            <div key={stat}>
              <div className="text-2xl font-bold text-white">{stat}</div>
              <div className="mt-1 text-sm text-mist">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* What we automate */}
      <section id="what" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            The work nobody should be doing by hand
          </h2>
          <p className="mt-4 text-lg text-mist">
            Every business runs on a hidden layer of copy-paste, re-typing, and
            manual routing. Autonoma automates it.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((a) => (
            <div
              key={a.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-accent-soft/40 hover:bg-white/[0.06]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-xl">
                {a.icon}
              </div>
              <h3 className="text-lg font-semibold">{a.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="scroll-mt-20 border-y border-white/5 bg-ink-soft/50 py-24"
      >
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From busywork to automated in three steps
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="relative">
                <div className="text-sm font-mono font-semibold text-accent-soft">
                  {s.n}
                </div>
                <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-mist">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 py-24">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Questions, answered
        </h2>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition open:border-accent-soft/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                {f.q}
                <span className="text-mist transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-mist">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-accent/15 via-ink-soft to-ink p-10 text-center md:p-16">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="aurora absolute left-1/2 top-0 h-72 w-[600px] -translate-x-1/2 rounded-full bg-glow/10 blur-[100px]" />
          </div>
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Be first in line when we open the doors.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-mist">
            Early-access partners get founder pricing, priority onboarding, and a
            free audit of where automation will save you the most time.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-mist sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-accent to-glow text-xs text-ink">
              ◎
            </span>
            <span>© {new Date().getFullYear()} Autonoma</span>
          </div>
          <p>Built for teams who&apos;d rather be doing the real work.</p>
        </div>
      </footer>
    </main>
  );
}
