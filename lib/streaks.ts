import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { resolveEveryXDaysInterval } from "@/lib/recurrence";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const DAILY_RECURRENCES = new Set(["daily", "none", "everyday", ""]);

type HabitCompletionRow = {
  completion_day: string | null;
  completed_at: string | null;
};

export type HabitStreakMetrics = {
  current: number;
  longest: number;
  lastCompletedAt: string | null;
};

function normalizeRecurrence(value: string | null | undefined) {
  if (!value) return "daily";
  return value.toLowerCase().trim();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function fallbackDateFromDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  return parseDate(`${value}T00:00:00Z`);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(base: Date, months: number) {
  const next = new Date(base);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function parseEveryDays(value: string) {
  const match = /^every\s+(\d+)\s+days?/i.exec(value);
  if (!match) return null;
  const raw = Number(match[1]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function resolveDayInterval(
  recurrence: string,
  recurrenceDays?: number[] | null
): number | null {
  if (recurrence === "every x days") {
    return resolveEveryXDaysInterval(recurrence, recurrenceDays);
  }
  return parseEveryDays(recurrence);
}

function nextDeadline(
  previous: Date,
  recurrence: string,
  recurrenceDays?: number[] | null
) {
  if (DAILY_RECURRENCES.has(recurrence)) {
    return addDays(previous, 1);
  }
  switch (recurrence) {
    case "weekly":
      return addDays(previous, 7);
    case "bi-weekly":
      return addDays(previous, 14);
    case "monthly":
      return addMonths(previous, 1);
    case "bi-monthly":
      return addMonths(previous, 2);
    case "every 6 months":
      return addMonths(previous, 6);
    case "yearly":
      return addMonths(previous, 12);
    default: {
      const everyDays = resolveDayInterval(recurrence, recurrenceDays);
      if (typeof everyDays === "number") {
        return addDays(previous, everyDays);
      }
      return addDays(previous, 1);
    }
  }
}

function isWithinWindow(
  prev: Date,
  next: Date,
  recurrence: string,
  recurrenceDays?: number[] | null
) {
  const deadline = nextDeadline(prev, recurrence, recurrenceDays);
  return next.getTime() <= deadline.getTime() + TWELVE_HOURS_MS;
}

function toCompletionDate(row: HabitCompletionRow): Date | null {
  return parseDate(row.completed_at) ?? fallbackDateFromDay(row.completion_day);
}

export function computeHabitStreakMetrics(
  rows: HabitCompletionRow[],
  recurrenceRaw: string | null | undefined,
  recurrenceDays?: number[] | null
): HabitStreakMetrics {
  const recurrence = normalizeRecurrence(recurrenceRaw);
  const timestamps = rows
    .map((row) => toCompletionDate(row))
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  if (timestamps.length === 0) {
    return {
      current: 0,
      longest: 0,
      lastCompletedAt: null,
    };
  }

  let current = 0;
  let longest = 0;
  let previous: Date | null = null;

  for (const timestamp of timestamps) {
    if (!previous) {
      current = 1;
    } else if (isWithinWindow(previous, timestamp, recurrence, recurrenceDays)) {
      current += 1;
    } else {
      current = 1;
    }
    if (current > longest) {
      longest = current;
    }
    previous = timestamp;
  }

  const lastTimestamp = timestamps[timestamps.length - 1];

  return {
    current,
    longest,
    lastCompletedAt: lastTimestamp.toISOString(),
  };
}

export async function refreshHabitStreak(
  supabase: SupabaseClient<Database> | null,
  habitId: string,
  userId: string
) {
  if (!supabase) return;

  const [{ data: habit, error: habitError }, { data: completions, error: completionError }] =
    await Promise.all([
      supabase
        .from("habits")
        .select("id, recurrence, recurrence_days")
        .eq("id", habitId)
        .eq("user_id", userId)
        .single(),
      supabase
        .from("habit_completion_days")
        .select("completion_day, completed_at")
        .eq("habit_id", habitId)
        .eq("user_id", userId)
        .order("completed_at", { ascending: true, nullsFirst: true }),
    ]);

  if (habitError) {
    throw habitError;
  }
  if (completionError) {
    throw completionError;
  }
  if (!habit) {
    return;
  }

  const metrics = computeHabitStreakMetrics(
    (completions ?? []) as HabitCompletionRow[],
    habit.recurrence ?? null,
    habit.recurrence_days ?? null
  );

  await supabase
    .from("habits")
    .update({
      last_completed_at: metrics.lastCompletedAt,
      current_streak_days: metrics.current,
      longest_streak_days: metrics.longest,
    })
    .eq("id", habitId)
    .eq("user_id", userId);
}
