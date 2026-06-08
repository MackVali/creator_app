"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Grid2x2, Grid3x3, LayoutGrid } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import type { Goal, Project } from "@/app/(app)/goals/types";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/AuthProvider";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { useProfile } from "@/lib/hooks/useProfile";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import { cn } from "@/lib/utils";

type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
type ProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "name"
  | "goal_id"
  | "stage"
  | "completed_at"
  | "duration_min"
  | "created_at"
  | "due_date"
  | "priority"
  | "energy"
> & {
  tasks?: {
    id: string;
    project_id: string | null;
    stage: string;
    name: string;
    skill_id: string | null;
    priority: string | null;
  }[];
  project_skills?: {
    skill_id: string | null;
  }[];
};
type GoalRow = Pick<
  Database["public"]["Tables"]["goals"]["Row"],
  "id" | "name" | "monument_id"
>;
type SkillRow = Pick<
  Database["public"]["Tables"]["skills"]["Row"],
  "id" | "name" | "monument_id" | "icon"
>;
type TimeBlockRow = Pick<
  Database["public"]["Tables"]["time_blocks"]["Row"],
  "id" | "label" | "start_local" | "end_local"
>;
type DayTypeTimeBlockRow = {
  id: string;
  time_block_id: string | null;
  energy: string | null;
};
type HabitRow = Pick<
  Database["public"]["Tables"]["habits"]["Row"],
  | "id"
  | "name"
  | "created_at"
  | "updated_at"
  | "last_completed_at"
  | "current_streak_days"
  | "longest_streak_days"
  | "habit_type"
  | "duration_minutes"
  | "energy"
  | "recurrence"
  | "recurrence_days"
  | "recurrence_mode"
  | "anchor_type"
  | "anchor_value"
  | "anchor_start_date"
  | "skill_id"
  | "goal_id"
  | "completion_target"
  | "location_context_id"
  | "daylight_preference"
  | "window_edge_preference"
  | "next_due_override"
>;

type MatrixEvent = {
  instance: ScheduleInstance;
  title: string;
  monumentId: string | null;
  skillIds: string[];
  glyph: string;
  goal: Goal | null;
  habit: MatrixHabit | null;
};

type MatrixHabit = HabitRow & {
  monumentId: string | null;
  skillIds: string[];
  glyph: string;
  dueStatus?: MatrixHabitDueStatus;
};

type MonumentGroup<T> = {
  key: string;
  title: string;
  emoji: string | null;
  energyLevel?: FlameLevel | null;
  sortValue?: string | null;
  items: T[];
};

type MatrixMonumentGroup = {
  key: string;
  title: string;
  emoji: string | null;
  energyLevel?: FlameLevel | null;
  sortValue?: string | null;
  scheduledItems: MatrixEvent[];
  unscheduledDueHabits: MatrixHabit[];
};

type MatrixPanel = "scheduled" | "unscheduled";
type MatrixPanelSwipeAxis = "horizontal" | "vertical" | null;
type MatrixCardDensity = "large" | "small";
type MatrixView = "monuments" | "skills" | "blocks";
type MatrixHabitDueStatus = {
  isDue: boolean;
  isOverdue: boolean;
  isCompletedToday?: boolean;
  label: "DUE" | "OVERDUE" | "DUE TODAY" | "COMPLETE";
};
type MatrixHabitDueEvaluation = ReturnType<typeof evaluateHabitDueOnDate>;

const MATRIX_PANEL_LABELS: Record<MatrixPanel, string> = {
  scheduled: "Active",
  unscheduled: "Due",
};

type MatrixState = {
  loading: boolean;
  error: string | null;
  eventGroups: MonumentGroup<MatrixEvent>[];
  unscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
  skillEventGroups: MonumentGroup<MatrixEvent>[];
  skillUnscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
  blockEventGroups: MonumentGroup<MatrixEvent>[];
  blockUnscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
  dayLabel: string;
};

const initialState: MatrixState = {
  loading: true,
  error: null,
  eventGroups: [],
  unscheduledDueHabitGroups: [],
  skillEventGroups: [],
  skillUnscheduledDueHabitGroups: [],
  blockEventGroups: [],
  blockUnscheduledDueHabitGroups: [],
  dayLabel: "",
};

const UNLINKED_GROUP_KEY = "__unlinked__";
const NO_BLOCK_GROUP_KEY = "__no_block__";
const MATRIX_LIBRARY_GRID_CLASS =
  "-mx-3 grid grid-cols-3 items-stretch gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const MATRIX_LIBRARY_SMALL_GRID_CLASS =
  "goal-grid grid w-full max-w-full auto-rows-[108px] grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] items-stretch gap-1 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-1 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";
const MATRIX_LIBRARY_CARD_CLASS =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full transform-gpu flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.09),transparent_55%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(17,17,20,0.96)_54%,rgba(31,32,36,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 sm:p-4";
const MATRIX_LIBRARY_SMALL_CARD_CLASS =
  "goal-card group relative flex h-full min-h-[108px] w-full transform-gpu flex-col rounded-xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.09),transparent_55%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(17,17,20,0.96)_54%,rgba(31,32,36,0.72)_100%)] p-[0.65rem_0.45rem] text-white shadow-[0_14px_28px_-24px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SCHEDULED_EVENT_DOUBLE_TAP_MS = 300;
const MATRIX_CARD_LONG_PRESS_MS = 520;
const MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE = 12;
const MATRIX_CARD_LONG_PRESS_SUPPRESS_MS = 650;
const MATRIX_COMPLETE_SHIMMER_DURATION_MS = 3000;

function getMatrixCompleteShimmerStyle() {
  return {
    "--matrix-complete-shimmer-delay": `-${Date.now() % MATRIX_COMPLETE_SHIMMER_DURATION_MS}ms`,
  } as React.CSSProperties;
}
const MATRIX_CARD_DENSITY_STORAGE_KEY = "creator:matrix-card-density-by-group";

function getMatrixFabOriginRect(element: HTMLElement) {
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

function normalizeMatrixSourceId(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
const MATRIX_TRAY_TRANSITION = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const,
};
const MATRIX_GROUP_OPEN_EASE = [0.12, 0.92, 0.18, 1] as const;
const MATRIX_GROUP_CLOSE_EASE = [0.32, 0, 0.18, 1] as const;
const MATRIX_GROUP_FIRST_AUTO_OPEN_DELAY_MS = 600;
const MATRIX_GROUP_AUTO_OPEN_STAGGER_MS = 250;

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatEventTime(
  startUtc: string | null,
  endUtc: string | null,
  timeZone: string
) {
  if (!startUtc || !endUtc) return "Unscheduled time";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startUtc))} - ${formatter.format(new Date(endUtc))}`;
}

function formatDayLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

function getHabitFallbackGlyph(habitType?: string | null) {
  return habitType?.trim().toUpperCase() === "CHORE" ? "◆" : "✦";
}

function normalizeRelatedHabitType(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || "HABIT";
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

function getMatrixHabitTypeRank(habitType: string | null | undefined): number {
  switch (normalizeRelatedHabitType(habitType)) {
    case "CHORE":
      return 0;
    case "HABIT":
      return 1;
    case "SYNC":
      return 3;
    case "PRACTICE":
      return 4;
    default:
      return 5;
  }
}

function getMatrixEventTypeRank(event: MatrixEvent): number {
  if (event.habit) {
    return getMatrixHabitTypeRank(event.habit.habit_type);
  }
  if (event.goal) {
    return 2;
  }
  return 5;
}

function getMatrixEventStartTime(event: MatrixEvent): number {
  const startUtc = event.instance.start_utc;
  if (!startUtc) return Number.POSITIVE_INFINITY;

  const startTime = new Date(startUtc).getTime();
  return Number.isNaN(startTime) ? Number.POSITIVE_INFINITY : startTime;
}

function isMatrixEventCompleted(event: MatrixEvent): boolean {
  return event.instance.status?.trim().toLowerCase() === "completed";
}

function isMatrixHabitCompletedToday(
  habit: Pick<HabitRow, "last_completed_at">,
  date: Date,
  timeZone: string
): boolean {
  const completedAt = parseOptionalDate(habit.last_completed_at);
  if (!completedAt) return false;

  return (
    formatDateKeyInTimeZone(completedAt, timeZone) ===
    formatDateKeyInTimeZone(date, timeZone)
  );
}

function getMatrixHabitDisplayStatus(
  habit: HabitRow,
  date: Date,
  timeZone: string
): MatrixHabitDueStatus {
  if (isMatrixHabitCompletedToday(habit, date, timeZone)) {
    return {
      isDue: true,
      isOverdue: false,
      isCompletedToday: true,
      label: "COMPLETE",
    };
  }

  return getMatrixHabitDueStatus(habit, date, timeZone);
}

function isMatrixDueHabitCompleted(habit: MatrixHabit): boolean {
  return habit.dueStatus?.isCompletedToday === true;
}

function sortMatrixScheduledItems(items: MatrixEvent[]): MatrixEvent[] {
  return [...items].sort((a, b) => {
    const completionDifference =
      Number(isMatrixEventCompleted(a)) - Number(isMatrixEventCompleted(b));
    if (completionDifference !== 0) return completionDifference;

    const rankDifference = getMatrixEventTypeRank(a) - getMatrixEventTypeRank(b);
    if (rankDifference !== 0) return rankDifference;

    const aStartTime = getMatrixEventStartTime(a);
    const bStartTime = getMatrixEventStartTime(b);
    if (aStartTime !== bStartTime) return aStartTime - bStartTime;

    return a.title.localeCompare(b.title);
  });
}

function sortMatrixDueHabits(items: MatrixHabit[]): MatrixHabit[] {
  return [...items].sort((a, b) => {
    const completionDifference =
      Number(isMatrixDueHabitCompleted(a)) -
      Number(isMatrixDueHabitCompleted(b));
    if (completionDifference !== 0) return completionDifference;

    const rankDifference =
      getMatrixHabitTypeRank(a.habit_type) - getMatrixHabitTypeRank(b.habit_type);
    if (rankDifference !== 0) return rankDifference;

    return a.name.localeCompare(b.name);
  });
}

function getHabitCardTypeClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") {
    return "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]";
  }
  if (normalized === "SYNC") {
    return "!bg-[radial-gradient(circle_at_12%_-20%,rgba(226,232,240,0.34),transparent_58%),linear-gradient(135deg,rgba(82,82,91,0.98)_0%,rgba(113,113,122,0.95)_48%,rgba(161,161,170,0.9)_100%)]";
  }
  if (normalized === "PRACTICE") {
    return "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
  }
  return "!bg-[radial-gradient(circle_at_18%_-24%,rgba(255,255,255,0.055),transparent_54%),linear-gradient(145deg,rgba(10,11,14,0.98)_0%,rgba(17,18,22,0.96)_58%,rgba(24,26,31,0.88)_100%)]";
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC") return "border-zinc-200/45";
  if (normalized === "PRACTICE") return "border-slate-500/50";
  return "border-white/10 shadow-[0_16px_34px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.055)]";
}

function mapPriority(priority: string | null | undefined): Goal["priority"] {
  const normalized = priority?.trim().toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(energy: string | null | undefined): Goal["energy"] {
  const normalized = energy?.trim().toUpperCase();
  switch (normalized) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function normalizePriorityCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"].includes(
    upper
  )
    ? upper
    : "NO";
}

function normalizeEnergyCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"].includes(upper)
    ? upper
    : "NO";
}

function normalizeFlameLevel(value?: string | null): FlameLevel {
  const normalized = normalizeEnergyCode(value);
  return normalized as FlameLevel;
}

function toScheduleHabit(habit: HabitRow): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    durationMinutes: habit.duration_minutes,
    createdAt: habit.created_at,
    updatedAt: habit.updated_at,
    lastCompletedAt: habit.last_completed_at,
    currentStreakDays: habit.current_streak_days,
    longestStreakDays: habit.longest_streak_days,
    habitType: habit.habit_type,
    windowId: null,
    energy: habit.energy,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrence_days,
    recurrenceMode: habit.recurrence_mode,
    anchorType: habit.anchor_type,
    anchorValue: habit.anchor_value,
    anchorStartDate: habit.anchor_start_date,
    skillId: habit.skill_id,
    goalId: habit.goal_id,
    completionTarget: habit.completion_target,
    locationContextId: habit.location_context_id,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: habit.daylight_preference,
    windowEdgePreference: habit.window_edge_preference,
    nextDueOverride: habit.next_due_override,
    window: null,
  };
}

function isHabitDueToday(habit: HabitRow, date: Date, timeZone: string) {
  return getMatrixHabitDueStatus(habit, date, timeZone).isDue;
}

function getRecurrenceCode(value: HabitRow["recurrence"]): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isDailyMatrixRecurrence(habit: HabitRow): boolean {
  const recurrence = getRecurrenceCode(habit.recurrence);
  return (
    recurrence === "" ||
    recurrence === "daily" ||
    recurrence === "none" ||
    recurrence === "everyday"
  );
}

function getMatrixOverdueFallbackStart(
  habit: HabitRow,
  date: Date,
  timeZone: string
): Date | null {
  if (!isDailyMatrixRecurrence(habit)) return null;

  const lastCompletedAt = parseOptionalDate(habit.last_completed_at);
  if (lastCompletedAt) {
    return addDaysInTimeZone(
      startOfDayInTimeZone(lastCompletedAt, timeZone),
      1,
      timeZone
    );
  }

  const nextDueOverride = parseOptionalDate(habit.next_due_override);
  if (nextDueOverride && nextDueOverride.getTime() <= date.getTime()) {
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

function getMatrixHabitOverdueStart({
  habit,
  evaluation,
  date,
  timeZone,
}: {
  habit: HabitRow;
  evaluation: MatrixHabitDueEvaluation;
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

  return getMatrixOverdueFallbackStart(habit, date, timeZone) ?? dueStart;
}

function getMatrixHabitDueStatus(
  habit: HabitRow,
  date: Date,
  timeZone: string
): MatrixHabitDueStatus {
  const todayEvaluation = evaluateHabitDueOnDate({
    habit: toScheduleHabit(habit),
    date,
    timeZone,
    nextDueOverride: parseOptionalDate(habit.next_due_override),
  });
  const overdueStart = getMatrixHabitOverdueStart({
    habit,
    evaluation: todayEvaluation,
    date,
    timeZone,
  });
  const overdueStartMs = overdueStart?.getTime();
  const isOverdue =
    todayEvaluation.isDue &&
    typeof overdueStartMs === "number" &&
    date.getTime() - overdueStartMs >= MS_PER_DAY;

  return {
    isDue: todayEvaluation.isDue,
    isOverdue,
    label: isOverdue
      ? "OVERDUE"
      : habit.duration_minutes
        ? "DUE"
        : "DUE TODAY",
  };
}

function resolveHabitMonumentId({
  habit,
  goals,
  skillIdToMonumentId,
}: {
  habit: HabitRow | null | undefined;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
}) {
  if (!habit) return null;

  const goal = habit.goal_id ? goals.get(habit.goal_id) : null;
  if (goal?.monument_id) return goal.monument_id;

  return habit.skill_id
    ? (skillIdToMonumentId.get(habit.skill_id) ?? null)
    : null;
}

function getExplicitProjectSkillIds(project: ProjectRow): string[] {
  return (project.project_skills ?? [])
    .map((record) => record.skill_id)
    .filter((skillId): skillId is string => Boolean(skillId));
}

function getProjectSkillIds(project: ProjectRow): string[] {
  const projectSkillIds = getExplicitProjectSkillIds(project);
  const taskSkillIds = (project.tasks ?? [])
    .map((task) => task.skill_id)
    .filter((skillId): skillId is string => Boolean(skillId));

  return Array.from(new Set([...projectSkillIds, ...taskSkillIds]));
}

function buildProjectGoal({
  project,
  goal,
  skillIdToIcon,
  monumentIdToEmoji,
}: {
  project: ProjectRow;
  goal: GoalRow | null;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
}): Goal {
  const tasks = (project.tasks ?? []).map((task) => ({
    id: task.id,
    name: task.name,
    stage: task.stage,
    skillId: task.skill_id ?? null,
    skillIcon: task.skill_id ? (skillIdToIcon.get(task.skill_id) ?? null) : null,
    priorityCode: task.priority ?? null,
    isNew: false,
  }));
  const projectSkillIds = getExplicitProjectSkillIds(project);
  const taskSkillIds = tasks
    .map((task) => task.skillId)
    .filter((skillId): skillId is string => Boolean(skillId));
  const projectEmoji =
    projectSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    taskSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    null;
  const completedAt =
    typeof project.completed_at === "string" &&
    project.completed_at.trim().length > 0
      ? project.completed_at
      : null;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.stage === "PERFECT").length;
  const progress = completedAt
    ? 100
    : totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
  const energyCode = normalizeEnergyCode(project.energy);
  const priorityCode = normalizePriorityCode(project.priority);
  const stage = project.stage ?? "BUILD";
  const mappedProject: Project = {
    id: project.id,
    name: project.name,
    status: completedAt ? "Done" : "In-Progress",
    progress,
    energy: mapEnergy(energyCode),
    energyCode,
    dueDate: project.due_date ?? undefined,
    durationMinutes:
      typeof project.duration_min === "number" &&
      Number.isFinite(project.duration_min)
        ? project.duration_min
        : null,
    skillIds: projectSkillIds,
    emoji: projectEmoji,
    stage,
    priorityCode,
    isNew: false,
    tasks,
  };
  const createdAt = project.created_at ?? new Date().toISOString();
  const monumentId = goal?.monument_id ?? null;

  return {
    id: project.id,
    parentGoalId: goal?.id ?? project.goal_id ?? null,
    title: project.name,
    emoji: projectEmoji ?? undefined,
    priority: mapPriority(priorityCode),
    energy: mapEnergy(energyCode),
    progress,
    status: completedAt ? "COMPLETED" : "ACTIVE",
    active: !completedAt,
    createdAt,
    updatedAt: createdAt,
    dueDate: project.due_date ?? undefined,
    projects: [mappedProject],
    monumentId,
    monumentEmoji: monumentId ? (monumentIdToEmoji.get(monumentId) ?? null) : null,
    priorityCode,
    energyCode,
    skills: Array.from(new Set([...projectSkillIds, ...taskSkillIds])),
    weightBoost: 0,
  };
}

function buildMatrixEvents({
  instances,
  projects,
  habits,
  goals,
  skillIdToMonumentId,
  skillIdToIcon,
  monumentIdToEmoji,
  date,
  timeZone,
}: {
  instances: ScheduleInstance[];
  projects: Map<string, ProjectRow>;
  habits: Map<string, HabitRow>;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
  date: Date;
  timeZone: string;
}): MatrixEvent[] {
  return instances.flatMap((instance) => {
    if (instance.source_type === "PROJECT") {
      const project = projects.get(instance.source_id);
      const goal = project?.goal_id ? goals.get(project.goal_id) : null;
      const monumentId = goal?.monument_id ?? null;
      const projectGoal = project
        ? buildProjectGoal({
            project,
            goal,
            skillIdToIcon,
            monumentIdToEmoji,
          })
        : null;
      return [
        {
          instance,
          title: instance.event_name ?? project?.name ?? "Untitled project",
          monumentId,
          skillIds: project ? getProjectSkillIds(project) : [],
          glyph: monumentId
            ? (monumentIdToEmoji.get(monumentId) ?? "◇")
            : "◇",
          goal: projectGoal,
          habit: null,
        },
      ];
    }

    if (instance.source_type !== "HABIT") return [];

    const habit = habits.get(instance.source_id);
    const habitGlyph =
      habit?.skill_id ? skillIdToIcon.get(habit.skill_id) : null;
    const dueStatus = habit
      ? getMatrixHabitDueStatus(habit, date, timeZone)
      : undefined;
    return [
      {
        instance,
        title: instance.event_name ?? habit?.name ?? "Untitled habit",
        monumentId: resolveHabitMonumentId({
          habit,
          goals,
          skillIdToMonumentId,
        }),
        skillIds: habit?.skill_id ? [habit.skill_id] : [],
        glyph: habitGlyph ?? getHabitFallbackGlyph(habit?.habit_type),
        goal: null,
        habit: habit
          ? {
              ...habit,
              monumentId: resolveHabitMonumentId({
                habit,
                goals,
                skillIdToMonumentId,
              }),
              skillIds: habit.skill_id ? [habit.skill_id] : [],
              glyph: habitGlyph ?? getHabitFallbackGlyph(habit.habit_type),
              dueStatus,
            }
          : null,
      },
    ];
  });
}

function groupBySkill<T extends { skillIds: string[] }>({
  items,
  skills,
}: {
  items: T[];
  skills: Map<string, SkillRow>;
}): MonumentGroup<T>[] {
  const groupLookup = new Map<string, MonumentGroup<T>>();

  for (const item of items) {
    const itemSkillIds = item.skillIds.length
      ? item.skillIds
      : [UNLINKED_GROUP_KEY];
    const itemGroupKeys = new Set(
      itemSkillIds.map((skillId) =>
        skillId === UNLINKED_GROUP_KEY || !skills.has(skillId)
          ? UNLINKED_GROUP_KEY
          : skillId
      )
    );

    for (const skillId of itemGroupKeys) {
      const skill =
        skillId === UNLINKED_GROUP_KEY ? null : skills.get(skillId);
      const key = skill?.id ?? UNLINKED_GROUP_KEY;
      const existing = groupLookup.get(key);
      if (existing) {
        existing.items.push(item);
        continue;
      }

      groupLookup.set(key, {
        key,
        title: skill?.name ?? "Unlinked",
        emoji: skill?.icon ?? null,
        items: [item],
      });
    }
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
}

function groupByMonument<T extends { monumentId: string | null }>({
  items,
  monuments,
}: {
  items: T[];
  monuments: Monument[];
}): MonumentGroup<T>[] {
  const monumentLookup = new Map(
    monuments.map((monument) => [monument.id, monument])
  );
  const groupLookup = new Map<string, MonumentGroup<T>>();

  for (const item of items) {
    const monument = item.monumentId ? monumentLookup.get(item.monumentId) : null;
    const key = monument?.id ?? UNLINKED_GROUP_KEY;
    const existing = groupLookup.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groupLookup.set(key, {
      key,
      title: monument?.title ?? "Unlinked",
      emoji: monument?.emoji ?? null,
      items: [item],
    });
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
}

function getBlockEnergyLevel({
  event,
  dayTypeTimeBlockById,
  dayTypeTimeBlockByTimeBlockId,
}: {
  event: MatrixEvent;
  dayTypeTimeBlockById: Map<string, DayTypeTimeBlockRow>;
  dayTypeTimeBlockByTimeBlockId: Map<string, DayTypeTimeBlockRow>;
}): FlameLevel {
  const dayTypeTimeBlock =
    event.instance.day_type_time_block_id
      ? dayTypeTimeBlockById.get(event.instance.day_type_time_block_id)
      : null;
  const fallbackDayTypeTimeBlock =
    !dayTypeTimeBlock && event.instance.time_block_id
      ? dayTypeTimeBlockByTimeBlockId.get(event.instance.time_block_id)
      : null;

  return normalizeFlameLevel(
    dayTypeTimeBlock?.energy ??
      fallbackDayTypeTimeBlock?.energy ??
      event.instance.energy_resolved ??
      "NO"
  );
}

function groupEventsByBlock({
  items,
  timeBlocks,
  dayTypeTimeBlockById,
  dayTypeTimeBlockByTimeBlockId,
}: {
  items: MatrixEvent[];
  timeBlocks: Map<string, TimeBlockRow>;
  dayTypeTimeBlockById: Map<string, DayTypeTimeBlockRow>;
  dayTypeTimeBlockByTimeBlockId: Map<string, DayTypeTimeBlockRow>;
}): MonumentGroup<MatrixEvent>[] {
  const groupLookup = new Map<string, MonumentGroup<MatrixEvent>>();

  for (const item of items) {
    const timeBlock = item.instance.time_block_id
      ? timeBlocks.get(item.instance.time_block_id)
      : null;
    const key = timeBlock?.id ?? NO_BLOCK_GROUP_KEY;
    const existing = groupLookup.get(key);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groupLookup.set(key, {
      key,
      title: timeBlock?.label ?? "No Block",
      emoji: timeBlock ? null : "◇",
      energyLevel: timeBlock
        ? getBlockEnergyLevel({
            event: item,
            dayTypeTimeBlockById,
            dayTypeTimeBlockByTimeBlockId,
          })
        : "EXTREME",
      sortValue: timeBlock?.start_local ?? null,
      items: [item],
    });
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === NO_BLOCK_GROUP_KEY) return 1;
    if (b.key === NO_BLOCK_GROUP_KEY) return -1;
    return (a.sortValue ?? "").localeCompare(b.sortValue ?? "");
  });
}

function groupUnscheduledDueHabitsByNoBlock(
  items: MatrixHabit[]
): MonumentGroup<MatrixHabit>[] {
  return items.length
    ? [
        {
          key: NO_BLOCK_GROUP_KEY,
          title: "No Block",
          emoji: "◇",
          energyLevel: "EXTREME",
          items,
        },
      ]
    : [];
}

function mergeMatrixMonumentGroups({
  scheduledGroups,
  unscheduledDueHabitGroups,
}: {
  scheduledGroups: MonumentGroup<MatrixEvent>[];
  unscheduledDueHabitGroups: MonumentGroup<MatrixHabit>[];
}): MatrixMonumentGroup[] {
  const groupLookup = new Map<string, MatrixMonumentGroup>();

  for (const group of scheduledGroups) {
    groupLookup.set(group.key, {
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      energyLevel: group.energyLevel,
      sortValue: group.sortValue,
      scheduledItems: group.items,
      unscheduledDueHabits: [],
    });
  }

  for (const group of unscheduledDueHabitGroups) {
    const existing = groupLookup.get(group.key);
    if (existing) {
      existing.unscheduledDueHabits = group.items;
      continue;
    }

    groupLookup.set(group.key, {
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      energyLevel: group.energyLevel,
      sortValue: group.sortValue,
      scheduledItems: [],
      unscheduledDueHabits: group.items,
    });
  }

  return Array.from(groupLookup.values()).sort((a, b) => {
    if (a.key === UNLINKED_GROUP_KEY || a.key === NO_BLOCK_GROUP_KEY) return 1;
    if (b.key === UNLINKED_GROUP_KEY || b.key === NO_BLOCK_GROUP_KEY) return -1;
    if (a.sortValue || b.sortValue) {
      return (a.sortValue ?? "").localeCompare(b.sortValue ?? "");
    }
    return a.title.localeCompare(b.title);
  });
}

function MatrixCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(145deg,#07080A_0%,#090A0D_58%,#0D0E11_100%)] shadow-[0_24px_60px_-45px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.035)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function MatrixLoadingRows() {
  return (
    <div className="space-y-2.5 px-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <MatrixCard
          key={index}
          className="p-3 sm:p-4 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white/[0.045]"
        >
          <div className="flex min-h-8 animate-pulse items-center justify-between gap-3 px-0 sm:px-1">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
                <div className="absolute inset-1.5 rounded-lg bg-white/[0.035]" />
                <div className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white/[0.075]" />
              </div>
              <div className="min-w-0">
                <div
                  className="h-3.5 rounded-full bg-white/[0.08] shadow-[0_0_18px_-12px_rgba(255,255,255,0.45)]"
                  style={{ width: `${104 + (index % 4) * 18}px` }}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="h-5 w-14 rounded-full border border-white/8 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]" />
              <div className="h-7 w-7 rounded-lg border border-white/8 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" />
            </div>
          </div>
        </MatrixCard>
      ))}
    </div>
  );
}

function MatrixSmallEventCard({
  glyph,
  title,
  meta,
  className,
  status,
  completed = false,
}: {
  glyph: string;
  title: string;
  meta: ReactNode;
  className?: string | null;
  status?: string | null;
  completed?: boolean;
}) {
  return (
    <div
      className={cn(MATRIX_LIBRARY_SMALL_CARD_CLASS, className)}
      style={completed ? getMatrixCompleteShimmerStyle() : undefined}
    >
      {status && !completed ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 max-w-[58%] truncate rounded-full border border-white/8 bg-black/20 px-1 py-[2px] text-[6px] font-semibold uppercase leading-none tracking-[0.06em] text-white/42">
          {status}
        </span>
      ) : null}

      <div className="relative z-[2] flex h-full min-h-0 flex-col items-center justify-center gap-1 text-center">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.055] text-[10px] font-semibold leading-none text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_5px_10px_rgba(0,0,0,0.3)]">
          {glyph}
        </span>

        <div className="flex min-h-0 w-full min-w-0 items-center justify-center">
          <span
            className="line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[7px] font-semibold leading-[0.72rem] text-white/92 whitespace-normal"
            style={{ hyphens: "auto" }}
          >
            {title}
          </span>
        </div>

        <div className="flex h-[14px] w-full shrink-0 items-center justify-center">
          {meta}
        </div>
      </div>
    </div>
  );
}

function MatrixHabitCard({
  glyph,
  title,
  pill,
  habitType,
  overdue,
  status,
  completed = false,
  density = "large",
}: {
  glyph: string;
  title: string;
  pill: string;
  habitType: string | null | undefined;
  overdue: boolean;
  status?: string | null;
  completed?: boolean;
  density?: MatrixCardDensity;
}) {
  const isCompleted =
    completed || status?.trim().toLowerCase() === "completed";
  const isSmall = density === "small";
  const displayPill = isCompleted ? "COMPLETE" : pill;
  const pillClass = isCompleted
    ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
    : overdue
      ? "border-rose-200/20 bg-rose-950/35 text-rose-100/85"
      : "border-white/10 bg-white/[0.06] text-white/65";
  const glyphBadgeClass =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.055] text-xs font-semibold leading-none text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7";
  const completedGlyphBadgeClass =
    "!border-white/10 !bg-white/[0.055] !text-white/82 !shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]";

  if (isSmall) {
    return (
      <MatrixSmallEventCard
        glyph={glyph}
        title={title}
        status={status}
        completed={isCompleted}
        className={cn(
          isCompleted
            ? ["emerald-completed-compact", "shimmer-border-complete"]
            : [
                getHabitCardTypeClass(habitType),
                getHabitCardBorderClass(habitType),
                overdue ? "related-habit-due-border" : null,
              ]
        )}
        meta={
          <span
            className={cn(
              "w-fit max-w-none whitespace-nowrap rounded-full border px-1.5 py-[2px] text-[6px] font-semibold uppercase leading-none tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:text-[7px]",
              pillClass
            )}
          >
            {displayPill}
          </span>
        }
      />
    );
  }

  return (
    <div
      className={cn(
        isCompleted
          ? cn(
              "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col text-white transition duration-200 select-none",
              isSmall
                ? "h-full min-h-[108px] rounded-xl p-[0.65rem_0.45rem]"
                : "min-h-[96px] rounded-2xl p-3 sm:p-4"
            )
          : isSmall
            ? MATRIX_LIBRARY_SMALL_CARD_CLASS
            : MATRIX_LIBRARY_CARD_CLASS,
        isCompleted
          ? ["emerald-completed-compact", "shimmer-border-complete"]
          : [
              getHabitCardTypeClass(habitType),
              getHabitCardBorderClass(habitType),
              overdue ? "related-habit-due-border" : null,
            ]
      )}
      style={isCompleted ? getMatrixCompleteShimmerStyle() : undefined}
    >
      {status && !isCompleted ? (
        <span
          className={cn(
            "pointer-events-none absolute max-w-[58%] truncate rounded-full border font-semibold uppercase leading-none tracking-[0.06em]",
            isSmall
              ? "right-1.5 top-1.5 px-1 py-[2px] text-[6px]"
              : "right-2.5 top-2.5 px-1.5 py-[3px] text-[7px]",
            "border-white/8 bg-black/20 text-white/42"
          )}
        >
          {status}
        </span>
      ) : null}
      <div
        className={cn(
          "relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center text-center",
          isSmall ? "gap-1" : "gap-1.5"
        )}
      >
        <span
          className={cn(
            isSmall
              ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.055] text-[10px] font-semibold leading-none text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_5px_10px_rgba(0,0,0,0.3)] sm:h-6 sm:w-6"
              : glyphBadgeClass,
            isCompleted ? completedGlyphBadgeClass : null
          )}
        >
          {glyph}
        </span>
        <div className="flex min-h-0 w-full min-w-0 items-center justify-center">
          <span
            className={cn(
              "line-clamp-3 w-full min-w-0 break-words px-0.5 text-center font-semibold leading-[1.05] text-white/92 whitespace-normal",
              isSmall ? "text-[7px] sm:text-[8px]" : "text-[9px] sm:text-[10px]"
            )}
            style={{ hyphens: "auto" }}
          >
            {title}
          </span>
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center justify-center",
            isSmall ? "h-[14px] shrink-0" : null
          )}
        >
          <span
            className={cn(
              "w-fit max-w-none whitespace-nowrap rounded-full border font-semibold uppercase leading-none tracking-[0.06em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              isSmall
                ? "px-1.5 py-[2px] text-[6px] sm:text-[7px]"
                : "px-2 py-[3px] text-[8px]",
              pillClass
            )}
          >
            {displayPill}
          </span>
        </div>
      </div>
    </div>
  );
}


function MatrixProjectCard({
  goal,
  glyph,
  completed = false,
  density = "small",
  open = false,
  onOpenChange,
}: {
  goal: Goal;
  glyph: string;
  completed?: boolean;
  density?: MatrixCardDensity;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const progress = completed
    ? 100
    : Math.max(0, Math.min(100, Math.round(Number(goal.progress ?? 0))));
  const displayGlyph =
    glyph ||
    goal.emoji ||
    goal.monumentEmoji ||
    goal.title.slice(0, 2).toUpperCase();

  if (density === "large" && completed) {
    return (
      <div
        role={onOpenChange ? "button" : undefined}
        tabIndex={onOpenChange ? 0 : undefined}
        aria-expanded={onOpenChange ? open : undefined}
        aria-controls={onOpenChange ? `goal-${goal.id}` : undefined}
        onClick={() => onOpenChange?.(!open)}
        onKeyDown={(event) => {
          if (!onOpenChange) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onOpenChange(!open);
        }}
        className={cn(
          "goal-card group relative flex aspect-[5/6] w-full transform-gpu flex-col rounded-2xl p-3 text-white transition duration-200 select-none sm:p-4",
          "min-h-[96px]",
          onOpenChange ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25" : null,
          "emerald-completed-compact",
          "shimmer-border-complete",
          "scale-[0.98]",
          "origin-center"
        )}
        style={getMatrixCompleteShimmerStyle()}
      >
        <div className="relative z-[2] flex h-full min-w-0 flex-1 flex-col items-stretch">
          <div className="flex flex-1 flex-col items-center gap-1 min-w-0 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-base font-semibold text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]">
              {displayGlyph}
            </div>
            <h3
              className="max-w-full px-1 text-center text-[8px] leading-snug font-semibold line-clamp-2 break-words min-h-[2.4em] text-white/92"
              title={goal.title}
              style={{ hyphens: "auto" }}
            >
              {goal.title}
            </h3>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-emerald-100/[0.16] bg-emerald-950/[0.22] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]">
              <div
                className="progress-bar-glint relative h-full rounded-full border border-emerald-100/25 bg-gradient-to-r from-emerald-300/65 via-emerald-100/85 to-emerald-300/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.22),0_0_10px_rgba(52,211,153,0.34)] transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              >
                <span className="progress-bar-glint-sweep" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-x-1 top-[1px] z-[4] h-px rounded-full bg-emerald-50/45" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MatrixSmallEventCard
      glyph={displayGlyph}
      title={goal.title}
      completed={completed}
      className={completed ? ["emerald-completed-compact", "shimmer-border-complete"].join(" ") : null}
      meta={
        <div className={cn(
          "w-full overflow-hidden rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]",
          progress > 0
            ? "h-2 border border-[#16483d] bg-[linear-gradient(180deg,#1b2d28,#0d1b17)]"
            : "h-2 border border-[#252a2a] bg-[linear-gradient(180deg,#17191b,#090a0b)]"
        )}>
          <div
            className={cn(
              "relative h-full rounded-full transition-[width] duration-200",
              "bg-[linear-gradient(90deg,#0b7a5c,#059669,#0b8060)] shadow-[0_0_9px_rgba(16,185,129,0.26),inset_0_1px_0_rgba(209,250,229,0.28),inset_0_-1px_0_rgba(0,0,0,0.24)]"
            )}
            style={{ width: `${progress}%` }}
          >
            <div className="pointer-events-none absolute inset-x-1 top-[1px] z-[4] h-px rounded-full bg-emerald-50/30" />
          </div>
        </div>
      }
    />
  );
}

function ScheduledEventCard({
  event,
  open,
  onOpenChange,
  onComplete,
  density,
}: {
  event: MatrixEvent;
  open: boolean;
  onOpenChange(open: boolean): void;
  onComplete(instanceId: string, nextStatus: ScheduleInstance["status"]): void;
  density: MatrixCardDensity;
}) {
  const fabCreation = useFabCreation();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ instanceId: string; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const isCompleted = event.instance.status === "completed";
  const cleanStatus =
    event.instance.status === "completed"
      ? "Completed"
      : event.instance.status && event.instance.status !== "scheduled"
        ? event.instance.status.replaceAll("_", " ")
        : null;

  const completeEvent = useCallback(() => {
    onComplete(event.instance.id, isCompleted ? "scheduled" : "completed");
  }, [event.instance.id, isCompleted, onComplete]);

  const cancelLongPress = useCallback(
    (event?: PointerEvent<HTMLDivElement>) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (event) {
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // Pointer capture may already be released.
        }
      }

      longPressStartRef.current = null;
    },
    []
  );

  const handleLongPressEdit = useCallback(
    (element: HTMLElement) => {
      if (!fabCreation) return;

      if (event.instance.source_type === "PROJECT") {
        const projectId = event.instance.source_id;
        if (!projectId) return;

        fabCreation.requestEntityEdit({
          entityType: "PROJECT",
          entityId: projectId,
          instanceId: event.instance.id,
          title: event.title,
          originRect: getMatrixFabOriginRect(element),
        });
        return;
      }

      if (event.instance.source_type === "HABIT") {
        const habitId = event.habit?.id ?? event.instance.source_id;
        if (!habitId) return;

        fabCreation.requestEntityEdit({
          entityType: "HABIT",
          entityId: habitId,
          instanceId: event.instance.id,
          title: event.title,
          originRect: getMatrixFabOriginRect(element),
        });
      }
    },
    [event.habit?.id, event.instance.id, event.instance.source_id, event.instance.source_type, event.title, fabCreation]
  );

  const handleCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!fabCreation) return;

      const element = event.currentTarget;
      const pointerId = event.pointerId;

      cancelLongPress();
      longPressStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId,
      };

      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        suppressTapUntilRef.current = Date.now() + MATRIX_CARD_LONG_PRESS_SUPPRESS_MS;
        longPressStartRef.current = null;

        try {
          if (element.hasPointerCapture?.(pointerId)) {
            element.releasePointerCapture?.(pointerId);
          }
        } catch {
          // Pointer capture may already be released.
        }

        handleLongPressEdit(element);
      }, MATRIX_CARD_LONG_PRESS_MS);
    },
    [cancelLongPress, fabCreation, handleLongPressEdit]
  );

  const handleCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = longPressStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const deltaX = Math.abs(event.clientX - start.x);
      const deltaY = Math.abs(event.clientY - start.y);

      if (
        deltaX > MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE ||
        deltaY > MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE
      ) {
        cancelLongPress(event);
      }
    },
    [cancelLongPress]
  );

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressTapUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (Date.now() < suppressTapUntilRef.current) return;
    completeEvent();
  }, [completeEvent]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (Date.now() < suppressTapUntilRef.current) {
        event.stopPropagation();
        return;
      }

      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (deltaX > 12 || deltaY > 12) return;

      const now = Date.now();
      const lastTap = lastTapRef.current;
      if (
        lastTap?.instanceId === event.currentTarget.dataset.instanceId &&
        now - lastTap.time <= SCHEDULED_EVENT_DOUBLE_TAP_MS
      ) {
        lastTapRef.current = null;
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
        completeEvent();
        return;
      }

      lastTapRef.current = {
        instanceId: event.currentTarget.dataset.instanceId ?? "",
        time: now,
      };
    },
    [completeEvent]
  );

  const scheduledGoal = useMemo<Goal | null>(() => {
    if (!event.goal) return null;
    if (!isCompleted) return event.goal;
    return {
      ...event.goal,
      progress: 100,
      status: "COMPLETED",
      active: false,
    };
  }, [event.goal, isCompleted]);
  const scheduledHabitPill = cleanStatus ?? "SCHEDULED";

  const card = scheduledGoal ? (
    density === "small" ? (
      <MatrixProjectCard
        goal={scheduledGoal}
        glyph={event.glyph}
        completed={isCompleted}
        density={density}
        open={open}
        onOpenChange={onOpenChange}
      />
    ) : (
      <GoalCard
        goal={scheduledGoal}
        showWeight={false}
        showCreatedAt={false}
        showEmojiPrefix={false}
        variant="compact"
        completionTheme="matrix"
        projectDropdownMode="tasks-only"
        open={open}
        onOpenChange={onOpenChange}
      />
    )
  ) : event.habit ? (
    <MatrixHabitCard
      glyph={event.glyph}
      title={event.title}
      pill={isCompleted ? "COMPLETE" : scheduledHabitPill}
      habitType={event.habit.habit_type}
      overdue={false}
      status={cleanStatus}
      completed={isCompleted}
      density={density}
    />
  ) : null;

  return card ? (
    <div
      data-instance-id={event.instance.id}
      onClickCapture={handleClickCapture}
      onDoubleClick={handleDoubleClick}
      onPointerDownCapture={handleCardPointerDown}
      onPointerMoveCapture={handleCardPointerMove}
      onPointerUpCapture={cancelLongPress}
      onPointerCancelCapture={cancelLongPress}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          cancelLongPress(event);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={cn(
        "matrix-event-card-shell h-full",
        isCompleted && event.goal ? "overflow-visible" : null
      )}
    >
      {card}
    </div>
  ) : null;
}

function DueHabitCard({
  habit,
  density,
  completing,
  onComplete,
}: {
  habit: MatrixHabit;
  density: MatrixCardDensity;
  completing: boolean;
  onComplete(habitId: string, completedToday: boolean): void;
}) {
  const fabCreation = useFabCreation();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ habitId: string; time: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const dueLabel =
    habit.dueStatus?.label ?? (habit.duration_minutes ? "DUE" : "DUE TODAY");
  const isCompletedToday = isMatrixDueHabitCompleted(habit);

  const cancelLongPress = useCallback(
    (event?: PointerEvent<HTMLDivElement>) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (event) {
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }
        } catch {
          // Pointer capture may already be released.
        }
      }

      longPressStartRef.current = null;
    },
    []
  );

  const handleCardPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (completing || !fabCreation) return;

      const element = event.currentTarget;
      const pointerId = event.pointerId;

      cancelLongPress();
      longPressStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId,
      };

      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        suppressTapUntilRef.current = Date.now() + MATRIX_CARD_LONG_PRESS_SUPPRESS_MS;
        longPressStartRef.current = null;

        try {
          if (element.hasPointerCapture?.(pointerId)) {
            element.releasePointerCapture?.(pointerId);
          }
        } catch {
          // Pointer capture may already be released.
        }

        fabCreation.requestEntityEdit({
          entityType: "HABIT",
          entityId: habit.id,
          title: habit.name,
          originRect: getMatrixFabOriginRect(element),
        });
      }, MATRIX_CARD_LONG_PRESS_MS);
    },
    [cancelLongPress, completing, fabCreation, habit.id, habit.name]
  );

  const handleCardPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = longPressStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;

      const deltaX = Math.abs(event.clientX - start.x);
      const deltaY = Math.abs(event.clientY - start.y);

      if (
        deltaX > MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE ||
        deltaY > MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE
      ) {
        cancelLongPress(event);
      }
    },
    [cancelLongPress]
  );

  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressTapUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  const completeHabit = useCallback(() => {
    if (completing || Date.now() < suppressTapUntilRef.current) return;
    onComplete(habit.id, isCompletedToday);
  }, [completing, habit.id, isCompletedToday, onComplete]);

  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (completing) return;
      completeHabit();
    },
    [completeHabit, completing]
  );

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (completing) {
      event.stopPropagation();
      return;
    }
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [completing]);

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (completing || Date.now() < suppressTapUntilRef.current) {
        event.stopPropagation();
        return;
      }
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = Math.abs(touch.clientX - start.x);
      const deltaY = Math.abs(touch.clientY - start.y);
      if (deltaX > 12 || deltaY > 12) return;

      const now = Date.now();
      const habitId = event.currentTarget.dataset.habitId ?? "";
      const lastTap = lastTapRef.current;
      if (
        lastTap?.habitId === habitId &&
        now - lastTap.time <= SCHEDULED_EVENT_DOUBLE_TAP_MS
      ) {
        lastTapRef.current = null;
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
        completeHabit();
        return;
      }

      lastTapRef.current = {
        habitId,
        time: now,
      };
    },
    [completeHabit, completing]
  );

  return (
    <div
      data-habit-id={habit.id}
      onClickCapture={handleClickCapture}
      onDoubleClick={handleDoubleClick}
      onPointerDownCapture={handleCardPointerDown}
      onPointerMoveCapture={handleCardPointerMove}
      onPointerUpCapture={cancelLongPress}
      onPointerCancelCapture={cancelLongPress}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          cancelLongPress(event);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={cn(
        "matrix-event-card-shell h-full",
        completing ? "opacity-70" : null
      )}
    >
      <MatrixHabitCard
        glyph={habit.glyph}
        title={habit.name}
        pill={isCompletedToday ? "COMPLETE" : dueLabel}
        habitType={habit.habit_type}
        overdue={isCompletedToday ? false : (habit.dueStatus?.isOverdue ?? false)}
        completed={isCompletedToday}
        density={density}
      />
    </div>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[96px] items-center rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
      <p className="text-sm text-white/50">{label}</p>
    </div>
  );
}

function MatrixViewPill({
  label,
  selected = false,
  disabled = false,
  onClick,
}: {
  label?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-16 items-center justify-center rounded-full border px-3 text-[10px] font-semibold leading-none text-zinc-500 backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
        selected
          ? "border-zinc-500/35 bg-zinc-300/[0.085] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.065)]"
          : "border-zinc-700/40 bg-zinc-900/35 text-zinc-600",
        disabled
          ? "cursor-default opacity-70"
          : "hover:border-zinc-500/35 hover:bg-zinc-800/40 hover:text-zinc-400"
      )}
    >
      {label ?? <span aria-hidden="true">&nbsp;</span>}
    </button>
  );
}

function MatrixSettingsTray({
  activeView,
  onViewChange,
}: {
  activeView: MatrixView;
  onViewChange(view: MatrixView): void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-700/35 bg-zinc-950/55 px-3.5 py-3 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl">
      <div className="space-y-3.5">
        <section className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-zinc-600">
            Views
          </h2>
          <div className="flex flex-wrap gap-2">
            <MatrixViewPill
              label="Monuments"
              selected={activeView === "monuments"}
              onClick={() => onViewChange("monuments")}
            />
            <MatrixViewPill
              label="Skills"
              selected={activeView === "skills"}
              onClick={() => onViewChange("skills")}
            />
            <MatrixViewPill
              label="Block"
              selected={activeView === "blocks"}
              onClick={() => onViewChange("blocks")}
            />
            <MatrixViewPill disabled />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-zinc-600">
            Adjust
          </h2>
          <p className="text-[11px] font-medium text-zinc-600">
            No content yet
          </p>
        </section>
      </div>
    </div>
  );
}

function MatrixMonumentCarousel({
  group,
  matrixView,
  revealIndex = 0,
  onCompleteScheduledEvent,
  onCompleteDueHabit,
  completingDueHabitIds,
}: {
  group: MatrixMonumentGroup;
  matrixView: MatrixView;
  revealIndex?: number;
  onCompleteScheduledEvent(
    instanceId: string,
    nextStatus: ScheduleInstance["status"]
  ): void;
  onCompleteDueHabit(habitId: string, completedToday: boolean): void;
  completingDueHabitIds: Set<string>;
}) {
  const [matrixPanel, setMatrixPanel] = useState<MatrixPanel>("scheduled");
  const [cardDensity, setCardDensity] = useState<MatrixCardDensity>("large");
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [hasInitialRevealCompleted, setHasInitialRevealCompleted] =
    useState(false);
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [matrixPanelHeight, setMatrixPanelHeight] = useState<number | null>(
    null
  );
  const [matrixPanelDragOffset, setMatrixPanelDragOffset] = useState(0);
  const [matrixPanelViewportWidth, setMatrixPanelViewportWidth] = useState(0);
  const [matrixPanelTransitionEnabled, setMatrixPanelTransitionEnabled] =
    useState(false);
  const matrixPanelViewportRef = useRef<HTMLDivElement | null>(null);
  const scheduledPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsGroupOpen(false);
    setHasInitialRevealCompleted(false);

    const autoOpenDelay =
      MATRIX_GROUP_FIRST_AUTO_OPEN_DELAY_MS +
      Math.min(revealIndex, 7) * MATRIX_GROUP_AUTO_OPEN_STAGGER_MS;

    const autoOpenTimeout = window.setTimeout(() => {
      setIsGroupOpen(true);
    }, autoOpenDelay);

    return () => {
      window.clearTimeout(autoOpenTimeout);
    };
  }, [group.key, revealIndex]);
  const unscheduledPanelRef = useRef<HTMLDivElement | null>(null);
  const matrixPanelWheelLockedRef = useRef(false);
  const matrixPanelWheelCooldownRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const matrixPanelDragStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const matrixPanelTouchRef = useRef<{
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
    axis: MatrixPanelSwipeAxis;
    width: number;
  } | null>(null);
  const scheduledMatrixHabitIds = useMemo(() => {
    const habitIds = new Set<string>();

    for (const event of group.scheduledItems) {
      const isScheduledHabit =
        event.instance.source_type === "HABIT" || Boolean(event.habit);
      if (!isScheduledHabit) continue;

      const habitId = normalizeMatrixSourceId(event.habit?.id);
      const sourceId = normalizeMatrixSourceId(event.instance.source_id);

      if (habitId) habitIds.add(habitId);
      if (sourceId) habitIds.add(sourceId);
    }

    return habitIds;
  }, [group.scheduledItems]);
  const visibleUnscheduledDueHabits = useMemo(
    () =>
      group.unscheduledDueHabits.filter(
        (habit) => !scheduledMatrixHabitIds.has(normalizeMatrixSourceId(habit.id))
      ),
    [group.unscheduledDueHabits, scheduledMatrixHabitIds]
  );
  const activeScheduledItems = group.scheduledItems;
  const availableMatrixPanels = useMemo<MatrixPanel[]>(() => {
    const panels: MatrixPanel[] = [];
    if (activeScheduledItems.length > 0) panels.push("scheduled");
    if (visibleUnscheduledDueHabits.length > 0) panels.push("unscheduled");
    return panels;
  }, [activeScheduledItems.length, visibleUnscheduledDueHabits.length]);
  const canSwitchMatrixPanels = availableMatrixPanels.length > 1;
  const activeMatrixPanelIndex = Math.max(
    0,
    availableMatrixPanels.indexOf(matrixPanel)
  );
  const maxMatrixPanelTransform =
    -Math.max(0, availableMatrixPanels.length - 1) * matrixPanelViewportWidth;
  const matrixPanelBaseTransform =
    matrixPanelViewportWidth > 0
      ? -activeMatrixPanelIndex * matrixPanelViewportWidth
      : 0;
  const matrixPanelTrackTransform = Math.max(
    maxMatrixPanelTransform,
    Math.min(0, matrixPanelBaseTransform + matrixPanelDragOffset)
  );
  const activeMatrixPanel =
    availableMatrixPanels[activeMatrixPanelIndex] ??
    availableMatrixPanels[0] ??
    matrixPanel;
  const activeMatrixPanelLabel = MATRIX_PANEL_LABELS[activeMatrixPanel];
  const sortedScheduledItems = useMemo(
    () => sortMatrixScheduledItems(activeScheduledItems),
    [activeScheduledItems]
  );
  const sortedUnscheduledDueHabits = useMemo(
    () => sortMatrixDueHabits(visibleUnscheduledDueHabits),
    [visibleUnscheduledDueHabits]
  );
  const matrixLibraryGridClass =
    cardDensity === "small"
      ? MATRIX_LIBRARY_SMALL_GRID_CLASS
      : MATRIX_LIBRARY_GRID_CLASS;
  const isSmallCardDensity = cardDensity === "small";

  const getMatrixPanelElement = useCallback((panel: MatrixPanel) => {
    return panel === "unscheduled"
      ? unscheduledPanelRef.current
      : scheduledPanelRef.current;
  }, []);

  const getMatrixPanelHeight = useCallback(
    (panel: MatrixPanel) => {
      const panelElement = getMatrixPanelElement(panel);
      return panelElement ? Math.ceil(panelElement.scrollHeight) : null;
    },
    [getMatrixPanelElement]
  );

  const handleMatrixPanelChange = useCallback(
    (panel: MatrixPanel) => {
      if (!availableMatrixPanels.includes(panel)) return;
      const nextHeight = getMatrixPanelHeight(panel);
      if (nextHeight) {
        setMatrixPanelHeight(nextHeight);
      }
      setMatrixPanelDragOffset(0);
      setMatrixPanel(panel);
    },
    [availableMatrixPanels, getMatrixPanelHeight]
  );

  const measureActiveMatrixPanel = useCallback(() => {
    const nextHeight = getMatrixPanelHeight(matrixPanel);
    if (!nextHeight) return;

    setMatrixPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [getMatrixPanelHeight, matrixPanel]);

  const cardDensityPreferenceKey = `${matrixView}:${group.key}`;

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedPreferences = window.localStorage.getItem(
        MATRIX_CARD_DENSITY_STORAGE_KEY
      );
      const parsedPreferences = storedPreferences
        ? JSON.parse(storedPreferences)
        : null;
      const storedDensity = parsedPreferences?.[cardDensityPreferenceKey];

      if (storedDensity === "large" || storedDensity === "small") {
        setCardDensity(storedDensity);
      } else {
        setCardDensity("large");
      }
    } catch {
      setCardDensity("large");
    }
  }, [cardDensityPreferenceKey]);

  const handleCardDensityToggle = useCallback(() => {
    setCardDensity((currentDensity) => {
      const nextDensity = currentDensity === "large" ? "small" : "large";

      if (typeof window !== "undefined") {
        try {
          const storedPreferences = window.localStorage.getItem(
            MATRIX_CARD_DENSITY_STORAGE_KEY
          );
          const parsedPreferences = storedPreferences
            ? JSON.parse(storedPreferences)
            : {};
          const nextPreferences =
            parsedPreferences && typeof parsedPreferences === "object"
              ? parsedPreferences
              : {};

          nextPreferences[cardDensityPreferenceKey] = nextDensity;

          window.localStorage.setItem(
            MATRIX_CARD_DENSITY_STORAGE_KEY,
            JSON.stringify(nextPreferences)
          );
        } catch {
          // Ignore localStorage failures; density can still update for this session.
        }
      }

      return nextDensity;
    });
  }, [cardDensityPreferenceKey]);

  const toggleGroupOpen = useCallback(() => {
    setIsGroupOpen((currentOpen) => !currentOpen);
  }, []);

  const handleGroupHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleGroupOpen();
    },
    [toggleGroupOpen]
  );

  const stopHeaderTogglePropagation = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    []
  );

  const stopHeaderToggleKeyPropagation = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    []
  );

  useLayoutEffect(() => {
    if (!isGroupOpen) return;

    const viewportElement = matrixPanelViewportRef.current;
    if (!viewportElement) return;

    const measureViewportWidth = () => {
      setMatrixPanelViewportWidth(viewportElement.clientWidth);
    };

    measureViewportWidth();

    const animationFrameId =
      typeof window === "undefined"
        ? null
        : window.requestAnimationFrame(measureViewportWidth);

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
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureViewportWidth);
    };
  }, [isGroupOpen, availableMatrixPanels.length]);

  useEffect(() => {
    setMatrixPanelDragOffset(0);
    setMatrixPanelTransitionEnabled(true);
  }, []);

  useEffect(() => {
    const firstAvailablePanel = availableMatrixPanels[0];
    if (!firstAvailablePanel || availableMatrixPanels.includes(matrixPanel)) {
      return;
    }

    setMatrixPanelDragOffset(0);
    setMatrixPanel(firstAvailablePanel);
  }, [availableMatrixPanels, matrixPanel]);

  useLayoutEffect(() => {
    measureActiveMatrixPanel();
  }, [
    cardDensity,
    activeScheduledItems,
    isGroupOpen,
    measureActiveMatrixPanel,
    openGoalId,
    visibleUnscheduledDueHabits,
  ]);

  useEffect(() => {
    if (!isGroupOpen) return;

    const activePanel =
      matrixPanel === "unscheduled"
        ? unscheduledPanelRef.current
        : scheduledPanelRef.current;

    if (!activePanel) return;

    measureActiveMatrixPanel();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureActiveMatrixPanel();
          });
    resizeObserver?.observe(activePanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureActiveMatrixPanel);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureActiveMatrixPanel);
    };
  }, [isGroupOpen, matrixPanel, measureActiveMatrixPanel]);

  useEffect(() => {
    return () => {
      if (matrixPanelWheelCooldownRef.current) {
        clearTimeout(matrixPanelWheelCooldownRef.current);
      }
    };
  }, []);

  const handleMatrixPanelPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "pen" && event.pointerType !== "mouse") {
        return;
      }
      if (!canSwitchMatrixPanels) return;

      matrixPanelDragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };
    },
    [canSwitchMatrixPanels]
  );

  const handleMatrixPanelPointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = matrixPanelDragStartRef.current;
      if (!canSwitchMatrixPanels) {
        matrixPanelDragStartRef.current = null;
        return;
      }
      if (!start || start.pointerId !== event.pointerId) return;
      matrixPanelDragStartRef.current = null;

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const horizontalDistance = Math.abs(deltaX);

      if (
        horizontalDistance < 48 ||
        horizontalDistance < Math.abs(deltaY) * 1.35
      ) {
        return;
      }

      const nextPanelIndex = activeMatrixPanelIndex + (deltaX < 0 ? 1 : -1);
      const nextPanel = availableMatrixPanels[nextPanelIndex];
      if (nextPanel) {
        handleMatrixPanelChange(nextPanel);
      }
    },
    [
      activeMatrixPanelIndex,
      availableMatrixPanels,
      canSwitchMatrixPanels,
      handleMatrixPanelChange,
    ]
  );

  const resetMatrixPanelTouch = useCallback(() => {
    matrixPanelTouchRef.current = null;
    setMatrixPanelDragOffset(0);
  }, []);

  const handleMatrixPanelTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (event.touches.length !== 1) {
        resetMatrixPanelTouch();
        return;
      }
      if (!canSwitchMatrixPanels) return;

      const touch = event.touches[0];
      matrixPanelTouchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        deltaX: 0,
        deltaY: 0,
        axis: null,
        width: event.currentTarget.clientWidth,
      };
      setMatrixPanelDragOffset(0);
    },
    [canSwitchMatrixPanels, resetMatrixPanelTouch]
  );

  const handleMatrixPanelTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!canSwitchMatrixPanels) return;

      const gesture = matrixPanelTouchRef.current;
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
      const baseTransform = -activeMatrixPanelIndex * width;
      const nextTransform = Math.max(
        -width,
        Math.min(0, baseTransform + deltaX)
      );
      setMatrixPanelDragOffset(nextTransform - baseTransform);
    },
    [activeMatrixPanelIndex, canSwitchMatrixPanels]
  );

  const handleMatrixPanelTouchEnd = useCallback(() => {
    const gesture = matrixPanelTouchRef.current;
    if (!canSwitchMatrixPanels) {
      matrixPanelTouchRef.current = null;
      setMatrixPanelDragOffset(0);
      return;
    }
    if (!gesture) return;

    matrixPanelTouchRef.current = null;
    setMatrixPanelDragOffset(0);

    if (gesture.axis !== "horizontal") return;

    const horizontalDistance = Math.abs(gesture.deltaX);
    const releaseThreshold = Math.min(45, Math.max(28, gesture.width * 0.2));
    if (
      horizontalDistance < releaseThreshold ||
      horizontalDistance < Math.abs(gesture.deltaY) * 1.15
    ) {
      return;
    }

    const nextPanelIndex =
      activeMatrixPanelIndex + (gesture.deltaX < 0 ? 1 : -1);
    const nextPanel = availableMatrixPanels[nextPanelIndex];
    if (nextPanel) {
      handleMatrixPanelChange(nextPanel);
    }
  }, [
    activeMatrixPanelIndex,
    availableMatrixPanels,
    canSwitchMatrixPanels,
    handleMatrixPanelChange,
  ]);

  const handleMatrixPanelWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!canSwitchMatrixPanels) return;

      const horizontalDistance = Math.abs(event.deltaX);
      if (
        horizontalDistance < 28 ||
        horizontalDistance <= Math.abs(event.deltaY)
      ) {
        return;
      }

      const nextPanelIndex = activeMatrixPanelIndex + (event.deltaX < 0 ? 1 : -1);
      const nextPanel = availableMatrixPanels[nextPanelIndex];
      if (!nextPanel || nextPanel === matrixPanel || matrixPanelWheelLockedRef.current) {
        return;
      }

      event.preventDefault();
      matrixPanelWheelLockedRef.current = true;
      handleMatrixPanelChange(nextPanel);

      if (matrixPanelWheelCooldownRef.current) {
        clearTimeout(matrixPanelWheelCooldownRef.current);
      }
      matrixPanelWheelCooldownRef.current = setTimeout(() => {
        matrixPanelWheelLockedRef.current = false;
        matrixPanelWheelCooldownRef.current = null;
      }, 650);
    },
    [
      activeMatrixPanelIndex,
      availableMatrixPanels,
      canSwitchMatrixPanels,
      handleMatrixPanelChange,
      matrixPanel,
    ]
  );

  const revealDelay = Math.min(revealIndex, 7) * 0.06;
  const groupRevealDelay = 0;

  return (
    <MatrixCard className={cn("p-3 sm:p-4", isSmallCardDensity ? "matrix-card--small-cards" : null)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isGroupOpen}
        aria-label={`${isGroupOpen ? "Collapse" : "Expand"} ${group.title} Matrix group`}
        onClick={toggleGroupOpen}
        onKeyDown={handleGroupHeaderKeyDown}
        className={cn(
          "flex min-h-8 cursor-pointer items-center justify-between gap-3 px-0 outline-none transition sm:px-1",
          isGroupOpen ? "mb-3" : null,
          "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-4 focus-visible:ring-offset-[#08090b]"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-base">
            {group.energyLevel ? (
              <FlameEmber level={group.energyLevel} size="sm" />
            ) : (
              (group.emoji ?? "◇")
            )}
          </span>
          <h3 className="truncate text-[13px] font-semibold text-white/88">
            {group.title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-semibold leading-none text-white/70">
            {activeMatrixPanelLabel}
          </span>
          <button
            type="button"
            aria-label={
              isSmallCardDensity
                ? "Use large Matrix cards"
                : "Use small Matrix cards"
            }
            onClick={(event) => {
              stopHeaderTogglePropagation(event);
              handleCardDensityToggle();
            }}
            onKeyDown={stopHeaderToggleKeyPropagation}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              isSmallCardDensity
                ? "text-zinc-300 shadow-[0_0_16px_-8px_rgba(255,255,255,0.72)]"
                : null
            )}
          >
            {isSmallCardDensity ? (
              <Grid2x2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            ) : (
              <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            )}
          </button>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-white/28 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              isGroupOpen ? "rotate-180" : null
            )}
            strokeWidth={1.8}
            aria-hidden
          />
        </div>
      </div>
      <AnimatePresence>
        {isGroupOpen ? (
          <motion.div
            key="matrix-group-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: {
                  duration: 1.18,
                  ease: MATRIX_GROUP_OPEN_EASE,
                  delay: groupRevealDelay,
                },
                opacity: {
                  duration: 0.68,
                  ease: MATRIX_GROUP_OPEN_EASE,
                  delay: groupRevealDelay + 0.08,
                },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: {
                  duration: 0.42,
                  ease: MATRIX_GROUP_CLOSE_EASE,
                },
                opacity: {
                  duration: 0.22,
                  ease: MATRIX_GROUP_CLOSE_EASE,
                },
              },
            }}
            onAnimationComplete={() => {
              setHasInitialRevealCompleted(true);
            }}
            className="overflow-hidden"
          >
            <motion.div
              initial={{ y: -4, opacity: 0 }}
              animate={{
                y: 0,
                opacity: 1,
                transition: {
                  duration: 0.82,
                  ease: MATRIX_GROUP_OPEN_EASE,
                  delay: groupRevealDelay + 0.05,
                },
              }}
              exit={{
                y: -3,
                opacity: 0,
                transition: {
                  duration: 0.24,
                  ease: MATRIX_GROUP_CLOSE_EASE,
                },
              }}
            >
              <div
                className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={
                  matrixPanelHeight ? { height: matrixPanelHeight } : undefined
                }
                onPointerDown={handleMatrixPanelPointerDown}
                onPointerUp={handleMatrixPanelPointerEnd}
                onTouchStart={handleMatrixPanelTouchStart}
                onTouchMove={handleMatrixPanelTouchMove}
                onTouchEnd={handleMatrixPanelTouchEnd}
                onTouchCancel={resetMatrixPanelTouch}
                onWheel={handleMatrixPanelWheel}
                onPointerCancel={() => {
                  matrixPanelDragStartRef.current = null;
                }}
              >
                <div ref={matrixPanelViewportRef} className="absolute inset-0">
                  <div
                    className="flex h-full transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      transform: `translate3d(${matrixPanelTrackTransform}px, 0, 0)`,
                      transitionDuration:
                        !matrixPanelTransitionEnabled || matrixPanelDragOffset
                          ? "0ms"
                          : undefined,
                      width: `${Math.max(1, availableMatrixPanels.length) * 100}%`,
                    }}
                  >
                    {availableMatrixPanels.map((panel) => (
                      <div
                        key={panel}
                        className="h-full shrink-0 overflow-hidden"
                        style={{
                          width: `${100 / Math.max(1, availableMatrixPanels.length)}%`,
                        }}
                      >
                        {panel === "scheduled" ? (
                          <div ref={scheduledPanelRef} className="px-1 py-1">
                            <div
                              className={cn(
                                matrixLibraryGridClass,
                                isSmallCardDensity
                                  ? "matrix-event-grid--small-cards"
                                  : null
                              )}
                            >
                              {sortedScheduledItems.map((event) => (
                                <ScheduledEventCard
                                  key={event.instance.id}
                                  event={event}
                                  density={cardDensity}
                                  onComplete={onCompleteScheduledEvent}
                                  open={
                                    Boolean(event.goal?.id) &&
                                    openGoalId === event.goal?.id
                                  }
                                  onOpenChange={(nextOpen) =>
                                    setOpenGoalId(
                                      nextOpen && event.goal?.id
                                        ? event.goal.id
                                        : null
                                    )
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div ref={unscheduledPanelRef} className="px-1 py-1">
                            <div
                              className={cn(
                                matrixLibraryGridClass,
                                isSmallCardDensity
                                  ? "matrix-event-grid--small-cards"
                                  : null
                              )}
                            >
                              {sortedUnscheduledDueHabits.map((habit) => (
                                <DueHabitCard
                                  key={habit.id}
                                  habit={habit}
                                  density={cardDensity}
                                  completing={completingDueHabitIds.has(
                                    habit.id
                                  )}
                                  onComplete={onCompleteDueHabit}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {availableMatrixPanels.map((panel) => {
                  const isActive = matrixPanel === panel;
                  return (
                    <button
                      key={panel}
                      type="button"
                      aria-label={
                        panel === "scheduled"
                          ? "Show scheduled Events"
                          : "Show unscheduled due habits"
                      }
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => handleMatrixPanelChange(panel)}
                      className={`h-1 rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isActive
                          ? "w-4 bg-zinc-500/75"
                          : "w-1 bg-zinc-700/70 hover:bg-zinc-600/80"
                      }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <style jsx global>{`
        @media (max-width: 520px) {
          .matrix-event-grid--small-cards.goal-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0.4rem;
            padding-left: 0;
            padding-right: 0;
          }
        }
      `}</style>
    </MatrixCard>
  );
}

function MatrixContent() {
  const { user } = useAuth();
  const { localTimeZone } = useProfile();
  const timeZone = useMemo(
    () => normalizeTimeZone(localTimeZone ?? getBrowserTimeZone()),
    [localTimeZone]
  );
  const [state, setState] = useState<MatrixState>(initialState);
  const [matrixView, setMatrixView] = useState<MatrixView>("monuments");
  const [isMatrixTrayOpen, setIsMatrixTrayOpen] = useState(false);
  const [matrixTrayHeight, setMatrixTrayHeight] = useState(0);
  const [completingDueHabitIds, setCompletingDueHabitIds] = useState<
    Set<string>
  >(new Set());
  const matrixTrayRef = useRef<HTMLDivElement | null>(null);
  const completingDueHabitIdsRef = useRef<Set<string>>(new Set());

  const handleCompleteScheduledEvent = useCallback(
    async (instanceId: string, nextStatus: ScheduleInstance["status"]) => {
      if (!user?.id) return;

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        console.error("Supabase client is not available.");
        return;
      }

      const { error } = await supabase
        .from("schedule_instances")
        .update({ status: nextStatus })
        .eq("id", instanceId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to toggle scheduled Matrix Event", error);
        return;
      }

      const updateScheduledEventGroups = (
        groups: MonumentGroup<MatrixEvent>[]
      ) =>
        groups.map((group) => ({
          ...group,
          items: group.items.map((event) =>
            event.instance.id === instanceId
              ? {
                  ...event,
                  instance: {
                    ...event.instance,
                    status: nextStatus,
                  },
                }
              : event
          ),
        }));

      setState((current) => ({
        ...current,
        eventGroups: updateScheduledEventGroups(current.eventGroups),
        skillEventGroups: updateScheduledEventGroups(current.skillEventGroups),
        blockEventGroups: updateScheduledEventGroups(current.blockEventGroups),
      }));
    },
    [user?.id]
  );

  const handleCompleteDueHabit = useCallback(
    async (habitId: string, completedToday: boolean) => {
      if (!user?.id) return;

      if (completingDueHabitIdsRef.current.has(habitId)) return;
      completingDueHabitIdsRef.current.add(habitId);
      setCompletingDueHabitIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(habitId);
        return nextIds;
      });

      try {
        const action = completedToday ? "undo" : "complete";
        const completedAt = new Date().toISOString();
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
          throw new Error(
            `Habit completion toggle failed with status ${response.status}`
          );
        }

        setState((current) => {
          const updateHabitInGroups = (
            groups: MonumentGroup<MatrixHabit>[]
          ) => {
            return groups
              .map((group) => {
                const items = group.items.flatMap((habit) => {
                  if (habit.id !== habitId) return [habit];

                  if (!completedToday) {
                    return [
                      {
                        ...habit,
                        last_completed_at: completedAt,
                        next_due_override: null,
                        dueStatus: {
                          isDue: true,
                          isOverdue: false,
                          isCompletedToday: true,
                          label: "COMPLETE" as const,
                        },
                      },
                    ];
                  }

                  const undoneHabit = {
                    ...habit,
                    last_completed_at: null,
                  };
                  const dueStatus = getMatrixHabitDueStatus(
                    undoneHabit,
                    new Date(),
                    timeZone
                  );

                  if (!dueStatus.isDue) return [];

                  return [
                    {
                      ...undoneHabit,
                      dueStatus,
                    },
                  ];
                });

                return {
                  ...group,
                  items,
                };
              })
              .filter((group) => group.items.length > 0);
          };

          return {
            ...current,
            unscheduledDueHabitGroups: updateHabitInGroups(
              current.unscheduledDueHabitGroups
            ),
            skillUnscheduledDueHabitGroups: updateHabitInGroups(
              current.skillUnscheduledDueHabitGroups
            ),
            blockUnscheduledDueHabitGroups: updateHabitInGroups(
              current.blockUnscheduledDueHabitGroups
            ),
          };
        });
      } catch (error) {
        console.error("Failed to toggle due Matrix habit", error);
      } finally {
        completingDueHabitIdsRef.current.delete(habitId);
        setCompletingDueHabitIds((currentIds) => {
          if (!currentIds.has(habitId)) return currentIds;
          const nextIds = new Set(currentIds);
          nextIds.delete(habitId);
          return nextIds;
        });
      }
    },
    [timeZone, user?.id]
  );

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    let cancelled = false;

    async function loadMatrix() {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setState({
          ...initialState,
          loading: false,
          error: "Supabase client is not available.",
        });
        return;
      }

      const today = new Date();
      const dayStart = startOfDayInTimeZone(today, timeZone);
      const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);

      try {
        setState((current) => ({ ...current, loading: true, error: null }));

        const { data: instanceData, error: instanceError } = await supabase
          .from("schedule_instances")
          .select(
            "id, source_id, source_type, start_utc, end_utc, status, weight_snapshot, event_name, time_block_id, day_type_time_block_id, energy_resolved"
          )
          .eq("user_id", userId)
          .in("source_type", ["PROJECT", "HABIT"])
          .in("status", ["scheduled", "in_progress", "completed"])
          .lt("start_utc", dayEnd.toISOString())
          .gt("end_utc", dayStart.toISOString())
          .order("start_utc", { ascending: true });

        if (instanceError) throw instanceError;

        const instances = (instanceData ?? []) as ScheduleInstance[];
        const projectIds = instances
          .filter((item) => item.source_type === "PROJECT")
          .map((item) => item.source_id);
        const scheduledHabitIds = new Set(
          instances
            .filter((item) => item.source_type === "HABIT")
            .map((item) => normalizeMatrixSourceId(item.source_id))
            .filter(Boolean)
        );
        const timeBlockIds = Array.from(
          new Set(
            instances
              .map((item) => item.time_block_id)
              .filter((id): id is string => Boolean(id))
          )
        );
        const dayTypeTimeBlockIds = Array.from(
          new Set(
            instances
              .map((item) => item.day_type_time_block_id)
              .filter((id): id is string => Boolean(id))
          )
        );

        const monumentsPromise = getMonumentsForUser(userId).catch((error) => {
          console.error("Failed to load Matrix monuments", error);
          return [] as Monument[];
        });

        const [
          habitResult,
          allHabitsResult,
          goalResult,
          skillResult,
          timeBlockResult,
          dayTypeTimeBlockByIdResult,
          dayTypeTimeBlockByBlockResult,
          monuments,
        ] =
          await Promise.all([
            scheduledHabitIds.size
              ? supabase
                  .from("habits")
                  .select(
                    "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override"
                  )
                  .eq("user_id", userId)
                  .in("id", Array.from(scheduledHabitIds))
              : Promise.resolve({ data: [], error: null }),
            supabase
              .from("habits")
              .select(
                "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override"
              )
              .eq("user_id", userId),
            supabase
              .from("goals")
              .select("id, name, monument_id")
              .eq("user_id", userId),
            supabase
              .from("skills")
              .select("id, name, monument_id, icon")
              .eq("user_id", userId),
            timeBlockIds.length
              ? supabase
                  .from("time_blocks")
                  .select("id, label, start_local, end_local")
                  .eq("user_id", userId)
                  .in("id", timeBlockIds)
              : Promise.resolve({ data: [], error: null }),
            dayTypeTimeBlockIds.length
              ? supabase
                  .from("day_type_time_blocks")
                  .select("id, time_block_id, energy")
                  .eq("user_id", userId)
                  .in("id", dayTypeTimeBlockIds)
              : Promise.resolve({ data: [], error: null }),
            timeBlockIds.length
              ? supabase
                  .from("day_type_time_blocks")
                  .select("id, time_block_id, energy")
                  .eq("user_id", userId)
                  .in("time_block_id", timeBlockIds)
              : Promise.resolve({ data: [], error: null }),
            monumentsPromise,
          ]);

        if (habitResult.error) throw habitResult.error;
        if (allHabitsResult.error) throw allHabitsResult.error;
        if (goalResult.error) throw goalResult.error;
        if (skillResult.error) throw skillResult.error;
        if (timeBlockResult.error) throw timeBlockResult.error;
        if (dayTypeTimeBlockByIdResult.error)
          throw dayTypeTimeBlockByIdResult.error;
        if (dayTypeTimeBlockByBlockResult.error)
          throw dayTypeTimeBlockByBlockResult.error;

        const allProjectIds = Array.from(new Set(projectIds));

        const projectResult = allProjectIds.length
          ? await supabase
              .from("projects")
              .select(
                `
                  id, name, goal_id, stage, completed_at, duration_min, created_at, due_date,
                  priority,
                  energy,
                  tasks (
                    id, project_id, stage, name, skill_id, priority
                  ),
                  project_skills (
                    skill_id
                  )
                `
              )
              .eq("user_id", userId)
              .in("id", allProjectIds)
          : { data: [], error: null };

        if (projectResult.error) throw projectResult.error;

        const skillIdToMonumentId = new Map<string, string>();
        const skillIdToIcon = new Map<string, string>();
        const skillLookup = new Map<string, SkillRow>();
        for (const skill of (skillResult.data ?? []) as SkillRow[]) {
          skillLookup.set(skill.id, skill);
          if (skill.id && skill.monument_id) {
            skillIdToMonumentId.set(skill.id, skill.monument_id);
          }
          if (skill.id && skill.icon) {
            skillIdToIcon.set(skill.id, skill.icon);
          }
        }
        const monumentIdToEmoji = new Map(
          monuments
            .filter((monument) => monument.emoji)
            .map((monument) => [monument.id, monument.emoji as string])
        );

        const projectMap = new Map(
          ((projectResult.data ?? []) as ProjectRow[]).map((project) => [
            project.id,
            project,
          ])
        );
        const habitMap = new Map(
          ((habitResult.data ?? []) as HabitRow[]).map((habit) => [
            habit.id,
            habit,
          ])
        );
        const goalMap = new Map(
          ((goalResult.data ?? []) as GoalRow[]).map((goal) => [goal.id, goal])
        );
        const timeBlockMap = new Map(
          ((timeBlockResult.data ?? []) as TimeBlockRow[]).map((block) => [
            block.id,
            block,
          ])
        );
        const dayTypeTimeBlockRows = [
          ...((dayTypeTimeBlockByIdResult.data ?? []) as DayTypeTimeBlockRow[]),
          ...((dayTypeTimeBlockByBlockResult.data ??
            []) as DayTypeTimeBlockRow[]),
        ];
        const dayTypeTimeBlockById = new Map<string, DayTypeTimeBlockRow>();
        const dayTypeTimeBlockByTimeBlockId = new Map<
          string,
          DayTypeTimeBlockRow
        >();
        for (const row of dayTypeTimeBlockRows) {
          if (row.id) {
            dayTypeTimeBlockById.set(row.id, row);
          }
          if (row.time_block_id && !dayTypeTimeBlockByTimeBlockId.has(row.time_block_id)) {
            dayTypeTimeBlockByTimeBlockId.set(row.time_block_id, row);
          }
        }

        const events = buildMatrixEvents({
          instances,
          projects: projectMap,
          habits: habitMap,
          goals: goalMap,
          skillIdToMonumentId,
          skillIdToIcon,
          monumentIdToEmoji,
          date: today,
          timeZone,
        });
        const scheduledTodayHabitIds = new Set(scheduledHabitIds);
        for (const event of events) {
          const habitId = normalizeMatrixSourceId(event.habit?.id ?? event.instance.source_id);
          if (event.instance.source_type === "HABIT" && habitId) {
            scheduledTodayHabitIds.add(habitId);
          }
        }

        const dueHabitRows = ((allHabitsResult.data ?? []) as HabitRow[]).filter(
          (habit) =>
            isHabitDueToday(habit, today, timeZone) ||
            isMatrixHabitCompletedToday(habit, today, timeZone)
        );

        const duplicateScheduledDueHabits = dueHabitRows.filter((habit) =>
          scheduledTodayHabitIds.has(normalizeMatrixSourceId(habit.id))
        );

        if (duplicateScheduledDueHabits.length) {
          console.warn("[Matrix] scheduled habits excluded from Due", {
            scheduledTodayHabitIds: Array.from(scheduledTodayHabitIds),
            duplicates: duplicateScheduledDueHabits.map((habit) => ({
              id: habit.id,
              name: habit.name,
            })),
          });
        }

        const unscheduledDueHabits = dueHabitRows
          .filter((habit) => !scheduledTodayHabitIds.has(normalizeMatrixSourceId(habit.id)))
          .map((habit) => {
            const dueStatus = getMatrixHabitDisplayStatus(
              habit,
              today,
              timeZone
            );

            return {
              ...habit,
              dueStatus,
              monumentId: resolveHabitMonumentId({
                habit,
                goals: goalMap,
                skillIdToMonumentId,
              }),
              glyph: habit.skill_id
                ? (skillIdToIcon.get(habit.skill_id) ??
                  getHabitFallbackGlyph(habit.habit_type))
                : getHabitFallbackGlyph(habit.habit_type),
              skillIds: habit.skill_id ? [habit.skill_id] : [],
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            eventGroups: groupByMonument({ items: events, monuments }),
            unscheduledDueHabitGroups: groupByMonument({
              items: unscheduledDueHabits,
              monuments,
            }),
            skillEventGroups: groupBySkill({
              items: events,
              skills: skillLookup,
            }),
            skillUnscheduledDueHabitGroups: groupBySkill({
              items: unscheduledDueHabits,
              skills: skillLookup,
            }),
            blockEventGroups: groupEventsByBlock({
              items: events,
              timeBlocks: timeBlockMap,
              dayTypeTimeBlockById,
              dayTypeTimeBlockByTimeBlockId,
            }),
            blockUnscheduledDueHabitGroups:
              groupUnscheduledDueHabitsByNoBlock(unscheduledDueHabits),
            dayLabel: formatDayLabel(today, timeZone),
          });
        }
      } catch (error) {
        console.error("Failed to load Matrix", error);
        if (!cancelled) {
          setState({
            ...initialState,
            loading: false,
            error:
                error instanceof Error
                  ? error.message
                  : typeof error === "object" && error !== null && "message" in error
                    ? String((error as { message?: unknown }).message)
                    : "Failed to load Matrix.",
          });
        }
      }
    }

    loadMatrix();

    return () => {
      cancelled = true;
    };
  }, [timeZone, user?.id]);

  const matrixMonumentGroups = useMemo(
    () =>
      mergeMatrixMonumentGroups({
        scheduledGroups: state.eventGroups,
        unscheduledDueHabitGroups: state.unscheduledDueHabitGroups,
      }),
    [state.eventGroups, state.unscheduledDueHabitGroups]
  );

  const matrixSkillGroups = useMemo(
    () =>
      mergeMatrixMonumentGroups({
        scheduledGroups: state.skillEventGroups,
        unscheduledDueHabitGroups: state.skillUnscheduledDueHabitGroups,
      }),
    [state.skillEventGroups, state.skillUnscheduledDueHabitGroups]
  );

  const matrixBlockGroups = useMemo(
    () =>
      mergeMatrixMonumentGroups({
        scheduledGroups: state.blockEventGroups,
        unscheduledDueHabitGroups: state.blockUnscheduledDueHabitGroups,
      }),
    [state.blockEventGroups, state.blockUnscheduledDueHabitGroups]
  );

  const activeMatrixGroups =
    matrixView === "blocks"
      ? matrixBlockGroups
      : matrixView === "skills"
        ? matrixSkillGroups
        : matrixMonumentGroups;
  useLayoutEffect(() => {
    if (!isMatrixTrayOpen) return;

    const trayElement = matrixTrayRef.current;
    if (!trayElement) return;

    const measureTray = () => {
      setMatrixTrayHeight(Math.ceil(trayElement.scrollHeight));
    };

    measureTray();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureTray);
    resizeObserver?.observe(trayElement);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", measureTray);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureTray);
    };
  }, [isMatrixTrayOpen]);

  return (
    <main className="min-h-screen bg-[#030406] px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-1 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <header className="flex items-center justify-between gap-3 px-1 text-zinc-500">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="inline-flex h-6 w-5 items-center justify-center text-[18px] font-medium leading-none text-zinc-500 transition hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              ‹
            </Link>
            <h1 className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">
              MATRIX
            </h1>
          </div>
          <button
            type="button"
            aria-label="Toggle Matrix views"
            aria-expanded={isMatrixTrayOpen}
            onClick={() => setIsMatrixTrayOpen((current) => !current)}
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-600 transition hover:border-zinc-700/45 hover:bg-zinc-900/45 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              isMatrixTrayOpen ? "bg-zinc-900/55 text-zinc-400" : null
            )}
          >
            <LayoutGrid
              className="h-4 w-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        </header>

        <AnimatePresence initial={false}>
          {isMatrixTrayOpen ? (
            <motion.div
              key="matrix-settings-tray"
              initial={{ height: 0, opacity: 0, y: -6 }}
              animate={{
                height: matrixTrayHeight,
                opacity: 1,
                y: 0,
              }}
              exit={{ height: 0, opacity: 0, y: -6 }}
              transition={MATRIX_TRAY_TRANSITION}
              className="overflow-hidden px-1"
            >
              <div ref={matrixTrayRef} className="pb-1">
                <MatrixSettingsTray
                  activeView={matrixView}
                  onViewChange={setMatrixView}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {state.error ? (
          <MatrixCard className="p-4">
            <p className="text-sm text-red-200">{state.error}</p>
          </MatrixCard>
        ) : null}

        <section>
          {state.loading ? (
            <MatrixLoadingRows />
          ) : activeMatrixGroups.length ? (
            <div className="space-y-3">
              {activeMatrixGroups.map((group, index) => (
                <MatrixMonumentCarousel
                  key={group.key}
                  group={group}
                  matrixView={matrixView}
                  revealIndex={index}
                  onCompleteScheduledEvent={handleCompleteScheduledEvent}
                  onCompleteDueHabit={handleCompleteDueHabit}
                  completingDueHabitIds={completingDueHabitIds}
                />
              ))}
            </div>
          ) : (
            <MatrixCard className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <EmptyPanel label="No scheduled Events found for today." />
                <EmptyPanel label="No due habits are waiting outside scheduled Events." />
              </div>
            </MatrixCard>
          )}
        </section>
      </div>
    </main>
  );
}

export default function MatrixPage() {
  return (
    <ProtectedRoute>
      <MatrixContent />
    </ProtectedRoute>
  );
}
