# Autonoma — Session Handoff

> Distilled context so anyone (human or agent) can pick this up cold.
> Last updated: 2026-06-04.

---

## 1. What this is

**Autonoma** is a pre-launch **AI automation business**. This repo is its
**marketing landing page + waitlist**. The goal of the site is to collect
early-access signups while the business is being stood up.

**Positioning**
- Name: **Autonoma** (rooted in "autonomous" — sleek, premium, slightly
  enterprise).
- Tagline: **"Put your busywork on autopilot."**
- One-liner: Autonoma builds **custom AI automations** that take repetitive,
  manual work off a team's plate — inbox triage, data entry, reporting,
  document processing, CRM hygiene, and custom workflows.
- Target customer: small/mid teams drowning in copy-paste busywork who want
  automation wired into the tools they already use (no rip-and-replace).

---

## 2. Decisions already made (don't re-litigate without reason)

| Decision | Choice | Why |
|---|---|---|
| Company name | **Autonoma** | Picked by the founder from 4 options (others: Flowgent, Cascade AI, Loopless). |
| Stack | **Next.js (App Router) + Tailwind CSS v4 + TypeScript** | Matches the founder's T3/Next.js background; easy Vercel deploy. |
| Waitlist backend | **Supabase** (Postgres) | Persistent, queryable, production-ready. |
| Design direction | Dark / premium, indigo→cyan gradient, animated "aurora" glow | Conveys a modern AI product. |

---

## 3. Architecture

```
app/
  layout.tsx              # SEO + OpenGraph metadata
  page.tsx                # the landing page (all sections, server component)
  globals.css             # Tailwind v4 @theme tokens + aurora keyframes
  api/waitlist/route.ts   # POST endpoint: validate + insert signup
components/
  WaitlistForm.tsx        # "use client" form: idle/loading/success/error states
lib/
  supabase.ts             # server Supabase client; returns null if env unset
supabase/
  migrations/0001_waitlist.sql   # table + unique index + RLS policy
.env.example              # SUPABASE_URL, SUPABASE_ANON_KEY
```

**Page sections** (`app/page.tsx`): nav → hero w/ waitlist → trust stats strip
→ "what we automate" (6 cards) → how-it-works (3 steps) → FAQ (`<details>`) →
final CTA w/ second waitlist form → footer.

**Waitlist data flow**
1. `WaitlistForm` POSTs `{ email, useCase, source }` to `/api/waitlist`.
   `source` is pulled from `?source=` or `?utm_source=` for attribution.
2. The route validates the email server-side, trims/caps all fields, and
   inserts into the `waitlist` table via the anon key.
3. Duplicate email → Postgres `23505` → treated as success
   ("you're already on the list").
4. If env vars are missing, the route returns a friendly **503** and the page
   still renders — nothing crashes.

**Security model:** RLS is ON. The anon role can **INSERT only**, never
SELECT — so signups can't be harvested back out through the public key. Read
the list from the Supabase Dashboard or with the `service_role` key.

**The `waitlist` table** (`supabase/migrations/0001_waitlist.sql`):
`id uuid pk`, `email text`, `name`, `company`, `use_case`, `source`,
`created_at timestamptz`. Unique index on `lower(email)`.

---

## 4. ⚠️ Current status of the waitlist backend — READ THIS

The waitlist is **coded and ready but NOT connected to a live database yet.**
No Supabase project has been provisioned. Why:

- The Supabase access available in the build session was **read-only** (no
  project/table creation tools).
- The only Supabase projects visible belonged to an **unrelated org
  ("Breathe Free Sinus & Allergy Centers")** — production data that must NOT
  be touched.

**So the #1 next step is to provision Autonoma's own Supabase project** (see
§5). Until then the form returns the 503 "not connected yet" message.

---

## 5. How to run / finish setup

```bash
npm install
cp .env.example .env.local      # fill in values
npm run dev                     # http://localhost:3000
```

**To make the waitlist live:**
1. Create a Supabase project under an account *you* own.
2. Run `supabase/migrations/0001_waitlist.sql` in the project's SQL Editor
   (or `supabase link` + `supabase db push`).
3. Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings → API) into
   `.env.local`.
4. Restart dev. Signups now land in the `waitlist` table (view in Table Editor).

**Deploy:** Vercel — import repo, add the same two env vars, ship. Any host
that runs `next build && next start` also works.

---

## 6. Build & version notes

- Verified `npm run build` passes and smoke-tested live: homepage renders,
  invalid email → 400, valid email w/o Supabase → 503.
- **Next.js was bumped 15.1.6 → 16.x** during the build because 15.1.6 carried
  a flagged CVE (CVE-2025-66478). React was aligned to 19.x to match Next 16.
- Tailwind **v4** (uses `@import "tailwindcss"` + `@tailwindcss/postcss`, theme
  tokens live in `globals.css` under `@theme` — there is no `tailwind.config.js`).
- `npm run lint` references `next lint`, which Next 16 has deprecated; switch to
  ESLint flat config if you want linting.

---

## 7. Open items / suggested next steps

- [ ] **Provision the Supabase project** and connect it (the gating task).
- [ ] Deploy to Vercel + point a domain (e.g. autonoma.ai — verify availability).
- [ ] Add an **OG/social share image** (referenced in metadata, not yet created).
- [ ] **Admin view** for signups (simple `service_role` page or just use the
      Supabase dashboard).
- [ ] **Email notification** on new signup (Supabase DB webhook → email, or a
      resend/postmark call from the API route).
- [ ] Analytics (Vercel Analytics / Plausible) + basic conversion tracking.
- [ ] Replace placeholder trust stats ("40+ hrs saved", etc.) with real numbers
      once there's data.
- [ ] Consider double opt-in / simple bot protection (honeypot or hCaptcha) if
      spam becomes an issue.

---

## 8. Provenance

Originally built on branch `claude/ai-automation-landing-page-nzmjC` in the
`David-Huson/David-Huson` profile repo, then split into this dedicated repo.
