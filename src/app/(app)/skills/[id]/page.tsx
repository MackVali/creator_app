"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  Target,
  Timer,
  MoreHorizontal,
  X,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { SkillProjectsList } from "@/components/skills/SkillProjectsList";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesGrid } from "@/components/notes/NotesGrid";
import { Button } from "@/components/ui/button";
import { useToastHelpers } from "@/components/ui/toast";
import FocusPomo, { type FocusPomoSource } from "@/components/focus/FocusPomo";
import FlameEmber from "@/components/FlameEmber";
import { SkillDrawer, type Category, type Skill as DrawerSkill } from "@/app/(app)/skills/components/SkillDrawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import {
  formatDateKeyInTimeZone,
  normalizeTimeZone,
} from "@/lib/scheduler/timezone";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "@/lib/scheduler/limits";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import { createRecord, deleteRecord, updateRecord } from "@/lib/db";
import type { SkillRow } from "@/lib/types/skill";
import {
  mapRowToProgress,
  type SkillProgressData,
  type SkillProgressRow,
} from "@/lib/skills/skillProgress";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  created_at: string;
  cat_id: string | null;
  monument_id: string | null;
  sort_order: number | null;
  is_default: boolean;
  is_locked: boolean;
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
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const NO_DUE_MATCH_RANK = MAX_LOOKAHEAD_DAYS + 1;
const RELATED_HABIT_DOUBLE_TAP_MS = 350;

type HabitDueStatus = {
  label: string;
  rank: number;
};

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
    skillId: null,
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
    return { label: "Due Now", rank: 0 };
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
      if (dayOffset === 1) {
        return { label: "Due in 1 Day", rank: dayOffset };
      }
      return { label: `Due in ${dayOffset} Days`, rank: dayOffset };
    }
  }

  return { label: "No Due Match", rank: NO_DUE_MATCH_RANK };
}

function computeHabitDueLabel(habit: HabitSummary, timeZone: string): string {
  return computeHabitDueStatus(habit, timeZone).label;
}

function computeHabitDueRank(habit: HabitSummary, timeZone: string): number {
  return computeHabitDueStatus(habit, timeZone).rank;
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
  if (normalized === "CHORE") return "habit-card--type-chore";
  if (normalized === "SYNC") return "habit-card--type-sync";
  if (normalized === "PRACTICE") return "habit-card--type-practice";
  if (normalized === "RELAXER") return "habit-card--type-relaxer";
  if (normalized === "MEMO") return "habit-card--type-memo";
  return "habit-card--type-default";
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC") return "border-zinc-200/35";
  if (normalized === "RELAXER") return "border-emerald-200/50";
  if (normalized === "MEMO") return "border-purple-300/50";
  return "border-slate-500/50";
}

function describeLevel(level: number): string {
  if (level >= 10) {
    return "Mastery in motion.";
  }
  if (level >= 6) {
    return "Building serious momentum.";
  }
  if (level >= 3) {
    return "Solidifying the fundamentals.";
  }
  return "Laying the groundwork for growth.";
}

export default function SkillDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SkillProgressData | null>(null);
  const [relatedHabits, setRelatedHabits] = useState<HabitSummary[]>([]);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [completedRelatedHabitIds, setCompletedRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingRelatedHabitIds, setPendingRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [categories, setCategories] = useState<Category[]>([]);
  const [monuments, setMonuments] = useState<{ id: string; title: string }[]>([]);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [focusPomoSource, setFocusPomoSource] =
    useState<FocusPomoSource | null>(null);
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const toast = useToastHelpers();
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
  const previousRelatedHabitStateRef = useRef(
    new Map<
      string,
      {
        lastCompletedAt: string | null;
        nextDueOverride: string | null;
      }
    >()
  );
  const pendingRelatedHabitActionsRef = useRef(
    new Map<string, { action: "complete" | "undo"; dateKey: string }>()
  );
  const completionStateDateKeyRef = useRef<string | null>(null);
  const decoratedHabits = useMemo(
    () =>
      relatedHabits
        .map((habit) => ({
          ...habit,
          normalizedHabitType: normalizeRelatedHabitType(habit.habitType),
          dueLabel: computeHabitDueLabel(habit, timeZone),
          dueRank: computeHabitDueRank(habit, timeZone),
        }))
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
      return;
    }

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
              .map((row) =>
                typeof row.habit_id === "string" ? row.habit_id : null
              )
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
            "Error loading related habit completion state:",
            completionLoadErr
          );
          setCompletionError("Unable to load habit completion state right now.");
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
          "Failed to update related habit completion:",
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

  useEffect(() => {
    let cancelled = false;

    const fetchRelatedHabits = async (userId: string | null) => {
      if (!supabase || !userId) {
        if (!cancelled) {
          setRelatedHabits([]);
          setHabitsLoading(false);
        }
        return;
      }

      try {
        const { data: habitsData, error: habitsError } = await supabase
          .from("habits")
          .select(
            "id, name, created_at, updated_at, last_completed_at, current_streak_days, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, next_due_override, habit_type"
          )
          .eq("user_id", userId)
          .eq("skill_id", id)
          .order("name", { ascending: true });

        if (habitsError) {
          throw habitsError;
        }

        if (!cancelled) {
          const formattedHabits = (habitsData ?? [])
            .map((habit) => {
              if (!habit) return null;

              const habitRecord = habit as {
                id?: unknown;
                name?: unknown;
                created_at?: unknown;
                updated_at?: unknown;
                last_completed_at?: unknown;
                current_streak_days?: unknown;
                recurrence?: unknown;
                recurrence_days?: unknown;
                recurrence_mode?: unknown;
                anchor_type?: unknown;
                anchor_value?: unknown;
                anchor_start_date?: unknown;
                next_due_override?: unknown;
                habit_type?: unknown;
              };

              const habitId =
                typeof habitRecord.id === "string" ? habitRecord.id : null;
              if (!habitId) return null;

              const habitName =
                typeof habitRecord.name === "string" && habitRecord.name.trim().length > 0
                  ? habitRecord.name.trim()
                  : "Untitled habit";

              const createdAt =
                typeof habitRecord.created_at === "string"
                  ? habitRecord.created_at
                  : null;
              const updatedAt =
                typeof habitRecord.updated_at === "string"
                  ? habitRecord.updated_at
                  : null;
              const lastCompletedAt =
                typeof habitRecord.last_completed_at === "string"
                  ? habitRecord.last_completed_at
                  : null;
              const currentStreakDays = normalizeRelatedHabitStreakDays(
                habitRecord.current_streak_days
              );
              const recurrence =
                typeof habitRecord.recurrence === "string" && habitRecord.recurrence.trim().length > 0
                  ? habitRecord.recurrence
                  : null;
              const recurrenceDays = normalizeRecurrenceDays(
                habitRecord.recurrence_days
              );
              const habitType =
                typeof habitRecord.habit_type === "string" && habitRecord.habit_type.trim().length > 0
                  ? habitRecord.habit_type
                  : null;
              const recurrenceMode =
                typeof habitRecord.recurrence_mode === "string" &&
                habitRecord.recurrence_mode.trim().length > 0
                  ? habitRecord.recurrence_mode
                  : null;
              const anchorType =
                typeof habitRecord.anchor_type === "string" &&
                habitRecord.anchor_type.trim().length > 0
                  ? habitRecord.anchor_type
                  : null;
              const anchorValue =
                typeof habitRecord.anchor_value === "string" &&
                habitRecord.anchor_value.trim().length > 0
                  ? habitRecord.anchor_value
                  : typeof habitRecord.anchor_value === "number" &&
                      Number.isFinite(habitRecord.anchor_value)
                    ? String(habitRecord.anchor_value)
                  : null;
              const anchorStartDate =
                typeof habitRecord.anchor_start_date === "string"
                  ? habitRecord.anchor_start_date
                  : null;
              const nextDueOverride =
                typeof habitRecord.next_due_override === "string"
                  ? habitRecord.next_due_override
                  : null;

              return {
                id: habitId,
                name: habitName,
                createdAt,
                updatedAt,
                lastCompletedAt,
                currentStreakDays,
                recurrence,
                recurrenceDays,
                recurrenceMode,
                anchorType,
                anchorValue,
                anchorStartDate,
                nextDueOverride,
                habitType,
              } satisfies HabitSummary;
            })
            .filter((habit): habit is HabitSummary => habit !== null);

          setRelatedHabits(formattedHabits);
        }
      } catch (habitErr) {
        if (!cancelled) {
          console.error("Error fetching related habits:", habitErr);
          setRelatedHabits([]);
          setHabitsError("Unable to load related habits right now.");
        }
      } finally {
        if (!cancelled) {
          setHabitsLoading(false);
        }
      }
    };

    const fetchSkillProgress = async (userId: string | null) => {
      if (!supabase || !userId) {
        if (!cancelled) {
          setProgress(null);
        }
        return;
      }

      try {
        const { data: progressRow, error: progressError } = await supabase
          .from("skill_progress")
          .select(
            `
              skill_id,
              level,
              prestige,
              xp_into_level,
              skill_badges (
                id,
                badge_id,
                badges (
                  level,
                  emoji,
                  label,
                  description
                )
              )
            `,
          )
          .eq("user_id", userId)
          .eq("skill_id", id)
          .maybeSingle();

        if (!cancelled) {
          if (progressError && progressError.code !== "PGRST116") {
            console.error("Error fetching skill progress:", progressError);
          }

          const mapped = mapRowToProgress((progressRow ?? null) as SkillProgressRow | null);
          setProgress(mapped);
        }
      } catch (progressErr) {
        if (!cancelled) {
          console.error("Unexpected error fetching skill progress:", progressErr);
          setProgress(null);
        }
      }
    };

    async function load() {
      if (!supabase || !id) return;

      setLoading(true);
      setError(null);
      setHabitsError(null);
      setCompletionError(null);
      setRelatedHabits([]);
      setCompletedRelatedHabitIds(new Set());
      setPendingRelatedHabitIds(new Set());
      previousRelatedHabitStateRef.current.clear();
      pendingRelatedHabitActionsRef.current.clear();
      setHabitsLoading(true);
      setProgress(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const userId = authData.user?.id ?? null;
        setCurrentUserId(userId);

        let skillQuery = supabase
          .from("skills")
          .select(
            "id,name,icon,level,created_at,cat_id,monument_id,sort_order,is_default,is_locked"
          )
          .eq("id", id);

        if (userId) {
          skillQuery = skillQuery.eq("user_id", userId);
        }

        const { data, error } = await skillQuery.single();

        if (!cancelled) {
          if (error) {
            console.error("Error fetching skill:", error);
            setError("Failed to load skill");
            setHabitsLoading(false);
          } else {
            setSkill(data);
            await Promise.all([
              fetchRelatedHabits(userId),
              fetchSkillProgress(userId),
              userId
                ? Promise.all([
                    supabase
                      .from("cats")
                      .select("id,name")
                      .eq("user_id", userId)
                      .then(({ data: catsData, error: catsError }) => {
                        if (catsError) {
                          console.error("Error loading categories:", catsError);
                          return;
                        }
                        setCategories((catsData ?? []) as Category[]);
                      }),
                    supabase
                      .from("monuments")
                      .select("id,title")
                      .eq("user_id", userId)
                      .then(({ data: monumentsData, error: monumentsError }) => {
                        if (monumentsError) {
                          console.error("Error loading monuments:", monumentsError);
                          return;
                        }
                        setMonuments(
                          (monumentsData ?? []).map((monument) => ({
                            id: monument.id,
                            title: monument.title,
                          }))
                        );
                      }),
                  ])
                : Promise.resolve(),
            ]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading skill:", err);
          setError("Failed to load skill");
          setHabitsLoading(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (loading) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#101010] to-[#181818] p-6 shadow-[0_35px_120px_-45px_rgba(0,0,0,0.82)] sm:p-8">
            <div className="absolute inset-0">
              <div className="absolute inset-x-10 -top-28 h-64 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.12),_transparent_70%)] blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_65%)] blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-8 md:flex-row md:items-center">
              <div className="flex items-start gap-5">
                <Skeleton className="h-[88px] w-[88px] rounded-3xl border border-white/10 bg-white/10" />
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-10 w-48 bg-white/10 sm:w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-5 rounded-full bg-white/10" />
                    <Skeleton className="h-5 w-5 rounded-full bg-white/10" />
                    <Skeleton className="h-5 w-5 rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
            </div>
            <div className="relative mt-8 grid grid-cols-2 gap-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <Skeleton className="size-6 rounded-full bg-white/10" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-2 w-20 bg-white/10" />
                    <Skeleton className="h-3 w-24 bg-white/10" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101010] to-[#1a1a1a] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.8)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20 bg-white/10" />
                  <Skeleton className="h-7 w-52 bg-white/10" />
                  <Skeleton className="h-4 w-full max-w-md bg-white/10" />
                </div>
                <Skeleton className="h-9 w-24 rounded-full bg-white/10" />
              </div>
              <div className="mt-6 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 rounded-2xl border border-white/10 bg-white/5" />
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#070707] via-[#121212] to-[#1c1c1c] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.8)] sm:p-7">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16 bg-white/10" />
                  <Skeleton className="h-7 w-44 bg-white/10" />
                  <Skeleton className="h-4 w-full bg-white/10" />
                </div>
                <div className="mt-5 grid gap-3">
                  <Skeleton className="h-20 rounded-2xl border border-white/10 bg-white/5" />
                  <Skeleton className="h-20 rounded-2xl border border-white/10 bg-white/5" />
                </div>
              </div>

              <Card className="rounded-3xl border-white/10 bg-white/5 shadow-[0_24px_60px_-45px_rgba(0,0,0,0.78)] backdrop-blur">
                <CardHeader>
                  <Skeleton className="h-6 w-28 bg-white/10" />
                  <Skeleton className="h-4 w-44 bg-white/10" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={index} className="h-8 w-24 rounded-full bg-white/10" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (error || !skill) {
    return (
      <main className="px-4 pb-16 pt-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 px-8 py-12 text-center shadow-[0_25px_60px_rgba(220,38,38,0.35)]">
            <h1 className="text-2xl font-semibold text-red-100">
              {error || "Skill not found"}
            </h1>
            <p className="mt-4 text-sm text-red-100/80">
              {error
                ? "Please try again later."
                : "This skill doesn't exist or you don't have access to it."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const createdAt = skill.created_at ? new Date(skill.created_at) : null;
  const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());
  const formattedCreatedAt = hasValidDate ? formatDate(skill.created_at) : null;
  const daysTracked = hasValidDate
    ? Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;
  const createdRelativeText = hasValidDate
    ? daysTracked === 0
      ? "Added today."
      : `Added ${daysTracked} day${daysTracked === 1 ? "" : "s"} ago.`
    : "Creation date unavailable.";

  const skillBadges = progress?.badges ?? [];
  const stats = [
    {
      label: "Skill level",
      value: `Lv ${skill.level}`,
      description: describeLevel(skill.level),
      icon: Target,
    },
    {
      label: "Added to timeline",
      value: formattedCreatedAt ?? "Not available",
      description: createdRelativeText,
      icon: CalendarDays,
    },
  ];

  const icon = skill.icon || "💡";

  const skillForDrawer: DrawerSkill = {
    id: skill.id,
    name: skill.name,
    icon: skill.icon ?? "",
    level: skill.level ?? 1,
    progress: 0,
    cat_id: skill.cat_id,
    monument_id: skill.monument_id,
    sort_order: skill.sort_order,
    created_at: skill.created_at,
    is_default: skill.is_default,
    is_locked: skill.is_locked,
  };

  const handleSaveSkill = async (updatedSkill: DrawerSkill) => {
    const { error: updateError } = await updateRecord<SkillRow>("skills", skill.id, {
      name: updatedSkill.name,
      icon: updatedSkill.icon || null,
      level: updatedSkill.level,
      cat_id: updatedSkill.cat_id,
      monument_id: updatedSkill.monument_id,
    });

    if (updateError) {
      console.error("Failed to update skill from detail page:", updateError);
      toast.error("Update failed", updateError.message || "Unable to save skill.");
      return;
    }

    setSkill((prev) =>
      prev
        ? {
            ...prev,
            name: updatedSkill.name,
            icon: updatedSkill.icon || null,
            level: updatedSkill.level,
            cat_id: updatedSkill.cat_id,
            monument_id: updatedSkill.monument_id,
          }
        : prev
    );
    toast.success("Skill updated", "Your skill details were saved.");
  };

  const handleAddCategory = async (name: string): Promise<Category | null> => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const { data, error: createError } = await createRecord<Category>("cats", {
      name: trimmedName,
    });

    if (createError || !data) {
      console.error("Failed to create category from skill detail:", createError);
      toast.error("Category failed", createError?.message || "Unable to add category.");
      return null;
    }

    const createdCategory = { id: data.id, name: data.name };
    setCategories((prev) => [...prev, createdCategory]);
    return createdCategory;
  };

  const handleDeleteSkill = async () => {
    if (skill.is_locked) {
      toast.error("Locked skill", "This skill is locked and can’t be removed.");
      return;
    }

    try {
      setIsDeleting(true);
      const { error: deleteError } = await deleteRecord("skills", skill.id);
      if (deleteError) {
        console.error("Failed to delete skill from detail page:", deleteError);
        toast.error("Delete failed", deleteError.message || "Unable to delete skill.");
        return;
      }

      toast.success("Skill removed", "The skill was deleted.");
      setDeleteConfirmationOpen(false);
      setActionsMenuOpen(false);
      router.push("/skills");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartFocusPomo = () => {
    const source: FocusPomoSource = {
      sourceType: "skill",
      sourceId: id,
      title: skill.name,
      icon: skill.icon,
    };

    console.info("Start focus pomo", source);
    setFocusPomoSource(source);
  };

  return (
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <SkillDrawer
        open={editDrawerOpen}
        onClose={() => setEditDrawerOpen(false)}
        onAdd={async () => {}}
        categories={categories}
        monuments={monuments}
        onAddCategory={handleAddCategory}
        initialSkill={skillForDrawer}
        onUpdate={handleSaveSkill}
      />
      <FocusPomo
        open={Boolean(focusPomoSource)}
        source={focusPomoSource}
        onClose={() => setFocusPomoSource(null)}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex min-h-10 items-center justify-between px-1">
            <Link
              href="/skills"
              aria-label="Back to skills"
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Start focus pomo for ${skill.name}`}
                onClick={handleStartFocusPomo}
                className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <Timer className="h-4 w-4" aria-hidden="true" />
              </button>
              <DropdownMenu
                open={actionsMenuOpen}
                onOpenChange={(open) => {
                  setActionsMenuOpen(open);
                  if (!open) {
                    setDeleteConfirmationOpen(false);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Skill actions"
                    className="inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    disabled={skill.is_locked}
                    onSelect={() => setEditDrawerOpen(true)}
                  >
                    Edit skill
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={skill.is_locked || isDeleting}
                    className={
                      deleteConfirmationOpen ? "text-amber-200 focus:text-amber-100" : ""
                    }
                    onSelect={(event) => {
                      event.preventDefault();
                      if (deleteConfirmationOpen) {
                        void handleDeleteSkill();
                        return;
                      }
                      setDeleteConfirmationOpen(true);
                    }}
                  >
                    {isDeleting
                      ? "Removing..."
                      : deleteConfirmationOpen
                        ? "Are you sure? Remove"
                        : "Remove skill"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <section aria-labelledby="skill-overview" className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#101010] to-[#181818] p-4 shadow-[0_35px_120px_-45px_rgba(15,23,42,0.8)] sm:p-5 md:p-6">
            <div className="absolute inset-0">
              <div className="absolute inset-x-10 -top-28 h-64 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.16),_transparent_70%)] blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.12),_transparent_65%)] blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <span
                  className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-2xl bg-white/10 text-4xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/20 sm:h-[76px] sm:w-[76px] sm:text-[2.75rem]"
                  role="img"
                  aria-label={`Skill: ${skill.name}`}
                >
                  {icon}
                </span>
                <div className="min-w-0 space-y-2">
                  <h1 id="skill-overview" className="break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
                    {skill.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 text-lg leading-none">
                      {skillBadges.length > 0 ? (
                        skillBadges.map((badge) => (
                          <span
                            key={badge.id}
                            role="img"
                            aria-label={badge.label}
                            title={badge.label}
                            className="drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
                          >
                            {badge.emoji}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-white/35">
                          No badges yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid w-full grid-cols-2 gap-2 md:w-[320px] md:shrink-0">
                {stats.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="group flex min-w-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-2 py-1.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-white/25 hover:bg-white/10 sm:px-2.5"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
                      <Icon className="size-2.5" aria-hidden="true" />
                    </span>
                    <div className="flex min-w-0 flex-col leading-[1.08]">
                      <span className="text-[7px] font-semibold uppercase tracking-[0.18em] text-white/50">
                        {label}
                      </span>
                      <span className="break-words text-[9px] font-semibold text-white">
                        {value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101010] to-[#1a1a1a] p-6 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.75)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
            <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">PROJECTS</p>
              </div>
            </header>
            <div className="relative mt-6 overflow-visible">
              <SkillProjectsList skillId={id} />
            </div>
          </section>

          <section className="relative space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#070707] via-[#121212] to-[#1c1c1c] p-4 shadow-[0_28px_90px_-48px_rgba(15,23,42,0.78)] sm:p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.1),_transparent_60%)]" />
              <div className="relative">
                <NotesGrid skillId={id} />
              </div>
            </div>

            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-gradient-to-br from-[#070707] via-[#111111] to-[#1b1b1b] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.78)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_68%)]" />
              <CardHeader className="relative pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                  RELATED HABITS
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                {habitsLoading ? (
                  <div className="grid gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        className="h-[76px] rounded-2xl border border-white/10 bg-white/10"
                      />
                    ))}
                  </div>
                ) : habitsError ? (
                  <p className="text-xs text-white/60">{habitsError}</p>
                ) : relatedHabits.length === 0 ? (
                  <p className="text-xs text-white/60">no habits related to this skill yet</p>
                ) : (
                  <div className="space-y-2">
                    {completionError ? (
                      <p className="text-xs text-white/60">{completionError}</p>
                    ) : null}
                    <div className="grid gap-2">
                      {decoratedHabits.map((habit) => {
                        const isHabitCompletedToday =
                          completedRelatedHabitIds.has(habit.id);
                        const isHabitPending = pendingRelatedHabitIds.has(
                          habit.id
                        );
                        const streakDays = habit.currentStreakDays ?? 0;
                        const showStreakBadge = streakDays >= 2;
                        const streakLabel = `${streakDays}x`;

                        return (
                          <div
                            key={habit.id}
                            className={clsx(
                              "habit-card relative flex min-h-[76px] w-full flex-col justify-between gap-2 rounded-2xl border px-4 py-3 text-white backdrop-blur transition duration-150 select-none hover:-translate-y-0.5",
                              isHabitCompletedToday
                                ? "habit-card--completed habit-card--completed-gem"
                                : "habit-card--scheduled",
                              getHabitCardTypeClass(habit.normalizedHabitType),
                              getHabitCardBorderClass(habit.normalizedHabitType),
                              isHabitPending
                                ? "pointer-events-none cursor-default opacity-75"
                                : "cursor-pointer"
                            )}
                            role="button"
                            tabIndex={isHabitPending ? -1 : 0}
                            aria-pressed={isHabitCompletedToday}
                            aria-disabled={isHabitPending}
                            aria-label={`${habit.name}. ${habit.dueLabel}. Double tap to ${
                              isHabitCompletedToday ? "undo" : "complete"
                            }.`}
                            style={{
                              boxShadow: isHabitCompletedToday
                                ? "0 14px 28px rgba(2, 6, 23, 0.34), inset 0 1px 0 rgba(236, 253, 245, 0.32), inset 0 0 0 1px rgba(110, 231, 183, 0.22)"
                                : "0 18px 38px rgba(8, 12, 32, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                              outline: "1px solid rgba(0, 0, 0, 0.78)",
                              outlineOffset: "-1px",
                            }}
                            title={`${habit.name} - ${habit.dueLabel}. Double tap to ${
                              isHabitCompletedToday ? "undo" : "complete"
                            }.`}
                            onDoubleClick={() => {
                              void handleRelatedHabitCompletionToggle(habit.id);
                            }}
                            onTouchEnd={(event) =>
                              handleRelatedHabitTouchEnd(event, habit.id)
                            }
                          >
                            {showStreakBadge ? (
                              <span
                                className="pointer-events-none absolute right-3 top-3 z-[2] flex items-center gap-0.5 rounded-full border border-white/10 bg-white/10 px-1.5 py-[2px] text-[11px] font-semibold leading-tight text-amber-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
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
                                  size="xs"
                                  className="drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
                                />
                                <span className="tracking-normal">
                                  {streakLabel}
                                </span>
                              </span>
                            ) : null}
                            <span className="relative z-[2] line-clamp-2 pr-14 text-sm font-semibold leading-tight text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
                              {habit.name}
                            </span>
                            <span className="relative z-[2] text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                              {habit.dueLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-white/5 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.7)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(129,140,248,0.14),_transparent_70%)]" />
              <CardHeader className="relative">
                <CardTitle className="text-base font-semibold text-white">Need a different view?</CardTitle>
                <CardDescription className="text-white/70">
                  Jump back to your full skills library to reorganize, add new abilities, or explore other focuses.
                </CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <Button
                  asChild
                  size="sm"
                  className="rounded-full bg-white px-5 text-slate-900 shadow-sm transition hover:bg-white/90"
                >
                  <Link href="/skills">Open skills dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
