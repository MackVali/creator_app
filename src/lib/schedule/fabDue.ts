import {
  evaluateHabitDueOnDate,
  normalizeRecurrence,
} from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import {
  addDaysInTimeZone,
  makeZonedDate,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";

export type FabDueProjectInput = {
  completed_at?: string | null;
  due_date?: string | null;
  goal_id?: string | null;
};

export type FabDueHabitInput = {
  id: string;
  name?: string | null;
  memo_capture_config?: HabitScheduleItem["memoCaptureConfig"];
  duration_minutes?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_completed_at?: string | null;
  current_streak_days?: number | null;
  longest_streak_days?: number | null;
  habit_type?: string | null;
  window_id?: string | null;
  energy?: string | null;
  recurrence?: string | null;
  recurrence_days?: number[] | null;
  recurrence_mode?: string | null;
  anchor_type?: string | null;
  anchor_value?: string | null;
  anchor_start_date?: string | null;
  skill_id?: string | null;
  goal_id?: string | null;
  completion_target?: number | null;
  location_context_id?: string | null;
  daylight_preference?: string | null;
  window_edge_preference?: string | null;
  next_due_override?: string | null;
  fixed_start_local?: string | null;
  fixed_end_local?: string | null;
  fixed_timezone?: string | null;
  window?: {
    id?: string | null;
    label?: string | null;
    energy?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    days?: number[] | null;
    location_context_id?: string | null;
  } | null;
};

export function parseDueDayStart(
  value: string | null | undefined,
  timeZone: string
): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const zone = normalizeTimeZone(timeZone);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return startOfDayInTimeZone(
      makeZonedDate(
        {
          year: Number(year),
          month: Number(month),
          day: Number(day),
          hour: 12,
          minute: 0,
        },
        zone
      ),
      zone
    );
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDayInTimeZone(parsed, zone);
}

export function resolveProjectNextDueAt(params: {
  project: FabDueProjectInput;
  goalDueDatesById: Map<string, string | null>;
  now: Date;
  timeZone: string;
}): string | null {
  const { project, goalDueDatesById, now, timeZone } = params;
  if (project.completed_at) return null;
  const todayStart = startOfDayInTimeZone(now, normalizeTimeZone(timeZone));
  const dueCandidates: Date[] = [];
  const projectDueStart = parseDueDayStart(project.due_date, timeZone);
  if (projectDueStart && projectDueStart.getTime() <= todayStart.getTime()) {
    dueCandidates.push(projectDueStart);
  }
  const goalDueStart = project.goal_id
    ? parseDueDayStart(goalDueDatesById.get(project.goal_id), timeZone)
    : null;
  if (goalDueStart && goalDueStart.getTime() <= todayStart.getTime()) {
    dueCandidates.push(goalDueStart);
  }
  if (dueCandidates.length === 0) return null;
  dueCandidates.sort((a, b) => a.getTime() - b.getTime());
  return dueCandidates[0].toISOString();
}

export function toFabHabitScheduleItem(
  habit: FabDueHabitInput
): HabitScheduleItem {
  const window = habit.window;
  return {
    id: habit.id,
    name: habit.name?.trim() || "Untitled habit",
    memoCaptureConfig: habit.memo_capture_config ?? null,
    durationMinutes: habit.duration_minutes ?? null,
    createdAt: habit.created_at ?? null,
    updatedAt: habit.updated_at ?? null,
    lastCompletedAt: habit.last_completed_at ?? null,
    currentStreakDays: habit.current_streak_days ?? 0,
    longestStreakDays: habit.longest_streak_days ?? 0,
    habitType: habit.habit_type ?? "HABIT",
    windowId: habit.window_id ?? null,
    energy: habit.energy ?? null,
    recurrence: habit.recurrence ?? null,
    recurrenceDays: habit.recurrence_days ?? null,
    recurrenceMode: habit.recurrence_mode ?? null,
    anchorType: habit.anchor_type ?? null,
    anchorValue: habit.anchor_value ?? null,
    anchorStartDate: habit.anchor_start_date ?? null,
    skillId: habit.skill_id ?? null,
    goalId: habit.goal_id ?? null,
    completionTarget: habit.completion_target ?? null,
    locationContextId: habit.location_context_id ?? null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: habit.daylight_preference ?? null,
    windowEdgePreference: habit.window_edge_preference ?? null,
    nextDueOverride: habit.next_due_override ?? null,
    fixedStartLocal: habit.fixed_start_local ?? null,
    fixedEndLocal: habit.fixed_end_local ?? null,
    fixedTimezone: habit.fixed_timezone ?? null,
    window: window
      ? {
          id: window.id ?? habit.window_id ?? "",
          label: window.label ?? null,
          energy: window.energy ?? null,
          startLocal: window.start_local ?? "00:00",
          endLocal: window.end_local ?? "00:00",
          days: window.days ?? null,
          locationContextId: window.location_context_id ?? null,
          locationContextValue: null,
          locationContextName: null,
        }
      : null,
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getDailyOverdueFallbackStart(
  habit: FabDueHabitInput,
  now: Date,
  timeZone: string
): Date | null {
  const recurrence = normalizeRecurrence(habit.recurrence);
  if (
    recurrence !== "" &&
    recurrence !== "daily" &&
    recurrence !== "everyday" &&
    recurrence !== "none"
  ) {
    return null;
  }

  const lastCompletedAt = parseOptionalDate(habit.last_completed_at);
  if (lastCompletedAt) {
    return addDaysInTimeZone(
      startOfDayInTimeZone(lastCompletedAt, timeZone),
      1,
      timeZone
    );
  }

  const nextDueOverride = parseOptionalDate(habit.next_due_override);
  if (nextDueOverride && nextDueOverride.getTime() <= now.getTime()) {
    return startOfDayInTimeZone(nextDueOverride, timeZone);
  }

  const anchorStartDate = parseOptionalDate(habit.anchor_start_date);
  if (anchorStartDate) return startOfDayInTimeZone(anchorStartDate, timeZone);

  const createdAt = parseOptionalDate(habit.created_at);
  if (createdAt) return startOfDayInTimeZone(createdAt, timeZone);

  const updatedAt = parseOptionalDate(habit.updated_at);
  if (updatedAt) return startOfDayInTimeZone(updatedAt, timeZone);

  return null;
}

export function resolveHabitNextDueAt(params: {
  habit: FabDueHabitInput;
  now: Date;
  timeZone: string;
  lastScheduledStart?: Date | null;
}): string | null {
  const scheduleHabit = toFabHabitScheduleItem(params.habit);
  const zone = normalizeTimeZone(params.timeZone);
  const override = params.habit.next_due_override
    ? new Date(params.habit.next_due_override)
    : null;
  const evaluation = evaluateHabitDueOnDate({
    habit: scheduleHabit,
    date: params.now,
    timeZone: zone,
    windowDays: params.habit.window?.days ?? null,
    lastScheduledStart: params.lastScheduledStart ?? null,
    nextDueOverride:
      override && Number.isFinite(override.getTime()) ? override : null,
  });
  if (!evaluation.isDue) return null;
  const todayStart = startOfDayInTimeZone(params.now, zone);
  const dueStart = evaluation.dueStart
    ? startOfDayInTimeZone(evaluation.dueStart, zone)
    : null;
  const shouldUseOverdueFallback =
    dueStart?.getTime() === todayStart.getTime() &&
    (evaluation.debugTag === "DUE_DAILY" ||
      evaluation.debugTag === "DUE_NO_ANCHOR");
  const effectiveDueStart = shouldUseOverdueFallback
    ? getDailyOverdueFallbackStart(params.habit, params.now, zone) ?? dueStart
    : dueStart;
  return effectiveDueStart ? effectiveDueStart.toISOString() : null;
}
