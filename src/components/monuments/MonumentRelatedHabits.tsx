"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import clsx from "clsx";
import { Grid2x2, Grid3x3 } from "lucide-react";

import FlameEmber from "@/components/FlameEmber";
import { Skeleton } from "@/components/ui/skeleton";
import { MemoCompletionDialog } from "@/components/schedule/MemoCompletionDialog";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import { useToastHelpers } from "@/components/ui/toast";
import {
  RelatedRoutineCard,
  type RelatedRoutineCardRoutine,
} from "@/components/habits/RelatedRoutineCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import type { Database } from "@/types/supabase";
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
  memoCaptureConfig: Database["public"]["Tables"]["habits"]["Row"]["memo_capture_config"];
  skillId: string | null;
  skillIcon: string | null;
  routineId: string | null;
  routineName: string | null;
  routineDescription: string | null;
  routineIcon: string | null;
  routinePosition: number | null;
}

interface RoutineMetadata {
  id: string;
  name: string | null;
  description: string | null;
  icon: string | null;
}

type HabitDueStatus = {
  label: string;
  rank: number;
};
type DecoratedRelatedRoutine = RelatedRoutineCardRoutine & {
  dueRank: number;
  typeRank: number;
  sortName: string;
};
type RelatedHabitPageItem =
  | {
      kind: "routine";
      routine: DecoratedRelatedRoutine;
    }
  | {
      kind: "habit";
      habit: HabitSummary & {
        normalizedHabitType: string;
        dueLabel: string;
        dueRank: number;
      };
    };
type RelatedHabitCardDensity = "large" | "small";
type RelatedHabitPageSwipeAxis = "horizontal" | "vertical" | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RELATED_HABIT_OVERDUE_VISUAL_THRESHOLD_MS = MS_PER_DAY * 7;
const MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const NO_DUE_MATCH_RANK = MAX_LOOKAHEAD_DAYS + 1;
const RELATED_HABIT_DOUBLE_TAP_MS = 350;
const RELATED_HABIT_LONG_PRESS_MS = 300;
const RELATED_HABIT_LONG_PRESS_SUPPRESS_MS = 1_000;
const RELATED_HABIT_COMPLETED_MOVE_DELAY_MS = 850;
const RELATED_HABIT_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const RELATED_HABIT_SMALL_GRID_CLASS =
  "-mx-2 grid grid-cols-4 gap-1.5 px-2 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";
const RELATED_HABIT_PAGE_GRID_CLASS =
  "grid grid-cols-3 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const RELATED_HABIT_SMALL_PAGE_GRID_CLASS =
  "grid grid-cols-4 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";
const RELATED_HABIT_COMPLETED_CARD_CLASS =
  "border-emerald-800/80 !bg-[#070b0d] !bg-[radial-gradient(circle_at_16%_0%,rgba(45,212,191,0.12),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(16,185,129,0.10),transparent_36%),linear-gradient(135deg,rgba(6,78,59,0.22),rgba(3,12,14,0)_42%),linear-gradient(180deg,#11161a_0%,#090d10_55%,#050708_100%)] bg-clip-padding outline outline-1 -outline-offset-4 outline-emerald-400/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgba(45,212,191,0.22),inset_0_-10px_18px_rgba(0,0,0,0.34),0_0_0_1px_rgba(2,44,34,0.72),0_0_18px_-11px_rgba(16,185,129,0.58),0_10px_24px_-20px_rgba(0,0,0,0.85)]";
const RELATED_HABIT_COMPLETED_SHIMMER_CLASS =
  "pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[linear-gradient(45deg,rgba(2,44,34,0.42),rgba(5,150,105,0.50),rgba(52,211,153,0.58),rgba(16,185,129,0.48),rgba(2,44,34,0.42))] bg-[length:400%_400%] p-[3px] opacity-85 animate-[steel-shimmer_3s_ease-in-out_infinite] [-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]";
const RELATED_HABIT_COMPLETED_FACET_CLASS =
  "pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[linear-gradient(135deg,rgba(2,44,34,0.95),transparent_18%)_top_left/42%_42%_no-repeat,linear-gradient(225deg,rgba(6,95,70,0.86),transparent_18%)_top_right/42%_42%_no-repeat,linear-gradient(45deg,rgba(3,67,54,0.90),transparent_18%)_bottom_left/42%_42%_no-repeat,linear-gradient(315deg,rgba(20,184,166,0.28),transparent_18%)_bottom_right/42%_42%_no-repeat] p-[2px] shadow-[inset_0_0_0_1px_rgba(5,150,105,0.36),inset_0_0_0_2px_rgba(2,44,34,0.50)] [-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [-webkit-mask-composite:xor] [mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] [mask-composite:exclude]";

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

function isRelatedHabitDueLabel(value: string | null | undefined): boolean {
  return value === "DUE" || value === "OVERDUE";
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
    memoCaptureConfig: habit.memoCaptureConfig ?? null,
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
      today.getTime() - overdueStartMs >=
        RELATED_HABIT_OVERDUE_VISUAL_THRESHOLD_MS;

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

function wasRelatedHabitCompletedOnDate(
  habit: Pick<HabitSummary, "lastCompletedAt">,
  dateKey: string,
  timeZone: string
): boolean {
  const lastCompletedAt = parseOptionalDate(habit.lastCompletedAt);
  if (!lastCompletedAt) return false;

  return formatDateKeyInTimeZone(lastCompletedAt, timeZone) === dateKey;
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
  if (normalized === "SYNC" || normalized === "MEMO") return "habit-card--sync-gray";
  if (normalized === "PRACTICE") {
    return "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
  }
  if (normalized === "RELAXER") {
    return "!bg-[radial-gradient(circle_at_8%_-18%,rgba(6,95,70,0.34),transparent_60%),linear-gradient(138deg,rgba(3,24,18,0.98)_0%,rgba(5,68,51,0.94)_48%,rgba(6,95,70,0.74)_100%)]";
  }
  return "!bg-[radial-gradient(circle_at_0%_0%,rgba(82,82,91,0.2),transparent_58%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(20,20,23,0.96)_48%,rgba(50,50,57,0.72)_100%)]";
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC" || normalized === "MEMO") return "border-zinc-300/35";
  if (normalized === "PRACTICE") return "border-slate-500/50";
  if (normalized === "RELAXER") return "border-emerald-200/60";
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

function readNumber(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;

  return Number.isFinite(numeric) ? numeric : null;
}

function formatHabitRecord(
  habit: unknown,
  skillIconById: Map<string, string | null>,
  routineById: Map<string, RoutineMetadata>
): HabitSummary | null {
  if (!habit || typeof habit !== "object") return null;
  const habitRecord = habit as Record<string, unknown>;
  const habitId = readString(habitRecord.id);
  if (!habitId) return null;

  const skillId = readString(habitRecord.skill_id);
  const routineId = readString(habitRecord.routine_id);
  const routine = routineId ? routineById.get(routineId) ?? null : null;
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
    memoCaptureConfig:
      (habitRecord.memo_capture_config as HabitSummary["memoCaptureConfig"]) ??
      null,
    skillId,
    skillIcon: skillId ? skillIconById.get(skillId) ?? null : null,
    routineId,
    routineName: routine?.name ?? null,
    routineDescription: routine?.description ?? null,
    routineIcon: routine?.icon ?? null,
    routinePosition: readNumber(habitRecord.routine_position),
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

function formatRoutineRecord(routine: unknown): RoutineMetadata | null {
  if (!routine || typeof routine !== "object") return null;
  const routineRecord = routine as Record<string, unknown>;
  const routineId = readString(routineRecord.id);
  if (!routineId) return null;

  return {
    id: routineId,
    name: readString(routineRecord.name),
    description: readString(routineRecord.description),
    icon:
      readString(routineRecord.icon) ??
      readString(routineRecord.emoji) ??
      readString(routineRecord.icon_emoji),
  };
}

async function fetchRoutineMetadataById(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string,
  routineIds: string[]
): Promise<Map<string, RoutineMetadata>> {
  const uniqueRoutineIds = Array.from(new Set(routineIds.filter(Boolean)));
  if (uniqueRoutineIds.length === 0) return new Map();

  const selectColumns = [
    "id, name, description, icon, emoji, icon_emoji",
    "id, name, description, icon, emoji",
    "id, name, description, icon",
    "id, name, description, emoji",
    "id, name, description",
  ];

  let data: unknown[] | null = null;

  for (const columns of selectColumns) {
    const { data: routinesData, error } = await supabase
      .from("habit_routines")
      .select(columns)
      .eq("user_id", userId)
      .in("id", uniqueRoutineIds);

    if (!error) {
      data = routinesData ?? [];
      break;
    }
  }

  return new Map(
    (data ?? [])
      .map(formatRoutineRecord)
      .filter((routine): routine is RoutineMetadata => routine !== null)
      .map((routine) => [routine.id, routine])
  );
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
  const [restoreRoutineDrawerId, setRestoreRoutineDrawerId] = useState<
    string | null
  >(null);
  const [newRoutineHabitReveal, setNewRoutineHabitReveal] = useState<{
    routineId: string;
    habitId: string;
  } | null>(null);
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
  const [pendingCompletedRelatedHabitIds, setPendingCompletedRelatedHabitIds] =
    useState<Set<string>>(() => new Set());
  const [
    collapsingCompletedRelatedHabitIds,
    setCollapsingCompletedRelatedHabitIds,
  ] = useState<Set<string>>(() => new Set());
  const [memoCompletionState, setMemoCompletionState] =
    useState<HabitSummary | null>(null);
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
  const pendingCompletedRelatedHabitIdsRef = useRef<Set<string>>(new Set());
  const collapsingCompletedRelatedHabitIdsRef = useRef<Set<string>>(new Set());
  const pendingCompletedRelatedHabitMoveTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const collapsingCompletedRelatedHabitTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
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
  const loadedRelatedHabitsMonumentIdRef = useRef<string | null>(null);
  const relatedHabitGridClass =
    relatedHabitCardDensity === "small"
      ? RELATED_HABIT_SMALL_GRID_CLASS
      : RELATED_HABIT_GRID_CLASS;
  const relatedHabitPageGridClass =
    relatedHabitCardDensity === "small"
      ? RELATED_HABIT_SMALL_PAGE_GRID_CLASS
      : RELATED_HABIT_PAGE_GRID_CLASS;
  const isSmallRelatedHabitDensity = relatedHabitCardDensity === "small";
  const relatedHabitPagerRef = useRef<HTMLDivElement | null>(null);
  const relatedHabitPagePanelRefs = useRef<Record<string, HTMLDivElement | null>>(
    {}
  );
  const activeRelatedHabitPageIndexRef = useRef(0);
  const [activeRelatedHabitPageIndex, setActiveRelatedHabitPageIndex] =
    useState(0);
  const [relatedHabitPageHeight, setRelatedHabitPageHeight] = useState<
    number | null
  >(null);
  const [relatedHabitPagerViewportWidth, setRelatedHabitPagerViewportWidth] =
    useState(0);
  const [relatedHabitPageDragOffset, setRelatedHabitPageDragOffset] =
    useState(0);
  const relatedHabitPageWheelLockedRef = useRef(false);
  const relatedHabitPageWheelCooldownRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const relatedHabitPageDragStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const relatedHabitPageTouchRef = useRef<{
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    axis: RelatedHabitPageSwipeAxis;
    width: number;
  } | null>(null);
  const handleRelatedHabitDensityToggle = useCallback(() => {
    setRelatedHabitCardDensity((currentDensity) =>
      currentDensity === "large" ? "small" : "large"
    );
  }, []);
  const handleRoutineAddHabit = useCallback(
    (routine: RelatedRoutineCardRoutine) => {
      fabCreation?.requestHabitCreation(
        null,
        {
          routineId: routine.id,
        },
        { preserveDrawer: { type: "routine", id: routine.id } }
      );
    },
    [fabCreation]
  );
  const clearPendingCompletedRelatedHabitMove = useCallback(
    (habitId: string) => {
      const pendingTimer =
        pendingCompletedRelatedHabitMoveTimersRef.current.get(habitId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingCompletedRelatedHabitMoveTimersRef.current.delete(habitId);
      }

      const collapsingTimer =
        collapsingCompletedRelatedHabitTimersRef.current.get(habitId);
      if (collapsingTimer) {
        clearTimeout(collapsingTimer);
        collapsingCompletedRelatedHabitTimersRef.current.delete(habitId);
      }

      setPendingCompletedRelatedHabitIds((current) => {
        if (!current.has(habitId)) return current;

        const next = new Set(current);
        next.delete(habitId);
        pendingCompletedRelatedHabitIdsRef.current = next;
        return next;
      });
      setCollapsingCompletedRelatedHabitIds((current) => {
        if (!current.has(habitId)) return current;

        const next = new Set(current);
        next.delete(habitId);
        collapsingCompletedRelatedHabitIdsRef.current = next;
        return next;
      });
    },
    []
  );
  const clearAllPendingCompletedRelatedHabitMoves = useCallback(() => {
    for (const timer of pendingCompletedRelatedHabitMoveTimersRef.current.values()) {
      clearTimeout(timer);
    }
    for (const timer of collapsingCompletedRelatedHabitTimersRef.current.values()) {
      clearTimeout(timer);
    }
    pendingCompletedRelatedHabitMoveTimersRef.current.clear();
    collapsingCompletedRelatedHabitTimersRef.current.clear();
    pendingCompletedRelatedHabitIdsRef.current = new Set();
    collapsingCompletedRelatedHabitIdsRef.current = new Set();
    setPendingCompletedRelatedHabitIds(new Set());
    setCollapsingCompletedRelatedHabitIds(new Set());
  }, []);
  const schedulePendingCompletedRelatedHabitMove = useCallback(
    (habitId: string) => {
      const existingPendingTimer =
        pendingCompletedRelatedHabitMoveTimersRef.current.get(habitId);
      if (existingPendingTimer) {
        clearTimeout(existingPendingTimer);
        pendingCompletedRelatedHabitMoveTimersRef.current.delete(habitId);
      }

      const existingCollapsingTimer =
        collapsingCompletedRelatedHabitTimersRef.current.get(habitId);
      if (existingCollapsingTimer) {
        clearTimeout(existingCollapsingTimer);
        collapsingCompletedRelatedHabitTimersRef.current.delete(habitId);
      }

      setCollapsingCompletedRelatedHabitIds((current) => {
        if (!current.has(habitId)) return current;

        const next = new Set(current);
        next.delete(habitId);
        collapsingCompletedRelatedHabitIdsRef.current = next;
        return next;
      });
      setPendingCompletedRelatedHabitIds((current) => {
        if (current.has(habitId)) return current;

        const next = new Set(current);
        next.add(habitId);
        pendingCompletedRelatedHabitIdsRef.current = next;
        return next;
      });

      const pendingTimer = setTimeout(() => {
        pendingCompletedRelatedHabitMoveTimersRef.current.delete(habitId);
        setPendingCompletedRelatedHabitIds((current) => {
          if (!current.has(habitId)) return current;

          const next = new Set(current);
          next.delete(habitId);
          pendingCompletedRelatedHabitIdsRef.current = next;
          return next;
        });
      }, RELATED_HABIT_COMPLETED_MOVE_DELAY_MS);

      pendingCompletedRelatedHabitMoveTimersRef.current.set(
        habitId,
        pendingTimer
      );
    },
    []
  );
  const pendingRelatedHabitActionsRef = useRef(
    new Map<string, { action: "complete" | "undo"; dateKey: string }>()
  );
  const bypassMemoCaptureRef = useRef(false);
  const completionStateDateKeyRef = useRef<string | null>(null);
  const isRelatedHabitCompletedForCurrentDay = useCallback(
    (habit: Pick<HabitSummary, "id" | "lastCompletedAt">) =>
      completedRelatedHabitIds.has(habit.id) ||
      wasRelatedHabitCompletedOnDate(habit, currentDateKey, timeZone),
    [completedRelatedHabitIds, currentDateKey, timeZone]
  );
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
  const standaloneDecoratedHabits = useMemo(
    () => decoratedHabits.filter((habit) => !habit.routineId),
    [decoratedHabits]
  );
  const relatedRoutines = useMemo<DecoratedRelatedRoutine[]>(() => {
    const routineMap = new Map<string, DecoratedRelatedRoutine>();

    for (const habit of decoratedHabits) {
      if (!habit.routineId) continue;

      const existing = routineMap.get(habit.routineId);
      const isCompletedToday = isRelatedHabitCompletedForCurrentDay(habit);
      const routineHabit = {
        id: habit.id,
        name: habit.name,
        dueLabel: isCompletedToday ? "COMPLETE" : habit.dueLabel,
        skillIcon: habit.skillIcon,
        completed: isCompletedToday,
        pending: pendingRelatedHabitIds.has(habit.id),
        routinePosition: habit.routinePosition,
        currentStreakDays: habit.currentStreakDays,
      };

      if (existing) {
        existing.habits.push(routineHabit);
        existing.dueRank = Math.min(existing.dueRank, habit.dueRank);
        existing.typeRank = Math.min(
          existing.typeRank,
          getHabitTypePriority(habit.habitType)
        );
        continue;
      }

      const routineName = habit.routineName ?? "Untitled routine";
      routineMap.set(habit.routineId, {
        id: habit.routineId,
        name: routineName,
        description: habit.routineDescription,
        icon: habit.routineIcon,
        habits: [routineHabit],
        dueRank: habit.dueRank,
        typeRank: getHabitTypePriority(habit.habitType),
        sortName: routineName,
      });
    }

    return Array.from(routineMap.values()).sort((first, second) =>
      first.name.localeCompare(second.name, undefined, { sensitivity: "base" })
    );
  }, [
    decoratedHabits,
    isRelatedHabitCompletedForCurrentDay,
    pendingRelatedHabitIds,
  ]);
  const relatedHabitPages = useMemo(() => {
    const sortRelatedHabitPageItems = (
      first: RelatedHabitPageItem,
      second: RelatedHabitPageItem
    ) => {
      const firstDueRank =
        first.kind === "routine" ? first.routine.dueRank : first.habit.dueRank;
      const secondDueRank =
        second.kind === "routine"
          ? second.routine.dueRank
          : second.habit.dueRank;
      if (firstDueRank !== secondDueRank) {
        return firstDueRank - secondDueRank;
      }

      const firstTypeRank =
        first.kind === "routine"
          ? first.routine.typeRank
          : getHabitTypePriority(first.habit.habitType);
      const secondTypeRank =
        second.kind === "routine"
          ? second.routine.typeRank
          : getHabitTypePriority(second.habit.habitType);
      if (firstTypeRank !== secondTypeRank) {
        return firstTypeRank - secondTypeRank;
      }

      const firstName =
        first.kind === "routine" ? first.routine.sortName : first.habit.name;
      const secondName =
        second.kind === "routine" ? second.routine.sortName : second.habit.name;
      return firstName.localeCompare(secondName, undefined, {
        sensitivity: "base",
      });
    };

    const isStandaloneHabitDue = (
      habit: (typeof standaloneDecoratedHabits)[number]
    ) => {
      const isCompletedToday =
        isRelatedHabitCompletedForCurrentDay(habit) ||
        pendingCompletedRelatedHabitIds.has(habit.id) ||
        collapsingCompletedRelatedHabitIds.has(habit.id);

      return isCompletedToday || isRelatedHabitDueLabel(habit.dueLabel);
    };
    const isRoutineHabitDuePanel = (
      habit: RelatedRoutineCardRoutine["habits"][number]
    ) => Boolean(habit.completed) || isRelatedHabitDueLabel(habit.dueLabel);
    const isRoutineHabitNotDuePanel = (
      habit: RelatedRoutineCardRoutine["habits"][number]
    ) => !habit.completed && !isRelatedHabitDueLabel(habit.dueLabel);

    const dueRoutineItems = relatedRoutines
      .map((routine) => ({
        ...routine,
        habits: routine.habits.filter(isRoutineHabitDuePanel),
      }))
      .filter((routine) => routine.habits.length > 0)
      .map((routine) => ({
        kind: "routine" as const,
        routine,
      }));
    const notDueRoutineItems = relatedRoutines
      .map((routine) => ({
        ...routine,
        habits: routine.habits.filter(isRoutineHabitNotDuePanel),
      }))
      .filter((routine) => routine.habits.length > 0)
      .map((routine) => ({
        kind: "routine" as const,
        routine,
      }));
    const dueHabitItems = standaloneDecoratedHabits
      .filter(isStandaloneHabitDue)
      .map((habit) => ({
        kind: "habit" as const,
        habit,
      }));
    const notDueHabitItems = standaloneDecoratedHabits
      .filter(
        (habit) =>
          !isStandaloneHabitDue(habit) &&
          !isRelatedHabitCompletedForCurrentDay(habit) &&
          !pendingCompletedRelatedHabitIds.has(habit.id) &&
          !collapsingCompletedRelatedHabitIds.has(habit.id)
      )
      .map((habit) => ({
        kind: "habit" as const,
        habit,
      }));

    return [
      {
        id: "due",
        label: "Due",
        ariaLabel: "Show due habits",
        items: [...dueRoutineItems, ...dueHabitItems].sort(
          sortRelatedHabitPageItems
        ),
      },
      {
        id: "not-due-completed",
        label: "Not due / Completed",
        ariaLabel: "Show not due and completed habits",
        items: [...notDueRoutineItems, ...notDueHabitItems].sort(
          sortRelatedHabitPageItems
        ),
      },
    ].filter((page) => page.items.length > 0);
  }, [
    collapsingCompletedRelatedHabitIds,
    isRelatedHabitCompletedForCurrentDay,
    pendingCompletedRelatedHabitIds,
    relatedRoutines,
    standaloneDecoratedHabits,
  ]);
  const relatedHabitPageBaseTransform =
    relatedHabitPagerViewportWidth > 0
      ? -activeRelatedHabitPageIndex * relatedHabitPagerViewportWidth
      : 0;
  const relatedHabitPageTrackTransform =
    relatedHabitPages.length > 0 && relatedHabitPagerViewportWidth > 0
      ? Math.max(
          -(relatedHabitPages.length - 1) * relatedHabitPagerViewportWidth,
          Math.min(
            0,
            relatedHabitPageBaseTransform + relatedHabitPageDragOffset
          )
        )
      : 0;
  const getRelatedHabitPageHeight = useCallback(
    (index: number) => {
      if (relatedHabitPages.length === 0) return;

      const bounded = Math.max(
        0,
        Math.min(index, relatedHabitPages.length - 1)
      );
      const page = relatedHabitPages[bounded];
      const panelElement = page
        ? relatedHabitPagePanelRefs.current[page.id]
        : null;

      return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
    },
    [relatedHabitPages]
  );

  const handleRelatedHabitPageChange = useCallback(
    (index: number) => {
      if (relatedHabitPages.length === 0) return;

      const bounded = Math.max(
        0,
        Math.min(index, relatedHabitPages.length - 1)
      );
      const nextHeight = getRelatedHabitPageHeight(bounded);
      if (nextHeight) {
        setRelatedHabitPageHeight(nextHeight);
      }
      setRelatedHabitPageDragOffset(0);
      activeRelatedHabitPageIndexRef.current = bounded;
      setActiveRelatedHabitPageIndex((current) =>
        current === bounded ? current : bounded
      );
    },
    [getRelatedHabitPageHeight, relatedHabitPages.length]
  );

  const measureActiveRelatedHabitPage = useCallback(() => {
    const nextHeight = getRelatedHabitPageHeight(activeRelatedHabitPageIndex);
    if (!nextHeight) return;

    setRelatedHabitPageHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [activeRelatedHabitPageIndex, getRelatedHabitPageHeight]);

  useLayoutEffect(() => {
    if (relatedHabitPages.length === 0) {
      activeRelatedHabitPageIndexRef.current = 0;
      setActiveRelatedHabitPageIndex(0);
      setRelatedHabitPageHeight(null);
      return;
    }

    if (activeRelatedHabitPageIndexRef.current >= relatedHabitPages.length) {
      handleRelatedHabitPageChange(relatedHabitPages.length - 1);
      return;
    }

    measureActiveRelatedHabitPage();
  }, [
    handleRelatedHabitPageChange,
    measureActiveRelatedHabitPage,
    relatedHabitPages.length,
  ]);

  useLayoutEffect(() => {
    const viewportElement = relatedHabitPagerRef.current;
    if (!viewportElement) return;

    const measureViewportWidth = () => {
      setRelatedHabitPagerViewportWidth(viewportElement.clientWidth);
    };

    measureViewportWidth();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureViewportWidth);
    resizeObserver?.observe(viewportElement);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureViewportWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewportWidth);
    };
  }, []);

  useLayoutEffect(() => {
    measureActiveRelatedHabitPage();
  }, [
    activeRelatedHabitPageIndex,
    collapsingCompletedRelatedHabitIds,
    completedRelatedHabitIds,
    isSmallRelatedHabitDensity,
    measureActiveRelatedHabitPage,
    pendingCompletedRelatedHabitIds,
    pendingRelatedHabitIds,
    relatedHabitPages,
  ]);

  useEffect(() => {
    if (relatedHabitPages.length === 0) return;

    const activePage = relatedHabitPages[activeRelatedHabitPageIndex];
    const activePanel = activePage
      ? relatedHabitPagePanelRefs.current[activePage.id]
      : null;

    if (!activePanel) return;

    measureActiveRelatedHabitPage();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureActiveRelatedHabitPage();
          });
    resizeObserver?.observe(activePanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureActiveRelatedHabitPage);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureActiveRelatedHabitPage);
    };
  }, [
    activeRelatedHabitPageIndex,
    measureActiveRelatedHabitPage,
    relatedHabitPages,
  ]);

  const handleRelatedHabitPagerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "pen" && event.pointerType !== "mouse") {
        return;
      }
      relatedHabitPageDragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    []
  );

  const handleRelatedHabitPagerPointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = relatedHabitPageDragStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      relatedHabitPageDragStartRef.current = null;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const horizontalDistance = Math.abs(deltaX);

      if (
        horizontalDistance < 48 ||
        horizontalDistance < Math.abs(deltaY) * 1.35
      ) {
        return;
      }

      handleRelatedHabitPageChange(
        activeRelatedHabitPageIndex + (deltaX < 0 ? 1 : -1)
      );
    },
    [activeRelatedHabitPageIndex, handleRelatedHabitPageChange]
  );

  const resetRelatedHabitPageTouch = useCallback(() => {
    relatedHabitPageTouchRef.current = null;
    setRelatedHabitPageDragOffset(0);
  }, []);

  const handleRelatedHabitPagerTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        resetRelatedHabitPageTouch();
        return;
      }

      const touch = event.touches[0];
      relatedHabitPageTouchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        axis: null,
        width: event.currentTarget.clientWidth,
      };
      setRelatedHabitPageDragOffset(0);
    },
    [resetRelatedHabitPageTouch]
  );

  const handleRelatedHabitPagerTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const gesture = relatedHabitPageTouchRef.current;
      if (!gesture || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      gesture.deltaX = deltaX;
      gesture.deltaY = deltaY;

      if (!gesture.axis) {
        if (absX > 12 && absX > absY * 1.15) {
          gesture.axis = "horizontal";
        } else if (absY > 12 && absY > absX * 1.15) {
          gesture.axis = "vertical";
        } else {
          return;
        }
      }

      if (gesture.axis !== "horizontal") return;

      if (event.cancelable) {
        event.preventDefault();
      }

      const width = gesture.width || event.currentTarget.clientWidth || 1;
      const baseTransform = -activeRelatedHabitPageIndex * width;
      const minTransform = -(relatedHabitPages.length - 1) * width;
      const nextTransform = Math.max(
        minTransform,
        Math.min(0, baseTransform + deltaX)
      );
      setRelatedHabitPageDragOffset(nextTransform - baseTransform);
    },
    [activeRelatedHabitPageIndex, relatedHabitPages.length]
  );

  const handleRelatedHabitPagerTouchEnd = useCallback(() => {
    const gesture = relatedHabitPageTouchRef.current;
    if (!gesture) return;

    relatedHabitPageTouchRef.current = null;
    setRelatedHabitPageDragOffset(0);

    if (gesture.axis !== "horizontal") return;

    const horizontalDistance = Math.abs(gesture.deltaX);
    const releaseThreshold = Math.min(45, Math.max(28, gesture.width * 0.2));
    if (
      horizontalDistance < releaseThreshold ||
      horizontalDistance < Math.abs(gesture.deltaY) * 1.15
    ) {
      return;
    }

    handleRelatedHabitPageChange(
      activeRelatedHabitPageIndex + (gesture.deltaX < 0 ? 1 : -1)
    );
  }, [activeRelatedHabitPageIndex, handleRelatedHabitPageChange]);

  const handleRelatedHabitPagerWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const horizontalDistance = Math.abs(event.deltaX);
      if (
        horizontalDistance < 28 ||
        horizontalDistance <= Math.abs(event.deltaY)
      ) {
        return;
      }

      const nextIndex =
        activeRelatedHabitPageIndex + (event.deltaX > 0 ? 1 : -1);
      if (
        nextIndex === activeRelatedHabitPageIndex ||
        nextIndex < 0 ||
        nextIndex >= relatedHabitPages.length ||
        relatedHabitPageWheelLockedRef.current
      ) {
        return;
      }

      event.preventDefault();
      relatedHabitPageWheelLockedRef.current = true;
      handleRelatedHabitPageChange(nextIndex);

      if (relatedHabitPageWheelCooldownRef.current) {
        clearTimeout(relatedHabitPageWheelCooldownRef.current);
      }
      relatedHabitPageWheelCooldownRef.current = setTimeout(() => {
        relatedHabitPageWheelLockedRef.current = false;
        relatedHabitPageWheelCooldownRef.current = null;
      }, 650);
    },
    [
      activeRelatedHabitPageIndex,
      handleRelatedHabitPageChange,
      relatedHabitPages.length,
    ]
  );

  useEffect(() => {
    return () => {
      if (relatedHabitPageWheelCooldownRef.current) {
        clearTimeout(relatedHabitPageWheelCooldownRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const pendingMoveTimers =
      pendingCompletedRelatedHabitMoveTimersRef.current;
    const collapsingTimers = collapsingCompletedRelatedHabitTimersRef.current;

    return () => {
      for (const timer of pendingMoveTimers.values()) {
        clearTimeout(timer);
      }
      for (const timer of collapsingTimers.values()) {
        clearTimeout(timer);
      }
      pendingMoveTimers.clear();
      collapsingTimers.clear();
      pendingCompletedRelatedHabitIdsRef.current = new Set();
      collapsingCompletedRelatedHabitIdsRef.current = new Set();
    };
  }, []);

  useEffect(() => {
    const relatedHabitIds = new Set(relatedHabits.map((habit) => habit.id));
    const movingHabitIds = new Set([
      ...pendingCompletedRelatedHabitIdsRef.current,
      ...collapsingCompletedRelatedHabitIdsRef.current,
    ]);

    for (const habitId of movingHabitIds) {
      if (
        !relatedHabitIds.has(habitId) ||
        !completedRelatedHabitIds.has(habitId)
      ) {
        clearPendingCompletedRelatedHabitMove(habitId);
      }
    }
  }, [
    clearPendingCompletedRelatedHabitMove,
    completedRelatedHabitIds,
    relatedHabits,
  ]);

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
      const isPendingCompletedMove =
        pendingCompletedRelatedHabitIdsRef.current.has(habitId) ||
        collapsingCompletedRelatedHabitIdsRef.current.has(habitId);

      if (
        !currentUserId ||
        (pendingRelatedHabitIds.has(habitId) && !isPendingCompletedMove)
      ) {
        return;
      }

      const habitBeforeUpdate =
        relatedHabits.find((habit) => habit.id === habitId) ?? null;
      if (!habitBeforeUpdate) {
        return;
      }

      const wasCompleted =
        isRelatedHabitCompletedForCurrentDay(habitBeforeUpdate);
      const action = wasCompleted ? "undo" : "complete";
      const completedAt = new Date().toISOString();
      const shouldDelayCompletedMove =
        action === "complete" &&
        !habitBeforeUpdate.routineId &&
        isRelatedHabitDueLabel(
          computeHabitDueStatus(habitBeforeUpdate, timeZone).label
        );

      if (
        !bypassMemoCaptureRef.current &&
        action === "complete" &&
        normalizeRelatedHabitType(habitBeforeUpdate.habitType) === "MEMO"
      ) {
        setMemoCompletionState(habitBeforeUpdate);
        return;
      }

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
      if (shouldDelayCompletedMove) {
        schedulePendingCompletedRelatedHabitMove(habitId);
      } else if (action === "undo") {
        clearPendingCompletedRelatedHabitMove(habitId);
      }

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
        setRefreshVersion((current) => current + 1);
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
          clearPendingCompletedRelatedHabitMove(habitId);
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
      clearPendingCompletedRelatedHabitMove,
      currentDateKey,
      currentUserId,
      isRelatedHabitCompletedForCurrentDay,
      pendingRelatedHabitIds,
      relatedHabits,
      schedulePendingCompletedRelatedHabitMove,
      timeZone,
      toast,
    ]
  );

  const handleMemoCompletionSubmitted = useCallback(async () => {
    if (!memoCompletionState) return;

    bypassMemoCaptureRef.current = true;
    try {
      await handleRelatedHabitCompletionToggle(memoCompletionState.id);
      setMemoCompletionState(null);
    } finally {
      bypassMemoCaptureRef.current = false;
    }
  }, [handleRelatedHabitCompletionToggle, memoCompletionState]);

  const handleRoutineHabitCompletionToggle = useCallback(
    (habitId: string) => {
      return handleRelatedHabitCompletionToggle(habitId);
    },
    [handleRelatedHabitCompletionToggle]
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
          habitSnapshot: {
            name: habit.name,
            habitType: habit.habitType,
            recurrence: habit.recurrence,
            skillId: habit.skillId,
            routineId: habit.routineId,
          },
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
    setRestoreRoutineDrawerId(null);
  }, [monumentId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          entityType?: string;
          entityId?: string;
          action?: string;
          routineId?: string | null;
          preserveDrawer?: {
            type?: string;
            id?: string;
          } | null;
        }>
      ).detail;
      if (detail?.entityType !== "HABIT" && detail?.entityType !== "ROUTINE") {
        return;
      }

      if (
        detail.entityType === "HABIT" &&
        detail.action === "created" &&
        detail.preserveDrawer?.type === "routine"
      ) {
        const routineId = detail.routineId ?? detail.preserveDrawer.id;
        if (routineId && detail.entityId) {
          setRestoreRoutineDrawerId(routineId);
          setNewRoutineHabitReveal({
            routineId,
            habitId: detail.entityId,
          });
        }
      }

      setRefreshVersion((current) => current + 1);
    };

    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);
    return () => {
      window.removeEventListener("creator:entity-saved", handleCreatorEntitySaved);
    };
  }, []);

  const handleNewRoutineHabitRevealComplete = useCallback(
    (routineId: string, habitId: string) => {
      setNewRoutineHabitReveal((current) =>
        current?.routineId === routineId && current.habitId === habitId
          ? null
          : current
      );
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadRelatedHabits = async () => {
      const shouldPreserveRelatedHabitState =
        loadedRelatedHabitsMonumentIdRef.current === monumentId;

      if (!supabase || !monumentId) {
        loadedRelatedHabitsMonumentIdRef.current = null;
        setRelatedHabits([]);
        setHabitsLoading(false);
        setCompletionLoading(false);
        return;
      }

      setHabitsError(null);
      setCompletionError(null);
      setCompletionLoading(false);

      if (!shouldPreserveRelatedHabitState) {
        setHabitsLoading(true);
        setRelatedHabits([]);
        setCompletedRelatedHabitIds(new Set());
        setPendingRelatedHabitIds(new Set());
        previousRelatedHabitStateRef.current.clear();
        pendingRelatedHabitActionsRef.current.clear();
        clearAllPendingCompletedRelatedHabitMoves();
      }

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
            loadedRelatedHabitsMonumentIdRef.current = monumentId;
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
            loadedRelatedHabitsMonumentIdRef.current = monumentId;
            setRelatedHabits([]);
          }
          return;
        }

        const { data: habitsData, error: habitsError } = await supabase
          .from("habits")
          .select(
            "id, name, created_at, updated_at, last_completed_at, current_streak_days, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, next_due_override, habit_type, memo_capture_config, skill_id, routine_id, routine_position"
          )
          .eq("user_id", userId)
          .is("circle_id", null)
          .in("skill_id", skillIds)
          .order("name", { ascending: true });

        if (habitsError) {
          throw habitsError;
        }

        if (!cancelled) {
          const routineIds = (habitsData ?? [])
            .map((habit) =>
              habit && typeof habit === "object"
                ? readString((habit as Record<string, unknown>).routine_id)
                : null
            )
            .filter((routineId): routineId is string => routineId !== null);
          const routineById = await fetchRoutineMetadataById(
            supabase,
            userId,
            routineIds
          );
          if (cancelled) return;

          const formattedHabits = (habitsData ?? [])
            .map((habit) =>
              formatHabitRecord(habit, skillIconById, routineById)
            )
            .filter((habit): habit is HabitSummary => habit !== null);
          loadedRelatedHabitsMonumentIdRef.current = monumentId;
          setCompletionLoading(
            shouldPreserveRelatedHabitState ? false : formattedHabits.length > 0
          );
          setRelatedHabits(formattedHabits);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error fetching monument related habits:", err);
          if (!shouldPreserveRelatedHabitState) {
            setRelatedHabits([]);
          }
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
  }, [
    clearAllPendingCompletedRelatedHabitMoves,
    monumentId,
    refreshVersion,
    supabase,
  ]);

  useEffect(() => {
    if (habitsLoading || !restoreRoutineDrawerId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRestoreRoutineDrawerId(null);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [habitsLoading, restoreRoutineDrawerId]);

  return (
    <>
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
              {standaloneDecoratedHabits.length + relatedRoutines.length}
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
        {habitsLoading || (completionLoading && relatedHabits.length === 0) ? (
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
          <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/80 px-4 py-3 text-xs text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            no habits related to this monument yet
          </p>
        ) : (
          <div className="space-y-2">
            {completionError ? (
              <p className="text-xs text-white/60">{completionError}</p>
            ) : null}
            <div
              ref={relatedHabitPagerRef}
              className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={
                relatedHabitPageHeight
                  ? { height: relatedHabitPageHeight }
                  : undefined
              }
              onPointerDown={handleRelatedHabitPagerPointerDown}
              onPointerUp={handleRelatedHabitPagerPointerEnd}
              onTouchStart={handleRelatedHabitPagerTouchStart}
              onTouchMove={handleRelatedHabitPagerTouchMove}
              onTouchEnd={handleRelatedHabitPagerTouchEnd}
              onTouchCancel={resetRelatedHabitPageTouch}
              onWheel={handleRelatedHabitPagerWheel}
              onPointerCancel={() => {
                relatedHabitPageDragStartRef.current = null;
              }}
            >
              <div className="absolute inset-0">
                <div
                  className="flex h-full w-full transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    transform:
                      relatedHabitPagerViewportWidth > 0
                        ? `translate3d(${relatedHabitPageTrackTransform}px, 0, 0)`
                        : `translate3d(${
                            -activeRelatedHabitPageIndex * 100
                          }%, 0, 0)`,
                    transitionDuration: relatedHabitPageDragOffset
                      ? "0ms"
                      : undefined,
                  }}
                >
                  {relatedHabitPages.map((page) => (
                    <div
                      key={page.id}
                      className="h-full w-full min-w-full shrink-0 overflow-hidden"
                    >
                      <div
                        ref={(element) => {
                          relatedHabitPagePanelRefs.current[page.id] = element;
                        }}
                        className={relatedHabitPageGridClass}
                      >
                        {page.items.map((item) => {
                          if (item.kind === "routine") {
                            return (
                              <RelatedRoutineCard
                                key={`${page.id}-routine-${item.routine.id}`}
                                routine={item.routine}
                                density={relatedHabitCardDensity}
                                onHabitCompletionToggle={
                                  handleRoutineHabitCompletionToggle
                                }
                                onAddHabit={handleRoutineAddHabit}
                                restoreOpen={
                                  restoreRoutineDrawerId === item.routine.id
                                }
                                newHabitRevealId={
                                  newRoutineHabitReveal?.routineId ===
                                  item.routine.id
                                    ? newRoutineHabitReveal.habitId
                                    : null
                                }
                                onNewHabitRevealComplete={(habitId) =>
                                  handleNewRoutineHabitRevealComplete(
                                    item.routine.id,
                                    habitId
                                  )
                                }
                              />
                            );
                          }

                          const habit = item.habit;
                          const isPendingCompletedMove =
                            pendingCompletedRelatedHabitIds.has(habit.id) ||
                            collapsingCompletedRelatedHabitIds.has(habit.id);
                          const isCollapsingCompletedMove =
                            collapsingCompletedRelatedHabitIds.has(habit.id);
                          const isHabitCompletedToday =
                            isRelatedHabitCompletedForCurrentDay(habit) ||
                            isPendingCompletedMove;
                          const isHabitPending =
                            pendingRelatedHabitIds.has(habit.id) &&
                            !isPendingCompletedMove;
                          const streakDays = habit.currentStreakDays ?? 0;
                          const showStreakBadge = streakDays >= 2;
                          const streakLabel = `${streakDays}x`;
                          const habitSkillIcon = habit.skillIcon || "💡";
                          const isHabitOverdue = habit.dueLabel === "OVERDUE";
                          const habitPillLabel = isHabitCompletedToday
                            ? "COMPLETE"
                            : habit.dueLabel;
                          const habitStateBorderClass =
                            !isHabitCompletedToday && isHabitOverdue
                              ? "related-habit-due-border"
                              : null;
                          const habitPillClass = isHabitCompletedToday
                            ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
                            : isHabitOverdue
                              ? "border-rose-200/20 bg-rose-950/35 text-rose-100/85"
                              : "border-white/10 bg-white/[0.06] text-white/65";

                          const habitCard = (
                            <div
                              key={`${page.id}-habit-${habit.id}`}
                              className={clsx(
                                "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col text-white transition duration-200 select-none",
                                isSmallRelatedHabitDensity
                                  ? "min-h-[70px] rounded-xl p-1.5 sm:min-h-[82px] sm:p-2"
                                  : "min-h-[96px] rounded-2xl p-3 sm:p-4",
                                isHabitCompletedToday
                                  ? RELATED_HABIT_COMPLETED_CARD_CLASS
                                  : [
                                      getHabitCardTypeClass(
                                        habit.normalizedHabitType
                                      ),
                                      getHabitCardBorderClass(
                                        habit.normalizedHabitType
                                      ),
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
                              draggable={false}
                              style={{
                                userSelect: "none",
                                WebkitUserSelect: "none",
                                WebkitTouchCallout: "none",
                                WebkitTapHighlightColor: "transparent",
                              }}
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
                              onContextMenu={(event) => event.preventDefault()}
                              onDragStart={(event) => event.preventDefault()}
                            >
                              {isHabitCompletedToday ? (
                                <>
                                  <span
                                    className={RELATED_HABIT_COMPLETED_SHIMMER_CLASS}
                                    aria-hidden="true"
                                  />
                                  <span
                                    className={RELATED_HABIT_COMPLETED_FACET_CLASS}
                                    aria-hidden="true"
                                  />
                                </>
                              ) : null}
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
                                  <span className="tracking-normal">
                                    {streakLabel}
                                  </span>
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

                          if (!isPendingCompletedMove) {
                            return habitCard;
                          }

                          return (
                            <div
                              key={`${page.id}-habit-${habit.id}`}
                              className={clsx(
                                "grid transition-[grid-template-rows,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.33,0,0.2,1)]",
                                isCollapsingCompletedMove
                                  ? "pointer-events-none grid-rows-[0fr] overflow-hidden translate-y-2 opacity-0"
                                  : "grid-rows-[1fr] overflow-visible translate-y-0 opacity-100"
                              )}
                            >
                              <div
                                className={clsx(
                                  "min-h-0",
                                  isCollapsingCompletedMove
                                    ? "overflow-hidden"
                                    : "overflow-visible"
                                )}
                              >
                                {habitCard}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {relatedHabitPages.length > 1 ? (
              <div className="flex items-center justify-center gap-1.5 pt-1">
                {relatedHabitPages.map((page, index) => {
                  const isActive = index === activeRelatedHabitPageIndex;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      aria-label={page.ariaLabel}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => handleRelatedHabitPageChange(index)}
                      className={clsx(
                        "h-1.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                        isActive
                          ? "w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]"
                          : "w-1.5 bg-white/24 hover:bg-white/40"
                      )}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
    <MemoCompletionDialog
      open={Boolean(memoCompletionState)}
      context={
        memoCompletionState
          ? {
              habitId: memoCompletionState.id,
              habitName: memoCompletionState.name,
              habitType: memoCompletionState.habitType,
              skillId: memoCompletionState.skillId,
              skillIcon: memoCompletionState.skillIcon,
              memoCaptureConfig: memoCompletionState.memoCaptureConfig,
              completionDate: new Date().toISOString(),
            }
          : null
      }
      onOpenChange={(open) => {
        if (!open) setMemoCompletionState(null);
      }}
      onCompleted={handleMemoCompletionSubmitted}
    />
    </>
  );
}

export default MonumentRelatedHabits;
