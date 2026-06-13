"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent, PointerEvent, TouchEvent, WheelEvent } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CalendarDays,
  Grid2x2,
  Grid3x3,
  Target,
  Timer,
  MoreVertical,
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
import { useFabCreation } from "@/components/ui/FabCreationContext";
import { MemoCompletionDialog } from "@/components/schedule/MemoCompletionDialog";
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
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
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
import { backfillSkillStarterNote } from "@/lib/skillStarterNotes";
import type { Database } from "@/types/supabase";

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
  memoCaptureConfig: Database["public"]["Tables"]["habits"]["Row"]["memo_capture_config"];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RELATED_HABIT_OVERDUE_VISUAL_THRESHOLD_MS = MS_PER_DAY * 7;
const MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const NO_DUE_MATCH_RANK = MAX_LOOKAHEAD_DAYS + 1;
const RELATED_HABIT_DOUBLE_TAP_MS = 350;
const RELATED_HABIT_LONG_PRESS_MS = 300;
const RELATED_HABIT_LONG_PRESS_SUPPRESS_MS = 1_000;
const PULL_EXIT_THRESHOLD_PX = 56;
const SKILL_OPEN_PREVIEW_PREFIX = "creator.skillOpenPreview.";
const SKILL_OPEN_PREVIEW_MAX_AGE_MS = 5_000;

type SkillOpenPreview = {
  id: string;
  name: string;
  icon: string | null;
  timestamp: number;
};

function isInteractivePullTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "a,button,input,select,textarea,[role='button'],[role='menuitem']"
      )
    )
  );
}

function isWindowAtTop() {
  return window.scrollY <= 2;
}

type HabitDueStatus = {
  label: string;
  rank: number;
};
type RelatedHabitCardDensity = "large" | "small";
type RelatedHabitPageSwipeAxis = "horizontal" | "vertical" | null;

const RELATED_HABIT_GRID_CLASS =
  "-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const RELATED_HABIT_SMALL_GRID_CLASS =
  "-mx-2 grid grid-cols-4 gap-1.5 px-2 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";
const RELATED_HABIT_PAGE_GRID_CLASS =
  "grid grid-cols-3 gap-2.5 pb-8 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const RELATED_HABIT_SMALL_PAGE_GRID_CLASS =
  "grid grid-cols-4 gap-1.5 pb-8 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7";

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
  const [skillOpenPreview, setSkillOpenPreview] =
    useState<SkillOpenPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SkillProgressData | null>(null);
  const [relatedHabits, setRelatedHabits] = useState<HabitSummary[]>([]);
  const [relatedHabitsRefreshVersion, setRelatedHabitsRefreshVersion] = useState(0);
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [habitsError, setHabitsError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [relatedHabitCardDensity, setRelatedHabitCardDensity] =
    useState<RelatedHabitCardDensity>("large");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [completedRelatedHabitIds, setCompletedRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [pendingRelatedHabitIds, setPendingRelatedHabitIds] = useState<
    Set<string>
  >(() => new Set());
  const [memoCompletionState, setMemoCompletionState] =
    useState<HabitSummary | null>(null);
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
  const fabCreation = useFabCreation();
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
  const relatedHabitLongPressTimerRef = useRef<number | null>(null);
  const relatedHabitSuppressCompletionUntilRef = useRef(0);
  const starterBackfillKeysRef = useRef<Set<string>>(new Set());
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
  const bypassMemoCaptureRef = useRef(false);
  const completionStateDateKeyRef = useRef<string | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullExitTriggeredRef = useRef(false);
  const pullPointerIdRef = useRef<number | null>(null);
  const pullExitBlocked =
    editDrawerOpen ||
    actionsMenuOpen ||
    deleteConfirmationOpen ||
    Boolean(focusPomoSource);
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
  const relatedHabitPages = useMemo(() => {
    const dueHabits = decoratedHabits.filter(
      (habit) => habit.dueLabel === "DUE" || habit.dueLabel === "OVERDUE"
    );
    const nonDueHabits = decoratedHabits.filter(
      (habit) => habit.dueLabel !== "DUE" && habit.dueLabel !== "OVERDUE"
    );

    return [
      { id: "due", habits: dueHabits },
      { id: "non-due", habits: nonDueHabits },
    ].filter((page) => page.habits.length > 0);
  }, [decoratedHabits]);
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
  const relatedHabitTrackWidthPercent =
    Math.max(relatedHabitPages.length, 1) * 100;
  const relatedHabitPanelWidthPercent =
    100 / Math.max(relatedHabitPages.length, 1);

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
    completedRelatedHabitIds,
    isSmallRelatedHabitDensity,
    measureActiveRelatedHabitPage,
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
    if (!id || typeof window === "undefined") {
      return;
    }

    try {
      const rawPreview = window.sessionStorage.getItem(
        `${SKILL_OPEN_PREVIEW_PREFIX}${id}`
      );
      if (!rawPreview) {
        setSkillOpenPreview(null);
        return;
      }

      const parsedPreview = JSON.parse(rawPreview) as Partial<SkillOpenPreview>;
      const previewAge = Date.now() - Number(parsedPreview.timestamp);
      if (
        parsedPreview.id === id &&
        typeof parsedPreview.name === "string" &&
        previewAge >= 0 &&
        previewAge <= SKILL_OPEN_PREVIEW_MAX_AGE_MS
      ) {
        setSkillOpenPreview({
          id,
          name: parsedPreview.name,
          icon:
            typeof parsedPreview.icon === "string"
              ? parsedPreview.icon
              : null,
          timestamp: Number(parsedPreview.timestamp),
        });
        return;
      }

      window.sessionStorage.removeItem(`${SKILL_OPEN_PREVIEW_PREFIX}${id}`);
      setSkillOpenPreview(null);
    } catch (previewError) {
      console.warn("Unable to read skill open preview", previewError);
      setSkillOpenPreview(null);
    }
  }, [id]);

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
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string }>).detail;
      if (detail?.entityType !== "HABIT") {
        return;
      }

      setRelatedHabitsRefreshVersion((current) => current + 1);
    };

    window.addEventListener("creator:entity-saved", handleCreatorEntitySaved);
    return () => {
      window.removeEventListener("creator:entity-saved", handleCreatorEntitySaved);
    };
  }, []);

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
            "id, name, created_at, updated_at, last_completed_at, current_streak_days, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, next_due_override, habit_type, memo_capture_config"
          )
          .eq("user_id", userId)
          .eq("skill_id", id)
          .order("name", { ascending: true });

        if (habitsError) {
          throw habitsError;
        }

        if (!cancelled) {
          const formattedHabits = (habitsData ?? [])
            .map((habit): HabitSummary | null => {
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
                memo_capture_config?: unknown;
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
                memoCaptureConfig:
                  (habitRecord.memo_capture_config as HabitSummary["memoCaptureConfig"]) ??
                  null,
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
                  badge_type,
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
      setSkill(null);
      setRelatedHabits([]);
      setCompletedRelatedHabitIds(new Set());
      setPendingRelatedHabitIds(new Set());
      previousRelatedHabitStateRef.current.clear();
      pendingRelatedHabitActionsRef.current.clear();
      setHabitsLoading(true);
      setProgress(null);
      setCategories([]);
      setMonuments([]);

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
            const loadedSkill = data as Skill;
            setSkill(loadedSkill);
            if (userId) {
              const backfillKey = `${userId}:${loadedSkill.id}`;
              if (!starterBackfillKeysRef.current.has(backfillKey)) {
                starterBackfillKeysRef.current.add(backfillKey);
                void backfillSkillStarterNote({
                  userId,
                  skillId: loadedSkill.id,
                  skillName: loadedSkill.name,
                });
              }
            }
            setLoading(false);
            void fetchRelatedHabits(userId);
            void fetchSkillProgress(userId);

            if (userId) {
              void supabase
                .from("cats")
                .select("id,name")
                .eq("user_id", userId)
                .then(({ data: catsData, error: catsError }) => {
                  if (cancelled) {
                    return;
                  }
                  if (catsError) {
                    console.error("Error loading categories:", catsError);
                    return;
                  }
                  setCategories((catsData ?? []) as Category[]);
                })
                .catch((catsError) => {
                  if (!cancelled) {
                    console.error("Error loading categories:", catsError);
                  }
                });

              void supabase
                .from("monuments")
                .select("id,title")
                .eq("user_id", userId)
                .then(({ data: monumentsData, error: monumentsError }) => {
                  if (cancelled) {
                    return;
                  }
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
                })
                .catch((monumentsError) => {
                  if (!cancelled) {
                    console.error("Error loading monuments:", monumentsError);
                  }
                });
            }
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
  }, [supabase, id, relatedHabitsRefreshVersion]);

  const resetPullExit = useCallback(() => {
    pullStartYRef.current = null;
    pullExitTriggeredRef.current = false;
    pullPointerIdRef.current = null;
  }, []);

  const handlePullExitStart = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (
        pullExitBlocked ||
        (event.pointerType !== "touch" && event.pointerType !== "mouse") ||
        !isWindowAtTop() ||
        isInteractivePullTarget(event.target)
      ) {
        resetPullExit();
        return;
      }

      pullStartYRef.current = event.clientY;
      pullExitTriggeredRef.current = false;
      pullPointerIdRef.current = event.pointerId;
    },
    [pullExitBlocked, resetPullExit]
  );

  const handlePullExitMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const pullStartY = pullStartYRef.current;

      if (
        pullExitBlocked ||
        pullStartY === null ||
        pullExitTriggeredRef.current ||
        pullPointerIdRef.current !== event.pointerId ||
        !isWindowAtTop()
      ) {
        return;
      }

      const pullDistance = event.clientY - pullStartY;

      if (pullDistance > PULL_EXIT_THRESHOLD_PX) {
        pullExitTriggeredRef.current = true;
        pullStartYRef.current = null;
        pullPointerIdRef.current = null;
        router.back();
      }
    },
    [pullExitBlocked, router]
  );

  const handlePullExitEnd = resetPullExit;

  if (loading) {
    const previewIcon = skillOpenPreview?.icon || "💡";

    return (
      <main className="px-4 pb-6 pt-3 sm:px-6 sm:pt-4 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <section aria-labelledby="skill-overview-loading" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#06070A_0%,#08090B_56%,#0D0E11_100%)] p-4 shadow-[0_35px_120px_-45px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 md:p-6">
            <div className="absolute inset-0">
              <div className="absolute inset-x-10 -top-28 h-64 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_72%)] blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.035),_transparent_68%)] blur-3xl" />
            </div>
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                {skillOpenPreview ? (
                  <span
                    className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-2xl bg-white/10 text-4xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-white/20 sm:h-[76px] sm:w-[76px] sm:text-[2.75rem]"
                    role="img"
                    aria-label={`Opening ${skillOpenPreview.name}`}
                  >
                    {previewIcon}
                  </span>
                ) : (
                  <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/20 sm:h-[76px] sm:w-[76px]" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    {skillOpenPreview ? (
                      <h1 id="skill-overview-loading" className="min-w-0 flex-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
                        {skillOpenPreview.name}
                      </h1>
                    ) : (
                      <Skeleton id="skill-overview-loading" className="h-8 min-w-0 flex-1 bg-white/10 sm:h-9 md:h-10" />
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Skeleton className="size-9 rounded-full bg-white/10" />
                      <Skeleton className="size-9 rounded-full bg-white/10" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 leading-none">
                      <Skeleton className="h-5 w-5 rounded-full bg-white/10" />
                      <Skeleton className="h-4 w-14 bg-white/10" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] p-5 shadow-[0_24px_70px_-48px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20 bg-white/10" />
                </div>
                <Skeleton className="h-8 w-20 rounded-full bg-white/10" />
              </div>
              <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-[100px] rounded-2xl bg-white/[0.06]"
                  />
                ))}
              </div>
            </section>

              <section className="relative space-y-6">
                <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_70%)]" />
                  <CardHeader className="relative pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                          RELATED HABITS
                        </CardTitle>
                      </div>
                      <Skeleton className="h-6 w-8 rounded-full bg-white/10" />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-[100px] rounded-2xl bg-white/[0.06]"
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_70%)]" />
                  <CardHeader className="relative pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
                          NOTES
                        </CardTitle>
                      </div>
                      <Skeleton className="h-6 w-8 rounded-full bg-white/10" />
                    </div>
                  </CardHeader>
                  <CardContent className="relative">
                    <div className="-mx-3 grid grid-cols-3 gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-[100px] rounded-2xl bg-white/[0.06]"
                        />
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
      router.push("/dashboard");
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
    <>
    <main
      className="px-4 pb-6 pt-3 sm:px-6 sm:pt-4 lg:px-8"
      onPointerDown={handlePullExitStart}
      onPointerMove={handlePullExitMove}
      onPointerUp={handlePullExitEnd}
      onPointerCancel={handlePullExitEnd}
    >
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
        <section aria-labelledby="skill-overview" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#06070A_0%,#08090B_56%,#0D0E11_100%)] p-4 shadow-[0_35px_120px_-45px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5 md:p-6">
            <div className="absolute inset-0">
              <div className="absolute inset-x-10 -top-28 h-64 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.045),_transparent_72%)] blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.035),_transparent_68%)] blur-3xl" />
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
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <h1 id="skill-overview" className="min-w-0 flex-1 break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
                      {skill.name}
                    </h1>
                    <div className="flex shrink-0 items-center gap-0.5">
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
                            className="inline-flex h-9 w-5 items-center justify-center text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                          >
                            <MoreVertical
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 leading-none">
                      {skillBadges.map((badge) => (
                        <span
                          key={badge.id}
                          role="img"
                          aria-label={badge.label}
                          title={badge.label}
                          className="text-lg drop-shadow-[0_0_6px_rgba(255,255,255,0.35)]"
                        >
                          {badge.emoji}
                        </span>
                      ))}
                      <span className="text-[13px] font-black uppercase tracking-[0.04em] text-white">
                        LVL {skill.level}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.84),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.04),_transparent_62%)]" />
              <CardContent className="relative overflow-visible">
                <SkillProjectsList skillId={id} icon={icon} />
              </CardContent>
            </Card>

          <section className="relative space-y-6">
            <Card className="relative overflow-hidden rounded-3xl border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.035),_transparent_70%)]" />
              <CardHeader className="relative pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
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
                        isSmallRelatedHabitDensity
                          ? "Use large cards"
                          : "Use small cards"
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
                        <Grid2x2
                          className="h-3.5 w-3.5"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      ) : (
                        <Grid3x3
                          className="h-3.5 w-3.5"
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      )}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative">
                {habitsLoading ? (
                  <div className={relatedHabitGridClass}>
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        className={clsx(
                          "bg-white/[0.06]",
                          isSmallRelatedHabitDensity
                            ? "h-[70px] rounded-xl"
                            : "h-[100px] rounded-2xl"
                        )}
                      />
                    ))}
                  </div>
                ) : habitsError ? (
                  <p className="text-xs text-white/60">{habitsError}</p>
                ) : relatedHabits.length === 0 ? (

                    <div className="flex min-h-[64px] items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-lg"
                        aria-hidden="true"
                      >
                        {icon}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-medium leading-tight text-white/84">
                          No habits linked yet
                        </h3>
                        <p className="mt-0.5 text-[11px] leading-4 text-white/48">
                          Attach a habit to this skill to start building consistency.
                        </p>
                      </div>
                    </div>
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
                          className="flex h-full transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            width: `${relatedHabitTrackWidthPercent}%`,
                            transform:
                              relatedHabitPagerViewportWidth > 0
                                ? `translate3d(${relatedHabitPageTrackTransform}px, 0, 0)`
                                : `translate3d(${
                                    -activeRelatedHabitPageIndex *
                                    relatedHabitPanelWidthPercent
                                  }%, 0, 0)`,
                            transitionDuration: relatedHabitPageDragOffset
                              ? "0ms"
                              : undefined,
                          }}
                        >
                          {relatedHabitPages.map((page) => (
                            <div
                              key={page.id}
                              className="h-full shrink-0 overflow-visible px-2 pt-2"
                              style={{
                                width: `${relatedHabitPanelWidthPercent}%`,
                              }}
                            >
                              <div
                                ref={(element) => {
                                  relatedHabitPagePanelRefs.current[page.id] =
                                    element;
                                }}
                                className={relatedHabitPageGridClass}
                              >
                                {page.habits.map((habit) => {
                                  const isHabitCompletedToday =
                                    completedRelatedHabitIds.has(habit.id);
                                  const isHabitPending =
                                    pendingRelatedHabitIds.has(habit.id);
                                  const streakDays =
                                    habit.currentStreakDays ?? 0;
                                  const showStreakBadge = streakDays >= 2;
                                  const streakLabel = `${streakDays}x`;
                                  const habitSkillIcon = skill.icon || "💡";
                                  const isHabitOverdue =
                                    habit.dueLabel === "OVERDUE";
                                  const habitPillLabel = isHabitCompletedToday
                                    ? "COMPLETE"
                                    : habit.dueLabel;
                                  const habitStateBorderClass =
                                    isHabitCompletedToday
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
                                      isHabitCompletedToday
                                        ? "undo"
                                        : "complete"
                                    }.`}
                                    title={`${habit.name} - ${habitPillLabel}. Double tap to ${
                                      isHabitCompletedToday
                                        ? "undo"
                                        : "complete"
                                    }.`}
                                    onPointerDown={(event) =>
                                      handleRelatedHabitPointerDown(
                                        event,
                                        habit
                                      )
                                    }
                                    onPointerUp={cancelRelatedHabitLongPress}
                                    onPointerCancel={cancelRelatedHabitLongPress}
                                    onPointerLeave={handleRelatedHabitPointerLeave}
                                    onDoubleClick={(event) =>
                                      handleRelatedHabitDoubleClick(
                                        event,
                                        habit.id
                                      )
                                    }
                                    onTouchEnd={(event) =>
                                      handleRelatedHabitTouchEnd(
                                        event,
                                        habit.id
                                      )
                                    }
                                  >
                                    {showStreakBadge ? (
                                      <span
                                        className="pointer-events-none absolute -right-0.5 -top-0.5 z-[8] flex items-center gap-0.5 text-[10px] font-semibold leading-tight text-amber-100/95"
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
                          const isActive =
                            index === activeRelatedHabitPageIndex;

                          return (
                            <button
                              key={page.id}
                              type="button"
                              aria-label={`Show related habit page ${index + 1}`}
                              aria-current={isActive ? "true" : undefined}
                              onClick={() =>
                                handleRelatedHabitPageChange(index)
                              }
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

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] p-4 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.84),inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.035),_transparent_62%)]" />
              <div className="relative">
                <NotesGrid skillId={id} />
              </div>
            </div>

          </section>
        </div>
      </div>
    </main>
    <MemoCompletionDialog
      open={Boolean(memoCompletionState)}
      context={
        memoCompletionState
          ? {
              habitId: memoCompletionState.id,
              habitName: memoCompletionState.name,
              habitType: memoCompletionState.habitType,
              skillId: id,
              skillIcon: skill?.icon ?? null,
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
