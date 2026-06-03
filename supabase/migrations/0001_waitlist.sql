-- ============================================================================
-- Autonoma waitlist
--
-- Run this against your Supabase project. Either:
--   • paste it into the Supabase Dashboard → SQL Editor and run, or
--   • use the CLI:  supabase db push   (after `supabase link`)
-- ============================================================================

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  company     text,
  -- "What would you automate first?" — free-text interest signal.
  use_case    text,
  -- Where the signup came from (utm/source param), useful for attribution.
  source      text,
  created_at  timestamptz not null default now()
);

-- One signup per email. The API relies on this to detect duplicates (23505).
create unique index if not exists waitlist_email_key
  on public.waitlist (lower(email));

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- The table is locked down by default. We expose exactly one capability to
-- the anon role: INSERT. Nobody can read the list back through the anon key,
-- so harvested emails stay private. Read it from the Dashboard or with the
-- service_role key.
-- ----------------------------------------------------------------------------
alter table public.waitlist enable row level security;

drop policy if exists "anon can join the waitlist" on public.waitlist;
create policy "anon can join the waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);
