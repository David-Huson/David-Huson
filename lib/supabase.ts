import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for the waitlist API route.
 *
 * Returns `null` when the environment variables are not configured, so the
 * landing page still renders and the API can respond with a friendly error
 * instead of crashing the build. Wire up `.env.local` (see `.env.example`)
 * to enable persistence.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}
