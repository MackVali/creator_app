import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import {
  addDaysInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";

type SearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
};

type HabitSearchRecord = {
  id: string;
  name?: string | null;
  habit_type?: string | null;
  recurrence?: string | null;
  recurrence_days?: number[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_completed_at?: string | null;
  next_due_override?: string | null;
  window_id?: string | null;
  window?: {
    id?: string | null;
    label?: string | null;
    energy?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    days?: number[] | null;
  } | null;
};

type ProjectSearchRecord = {
  id: string;
  name?: string | null;
  completed_at?: string | null;
};

type ScheduleSummary = {
  nextScheduledId: string | null;
  nextScheduledStart: string | null;
  nextScheduledDuration: number | null;
  latestCompletedAt: string | null;
};

const MAX_HABIT_DUE_LOOKAHEAD_DAYS = 730;

function normalizeQuery(value: string | null): string {
  if (!value) return "";
  return value.trim();
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));
  const likeQuery = query ? `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : null;

  const timeZone = await resolveUserTimezone(supabase, user.id);
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const baseProjectQuery = supabase
    .from("projects")
    .select("id,name,completed_at")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(25);

  const baseHabitQuery = supabase
    .from("habits")
    .select(
      "id,name,habit_type,recurrence,recurrence_days,created_at,updated_at,last_completed_at,next_due_override,window_id,window:windows(id,label,start_local,end_local,days)"
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(25);

  const [projectsResponse, habitsResponse] = await Promise.all([
    likeQuery ? baseProjectQuery.ilike("name", likeQuery) : baseProjectQuery,
    likeQuery ? baseHabitQuery.ilike("name", likeQuery) : baseHabitQuery,
  ]);

  if (projectsResponse.error) {
    console.error("FAB search projects error", projectsResponse.error);
    return NextResponse.json({ error: "Unable to load projects" }, { status: 500 });
  }

  if (habitsResponse.error) {
    console.error("FAB search habits error", habitsResponse.error);
    return NextResponse.json({ error: "Unable to load habits" }, { status: 500 });
  }

  const projectIds = (projectsResponse.data ?? [])
    .map(project => project?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const habitIds = (habitsResponse.data ?? [])
    .map(habit => habit?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const lookup = new Map<string, ScheduleSummary>();

  if (projectIds.length + habitIds.length > 0) {
    const sourceIds = [...projectIds, ...habitIds];
    const nowMs = Date.now();
    const { data: scheduleRows, error: scheduleError } = await supabase
      .from("schedule_instances")
      .select("id, source_id, source_type, start_utc, duration_min, status, completed_at")
      .eq("user_id", user.id)
      .in("source_id", sourceIds)
      .in("source_type", ["PROJECT", "HABIT"])
      .in("status", ["scheduled", "completed"])
      .order("start_utc", { ascending: true });

    if (scheduleError) {
      console.error("FAB search schedule lookup failed", scheduleError);
    } else {
      for (const row of scheduleRows ?? []) {
        if (!row?.source_id) continue;
        const key = `${row.source_type}:${row.source_id}`;
        const summary =
          lookup.get(key) ?? {
            nextScheduledId: null,
            nextScheduledStart: null,
            nextScheduledDuration: null,
            latestCompletedAt: null,
          };
        if (row.status === "scheduled") {
          const startUtc = typeof row.start_utc === "string" ? row.start_utc : null;
          const startMs = startUtc ? Date.parse(startUtc) : Number.NaN;
          if (
            startUtc &&
            Number.isFinite(startMs) &&
            startMs >= nowMs &&
            (!summary.nextScheduledStart ||
              startMs < Date.parse(summary.nextScheduledStart))
          ) {
            summary.nextScheduledId = row.id ?? null;
            summary.nextScheduledStart = startUtc;
            summary.nextScheduledDuration =
              typeof row.duration_min === "number" && Number.isFinite(row.duration_min)
                ? row.duration_min
                : null;
          }
        } else if (row.status === "completed") {
          const completedIso =
            typeof row.completed_at === "string" && row.completed_at.length > 0
              ? row.completed_at
              : typeof row.start_utc === "string"
                ? row.start_utc
                : null;
          const completedMs = completedIso ? Date.parse(completedIso) : Number.NaN;
          if (
            completedIso &&
            Number.isFinite(completedMs) &&
            (!summary.latestCompletedAt ||
              completedMs > Date.parse(summary.latestCompletedAt))
          ) {
            summary.latestCompletedAt = completedIso;
          }
        }
        lookup.set(key, summary);
      }
    }
  }

  const results: SearchResult[] = [];

  for (const project of projectsResponse.data ?? []) {
    if (!project?.id) continue;
    const projectRecord = project as ProjectSearchRecord;
    const key = `PROJECT:${project.id}`;
    const summary = lookup.get(key);
    const projectCompletedAt =
      typeof projectRecord.completed_at === "string" && projectRecord.completed_at.length > 0
        ? projectRecord.completed_at
        : null;
    const completedAt = projectCompletedAt ?? summary?.latestCompletedAt ?? null;
    results.push({
      id: project.id,
      name: project.name?.trim() || "Untitled project",
      type: "PROJECT",
      nextScheduledAt: summary?.nextScheduledStart ?? null,
      scheduleInstanceId: summary?.nextScheduledId ?? null,
      durationMinutes: summary?.nextScheduledDuration ?? null,
      nextDueAt: null,
      completedAt,
      isCompleted: typeof completedAt === "string",
    });
  }

  for (const habit of habitsResponse.data ?? []) {
    if (!habit?.id) continue;
    const key = `HABIT:${habit.id}`;
    const summary = lookup.get(key);
    const habitRecord = habit as HabitSearchRecord;
    const nextDueAt = computeHabitNextDue(habitRecord, normalizedTimeZone);
    results.push({
      id: habit.id,
      name: habit.name?.trim() || "Untitled habit",
      type: "HABIT",
      nextScheduledAt: summary?.nextScheduledStart ?? null,
      scheduleInstanceId: summary?.nextScheduledId ?? null,
      durationMinutes: summary?.nextScheduledDuration ?? null,
      nextDueAt,
      completedAt: null,
      isCompleted: false,
    });
  }

  const getSortValue = (result: SearchResult) => {
    if (result.isCompleted) {
      return Number.POSITIVE_INFINITY;
    }
    const candidate =
      result.nextScheduledAt ?? (result.type === "HABIT" ? result.nextDueAt : null);
    if (!candidate) return Number.POSITIVE_INFINITY;
    const parsed = Date.parse(candidate);
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };

  results.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    const timeA = getSortValue(a);
    const timeB = getSortValue(b);
    if (timeA === timeB) return a.name.localeCompare(b.name);
    return timeA - timeB;
  });

  return NextResponse.json({ results });
}

async function resolveUserTimezone(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  userId: string
) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.warn("Failed to resolve profile timezone for FAB search", error);
    }
    const value = typeof data?.timezone === "string" ? data.timezone.trim() : "";
    return value || "UTC";
  } catch (error) {
    console.warn("Failed to resolve profile timezone for FAB search", error);
    return "UTC";
  }
}

function buildHabitScheduleItem(record: HabitSearchRecord): HabitScheduleItem {
  return {
    id: record.id,
    name: record.name ?? "Habit",
    durationMinutes: null,
    createdAt: record.created_at ?? null,
    updatedAt: record.updated_at ?? null,
    lastCompletedAt: record.last_completed_at ?? null,
    currentStreakDays: 0,
    longestStreakDays: 0,
    habitType: record.habit_type ?? "HABIT",
    windowId: record.window_id ?? null,
    energy: null,
    recurrence: record.recurrence ?? null,
    recurrenceDays: record.recurrence_days ?? null,
    skillId: null,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    nextDueOverride: record.next_due_override ?? null,
    window: record.window
      ? {
          id: record.window.id ?? record.window_id ?? record.id,
          label: record.window.label ?? null,
          energy: record.window.energy ?? null,
          startLocal: record.window.start_local ?? "00:00",
          endLocal: record.window.end_local ?? "00:00",
          days: record.window.days ?? null,
          locationContextId: null,
          locationContextValue: null,
          locationContextName: null,
        }
      : null,
  };
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function computeHabitNextDue(record: HabitSearchRecord, timeZone: string): string | null {
  try {
    const habit = buildHabitScheduleItem(record);
    const zone = timeZone || "UTC";
    const today = startOfDayInTimeZone(new Date(), zone);
    const windowDays = record.window?.days ?? null;
    const nextDueOverride = parseIsoDate(record.next_due_override);
    for (let offset = 0; offset <= MAX_HABIT_DUE_LOOKAHEAD_DAYS; offset += 1) {
      const day = offset === 0 ? today : addDaysInTimeZone(today, offset, zone);
      const dueInfo = evaluateHabitDueOnDate({
        habit,
        date: day,
        timeZone: zone,
        windowDays,
        lastScheduledStart: undefined,
        nextDueOverride,
      });
      if (dueInfo.isDue) {
        const dueDate = dueInfo.dueStart ?? day;
        return dueDate.toISOString();
      }
    }
    return nextDueOverride ? nextDueOverride.toISOString() : null;
  } catch (error) {
    console.error("Failed to compute next due date for habit search result", error);
    return record.next_due_override ?? null;
  }
}
