import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  fetchInstancesForRange,
  type ScheduleInstance,
} from "@/lib/scheduler/instanceRepo";
import { fetchHabitsForSchedule } from "@/lib/scheduler/habits";
import {
  fetchAllProjectsMap,
  fetchGoalsForUser,
  fetchProjectSkillsForProjects,
  fetchWindowsForDate,
} from "@/lib/scheduler/repo";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
} from "@/lib/scheduler/timezone";
import {
  LOCAL_RESCHEDULE_CANCEL_REASON,
  type LocalRescheduleCleanupSourceContext,
  resolveLocalizedRescheduleScope,
  resolveLocalizedRescheduleCleanup,
} from "@/lib/scheduler/localRescheduleCleanup";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Supabase = SupabaseClient<Database>;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
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

  const payload = (await request.json().catch(() => null)) as
    | { startUtc?: string; skipConflictResolution?: boolean }
    | null;
  const startUtc = payload?.startUtc;
  if (!startUtc || typeof startUtc !== "string") {
    return NextResponse.json({ error: "Missing startUtc" }, { status: 400 });
  }
  const skipConflictResolution = payload?.skipConflictResolution === true;

  const parsedStart = new Date(startUtc);
  if (Number.isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }

  const { data: instance, error: fetchError } = await supabase
    .from("schedule_instances")
    .select("id, user_id, start_utc, end_utc, duration_min")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("Reschedule fetch error", fetchError);
    return NextResponse.json({ error: "Unable to load scheduled event" }, { status: 500 });
  }

  if (!instance || instance.user_id !== user.id) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const timeZone =
    (await resolveProfileTimeZone(supabase, user.id)) ??
    extractUserTimeZone(user) ??
    "UTC";

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
    .update({
      start_utc: nextStartIso,
      end_utc: nextEndIso,
      locked: true,
      ...(skipConflictResolution
        ? {}
        : {
            // Explicit reschedules are the only path that should shed the old
            // slot bindings before localized cleanup revalidates the move.
            window_id: null,
            day_type_time_block_id: null,
            time_block_id: null,
          }),
    })
    .eq("id", instance.id)
    .eq("user_id", user.id);

  if (updateError) {
    // Temporary debugging instrumentation for manual placement failures.
    console.error("Reschedule update error", {
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      code: updateError.code,
    });
    return NextResponse.json(
      {
        error: "Unable to update schedule",
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        code: updateError.code,
      },
      { status: 500 }
    );
  }

  if (!skipConflictResolution) {
    await resolveConflictsAfterUpdate(supabase, {
      userId: user.id,
      pivotId: instance.id,
      pivotStart: nextStartIso,
      pivotEnd: nextEndIso,
      timeZone,
    });
  }

  return NextResponse.json({ success: true, startUtc: nextStartIso });
}

async function resolveProfileTimeZone(
  client: Supabase,
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
    const timezone =
      typeof data?.timezone === "string" ? data.timezone.trim() : "";
    return timezone || null;
  } catch {
    return null;
  }
}

function extractUserTimeZone(user: {
  user_metadata?: {
    timezone?: unknown;
    timeZone?: unknown;
    tz?: unknown;
  } | null;
}) {
  const metadata = user.user_metadata;
  const candidates = [metadata?.timezone, metadata?.timeZone, metadata?.tz];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function resolveConflictsAfterUpdate(
  supabase: Supabase,
  params: {
    userId: string;
    pivotId: string;
    pivotStart: string;
    pivotEnd: string;
    timeZone: string;
  }
) {
  const { userId, pivotId, pivotStart, pivotEnd, timeZone } = params;
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
    const targetEndMs = targetStartMs + durationMs;

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

  await cleanupLocalizedRescheduleScope(supabase, {
    userId,
    pivotId,
    pivotStart,
    pivotEnd,
    timeZone,
  });
}

async function cleanupLocalizedRescheduleScope(
  supabase: Supabase,
  params: {
    userId: string;
    pivotId: string;
    pivotStart: string;
    pivotEnd: string;
    timeZone: string;
  }
) {
  const scope = resolveLocalizedRescheduleScope({
    pivotStart: params.pivotStart,
    pivotEnd: params.pivotEnd,
    timeZone: params.timeZone,
  });
  if (!scope) {
    return;
  }
  const { scopeStart, scopeEnd } = scope;

  const { data: localRows, error: localError } = await fetchInstancesForRange(
    params.userId,
    scopeStart.toISOString(),
    scopeEnd.toISOString(),
    supabase,
    { suppressQueryLog: true }
  );

  if (localError) {
    console.error("Failed to load localized cleanup scope", localError);
    return;
  }

  const [habits, projectsMap, goals] = await Promise.all([
    fetchHabitsForSchedule(params.userId, supabase),
    fetchAllProjectsMap(supabase),
    fetchGoalsForUser(params.userId, supabase),
  ]);

  const projectIds = Object.keys(projectsMap);
  const projectSkillIds =
    projectIds.length > 0
      ? await fetchProjectSkillsForProjects(projectIds, supabase)
      : {};
  const goalMonumentIdById = new Map(
    goals.map((goal) => [goal.id, goal.monumentId ?? null])
  );

  const habitContextById = new Map<string, LocalRescheduleCleanupSourceContext>();
  for (const habit of habits) {
    habitContextById.set(habit.id, {
      habitType: habit.habitType,
      skillId: habit.skillId ?? null,
      monumentId: habit.skillMonumentId ?? null,
      skillMonumentId: habit.skillMonumentId ?? null,
    });
  }

  const projectContextById = new Map<string, LocalRescheduleCleanupSourceContext>();
  for (const [projectId, project] of Object.entries(projectsMap)) {
    projectContextById.set(projectId, {
      skillIds: projectSkillIds[projectId] ?? null,
      monumentId:
        (project.goal_id && goalMonumentIdById.get(project.goal_id)) ?? null,
    });
  }

  const taskIds = Array.from(
    new Set(
      (localRows ?? [])
        .filter(
          (row): row is ScheduleInstance =>
            Boolean(row) &&
            Boolean(row.id) &&
            row.status === "scheduled" &&
            row.source_type === "TASK" &&
            typeof row.source_id === "string" &&
            row.source_id.trim().length > 0
        )
        .map((row) => row.source_id as string)
    )
  );
  const taskContextById = new Map<string, LocalRescheduleCleanupSourceContext>();
  if (taskIds.length > 0) {
    const { data: taskRows, error: taskError } = await supabase
      .from("tasks")
      .select("id, skill_id, skills(monument_id)")
      .in("id", taskIds);
    if (taskError) {
      console.error("Failed to load task cleanup context", taskError);
    } else {
      for (const row of (taskRows ?? []) as Array<{
        id: string;
        skill_id?: string | null;
        skills?: { monument_id?: string | null } | null;
      }>) {
        taskContextById.set(row.id, {
          skillId: row.skill_id ?? null,
          skillMonumentId: row.skills?.monument_id ?? null,
        });
      }
    }
  }

  const dayWindows = new Map<string, Awaited<ReturnType<typeof fetchWindowsForDate>>>();
  for (let day = scopeStart; day.getTime() < scopeEnd.getTime(); day = addDaysInTimeZone(day, 1, params.timeZone)) {
    const key = formatDateKeyInTimeZone(day, params.timeZone);
    const windows = await fetchWindowsForDate(
      day,
      supabase,
      params.timeZone,
      { useDayTypes: true }
    );
    dayWindows.set(key, windows);
  }

  const cleanup = resolveLocalizedRescheduleCleanup({
    instances: ((localRows ?? []) as ScheduleInstance[]).filter(
      (row): row is ScheduleInstance =>
        Boolean(row) &&
        Boolean(row.id) &&
        row.status === "scheduled"
    ),
    windowsByDayKey: dayWindows,
    timeZone: params.timeZone,
    protectedInstanceId: params.pivotId,
    resolveSourceContext(instance) {
      const sourceId = instance.source_id ?? "";
      if (!sourceId) return null;
      if (instance.source_type === "HABIT") {
        return habitContextById.get(sourceId) ?? null;
      }
      if (instance.source_type === "PROJECT") {
        return projectContextById.get(sourceId) ?? null;
      }
      if (instance.source_type === "TASK") {
        return taskContextById.get(sourceId) ?? null;
      }
      return null;
    },
  });

  if (cleanup.loserIds.length === 0) return;

  for (const loserId of cleanup.loserIds) {
    const { error } = await supabase
      .from("schedule_instances")
      .update({
        status: "canceled",
        canceled_reason: LOCAL_RESCHEDULE_CANCEL_REASON,
      })
      .eq("id", loserId)
      .eq("user_id", params.userId);
    if (error) {
      console.error("Failed to cancel stale localized schedule instance", {
        loserId,
        error,
      });
    }
  }
}
