import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Pragmatic email check — good enough to catch typos without rejecting valid
// addresses. Real validation happens when we actually email people.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Payload = {
  email?: unknown;
  name?: unknown;
  company?: unknown;
  useCase?: unknown;
  source?: unknown;
};

function asTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = asTrimmedString(body.email, 320)?.toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    // Not configured yet — don't pretend it worked, but stay friendly.
    return NextResponse.json(
      {
        error:
          "The waitlist isn't connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to enable it.",
      },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("waitlist").insert({
    email,
    name: asTrimmedString(body.name, 120),
    company: asTrimmedString(body.company, 120),
    use_case: asTrimmedString(body.useCase, 2000),
    source: asTrimmedString(body.source, 120),
  });

  if (error) {
    // 23505 = unique_violation → they're already on the list. Treat as success.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: true, alreadyJoined: true },
        { status: 200 },
      );
    }
    console.error("waitlist insert failed", error);
    return NextResponse.json(
      { error: "Something went wrong on our end. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
