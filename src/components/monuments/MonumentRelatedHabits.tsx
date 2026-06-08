"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";
import clsx from "clsx";
import { Grid2x2, Grid3x3 } from "lucide-react";

import FlameEmber from "@/components/FlameEmber";
import { Skeleton } from "@/components/ui/skeleton";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import { useToastHelpers } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "@/lib/scheduler/limits";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";

interface MonumentRelatedHabitsProps {
  monumentId: string;
}

interface RelatedSkillSummary {
  id: string;
  name: string;
  icon: string | null;
}

interface HabitSummary {
  id: string;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastCompletedAt: string | null;
  currentStreakDays: number | null;
  recurrence: string | null;
  recurrenceDays: number[] | null;
  recurrenceMode: string | null;
  anchorType: string | null;
  anchorValue: string | null;
  anchorStartDate: string | null;
  nextDueOverride: string | null;
  habitType: string | null;
  skillId: string | null;
  skillIcon: string | null;
}

type HabitDueStatus = {
  label: string;
  rank: number;
};
type RelatedHabitCardDensity = "large" | "small";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const NO_DUE_MATCH_RANK = MAX_LOOKAHEAD_DAYS + 1;
const RELATED_HABIT_DOUBLE_TAP_MS = 350;
const RELATED_HABIT_LONG_PRESS_MS = 300;
const RELATED_HABIT_LONG_PRESS_SUPPRESS_MS = 1_000;
const RELATED_HABIT_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const RELATED_HABIT_SMALL_GRID_CLASS =
  "-mx-2 grid grid-cols-4 gap-1.5 px-2 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";

function normalizeRecurrenceDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      value
        .map((day) => {
          if (typeof day === "number") return day;
          const parsed = Number(day);
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((day): day is number => day !== null)
        .map((day) => {
          const remainder = day % 7;
          return remainder < 0 ? remainder + 7 : remainder;
        })
    )
  );

  return normalized.length > 0 ? normalized : null;
}

function normalizeRelatedHabitType(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || "HABIT";
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

function normalizeRelatedHabitStreakDays(value: unknown): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;

  return Number.isFinite(numericValue)
    ? Math.max(0, Math.round(numericValue))
    : 0;
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRecurrenceCode(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isDailyRelatedHabitRecurrence(habit: HabitSummary): boolean {
  const recurrence = getRecurrenceCode(habit.recurrence);
  return (
    recurrence === "" ||
    recurrence === "daily" ||
    recurrence === "none" ||
    recurrence === "everyday"
  );
}

function getRelatedHabitOverdueFallbackStart(
  habit: HabitSummary,
  date: Date,
  timeZone: string
): Date | null {
  if (!isDailyRelatedHabitRecurrence(habit)) return null;

  const lastCompletedAt = parseOptionalDate(habit.lastCompletedAt);
  if (lastCompletedAt) {
    return addDaysInTimeZone(
      startOfDayInTimeZone(lastCompletedAt, timeZone),
      1,
      timeZone
    );
  }

  const nextDueOverride = parseOptionalDate(habit.nextDueOverride);
  if (nextDueOverride && nextDueOverride.getTime() <= date.getTime()) {
    return startOfDayInTimeZone(nextDueOverride, timeZone);
  }

  const anchorStartDate = parseOptionalDate(habit.anchorStartDate);
  if (anchorStartDate) return startOfDayInTimeZone(anchorStartDate, timeZone);

  const createdAt = parseOptionalDate(habit.createdAt);
  if (createdAt) return startOfDayInTimeZone(createdAt, timeZone);

  const updatedAt = parseOptionalDate(habit.updatedAt);
  if (updatedAt) return startOfDayInTimeZone(updatedAt, timeZone);

  return null;
}

function buildScheduleHabit(habit: HabitSummary): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    durationMinutes: null,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    lastCompletedAt: habit.lastCompletedAt,
    currentStreakDays: habit.currentStreakDays ?? 0,
    longestStreakDays: 0,
    habitType: normalizeRelatedHabitType(habit.habitType),
    windowId: null,
    energy: null,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrenceDays,
    recurrenceMode: habit.recurrenceMode,
    anchorType: habit.anchorType,
    anchorValue: habit.anchorValue,
    anchorStartDate: habit.anchorStartDate,
    skillId: habit.skillId,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    nextDueOverride: habit.nextDueOverride,
    window: null,
  } satisfies HabitScheduleItem;
}

function getRelatedHabitOverdueStart({
  habit,
  evaluation,
  date,
  timeZone,
}: {
  habit: HabitSummary;
  evaluation: ReturnType<typeof evaluateHabitDueOnDate>;
  date: Date;
  timeZone: string;
}): Date | null {
  if (!evaluation.isDue) return null;

  const dueStart = evaluation.dueStart ?? null;
  const dayStart = startOfDayInTimeZone(date, timeZone);
  const dueStartDay = dueStart
    ? startOfDayInTimeZone(dueStart, timeZone)
    : null;
  const shouldUseFallback =
    dueStartDay?.getTime() === dayStart.getTime() &&
    (evaluation.debugTag === "DUE_DAILY" ||
      evaluation.debugTag === "DUE_NO_ANCHOR");

  if (!shouldUseFallback) return dueStart;

  return getRelatedHabitOverdueFallbackStart(habit, date, timeZone) ?? dueStart;
}

function computeHabitDueStatus(
  habit: HabitSummary,
  timeZone: string
): HabitDueStatus {
  const normalizedZone = normalizeTimeZone(timeZone);
  const scheduleHabit = buildScheduleHabit(habit);
  const today = new Date();
  const nextDueOverride = parseOptionalDate(habit.nextDueOverride);

  const todayEvaluation = evaluateHabitDueOnDate({
    habit: scheduleHabit,
    date: today,
    timeZone: normalizedZone,
    nextDueOverride,
  });

  if (todayEvaluation.isDue) {
    const overdueStart = getRelatedHabitOverdueStart({
      habit,
      evaluation: todayEvaluation,
      date: today,
      timeZone: normalizedZone,
    });
    const overdueStartMs = overdueStart?.getTime();
    const isOverdue =
      typeof overdueStartMs === "number" &&
      Number.isFinite(overdueStartMs) &&
      today.getTime() - overdueStartMs >= MS_PER_DAY;

    return { label: isOverdue ? "OVERDUE" : "DUE", rank: 0 };
  }

  for (let dayOffset = 1; dayOffset <= MAX_LOOKAHEAD_DAYS; dayOffset += 1) {
    const futureDate = new Date(today.getTime() + dayOffset * MS_PER_DAY);
    const evaluation = evaluateHabitDueOnDate({
      habit: scheduleHabit,
      date: futureDate,
      timeZone: normalizedZone,
      nextDueOverride,
    });

    if (evaluation.isDue) {
      return {
        label: `${dayOffset} ${dayOffset === 1 ? "DAY" : "DAYS"}`,
        rank: dayOffset,
      };
    }
  }

  return { label: "No Due Match", rank: NO_DUE_MATCH_RANK };
}

function getHabitTypePriority(habitType: string | null | undefined): number {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return 0;
  if (normalized === "SYNC") return 2;
  if (
    normalized === "HABIT" ||
    normalized === "PRACTICE" ||
    normalized === "RELAXER" ||
    normalized === "MEMO"
  ) {
    return 1;
  }
  return 3;
}

function getHabitCardTypeClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") {
    return "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]";
  }
  if (normalized === "SYNC") {
    return "!bg-[radial-gradient(circle_at_12%_-20%,rgba(113,113,122,0.22),transparent_58%),linear-gradient(135deg,rgba(16,18,22,0.98)_0%,rgba(39,43,51,0.94)_48%,rgba(70,77,89,0.68)_100%)]";
  }
  if (normalized === "PRACTICE") {
    return "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
  }
  if (normalized === "RELAXER") {
    return "!bg-[radial-gradient(circle_at_8%_-18%,rgba(6,95,70,0.34),transparent_60%),linear-gradient(138deg,rgba(3,24,18,0.98)_0%,rgba(5,68,51,0.94)_48%,rgba(6,95,70,0.74)_100%)]";
  }
  if (normalized === "MEMO") {
    return "!bg-[radial-gradient(circle_at_8%_-18%,rgba(126,34,206,0.26),transparent_60%),linear-gradient(138deg,rgba(24,13,38,0.98)_0%,rgba(55,29,84,0.95)_48%,rgba(88,46,128,0.72)_100%)]";
  }
  return "!bg-[radial-gradient(circle_at_0%_0%,rgba(82,82,91,0.2),transparent_58%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(20,20,23,0.96)_48%,rgba(50,50,57,0.72)_100%)]";
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC") return "border-zinc-300/35";
  if (normalized === "PRACTICE") return "border-slate-500/50";
  if (normalized === "RELAXER") return "border-emerald-200/60";
  if (normalized === "MEMO") return "border-purple-300/55";
  return "border-black/70";
}

function getRelatedHabitFabOriginRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: styles.borderRadius,
    backgroundColor: styles.backgroundColor,
    backgroundImage: styles.backgroundImage,
    boxShadow: styles.boxShadow,
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatHabitRecord(
  habit: unknown,
  skillIconById: Map<string, string | null>
): HabitSummary | null {
  if (!habit || typeof habit !== "object") return null;
  const habitRecord = habit as Record<string, unknown>;
  const habitId = readString(habitRecord.id);
  if (!habitId) return null;

  const skillId = readString(habitRecord.skill_id);
  const habitName = readString(habitRecord.name) ?? "Untitled habit";
  const anchorValue =
    readString(habitRecord.anchor_value) ??
    (typeof habitRecord.anchor_value === "number" &&
    Number.isFinite(habitRecord.anchor_value)
      ? String(habitRecord.anchor_value)
      : null);

  return {
    id: habitId,
    name: habitName,
    createdAt: readString(habitRecord.created_at),
    updatedAt: readString(habitRecord.updated_at),
    lastCompletedAt: readString(habitRecord.last_completed_at),
    currentStreakDays: normalizeRelatedHabitStreakDays(
      habitRecord.current_streak_days
    ),
    recurrence: readString(habitRecord.recurrence),
    recurrenceDays: normalizeRecurrenceDays(habitRecord.recurrence_days),
    recurrenceMode: readString(habitRecord.recurrence_mode),
    anchorType: readString(habitRecord.anchor_type),
    anchorValue,
    anchorStartDate: readString(habitRecord.anchor_start_date),
    nextDueOverride: readString(habitRecord.next_due_override),
    habitType: readString(habitRecord.habit_type),
    skillId,
    skillIcon: skillId ? skillIconById.get(skillId) ?? null : null,
  } satisfies HabitSummary;
}

function formatSkillRecord(skill: unknown): RelatedSkillSummary | null {
  if (!skill || typeof skill !== "object") return null;
  const skillRecord = skill as Record<string, unknown>;
  const skillId = readString(skillRecord.id);
  const skillName = readString(skillRecord.name);
  if (!skillId) return null;

  return {
    id: skillId,
    name: skillName ?? "Untitled skill",
    icon: readString(skillRecord.icon),
  };
}

export function MonumentRelatedHabits({
  monumentId,
}: MonumentRelatedHabitsProps) {
  const supabase = getSupabaseBrowser();
  const toast = useToastHelpers();
  const fabCreation = useFabCreation();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [relatedHabits, setRelatedHabits] = useState<HabitSummary[]>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [relatedHabitCardDensity, setRelatedHabitCardDensity] =
    useState<RelatedHabitCardDensity>("large");
  const [completedRelatedHabitIds, setCompletedRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingRelatedHabitIds, setPendingRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const timeZone = useMemo(() => {
    try {
      return normalizeTimeZone(
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
      );
    } catch (err) {
      console.error("Failed to determine user timezone", err);
      return "UTC";
    }
  }, []);
  const [currentDateKey, setCurrentDateKey] = useState(() =>
    formatDateKeyInTimeZone(new Date(), timeZone)
  );
  const relatedHabitIdsKey = useMemo(
    () => relatedHabits.map((habit) => habit.id).join(","),
    [relatedHabits]
  );
  const lastRelatedHabitTapRef = useRef<{
    habitId: string;
    timestamp: number;
  } | null>(null);
  const [pressedRelatedHabitId, setPressedRelatedHabitId] = useState<
    string | null
  >(null);
  const relatedHabitLongPressTimerRef = useRef<number | null>(null);
  const relatedHabitSuppressCompletionUntilRef = useRef(0);
  const previousRelatedHabitStateRef = useRef(
    new Map<
      string,
      {
        lastCompletedAt: string | null;
        nextDueOverride: string | null;
      }
    >()
  );
  const relatedHabitGridClass =
    relatedHabitCardDensity === "small"
      ? RELATED_HABIT_SMALL_GRID_CLASS
      : RELATED_HABIT_GRID_CLASS;
  const isSmallRelatedHabitDensity = relatedHabitCardDensity === "small";
  const handleRelatedHabitDensityToggle = useCallback(() => {
    setRelatedHabitCardDensity((currentDensity) =>
      currentDensity === "large" ? "small" : "large"
    );
  }, []);
  const pendingRelatedHabitActionsRef = useRef(
    new Map<string, { action: "complete" | "undo"; dateKey: string }>()
  );
  const completionStateDateKeyRef = useRef<string | null>(null);
  const decoratedHabits = useMemo(
    () =>
      relatedHabits
        .map((habit) => {
          const dueStatus = computeHabitDueStatus(habit, timeZone);
          return {
            ...habit,
            normalizedHabitType: normalizeRelatedHabitType(habit.habitType),
            dueLabel: dueStatus.label,
            dueRank: dueStatus.rank,
          };
        })
        .sort((first, second) => {
          if (first.dueRank !== second.dueRank) {
            return first.dueRank - second.dueRank;
          }

          const typeRank =
            getHabitTypePriority(first.habitType) -
            getHabitTypePriority(second.habitType);
          if (typeRank !== 0) {
            return typeRank;
          }

          return first.name.localeCompare(second.name, undefined, {
            sensitivity: "base",
          });
        }),
    [relatedHabits, timeZone]
  );

  useEffect(() => {
    const syncCurrentDateKey = () => {
      const nextDateKey = formatDateKeyInTimeZone(new Date(), timeZone);
      setCurrentDateKey((previousDateKey) =>
        previousDateKey === nextDateKey ? previousDateKey : nextDateKey
      );
    };

    syncCurrentDateKey();
    const intervalId = window.setInterval(syncCurrentDateKey, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [timeZone]);

  useEffect(() => {
    let cancelled = false;
    const habitIds = relatedHabitIdsKey
      .split(",")
      .map((habitId) => habitId.trim())
      .filter(Boolean);

    if (!supabase || !currentUserId || habitIds.length === 0) {
      setCompletedRelatedHabitIds(new Set());
      completionStateDateKeyRef.current = currentDateKey;
      setCompletionError(null);
      setCompletionLoading(false);
      return;
    }

    setCompletionLoading(true);

    if (completionStateDateKeyRef.current !== currentDateKey) {
      const currentDatePendingCompletions = new Set<string>();
      pendingRelatedHabitActionsRef.current.forEach((pendingAction, id) => {
        if (
          habitIds.includes(id) &&
          pendingAction.dateKey === currentDateKey &&
          pendingAction.action === "complete"
        ) {
          currentDatePendingCompletions.add(id);
        }
      });
      setCompletedRelatedHabitIds(currentDatePendingCompletions);
      completionStateDateKeyRef.current = currentDateKey;
    }

    const loadCompletionState = async () => {
      try {
        const { data, error: completionLoadError } = await supabase
          .from("habit_completion_days")
          .select("habit_id")
          .eq("user_id", currentUserId)
          .eq("completion_day", currentDateKey)
          .in("habit_id", habitIds);

        if (completionLoadError) {
          throw completionLoadError;
        }

        if (!cancelled) {
          const completedIds = new Set(
            (data ?? [])
              .map((row) => readString(row.habit_id))
              .filter((habitId): habitId is string => habitId !== null)
          );
          pendingRelatedHabitActionsRef.current.forEach((pendingAction, id) => {
            if (
              !habitIds.includes(id) ||
              pendingAction.dateKey !== currentDateKey
            ) {
              return;
            }

            if (pendingAction.action === "complete") {
              completedIds.add(id);
            } else {
              completedIds.delete(id);
            }
          });
          setCompletedRelatedHabitIds(completedIds);
          completionStateDateKeyRef.current = currentDateKey;
          setCompletionError(null);
        }
      } catch (completionLoadErr) {
        if (!cancelled) {
          console.error(
            "Error loading monument related habit completion state:",
            completionLoadErr
          );
          setCompletionError("Unable to load habit completion state right now.");
        }
      } finally {
        if (!cancelled) {
          setCompletionLoading(false);
        }
      }
    };

    void loadCompletionState();

    return () => {
      cancelled = true;
    };
  }, [currentDateKey, currentUserId, relatedHabitIdsKey, supabase]);

  const handleRelatedHabitCompletionToggle = useCallback(
    async (habitId: string) => {
      if (!currentUserId || pendingRelatedHabitIds.has(habitId)) {
        return;
      }

      const habitBeforeUpdate =
        relatedHabits.find((habit) => habit.id === habitId) ?? null;
      if (!habitBeforeUpdate) {
        return;
      }

      const wasCompleted = completedRelatedHabitIds.has(habitId);
      const action = wasCompleted ? "undo" : "complete";
      const completedAt = new Date().toISOString();

      setCompletionError(null);
      setPendingRelatedHabitIds((previous) => {
        const next = new Set(previous);
        next.add(habitId);
        return next;
      });

      if (!wasCompleted && !previousRelatedHabitStateRef.current.has(habitId)) {
        previousRelatedHabitStateRef.current.set(habitId, {
          lastCompletedAt: habitBeforeUpdate.lastCompletedAt,
          nextDueOverride: habitBeforeUpdate.nextDueOverride,
        });
      }
      pendingRelatedHabitActionsRef.current.set(habitId, {
        action,
        dateKey: currentDateKey,
      });

      setCompletedRelatedHabitIds((previous) => {
        const next = new Set(previous);
        if (wasCompleted) {
          next.delete(habitId);
        } else {
          next.add(habitId);
        }
        return next;
      });
      setRelatedHabits((previous) =>
        previous.map((habit) => {
          if (habit.id !== habitId) {
            return habit;
          }

          if (action === "complete") {
            return {
              ...habit,
              lastCompletedAt: completedAt,
              nextDueOverride: null,
            };
          }

          const previousState = previousRelatedHabitStateRef.current.get(habitId);
          return {
            ...habit,
            lastCompletedAt: previousState?.lastCompletedAt ?? null,
            nextDueOverride:
              previousState?.nextDueOverride ?? habit.nextDueOverride,
          };
        })
      );

      try {
        const response = await fetch("/api/habits/completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            habitId,
            completedAt,
            timeZone,
            action,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        if (action === "undo") {
          previousRelatedHabitStateRef.current.delete(habitId);
        }
      } catch (completionUpdateErr) {
        console.error(
          "Failed to update monument related habit completion:",
          completionUpdateErr
        );
        setCompletionError("Unable to update habit completion right now.");
        toast.error(
          "Completion failed",
          "Unable to update habit completion right now."
        );

        setCompletedRelatedHabitIds((previous) => {
          const next = new Set(previous);
          if (wasCompleted) {
            next.add(habitId);
          } else {
            next.delete(habitId);
          }
          return next;
        });
        setRelatedHabits((previous) =>
          previous.map((habit) =>
            habit.id === habitId ? habitBeforeUpdate : habit
          )
        );
        if (!wasCompleted) {
          previousRelatedHabitStateRef.current.delete(habitId);
        }
      } finally {
        pendingRelatedHabitActionsRef.current.delete(habitId);
        setPendingRelatedHabitIds((previous) => {
          const next = new Set(previous);
          next.delete(habitId);
          return next;
        });
      }
    },
    [
      completedRelatedHabitIds,
      currentDateKey,
      currentUserId,
      pendingRelatedHabitIds,
      relatedHabits,
      timeZone,
      toast,
    ]
  );

  const handleRelatedHabitTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>, habitId: string) => {
      if (Date.now() < relatedHabitSuppressCompletionUntilRef.current) {
        event.preventDefault();
        lastRelatedHabitTapRef.current = null;
        return;
      }

      const now = Date.now();
      const previousTap = lastRelatedHabitTapRef.current;

      if (
        previousTap?.habitId === habitId &&
        now - previousTap.timestamp <= RELATED_HABIT_DOUBLE_TAP_MS
      ) {
        event.preventDefault();
        lastRelatedHabitTapRef.current = null;
        void handleRelatedHabitCompletionToggle(habitId);
        return;
      }

      lastRelatedHabitTapRef.current = {
        habitId,
        timestamp: now,
      };
    },
    [handleRelatedHabitCompletionToggle]
  );

  const cancelRelatedHabitLongPress = useCallback(
    (event?: PointerEvent<HTMLDivElement>) => {
      if (relatedHabitLongPressTimerRef.current !== null) {
        window.clearTimeout(relatedHabitLongPressTimerRef.current);
        relatedHabitLongPressTimerRef.current = null;
      }

      setPressedRelatedHabitId(null);

      if (event) {
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // Pointer capture can already be released by the browser.
        }
      }
    },
    []
  );

  const handleRelatedHabitPointerLeave = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse") {
        cancelRelatedHabitLongPress(event);
      }
    },
    [cancelRelatedHabitLongPress]
  );

  const handleRelatedHabitPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, habit: HabitSummary) => {
      if (
        (event.pointerType === "mouse" && event.button !== 0) ||
        pendingRelatedHabitIds.has(habit.id)
      ) {
        return;
      }

      const element = event.currentTarget;
      const { pointerId } = event;
      cancelRelatedHabitLongPress();
      setPressedRelatedHabitId(habit.id);
      lastRelatedHabitTapRef.current = null;

      try {
        element.setPointerCapture?.(pointerId);
      } catch {
        // Pointer capture is best-effort across browsers and input types.
      }

      relatedHabitLongPressTimerRef.current = window.setTimeout(() => {
        relatedHabitLongPressTimerRef.current = null;
        relatedHabitSuppressCompletionUntilRef.current =
          Date.now() + RELATED_HABIT_LONG_PRESS_SUPPRESS_MS;
        lastRelatedHabitTapRef.current = null;
        setPressedRelatedHabitId(null);
        try {
          if (element.hasPointerCapture?.(pointerId)) {
            element.releasePointerCapture?.(pointerId);
          }
        } catch {
          // Pointer capture can already be released by the browser.
        }
        fabCreation?.requestEntityEdit({
          entityType: "HABIT",
          entityId: habit.id,
          title: habit.name,
          originRect: getRelatedHabitFabOriginRect(element),
        });
      }, RELATED_HABIT_LONG_PRESS_MS);
    },
    [cancelRelatedHabitLongPress, fabCreation, pendingRelatedHabitIds]
  );

  const handleRelatedHabitDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, habitId: string) => {
      if (Date.now() < relatedHabitSuppressCompletionUntilRef.current) {
        event.preventDefault();
        event.stopPropagation();
        lastRelatedHabitTapRef.current = null;
        return;
      }

      void handleRelatedHabitCompletionToggle(habitId);
    },
    [handleRelatedHabitCompletionToggle]
  );

  useEffect(() => cancelRelatedHabitLongPress, [cancelRelatedHabitLongPress]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string }>).detail;
      if (detail?.entityType !== "HABIT") {
        return;
      }

      setRefreshVersion((current) => current + 1);
    };

    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);
    return () => {
      window.removeEventListener("creator:entity-saved", handleCreatorEntitySaved);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRelatedHabits = async () => {
      if (!supabase || !monumentId) {
        setRelatedHabits([]);
        setHabitsLoading(false);
        setCompletionLoading(false);
        return;
      }

      setHabitsLoading(true);
      setCompletionLoading(false);
      setHabitsError(null);
      setCompletionError(null);
      setRelatedHabits([]);
      setCompletedRelatedHabitIds(new Set());
      setPendingRelatedHabitIds(new Set());
      previousRelatedHabitStateRef.current.clear();
      pendingRelatedHabitActionsRef.current.clear();

      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const userId = authData.user?.id ?? null;
        setCurrentUserId(userId);

        if (!userId) {
          if (!cancelled) {
            setRelatedHabits([]);
          }
          return;
        }

        const [directSkillsResult, relationResult] = await Promise.all([
          supabase
            .from("skills")
            .select("id,name,icon")
            .eq("user_id", userId)
            .eq("monument_id", monumentId),
          supabase
            .from("monument_skills")
            .select("skill_id")
            .eq("monument_id", monumentId),
        ]);

        if (directSkillsResult.error) {
          throw directSkillsResult.error;
        }
        if (relationResult.error) {
          console.warn(
            "Unable to load monument skill relation rows:",
            relationResult.error
          );
        }

        const directSkills = (directSkillsResult.data ?? [])
          .map(formatSkillRecord)
          .filter((skill): skill is RelatedSkillSummary => skill !== null);
        const relationSkillIds = new Set(
          (relationResult.data ?? [])
            .map((row) => readString(row.skill_id))
            .filter((skillId): skillId is string => skillId !== null)
        );
        const missingSkillIds = Array.from(relationSkillIds).filter(
          (skillId) => !directSkills.some((skill) => skill.id === skillId)
        );
        const relatedSkills = [...directSkills];

        if (missingSkillIds.length > 0) {
          const { data: relationSkillsData, error: relationSkillsError } =
            await supabase
              .from("skills")
              .select("id,name,icon")
              .eq("user_id", userId)
              .in("id", missingSkillIds);

          if (relationSkillsError) {
            throw relationSkillsError;
          }

          relatedSkills.push(
            ...(relationSkillsData ?? [])
              .map(formatSkillRecord)
              .filter((skill): skill is RelatedSkillSummary => skill !== null)
          );
        }

        const skillIconById = new Map(
          relatedSkills.map((skill) => [skill.id, skill.icon])
        );
        const skillIds = Array.from(skillIconById.keys());

        if (skillIds.length === 0) {
          if (!cancelled) {
            setRelatedHabits([]);
          }
          return;
        }

        const { data: habitsData, error: habitsError } = await supabase
          .from("habits")
          .select(
            "id, name, created_at, updated_at, last_completed_at, current_streak_days, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, next_due_override, habit_type, skill_id"
          )
          .eq("user_id", userId)
          .in("skill_id", skillIds)
          .order("name", { ascending: true });

        if (habitsError) {
          throw habitsError;
        }

        if (!cancelled) {
          const formattedHabits = (habitsData ?? [])
            .map((habit) => formatHabitRecord(habit, skillIconById))
            .filter((habit): habit is HabitSummary => habit !== null);
          setCompletionLoading(formattedHabits.length > 0);
          setRelatedHabits(formattedHabits);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching monument related habits:", err);
          setRelatedHabits([]);
          setHabitsError("Unable to load related habits right now.");
        }
      } finally {
        if (!cancelled) {
          setHabitsLoading(false);
        }
      }
    };

    void loadRelatedHabits();

    return () => {
      cancelled = true;
    };
  }, [monumentId, refreshVersion, supabase]);

  return (
    <Card className="relative gap-0 overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] py-0 shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_70%)]" />
      <CardHeader className="relative px-6 pt-3 pb-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              RELATED HABITS
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold leading-none text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {decoratedHabits.length}
            </span>
            <button
              type="button"
              aria-label={
                isSmallRelatedHabitDensity ? "Use large cards" : "Use small cards"
              }
              onClick={handleRelatedHabitDensityToggle}
              className={clsx(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                isSmallRelatedHabitDensity
                  ? "text-zinc-300 shadow-[0_0_16px_-8px_rgba(255,255,255,0.72)]"
                  : null
              )}
            >
              {isSmallRelatedHabitDensity ? (
                <Grid2x2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              ) : (
                <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative pt-0 pb-4">
        {habitsLoading || completionLoading ? (
          <div className={relatedHabitGridClass}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton
                key={index}
                className={clsx(
                  "aspect-[5/6] bg-white/[0.06]",
                  isSmallRelatedHabitDensity
                    ? "min-h-[70px] rounded-xl"
                    : "min-h-[96px] rounded-2xl"
                )}
              />
            ))}
          </div>
        ) : habitsError ? (
          <p className="text-xs text-white/60">{habitsError}</p>
        ) : relatedHabits.length === 0 ? (
          <p className="text-xs text-white/60">
            no habits related to this monument yet
          </p>
        ) : (
          <div className="space-y-2">
            {completionError ? (
              <p className="text-xs text-white/60">{completionError}</p>
            ) : null}
            <div className={relatedHabitGridClass}>
              {decoratedHabits.map((habit) => {
                const isHabitCompletedToday = completedRelatedHabitIds.has(
                  habit.id
                );
                const isHabitPending = pendingRelatedHabitIds.has(habit.id);
                const streakDays = habit.currentStreakDays ?? 0;
                const showStreakBadge = streakDays >= 2;
                const streakLabel = `${streakDays}x`;
                const habitSkillIcon = habit.skillIcon || "💡";
                const isHabitOverdue = habit.dueLabel === "OVERDUE";
                const habitPillLabel = isHabitCompletedToday
                  ? "COMPLETE"
                  : habit.dueLabel;
                const habitStateBorderClass = isHabitCompletedToday
                  ? "shimmer-border-complete"
                  : isHabitOverdue
                    ? "related-habit-due-border"
                    : null;
                const habitPillClass = isHabitCompletedToday
                  ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
                  : isHabitOverdue
                    ? "border-rose-200/20 bg-rose-950/35 text-rose-100/85"
                    : "border-white/10 bg-white/[0.06] text-white/65";

                return (
                  <div
                    key={habit.id}
                    className={clsx(
                      "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col text-white transition duration-200 select-none",
                      isSmallRelatedHabitDensity
                        ? "min-h-[70px] rounded-xl p-1.5 sm:min-h-[82px] sm:p-2"
                        : "min-h-[96px] rounded-2xl p-3 sm:p-4",
                      isHabitCompletedToday
                        ? "emerald-completed-compact"
                        : [
                            getHabitCardTypeClass(habit.normalizedHabitType),
                            getHabitCardBorderClass(habit.normalizedHabitType),
                          ],
                      isHabitPending
                        ? "pointer-events-none cursor-default opacity-75"
                        : "cursor-pointer",
                      pressedRelatedHabitId === habit.id
                        ? "scale-[0.985] translate-y-px brightness-95"
                        : null,
                      habitStateBorderClass
                    )}
                    role="button"
                    tabIndex={isHabitPending ? -1 : 0}
                    aria-pressed={isHabitCompletedToday}
                    aria-disabled={isHabitPending}
                    aria-label={`${habit.name}. ${habitPillLabel}. Double tap to ${
                      isHabitCompletedToday ? "undo" : "complete"
                    }.`}
                    title={`${habit.name} - ${habitPillLabel}. Double tap to ${
                      isHabitCompletedToday ? "undo" : "complete"
                    }.`}
                    onPointerDown={(event) =>
                      handleRelatedHabitPointerDown(event, habit)
                    }
                    onPointerUp={cancelRelatedHabitLongPress}
                    onPointerCancel={cancelRelatedHabitLongPress}
                    onPointerLeave={handleRelatedHabitPointerLeave}
                    onDoubleClick={(event) =>
                      handleRelatedHabitDoubleClick(event, habit.id)
                    }
                    onTouchEnd={(event) =>
                      handleRelatedHabitTouchEnd(event, habit.id)
                    }
                  >
                    {showStreakBadge ? (
                      <span
                        className="pointer-events-none absolute -right-0.5 -top-0.5 z-[8] flex flex-col items-center gap-0 text-[9px] font-semibold leading-[0.85] text-amber-100/95"
                        aria-label={`${streakDays} habit streak`}
                      >
                        <FlameEmber
                          level={
                            streakDays >= 7
                              ? "HIGH"
                              : streakDays >= 4
                                ? "MEDIUM"
                                : "LOW"
                          }
                          size="sm"
                          className="scale-90 drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
                        />
                        <span className="tracking-normal">{streakLabel}</span>
                      </span>
                    ) : null}
                    <div className="relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-between gap-1 text-center">
                      <span
                        className={clsx(
                          "mt-1 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 font-semibold leading-none text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]",
                          isSmallRelatedHabitDensity
                            ? "h-6 w-6 text-[11px] sm:h-7 sm:w-7"
                            : "h-7 w-7 text-xs sm:h-8 sm:w-8",
                          isHabitCompletedToday
                            ? "grayscale"
                            : "drop-shadow-[0_8px_18px_rgba(0,0,0,0.38)]"
                        )}
                        aria-hidden="true"
                      >
                        {habitSkillIcon}
                      </span>
                      <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
                        <span
                          className={clsx(
                            "line-clamp-3 w-full min-w-0 break-words px-0.5 text-center font-semibold leading-tight text-white whitespace-normal",
                            isSmallRelatedHabitDensity
                              ? "text-[8px] sm:text-[9px]"
                              : "text-[9px] sm:text-[10px]"
                          )}
                          style={{ hyphens: "auto" }}
                        >
                          {habit.name}
                        </span>
                      </div>
                      <div className="flex w-full min-w-0 flex-col items-center gap-1">
                        <span
                          className={clsx(
                            "w-fit max-w-none whitespace-nowrap rounded-full border font-semibold uppercase leading-none tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                            isSmallRelatedHabitDensity
                              ? "px-1.5 py-[2px] text-[7px]"
                              : "px-2 py-[3px] text-[8px]",
                            habitPillClass
                          )}
                        >
                          {habitPillLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MonumentRelatedHabits;
