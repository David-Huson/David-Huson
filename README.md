# Autonoma

**Put your busywork on autopilot.**

Autonoma builds custom AI automations that take repetitive, manual work off a
team's plate — inbox triage, data entry, reporting, document processing, and
more. This repo is the marketing landing page and waitlist.

Built with **Next.js 16 (App Router)**, **Tailwind CSS v4**, and a
**Supabase**-backed waitlist.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev                  # http://localhost:3000
```

The page renders fine without Supabase configured — the waitlist form just
returns a friendly "not connected yet" message until you wire it up.

---

## Setting up the waitlist (Supabase)

1. **Create a project** at [supabase.com](https://supabase.com) (use a project
   that belongs to *you* — don't reuse an unrelated one).

2. **Create the table.** Open the project's **SQL Editor** and run the
   migration in [`supabase/migrations/0001_waitlist.sql`](supabase/migrations/0001_waitlist.sql).
   It creates a `waitlist` table, a unique index on email, and a Row Level
   Security policy that lets anonymous visitors **insert** (join) but **not
   read** the list — so signups stay private.

   _Or_, with the Supabase CLI:

   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```

3. **Add your keys** to `.env.local` (find them in
   **Project Settings → API**):

   ```bash
   SUPABASE_URL=https://<your-ref>.supabase.co
   SUPABASE_ANON_KEY=<your anon / publishable key>
   ```

4. Restart `npm run dev`. Signups now land in the `waitlist` table. View them
   in the Supabase **Table Editor**, or export to CSV.

---

## How the waitlist works

- The form (`components/WaitlistForm.tsx`) POSTs to `/api/waitlist`.
- The API route (`app/api/waitlist/route.ts`) validates the email server-side,
  captures an optional "what would you automate first?" answer and a `?source=`
  / `?utm_source=` attribution param, then inserts into Supabase.
- Duplicate emails are treated as success ("you're already on the list").
- RLS means the public anon key can only **insert**, never **select** —
  emails can't be harvested back out through the client.

---

## Project structure

```
app/
  layout.tsx            # metadata, OG tags
  page.tsx              # the landing page (hero, features, how-it-works, FAQ, CTA)
  globals.css           # Tailwind v4 theme + aurora animation
  api/waitlist/route.ts # waitlist insert endpoint
components/
  WaitlistForm.tsx      # client-side form with loading/success/error states
lib/
  supabase.ts           # server Supabase client (null-safe when unconfigured)
supabase/
  migrations/0001_waitlist.sql
```

---

## Deploying

Deploys cleanly to **Vercel**: import the repo, add `SUPABASE_URL` and
`SUPABASE_ANON_KEY` as environment variables, and ship. Any Node host that runs
`next build && next start` works too.
