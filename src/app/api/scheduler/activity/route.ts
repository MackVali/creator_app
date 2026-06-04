import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const userId = user.id;

  const { data: existing, error: selectError } = await supabase
    .from("scheduler_user_state")
    .select("last_active_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (existing?.last_active_at) {
    const elapsed = Date.now() - new Date(existing.last_active_at).getTime();
    if (elapsed < SIX_HOURS_MS) {
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase.from("scheduler_user_state").upsert(
    {
      user_id: userId,
      last_active_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
