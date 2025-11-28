import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type RouteContext = {
  params: { id: string };
};

type Supabase = SupabaseClient<Database>;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase client unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as { startUtc?: string } | null;
  const startUtc = payload?.startUtc;
  if (!startUtc || typeof startUtc !== "string") {
    return NextResponse.json({ error: "Missing startUtc" }, { status: 400 });
  }

  const parsedStart = new Date(startUtc);
  if (Number.isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }

  const { data: instance, error: fetchError } = await supabase
    .from("schedule_instances")
    .select("id, user_id, start_utc, end_utc, duration_min")
    .eq("id", context.params.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Reschedule fetch error", fetchError);
    return NextResponse.json({ error: "Unable to load scheduled event" }, { status: 500 });
  }

  if (!instance || instance.user_id !== user.id) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const durationMinutes =
    typeof instance.duration_min === "number" && Number.isFinite(instance.duration_min)
      ? instance.duration_min
      : (Date.parse(instance.end_utc ?? "") - Date.parse(instance.start_utc ?? "")) / 60000;

  const validDuration =
    typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : 60;

  const nextStartIso = parsedStart.toISOString();
  const nextEnd = new Date(parsedStart.getTime() + validDuration * 60_000);
  const nextEndIso = nextEnd.toISOString();

  const { error: updateError } = await supabase
    .from("schedule_instances")
    .update({ start_utc: nextStartIso, end_utc: nextEndIso, locked: true })
    .eq("id", instance.id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Reschedule update error", updateError);
    return NextResponse.json({ error: "Unable to update schedule" }, { status: 500 });
  }

  await resolveConflictsAfterUpdate(supabase, {
    userId: user.id,
    pivotId: instance.id,
    pivotStart: nextStartIso,
    pivotEnd: nextEndIso,
  });

  return NextResponse.json({ success: true, startUtc: nextStartIso });
}

function getUtcDayBounds(dateIso: string) {
  const date = new Date(dateIso);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function resolveConflictsAfterUpdate(
  supabase: Supabase,
  params: { userId: string; pivotId: string; pivotStart: string; pivotEnd: string }
) {
  const { userId, pivotId, pivotStart, pivotEnd } = params;
  const pivotStartMs = Date.parse(pivotStart);
  const pivotEndMs = Date.parse(pivotEnd);

  const { data: futureRows, error: futureError } = await supabase
    .from("schedule_instances")
    .select("id, start_utc, end_utc, duration_min")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .gte("start_utc", pivotStart)
    .order("start_utc", { ascending: true });

  if (futureError) {
    console.error("Failed to load day schedule for conflict resolution", futureError);
    return;
  }

  const { data: overlapRows, error: overlapError } = await supabase
    .from("schedule_instances")
    .select("id, start_utc, end_utc, duration_min")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .lt("start_utc", pivotStart)
    .gt("end_utc", pivotStart)
    .order("start_utc", { ascending: true });

  if (overlapError) {
    console.error("Failed to load overlapping events", overlapError);
  }

  const events =
    [
      ...(overlapRows ?? []),
      ...(futureRows ?? []),
    ]
      .filter(item => item.id !== pivotId)
      .map(item => ({
        id: item.id,
        startUtc: item.start_utc,
        endUtc: item.end_utc,
        durationMinutes:
          typeof item.duration_min === "number" && Number.isFinite(item.duration_min)
          ? item.duration_min
          : null,
      })) ?? [];

  events.sort((a, b) => {
    const aStart = Date.parse(a.startUtc ?? pivotStart);
    const bStart = Date.parse(b.startUtc ?? pivotStart);
    return aStart - bStart;
  });

  let lastEndMs = pivotEndMs;
  const updates: { id: string; start_utc: string; end_utc: string }[] = [];

  for (const event of events) {
    const originalStartMs = new Date(event.startUtc ?? pivotStart).getTime();
    const originalEndMs = new Date(event.endUtc ?? event.startUtc ?? pivotStart).getTime();
    const durationMs =
      event.durationMinutes != null && Number.isFinite(event.durationMinutes)
        ? event.durationMinutes * 60_000
        : Math.max(originalEndMs - originalStartMs, 30 * 60_000);

    const targetStartMs = Math.max(originalStartMs, lastEndMs);
    let targetEndMs = targetStartMs + durationMs;

    if (targetStartMs !== originalStartMs || targetEndMs !== originalEndMs) {
      updates.push({
        id: event.id,
        start_utc: new Date(targetStartMs).toISOString(),
        end_utc: new Date(targetEndMs).toISOString(),
      });
    }
    lastEndMs = Math.max(lastEndMs, targetEndMs);
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("schedule_instances")
      .update({ start_utc: update.start_utc, end_utc: update.end_utc })
      .eq("id", update.id)
      .eq("user_id", userId);
    if (updateError) {
      console.error("Failed to shift overlapping schedule instance", updateError);
    }
  }
}
