"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeAlert,
  Calendar,
  CircleAlert,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  List,
  OctagonAlert,
  Pin,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { GoalCard } from "@/app/(app)/goals/components/GoalCard";
import {
  RelatedRoutineCard,
  type RelatedRoutineCardHabit,
  type RelatedRoutineCardRoutine,
} from "@/components/habits/RelatedRoutineCard";
import { useFabCreation } from "@/components/ui/FabCreationContext";
import { MemoCompletionDialog } from "@/components/schedule/MemoCompletionDialog";
import { PullRefreshShell } from "@/components/ui/PullRefreshShell";
import type { Goal, Project } from "@/app/(app)/goals/types";
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
import {
  hapticComplete,
  hapticErrorPattern,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
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
  | "memo_capture_config"
  | "routine_id"
  | "routine_position"
>;
type RoutineRow = Pick<
  Database["public"]["Tables"]["habit_routines"]["Row"],
  "id" | "name" | "description" | "icon"
>;

type MatrixEvent = {
  instance: ScheduleInstance;
  title: string;
  monumentId: string | null;
  skillIds: string[];
  glyph: string;
  goal: Goal | null;
  habit: MatrixHabit | null;
  routine: MatrixRoutine | null;
};

type MatrixHabit = HabitRow & {
  monumentId: string | null;
  skillIds: string[];
  skillIcon: string | null;
  glyph: string;
  dueStatus?: MatrixHabitDueStatus;
};
type MatrixRoutineHabit = RelatedRoutineCardHabit & {
  sourceHabit: MatrixHabit;
  sourceInstance?: ScheduleInstance;
  durationMinutes: number | null;
};
type MatrixRoutine = Omit<RelatedRoutineCardRoutine, "habits"> & {
  habits: MatrixRoutineHabit[];
  completed: boolean;
  monumentId: string | null;
  skillIds: string[];
  glyph: string;
  dueHabitCount: number;
  totalDueDurationMinutes: number | null;
  sortRank: number;
};
type MatrixDueItem =
  | {
      kind: "habit";
      id: string;
      name: string;
      monumentId: string | null;
      skillIds: string[];
      habit: MatrixHabit;
    }
  | {
      kind: "routine";
      id: string;
      name: string;
      monumentId: string | null;
      skillIds: string[];
      routine: MatrixRoutine;
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
  unscheduledDueItems: MatrixDueItem[];
};

type MatrixPanel = "scheduled" | "unscheduled";
type MatrixPanelSwipeAxis = "horizontal" | "vertical" | null;
type MatrixCardDensity = "large" | "small" | "row";
type MatrixView = "monuments" | "skills" | "blocks" | "types";
type MatrixScope = "scheduled" | "pinned";
type MatrixTypeGroupKey = "chore" | "habit" | "project" | "sync";
type MatrixReorderHoldScope = "scheduled" | "due";
type MatrixHabitDueStatus = {
  isDue: boolean;
  isOverdue: boolean;
  isCompletedToday?: boolean;
  label: "DUE" | "OVERDUE" | "DUE TODAY" | "COMPLETE";
};
type MatrixHabitDueEvaluation = ReturnType<typeof evaluateHabitDueOnDate>;
type MatrixCardDensityPreferenceMap = Record<string, MatrixCardDensity>;
type MatrixCollapsedGroupPreferences = Partial<Record<MatrixView, string[]>>;
type MatrixPreferences = {
  view?: MatrixView;
  panel?: MatrixPanel;
  scope?: MatrixScope;
  cardDensityByGroup?: MatrixCardDensityPreferenceMap;
  collapsedGroupKeysByView?: MatrixCollapsedGroupPreferences;
};
type MatrixScheduledCompletionOptions = {
  hapticOnComplete?: boolean;
};
type MatrixTag = {
  id: string;
  name: string;
  color: string | null;
  createdAt: string | null;
};
type MatrixTagLookupRow = {
  id: string | null;
  name: string | null;
  color?: string | null;
  created_at?: string | null;
};

const MATRIX_PANEL_LABELS: Record<MatrixPanel, string> = {
  scheduled: "Active",
  unscheduled: "Due",
};

type MatrixState = {
  loading: boolean;
  error: string | null;
  matrixTags: MatrixTag[];
  eventGroups: MonumentGroup<MatrixEvent>[];
  unscheduledDueHabitGroups: MonumentGroup<MatrixDueItem>[];
  skillEventGroups: MonumentGroup<MatrixEvent>[];
  skillUnscheduledDueHabitGroups: MonumentGroup<MatrixDueItem>[];
  blockEventGroups: MonumentGroup<MatrixEvent>[];
  blockUnscheduledDueHabitGroups: MonumentGroup<MatrixDueItem>[];
  typeEventGroups: MonumentGroup<MatrixEvent>[];
  typeUnscheduledDueHabitGroups: MonumentGroup<MatrixDueItem>[];
  dayLabel: string;
};

const initialState: MatrixState = {
  loading: true,
  error: null,
  matrixTags: [],
  eventGroups: [],
  unscheduledDueHabitGroups: [],
  skillEventGroups: [],
  skillUnscheduledDueHabitGroups: [],
  blockEventGroups: [],
  blockUnscheduledDueHabitGroups: [],
  typeEventGroups: [],
  typeUnscheduledDueHabitGroups: [],
  dayLabel: "",
};

const UNLINKED_GROUP_KEY = "__unlinked__";
const NO_BLOCK_GROUP_KEY = "__no_block__";
const MATRIX_TYPE_GROUP_DEFINITIONS: Record<
  MatrixTypeGroupKey,
  { key: string; title: string; emoji: string; sortValue: string }
> = {
  chore: {
    key: "__type_chore__",
    title: "Chore",
    emoji: "◆",
    sortValue: "0",
  },
  habit: {
    key: "__type_habit__",
    title: "Habit",
    emoji: "✦",
    sortValue: "1",
  },
  project: {
    key: "__type_project__",
    title: "Project",
    emoji: "◇",
    sortValue: "2",
  },
  sync: {
    key: "__type_sync__",
    title: "Sync",
    emoji: "◇",
    sortValue: "3",
  },
};
const MATRIX_LIBRARY_GRID_CLASS =
  "-mx-3 grid grid-cols-3 items-stretch gap-2.5 px-3 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
const MATRIX_LIBRARY_SMALL_GRID_CLASS =
  "goal-grid grid w-full max-w-full auto-rows-[108px] grid-cols-[repeat(auto-fit,_minmax(110px,_1fr))] items-stretch gap-1 px-0.5 sm:grid-cols-3 sm:px-2 sm:gap-1 md:grid-cols-4 md:-mx-3 md:px-3 lg:grid-cols-5 xl:grid-cols-6";
const MATRIX_LIBRARY_ROW_LIST_CLASS = "flex w-full min-w-0 flex-col gap-0.5 pt-0.5";
const MATRIX_LIBRARY_CARD_CLASS =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full transform-gpu flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.09),transparent_55%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(17,17,20,0.96)_54%,rgba(31,32,36,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 sm:p-4";
const MATRIX_LIBRARY_SMALL_CARD_CLASS =
  "goal-card group relative flex h-full min-h-[108px] w-full transform-gpu flex-col rounded-xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.09),transparent_55%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(17,17,20,0.96)_54%,rgba(31,32,36,0.72)_100%)] p-[0.65rem_0.45rem] text-white shadow-[0_14px_28px_-24px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30";
const MATRIX_ROW_NEXUS_CARD_CLASS =
  "border-black/70 bg-[radial-gradient(circle_at_0%_0%,rgba(120,126,138,0.28),transparent_58%),linear-gradient(140deg,rgb(8,8,10)_0%,rgb(22,22,26)_42%,rgb(34,35,42)_100%)] shadow-[0_0_0_1px_rgba(255,255,255,0.035),0_10px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] outline outline-1 -outline-offset-1 outline-black/85 hover:border-white/16 hover:brightness-[1.08]";
const MATRIX_ROW_NEXUS_CHORE_CARD_CLASS =
  "border-rose-200/45 bg-[radial-gradient(circle_at_10%_-25%,rgba(248,113,113,0.34),transparent_58%),linear-gradient(135deg,rgb(127,29,29)_0%,rgb(185,28,28)_48%,rgb(168,34,43)_100%)] shadow-[0_18px_36px_rgba(56,16,24,0.38),0_8px_18px_rgba(76,20,32,0.26),inset_0_1px_0_rgba(255,255,255,0.12)] outline outline-1 -outline-offset-1 outline-black/85 hover:border-rose-100/55 hover:brightness-[1.08]";
const MATRIX_ROW_NEXUS_SYNC_CARD_CLASS =
  "border-amber-200/45 bg-[radial-gradient(circle_at_12%_-20%,rgba(226,232,240,0.34),transparent_58%),linear-gradient(135deg,rgb(82,82,91)_0%,rgb(113,113,122)_48%,rgb(124,126,136)_100%)] shadow-[0_18px_36px_rgba(58,44,14,0.32),0_8px_18px_rgba(82,62,18,0.24),inset_0_1px_0_rgba(255,255,255,0.12)] outline outline-1 -outline-offset-1 outline-black/85 hover:border-amber-100/55 hover:brightness-[1.08]";
const MATRIX_ROW_NEXUS_PRACTICE_CARD_CLASS =
  "border-slate-500/50 bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgb(8,9,20)_0%,rgb(24,27,51)_46%,rgb(34,38,70)_100%)] shadow-[0_30px_60px_rgba(2,2,6,0.72),0_12px_28px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.08)] outline outline-1 -outline-offset-1 outline-black/85 hover:border-slate-400/60 hover:brightness-[1.08]";
const MATRIX_ROW_NEXUS_COMPLETED_CARD_CLASS =
  "shimmer-border-complete isolate z-0 overflow-hidden border-transparent bg-[linear-gradient(155deg,rgba(34,197,94,0.94)_0%,rgba(22,163,74,0.97)_48%,rgba(21,128,61,0.98)_100%)] text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45 outline outline-1 outline-green-900/40";
const MATRIX_HABIT_CHORE_CARD_BG_CLASS =
  "!bg-[radial-gradient(circle_at_10%_-25%,rgba(159,18,57,0.32),transparent_58%),linear-gradient(135deg,rgba(31,9,12,0.98)_0%,rgba(76,18,27,0.94)_48%,rgba(111,26,39,0.76)_100%)]";
const MATRIX_HABIT_PRACTICE_CARD_BG_CLASS =
  "!bg-[radial-gradient(circle_at_6%_-14%,rgba(79,70,229,0.22),transparent_60%),linear-gradient(142deg,rgba(8,9,20,0.98)_0%,rgba(24,27,51,0.95)_46%,rgba(50,55,92,0.68)_100%)]";
const MATRIX_HABIT_DEFAULT_CARD_BG_CLASS =
  "bg-[radial-gradient(circle_at_18%_-24%,rgba(255,255,255,0.055),transparent_54%),linear-gradient(145deg,rgba(10,11,14,0.98)_0%,rgba(17,18,22,0.96)_58%,rgba(24,26,31,0.88)_100%)]";
const MATRIX_ROW_PROJECT_CARD_CLASS =
  MATRIX_ROW_NEXUS_CARD_CLASS;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SCHEDULED_EVENT_DOUBLE_TAP_MS = 300;
const MATRIX_CARD_LONG_PRESS_MS = 520;
const MATRIX_CARD_LONG_PRESS_MOVE_TOLERANCE = 12;
const MATRIX_CARD_LONG_PRESS_SUPPRESS_MS = 650;
const MATRIX_COMPLETE_SHIMMER_DURATION_MS = 3000;
const MATRIX_COMPLETION_REORDER_HOLD_MS = 720;
const MATRIX_LOADING_ROW_COUNT = 8;
const MATRIX_GROUP_REVEAL_EASE = [0.22, 1, 0.36, 1] as const;
const MATRIX_REORDER_LAYOUT_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
};

function getMatrixCompleteShimmerStyle() {
  return {
    "--matrix-complete-shimmer-delay": `-${Date.now() % MATRIX_COMPLETE_SHIMMER_DURATION_MS}ms`,
  } as CSSProperties;
}

const MATRIX_PREFERENCES_STORAGE_KEY = "creator:matrix-preferences";
const MATRIX_CARD_DENSITY_STORAGE_KEY = "creator:matrix-card-density-by-group";

function isMatrixView(value: unknown): value is MatrixView {
  return (
    value === "monuments" ||
    value === "skills" ||
    value === "blocks" ||
    value === "types"
  );
}

function isMatrixPanel(value: unknown): value is MatrixPanel {
  return value === "scheduled" || value === "unscheduled";
}

function isMatrixScope(value: unknown): value is MatrixScope {
  return value === "scheduled" || value === "pinned";
}

function isMatrixCardDensity(value: unknown): value is MatrixCardDensity {
  return value === "large" || value === "small" || value === "row";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMatrixJsonObject(storageKey: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return {};

    const parsedValue = JSON.parse(rawValue);
    return isRecord(parsedValue) ? parsedValue : {};
  } catch {
    return {};
  }
}

function sanitizeMatrixCardDensityPreferences(
  value: unknown
): MatrixCardDensityPreferenceMap {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, MatrixCardDensity] =>
      isMatrixCardDensity(entry[1])
    )
  );
}

function sanitizeMatrixCollapsedGroupPreferences(
  value: unknown
): MatrixCollapsedGroupPreferences {
  if (!isRecord(value)) return {};

  const preferences: MatrixCollapsedGroupPreferences = {};
  for (const [view, groupKeys] of Object.entries(value)) {
    if (!isMatrixView(view) || !Array.isArray(groupKeys)) continue;

    preferences[view] = groupKeys.filter(
      (groupKey): groupKey is string => typeof groupKey === "string"
    );
  }

  return preferences;
}

function readMatrixPreferences(): MatrixPreferences {
  const storedPreferences = readMatrixJsonObject(MATRIX_PREFERENCES_STORAGE_KEY);
  const preferences: MatrixPreferences = {};

  if (isMatrixView(storedPreferences.view)) {
    preferences.view = storedPreferences.view;
  }

  if (isMatrixPanel(storedPreferences.panel)) {
    preferences.panel = storedPreferences.panel;
  }

  if (isMatrixScope(storedPreferences.scope)) {
    preferences.scope = storedPreferences.scope;
  }

  const cardDensityByGroup = sanitizeMatrixCardDensityPreferences(
    storedPreferences.cardDensityByGroup
  );
  if (Object.keys(cardDensityByGroup).length > 0) {
    preferences.cardDensityByGroup = cardDensityByGroup;
  }

  const collapsedGroupKeysByView = sanitizeMatrixCollapsedGroupPreferences(
    storedPreferences.collapsedGroupKeysByView
  );
  if (Object.keys(collapsedGroupKeysByView).length > 0) {
    preferences.collapsedGroupKeysByView = collapsedGroupKeysByView;
  }

  return preferences;
}

function writeMatrixPreferences(
  updatePreferences: (currentPreferences: MatrixPreferences) => MatrixPreferences
) {
  if (typeof window === "undefined") return;

  try {
    const nextPreferences = updatePreferences(readMatrixPreferences());
    window.localStorage.setItem(
      MATRIX_PREFERENCES_STORAGE_KEY,
      JSON.stringify(nextPreferences)
    );
  } catch {
    // Ignore localStorage failures; Matrix can still update for this session.
  }
}

function readMatrixLegacyCardDensityPreferences() {
  return sanitizeMatrixCardDensityPreferences(
    readMatrixJsonObject(MATRIX_CARD_DENSITY_STORAGE_KEY)
  );
}

async function loadMatrixTags(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string
): Promise<MatrixTag[]> {
  const tagsTableName = "tags" as keyof Database["public"]["Tables"];

  const { data: tagData, error: tagError } = await supabase
    .from(tagsTableName)
    .select("id, name, color, created_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (tagError) throw tagError;

  return ((tagData ?? []) as MatrixTagLookupRow[])
    .map((tag) => {
      const id = tag.id?.trim();
      const name = tag.name?.trim();
      if (!id || !name) return null;

      return {
        id,
        name,
        color: tag.color ?? null,
        createdAt: tag.created_at ?? null,
      };
    })
    .filter((tag): tag is MatrixTag => Boolean(tag))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readMatrixCardDensityPreference(preferenceKey: string) {
  const preferences = readMatrixPreferences();
  const storedDensity = preferences.cardDensityByGroup?.[preferenceKey];
  if (isMatrixCardDensity(storedDensity)) return storedDensity;

  return readMatrixLegacyCardDensityPreferences()[preferenceKey];
}

function writeMatrixCardDensityPreference(
  preferenceKey: string,
  density: MatrixCardDensity
) {
  writeMatrixPreferences((currentPreferences) => ({
    ...currentPreferences,
    cardDensityByGroup: {
      ...(currentPreferences.cardDensityByGroup ?? {}),
      [preferenceKey]: density,
    },
  }));

  if (typeof window === "undefined") return;

  try {
    const legacyPreferences = readMatrixLegacyCardDensityPreferences();
    legacyPreferences[preferenceKey] = density;
    window.localStorage.setItem(
      MATRIX_CARD_DENSITY_STORAGE_KEY,
      JSON.stringify(legacyPreferences)
    );
  } catch {
    // Ignore localStorage failures; Matrix can still update for this session.
  }
}

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
  if (event.routine) {
    return event.routine.sortRank;
  }
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
  if (event.routine) {
    return event.routine.completed;
  }

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

function isMatrixDueItemCompleted(item: MatrixDueItem): boolean {
  if (item.kind === "habit") {
    return isMatrixDueHabitCompleted(item.habit);
  }

  return item.routine.completed;
}

function isMatrixScheduledRoutineCompleted(
  habits: readonly MatrixRoutineHabit[]
) {
  return (
    habits.length > 0 &&
    habits.every(
      (habit) =>
        habit.sourceInstance?.status?.trim().toLowerCase() === "completed"
    )
  );
}

function sortMatrixScheduledItems(
  items: MatrixEvent[],
  heldCompletedItemIds?: ReadonlySet<string>
): MatrixEvent[] {
  return [...items].sort((a, b) => {
    const aCompleted =
      isMatrixEventCompleted(a) && !heldCompletedItemIds?.has(a.instance.id);
    const bCompleted =
      isMatrixEventCompleted(b) && !heldCompletedItemIds?.has(b.instance.id);
    const completionDifference =
      Number(aCompleted) - Number(bCompleted);
    if (completionDifference !== 0) return completionDifference;

    const rankDifference = getMatrixEventTypeRank(a) - getMatrixEventTypeRank(b);
    if (rankDifference !== 0) return rankDifference;

    const aStartTime = getMatrixEventStartTime(a);
    const bStartTime = getMatrixEventStartTime(b);
    if (aStartTime !== bStartTime) return aStartTime - bStartTime;

    return a.title.localeCompare(b.title);
  });
}

function getMatrixScheduledHabitLabel(
  status: ScheduleInstance["status"] | null | undefined
) {
  if (status === "completed") return "COMPLETE";
  if (status && status !== "scheduled") return status.replaceAll("_", " ");
  return "SCHEDULED";
}

function sortMatrixDueItems(
  items: MatrixDueItem[],
  heldCompletedItemIds?: ReadonlySet<string>
): MatrixDueItem[] {
  return [...items].sort((a, b) => {
    const aCompleted =
      isMatrixDueItemCompleted(a) && !heldCompletedItemIds?.has(a.id);
    const bCompleted =
      isMatrixDueItemCompleted(b) && !heldCompletedItemIds?.has(b.id);
    const completionDifference =
      Number(aCompleted) - Number(bCompleted);
    if (completionDifference !== 0) return completionDifference;

    const rankDifference =
      (a.kind === "routine"
        ? a.routine.sortRank
        : getMatrixHabitTypeRank(a.habit.habit_type)) -
      (b.kind === "routine"
        ? b.routine.sortRank
        : getMatrixHabitTypeRank(b.habit.habit_type));
    if (rankDifference !== 0) return rankDifference;

    return a.name.localeCompare(b.name);
  });
}

function getHabitCardTypeClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") {
    return MATRIX_HABIT_CHORE_CARD_BG_CLASS;
  }
  if (normalized === "SYNC" || normalized === "MEMO") return "habit-card--sync-gray";
  if (normalized === "PRACTICE") {
    return MATRIX_HABIT_PRACTICE_CARD_BG_CLASS;
  }
  return MATRIX_HABIT_DEFAULT_CARD_BG_CLASS;
}

function getHabitCardBorderClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "border-rose-200/45";
  if (normalized === "SYNC" || normalized === "MEMO") return "border-zinc-200/45";
  if (normalized === "PRACTICE") return "border-slate-500/50";
  return "border-white/10 shadow-[0_16px_34px_-28px_rgba(0,0,0,0.88),inset_0_1px_0_rgba(255,255,255,0.055)]";
}

function getHabitRowTypeClass(habitType: string | null | undefined): string {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return MATRIX_ROW_NEXUS_CHORE_CARD_CLASS;
  if (normalized === "SYNC" || normalized === "MEMO") {
    return MATRIX_ROW_NEXUS_SYNC_CARD_CLASS;
  }
  if (normalized === "PRACTICE") return MATRIX_ROW_NEXUS_PRACTICE_CARD_CLASS;
  return MATRIX_ROW_NEXUS_CARD_CLASS;
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

function formatMatrixDurationLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded}m`;

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

type MatrixPrioritySignal = {
  label: string;
  Icon: LucideIcon;
  className: string;
  iconClassName: string;
};

const MATRIX_PRIORITY_SIGNALS: Record<string, MatrixPrioritySignal> = {
  LOW: {
    label: "Low",
    Icon: CircleAlert,
    className:
      "border-sky-300/20 bg-sky-400/8 text-sky-100 shadow-[0_0_10px_rgba(125,211,252,0.1)]",
    iconClassName: "h-2.5 w-2.5",
  },
  MEDIUM: {
    label: "Medium",
    Icon: BadgeAlert,
    className:
      "border-amber-300/25 bg-amber-400/10 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.12)]",
    iconClassName: "h-2.5 w-2.5",
  },
  HIGH: {
    label: "High",
    Icon: TriangleAlert,
    className:
      "border-orange-300/30 bg-orange-500/12 text-orange-100 shadow-[0_0_10px_rgba(251,146,60,0.15)]",
    iconClassName: "h-2.5 w-2.5",
  },
  CRITICAL: {
    label: "Critical",
    Icon: TriangleAlert,
    className:
      "border-red-300/35 bg-red-500/14 text-red-100 shadow-[0_0_10px_rgba(248,113,113,0.18)]",
    iconClassName: "h-2.5 w-2.5",
  },
  "ULTRA-CRITICAL": {
    label: "Ultra",
    Icon: OctagonAlert,
    className:
      "border-rose-200/40 bg-rose-500/16 text-rose-50 shadow-[0_0_12px_rgba(251,113,133,0.22)]",
    iconClassName: "h-2.5 w-2.5",
  },
};

function getMatrixPriorityIconSignal(
  priority?: string | null
): MatrixPrioritySignal | null {
  const normalized = normalizePriorityCode(priority);
  if (normalized === "NO") return null;
  return MATRIX_PRIORITY_SIGNALS[normalized] ?? null;
}

function toScheduleHabit(habit: HabitRow): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    memoCaptureConfig: habit.memo_capture_config ?? null,
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
    date.getTime() - overdueStartMs >= MS_PER_DAY * 7;

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
      const event: MatrixEvent = {
        instance,
        title: instance.event_name ?? project?.name ?? "Untitled project",
        monumentId,
        skillIds: project ? getProjectSkillIds(project) : [],
        glyph: monumentId ? (monumentIdToEmoji.get(monumentId) ?? "◇") : "◇",
        goal: projectGoal,
        habit: null,
        routine: null,
      };
      return [event];
    }

    if (instance.source_type !== "HABIT") return [];

    const habit = habits.get(instance.source_id);
    const habitSkillIcon =
      habit?.skill_id ? skillIdToIcon.get(habit.skill_id) : null;
    const dueStatus = habit
      ? getMatrixHabitDisplayStatus(habit, date, timeZone)
      : undefined;
    const event: MatrixEvent = {
      instance,
      title: instance.event_name ?? habit?.name ?? "Untitled habit",
      monumentId: resolveHabitMonumentId({
        habit,
        goals,
        skillIdToMonumentId,
      }),
      skillIds: habit?.skill_id ? [habit.skill_id] : [],
      glyph: habitSkillIcon ?? getHabitFallbackGlyph(habit?.habit_type),
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
            skillIcon: habitSkillIcon ?? null,
            glyph: habitSkillIcon ?? getHabitFallbackGlyph(habit.habit_type),
            dueStatus,
          }
        : null,
      routine: null,
    };
    return [event];
  });
}

function buildMatrixScheduledEvents({
  events,
  routines,
}: {
  events: MatrixEvent[];
  routines: Map<string, RoutineRow>;
}): MatrixEvent[] {
  const scheduledEvents: MatrixEvent[] = [];
  const routineEventGroups = new Map<string, MatrixEvent[]>();

  for (const event of events) {
    const routineId = event.habit?.routine_id?.trim();
    if (!routineId) {
      scheduledEvents.push(event);
      continue;
    }

    const group = routineEventGroups.get(routineId);
    if (group) {
      group.push(event);
    } else {
      routineEventGroups.set(routineId, [event]);
    }
  }

  for (const [routineId, routineEvents] of routineEventGroups) {
    if (routineEvents.length === 0) continue;

    const routine = routines.get(routineId);
    const sortedEvents = [...routineEvents].sort((a, b) => {
      const firstPosition =
        typeof a.habit?.routine_position === "number" &&
        Number.isFinite(a.habit.routine_position)
          ? a.habit.routine_position
          : Number.POSITIVE_INFINITY;
      const secondPosition =
        typeof b.habit?.routine_position === "number" &&
        Number.isFinite(b.habit.routine_position)
          ? b.habit.routine_position
          : Number.POSITIVE_INFINITY;
      if (firstPosition !== secondPosition) {
        return firstPosition - secondPosition;
      }

      const firstStartTime = getMatrixEventStartTime(a);
      const secondStartTime = getMatrixEventStartTime(b);
      if (firstStartTime !== secondStartTime) {
        return firstStartTime - secondStartTime;
      }

      return a.title.localeCompare(b.title);
    });
    const representativeEvent = sortedEvents[0];
    if (!representativeEvent) continue;

    const matrixRoutineHabits: MatrixRoutineHabit[] = sortedEvents.flatMap(
      (event, index) => {
        const habit = event.habit;
        if (!habit) return [];

        return [
          {
            id: habit.id,
            name: habit.name,
            dueLabel: getMatrixScheduledHabitLabel(event.instance.status),
            skillIcon: habit.skillIcon,
            completed: isMatrixDueHabitCompleted(habit),
            routinePosition: habit.routine_position ?? index + 1,
            currentStreakDays: habit.current_streak_days,
            habitType: habit.habit_type,
            recurrence: habit.recurrence,
            durationMinutes:
              event.instance.duration_min ?? habit.duration_minutes,
            energy: habit.energy,
            goalId: habit.goal_id,
            skillId: habit.skill_id,
            routineId: habit.routine_id,
            locationContextId: habit.location_context_id,
            daylightPreference: habit.daylight_preference,
            windowEdgePreference: habit.window_edge_preference,
            nextDueOverride: habit.next_due_override,
            sourceHabit: habit,
            sourceInstance: event.instance,
          },
        ];
      }
    );
    if (matrixRoutineHabits.length === 0) continue;

    const routineSkillIds = Array.from(
      new Set(sortedEvents.flatMap((event) => event.skillIds))
    );
    const routineMonumentId =
      sortedEvents.find((event) => event.monumentId)?.monumentId ?? null;
    const totalDuration = matrixRoutineHabits.reduce((sum, habit) => {
      const duration = habit.durationMinutes;
      return typeof duration === "number" && Number.isFinite(duration)
        ? sum + duration
        : sum;
    }, 0);
    const routineName = routine?.name?.trim() || "Routine";
    const routineIcon = routine?.icon?.trim() || "🔁";
    const routineItem: MatrixRoutine = {
      id: routineId,
      name: routineName,
      description: routine?.description ?? null,
      icon: routineIcon,
      habits: matrixRoutineHabits,
      completed: isMatrixScheduledRoutineCompleted(matrixRoutineHabits),
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      glyph: routineIcon,
      dueHabitCount: matrixRoutineHabits.length,
      totalDueDurationMinutes: totalDuration > 0 ? totalDuration : null,
      sortRank: Math.min(
        ...matrixRoutineHabits.map((habit) =>
          getMatrixHabitTypeRank(habit.sourceHabit.habit_type)
        )
      ),
    };

    scheduledEvents.push({
      ...representativeEvent,
      title: routineName,
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      glyph: routineIcon,
      goal: null,
      habit: null,
      routine: routineItem,
    });
  }

  return scheduledEvents;
}

function buildMatrixDueItems({
  habits,
  routines,
}: {
  habits: MatrixHabit[];
  routines: Map<string, RoutineRow>;
}): MatrixDueItem[] {
  const dueItems: MatrixDueItem[] = [];
  const routineHabitGroups = new Map<string, MatrixHabit[]>();

  for (const habit of habits) {
    const routineId = habit.routine_id?.trim();
    if (!routineId) {
      dueItems.push({
        kind: "habit",
        id: habit.id,
        name: habit.name,
        monumentId: habit.monumentId,
        skillIds: habit.skillIds,
        habit,
      });
      continue;
    }

    const group = routineHabitGroups.get(routineId);
    if (group) {
      group.push(habit);
    } else {
      routineHabitGroups.set(routineId, [habit]);
    }
  }

  for (const [routineId, routineHabits] of routineHabitGroups) {
    if (routineHabits.length === 0) continue;

    const routine = routines.get(routineId);
    const sortedHabits = [...routineHabits].sort((a, b) => {
      const firstPosition =
        typeof a.routine_position === "number" &&
        Number.isFinite(a.routine_position)
          ? a.routine_position
          : Number.POSITIVE_INFINITY;
      const secondPosition =
        typeof b.routine_position === "number" &&
        Number.isFinite(b.routine_position)
          ? b.routine_position
          : Number.POSITIVE_INFINITY;
      if (firstPosition !== secondPosition) {
        return firstPosition - secondPosition;
      }
      return a.name.localeCompare(b.name);
    });
    const matrixRoutineHabits: MatrixRoutineHabit[] = sortedHabits.map(
      (habit, index) => ({
        id: habit.id,
        name: habit.name,
        dueLabel: habit.dueStatus?.label ?? null,
        skillIcon: habit.skillIcon,
        completed: isMatrixDueHabitCompleted(habit),
        routinePosition: habit.routine_position ?? index + 1,
        currentStreakDays: habit.current_streak_days,
        habitType: habit.habit_type,
        recurrence: habit.recurrence,
        durationMinutes: habit.duration_minutes,
        energy: habit.energy,
        goalId: habit.goal_id,
        skillId: habit.skill_id,
        routineId: habit.routine_id,
        locationContextId: habit.location_context_id,
        daylightPreference: habit.daylight_preference,
        windowEdgePreference: habit.window_edge_preference,
        nextDueOverride: habit.next_due_override,
        sourceHabit: habit,
      })
    );
    const routineSkillIds = Array.from(
      new Set(sortedHabits.flatMap((habit) => habit.skillIds))
    );
    const routineMonumentId =
      sortedHabits.find((habit) => habit.monumentId)?.monumentId ?? null;
    const totalDuration = sortedHabits.reduce((sum, habit) => {
      const duration = habit.duration_minutes;
      return typeof duration === "number" && Number.isFinite(duration)
        ? sum + duration
        : sum;
    }, 0);
    const routineName = routine?.name?.trim() || "Routine";
    const routineIcon = routine?.icon?.trim() || "🔁";
    const routineItem: MatrixRoutine = {
      id: routineId,
      name: routineName,
      description: routine?.description ?? null,
      icon: routineIcon,
      habits: matrixRoutineHabits,
      completed: matrixRoutineHabits.every((habit) => habit.completed),
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      glyph: routineIcon,
      dueHabitCount: matrixRoutineHabits.length,
      totalDueDurationMinutes: totalDuration > 0 ? totalDuration : null,
      sortRank: Math.min(
        ...sortedHabits.map((habit) => getMatrixHabitTypeRank(habit.habit_type))
      ),
    };

    dueItems.push({
      kind: "routine",
      id: `routine:${routineId}`,
      name: routineName,
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      routine: routineItem,
    });
  }

  return dueItems;
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

function getMatrixHabitTypeGroupKey(
  habitType: string | null | undefined
): MatrixTypeGroupKey {
  const normalized = normalizeRelatedHabitType(habitType);
  if (normalized === "CHORE") return "chore";
  if (normalized === "SYNC") return "sync";
  return "habit";
}

function getMatrixRoutineTypeGroupKey(
  routine: MatrixRoutine
): MatrixTypeGroupKey {
  const habitTypeGroups = new Set(
    routine.habits.map((habit) =>
      getMatrixHabitTypeGroupKey(habit.sourceHabit.habit_type)
    )
  );

  if (habitTypeGroups.size === 1) {
    return Array.from(habitTypeGroups)[0] ?? "habit";
  }

  return "habit";
}

function getMatrixEventTypeGroupKey(event: MatrixEvent): MatrixTypeGroupKey {
  if (event.instance.source_type === "PROJECT" || event.goal) {
    return "project";
  }

  if (event.habit) {
    return getMatrixHabitTypeGroupKey(event.habit.habit_type);
  }

  if (event.routine) {
    return getMatrixRoutineTypeGroupKey(event.routine);
  }

  return "habit";
}

function getMatrixDueItemTypeGroupKey(
  item: MatrixDueItem
): MatrixTypeGroupKey {
  if (item.kind === "habit") {
    return getMatrixHabitTypeGroupKey(item.habit.habit_type);
  }

  return getMatrixRoutineTypeGroupKey(item.routine);
}

function getMatrixSkillSortToken<T extends { skillIds: string[] }>(
  item: T,
  skills: Map<string, SkillRow>
): string {
  const tokens = item.skillIds
    .map((skillId) => {
      const skill = skills.get(skillId);
      if (!skill) return null;

      return `${skill.name.trim().toLocaleLowerCase()}|${skill.icon ?? ""}|${skill.id}`;
    })
    .filter((token): token is string => Boolean(token))
    .sort((a, b) => a.localeCompare(b));

  return tokens[0] ?? "\uFFFF|Unlinked";
}

function sortMatrixItemsBySkill<T extends { skillIds: string[] }>(
  items: T[],
  skills: Map<string, SkillRow>
): T[] {
  return [...items].sort((a, b) =>
    getMatrixSkillSortToken(a, skills).localeCompare(
      getMatrixSkillSortToken(b, skills)
    )
  );
}

function groupByType<T extends { skillIds: string[] }>({
  items,
  skills,
  getTypeGroupKey,
  sortItems,
}: {
  items: T[];
  skills: Map<string, SkillRow>;
  getTypeGroupKey(item: T): MatrixTypeGroupKey;
  sortItems(items: T[]): T[];
}): MonumentGroup<T>[] {
  const groupLookup = new Map<MatrixTypeGroupKey, MonumentGroup<T>>();

  for (const item of sortItems(items)) {
    const typeGroupKey = getTypeGroupKey(item);
    const definition = MATRIX_TYPE_GROUP_DEFINITIONS[typeGroupKey];
    const existing = groupLookup.get(typeGroupKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groupLookup.set(typeGroupKey, {
      key: definition.key,
      title: definition.title,
      emoji: definition.emoji,
      sortValue: definition.sortValue,
      items: [item],
    });
  }

  return Array.from(groupLookup.entries())
    .sort(
      ([firstKey], [secondKey]) =>
        MATRIX_TYPE_GROUP_DEFINITIONS[firstKey].sortValue.localeCompare(
          MATRIX_TYPE_GROUP_DEFINITIONS[secondKey].sortValue
        )
    )
    .map(([, group]) => ({
      ...group,
      items: sortMatrixItemsBySkill(group.items, skills),
    }));
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
  items: MatrixDueItem[]
): MonumentGroup<MatrixDueItem>[] {
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
  unscheduledDueHabitGroups: MonumentGroup<MatrixDueItem>[];
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
      unscheduledDueItems: [],
    });
  }

  for (const group of unscheduledDueHabitGroups) {
    const existing = groupLookup.get(group.key);
    if (existing) {
      existing.unscheduledDueItems = group.items;
      continue;
    }

    groupLookup.set(group.key, {
      key: group.key,
      title: group.title,
      emoji: group.emoji,
      energyLevel: group.energyLevel,
      sortValue: group.sortValue,
      scheduledItems: [],
      unscheduledDueItems: group.items,
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
  const loadingRows = Array.from(
    { length: MATRIX_LOADING_ROW_COUNT },
    (_, index) => ({
      labelWidth: `${72 + (index % 4) * 14}px`,
    })
  );

  return (
    <div className="space-y-1.5 px-0.5 py-0.5">
      {loadingRows.map((row, index) => (
        <div
          key={index}
          className="flex min-h-6 animate-pulse items-center justify-between gap-2 px-0.5"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-md bg-white/[0.045]">
              <span className="h-1.5 w-1.5 rounded-full bg-white/[0.09]" />
            </span>
            <span
              className="h-2 rounded-full bg-white/[0.075] shadow-[0_0_18px_-12px_rgba(255,255,255,0.45)]"
              style={{ width: row.labelWidth }}
            />
          </div>

          {index === 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-4 w-12 rounded-full border border-white/8 bg-white/[0.045] sm:w-14" />
              <span className="h-5 w-5 rounded-md border border-white/8 bg-white/[0.035]" />
            </div>
          ) : null}
        </div>
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

function MatrixEventRowCard({
  glyph,
  title,
  meta,
  status,
  completed = false,
  overdue = false,
  className,
  open = false,
  onOpenChange,
}: {
  glyph: string;
  title: string;
  meta: ReactNode;
  status?: string | null;
  completed?: boolean;
  overdue?: boolean;
  className?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <div
      role={onOpenChange ? "button" : undefined}
      tabIndex={onOpenChange ? 0 : undefined}
      aria-expanded={onOpenChange ? open : undefined}
      onClick={onOpenChange ? () => onOpenChange(!open) : undefined}
      onKeyDown={
        onOpenChange
          ? (event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpenChange(!open);
            }
          : undefined
      }
      className={cn(
        "relative flex min-h-[56px] w-full min-w-0 select-none rounded-lg border px-3 py-1.5 text-left text-white transition-[filter,transform,border-color,box-shadow] duration-200 [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
        completed
          ? MATRIX_ROW_NEXUS_COMPLETED_CARD_CLASS
          : className,
        onOpenChange
          ? "cursor-pointer"
          : null,
        open ? "ring-1 ring-white/[0.08]" : null,
        overdue && !completed
          ? "outline-rose-300/[0.22] shadow-[0_0_0_1px_rgba(244,63,94,0.08),0_18px_36px_rgba(56,16,24,0.26),inset_0_1px_0_rgba(255,255,255,0.09)]"
          : null
      )}
      style={completed ? getMatrixCompleteShimmerStyle() : undefined}
    >
      {completed ? (
        <span
          className="focus-pomo-start-glint pointer-events-none absolute inset-0 rounded-[inherit]"
          aria-hidden="true"
        />
      ) : null}
      <div className="relative z-[2] flex w-full min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] p-0.5 text-center text-[15px] leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            aria-hidden="true"
          >
            <span className="flex size-6 max-w-full items-center justify-center truncate">
              {glyph}
            </span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="block min-w-0 flex-1 line-clamp-2 break-words text-[13px] font-semibold leading-snug tracking-wide text-white">
              {title}
            </span>
            <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-[7px] font-semibold uppercase leading-none tracking-[0.14em] text-white/60 md:text-[8px]">
              {status && !completed ? (
                <span
                  className={cn(
                    "min-w-0 truncate",
                    overdue ? "text-rose-50/90" : null
                  )}
                >
                  {status}
                </span>
              ) : null}
              {status && !completed ? (
                <span className="mx-1.5 text-white/28">/</span>
              ) : null}
              {meta}
            </div>
          </div>
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
  const rowPillClass = isCompleted
    ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
    : overdue
      ? "border-rose-200/[0.22] bg-rose-950/[0.26] text-rose-50/90"
      : "border-white/10 bg-white/[0.06] text-white/65";
  const glyphBadgeClass =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.055] text-xs font-semibold leading-none text-white/82 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-7 sm:w-7";
  const completedGlyphBadgeClass =
    "!border-white/10 !bg-white/[0.055] !text-white/82 !shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]";

  if (density === "row") {
    return (
      <MatrixEventRowCard
        glyph={glyph}
        title={title}
        status={status}
        completed={isCompleted}
        overdue={overdue}
        className={getHabitRowTypeClass(habitType)}
        meta={
          <span
            className={cn(
              "w-fit max-w-full rounded-full border px-2 py-[3px] text-[8px] font-semibold uppercase leading-none tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
              rowPillClass
            )}
          >
            {displayPill}
          </span>
        }
      />
    );
  }

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

  if (density === "row") {
    return (
      <MatrixEventRowCard
        glyph={displayGlyph}
        title={goal.title}
        completed={completed}
        status={completed ? "Completed" : null}
        open={open}
        onOpenChange={onOpenChange}
        className={MATRIX_ROW_PROJECT_CARD_CLASS}
        meta={
          <>
            <span
              className={cn(
                "rounded-full border px-2 py-[3px] text-[8px] font-semibold uppercase leading-none tracking-[0.08em]",
                completed
                  ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
                  : "border-white/10 bg-white/[0.06] text-white/65"
              )}
            >
              {completed ? "Complete" : "Project"}
            </span>
            <span className="flex min-w-[5.5rem] max-w-[8rem] flex-1 items-center gap-1.5">
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full border border-white/[0.06] bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_-1px_0_rgba(0,0,0,0.45)]">
                <span
                  className="block h-full rounded-full bg-emerald-400/55 shadow-[inset_0_1px_0_rgba(209,250,229,0.18),inset_0_-1px_0_rgba(0,0,0,0.24)] transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="shrink-0 text-[8px] tracking-normal text-white/45">
                {progress}%
              </span>
            </span>
          </>
        }
      />
    );
  }

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
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border border-zinc-700/65 bg-[linear-gradient(180deg,#17191b,#090a0b)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)]">
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
          "h-2 border border-[#252a2a] bg-[linear-gradient(180deg,#17191b,#090a0b)]"
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

function MatrixScheduledEventRowCard({
  event,
  completed,
  status,
  open = false,
  onOpenChange,
}: {
  event: MatrixEvent;
  completed: boolean;
  status?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const sourceType = event.goal ? "PROJECT" : "HABIT";
  const displayStatus = completed ? "Completed" : status ?? "Scheduled";
  const project = event.goal?.projects?.[0] ?? null;
  const durationMinutes =
    typeof event.instance.duration_min === "number" &&
    Number.isFinite(event.instance.duration_min) &&
    event.instance.duration_min > 0
      ? event.instance.duration_min
      : sourceType === "PROJECT"
        ? project?.durationMinutes
        : event.habit?.duration_minutes;
  const prioritySignal =
    sourceType === "PROJECT"
      ? getMatrixPriorityIconSignal(
          event.goal?.priorityCode ?? project?.priorityCode
        )
      : null;
  const energyLevel =
    sourceType === "PROJECT"
      ? normalizeFlameLevel(
          event.goal?.energyCode ?? project?.energyCode ?? event.instance.energy_resolved
        )
      : normalizeFlameLevel(event.habit?.energy ?? event.instance.energy_resolved);
  const dueDate = sourceType === "PROJECT" ? event.goal?.dueDate : null;
  const progress =
    sourceType === "PROJECT" && typeof event.goal?.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(event.goal.progress)))
      : null;
  const metaItems = [
    displayStatus,
    typeof durationMinutes === "number" &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? formatMatrixDurationLabel(durationMinutes)
      : null,
    dueDate ? `Due ${dueDate}` : null,
    progress !== null ? `${progress}%` : null,
  ].filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0
  );

  return (
    <div
      role={onOpenChange ? "button" : undefined}
      tabIndex={onOpenChange ? 0 : undefined}
      aria-expanded={onOpenChange ? open : undefined}
      onClick={onOpenChange ? () => onOpenChange(!open) : undefined}
      onKeyDown={
        onOpenChange
          ? (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
              if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
                return;
              }
              keyboardEvent.preventDefault();
              onOpenChange(!open);
            }
          : undefined
      }
      className={cn(
        "relative flex min-h-[56px] select-none rounded-lg border px-3 py-1.5 text-left transition-[filter,transform,border-color,box-shadow] duration-200 [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
        completed
          ? MATRIX_ROW_NEXUS_COMPLETED_CARD_CLASS
          : sourceType === "PROJECT"
            ? MATRIX_ROW_PROJECT_CARD_CLASS
            : getHabitRowTypeClass(event.habit?.habit_type),
        onOpenChange ? "cursor-pointer" : null,
        open && !completed ? "ring-1 ring-white/[0.08]" : null
      )}
      style={completed ? getMatrixCompleteShimmerStyle() : undefined}
    >
      {completed ? (
        <span
          className="focus-pomo-start-glint pointer-events-none absolute inset-0 rounded-[inherit]"
          aria-hidden="true"
        />
      ) : null}
      <div className="relative z-[2] flex w-full min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] p-0.5 text-center text-[15px] leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            aria-hidden="true"
          >
            <span className="flex size-6 max-w-full items-center justify-center truncate">
              {event.glyph}
            </span>
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="block min-w-0 flex-1 line-clamp-2 break-words text-[13px] font-semibold leading-snug tracking-wide text-white">
              {event.title}
            </span>
            <div className="flex min-w-0 items-center overflow-hidden whitespace-nowrap text-[7px] font-semibold uppercase leading-none tracking-[0.14em] text-white/60 md:text-[8px]">
              {metaItems.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className={cn(
                    "min-w-0 truncate",
                    index > 0 ? "ml-1.5" : null
                  )}
                >
                  {index > 0 ? (
                    <span className="mr-1.5 text-white/28">/</span>
                  ) : null}
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 overflow-visible">
          {prioritySignal ? (
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center rounded border",
                prioritySignal.className
              )}
              title={`Priority ${prioritySignal.label}`}
              aria-label={`Priority ${prioritySignal.label}`}
            >
              <prioritySignal.Icon
                className={prioritySignal.iconClassName}
                aria-hidden="true"
              />
            </span>
          ) : null}
          {energyLevel !== "NO" ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-visible">
              <FlameEmber
                level={energyLevel}
                size="sm"
                className="shrink-0 overflow-visible drop-shadow-[0_0_7px_rgba(0,0,0,0.5)]"
              />
            </span>
          ) : null}
        </div>
      </div>
    </div>
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
  onComplete(
    instanceId: string,
    nextStatus: ScheduleInstance["status"],
    options?: MatrixScheduledCompletionOptions
  ): void;
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
  const isCompleted = isMatrixEventCompleted(event);
  const cleanStatus =
    event.routine
      ? isCompleted
        ? "Completed"
        : null
      : event.instance.status === "completed"
      ? "Completed"
      : event.instance.status && event.instance.status !== "scheduled"
        ? event.instance.status.replaceAll("_", " ")
        : null;

  const completeEvent = useCallback(() => {
    if (event.routine) {
      const nextStatus = isCompleted ? "scheduled" : "completed";
      let shouldFireCompletionHaptic = nextStatus === "completed";
      let validInstanceCount = 0;
      for (const habit of event.routine.habits) {
        const instanceId = habit.sourceInstance?.id;
        if (!instanceId) continue;

        onComplete(instanceId, nextStatus, {
          hapticOnComplete: shouldFireCompletionHaptic,
        });
        validInstanceCount += 1;
        shouldFireCompletionHaptic = false;
      }
      if (validInstanceCount === 0) {
        void hapticWarningPattern();
      }
      return;
    }

    onComplete(event.instance.id, isCompleted ? "scheduled" : "completed");
  }, [event.instance.id, event.routine, isCompleted, onComplete]);

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
      if (event.routine) return;

      if (event.instance.source_type === "PROJECT") {
        const projectId = event.instance.source_id;
        if (!projectId) return;

        fabCreation.requestEntityEdit({
          entityType: "PROJECT",
          entityId: projectId,
          instanceId: event.instance.id,
          title: event.title,
          status: event.instance.status ?? null,
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
    [
      event.habit?.id,
      event.instance.id,
      event.instance.status,
      event.instance.source_id,
      event.instance.source_type,
      event.routine,
      event.title,
      fabCreation,
    ]
  );

  const handleCardPointerDown = useCallback(
    (pointerEvent: PointerEvent<HTMLDivElement>) => {
      if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
      if (!fabCreation || event.routine) return;

      const element = pointerEvent.currentTarget;
      const pointerId = pointerEvent.pointerId;

      cancelLongPress();
      longPressStartRef.current = {
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
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
    [cancelLongPress, event.routine, fabCreation, handleLongPressEdit]
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

  const card = event.routine ? (
    <MatrixRoutineCard
      routine={event.routine}
      density={density}
      onCompleteHabit={(habitId, completed) => {
        const routineHabit = event.routine?.habits.find(
          (habit) => habit.id === habitId
        );
        const instanceId = routineHabit?.sourceInstance?.id;
        if (!instanceId) {
          void hapticWarningPattern();
          return;
        }

        onComplete(instanceId, completed ? "scheduled" : "completed");
      }}
    />
  ) : density === "row" && (scheduledGoal || event.habit) ? (
    <MatrixScheduledEventRowCard
      event={event}
      completed={isCompleted}
      status={cleanStatus}
      open={open}
      onOpenChange={scheduledGoal ? onOpenChange : undefined}
    />
  ) : scheduledGoal ? (
    density !== "large" ? (
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

function MatrixRoutineCard({
  routine,
  density,
  onCompleteHabit,
}: {
  routine: MatrixRoutine;
  density: MatrixCardDensity;
  onCompleteHabit(habitId: string, completedToday: boolean): void;
}) {
  const habitCount = Math.max(0, routine.dueHabitCount);
  const habitCountLabel = `${habitCount} ${habitCount === 1 ? "habit" : "habits"}`;
  const routineName = routine.name?.trim() || "Routine";
  const routineGlyph = routine.glyph || routine.icon?.trim() || "🔁";
  const completed = routine.completed;

  if (density === "row") {
    return (
      <div className="matrix-event-card-shell group/routine-card relative min-w-0 cursor-pointer">
        <div
          aria-hidden="true"
          className="pointer-events-none transform-gpu transition duration-200 group-hover/routine-card:-translate-y-px group-focus-within/routine-card:-translate-y-px"
        >
          <MatrixEventRowCard
            glyph={routineGlyph}
            title={routineName}
            completed={completed}
            className={getHabitRowTypeClass(null)}
            meta={
              <span
                className={cn(
                  "w-fit max-w-full rounded-full border px-2 py-[3px] text-[8px] font-semibold uppercase leading-none tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
                  completed
                    ? "border-emerald-200/25 bg-emerald-400/15 text-emerald-50"
                    : "border-white/10 bg-white/[0.06] text-white/65"
                )}
              >
                {completed ? "COMPLETE" : habitCountLabel}
              </span>
            }
          />
        </div>
        <div className="absolute inset-0 z-[4] opacity-0 [&>.goal-card]:!h-full [&>.goal-card]:!min-h-full">
          <RelatedRoutineCard
            routine={routine}
            density="small"
            fallbackIcon={routineGlyph}
            onHabitCompletionToggle={(habitId) => {
              const habit = routine.habits.find((item) => item.id === habitId);
              onCompleteHabit(habitId, Boolean(habit?.completed));
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="matrix-event-card-shell group/routine-card relative h-full cursor-pointer">
      <div
        aria-hidden="true"
        className="pointer-events-none h-full transform-gpu transition duration-200 group-hover/routine-card:-translate-y-px group-focus-within/routine-card:-translate-y-px"
      >
        <MatrixHabitCard
          glyph={routineGlyph}
          title={routineName}
          pill={completed ? "COMPLETE" : habitCountLabel}
          habitType={null}
          overdue={false}
          completed={completed}
          density={density}
        />
      </div>
      <div className="absolute inset-0 z-[4] opacity-0 [&>.goal-card]:!aspect-auto [&>.goal-card]:!h-full [&>.goal-card]:!min-h-full">
        <RelatedRoutineCard
          routine={routine}
          density={density}
          fallbackIcon={routineGlyph}
          onHabitCompletionToggle={(habitId) => {
            const habit = routine.habits.find((item) => item.id === habitId);
            onCompleteHabit(habitId, Boolean(habit?.completed));
          }}
        />
      </div>
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
  icon,
  selected = false,
  disabled = false,
  className,
  onClick,
}: {
  label?: string;
  icon?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-full border px-3 text-[10px] font-semibold leading-none text-zinc-500 backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
        selected
          ? "border-zinc-500/35 bg-zinc-300/[0.085] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.065)]"
          : "border-zinc-700/40 bg-zinc-900/35 text-zinc-600",
        disabled
          ? "cursor-default opacity-70"
          : "hover:border-zinc-500/35 hover:bg-zinc-800/40 hover:text-zinc-400",
        className
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-3 w-3 shrink-0 items-center justify-center"
        >
          {icon}
        </span>
      ) : null}
      {label ? (
        <span className="truncate">{label}</span>
      ) : (
        <span aria-hidden="true">&nbsp;</span>
      )}
    </button>
  );
}

function MatrixSettingsTray({
  activeView,
  activeScope,
  matrixTags,
  onViewChange,
  onScopeChange,
}: {
  activeView: MatrixView;
  activeScope: MatrixScope;
  matrixTags: MatrixTag[];
  onViewChange(view: MatrixView): void;
  onScopeChange(scope: MatrixScope): void;
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
            <MatrixViewPill
              label="Type"
              selected={activeView === "types"}
              onClick={() => onViewChange("types")}
            />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[10px] font-bold uppercase leading-none tracking-[0.18em] text-zinc-600">
            SCOPE
          </h2>
          <div className="flex flex-wrap gap-2">
            <MatrixViewPill
              icon={<Calendar className="h-3 w-3" />}
              label="Scheduled"
              selected={activeScope === "scheduled"}
              onClick={() => onScopeChange("scheduled")}
            />
            <MatrixViewPill
              icon={<Pin className="h-3 w-3" />}
              label="Pinned"
              selected={activeScope === "pinned"}
              onClick={() => onScopeChange("pinned")}
            />
            {matrixTags.map((tag) => (
              <MatrixViewPill
                key={tag.id}
                icon={
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full border border-white/10"
                    style={{
                      backgroundColor:
                        tag.color ?? "rgba(113, 113, 122, 0.55)",
                    }}
                  />
                }
                label={tag.name}
                disabled
                className="!min-w-0 max-w-[9rem] px-2.5"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function getVisibleMatrixDueItems(group: MatrixMonumentGroup) {
  const scheduledMatrixHabitIds = new Set<string>();
  const routineChildHabitIds = new Set<string>();

  for (const event of group.scheduledItems) {
    const isScheduledHabit =
      event.instance.source_type === "HABIT" || Boolean(event.habit);
    if (!isScheduledHabit) continue;

    const habitId = normalizeMatrixSourceId(event.habit?.id);
    const sourceId = normalizeMatrixSourceId(event.instance.source_id);

    if (habitId) scheduledMatrixHabitIds.add(habitId);
    if (sourceId) scheduledMatrixHabitIds.add(sourceId);

    if (event.routine) {
      for (const habit of event.routine.habits) {
        const routineHabitId = normalizeMatrixSourceId(habit.id);
        const routineSourceId = normalizeMatrixSourceId(
          habit.sourceInstance?.source_id
        );

        if (routineHabitId) scheduledMatrixHabitIds.add(routineHabitId);
        if (routineSourceId) scheduledMatrixHabitIds.add(routineSourceId);
      }
    }
  }

  for (const item of group.unscheduledDueItems) {
    if (item.kind !== "routine") continue;

    for (const habit of item.routine.habits) {
      const habitId = normalizeMatrixSourceId(habit.id);
      const sourceHabitId = normalizeMatrixSourceId(habit.sourceHabit.id);

      if (habitId) routineChildHabitIds.add(habitId);
      if (sourceHabitId) routineChildHabitIds.add(sourceHabitId);
    }
  }

  return group.unscheduledDueItems.flatMap((item): MatrixDueItem[] => {
    if (item.kind === "habit") {
      if (
        item.habit.routine_id?.trim() &&
        routineChildHabitIds.has(normalizeMatrixSourceId(item.habit.id))
      ) {
        return [];
      }

      return scheduledMatrixHabitIds.has(normalizeMatrixSourceId(item.habit.id))
        ? []
        : [item];
    }

    const visibleHabits = item.routine.habits.filter(
      (habit) => !scheduledMatrixHabitIds.has(normalizeMatrixSourceId(habit.id))
    );
    if (visibleHabits.length === 0) return [];

    if (visibleHabits.length === item.routine.habits.length) {
      return [item];
    }

    const totalDuration = visibleHabits.reduce((sum, habit) => {
      const duration = habit.durationMinutes;
      return typeof duration === "number" && Number.isFinite(duration)
        ? sum + duration
        : sum;
    }, 0);

    return [
      {
        ...item,
        routine: {
          ...item.routine,
          habits: visibleHabits,
          dueHabitCount: visibleHabits.length,
          totalDueDurationMinutes: totalDuration > 0 ? totalDuration : null,
        },
      },
    ];
  });
}

function MatrixGroupLabel({
  group,
  matrixView,
  rightControls,
}: {
  group: MatrixMonumentGroup;
  matrixView: MatrixView;
  rightControls?: ReactNode;
}) {
  const useEnergyIcon = matrixView === "blocks" && Boolean(group.energyLevel);

  return (
    <div className="flex min-h-6 min-w-0 items-center justify-between gap-2 px-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid h-5 w-4 shrink-0 place-items-center overflow-visible text-[10px] leading-none text-white/45">
          {useEnergyIcon && group.energyLevel ? (
            <FlameEmber
              level={group.energyLevel}
              size="xs"
              className="h-3.5 w-3.5 shrink-0 overflow-visible"
            />
          ) : (
            (group.emoji ?? "◇")
          )}
        </span>
        <span className="truncate text-[9px] font-semibold uppercase leading-none tracking-[0.16em] text-white/38">
          {group.title}
        </span>
      </div>
      {rightControls ? (
        <div
          className="flex shrink-0 items-center gap-1.5"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {rightControls}
        </div>
      ) : null}
    </div>
  );
}

const MATRIX_GROUP_REVEAL_BASE_DELAY_SECONDS = 1.15;
const MATRIX_GROUP_REVEAL_STAGGER_SECONDS = 0.85;
const MATRIX_GROUP_REVEAL_DURATION_SECONDS = 1.25;
const MATRIX_GROUP_REVEAL_BUFFER_SECONDS = 0.28;

function MatrixRevealGroupSection({
  index,
  label,
  children,
  collapsed,
  onToggle,
}: {
  index: number;
  label: ReactNode;
  children: ReactNode;
  collapsed: boolean;
  onToggle(): void;
}) {
  return (
    <section className="space-y-1.5">
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="block w-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
      >
        {label}
      </button>
      <motion.div
        initial={{
          height: 0,
          opacity: 0,
          y: -8,
        }}
        animate={
          collapsed
            ? {
                height: 0,
                opacity: 0,
                y: -8,
              }
            : {
                height: "auto",
                opacity: 1,
                y: 0,
              }
        }
        transition={{
          delay: collapsed
            ? 0
            : MATRIX_GROUP_REVEAL_BASE_DELAY_SECONDS +
              index * MATRIX_GROUP_REVEAL_STAGGER_SECONDS,
          height: {
            duration: MATRIX_GROUP_REVEAL_DURATION_SECONDS,
            ease: MATRIX_GROUP_REVEAL_EASE,
          },
          opacity: {
            duration: collapsed ? 0.24 : 0.62,
            ease: "easeOut",
          },
          y: {
            duration: collapsed ? 0.42 : 1.05,
            ease: MATRIX_GROUP_REVEAL_EASE,
          },
        }}
        className="overflow-hidden"
        data-matrix-reveal-row
      >
        {children}
      </motion.div>
    </section>
  );
}


function MatrixGridCarousel({
  groups,
  matrixView,
  matrixScope,
  onCompleteScheduledEvent,
  onCompleteDueHabit,
  completingDueHabitIds,
  heldScheduledCompletionItemIds,
  heldDueCompletionItemIds,
}: {
  groups: MatrixMonumentGroup[];
  matrixView: MatrixView;
  matrixScope: MatrixScope;
  onCompleteScheduledEvent(
    instanceId: string,
    nextStatus: ScheduleInstance["status"],
    options?: MatrixScheduledCompletionOptions
  ): void;
  onCompleteDueHabit(habitId: string, completedToday: boolean): void;
  completingDueHabitIds: Set<string>;
  heldScheduledCompletionItemIds: ReadonlySet<string>;
  heldDueCompletionItemIds: ReadonlySet<string>;
}) {
  const [matrixPanel, setMatrixPanel] = useState<MatrixPanel>("scheduled");
  const [cardDensity, setCardDensity] = useState<MatrixCardDensity>("large");
  const [openGoalId, setOpenGoalId] = useState<string | null>(null);
  const [collapsedMatrixGroupKeys, setCollapsedMatrixGroupKeys] = useState<
    Set<string>
  >(() => new Set());
  const [matrixPanelHeight, setMatrixPanelHeight] = useState<number | null>(
    null
  );
  const [isInitialMatrixRevealActive, setIsInitialMatrixRevealActive] =
    useState(false);
  const [matrixPanelDragOffset, setMatrixPanelDragOffset] = useState(0);
  const [matrixPanelViewportWidth, setMatrixPanelViewportWidth] = useState(0);
  const [matrixPanelTransitionEnabled, setMatrixPanelTransitionEnabled] =
    useState(false);
  const matrixPanelViewportRef = useRef<HTMLDivElement | null>(null);
  const scheduledPanelRef = useRef<HTMLDivElement | null>(null);
  const unscheduledPanelRef = useRef<HTMLDivElement | null>(null);
  const matrixPanelPreferenceRestoredRef = useRef(false);
  const initialMatrixRevealActiveRef = useRef(false);
  const initialMatrixRevealTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
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
  const activeScheduledGroups = useMemo(
    () =>
      matrixScope === "pinned"
        ? []
        : groups
            .map((group) => ({
              group,
              items:
                matrixView === "types"
                  ? group.scheduledItems
                  : sortMatrixScheduledItems(
                      group.scheduledItems,
                      heldScheduledCompletionItemIds
                    ),
            }))
            .filter(({ items }) => items.length > 0),
    [groups, heldScheduledCompletionItemIds, matrixScope, matrixView]
  );
  const activeUnscheduledDueHabitGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          items:
            matrixView === "types"
              ? getVisibleMatrixDueItems(group)
              : sortMatrixDueItems(
                  getVisibleMatrixDueItems(group),
                  heldDueCompletionItemIds
                ),
        }))
        .filter(({ items }) => items.length > 0),
    [groups, heldDueCompletionItemIds, matrixView]
  );
  const availableMatrixPanels = useMemo<MatrixPanel[]>(() => {
    const panels: MatrixPanel[] = [];
    if (activeScheduledGroups.length > 0 || matrixScope === "pinned") {
      panels.push("scheduled");
    }
    if (activeUnscheduledDueHabitGroups.length > 0) panels.push("unscheduled");
    return panels;
  }, [
    activeScheduledGroups.length,
    activeUnscheduledDueHabitGroups.length,
    matrixScope,
  ]);
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
  const activeMatrixPanelLabel =
    activeMatrixPanel === "scheduled" && matrixScope === "pinned"
      ? "Pinned"
      : MATRIX_PANEL_LABELS[activeMatrixPanel];
  const activeMatrixRevealGroupCount =
    activeMatrixPanel === "unscheduled"
      ? activeUnscheduledDueHabitGroups.length
      : activeScheduledGroups.length;
  const activeMatrixRevealGroupSignature = useMemo(() => {
    const activeGroups =
      activeMatrixPanel === "unscheduled"
        ? activeUnscheduledDueHabitGroups
        : activeScheduledGroups;

    return activeGroups.map(({ group }) => group.key).join("|");
  }, [activeMatrixPanel, activeScheduledGroups, activeUnscheduledDueHabitGroups]);
  const matrixLibraryGridClass =
    cardDensity === "row"
      ? MATRIX_LIBRARY_ROW_LIST_CLASS
      : cardDensity === "small"
        ? MATRIX_LIBRARY_SMALL_GRID_CLASS
        : MATRIX_LIBRARY_GRID_CLASS;
  const isSmallCardDensity = cardDensity === "small";
  const isRowCardDensity = cardDensity === "row";

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
      writeMatrixPreferences((currentPreferences) => ({
        ...currentPreferences,
        panel,
      }));
    },
    [availableMatrixPanels, getMatrixPanelHeight]
  );

  const measureActiveMatrixPanel = useCallback(() => {
    if (initialMatrixRevealActiveRef.current) return;

    const nextHeight = getMatrixPanelHeight(matrixPanel);
    if (!nextHeight) return;

    setMatrixPanelHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    );
  }, [getMatrixPanelHeight, matrixPanel]);

  const cardDensityPreferenceKey = `${matrixView}:grid`;

  useEffect(() => {
    const storedDensity = readMatrixCardDensityPreference(
      cardDensityPreferenceKey
    );
    setCardDensity(storedDensity ?? "large");
  }, [cardDensityPreferenceKey]);

  useEffect(() => {
    const storedGroupKeys =
      readMatrixPreferences().collapsedGroupKeysByView?.[matrixView] ?? [];
    setCollapsedMatrixGroupKeys(new Set(storedGroupKeys));
  }, [matrixView]);

  useEffect(() => {
    if (matrixPanelPreferenceRestoredRef.current) return;
    if (availableMatrixPanels.length === 0) return;

    matrixPanelPreferenceRestoredRef.current = true;
    const storedPanel = readMatrixPreferences().panel;
    if (storedPanel && availableMatrixPanels.includes(storedPanel)) {
      setMatrixPanelDragOffset(0);
      setMatrixPanel(storedPanel);
    }
  }, [availableMatrixPanels]);

  const handleMatrixGroupToggle = useCallback((groupKey: string) => {
    setCollapsedMatrixGroupKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(groupKey)) {
        nextKeys.delete(groupKey);
      } else {
        nextKeys.add(groupKey);
      }
      writeMatrixPreferences((currentPreferences) => ({
        ...currentPreferences,
        collapsedGroupKeysByView: {
          ...(currentPreferences.collapsedGroupKeysByView ?? {}),
          [matrixView]: Array.from(nextKeys),
        },
      }));
      return nextKeys;
    });
  }, [matrixView]);

  const handleCardDensityToggle = useCallback(() => {
    setCardDensity((currentDensity) => {
      const nextDensity =
        currentDensity === "large"
          ? "small"
          : currentDensity === "small"
            ? "row"
            : "large";

      writeMatrixCardDensityPreference(cardDensityPreferenceKey, nextDensity);

      return nextDensity;
    });
  }, [cardDensityPreferenceKey]);

  const nextCardDensity =
    cardDensity === "large" ? "small" : cardDensity === "small" ? "row" : "large";
  const nextCardDensityLabel =
    nextCardDensity === "large"
      ? "large Matrix cards"
      : nextCardDensity === "small"
        ? "small Matrix cards"
        : "Matrix row cards";

  const matrixGridHeaderControls = (
    <>
      <span className="rounded-full border border-white/8 bg-white/[0.045] px-2 py-0.5 text-[9px] font-semibold leading-none text-white/50">
        {activeMatrixPanelLabel}
      </span>
      <button
        type="button"
        aria-label={`Use ${nextCardDensityLabel}`}
        title={`Use ${nextCardDensityLabel}`}
        onClick={handleCardDensityToggle}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/8 bg-white/[0.03] text-zinc-600 transition hover:border-white/15 hover:bg-white/[0.055] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
          cardDensity !== "large"
            ? "text-zinc-300 shadow-[0_0_14px_-9px_rgba(255,255,255,0.72)]"
            : null
        )}
      >
        {isSmallCardDensity ? (
          <Grid3x3 className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        ) : isRowCardDensity ? (
          <List className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        ) : (
          <Grid2x2 className="h-3 w-3" strokeWidth={1.8} aria-hidden />
        )}
      </button>
    </>
  );

  useLayoutEffect(() => {
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
  }, [availableMatrixPanels.length]);

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
    activeScheduledGroups,
    activeUnscheduledDueHabitGroups,
    measureActiveMatrixPanel,
    openGoalId,
  ]);

  useEffect(() => {
    if (initialMatrixRevealTimeoutRef.current) {
      clearTimeout(initialMatrixRevealTimeoutRef.current);
      initialMatrixRevealTimeoutRef.current = null;
    }

    if (activeMatrixRevealGroupCount <= 0) {
      initialMatrixRevealActiveRef.current = false;
      setIsInitialMatrixRevealActive(false);
      return;
    }

    initialMatrixRevealActiveRef.current = true;
    setIsInitialMatrixRevealActive(true);

    const revealWindowMs =
      (MATRIX_GROUP_REVEAL_BASE_DELAY_SECONDS +
        Math.max(0, activeMatrixRevealGroupCount - 1) *
          MATRIX_GROUP_REVEAL_STAGGER_SECONDS +
        MATRIX_GROUP_REVEAL_DURATION_SECONDS +
        MATRIX_GROUP_REVEAL_BUFFER_SECONDS) *
      1000;

    initialMatrixRevealTimeoutRef.current = setTimeout(() => {
      initialMatrixRevealTimeoutRef.current = null;
      initialMatrixRevealActiveRef.current = false;
      setIsInitialMatrixRevealActive(false);

      if (typeof window === "undefined") {
        measureActiveMatrixPanel();
        return;
      }

      window.requestAnimationFrame(measureActiveMatrixPanel);
    }, revealWindowMs);

    return () => {
      if (initialMatrixRevealTimeoutRef.current) {
        clearTimeout(initialMatrixRevealTimeoutRef.current);
        initialMatrixRevealTimeoutRef.current = null;
      }
    };
  }, [
    activeMatrixPanel,
    activeMatrixRevealGroupCount,
    activeMatrixRevealGroupSignature,
    measureActiveMatrixPanel,
  ]);

  useEffect(() => {
    const activePanel =
      matrixPanel === "unscheduled"
        ? unscheduledPanelRef.current
        : scheduledPanelRef.current;

    if (!activePanel || isInitialMatrixRevealActive) return;

    let animationFrameId: number | null = null;
    const schedulePanelMeasurement = () => {
      if (typeof window === "undefined") {
        measureActiveMatrixPanel();
        return;
      }

      if (animationFrameId !== null) return;

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measureActiveMatrixPanel();
      });
    };

    schedulePanelMeasurement();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedulePanelMeasurement);
    resizeObserver?.observe(activePanel);

    if (typeof window === "undefined") {
      return () => {
        resizeObserver?.disconnect();
      };
    }

    window.addEventListener("resize", schedulePanelMeasurement);
    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePanelMeasurement);
    };
  }, [isInitialMatrixRevealActive, matrixPanel, measureActiveMatrixPanel]);

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

  return (
    <section className="min-w-0">
      <div
        className="relative w-full overflow-hidden touch-pan-y transition-[height] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={
          !isInitialMatrixRevealActive && matrixPanelHeight
            ? { height: matrixPanelHeight }
            : undefined
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
        <div
          ref={matrixPanelViewportRef}
          className={cn(
            isInitialMatrixRevealActive ? "relative" : "absolute inset-0"
          )}
        >
          <div
            className={cn(
              "flex transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              isInitialMatrixRevealActive ? "items-start" : "h-full"
            )}
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
                className={cn(
                  "shrink-0 overflow-hidden",
                  isInitialMatrixRevealActive ? null : "h-full"
                )}
                style={{
                  width: `${100 / Math.max(1, availableMatrixPanels.length)}%`,
                }}
              >
                {panel === "scheduled" ? (
                  <div
                    ref={scheduledPanelRef}
                    className="space-y-2 px-0.5 py-0.5"
                  >
                    {matrixScope === "pinned" &&
                    activeScheduledGroups.length === 0 ? (
                      <EmptyPanel label="No pinned Events yet." />
                    ) : (
                      activeScheduledGroups.map(({ group, items }, index) => (
                        <MatrixRevealGroupSection
                          key={group.key}
                          index={index}
                          collapsed={collapsedMatrixGroupKeys.has(group.key)}
                          onToggle={() => handleMatrixGroupToggle(group.key)}
                          label={
                            <MatrixGroupLabel
                              group={group}
                              matrixView={matrixView}
                              rightControls={
                                panel === activeMatrixPanel && index === 0
                                  ? matrixGridHeaderControls
                                  : undefined
                              }
                            />
                          }
                        >
                          <div
                            className={cn(
                              matrixLibraryGridClass,
                              isSmallCardDensity
                                ? "matrix-event-grid--small-cards"
                                : null
                            )}
                          >
                            {items.map((event) => (
                              <motion.div
                                key={event.instance.id}
                                layout="position"
                                transition={MATRIX_REORDER_LAYOUT_TRANSITION}
                                className="h-full min-w-0"
                              >
                                <ScheduledEventCard
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
                              </motion.div>
                            ))}
                          </div>
                        </MatrixRevealGroupSection>
                      ))
                    )}
                  </div>
                ) : (
                  <div
                    ref={unscheduledPanelRef}
                    className="space-y-2 px-0.5 py-0.5"
                  >
                    {activeUnscheduledDueHabitGroups.map(
                      ({ group, items }, index) => (
                        <MatrixRevealGroupSection
                          key={group.key}
                          index={index}
                          collapsed={collapsedMatrixGroupKeys.has(group.key)}
                          onToggle={() => handleMatrixGroupToggle(group.key)}
                          label={
                            <MatrixGroupLabel
                              group={group}
                              matrixView={matrixView}
                              rightControls={
                                panel === activeMatrixPanel && index === 0
                                  ? matrixGridHeaderControls
                                  : undefined
                              }
                            />
                          }
                        >
                          <div
                            className={cn(
                              matrixLibraryGridClass,
                              isSmallCardDensity
                                ? "matrix-event-grid--small-cards"
                                : null
                            )}
                          >
                            {items.map((item) => (
                              <motion.div
                                key={item.id}
                                layout="position"
                                transition={MATRIX_REORDER_LAYOUT_TRANSITION}
                                className="h-full min-w-0"
                              >
                                {item.kind === "routine" ? (
                                  <MatrixRoutineCard
                                    routine={item.routine}
                                    density={cardDensity}
                                    onCompleteHabit={onCompleteDueHabit}
                                  />
                                ) : (
                                  <DueHabitCard
                                    habit={item.habit}
                                    density={cardDensity}
                                    completing={completingDueHabitIds.has(
                                      item.habit.id
                                    )}
                                    onComplete={onCompleteDueHabit}
                                  />
                                )}
                              </motion.div>
                            ))}
                          </div>
                        </MatrixRevealGroupSection>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {availableMatrixPanels.map((panel) => {
          const isActive = matrixPanel === panel;
          return (
            <button
              key={panel}
              type="button"
              aria-label={
                panel === "scheduled"
                  ? matrixScope === "pinned"
                    ? "Show pinned Events"
                    : "Show scheduled Events"
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
    </section>
  );
}

export function MatrixContent({
  variant = "page",
}: {
  variant?: "page" | "sheet";
} = {}) {
  const { user } = useAuth();
  const { localTimeZone } = useProfile();
  const timeZone = useMemo(
    () => normalizeTimeZone(localTimeZone ?? getBrowserTimeZone()),
    [localTimeZone]
  );
  const [state, setState] = useState<MatrixState>(initialState);
  const [matrixView, setMatrixView] = useState<MatrixView>("monuments");
  const [matrixScope, setMatrixScope] = useState<MatrixScope>("scheduled");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isMatrixTrayOpen, setIsMatrixTrayOpen] = useState(false);
  const [matrixTrayHeight, setMatrixTrayHeight] = useState(0);
  const [completingDueHabitIds, setCompletingDueHabitIds] = useState<
    Set<string>
  >(new Set());
  const [heldMatrixReorderItemIds, setHeldMatrixReorderItemIds] = useState<{
    scheduled: Set<string>;
    due: Set<string>;
  }>(() => ({
    scheduled: new Set(),
    due: new Set(),
  }));
  const [memoCompletionState, setMemoCompletionState] = useState<{
    habit: MatrixHabit;
    source: "scheduled" | "due";
    instanceId?: string;
    completedToday?: boolean;
    completionDate: string;
  } | null>(null);
  const matrixTrayRef = useRef<HTMLDivElement | null>(null);
  const matrixStateRef = useRef<MatrixState>(initialState);
  const completingDueHabitIdsRef = useRef<Set<string>>(new Set());
  const pendingScheduledCompletionIdsRef = useRef<Set<string>>(new Set());
  const matrixReorderHoldTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const bypassMemoCaptureRef = useRef(false);

  useEffect(() => {
    const { view: storedView, scope: storedScope } = readMatrixPreferences();
    if (storedView) {
      setMatrixView(storedView);
    }
    if (storedScope) {
      setMatrixScope(storedScope);
    }
  }, []);

  const handleMatrixViewChange = useCallback((view: MatrixView) => {
    setMatrixView(view);
    writeMatrixPreferences((currentPreferences) => ({
      ...currentPreferences,
      view,
    }));
  }, []);

  const handleMatrixScopeChange = useCallback((scope: MatrixScope) => {
    setMatrixScope(scope);
    writeMatrixPreferences((currentPreferences) => ({
      ...currentPreferences,
      scope,
    }));
  }, []);

  useEffect(() => {
    matrixStateRef.current = state;
  }, [state]);

  const getMatrixReorderHoldTimerKey = useCallback(
    (scope: MatrixReorderHoldScope, itemId: string) => `${scope}:${itemId}`,
    []
  );

  const releaseMatrixReorderHold = useCallback(
    (scope: MatrixReorderHoldScope, itemIds: string[]) => {
      const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
      if (!uniqueItemIds.length) return;

      for (const itemId of uniqueItemIds) {
        const timerKey = getMatrixReorderHoldTimerKey(scope, itemId);
        const timer = matrixReorderHoldTimeoutsRef.current.get(timerKey);
        if (timer) clearTimeout(timer);
        matrixReorderHoldTimeoutsRef.current.delete(timerKey);
      }

      setHeldMatrixReorderItemIds((current) => {
        const key = scope === "scheduled" ? "scheduled" : "due";
        const nextIds = new Set(current[key]);
        let changed = false;

        for (const itemId of uniqueItemIds) {
          if (nextIds.delete(itemId)) changed = true;
        }

        if (!changed) return current;
        return {
          ...current,
          [key]: nextIds,
        };
      });
    },
    [getMatrixReorderHoldTimerKey]
  );

  const holdMatrixReorderItems = useCallback(
    (scope: MatrixReorderHoldScope, itemIds: string[]) => {
      const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
      if (!uniqueItemIds.length) return;

      setHeldMatrixReorderItemIds((current) => {
        const key = scope === "scheduled" ? "scheduled" : "due";
        const nextIds = new Set(current[key]);
        let changed = false;

        for (const itemId of uniqueItemIds) {
          if (!nextIds.has(itemId)) {
            nextIds.add(itemId);
            changed = true;
          }
        }

        if (!changed) return current;
        return {
          ...current,
          [key]: nextIds,
        };
      });

      for (const itemId of uniqueItemIds) {
        const timerKey = getMatrixReorderHoldTimerKey(scope, itemId);
        const existingTimer =
          matrixReorderHoldTimeoutsRef.current.get(timerKey);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          matrixReorderHoldTimeoutsRef.current.delete(timerKey);
          setHeldMatrixReorderItemIds((current) => {
            const key = scope === "scheduled" ? "scheduled" : "due";
            if (!current[key].has(itemId)) return current;

            const nextIds = new Set(current[key]);
            nextIds.delete(itemId);

            return {
              ...current,
              [key]: nextIds,
            };
          });
        }, MATRIX_COMPLETION_REORDER_HOLD_MS);

        matrixReorderHoldTimeoutsRef.current.set(timerKey, timer);
      }
    },
    [getMatrixReorderHoldTimerKey]
  );

  const getScheduledCompletionHoldIds = useCallback((instanceId: string) => {
    const currentState = matrixStateRef.current;
    const itemIds = new Set<string>();
    const groupSets = [
      currentState.eventGroups,
      currentState.skillEventGroups,
      currentState.blockEventGroups,
      currentState.typeEventGroups,
    ];

    for (const groups of groupSets) {
      for (const group of groups) {
        for (const event of group.items) {
          if (event.instance.id === instanceId) {
            itemIds.add(event.instance.id);
            continue;
          }

          if (
            event.routine?.habits.some(
              (habit) => habit.sourceInstance?.id === instanceId
            )
          ) {
            itemIds.add(event.instance.id);
          }
        }
      }
    }

    return itemIds.size ? Array.from(itemIds) : [instanceId];
  }, []);

  const getDueCompletionHoldIds = useCallback((habitId: string) => {
    const currentState = matrixStateRef.current;
    const itemIds = new Set<string>();
    const groupSets = [
      currentState.unscheduledDueHabitGroups,
      currentState.skillUnscheduledDueHabitGroups,
      currentState.blockUnscheduledDueHabitGroups,
      currentState.typeUnscheduledDueHabitGroups,
    ];

    for (const groups of groupSets) {
      for (const group of groups) {
        for (const item of group.items) {
          if (item.kind === "habit" && item.habit.id === habitId) {
            itemIds.add(item.id);
            continue;
          }

          if (
            item.kind === "routine" &&
            item.routine.habits.some((habit) => habit.id === habitId)
          ) {
            itemIds.add(item.id);
          }
        }
      }
    }

    return itemIds.size ? Array.from(itemIds) : [habitId];
  }, []);

  useEffect(() => {
    const holdTimeouts = matrixReorderHoldTimeoutsRef.current;
    return () => {
      for (const timer of holdTimeouts.values()) {
        clearTimeout(timer);
      }
      holdTimeouts.clear();
    };
  }, []);

  const commitScheduledEventCompletion = useCallback(
    async (
      instanceId: string,
      nextStatus: ScheduleInstance["status"],
      options?: MatrixScheduledCompletionOptions
    ) => {
      if (!user?.id) {
        void hapticWarningPattern();
        return false;
      }

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        console.error("Supabase client is not available.");
        void hapticWarningPattern();
        return false;
      }

      if (pendingScheduledCompletionIdsRef.current.has(instanceId)) {
        void hapticWarningPattern();
        return false;
      }
      pendingScheduledCompletionIdsRef.current.add(instanceId);

      try {
        const { error } = await supabase
          .from("schedule_instances")
          .update({ status: nextStatus })
          .eq("id", instanceId)
          .eq("user_id", user.id);

        if (error) {
          console.error("Failed to toggle scheduled Matrix Event", error);
          void hapticErrorPattern();
          return false;
        }

        const heldItemIds = getScheduledCompletionHoldIds(instanceId);
        if (nextStatus === "completed") {
          holdMatrixReorderItems("scheduled", heldItemIds);
        } else {
          releaseMatrixReorderHold("scheduled", heldItemIds);
        }

        const updateScheduledEventGroups = (
          groups: MonumentGroup<MatrixEvent>[]
        ) =>
          groups.map((group) => ({
            ...group,
            items: group.items.map((event) => {
              const nextEvent =
                event.instance.id === instanceId
                  ? {
                      ...event,
                      instance: {
                        ...event.instance,
                        status: nextStatus,
                      },
                    }
                  : event;

              if (!nextEvent.routine) return nextEvent;

              const nextHabits = nextEvent.routine.habits.map((habit) => {
                if (habit.sourceInstance?.id !== instanceId) return habit;

                const sourceInstance = {
                  ...habit.sourceInstance,
                  status: nextStatus,
                };

                return {
                  ...habit,
                  dueLabel: getMatrixScheduledHabitLabel(nextStatus),
                  sourceInstance,
                };
              });

              return {
                ...nextEvent,
                routine: {
                  ...nextEvent.routine,
                  habits: nextHabits,
                  completed: isMatrixScheduledRoutineCompleted(nextHabits),
                },
              };
            }),
          }));

        setState((current) => ({
          ...current,
          eventGroups: updateScheduledEventGroups(current.eventGroups),
          skillEventGroups: updateScheduledEventGroups(
            current.skillEventGroups
          ),
          blockEventGroups: updateScheduledEventGroups(
            current.blockEventGroups
          ),
          typeEventGroups: updateScheduledEventGroups(
            current.typeEventGroups
          ),
        }));

        if (
          nextStatus === "completed" &&
          options?.hapticOnComplete !== false
        ) {
          void hapticComplete();
        }
        return true;
      } catch (error) {
        console.error("Failed to toggle scheduled Matrix Event", error);
        void hapticErrorPattern();
        return false;
      } finally {
        pendingScheduledCompletionIdsRef.current.delete(instanceId);
      }
    },
    [
      getScheduledCompletionHoldIds,
      holdMatrixReorderItems,
      releaseMatrixReorderHold,
      user?.id,
    ]
  );

  const findMatrixHabit = useCallback(
    (habitId: string): MatrixHabit | null => {
      const groupSets = [
        state.unscheduledDueHabitGroups,
        state.skillUnscheduledDueHabitGroups,
        state.blockUnscheduledDueHabitGroups,
        state.typeUnscheduledDueHabitGroups,
      ];
      for (const groups of groupSets) {
        for (const group of groups) {
          for (const item of group.items) {
            if (item.kind === "habit" && item.habit.id === habitId) {
              return item.habit;
            }

            if (item.kind === "routine") {
              const habit = item.routine.habits.find(
                (routineHabit) => routineHabit.id === habitId
              );
              if (habit) return habit.sourceHabit;
            }
          }
        }
      }
      const eventGroupSets = [
        state.eventGroups,
        state.skillEventGroups,
        state.blockEventGroups,
        state.typeEventGroups,
      ];
      for (const groups of eventGroupSets) {
        for (const group of groups) {
          for (const event of group.items) {
            if (event.habit?.id === habitId) return event.habit;

            const routineHabit = event.routine?.habits.find(
              (habit) => habit.id === habitId
            );
            if (routineHabit) return routineHabit.sourceHabit;
          }
        }
      }
      return null;
    },
    [
      state.blockEventGroups,
      state.blockUnscheduledDueHabitGroups,
      state.eventGroups,
      state.skillEventGroups,
      state.skillUnscheduledDueHabitGroups,
      state.typeEventGroups,
      state.typeUnscheduledDueHabitGroups,
      state.unscheduledDueHabitGroups,
    ]
  );

  const findMatrixEvent = useCallback(
    (instanceId: string): MatrixEvent | null => {
      const groupSets = [
        state.eventGroups,
        state.skillEventGroups,
        state.blockEventGroups,
        state.typeEventGroups,
      ];
      for (const groups of groupSets) {
        for (const group of groups) {
          for (const event of group.items) {
            if (event.instance.id === instanceId) return event;

            const routineHabit = event.routine?.habits.find(
              (habit) => habit.sourceInstance?.id === instanceId
            );
            if (routineHabit?.sourceInstance) {
              return {
                instance: routineHabit.sourceInstance,
                title: routineHabit.sourceHabit.name,
                monumentId: routineHabit.sourceHabit.monumentId,
                skillIds: routineHabit.sourceHabit.skillIds,
                glyph: routineHabit.sourceHabit.glyph,
                goal: null,
                habit: routineHabit.sourceHabit,
                routine: null,
              };
            }
          }
        }
      }
      return null;
    },
    [
      state.blockEventGroups,
      state.eventGroups,
      state.skillEventGroups,
      state.typeEventGroups,
    ]
  );

  const handleCompleteScheduledEvent = useCallback(
    (
      instanceId: string,
      nextStatus: ScheduleInstance["status"],
      options?: MatrixScheduledCompletionOptions
    ) => {
      const event = findMatrixEvent(instanceId);
      if (
        nextStatus === "completed" &&
        event?.habit &&
        normalizeRelatedHabitType(event.habit.habit_type) === "MEMO"
      ) {
        setMemoCompletionState({
          habit: event.habit,
          source: "scheduled",
          instanceId,
          completionDate: new Date().toISOString(),
        });
        return;
      }
      void commitScheduledEventCompletion(instanceId, nextStatus, options);
    },
    [commitScheduledEventCompletion, findMatrixEvent]
  );

  const handleCompleteDueHabit = useCallback(
    async (habitId: string, completedToday: boolean) => {
      if (!user?.id) return;

      const habit = findMatrixHabit(habitId);
      if (
        !bypassMemoCaptureRef.current &&
        !completedToday &&
        habit &&
        normalizeRelatedHabitType(habit.habit_type) === "MEMO"
      ) {
        setMemoCompletionState({
          habit,
          source: "due",
          completedToday,
          completionDate: new Date().toISOString(),
        });
        return;
      }

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

        const heldItemIds = getDueCompletionHoldIds(habitId);
        if (completedToday) {
          releaseMatrixReorderHold("due", heldItemIds);
        } else {
          holdMatrixReorderItems("due", heldItemIds);
        }

        setState((current) => {
          const updateHabitInGroups = (
            groups: MonumentGroup<MatrixDueItem>[]
          ) => {
            return groups
              .map((group) => {
                const items = group.items.flatMap((item): MatrixDueItem[] => {
                  const updateHabit = (habit: MatrixHabit) => {
                    if (habit.id !== habitId) return habit;

                    if (!completedToday) {
                      return {
                        ...habit,
                        last_completed_at: completedAt,
                        next_due_override: null,
                        dueStatus: {
                          isDue: true,
                          isOverdue: false,
                          isCompletedToday: true,
                          label: "COMPLETE" as const,
                        },
                      };
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

                    return dueStatus.isDue
                      ? {
                          ...undoneHabit,
                          dueStatus,
                        }
                      : null;
                  };

                  if (item.kind === "habit") {
                    const updatedHabit = updateHabit(item.habit);
                    return updatedHabit
                      ? [
                          {
                            ...item,
                            habit: updatedHabit,
                            name: updatedHabit.name,
                            monumentId: updatedHabit.monumentId,
                            skillIds: updatedHabit.skillIds,
                          },
                        ]
                      : [];
                  }

                  const updatedRoutineHabits = item.routine.habits.flatMap(
                    (routineHabit): MatrixRoutineHabit[] => {
                      const updatedHabit = updateHabit(
                        routineHabit.sourceHabit
                      );
                      if (!updatedHabit) return [];

                      return [
                        {
                          ...routineHabit,
                          dueLabel: updatedHabit.dueStatus?.label ?? null,
                          completed: isMatrixDueHabitCompleted(updatedHabit),
                          sourceHabit: updatedHabit,
                          durationMinutes: updatedHabit.duration_minutes,
                        },
                      ];
                    }
                  );

                  if (updatedRoutineHabits.length === 0) return [];

                  const totalDuration = updatedRoutineHabits.reduce(
                    (sum, routineHabit) => {
                      const duration = routineHabit.durationMinutes;
                      return typeof duration === "number" &&
                        Number.isFinite(duration)
                        ? sum + duration
                        : sum;
                    },
                    0
                  );

                  return [
                    {
                      ...item,
                      routine: {
                        ...item.routine,
                        habits: updatedRoutineHabits,
                        dueHabitCount: updatedRoutineHabits.length,
                        totalDueDurationMinutes:
                          totalDuration > 0 ? totalDuration : null,
                      },
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
            typeUnscheduledDueHabitGroups: updateHabitInGroups(
              current.typeUnscheduledDueHabitGroups
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
    [
      findMatrixHabit,
      getDueCompletionHoldIds,
      holdMatrixReorderItems,
      releaseMatrixReorderHold,
      timeZone,
      user?.id,
    ]
  );

  const handlePullRefresh = useCallback(async () => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleCreatorEntitySaved = (event: Event) => {
      const detail = (event as CustomEvent<{ entityType?: string }>).detail;
      const entityType = detail?.entityType;
      if (
        entityType !== "GOAL" &&
        entityType !== "PROJECT" &&
        entityType !== "TASK" &&
        entityType !== "HABIT" &&
        entityType !== "ROUTINE"
      ) {
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
          matrixTags,
          monuments,
        ] =
          await Promise.all([
            scheduledHabitIds.size
              ? supabase
                  .from("habits")
                  .select(
                    "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, memo_capture_config, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override, routine_id, routine_position"
                  )
                  .eq("user_id", userId)
                  .is("circle_id", null)
                  .in("id", Array.from(scheduledHabitIds))
              : Promise.resolve({ data: [], error: null }),
            supabase
              .from("habits")
              .select(
                "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, memo_capture_config, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override, routine_id, routine_position"
              )
              .eq("user_id", userId)
              .is("circle_id", null),
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
            loadMatrixTags(supabase, userId),
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

        const routineIds = Array.from(
          new Set(
            ((allHabitsResult.data ?? []) as HabitRow[])
              .map((habit) => habit.routine_id)
              .filter((routineId): routineId is string =>
                Boolean(routineId?.trim())
              )
          )
        );
        const routineResult = routineIds.length
          ? await supabase
              .from("habit_routines")
              .select("id, name, description, icon")
              .eq("user_id", userId)
              .in("id", routineIds)
          : { data: [], error: null };

        if (routineResult.error) throw routineResult.error;

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
        const routineMap = new Map(
          ((routineResult.data ?? []) as RoutineRow[]).map((routine) => [
            routine.id,
            routine,
          ])
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

        const rawEvents = buildMatrixEvents({
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
        const events = buildMatrixScheduledEvents({
          events: rawEvents,
          routines: routineMap,
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
              skillIcon: habit.skill_id
                ? (skillIdToIcon.get(habit.skill_id) ?? null)
                : null,
              skillIds: habit.skill_id ? [habit.skill_id] : [],
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        const unscheduledDueItems = buildMatrixDueItems({
          habits: unscheduledDueHabits,
          routines: routineMap,
        });

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            matrixTags,
            eventGroups: groupByMonument({ items: events, monuments }),
            unscheduledDueHabitGroups: groupByMonument({
              items: unscheduledDueItems,
              monuments,
            }),
            skillEventGroups: groupBySkill({
              items: events,
              skills: skillLookup,
            }),
            skillUnscheduledDueHabitGroups: groupBySkill({
              items: unscheduledDueItems,
              skills: skillLookup,
            }),
            blockEventGroups: groupEventsByBlock({
              items: events,
              timeBlocks: timeBlockMap,
              dayTypeTimeBlockById,
              dayTypeTimeBlockByTimeBlockId,
            }),
            blockUnscheduledDueHabitGroups:
              groupUnscheduledDueHabitsByNoBlock(unscheduledDueItems),
            typeEventGroups: groupByType({
              items: events,
              skills: skillLookup,
              getTypeGroupKey: getMatrixEventTypeGroupKey,
              sortItems: sortMatrixScheduledItems,
            }),
            typeUnscheduledDueHabitGroups: groupByType({
              items: unscheduledDueItems,
              skills: skillLookup,
              getTypeGroupKey: getMatrixDueItemTypeGroupKey,
              sortItems: sortMatrixDueItems,
            }),
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
  }, [refreshVersion, timeZone, user?.id]);

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

  const matrixTypeGroups = useMemo(
    () =>
      mergeMatrixMonumentGroups({
        scheduledGroups: state.typeEventGroups,
        unscheduledDueHabitGroups: state.typeUnscheduledDueHabitGroups,
      }),
    [state.typeEventGroups, state.typeUnscheduledDueHabitGroups]
  );

  const activeMatrixGroups =
    matrixView === "blocks"
      ? matrixBlockGroups
      : matrixView === "types"
        ? matrixTypeGroups
        : matrixView === "skills"
        ? matrixSkillGroups
        : matrixMonumentGroups;
  const shouldShowMatrixCarousel =
    activeMatrixGroups.length > 0 || matrixScope === "pinned";

  const handleMemoCompletionSubmitted = useCallback(async () => {
    if (!memoCompletionState) return;

    if (memoCompletionState.source === "scheduled") {
      if (memoCompletionState.instanceId) {
        await commitScheduledEventCompletion(
          memoCompletionState.instanceId,
          "completed"
        );
      }
      setMemoCompletionState(null);
      return;
    }

    bypassMemoCaptureRef.current = true;
    try {
      await handleCompleteDueHabit(
        memoCompletionState.habit.id,
        memoCompletionState.completedToday ?? false
      );
      setMemoCompletionState(null);
    } finally {
      bypassMemoCaptureRef.current = false;
    }
  }, [
    commitScheduledEventCompletion,
    handleCompleteDueHabit,
    memoCompletionState,
  ]);

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

  const matrixSettingsToggle = (
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
  );

  const matrixBody = (
    <>
      {variant === "page" ? (
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
          {matrixSettingsToggle}
        </header>
      ) : (
        <div className="flex justify-end px-0.5">{matrixSettingsToggle}</div>
      )}

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
                  activeScope={matrixScope}
                  matrixTags={state.matrixTags}
                  onViewChange={handleMatrixViewChange}
                  onScopeChange={handleMatrixScopeChange}
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

        <section className="px-0.5 py-0.5">
          {state.loading ? (
            <MatrixLoadingRows />
          ) : shouldShowMatrixCarousel ? (
            <MatrixGridCarousel
              groups={activeMatrixGroups}
              matrixView={matrixView}
              matrixScope={matrixScope}
              onCompleteScheduledEvent={handleCompleteScheduledEvent}
              onCompleteDueHabit={handleCompleteDueHabit}
              completingDueHabitIds={completingDueHabitIds}
              heldScheduledCompletionItemIds={
                heldMatrixReorderItemIds.scheduled
              }
              heldDueCompletionItemIds={heldMatrixReorderItemIds.due}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <EmptyPanel label="No scheduled Events found for today." />
              <EmptyPanel label="No due habits are waiting outside scheduled Events." />
            </div>
          )}
        </section>
    </>
  );

  return (
    <>
    {variant === "page" ? (
      <main className="min-h-screen bg-[#030406] text-white">
        <PullRefreshShell
          onRefresh={handlePullRefresh}
          lockDocumentScroll={false}
          contentClassName="px-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] pt-1 sm:px-6 lg:px-8"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
            {matrixBody}
          </div>
        </PullRefreshShell>
      </main>
    ) : (
      <div className="flex w-full min-w-0 flex-col gap-2 overflow-x-hidden text-white">
        {matrixBody}
      </div>
    )}
    <MemoCompletionDialog
      open={Boolean(memoCompletionState)}
      context={
        memoCompletionState
          ? {
              habitId: memoCompletionState.habit.id,
              habitName: memoCompletionState.habit.name,
              habitType: memoCompletionState.habit.habit_type,
              skillId: memoCompletionState.habit.skill_id,
              skillIcon: memoCompletionState.habit.skillIcon,
              memoCaptureConfig: memoCompletionState.habit.memo_capture_config,
              completionDate: memoCompletionState.completionDate,
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
