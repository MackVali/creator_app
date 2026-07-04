import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatDateKeyInTimeZone,
  normalizeTimeZone,
} from "@/lib/scheduler/timezone";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export const runtime = "nodejs";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const APP_ACTIVITY_FALLBACK_TIMEZONE = "America/Chicago";

type ActivityHeartbeatBody = {
  timezone?: unknown;
};

export async function POST(request: Request) {
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
  const requestedTimeZone = await readRequestedTimeZone(request);
  const profileTimeZone = requestedTimeZone
    ? null
    : await resolveProfileTimeZone(supabase, userId);
  const timezone = normalizeTimeZone(
    requestedTimeZone ?? profileTimeZone ?? APP_ACTIVITY_FALLBACK_TIMEZONE
  );
  const now = new Date();
  const nowIso = now.toISOString();
  const activityDate = formatDateKeyInTimeZone(now, timezone);

  const { error: activityError } = await supabase
    .from("daily_app_activity")
    .upsert(
      {
        user_id: userId,
        activity_date: activityDate,
        timezone,
        last_seen_at: nowIso,
      },
      { onConflict: "user_id,activity_date" }
    );

  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

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

async function readRequestedTimeZone(request: Request) {
  try {
    const body = (await request.json()) as ActivityHeartbeatBody;
    return typeof body.timezone === "string" && body.timezone.trim().length > 0
      ? body.timezone.trim()
      : null;
  } catch {
    return null;
  }
}

async function resolveProfileTimeZone(
  client: SupabaseClient<Database>,
  userId: string
) {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      return null;
    }
    return typeof data?.timezone === "string" ? data.timezone.trim() : null;
  } catch {
    return null;
  }
}
