"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import { createPortal } from "react-dom";
import type { AnimationPlaybackControls } from "framer-motion";
import clsx from "clsx";
import { Lock } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  DayTimeline,
  TIMELINE_CARD_LEFT_FALLBACK,
  TIMELINE_CARD_RIGHT_FALLBACK,
  TIMELINE_GRID_LEFT_FALLBACK,
  TIMELINE_GRID_RIGHT_FALLBACK,
  TIMELINE_LABEL_COLUMN_FALLBACK,
  TIMELINE_RIGHT_GUTTER_FALLBACK,
} from "@/components/schedule/DayTimeline";
import {
  FocusTimeline,
  FocusTimelineFab,
} from "@/components/schedule/FocusTimeline";
import FlameEmber, {
  FlameLevel,
  type FlameEmberProps,
} from "@/components/FlameEmber";
import { ScheduleTopBar } from "@/components/schedule/ScheduleTopBar";
import { JumpToDateSheet } from "@/components/schedule/JumpToDateSheet";
import { ScheduleSearchSheet } from "@/components/schedule/ScheduleSearchSheet";
import { ProjectEditSheet } from "@/components/schedule/ProjectEditSheet";
import { HabitEditSheet } from "@/components/schedule/HabitEditSheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ScheduleEditOrigin } from "@/components/schedule/ScheduleMorphDialog";
import { scheduleInstanceLayoutTokens } from "@/components/schedule/sharedLayout";
import { SchedulerModeSheet } from "@/components/schedule/SchedulerModeSheet";
import { type ScheduleView } from "@/components/schedule/viewUtils";
import {
  updateTaskStage,
  type WindowLite as RepoWindow,
} from "@/lib/scheduler/repo";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  hapticComplete,
  hapticErrorPattern,
  hapticLongPress,
  hapticPress,
  hapticSnap,
  hapticSoftTick,
  hapticWarningPattern,
} from "@/lib/haptics/creatorHaptics";
import {
  fetchScheduledProjectIds,
  updateInstanceStatus,
  type ScheduleInstance,
} from "@/lib/scheduler/instanceRepo";
import {
  syncScheduleBlockLocalNotifications,
  type ScheduleBlockLocalNotificationInstance,
  type ScheduleBlockLocalNotificationTimeBlock,
} from "@/lib/notifications/scheduleBlockLocalNotifications";
import { syncScheduleWidgetPayload } from "@/lib/widgets/scheduleWidget";
import { TaskLite, ProjectLite } from "@/lib/scheduler/weight";
import { buildProjectItems } from "@/lib/scheduler/projects";
import { windowRectMinutes } from "@/lib/scheduler/windowRect";
import { ENERGY } from "@/lib/scheduler/config";
import {
  DAY_TYPE_BLOCK_UPDATED_EVENT,
} from "@/lib/scheduler/dayTypeBlockEvents";
import {
  DEFAULT_HABIT_DURATION_MIN,
  type HabitScheduleItem,
} from "@/lib/scheduler/habits";
import { MAX_SCHEDULER_WRITE_DAYS } from "@/lib/scheduler/limits";
import { normalizeHabitType } from "@/lib/scheduler/habits";
import { mergeHabitCompletionStateFromInstances } from "@/lib/scheduler/habitCompletionState";
import {
  computeTimelineLayoutForSyncHabits,
  type TimelineCardLaneLayout,
  type SyncPairingsByInstanceId,
  type TimelineCardLayoutMode,
} from "@/lib/scheduler/syncLayout";
import type { ScheduleEventDataset } from "@/lib/scheduler/dataset";
import { useLocationContexts } from "@/lib/hooks/useLocationContexts";
import { formatLocalDateKey, toLocal, dayKeyFromUtc } from "@/lib/time/tz";
import {
  GLOBAL_DAY_START_HOUR,
  startOfDayInTimeZone,
  addDaysInTimeZone,
  makeDateInTimeZone,
  getDateTimeParts,
  makeZonedDate,
  weekdayInTimeZone,
  getDatePartsInTimeZone,
  getSchedulerDayAnchorForNow,
  normalizeTimeZone,
} from "@/lib/scheduler/timezone";
import {
  computeEnergyHoursForDateRange,
  computeProjectedGoalsLikely,
  EMPTY_ENERGY_TOTALS,
  type JumpToDateSnapshot,
} from "@/lib/scheduler/snapshot";
import { toZonedTime, format } from "date-fns-tz";
import {
  TIME_FORMATTER,
  describeEmptyWindowReport,
  energyIndexFromLabel,
  formatDurationLabel,
  type SchedulerRunFailure,
} from "@/lib/scheduler/windowReports";
import {
  clipSegmentToDay,
  computeWindowReportsForDay,
  getLocalDayRange,
  isValidDate,
  normalizeEnergyLabel,
  resolveWindowBoundsForDate as resolveWindowBoundsForDateLib,
  updateScheduleEnergyLookup,
} from "@/lib/scheduler/dayWindowReports";
import type {
  HabitTimelinePlacement,
  SchedulerDebugState,
  SchedulerTimelineEntry,
  SchedulerTimelinePlacement,
  WindowReportEntry,
} from "@/lib/scheduler/dayWindowReports";
import type { SkillRow } from "@/lib/types/skill";
import type { Monument } from "@/lib/queries/monuments";
import {
  selectionToSchedulerModePayload,
  type SchedulerModeSelection,
  type SchedulerModeType,
} from "@/lib/scheduler/modes";
import { MemoCompletionDialog } from "@/components/schedule/MemoCompletionDialog";
import { scheduleTourSteps } from "@/lib/tours/scheduleTour";
import { useTour } from "@/components/tour/TourProvider";
import {
  SCHEDULE_TOUR_COMPLETED_KEY,
  SCHEDULE_TOUR_PENDING_KEY,
  completeCreatorTourState,
} from "@/lib/tours/creatorTourState";
import { useProfile } from "@/lib/hooks/useProfile";
import { applyStatusTargets, type StatusTarget } from "./statusMutations";
import {
  getHabitCompletionStateKey,
  type HabitCompletionByDate,
  type HabitCompletionStatus,
  resolveHabitCompletionStatus,
} from "./habitCompletion";
import { useToastHelpers } from "@/components/ui/toast";

const DEBUG_DAY_SHIFT = true;

function formatScheduleDateKey(date: Date, timeZone: string) {
  return dayKeyFromUtc(date, timeZone);
}

type DayTransitionDirection = -1 | 0 | 1;

type PeekState = {
  direction: DayTransitionDirection;
  offset: number;
};

const HABIT_COMPLETION_STORAGE_PREFIX = "schedule-habit-completions";
const SCHEDULE_INSTANCE_NO_SELECT_STYLE: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};
const DAY_PEEK_SAFE_GAP_PX = 24;
const MIN_PX_PER_MIN = 0.9;
const MAX_PX_PER_MIN = 3.2;
const INITIAL_PX_PER_MIN = 2.6;
const PX_PER_MIN_STOPS = [
  0.9, 1.1, 1.25, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2,
] as const;
const VERTICAL_SCROLL_THRESHOLD_PX = 20;
const VERTICAL_SCROLL_BIAS_PX = 8;
const VERTICAL_SCROLL_SLOPE = 1.35;
const INLINE_JUMP_REVEAL_HEIGHT_PX = 360;
const INLINE_JUMP_TIMELINE_PEEK_MIN_PX = 124;
const INLINE_JUMP_TIMELINE_PEEK_MAX_PX = 172;
const INLINE_JUMP_TIMELINE_PEEK_VIEWPORT_RATIO = 0.16;
const INLINE_JUMP_PULL_RESISTANCE = 0.55;
const inlineJumpOpenTransition = {
  type: "spring",
  stiffness: 185,
  damping: 26,
  mass: 0.9,
} as const;
const inlineJumpCloseTransition = {
  type: "spring",
  stiffness: 255,
  damping: 31,
  mass: 0.85,
} as const;
const DEBUG_LONG_PRESS = true;
const SCHEDULE_CARD_LONG_PRESS_MS = 650;
const LONG_PRESS_FEEDBACK_DURATION_MS = 280;
const COMPLETION_BOUNCE_DURATION_MS = 420;
const HABIT_STREAK_BADGE_BASE_HEIGHT_PX = 18;
const HABIT_STREAK_BADGE_TOP_MARGIN_PX = 8;
const HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX = 2;
const HABIT_COMPACT_SHADOW_HEIGHT_PX = 96;
const HABIT_COMPACT_SHADOW =
  "0 14px 32px rgba(6, 8, 20, 0.52), 0 6px 16px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.12)";
const TIMELINE_COMPACT_CARD_HEIGHT_PX = 56;
const TIMELINE_COMPACT_CARD_SHADOW =
  "0 14px 28px rgba(6, 8, 20, 0.45), 0 8px 18px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.08)";
const TIMELINE_RESTING_CARD_SHADOW =
  "0 0 0 1px rgba(255, 255, 255, 0.035), 0 10px 24px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08)";
const FOCUS_POMO_COMPLETE_BACKGROUND =
  "linear-gradient(155deg, rgb(34, 197, 94) 0%, rgb(22, 163, 74) 48%, rgb(21, 128, 61) 100%)";
const FOCUS_POMO_COMPLETE_SHADOW =
  "0 22px 38px rgba(0, 0, 0, 0.34), 0 9px 18px rgba(3, 83, 45, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.045), inset 0 -2px 8px rgba(0, 0, 0, 0.11), inset 0 0 0 1px rgba(0, 0, 0, 0.08)";
const FOCUS_POMO_COMPLETE_OUTLINE = "1px solid rgba(22, 101, 52, 0.42)";
const FOCUS_POMO_COMPLETE_EFFECT_CLASSES =
  "shimmer-border-complete focus-pomo-start-glint z-0 [&>.absolute]:!absolute";
const TIMELINE_DARK_EVENT_BACKGROUND =
  "radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgb(8, 8, 10) 0%, rgb(22, 22, 26) 42%, rgb(34, 35, 42) 100%)";
const TIMELINE_NEUTRAL_EVENT_BACKGROUND =
  "linear-gradient(135deg, rgb(46, 46, 52) 0%, rgb(58, 58, 66) 45%, rgb(82, 82, 92) 100%)";
const TIMELINE_SHINY_TASK_BACKGROUND =
  "linear-gradient(135deg, rgb(52, 52, 60) 0%, rgb(82, 84, 94) 40%, rgb(158, 162, 174) 100%)";
const TIMELINE_FALLBACK_TASK_BACKGROUND =
  "linear-gradient(135deg, rgb(44, 44, 52) 0%, rgb(68, 70, 80) 38%, rgb(120, 126, 138) 100%)";
const TIMELINE_CHORE_EVENT_BACKGROUND =
  "radial-gradient(circle at 10% -25%, rgba(248, 113, 113, 0.34), transparent 58%), linear-gradient(135deg, rgb(127, 29, 29) 0%, rgb(185, 28, 28) 48%, rgb(168, 34, 43) 100%)";
const TIMELINE_RELAXER_EVENT_BACKGROUND =
  "radial-gradient(circle at 8% -18%, rgba(6, 95, 70, 0.34), transparent 60%), linear-gradient(138deg, rgb(3, 24, 18) 0%, rgb(5, 68, 51) 48%, rgb(6, 78, 59) 100%)";
const TIMELINE_SYNC_EVENT_BACKGROUND =
  "radial-gradient(circle at 12% -20%, rgba(226, 232, 240, 0.34), transparent 58%), linear-gradient(135deg, rgb(82, 82, 91) 0%, rgb(113, 113, 122) 48%, rgb(124, 126, 136) 100%)";
const TIMELINE_PRACTICE_EVENT_BACKGROUND =
  "radial-gradient(circle at 6% -14%, rgba(79, 70, 229, 0.22), transparent 60%), linear-gradient(142deg, rgb(8, 9, 20) 0%, rgb(24, 27, 51) 46%, rgb(34, 38, 70) 100%)";
const SCHEDULE_SCHEDULER_RUNNING_EVENT =
  "schedule:scheduler-running-changed";
const TIMELINE_STACK_BASE_Z_INDEX = 30;
const TIMELINE_STACK_SCALE = 10;
const TIMELINE_OVERLAY_STACK_BASE_Z_INDEX = 20000;
const TIMELINE_OVERLAY_STACK_STEP = 20;

function getTimelineHabitEventBackground(normalizedHabitType: string) {
  if (normalizedHabitType === "CHORE") return TIMELINE_CHORE_EVENT_BACKGROUND;
  if (normalizedHabitType === "RELAXER")
    return TIMELINE_RELAXER_EVENT_BACKGROUND;
  if (normalizedHabitType === "PRACTICE")
    return TIMELINE_PRACTICE_EVENT_BACKGROUND;
  if (normalizedHabitType === "SYNC" || normalizedHabitType === "MEMO")
    return TIMELINE_SYNC_EVENT_BACKGROUND;
  return TIMELINE_DARK_EVENT_BACKGROUND;
}

const TIMELINE_HABIT_SCHEDULED_SHADOW = [
  "0 28px 58px rgba(3, 3, 6, 0.66)",
  "0 10px 24px rgba(0, 0, 0, 0.45)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
].join(", ");
const TIMELINE_HABIT_CHORE_SHADOW = [
  "0 18px 36px rgba(56, 16, 24, 0.38)",
  "0 8px 18px rgba(76, 20, 32, 0.26)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
].join(", ");
const TIMELINE_HABIT_RELAXER_SHADOW = [
  "0 20px 40px rgba(3, 47, 39, 0.52)",
  "0 10px 22px rgba(2, 119, 84, 0.32)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
].join(", ");
const TIMELINE_HABIT_SYNC_SHADOW = [
  "0 18px 36px rgba(58, 44, 14, 0.32)",
  "0 8px 18px rgba(82, 62, 18, 0.24)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
].join(", ");
const TIMELINE_HABIT_PRACTICE_SHADOW = [
  "0 30px 60px rgba(2, 2, 6, 0.72)",
  "0 12px 28px rgba(0, 0, 0, 0.48)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
].join(", ");

function normalizeTimelineHabitType(value?: string | null) {
  const normalized = normalizeHabitType(value ?? "HABIT");
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

function getTimelineHabitTypeClass(normalizedHabitType: string) {
  if (normalizedHabitType === "MEMO") return "habit-card--type-memo";
  if (normalizedHabitType === "CHORE") return "habit-card--type-chore";
  if (normalizedHabitType === "RELAXER") return "habit-card--type-relaxer";
  if (normalizedHabitType === "PRACTICE")
    return "habit-card--type-practice";
  if (normalizedHabitType === "SYNC") return "habit-card--type-sync";
  return "habit-card--type-default";
}

function getScheduledHabitCardVisuals({
  habitType,
  completed,
}: {
  habitType?: string | null;
  completed: boolean;
}) {
  const normalizedHabitType = normalizeTimelineHabitType(habitType);
  if (completed) {
    return {
      normalizedHabitType,
      typeClass: getTimelineHabitTypeClass(normalizedHabitType),
      borderClass: "border-green-900/45",
      shadow: FOCUS_POMO_COMPLETE_SHADOW,
      outline: FOCUS_POMO_COMPLETE_OUTLINE,
      background: FOCUS_POMO_COMPLETE_BACKGROUND,
    };
  }

  if (normalizedHabitType === "CHORE") {
    return {
      normalizedHabitType,
      typeClass: getTimelineHabitTypeClass(normalizedHabitType),
      borderClass: "border-rose-200/45",
      shadow: TIMELINE_HABIT_CHORE_SHADOW,
      outline: "1px solid rgba(0, 0, 0, 0.85)",
      background: getTimelineHabitEventBackground(normalizedHabitType),
    };
  }
  if (normalizedHabitType === "RELAXER") {
    return {
      normalizedHabitType,
      typeClass: getTimelineHabitTypeClass(normalizedHabitType),
      borderClass: "border-emerald-200/60",
      shadow: TIMELINE_HABIT_RELAXER_SHADOW,
      outline: "1px solid rgba(52, 211, 153, 0.55)",
      background: getTimelineHabitEventBackground(normalizedHabitType),
    };
  }
  if (normalizedHabitType === "PRACTICE") {
    return {
      normalizedHabitType,
      typeClass: getTimelineHabitTypeClass(normalizedHabitType),
      borderClass: "border-slate-500/50",
      shadow: TIMELINE_HABIT_PRACTICE_SHADOW,
      outline: "1px solid rgba(8, 8, 12, 0.92)",
      background: getTimelineHabitEventBackground(normalizedHabitType),
    };
  }
  if (normalizedHabitType === "SYNC" || normalizedHabitType === "MEMO") {
    return {
      normalizedHabitType,
      typeClass: getTimelineHabitTypeClass(normalizedHabitType),
      borderClass: "border-amber-200/45",
      shadow: TIMELINE_HABIT_SYNC_SHADOW,
      outline: "1px solid rgba(0, 0, 0, 0.85)",
      background: getTimelineHabitEventBackground(normalizedHabitType),
    };
  }

  return {
    normalizedHabitType,
    typeClass: getTimelineHabitTypeClass(normalizedHabitType),
    borderClass: "border-black/70",
    shadow: TIMELINE_HABIT_SCHEDULED_SHADOW,
    outline: "1px solid rgba(10, 10, 12, 0.85)",
    background: getTimelineHabitEventBackground(normalizedHabitType),
  };
}

const TIMELINE_CSS_VARIABLES: CSSProperties = {
  "--timeline-label-column": TIMELINE_LABEL_COLUMN_FALLBACK,
  "--timeline-right-gutter": TIMELINE_RIGHT_GUTTER_FALLBACK,
  "--timeline-grid-left": TIMELINE_GRID_LEFT_FALLBACK,
  "--timeline-grid-right": TIMELINE_GRID_RIGHT_FALLBACK,
  "--timeline-card-left": TIMELINE_CARD_LEFT_FALLBACK,
  "--timeline-card-right": TIMELINE_CARD_RIGHT_FALLBACK,
};

type ManualPlacementCandidate = {
  instanceId?: string | null;
  sourceId?: string | null;
  durationMinutes: number;
  title?: string | null;
  sourceType?: "PROJECT" | "HABIT" | "TASK" | null;
  energy?: string | null;
  goalName?: string | null;
  habitType?: string | null;
  currentStreakDays?: number | null;
  globalRank?: number | null;
};

type ManualPlacementRequestDetail = {
  result?: {
    id?: string;
    scheduleInstanceId?: string | null;
    durationMinutes?: number;
    nextScheduledAt?: string;
    name?: string;
    type?: string;
    energy?: string;
    goalName?: string;
    habitType?: string;
    habit_type?: string;
    scheduleHabitType?: string;
    schedule_habit_type?: string;
    scheduleInstanceHabitType?: string;
    schedule_instance_habit_type?: string;
    scheduleInstanceSourceHabitType?: string;
    schedule_instance_source_habit_type?: string;
    instanceHabitType?: string;
    instance_habit_type?: string;
    sourceHabitType?: string;
    source_habit_type?: string;
    currentStreakDays?: number;
    global_rank?: number;
  };
  pointer?: {
    clientX?: number;
    clientY?: number;
    pointerId?: number;
    width?: number;
  };
};

type ManualPlacementDragGhost = {
  x: number;
  y: number;
  label: string;
  mode: "pickup" | "placing";
  pointerId: number | null;
  width: number;
};

type OptimisticManualPlacement = {
  tempId: string | null;
  previousInstances: ScheduleInstance[];
  previousAllInstances: ScheduleInstance[];
};

function normalizeManualPlacementSourceType(
  value: unknown
): ManualPlacementCandidate["sourceType"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "PROJECT" ||
    normalized === "HABIT" ||
    normalized === "TASK"
    ? normalized
    : null;
}

function readManualPlacementHabitType(
  result: ManualPlacementRequestDetail["result"]
) {
  if (!result) return null;
  const fields = [
    "habitType",
    "habit_type",
    "scheduleHabitType",
    "schedule_habit_type",
    "scheduleInstanceHabitType",
    "schedule_instance_habit_type",
    "scheduleInstanceSourceHabitType",
    "schedule_instance_source_habit_type",
    "instanceHabitType",
    "instance_habit_type",
    "sourceHabitType",
    "source_habit_type",
  ] as const;
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

async function readScheduleApiError(response: Response): Promise<string> {
  const fallback = `Schedule request failed (${response.status})`;
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "details", "hint", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    const invalidFields = record.invalidFields;
    if (Array.isArray(invalidFields) && invalidFields.length > 0) {
      const fields = invalidFields.filter(
        (field): field is string => typeof field === "string"
      );
      if (fields.length > 0) {
        return `Invalid manual placement fields: ${fields.join(", ")}`;
      }
    }
  }

  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload.trim();
  }

  return fallback;
}

type ManualPlacementPreviewDisplacedInstance = {
  instanceId: string;
  start: Date;
  end: Date;
  overflow?: boolean;
  invalidIfCommitted?: boolean;
};

type ManualPlacementPushPreviewResult = {
  draggedStart: Date;
  draggedEnd: Date;
  displaced: ManualPlacementPreviewDisplacedInstance[];
};

const TIMELINE_FULL_BLEED_STYLE: CSSProperties = {
  width: "100vw",
  marginLeft: "calc(50% - 50vw)",
  marginRight: "calc(50% - 50vw)",
  "--timeline-label-column": "clamp(1.75rem, 5vw, 2.5rem)",
  "--timeline-grid-left": "0px",
};

const TIMELINE_CARD_BOUNDS: CSSProperties = {
  left: `var(--timeline-card-left, ${TIMELINE_CARD_LEFT_FALLBACK})`,
  right: `var(--timeline-card-right, ${TIMELINE_CARD_RIGHT_FALLBACK})`,
};

const TIMELINE_TOUCH_ACTION = "pan-y pinch-zoom";
type TimeBlockConstraintKind = "FOCUS" | "BREAK" | "PRACTICE";

type TimeBlockConstraintDraft = {
  block: RepoWindow;
  energy: FlameLevel;
  windowKind: TimeBlockConstraintKind;
  locationContextId: string | null;
  allowAllHabitTypes: boolean;
  allowedHabitTypes: Set<string>;
  allowAllSkills: boolean;
  allowedSkillIds: Set<string>;
  allowAllMonuments: boolean;
  allowedMonumentIds: Set<string>;
};

const TIME_BLOCK_CONSTRAINT_KINDS: TimeBlockConstraintKind[] = [
  "FOCUS",
  "BREAK",
  "PRACTICE",
];
const TIME_BLOCK_CONSTRAINT_KIND_LABEL: Record<TimeBlockConstraintKind, string> = {
  FOCUS: "Focus",
  BREAK: "Break",
  PRACTICE: "Practice",
};
const TIME_BLOCK_CONSTRAINT_FLAME_LEVELS = ENERGY.LIST as FlameLevel[];
const TIME_BLOCK_HABIT_TYPE_OPTIONS = [
  { label: "Habit", value: "HABIT" },
  { label: "Relaxer", value: "RELAXER" },
  { label: "Practice", value: "PRACTICE" },
  { label: "Chore", value: "CHORE" },
  { label: "Sync", value: "SYNC" },
  { label: "Memo", value: "MEMO" },
];
const TIME_BLOCK_CONSTRAINT_PILL_BASE =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2 py-1.5 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/35 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-xs";
const TIME_BLOCK_CONSTRAINT_PILL_SELECTED =
  "border-black/50 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]";
const TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED =
  "border-black/60 bg-black/30 text-zinc-400 hover:border-black/40 hover:bg-white/[0.06] hover:text-zinc-200";
const TIME_BLOCK_CONSTRAINT_CONTROL_PILL =
  "inline-flex h-6 max-w-[11rem] shrink-0 items-center rounded-full border border-black/60 bg-black/30 px-2.5 text-[9px] font-semibold tracking-[0.08em] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-black/40 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35";
const TIME_BLOCK_CONSTRAINT_OPTION_ICON =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-black/60 bg-white/5 text-[9px] font-semibold text-zinc-200 sm:size-5 sm:text-[10px]";

function normalizeTimeBlockConstraintKind(
  value?: string | null
): TimeBlockConstraintKind {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized === "BREAK") return "BREAK";
  if (normalized === "PRACTICE") return "PRACTICE";
  return "FOCUS";
}

function getNextTimeBlockConstraintEnergy(current: FlameLevel): FlameLevel {
  const index = TIME_BLOCK_CONSTRAINT_FLAME_LEVELS.indexOf(current);
  const nextIndex =
    index >= 0 ? (index + 1) % TIME_BLOCK_CONSTRAINT_FLAME_LEVELS.length : 0;
  return TIME_BLOCK_CONSTRAINT_FLAME_LEVELS[nextIndex] ?? "NO";
}

function normalizeConstraintSet(values?: Iterable<string> | null) {
  return new Set(
    Array.from(values ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

function formatTimeBlockConstraintSummary(
  values: Set<string>,
  options: Array<{ value: string; label: string }>,
  allowAll: boolean
) {
  if (allowAll) return "Allow ALL";
  if (values.size === 0) return "None";
  const selectedLabels = Array.from(values)
    .map((value) => options.find((option) => option.value === value)?.label)
    .filter((label): label is string => Boolean(label));
  if (selectedLabels.length === 0) return `${values.size} selected`;
  const visibleLabels = selectedLabels.slice(0, 2).join(", ");
  return selectedLabels.length > 2
    ? `${visibleLabels} +${selectedLabels.length - 2}`
    : visibleLabels;
}

function computeInlineJumpRevealHeight(viewportHeight: number) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return INLINE_JUMP_REVEAL_HEIGHT_PX;
  }

  const timelinePeekHeight = Math.min(
    INLINE_JUMP_TIMELINE_PEEK_MAX_PX,
    Math.max(
      INLINE_JUMP_TIMELINE_PEEK_MIN_PX,
      Math.round(viewportHeight * INLINE_JUMP_TIMELINE_PEEK_VIEWPORT_RATIO)
    )
  );
  const upperBound = Math.max(0, viewportHeight - timelinePeekHeight);

  return Math.round(upperBound);
}

function computeInlineJumpMaxRevealHeight(viewportHeight: number) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return INLINE_JUMP_REVEAL_HEIGHT_PX;
  }

  return Math.round(viewportHeight);
}

type OverlayWindowRecord = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  start_utc: string | null;
  end_utc: string | null;
  label: string | null;
  mode: string | null;
};

type CommandBlockRecord = {
  id: string;
  offer_id?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  circle_name: string | null;
  circle_icon_emoji: string | null;
};

type OverlayWindowSegment = {
  id: string;
  source: "overlay_window" | "command_block";
  startMin: number;
  durationMin: number;
  label: string | null;
  icon: string | null;
  rangeLabel: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  sourceIndex: number;
};

type MinuteRange = {
  start: number;
  end: number;
};

function isTemporaryOverlayWindowMode(mode?: string | null) {
  const normalized = typeof mode === "string" ? mode.trim().toUpperCase() : "";
  return (
    normalized === "" ||
    normalized === "MANUAL" ||
    normalized === "DYNAMIC"
  );
}

const subtractOverlayRangesFromWindow = (
  baseRange: MinuteRange,
  overlays: MinuteRange[]
) => {
  const result: MinuteRange[] = [];
  let cursor = baseRange.start;
  for (const overlay of overlays) {
    if (overlay.end <= cursor) continue;
    if (overlay.start >= baseRange.end) break;
    const overlapStart = Math.max(overlay.start, baseRange.start);
    const overlapEnd = Math.min(overlay.end, baseRange.end);
    if (overlapStart > cursor) {
      result.push({ start: cursor, end: overlapStart });
    }
    cursor = Math.max(cursor, overlapEnd);
    if (cursor >= baseRange.end) break;
  }
  if (cursor < baseRange.end) {
    result.push({ start: cursor, end: baseRange.end });
  }
  return result;
};

const getScheduleInstanceLayoutId = (instanceId: string) =>
  `schedule-instance-${instanceId}`;

function computeDayTimelineHeightPx(
  startHour: number,
  pxPerMin: number,
  endHour = 24
) {
  const safeStart = Number.isFinite(startHour) ? startHour : 0;
  const safeEnd = Number.isFinite(endHour) ? endHour : 24;
  const normalizedEnd = Math.max(safeStart, safeEnd);
  const durationMinutes = Math.max(0, (normalizedEnd - safeStart) * 60);
  const safePxPerMin = Number.isFinite(pxPerMin)
    ? pxPerMin
    : INITIAL_PX_PER_MIN;
  return durationMinutes * safePxPerMin;
}

const dayTimelineVariants = {
  enter: (direction: DayTransitionDirection) => ({
    opacity: direction === 0 ? 1 : 0.6,
    x: direction === 0 ? 0 : direction > 0 ? 40 : -40,
    scale: 0.995,
  }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (direction: DayTransitionDirection) => ({
    opacity: direction === 0 ? 0 : 0.6,
    x: direction === 0 ? 0 : direction > 0 ? -40 : 40,
    scale: 0.995,
  }),
};

const dayTimelineTransition = {
  x: { type: "spring", stiffness: 280, damping: 28, mass: 0.9 },
  opacity: { duration: 0.422, ease: [0.22, 0.72, 0.24, 1] as const },
  scale: { duration: 0.424, ease: [0.2, 0.8, 0.2, 1] as const },
};

function clampPxPerMin(value: number) {
  if (!Number.isFinite(value)) return INITIAL_PX_PER_MIN;
  return Math.min(MAX_PX_PER_MIN, Math.max(MIN_PX_PER_MIN, value));
}

function snapPxPerMin(value: number) {
  const clamped = clampPxPerMin(value);
  let closest = PX_PER_MIN_STOPS[0];
  let minDelta = Math.abs(clamped - closest);
  for (let index = 1; index < PX_PER_MIN_STOPS.length; index += 1) {
    const stop = PX_PER_MIN_STOPS[index];
    const delta = Math.abs(clamped - stop);
    if (delta < minDelta) {
      closest = stop;
      minDelta = delta;
    }
  }
  return closest;
}

function getTouchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function isTouchWithinElement(touch: Touch, element: HTMLElement) {
  const target = touch.target;
  if (target && target instanceof Node && element.contains(target)) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  const x = touch.clientX;
  const y = touch.clientY;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function localDayFromKey(dayKey: string, timeZone: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  return makeDateInTimeZone(
    { year: y, month: m, day: d, hour: 0, minute: 0 },
    timeZone
  );
}

function parseScheduleDateParam(value: string | null) {
  if (!value) {
    const todayKey = formatLocalDateKey(new Date());
    return { date: new Date(), key: todayKey, wasValid: false };
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateMatch) {
    const [, yearStr, monthStr, dayStr] = dateMatch;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      const parsedDateKey = `${yearStr}-${monthStr}-${dayStr}`;
      return {
        date: new Date(year, month - 1, day), // <<< FIX: construct real local date
        key: parsedDateKey,
        wasValid: true,
      };
    }
  }

  const fallback = new Date();
  return {
    date: fallback,
    key: formatLocalDateKey(fallback),
    wasValid: false,
  };
}

function ScheduleViewShell({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return <div>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

function ManualPlacementProjectCard({
  title,
  goalName,
  energyLevel,
  skillIcon,
  rankDisplay,
  wrapTitle,
}: {
  title: string;
  goalName?: string | null;
  energyLevel: FlameLevel;
  skillIcon?: string | null;
  rankDisplay?: string | null;
  wrapTitle: boolean;
}) {
  const projectTitleInnerClass =
    wrapTitle
      ? "min-w-0 leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate"
      : "min-w-0 leading-tight truncate";
  return (
    <>
      {goalName ? (
        <div className="pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight">
          <span className="truncate text-[9px] font-semibold text-white/80">
            {goalName}
          </span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="min-w-0 space-y-1">
          <motion.span className="block text-sm font-medium">
            <span className="flex min-w-0 items-center gap-2">
              <span className={projectTitleInnerClass}>{title}</span>
              {rankDisplay ? (
                <span className="text-xs font-normal text-white/70">
                  {rankDisplay}
                </span>
              ) : null}
            </span>
          </motion.span>
        </div>
      </div>
      <SkillEnergyBadge
        energyLevel={energyLevel}
        skillIcon={skillIcon}
        className="flex flex-shrink-0 items-center gap-2"
        iconClassName="text-lg leading-none"
        flameClassName="flex-shrink-0"
      />
    </>
  );
}

function ManualPlacementHabitCard({
  title,
  practiceContextLabel,
  streakDays,
  wrapTitle,
}: {
  title: string;
  practiceContextLabel?: string | null;
  streakDays?: number | null;
  wrapTitle: boolean;
}) {
  const safeStreakDays = Math.max(0, Math.round(streakDays ?? 0));
  const showHabitStreakBadge = safeStreakDays >= 2;
  const streakLabel = `${safeStreakDays}x`;
  const titleClass = wrapTitle
    ? "pr-8 text-sm font-medium leading-snug line-clamp-2 sm:line-clamp-1 sm:truncate"
    : "truncate pr-8 text-sm font-medium leading-snug";
  return (
    <>
      {practiceContextLabel ? (
        <div className="pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight">
          <span className="truncate text-[9px] font-semibold text-white/80">
            {practiceContextLabel}
          </span>
        </div>
      ) : null}
      <motion.span className={titleClass}>{title}</motion.span>
      {showHabitStreakBadge ? (
        <span
          className="pointer-events-none absolute right-3 top-2 flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-[2px] text-xs font-semibold leading-tight text-amber-100"
        >
          <FlameEmber
            level={
              safeStreakDays >= 7
                ? "HIGH"
                : safeStreakDays >= 4
                  ? "MEDIUM"
                  : "LOW"
            }
            size="xs"
            className="drop-shadow-[0_0_6px_rgba(0,0,0,0.4)]"
          />
          <span className="tracking-normal">{streakLabel}</span>
        </span>
      ) : null}
    </>
  );
}

function ManualPlacementTimelineCard({
  candidate,
  label,
  mode,
  heightPx,
}: {
  candidate: ManualPlacementCandidate;
  label: string;
  mode: ManualPlacementDragGhost["mode"];
  heightPx: number;
}) {
  const title = candidate.title ?? label;
  const wrapTitle = candidate.durationMinutes >= 30;
  const opacityClass = mode === "placing" ? "opacity-100" : "opacity-90";
  const useCompactShadow =
    Number.isFinite(heightPx) &&
    heightPx > 0 &&
    heightPx <= TIMELINE_COMPACT_CARD_HEIGHT_PX;
  const cardShadow = useCompactShadow
    ? TIMELINE_COMPACT_CARD_SHADOW
    : TIMELINE_RESTING_CARD_SHADOW;
  const baseStyle: CSSProperties = {
    ...SCHEDULE_INSTANCE_NO_SELECT_STYLE,
    boxShadow: cardShadow,
    outline: "1px solid rgba(10, 10, 12, 0.85)",
    outlineOffset: "-1px",
  };
  const isHabitGhost =
    candidate.sourceType === "HABIT" || Boolean(candidate.habitType);

  if (isHabitGhost) {
    const habitVisuals = getScheduledHabitCardVisuals({
      habitType: candidate.habitType,
      completed: false,
    });

    return (
      <div
        className={clsx(
          "habit-card relative flex h-full w-full items-center justify-between gap-3 border px-3 py-2 text-white shadow-[0_18px_38px_rgba(8,12,32,0.52)] backdrop-blur select-none",
          getTimelineCardCornerClass("full"),
          habitVisuals.borderClass,
          habitVisuals.typeClass,
          opacityClass
        )}
        style={{
          ...baseStyle,
          boxShadow: habitVisuals.shadow,
          outline: habitVisuals.outline,
          background: habitVisuals.background,
          alignItems: "center",
        }}
      >
        <ManualPlacementHabitCard
          title={title}
          streakDays={candidate.currentStreakDays}
          wrapTitle={wrapTitle}
        />
      </div>
    );
  }

  const goalName =
    candidate.goalName && candidate.goalName.trim().length > 0
      ? candidate.goalName
      : null;
  const rankDisplay =
    typeof candidate.globalRank === "number" &&
    Number.isFinite(candidate.globalRank) &&
    candidate.globalRank > 0
      ? `#${candidate.globalRank}`
      : null;
  const energyLevel = resolveEnergyLevel(candidate.energy) ?? "NO";
  const collapsedCardPaddingClass = goalName ? "pt-4 pb-2" : "py-2";
  const isTaskGhost = candidate.sourceType === "TASK";

  return (
    <div
      className={clsx(
        "relative flex h-full w-full items-center justify-between gap-3 border px-3 text-white backdrop-blur-sm transition-[background,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] select-none",
        getTimelineCardCornerClass("full"),
        collapsedCardPaddingClass,
        isTaskGhost ? "border-white/10" : "border-black/70",
        opacityClass
      )}
      style={{
        ...baseStyle,
        outline: isTaskGhost
          ? "1px solid var(--event-border)"
          : baseStyle.outline,
        background: isTaskGhost
          ? TIMELINE_NEUTRAL_EVENT_BACKGROUND
          : TIMELINE_DARK_EVENT_BACKGROUND,
      }}
    >
      <ManualPlacementProjectCard
        title={title}
        goalName={goalName}
        energyLevel={energyLevel}
        rankDisplay={rankDisplay}
        wrapTitle={wrapTitle}
      />
    </div>
  );
}

function SkillEnergyBadge({
  energyLevel,
  skillIcon,
  size = "sm",
  className = "",
  iconClassName = "text-lg leading-none",
  flameClassName,
}: {
  energyLevel: FlameLevel;
  skillIcon?: string | null;
  size?: FlameEmberProps["size"];
  className?: string;
  iconClassName?: string;
  flameClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {skillIcon ? (
        <span className={iconClassName} aria-hidden>
          {skillIcon}
        </span>
      ) : null}
      <FlameEmber level={energyLevel} size={size} className={flameClassName} />
    </span>
  );
}

function WindowLabel({
  label,
  availableHeight,
}: {
  label: string;
  availableHeight: number;
}) {
  const safeHeight = Number.isFinite(availableHeight)
    ? Math.max(0, availableHeight)
    : 0;

  const inlineSize = safeHeight > 0 ? safeHeight : undefined;

  return (
    <span
      title={label}
      className="ml-1 text-[10px] leading-none text-zinc-500"
      style={{
        display: "inline-flex",
        writingMode: "vertical-rl",
        textOrientation: "mixed",
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        overflow: "hidden",
        maxInlineSize: inlineSize,
        inlineSize,
      }}
    >
      {label}
    </span>
  );
}

const DAY_TYPE_DOUBLE_TAP_DELAY_MS = 260;
const DAY_TYPE_DOUBLE_TAP_MOVE_PX = 30;

type DayTypeBlockLabelProps = {
  label: string;
  availableHeight: number;
  onActivate: () => void;
};

function DayTypeBlockLabel({
  label,
  availableHeight,
  onActivate,
}: DayTypeBlockLabelProps) {
  const safeHeight = Number.isFinite(availableHeight)
    ? Math.max(0, availableHeight)
    : 0;
  const inlineSize = safeHeight > 0 ? safeHeight : undefined;
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const touchStartRef = useRef<{
    identifier: number | null;
    x: number;
    y: number;
  } | null>(null);
  const touchMovedRef = useRef(false);

  const triggerActivate = useCallback(() => {
    onActivate();
  }, [onActivate]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      if (event.touches.length !== 1) {
        touchStartRef.current = null;
        touchMovedRef.current = false;
        return;
      }
      const [touch] = event.touches;
      touchStartRef.current = {
        identifier: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
      };
      touchMovedRef.current = false;
    },
    []
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      const start = touchStartRef.current;
      if (!start) return;
      const match =
        Array.from(event.changedTouches).find(
          (touch) => touch.identifier === start.identifier
        ) ?? event.changedTouches[0];
      if (!match) return;
      const dx = match.clientX - start.x;
      const dy = match.clientY - start.y;
      if (Math.hypot(dx, dy) > 16) {
        touchMovedRef.current = true;
      }
    },
    []
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLButtonElement>) => {
      const start = touchStartRef.current;
      if (!start) return;
      const match =
        Array.from(event.changedTouches).find(
          (touch) => touch.identifier === start.identifier
        ) ?? event.changedTouches[0];
      if (!match) {
        touchStartRef.current = null;
        return;
      }
      const now = performance.now();
      const currentPos = { x: match.clientX, y: match.clientY };
      if (
        !touchMovedRef.current &&
        lastTapRef.current &&
        now - lastTapRef.current.time <= DAY_TYPE_DOUBLE_TAP_DELAY_MS &&
        Math.hypot(
          currentPos.x - lastTapRef.current.x,
          currentPos.y - lastTapRef.current.y
        ) <= DAY_TYPE_DOUBLE_TAP_MOVE_PX
      ) {
        lastTapRef.current = null;
        triggerActivate();
        touchStartRef.current = null;
        return;
      }
      lastTapRef.current = {
        time: now,
        x: currentPos.x,
        y: currentPos.y,
      };
      touchStartRef.current = null;
    },
    [triggerActivate]
  );

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current = null;
    touchMovedRef.current = false;
  }, []);

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      triggerActivate();
    },
    [triggerActivate]
  );

  return (
    <button
      type="button"
      title={label}
      aria-label={`Edit constraints for ${label || "time block"}`}
      className="ml-1 text-[10px] leading-none text-zinc-500 focus-visible:outline focus-visible:outline-white/60"
      style={{
        display: "inline-flex",
        writingMode: "vertical-rl",
        textOrientation: "mixed",
        whiteSpace: "normal",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        overflow: "hidden",
        maxInlineSize: inlineSize,
        inlineSize,
      }}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerActivate();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {label}
    </button>
  );
}

function formatDayViewLabel(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    });
    return formatter.format(date);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Unable to format day view label", error);
    }
    return date.toDateString();
  }
}

function resolveDayViewDetails(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const weekday = getPart("weekday") || formatDayViewLabel(date, timeZone);
    const month = getPart("month");
    const day = getPart("day");
    const year = getPart("year");
    const fullDate = [month, day].filter(Boolean).join(" ");
    const composed =
      fullDate && year ? `${fullDate}, ${year}` : fullDate || weekday;
    return {
      weekday,
      fullDate: composed,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Unable to resolve day view parts", error);
    }
    const fallback = formatDayViewLabel(date, timeZone);
    return {
      weekday: fallback,
      fullDate: fallback,
    };
  }
}

const TASK_INSTANCE_MATCH_TOLERANCE_MS = 60 * 1000;
const MAX_FALLBACK_TASKS = 12;

type LoadStatus = "idle" | "loading" | "loaded";


type TaskInstanceInfo = {
  instance: ScheduleInstance;
  task: TaskLite;
  start: Date;
  end: Date;
};

type ProjectItem = ReturnType<typeof buildProjectItems>[number];
type ProjectInstance = ReturnType<typeof computeProjectInstances>[number];

function computeManualPlacementPushPreview(
  candidate: ManualPlacementCandidate,
  draggedStart: Date,
  dayProjectInstances: ProjectInstance[]
): ManualPlacementPushPreviewResult {
  // Preview-only displacement; real schedule data is untouched.
  const draggedEnd = new Date(
    draggedStart.getTime() + candidate.durationMinutes * 60_000
  );
  const displaced: ManualPlacementPreviewDisplacedInstance[] = [];
  let blockingEnd = draggedEnd.getTime();
  const sortedProjectInstances = [...dayProjectInstances].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  for (const projectInstance of sortedProjectInstances) {
    if (projectInstance.instance.id === candidate.instanceId) continue;

    const originalStart = projectInstance.start.getTime();
    const originalEnd = projectInstance.end.getTime();
    if (originalEnd <= draggedStart.getTime()) continue;
    if (originalStart >= blockingEnd) continue;

    const previewStart = new Date(blockingEnd);
    const previewEnd = new Date(
      previewStart.getTime() + (originalEnd - originalStart)
    );
    displaced.push({
      instanceId: projectInstance.instance.id,
      start: previewStart,
      end: previewEnd,
    });
    blockingEnd = previewEnd.getTime();
  }

  return {
    draggedStart,
    draggedEnd,
    displaced,
  };
}

type DayTimelineModel = {
  date: Date;
  isViewingToday: boolean;
  dayViewDateKey: string;
  todayDateKey: string;
  dayViewDetails: ReturnType<typeof resolveDayViewDetails>;
  timeZoneShortName: string;
  friendlyTimeZone: string;
  viewTimeZone: string;
  startHour: number;
  pxPerMin: number;
  windows: RepoWindow[];
  projectInstances: ReturnType<typeof computeProjectInstances>;
  taskInstancesByProject: Record<string, TaskInstanceInfo[]>;
  tasksByProjectId: Record<string, TaskLite[]>;
  standaloneTaskInstances: TaskInstanceInfo[];
  habitPlacements: HabitTimelinePlacement[];
  windowReports: WindowReportEntry[];
  dayStart: Date;
  dayEnd: Date;
};

type DayTimelineRenderOptions = {
  disableInteractions?: boolean;
  containerRef?: RefObject<HTMLDivElement | null>;
  fullBleed?: boolean;
};

// Project task cards are rendered when a scheduled project tile is expanded.
// "scheduled" cards correspond to concrete instances returned by the scheduler
// while "fallback" cards are synthesized previews drawn from the project's
// backlog when no scheduled breakdown exists for the block.
type ProjectTaskCard = {
  key: string;
  task: TaskLite;
  start: Date;
  end: Date;
  kind: "scheduled" | "fallback";
  instanceId?: string;
  displayDurationMinutes: number;
};

function buildScheduleBlockNotificationInstances(
  instances: ScheduleInstance[],
  dataset: Pick<
    ScheduleEventDataset,
    "habits" | "projectSkillIds" | "skills" | "tasks"
  >
): ScheduleBlockLocalNotificationInstance[] {
  const skillById = new Map(dataset.skills.map((skill) => [skill.id, skill]));
  const taskById = new Map(dataset.tasks.map((task) => [task.id, task]));
  const habitById = new Map(dataset.habits.map((habit) => [habit.id, habit]));

  const resolveSkill = (skillId: string | null | undefined) => {
    const id = skillId?.trim();
    return id ? skillById.get(id) ?? null : null;
  };

  const resolveProjectSkill = (projectId: string | null | undefined) => {
    const ids = projectId ? dataset.projectSkillIds[projectId] ?? [] : [];
    for (const skillId of ids) {
      const skill = resolveSkill(skillId);
      if (skill?.icon?.trim()) return skill;
    }
    return ids.length > 0 ? resolveSkill(ids[0]) : null;
  };

  return instances.map((instance) => {
    let skillIcon: string | null = null;
    let skillName: string | null = null;

    if (instance.source_type === "TASK") {
      const task = taskById.get(instance.source_id ?? "");
      const skill = resolveSkill(task?.skill_id);
      skillIcon = task?.skill_icon?.trim() || skill?.icon?.trim() || null;
      skillName = skill?.name?.trim() || null;
    } else if (instance.source_type === "HABIT") {
      const habit = habitById.get(instance.source_id ?? "");
      const skill = resolveSkill(habit?.skillId);
      skillIcon = skill?.icon?.trim() || null;
      skillName = skill?.name?.trim() || null;
    } else if (instance.source_type === "PROJECT") {
      const skill = resolveProjectSkill(instance.source_id);
      skillIcon = skill?.icon?.trim() || null;
      skillName = skill?.name?.trim() || null;
    }

    return {
      id: instance.id,
      event_name: instance.event_name,
      project_name: instance.project_name,
      skillIcon,
      skillName,
      source_type: instance.source_type,
      source_id: instance.source_id,
      start_utc: instance.start_utc,
      end_utc: instance.end_utc,
      status: instance.status,
      time_block_id: instance.time_block_id,
      day_type_time_block_id: instance.day_type_time_block_id,
      window_id: instance.window_id,
    };
  });
}

function buildScheduleBlockNotificationTimeBlocks(
  windows: RepoWindow[],
  date: Date,
  timeZone: string
): ScheduleBlockLocalNotificationTimeBlock[] {
  return windows
    .map((window) => {
      const { start, end } = resolveWindowBoundsForDateLib(
        window,
        date,
        timeZone
      );
      if (!isValidDate(start) || !isValidDate(end)) return null;
      if (end.getTime() <= start.getTime()) return null;

      const compatibleWindow = window as RepoWindow & {
        day_type_time_block_id?: string | null;
        time_block_id?: string | null;
        timeBlockId?: string | null;
        window_id?: string | null;
      };
      const dayTypeTimeBlockId =
        window.dayTypeTimeBlockId ??
        compatibleWindow.day_type_time_block_id ??
        null;
      const timeBlockId =
        dayTypeTimeBlockId
          ? (compatibleWindow.timeBlockId ??
            compatibleWindow.time_block_id ??
            window.id)
          : (compatibleWindow.timeBlockId ??
            compatibleWindow.time_block_id ??
            null);
      const windowId =
        compatibleWindow.window_id ?? (dayTypeTimeBlockId ? null : window.id);
      const fallbackId =
        timeBlockId ?? dayTypeTimeBlockId ?? windowId ?? window.id;

      const block: ScheduleBlockLocalNotificationTimeBlock = {
        id: `${fallbackId}:${start.toISOString()}`,
        label: window.label,
        kind: window.window_kind,
        start_utc: start.toISOString(),
        end_utc: end.toISOString(),
        time_block_id: timeBlockId,
        day_type_time_block_id: dayTypeTimeBlockId,
        window_id: windowId,
      };

      return block;
    })
    .filter(
      (block): block is ScheduleBlockLocalNotificationTimeBlock =>
        block !== null
    );
}

function syncScheduleBlockLocalNotificationsForDataset({
  payload,
  windowsSnapshot,
  date,
  timeZone,
  source,
}: {
  payload: ScheduleEventDataset;
  windowsSnapshot: RepoWindow[];
  date: Date;
  timeZone: string | null;
  source: "dataset" | "windows";
}) {
  const nextInstances = payload.instances ?? [];
  const notificationInstances = buildScheduleBlockNotificationInstances(
    nextInstances,
    payload
  );
  const notificationTimeBlocks = buildScheduleBlockNotificationTimeBlocks(
    windowsSnapshot,
    date,
    timeZone ?? "UTC"
  );

  void syncScheduleBlockLocalNotifications(notificationInstances, {
    blockLabelByKey: buildScheduleBlockLabelMap(
      nextInstances,
      windowsSnapshot
    ),
    timeBlocks: notificationTimeBlocks,
    timeZone,
  })
    .then((result) => {
      if (process.env.NODE_ENV !== "production") {
        console.info("[schedule.local_notifications.sync]", {
          inputInstances: nextInstances.length,
          inputTimeBlocks: notificationTimeBlocks.length,
          source,
          result,
        });
      }
    })
    .catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[schedule.local_notifications.sync_failed]", error);
      }
    });
}

type HabitTimelinePlacement = {
  habitId: string;
  habitName: string;
  habitType: HabitScheduleItem["habitType"];
  skillId: string | null;
  memoCaptureConfig: HabitScheduleItem["memoCaptureConfig"];
  practiceContextId: string | null;
  currentStreakDays: number;
  instanceId: string | null;
  start: Date;
  end: Date;
  rawStart: string;
  rawEnd: string;
  durationMinutes: number;
  energyLabel: FlameLevel;
  window: RepoWindow;
  truncated: boolean;
};

type MemoCompletionDraftState = {
  habitId: string;
  habitName: string;
  habitType: HabitScheduleItem["habitType"];
  skillId: string | null;
  skillIcon: string | null;
  memoCaptureConfig: HabitScheduleItem["memoCaptureConfig"];
  dateKey: string;
  instanceId: string | null;
  completionIso: string;
};

type EditingSnapshot = {
  source_type: "PROJECT" | "HABIT";
  projectId: string | null;
  habitId: string | null;
  habitSnapshot?: HabitEditSnapshot | null;
  originData?: ScheduleEditOrigin | null;
};

type EditableScheduleSourceType = EditingSnapshot["source_type"];

type HabitEditSnapshot = {
  name: string;
  habitType: string | null;
  recurrence: string | null;
  durationMinutes: number | null;
  energy: string | null;
  goalId: string | null;
  skillId: string | null;
  routineId: string | null;
  locationContextId: string | null;
  daylightPreference: string | null;
  windowEdgePreference: string | null;
  nextDueOverride: string | null;
  fixedStartLocal: string | null;
  fixedEndLocal: string | null;
};

function normalizeEditableScheduleSourceType(
  value: unknown
): EditableScheduleSourceType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "PROJECT" || normalized === "HABIT"
    ? normalized
    : null;
}

function buildHabitEditSnapshot(
  habit?: HabitScheduleItem | null
): HabitEditSnapshot | null {
  if (!habit) return null;

  return {
    name: habit.name,
    habitType: habit.habitType,
    recurrence: habit.recurrence,
    durationMinutes: habit.durationMinutes,
    energy: habit.energy ?? habit.window?.energy ?? null,
    goalId: habit.goalId,
    skillId: habit.skillId,
    routineId: null,
    locationContextId: habit.locationContextId,
    daylightPreference: habit.daylightPreference,
    windowEdgePreference: habit.windowEdgePreference,
    nextDueOverride: habit.nextDueOverride ?? null,
    fixedStartLocal: habit.fixedStartLocal ?? null,
    fixedEndLocal: habit.fixedEndLocal ?? null,
  };
}

const scheduleEditNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const describeEditingSnapshot = (snapshot: EditingSnapshot | null) => ({
  source_type: snapshot?.source_type ?? null,
  projectId: snapshot?.projectId ?? null,
  habitId: snapshot?.habitId ?? null,
});

type EditingSnapshotWithInstance = EditingSnapshot & {
  instance?: ScheduleInstance | null;
};

const logEditingSnapshotEvent = (
  label: string,
  snapshot: EditingSnapshot | null,
  extra?: Record<string, unknown>
) => {
  console.log("[ScheduleEdit] snapshot event", {
    label,
    timestamp: scheduleEditNow(),
    ...describeEditingSnapshot(snapshot),
    ...extra,
  });
};

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function getDayMinuteOffset(date: Date, dayStart: Date) {
  const ms = date.getTime() - dayStart.getTime();
  if (!Number.isFinite(ms)) return 0;
  return ms / 60000;
}

type LocalDayRange = {
  dayStart: Date;
  dayEnd: Date;
};

function getLocalDayRange(date: Date, timeZone: string): LocalDayRange {
  const { year, month, day } = getDateTimeParts(date, timeZone);
  const dayStart = makeZonedDate(
    {
      year,
      month,
      day,
      hour: GLOBAL_DAY_START_HOUR,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
  return { dayStart, dayEnd };
}

function getRenderDayStart(date: Date, timeZone: string): Date {
  const parts = getDateTimeParts(date, timeZone);
  return makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
}

function clipSegmentToDay(
  start: Date,
  end: Date,
  dayStart: Date,
  dayEnd: Date
): { segStart: Date; segEnd: Date } | null {
  if (!isValidDate(start) || !isValidDate(end)) return null;
  const clippedStartMs = Math.max(start.getTime(), dayStart.getTime());
  const clippedEndMs = Math.min(end.getTime(), dayEnd.getTime());
  if (clippedEndMs <= clippedStartMs) return null;
  return {
    segStart: new Date(clippedStartMs),
    segEnd: new Date(clippedEndMs),
  };
}

function resolveWindowBoundsForRenderDay(
  window: RepoWindow,
  date: Date,
  timeZone: string
): { start: Date; end: Date } {
  const parts = getDateTimeParts(date, timeZone);
  const renderDayStart = makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  const prevRenderDayStart = addDaysInTimeZone(renderDayStart, -1, timeZone);

  const startBase = window.fromPrevDay ? prevRenderDayStart : renderDayStart;
  const start = new Date(startBase);
  const [startHour = 0, startMinute = 0] = window.start_local
    .split(":")
    .map(Number);
  start.setHours(startHour, startMinute, 0, 0);

  const end = new Date(renderDayStart);
  const [endHour = 0, endMinute = 0] = window.end_local.split(":").map(Number);
  end.setHours(endHour, endMinute, 0, 0);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

type OccupiedSegment = { start: Date; end: Date };

function buildTimelineOccupiedSegments({
  projectInstances,
  habitPlacements,
  standaloneTaskInstances,
  taskInstancesByProject,
}: {
  projectInstances: ReturnType<typeof computeProjectInstances>;
  habitPlacements: HabitTimelinePlacement[];
  standaloneTaskInstances: TaskInstanceInfo[];
  taskInstancesByProject: Record<string, TaskInstanceInfo[]>;
}): OccupiedSegment[] {
  const segments: OccupiedSegment[] = [];
  const addSegment = (start: Date, end: Date) => {
    if (!isValidDate(start) || !isValidDate(end)) return;
    if (end.getTime() <= start.getTime()) return;
    segments.push({ start, end });
  };

  for (const instance of projectInstances) {
    addSegment(instance.start, instance.end);
  }
  for (const placement of habitPlacements) {
    addSegment(placement.start, placement.end);
  }
  for (const task of standaloneTaskInstances) {
    addSegment(task.start, task.end);
  }
  for (const bucket of Object.values(taskInstancesByProject)) {
    for (const task of bucket) {
      addSegment(task.start, task.end);
    }
  }

  return segments;
}

function buildTimelineGaps({
  occupiedSegments,
  currentDate,
  timeZone,
}: {
  occupiedSegments: OccupiedSegment[];
  currentDate: Date;
  timeZone: string;
}): Array<{ start: Date; end: Date }> {
  const renderDayStart = getRenderDayStart(currentDate, timeZone);
  const renderDayEnd = addDaysInTimeZone(renderDayStart, 1, timeZone);

  const clippedSegments = occupiedSegments
    .map((segment) =>
      clipSegmentToDay(segment.start, segment.end, renderDayStart, renderDayEnd)
    )
    .filter(
      (
        value
      ): value is {
        segStart: Date;
        segEnd: Date;
      } => value !== null
    )
    .map(({ segStart, segEnd }) => ({ start: segStart, end: segEnd }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const mergedSegments: Array<{ start: Date; end: Date }> = [];
  for (const segment of clippedSegments) {
    if (mergedSegments.length === 0) {
      mergedSegments.push({ start: segment.start, end: segment.end });
      continue;
    }
    const lastSegment = mergedSegments[mergedSegments.length - 1];
    if (segment.start.getTime() <= lastSegment.end.getTime()) {
      const mergedEndMs = Math.max(
        lastSegment.end.getTime(),
        segment.end.getTime()
      );
      lastSegment.end = new Date(mergedEndMs);
      continue;
    }
    mergedSegments.push({ start: segment.start, end: segment.end });
  }

  const gaps: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(renderDayStart);
  for (const segment of mergedSegments) {
    if (segment.start.getTime() > cursor.getTime()) {
      gaps.push({ start: cursor, end: segment.start });
    }
    if (segment.end.getTime() > cursor.getTime()) {
      cursor = new Date(segment.end);
    }
  }
  if (cursor.getTime() < renderDayEnd.getTime()) {
    gaps.push({ start: cursor, end: renderDayEnd });
  }

  return gaps;
}

function computeTimelineStackingIndex(startOffsetMinutes: number) {
  if (!Number.isFinite(startOffsetMinutes)) return TIMELINE_STACK_BASE_Z_INDEX;
  const safeOffset = Math.max(0, startOffsetMinutes);
  return Math.round(
    TIMELINE_STACK_BASE_Z_INDEX + safeOffset * TIMELINE_STACK_SCALE
  );
}

function compareIsoOrder(a: string | null, b: string | null) {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  const aValid = Number.isFinite(aMs);
  const bValid = Number.isFinite(bMs);
  if (aValid && bValid && aMs !== bMs) return aMs - bMs;
  if (aValid !== bValid) return aValid ? 1 : -1;
  return 0;
}

function compareOverlaySegmentStackOrder(
  a: OverlayWindowSegment,
  b: OverlayWindowSegment
) {
  const createdOrder = compareIsoOrder(a.createdAt, b.createdAt);
  if (createdOrder !== 0) return createdOrder;
  const updatedOrder = compareIsoOrder(a.updatedAt, b.updatedAt);
  if (updatedOrder !== 0) return updatedOrder;
  if (a.sourceIndex !== b.sourceIndex) return a.sourceIndex - b.sourceIndex;
  return a.id.localeCompare(b.id);
}

function isInstancePastDay(
  instance: ScheduleInstance | undefined,
  completionIso: string | null | undefined,
  todayKey: string,
  timeZone: string
) {
  if (!instance || !completionIso) return false;
  const completionKey = formatLocalDateKey(new Date(completionIso), timeZone);
  return completionKey.localeCompare(todayKey) < 0;
}

function taskMatchesProjectInstance(
  taskInfo: TaskInstanceInfo,
  projectInstance: ScheduleInstance,
  projectStart: Date,
  projectEnd: Date
) {
  const projectWindowId = projectInstance.window_id;
  const taskWindowId = taskInfo.instance.window_id;
  if (projectWindowId && taskWindowId && projectWindowId !== taskWindowId) {
    return false;
  }

  const tolerance = TASK_INSTANCE_MATCH_TOLERANCE_MS;
  const taskStart = taskInfo.start.getTime();
  const taskEnd = taskInfo.end.getTime();
  const instanceStart = projectStart.getTime();
  const instanceEnd = projectEnd.getTime();

  if (taskEnd <= instanceStart - tolerance) return false;
  if (taskStart >= instanceEnd + tolerance) return false;
  if (taskStart < instanceStart - tolerance) return false;
  if (taskEnd > instanceEnd + tolerance) return false;

  return true;
}

function buildFallbackTaskCards({
  tasks,
  projectStart,
  projectEnd,
  instanceId,
  maxCount,
}: {
  tasks: TaskLite[];
  projectStart: Date;
  projectEnd: Date;
  instanceId: string;
  maxCount: number;
}): ProjectTaskCard[] {
  if (!tasks.length || maxCount <= 0) return [];

  const projectDurationMs = Math.max(
    projectEnd.getTime() - projectStart.getTime(),
    1
  );
  const limited = tasks.slice(0, maxCount);
  const durations = limited.map((task) => {
    const raw = Number(task.duration_min ?? 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);

  let accumulatedRatio = 0;
  const fallbackCards: ProjectTaskCard[] = [];

  for (let index = 0; index < limited.length; index += 1) {
    const task = limited[index];
    const availableRatio = Math.max(0, 1 - accumulatedRatio);
    if (availableRatio <= 0) break;

    const durationValue = durations[index];
    let ratioShare: number;
    if (totalDuration > 0 && durationValue > 0) {
      ratioShare = (durationValue / totalDuration) * (1 - accumulatedRatio);
    } else {
      const remaining = limited.length - index;
      ratioShare = remaining > 0 ? availableRatio / remaining : availableRatio;
    }

    if (index === limited.length - 1) {
      ratioShare = availableRatio;
    } else if (ratioShare > availableRatio) {
      ratioShare = availableRatio;
    }

    const startRatio = accumulatedRatio;
    const endRatio = Math.min(1, startRatio + ratioShare);
    accumulatedRatio = endRatio;

    const startTime = new Date(
      projectStart.getTime() + startRatio * projectDurationMs
    );
    const endTime = new Date(
      projectStart.getTime() + endRatio * projectDurationMs
    );
    const fallbackDuration =
      durationValue > 0
        ? durationValue
        : (ratioShare * projectDurationMs) / 60000;

    fallbackCards.push({
      key: `fallback:${instanceId}:${task.id}:${index}`,
      kind: "fallback",
      task,
      start: startTime,
      end: endTime,
      displayDurationMinutes: Math.max(1, Math.round(fallbackDuration || 0)),
    });
  }

  if (fallbackCards.length > 0) {
    const last = fallbackCards[fallbackCards.length - 1];
    last.end = new Date(projectEnd.getTime());
  }

  return fallbackCards;
}

function buildWindowMap(windows: RepoWindow[]) {
  const map: Record<string, RepoWindow> = {};
  for (const w of windows) {
    map[w.id] = w;
  }
  return map;
}

function buildScheduleBlockLabelMap(
  instances: ScheduleInstance[],
  windows: RepoWindow[]
) {
  const labels = new Map<string, string>();
  const addLabel = (
    key: string | null | undefined,
    label: string | null | undefined
  ) => {
    const trimmedKey = key?.trim();
    const trimmedLabel = label?.trim();
    if (trimmedKey && trimmedLabel) {
      labels.set(trimmedKey, trimmedLabel);
    }
  };

  for (const window of windows) {
    const compatibleWindow = window as RepoWindow & {
      time_block_id?: string | null;
      timeBlockId?: string | null;
      day_type_time_block_id?: string | null;
    };
    addLabel(window.id, window.label);
    addLabel(window.dayTypeTimeBlockId, window.label);
    addLabel(compatibleWindow.day_type_time_block_id, window.label);
    addLabel(compatibleWindow.timeBlockId, window.label);
    addLabel(compatibleWindow.time_block_id, window.label);
  }

  for (const instance of instances) {
    const compatibleInstance = instance as ScheduleInstance & {
      blockLabel?: string | null;
      block_label?: string | null;
      windowLabel?: string | null;
      window_label?: string | null;
      timeBlockLabel?: string | null;
      time_block_label?: string | null;
    };
    const label =
      compatibleInstance.blockLabel ??
      compatibleInstance.block_label ??
      compatibleInstance.windowLabel ??
      compatibleInstance.window_label ??
      compatibleInstance.timeBlockLabel ??
      compatibleInstance.time_block_label ??
      null;

    addLabel(instance.time_block_id, label);
    addLabel(instance.day_type_time_block_id, label);
    addLabel(instance.window_id, label);
  }

  return labels;
}

function computeProjectInstances(
  instances: ScheduleInstance[],
  projectMap: Record<string, ProjectItem>,
  windowMap: Record<string, RepoWindow>
) {
  return instances
    .filter((inst) => inst.source_type === "PROJECT")
    .map((inst) => {
      const project = projectMap[inst.source_id];
      if (!project) return null;
      const start = toLocal(inst.start_utc);
      const end = toLocal(inst.end_utc);
      if (!isValidDate(start) || !isValidDate(end)) return null;
      return {
        instance: inst,
        project,
        start,
        end,
        assignedWindow: inst.window_id
          ? (windowMap[inst.window_id] ?? null)
          : null,
      };
    })
    .filter(
      (
        value
      ): value is {
        instance: ScheduleInstance;
        project: ProjectItem;
        start: Date;
        end: Date;
        assignedWindow: RepoWindow | null;
      } => value !== null
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function collectProjectInstanceIds(
  projectInstances: ReturnType<typeof computeProjectInstances>
) {
  const set = new Set<string>();
  for (const item of projectInstances) {
    set.add(item.project.id);
  }
  return set;
}

function computeTaskInstancesByProjectForDay(
  instances: ScheduleInstance[],
  taskMap: Record<string, TaskLite>,
  projectInstanceIds: Set<string>
) {
  const map: Record<string, TaskInstanceInfo[]> = {};
  for (const inst of instances) {
    if (inst.source_type !== "TASK") continue;
    const task = taskMap[inst.source_id];
    const projectId = task?.project_id ?? null;
    if (!task || !projectId) continue;
    if (!projectInstanceIds.has(projectId)) continue;
    const start = toLocal(inst.start_utc);
    const end = toLocal(inst.end_utc);
    if (!isValidDate(start) || !isValidDate(end)) continue;
    const bucket = map[projectId] ?? [];
    bucket.push({
      instance: inst,
      task,
      start,
      end,
    });
    map[projectId] = bucket;
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return map;
}

function computeStandaloneTaskInstancesForDay(
  instances: ScheduleInstance[],
  taskMap: Record<string, TaskLite>,
  projectInstanceIds: Set<string>
) {
  const items: TaskInstanceInfo[] = [];
  for (const inst of instances) {
    if (inst.source_type !== "TASK") continue;
    const task = taskMap[inst.source_id];
    if (!task) continue;
    const projectId = task.project_id ?? undefined;
    if (projectId && projectInstanceIds.has(projectId)) continue;
    const start = toLocal(inst.start_utc);
    const end = toLocal(inst.end_utc);
    if (!isValidDate(start) || !isValidDate(end)) continue;
    items.push({
      instance: inst,
      task,
      start,
      end,
    });
  }
  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  return items;
}

function computeHabitPlacementsForDay({
  habits: allHabits,
  windows,
  date,
  timeZone,
  projectInstances,
  schedulerTimelinePlacements,
  instances,
}: {
  habits: HabitScheduleItem[];
  windows: RepoWindow[];
  date: Date;
  timeZone: string;
  projectInstances?: ReturnType<typeof computeProjectInstances>;
  schedulerTimelinePlacements?: SchedulerTimelinePlacement[];
  instances?: ScheduleInstance[];
}): HabitTimelinePlacement[] {
  if (allHabits.length === 0) return [];

  const zone = timeZone || "UTC";
  const availability = new Map<string, number>();

  const habitMap = new Map(allHabits.map((habit) => [habit.id, habit]));

  const windowEntries = windows
    .map((window) => {
      const { start: windowStart, end: windowEnd } =
        resolveWindowBoundsForDateLib(window, date, zone);
      if (!isValidDate(windowStart) || !isValidDate(windowEnd)) {
        return null;
      }
      const startMs = windowStart.getTime();
      const endMs = windowEnd.getTime();
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        return null;
      }
      const energyIdx = energyIndexFromLabel(window.energy);
      const key = `${window.id}:${windowStart.toISOString()}`;
      return { window, windowStart, windowEnd, startMs, endMs, energyIdx, key };
    })
    .filter(
      (
        entry
      ): entry is {
        window: RepoWindow;
        windowStart: Date;
        windowEnd: Date;
        startMs: number;
        endMs: number;
        energyIdx: number;
        key: string;
      } => entry !== null
    )
    .sort((a, b) => a.startMs - b.startMs);

  const anchorStartsByWindowKey = new Map<string, number[]>();

  for (const entry of windowEntries) {
    addAnchorStart(anchorStartsByWindowKey, entry.key, entry.startMs);
  }

  if (projectInstances && projectInstances.length > 0) {
    for (const instance of projectInstances) {
      const instanceStart = instance.start.getTime();
      const instanceEnd = instance.end.getTime();
      if (!Number.isFinite(instanceStart) || !Number.isFinite(instanceEnd))
        continue;

      for (const entry of windowEntries) {
        const overlaps =
          instanceEnd > entry.startMs && instanceStart < entry.endMs;
        if (!overlaps) continue;
        const anchor = Math.max(entry.startMs, instanceStart);
        addAnchorStart(anchorStartsByWindowKey, entry.key, anchor);
      }
    }
  }

  const timelineHabitPlacements = new Map<
    string,
    Extract<SchedulerTimelinePlacement, { type: "HABIT" }>
  >();
  if (schedulerTimelinePlacements && schedulerTimelinePlacements.length > 0) {
    for (const placement of schedulerTimelinePlacements) {
      if (placement.type !== "HABIT") continue;
      const key = habitTimelinePlacementKey(
        placement.habitId,
        placement.startUtc,
        timeZone
      );
      if (!timelineHabitPlacements.has(key)) {
        timelineHabitPlacements.set(key, placement);
      }
    }
    for (const placement of schedulerTimelinePlacements) {
      if (placement.type !== "HABIT" && placement.type !== "PROJECT") continue;
      const startMs = placement.start.getTime();
      const endMs = placement.end.getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      for (const entry of windowEntries) {
        const overlaps = endMs > entry.startMs && startMs < entry.endMs;
        if (!overlaps) continue;
        const anchor = Math.max(entry.startMs, startMs);
        addAnchorStart(anchorStartsByWindowKey, entry.key, anchor);
      }
    }
  }

  const placements: HabitTimelinePlacement[] = [];
  const placedHabitKeys = new Set<string>();

  if (instances && instances.length > 0) {
    for (const instance of instances) {
      if (instance.source_type !== "HABIT") continue;
      if (instance.status !== "scheduled" && instance.status !== "completed")
        continue;
      const habit = habitMap.get(instance.source_id);
      if (!habit) continue;
      const start = new Date(instance.start_utc);
      const end = new Date(instance.end_utc);
      if (!isValidDate(start) || !isValidDate(end)) continue;
      const durationMinutes = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 60000)
      );
      const assignedEntry = windowEntries.find(
        (entry) => entry.window.id === instance.window_id
      );
      const window = assignedEntry
        ? assignedEntry.window
        : createFallbackWindowForHabitInstance({
            habit,
            instance,
            start,
            end,
            timeZone: zone,
          });
      const timelineKey = habitTimelinePlacementKey(habit.id, start, timeZone);
      if (placedHabitKeys.has(timelineKey)) {
        continue;
      }
      const timelinePlacement = timelineHabitPlacements.get(timelineKey);
      const rawPlacementHabitType = habit.habitType ?? "HABIT";
      const normalizedHabitType =
        rawPlacementHabitType === "ASYNC" ? "SYNC" : rawPlacementHabitType;
      const preferredPracticeContextId = habit.skillMonumentId ?? null;
      let resolvedPracticeContextId = preferredPracticeContextId;
      if (!resolvedPracticeContextId) {
        resolvedPracticeContextId =
          instance.practice_context_monument_id ?? null;
      }
      if (!resolvedPracticeContextId && timelinePlacement?.practiceContextId) {
        resolvedPracticeContextId = timelinePlacement.practiceContextId;
      }
      placements.push({
        habitId: habit.id,
        habitName: habit.name,
        habitType: habit.habitType,
        skillId: habit.skillId ?? null,
        memoCaptureConfig: habit.memoCaptureConfig ?? null,
        practiceContextId:
          normalizedHabitType === "PRACTICE"
            ? (resolvedPracticeContextId ?? null)
            : null,
        currentStreakDays: Math.max(
          0,
          Number.isFinite(habit.currentStreakDays)
            ? Math.round(habit.currentStreakDays)
            : 0
        ),
        instanceId: instance.id ?? null,
        start,
        end,
        rawStart: instance.start_utc,
        rawEnd: instance.end_utc,
        durationMinutes,
        energyLabel: normalizeEnergyLabel(
          instance.energy_resolved ||
            habit.energy ||
            habit.window?.energy ||
            "NO"
        ),
        window,
        truncated: timelinePlacement?.clipped ?? false,
      });
      placedHabitKeys.add(timelineKey);

      if (assignedEntry) {
        const normalizedEnd = Math.min(
          assignedEntry.endMs,
          Math.max(assignedEntry.startMs, end.getTime())
        );
        const previous =
          availability.get(assignedEntry.key) ?? assignedEntry.startMs;
        availability.set(assignedEntry.key, Math.max(previous, normalizedEnd));
        addAnchorStart(
          anchorStartsByWindowKey,
          assignedEntry.key,
          start.getTime()
        );
      }
    }
  }

  placements.sort((a, b) => a.start.getTime() - b.start.getTime());
  return placements;
}

function habitTimelinePlacementKey(
  habitId: string,
  startUtc: Date | string,
  timeZone: string
) {
  if (process.env.NODE_ENV !== "production") {
    if (typeof timeZone !== "string") {
      throw new Error("INVALID_TIMEZONE_FOR_HABIT_KEY");
    }
  }
  return `${habitId}:${dayKeyFromUtc(startUtc, timeZone)}`;
}

const windowTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function formatTimeForWindow(date: Date, timeZone: string) {
  const key = timeZone || "UTC";
  let formatter = windowTimeFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: key,
    });
    windowTimeFormatterCache.set(key, formatter);
  }
  return formatter.format(date);
}

function createFallbackWindowForHabitInstance({
  habit,
  instance,
  start,
  end,
  timeZone,
}: {
  habit: HabitScheduleItem;
  instance: ScheduleInstance;
  start: Date;
  end: Date;
  timeZone: string;
}): RepoWindow {
  const startLocal = formatTimeForWindow(start, timeZone);
  const endLocal = formatTimeForWindow(end, timeZone);
  const dayStart = startOfDayInTimeZone(start, timeZone);
  const fromPrevDay = start.getTime() < dayStart.getTime();
  const energySource =
    instance.energy_resolved || habit.energy || habit.window?.energy || "NO";

  return {
    id: instance.window_id ?? `habit-${habit.id}`,
    label: habit.window?.label ?? "Anytime",
    energy: energySource,
    start_local: startLocal,
    end_local: endLocal,
    days: null,
    location_context_id:
      habit.locationContextId ?? habit.window?.locationContextId ?? null,
    location_context_value:
      habit.locationContextValue ?? habit.window?.locationContextValue ?? null,
    location_context_name:
      habit.locationContextName ?? habit.window?.locationContextName ?? null,
    fromPrevDay,
  };
}

function addAnchorStart(
  map: Map<string, number[]>,
  key: string,
  startMs: number
) {
  if (!Number.isFinite(startMs)) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, [startMs]);
    return;
  }
  const alreadyPresent = existing.some(
    (value) => Math.abs(value - startMs) < 30
  );
  if (alreadyPresent) return;
  let inserted = false;
  for (let index = 0; index < existing.length; index += 1) {
    if (startMs < existing[index]) {
      existing.splice(index, 0, startMs);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    existing.push(startMs);
  }
}

export function computeWindowReportsForDay({
  windows,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  currentDate,
  timeZone,
  gaps,
}: {
  windows: RepoWindow[];
  projectInstances: ReturnType<typeof computeProjectInstances>;
  unscheduledProjects: ProjectItem[];
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>;
  schedulerDebug: SchedulerDebugState | null;
  schedulerTimelinePlacements: SchedulerTimelinePlacement[];
  habitPlacements: HabitTimelinePlacement[];
  currentDate: Date;
  timeZone: string;
  gaps: Array<{ start: Date; end: Date }>;
}): WindowReportEntry[] {
  if (windows.length === 0) return [];
  const windowBounds = windows
    .map((win) => {
      const { start, end } = resolveWindowBoundsForRenderDay(
        win,
        currentDate,
        timeZone
      );
      if (!isValidDate(start) || !isValidDate(end)) return null;
      if (end.getTime() <= start.getTime()) return null;
      return { window: win, windowStart: start, windowEnd: end };
    })
    .filter(
      (
        entry
      ): entry is { window: RepoWindow; windowStart: Date; windowEnd: Date } =>
        entry !== null
    )
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());

  const diagnosticsAvailable = Boolean(schedulerDebug);
  const runStartedAt = schedulerDebug ? new Date(schedulerDebug.runAt) : null;
  const reports: WindowReportEntry[] = [];

  for (const entry of windowBounds) {
    const { window, windowStart, windowEnd } = entry;
    const windowLabel = window.label?.trim() || "Untitled window";
    const energyLabel = normalizeEnergyLabel(window.energy);
    const windowEnergyIndex = energyIndexFromLabel(energyLabel);

    for (const gap of gaps) {
      const segmentStartMs = Math.max(
        gap.start.getTime(),
        windowStart.getTime()
      );
      const segmentEndMs = Math.min(gap.end.getTime(), windowEnd.getTime());
      if (segmentEndMs <= segmentStartMs) continue;

      const segmentStart = new Date(segmentStartMs);
      const segmentEnd = new Date(segmentEndMs);
      const durationMinutes = Math.max(
        0,
        Math.round((segmentEndMs - segmentStartMs) / 60000)
      );
      if (durationMinutes <= 0) continue;

      const futurePlacements = schedulerTimelinePlacements
        .filter(
          (
            entry
          ): entry is Extract<SchedulerTimelinePlacement, { type: "PROJECT" }> =>
            entry.type === "PROJECT"
        )
        .filter((entry) => entry.start.getTime() >= segmentEnd.getTime())
        .filter((entry) => {
          const entryEnergyIndex = energyIndexFromLabel(entry.energyLabel);
          return entryEnergyIndex !== -1 && entryEnergyIndex <= windowEnergyIndex;
        })
        .map((entry) => ({
          projectId: entry.projectId,
          projectName: entry.projectName,
          start: entry.start,
          durationMinutes: entry.durationMinutes,
          sameDay:
            formatLocalDateKey(entry.start) === formatLocalDateKey(segmentEnd),
          fits:
            typeof entry.durationMinutes === "number" &&
            Number.isFinite(entry.durationMinutes)
              ? entry.durationMinutes <= durationMinutes
              : null,
        }));

      const description = describeEmptyWindowReport({
        windowLabel,
        energyLabel,
        durationMinutes,
        unscheduledProjects,
        schedulerFailureByProjectId,
        diagnosticsAvailable,
        runStartedAt:
          runStartedAt && !Number.isNaN(runStartedAt.getTime())
            ? runStartedAt
            : null,
        windowStart,
        windowEnd,
        futurePlacements,
        segmentStart,
        segmentEnd,
        window,
      });

      reports.push({
        key: `${window.id}-${segmentStart.toISOString()}-${segmentEnd.toISOString()}`,
        window,
        windowLabel,
        summary: description.summary,
        details: description.details,
        energyLabel,
        durationLabel: formatDurationLabel(durationMinutes),
        rangeLabel: formatGapRangeLabel(segmentStart, segmentEnd),
        rangeStart: segmentStart,
        rangeEnd: segmentEnd,
      });
    }
  }

  return reports;
}

const TIMELINE_LEFT_OFFSET = "4rem";
const TIMELINE_RIGHT_OFFSET = "0.5rem";
const TIMELINE_PAIR_WIDTH = `calc((100% - ${TIMELINE_LEFT_OFFSET} - ${TIMELINE_RIGHT_OFFSET}) / 2)`;
const TIMELINE_PAIR_RIGHT_LEFT = `calc(${TIMELINE_LEFT_OFFSET} + ${TIMELINE_PAIR_WIDTH})`;

function computeTimelineLaneLeft(lane: number, laneCount: number) {
  if (lane <= 0) return TIMELINE_PAIR_RIGHT_LEFT;
  const offsets = Array.from(
    { length: lane },
    () => `(${TIMELINE_PAIR_WIDTH} / ${laneCount})`
  ).join(" + ");
  return `calc(${TIMELINE_PAIR_RIGHT_LEFT} + ${offsets})`;
}

function applyTimelineLayoutStyle(
  style: CSSProperties,
  mode: TimelineCardLayoutMode,
  options?: { animate?: boolean; laneLayout?: TimelineCardLaneLayout | null }
): CSSProperties {
  const baseStyle: CSSProperties = { ...style };
  if (mode === "paired-left") {
    baseStyle.left = TIMELINE_LEFT_OFFSET;
    baseStyle.width = TIMELINE_PAIR_WIDTH;
    baseStyle.right = undefined;
    baseStyle.clipPath = "inset(-80px 0 -80px -80px)";
  } else if (mode === "paired-right") {
    const laneLayout = options?.laneLayout;
    const laneCount = Math.max(1, laneLayout?.laneCount ?? 1);
    const lane = Math.min(Math.max(0, laneLayout?.lane ?? 0), laneCount - 1);
    baseStyle.left = computeTimelineLaneLeft(lane, laneCount);
    baseStyle.width =
      laneCount > 1
        ? `calc(${TIMELINE_PAIR_WIDTH} / ${laneCount})`
        : TIMELINE_PAIR_WIDTH;
    baseStyle.right = undefined;
  } else {
    baseStyle.left = TIMELINE_LEFT_OFFSET;
    baseStyle.right = TIMELINE_RIGHT_OFFSET;
  }

  if (options?.animate) {
    const duration = 280;
    const easing = "cubic-bezier(0.33, 1, 0.68, 1)";
    baseStyle.transition = `left ${duration}ms ${easing}, right ${duration}ms ${easing}, width ${duration}ms ${easing}`;
  }

  return baseStyle;
}

function getTimelineCardCornerClass(mode: TimelineCardLayoutMode) {
  if (mode === "paired-left") {
    return "rounded-l-[var(--schedule-instance-radius)] rounded-r-none";
  }
  if (mode === "paired-right") {
    return "rounded-r-[var(--schedule-instance-radius)] rounded-l-none";
  }
  return "rounded-[var(--schedule-instance-radius)]";
}

function buildDayTimelineModel({
  date,
  windows,
  instances,
  projectMap,
  taskMap,
  tasksByProjectId,
  habits,
  startHour,
  pxPerMin,
  unscheduledProjects,
  schedulerFailureByProjectId,
  schedulerDebug,
  schedulerTimelinePlacements,
  timeZoneShortName,
  friendlyTimeZone,
  localTimeZone,
  todayDateKey,
}: {
  date: Date;
  windows: RepoWindow[];
  instances: ScheduleInstance[];
  projectMap: Record<string, ProjectItem>;
  taskMap: Record<string, TaskLite>;
  tasksByProjectId: Record<string, TaskLite[]>;
  habits: HabitScheduleItem[];
  startHour: number;
  pxPerMin: number;
  unscheduledProjects: ProjectItem[];
  schedulerFailureByProjectId: Record<string, SchedulerRunFailure[]>;
  schedulerDebug: SchedulerDebugState | null;
  schedulerTimelinePlacements: SchedulerTimelinePlacement[];
  timeZoneShortName: string;
  friendlyTimeZone: string;
  localTimeZone: string;
  todayDateKey: string;
}): DayTimelineModel {
  const { dayStart, dayEnd } = getLocalDayRange(date, localTimeZone);
  const dayViewDateKey = formatScheduleDateKey(date, localTimeZone);
  const windowMap = buildWindowMap(windows);
  const projectInstances = computeProjectInstances(
    instances,
    projectMap,
    windowMap
  );
  const projectInstanceIds = collectProjectInstanceIds(projectInstances);
  const taskInstancesByProject = computeTaskInstancesByProjectForDay(
    instances,
    taskMap,
    projectInstanceIds
  );
  const standaloneTaskInstances = computeStandaloneTaskInstancesForDay(
    instances,
    taskMap,
    projectInstanceIds
  );
  const habitPlacements = computeHabitPlacementsForDay({
    habits,
    windows,
    date,
    timeZone: localTimeZone ?? "UTC",
    projectInstances,
    schedulerTimelinePlacements,
    instances,
  });
  const occupiedSegments = buildTimelineOccupiedSegments({
    projectInstances,
    habitPlacements,
    standaloneTaskInstances,
    taskInstancesByProject,
  });
  const timelineGaps = buildTimelineGaps({
    occupiedSegments,
    currentDate: date,
    timeZone: localTimeZone ?? "UTC",
  });
  const windowReports = computeWindowReportsForDay({
    windows,
    projectInstances,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    habitPlacements,
    currentDate: date,
    timeZone: localTimeZone ?? "UTC",
    gaps: timelineGaps,
  });
  return {
    date,
    isViewingToday: todayDateKey === dayViewDateKey,
    dayViewDateKey,
    todayDateKey,
    dayViewDetails: resolveDayViewDetails(date, localTimeZone),
    timeZoneShortName,
    friendlyTimeZone,
    viewTimeZone: localTimeZone ?? "UTC",
    startHour,
    pxPerMin,
    windows,
    projectInstances,
    taskInstancesByProject,
    tasksByProjectId,
    standaloneTaskInstances,
    habitPlacements,
    windowReports,
    dayStart,
    dayEnd,
  };
}

function DayPeekOverlays({
  peekState,
  previousLabel,
  nextLabel,
  previousKey,
  nextKey,
  containerRef,
  previousModel,
  nextModel,
  renderPreview,
  scrollProgress,
  baseTimelineHeight,
  timelineChromeHeight,
  pxPerMin,
}: {
  peekState: PeekState;
  previousLabel: string;
  nextLabel: string;
  previousKey: string;
  nextKey: string;
  containerRef: RefObject<HTMLDivElement | null>;
  previousModel?: DayTimelineModel | null;
  nextModel?: DayTimelineModel | null;
  renderPreview: (
    model: DayTimelineModel,
    options?: DayTimelineRenderOptions
  ) => ReactNode;
  scrollProgress: number | null;
  baseTimelineHeight: number;
  timelineChromeHeight: number;
  pxPerMin: number;
}) {
  const container = containerRef.current;
  const containerWidth = container?.offsetWidth ?? 0;
  const maxPeekWidth = containerWidth > 0 ? containerWidth * 0.45 : 0;
  const safeGap = Math.min(DAY_PEEK_SAFE_GAP_PX, maxPeekWidth);
  const maxVisiblePeekWidth = Math.max(0, maxPeekWidth - safeGap);
  const limitedOffset =
    maxPeekWidth > 0 ? Math.min(peekState.offset, maxPeekWidth) : 0;
  const offset =
    maxVisiblePeekWidth > 0
      ? Math.min(Math.max(0, limitedOffset - safeGap), maxVisiblePeekWidth)
      : 0;
  if (!offset || peekState.direction === 0) return null;

  const progress =
    maxVisiblePeekWidth > 0 ? Math.min(1, offset / maxVisiblePeekWidth) : 0;
  const translate = (1 - progress) * 35;
  const opacity = 0.25 + progress * 0.6;
  const shadowOpacity = 0.45 + progress * 0.3;

  const isNext = peekState.direction === 1;
  const label = isNext ? nextLabel : previousLabel;
  const keyLabel = isNext ? nextKey : previousKey;
  const previewModel = isNext ? nextModel : previousModel;
  const expectedKey = isNext ? nextKey : previousKey;
  const isModelForDirection = previewModel?.dayViewDateKey === expectedKey;
  const resolvedPreviewModel = isModelForDirection ? previewModel : null;
  const previewTimelineHeight = resolvedPreviewModel
    ? computeDayTimelineHeightPx(resolvedPreviewModel.startHour, pxPerMin)
    : baseTimelineHeight;
  const previewContainerHeight = previewTimelineHeight + timelineChromeHeight;
  const alignment = isNext ? "items-end text-right" : "items-start text-left";
  const cornerClass = isNext
    ? "rounded-l-[var(--radius-lg)]"
    : "rounded-r-[var(--radius-lg)]";
  const transformOrigin = isNext ? "right center" : "left center";

  let overlayCenter: number | null = null;
  let visibleHeight: number | null = null;
  if (container) {
    const rect = container.getBoundingClientRect();
    const height = container.offsetHeight;
    const viewportHeightRaw =
      typeof window !== "undefined"
        ? (window.visualViewport?.height ?? window.innerHeight)
        : container.offsetHeight;
    const viewportHeight = Number.isFinite(viewportHeightRaw)
      ? viewportHeightRaw
      : container.offsetHeight;
    const visibleStart = Math.max(0, -rect.top);
    const visibleEnd = Math.min(height, viewportHeight - rect.top);
    visibleHeight = Math.max(0, visibleEnd - visibleStart);
    if (visibleHeight > 0) {
      overlayCenter = visibleStart + visibleHeight / 2;
    } else {
      overlayCenter = height / 2;
    }
  }

  const fallbackContainerHeight =
    container?.offsetHeight ??
    (previewContainerHeight > 0 ? previewContainerHeight : null);
  const anchorProgressRaw =
    scrollProgress !== null
      ? scrollProgress
      : overlayCenter !== null && fallbackContainerHeight
        ? overlayCenter / fallbackContainerHeight
        : 0.5;
  const anchorProgress = Math.min(Math.max(anchorProgressRaw, 0), 1);
  const overlayAnchor =
    fallbackContainerHeight !== null
      ? fallbackContainerHeight * anchorProgress
      : (overlayCenter ?? 0);
  const overlayStyle: CSSProperties =
    fallbackContainerHeight !== null
      ? { top: overlayAnchor, transform: "translateY(-50%)" }
      : { top: "50%", transform: "translateY(-50%)" };

  const viewportHeight =
    visibleHeight && visibleHeight > 0
      ? visibleHeight
      : (fallbackContainerHeight ?? previewContainerHeight);
  const safeViewportHeight =
    viewportHeight && viewportHeight > 0
      ? viewportHeight
      : previewContainerHeight;
  const previewAnchorOffset = previewContainerHeight * anchorProgress;
  const halfViewport = safeViewportHeight / 2;
  const translateYRaw = halfViewport - previewAnchorOffset;
  const minTranslate = Math.min(0, safeViewportHeight - previewContainerHeight);
  const maxTranslate = 0;
  const previewTranslateY = Math.min(
    Math.max(translateYRaw, minTranslate),
    maxTranslate
  );
  const clampedPreviewHeight =
    safeViewportHeight > 0 ? safeViewportHeight : undefined;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex"
      style={overlayStyle}
    >
      <div
        className={`relative flex flex-1 ${
          isNext ? "justify-end" : "justify-start"
        }`}
        style={{
          paddingRight: isNext ? safeGap : 0,
          paddingLeft: isNext ? 0 : safeGap,
        }}
      >
        <div
          className={`pointer-events-none flex flex-col gap-3 border border-white/10 bg-white/8 px-5 py-4 text-white backdrop-blur-md ${alignment} ${cornerClass}`}
          style={{
            width: offset,
            opacity,
            transform: `translateX(${isNext ? translate : -translate}%)`,
            transformOrigin,
            boxShadow: `0 28px 58px rgba(3, 3, 6, ${shadowOpacity})`,
          }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
              {isNext ? "Next day" : "Previous day"}
            </span>
            <span className="text-base font-semibold leading-tight drop-shadow">
              {label}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/60">
              {keyLabel}
            </span>
          </div>
          <div
            className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-black/40"
            style={{ height: clampedPreviewHeight }}
          >
            {resolvedPreviewModel ? (
              <div
                className="pointer-events-none"
                style={{
                  height: previewContainerHeight,
                  transform: `translateY(${previewTranslateY}px)`,
                }}
              >
                {renderPreview(resolvedPreviewModel, {
                  disableInteractions: true,
                })}
              </div>
            ) : (
              <div className="flex h-36 items-center justify-center text-[11px] text-white/70">
                Loading schedule…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function parseSchedulerFailures(input: unknown): SchedulerRunFailure[] {
  if (!Array.isArray(input)) return [];
  const results: SchedulerRunFailure[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as {
      itemId?: unknown;
      reason?: unknown;
      detail?: unknown;
    };
    const itemId = value.itemId;
    if (typeof itemId !== "string" || itemId.length === 0) continue;
    const reason = value.reason;
    results.push({
      itemId,
      reason:
        typeof reason === "string" && reason.length > 0 ? reason : "unknown",
      detail: value.detail,
    });
  }
  return results;
}

function parseSchedulerTimeline(input: unknown): SchedulerTimelineEntry[] {
  if (!Array.isArray(input)) return [];
  const results: SchedulerTimelineEntry[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as {
      type?: unknown;
      instance?: unknown;
      projectId?: unknown;
      decision?: unknown;
      scheduledDayOffset?: unknown;
      availableStartLocal?: unknown;
      windowStartLocal?: unknown;
      habit?: unknown;
    };
    const typeRaw =
      typeof value.type === "string" ? value.type.toUpperCase() : null;

    if (typeRaw === "HABIT") {
      const habitValue = value.habit;
      if (!habitValue || typeof habitValue !== "object") continue;
      const habitEntry = habitValue as {
        id?: unknown;
        name?: unknown;
        windowId?: unknown;
        startUTC?: unknown;
        endUTC?: unknown;
        durationMin?: unknown;
        energyResolved?: unknown;
        clipped?: unknown;
      };
      const habitId = typeof habitEntry.id === "string" ? habitEntry.id : null;
      const startUTC =
        typeof habitEntry.startUTC === "string" ? habitEntry.startUTC : null;
      const endUTC =
        typeof habitEntry.endUTC === "string" ? habitEntry.endUTC : null;
      if (!habitId || !startUTC || !endUTC) continue;
      const decision = value.decision;
      if (
        decision !== "kept" &&
        decision !== "new" &&
        decision !== "rescheduled"
      )
        continue;
      const windowId =
        typeof habitEntry.windowId === "string" ? habitEntry.windowId : null;
      const durationMin =
        typeof habitEntry.durationMin === "number" &&
        Number.isFinite(habitEntry.durationMin)
          ? habitEntry.durationMin
          : null;
      const energyResolved =
        typeof habitEntry.energyResolved === "string" &&
        habitEntry.energyResolved.trim().length > 0
          ? habitEntry.energyResolved
          : null;
      const practiceContextId =
        typeof habitEntry.practiceContextId === "string" &&
        habitEntry.practiceContextId.length > 0
          ? habitEntry.practiceContextId
          : null;
      const scheduledDayOffset =
        typeof value.scheduledDayOffset === "number" &&
        Number.isFinite(value.scheduledDayOffset)
          ? value.scheduledDayOffset
          : null;
      const availableStartLocal =
        typeof value.availableStartLocal === "string" &&
        value.availableStartLocal.length > 0
          ? value.availableStartLocal
          : null;
      const windowStartLocal =
        typeof value.windowStartLocal === "string" &&
        value.windowStartLocal.length > 0
          ? value.windowStartLocal
          : null;
      const habitName =
        typeof habitEntry.name === "string" && habitEntry.name.trim().length > 0
          ? habitEntry.name
          : null;
      const clipped = habitEntry.clipped === true;

      results.push({
        type: "HABIT",
        habitId,
        habitName,
        windowId,
        decision,
        startUTC,
        endUTC,
        durationMin,
        energyResolved,
        scheduledDayOffset,
        availableStartLocal,
        windowStartLocal,
        clipped,
        practiceContextId,
      });
      continue;
    }

    const instance = value.instance;
    if (!instance || typeof instance !== "object") continue;
    const instanceValue = instance as {
      id?: unknown;
      source_id?: unknown;
      window_id?: unknown;
      start_utc?: unknown;
      end_utc?: unknown;
      duration_min?: unknown;
      energy_resolved?: unknown;
      locked?: unknown;
    };
    const instanceId =
      typeof instanceValue.id === "string" ? instanceValue.id : null;
    const startUTC =
      typeof instanceValue.start_utc === "string"
        ? instanceValue.start_utc
        : null;
    const endUTC =
      typeof instanceValue.end_utc === "string" ? instanceValue.end_utc : null;
    if (!instanceId || !startUTC || !endUTC) continue;
    const decision = value.decision;
    if (decision !== "kept" && decision !== "new" && decision !== "rescheduled")
      continue;
    const projectId =
      typeof value.projectId === "string" && value.projectId.trim().length > 0
        ? value.projectId
        : typeof instanceValue.source_id === "string" &&
            instanceValue.source_id.trim().length > 0
          ? (instanceValue.source_id as string)
          : null;
    if (!projectId) continue;
    const windowId =
      typeof instanceValue.window_id === "string"
        ? instanceValue.window_id
        : null;
    const durationMin =
      typeof instanceValue.duration_min === "number" &&
      Number.isFinite(instanceValue.duration_min)
        ? instanceValue.duration_min
        : null;
    const energyResolved =
      typeof instanceValue.energy_resolved === "string" &&
      instanceValue.energy_resolved.trim().length > 0
        ? instanceValue.energy_resolved
        : null;
    const scheduledDayOffset =
      typeof value.scheduledDayOffset === "number" &&
      Number.isFinite(value.scheduledDayOffset)
        ? value.scheduledDayOffset
        : null;
    const availableStartLocal =
      typeof value.availableStartLocal === "string" &&
      value.availableStartLocal.length > 0
        ? value.availableStartLocal
        : null;
    const windowStartLocal =
      typeof value.windowStartLocal === "string" &&
      value.windowStartLocal.length > 0
        ? value.windowStartLocal
        : null;

    results.push({
      type: "PROJECT",
      instanceId,
      projectId,
      windowId,
      decision,
      startUTC,
      endUTC,
      durationMin,
      energyResolved,
      scheduledDayOffset,
      availableStartLocal,
      windowStartLocal,
      locked: instanceValue.locked === true,
    });
  }
  return results;
}

function parseSchedulerDebugPayload(
  payload: unknown
): Omit<SchedulerDebugState, "runAt"> | null {
  if (!payload || typeof payload !== "object") return null;
  const schedule = (payload as { schedule?: unknown }).schedule;
  const debugSummary = (payload as { debugSummary?: unknown }).debugSummary;
  if (!schedule || typeof schedule !== "object") return null;
  const scheduleValue = schedule as {
    placed?: unknown;
    failures?: unknown;
    error?: unknown;
    timeline?: unknown;
  };
  const placedCount = Array.isArray(scheduleValue.placed)
    ? scheduleValue.placed.length
    : 0;
  const placedProjectIds = Array.isArray(scheduleValue.placed)
    ? Array.from(
        new Set(
          scheduleValue.placed
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const typedEntry = entry as {
                source_id?: unknown;
                source_type?: unknown;
              };
              const rawType = typedEntry.source_type;
              const normalizedType =
                typeof rawType === "string" ? rawType.toUpperCase() : null;
              if (normalizedType !== "PROJECT") return null;
              const id = typedEntry.source_id;
              return typeof id === "string" && id.length > 0 ? id : null;
            })
            .filter((value): value is string => Boolean(value))
        )
      )
    : [];
  return {
    failures: parseSchedulerFailures(scheduleValue.failures),
    placedCount,
    placedProjectIds,
    timeline: parseSchedulerTimeline(scheduleValue.timeline),
    error: scheduleValue.error ?? null,
    debugSummary,
  };
}

type WindowReportEntry = {
  key: string;
  window: RepoWindow;
  windowLabel: string;
  summary: string;
  details: string[];
  energyLabel: (typeof ENERGY.LIST)[number];
  durationLabel: string;
  rangeLabel: string;
  rangeStart: Date;
  rangeEnd: Date;
};

const ENERGY_LABEL_SET = new Set<(typeof ENERGY.LIST)[number]>(ENERGY.LIST);
const DEFAULT_ENERGY_ID_LOOKUP: Record<string, (typeof ENERGY.LIST)[number]> =
  ENERGY.LIST.reduce(
    (map, label, index) => {
      map[String(index + 1)] = label;
      map[label] = label;
      return map;
    },
    {} as Record<string, (typeof ENERGY.LIST)[number]>
  );
let scheduleEnergyLookupMap: Record<string, (typeof ENERGY.LIST)[number]> = {
  ...DEFAULT_ENERGY_ID_LOOKUP,
};

function normalizeEnergyLabel(
  level?: string | null
): (typeof ENERGY.LIST)[number] {
  return resolveEnergyLevel(level) ?? "NO";
}

function resolveEnergyLevel(
  value?: unknown
): (typeof ENERGY.LIST)[number] | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const direct = scheduleEnergyLookupMap[trimmed];
    if (direct) return direct;
    const upper = trimmed.toUpperCase();
    const normalized = scheduleEnergyLookupMap[upper];
    if (normalized) return normalized;
    return ENERGY_LABEL_SET.has(upper as (typeof ENERGY.LIST)[number])
      ? (upper as (typeof ENERGY.LIST)[number])
      : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const direct = scheduleEnergyLookupMap[String(value)];
    if (direct) return direct;
    return resolveEnergyLevel(String(value));
  }
  if (
    value &&
    typeof value === "object" &&
    "name" in (value as { name?: string | null })
  ) {
    const candidate = (value as { name?: string | null }).name ?? null;
    return resolveEnergyLevel(candidate);
  }
  return null;
}

function updateScheduleEnergyLookup(
  lookup?: Record<string, (typeof ENERGY.LIST)[number]> | null
) {
  scheduleEnergyLookupMap = { ...DEFAULT_ENERGY_ID_LOOKUP };
  if (!lookup) return;
  for (const [key, value] of Object.entries(lookup)) {
    if (!key) continue;
    const normalized = normalizeEnergyLabel(value);
    scheduleEnergyLookupMap[key] = normalized;
    scheduleEnergyLookupMap[normalized] = normalized;
  }
}

function formatGapRangeLabel(start: Date, end: Date): string {
  return `${TIME_FORMATTER.format(start)} – ${TIME_FORMATTER.format(end)}`;
}

export default function ScheduleTabContent({
  isSwipePreview = false,
}: {
  isSwipePreview?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { localTimeZone, loading: profileLoading } = useProfile();
  const toast = useToastHelpers();
  const ENABLE_BACKGROUND_SCHEDULER = false;

  // 1. browser timezone detection
  const browserTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  // 2. derived but nullable values
  const stableTimeZone = useMemo(() => {
    if (
      !localTimeZone ||
      typeof localTimeZone !== "string" ||
      localTimeZone.trim() === "" ||
      localTimeZone === "null"
    )
      return null;
    return localTimeZone;
  }, [localTimeZone]);
  const effectiveTimeZone = useMemo(() => {
    return localTimeZone || browserTimeZone || "UTC";
  }, [localTimeZone, browserTimeZone]);
  const resolvedScheduleTimeZone = useMemo(
    () => stableTimeZone ?? normalizeTimeZone(effectiveTimeZone) ?? "UTC",
    [stableTimeZone, effectiveTimeZone]
  );
  // 6. canonical today (already fixed earlier)
  const canonicalTodayDateKey = useMemo(() => {
    return dayKeyFromUtc(new Date().toISOString(), effectiveTimeZone);
  }, [effectiveTimeZone]);
  const prefersReducedMotion = useReducedMotion();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hasStartedScheduleTourRef = useRef(false);
  const habitCompletionStorageKey = useMemo(
    () => (userId ? `${HABIT_COMPLETION_STORAGE_PREFIX}:${userId}` : null),
    [userId]
  );
  const handleScheduleTourComplete = useCallback(() => {
    completeCreatorTourState("schedule");
  }, []);
  const { start: startScheduleTour } = useTour(
    scheduleTourSteps,
    handleScheduleTourComplete
  );

  useEffect(() => {
    if (isSwipePreview) return;
    if (typeof window === "undefined") return;
    if (hasStartedScheduleTourRef.current) return;
    if (window.localStorage.getItem(SCHEDULE_TOUR_PENDING_KEY) !== "1") return;
    window.localStorage.removeItem(SCHEDULE_TOUR_PENDING_KEY);
    if (window.localStorage.getItem(SCHEDULE_TOUR_COMPLETED_KEY) === "1") return;
    hasStartedScheduleTourRef.current = true;
    startScheduleTour();
  }, [isSwipePreview, startScheduleTour]);

  const initialViewParam = searchParams.get("view") as ScheduleView | null;
  const initialView: ScheduleView =
    initialViewParam && ["day", "focus"].includes(initialViewParam)
      ? initialViewParam
      : "day";
  const initialDate = searchParams.get("date");

  const initialDateResult = useMemo(
    () => parseScheduleDateParam(initialDate),
    [initialDate]
  );
  const initialDateWasValid = initialDateResult.wasValid;

  const [currentDateKey, setCurrentDateKey] = useState(
    () => initialDateResult.key
  );
  const hasAppliedInitialDateFallbackRef = useRef(initialDateWasValid);
  const runIdRef = useRef(0);

  const currentDate = useMemo(() => {
    return localDayFromKey(currentDateKey, resolvedScheduleTimeZone);
  }, [currentDateKey, resolvedScheduleTimeZone]);
  // 5. dayViewDateKey (string)
  const dayViewDateKey = useMemo(() => {
    return formatScheduleDateKey(currentDate, resolvedScheduleTimeZone);
  }, [currentDate, resolvedScheduleTimeZone]);
  const [view, setView] = useState<ScheduleView>(initialView);

  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [projectSkillIds, setProjectSkillIds] = useState<
    Record<string, string[]>
  >({});
  const [projectGoalRelations, setProjectGoalRelations] = useState<
    ScheduleEventDataset["projectGoalRelations"]
  >({});
  const [habits, setHabits] = useState<HabitScheduleItem[]>([]);
  const [syncPairings, setSyncPairings] =
    useState<SyncPairingsByInstanceId>({});
  const [habitCompletionByDate, setHabitCompletionByDate] =
    useState<HabitCompletionByDate>({});
  const [windows, setWindows] = useState<RepoWindow[]>([]);
  const [selectedTimeBlockForConstraints, setSelectedTimeBlockForConstraints] =
    useState<TimeBlockConstraintDraft | null>(null);
  const [isSavingTimeBlockConstraints, setIsSavingTimeBlockConstraints] =
    useState(false);
  const [timeBlockConstraintsError, setTimeBlockConstraintsError] = useState<
    string | null
  >(null);
  const [timeBlockSkillSearch, setTimeBlockSkillSearch] = useState("");
  const [timeBlockMonumentSearch, setTimeBlockMonumentSearch] = useState("");
  const { options: timeBlockLocationOptions, loading: timeBlockLocationsLoading } =
    useLocationContexts();
  const [overlayWindows, setOverlayWindows] =
    useState<OverlayWindowRecord[]>([]);
  const [commandBlocks, setCommandBlocks] = useState<CommandBlockRecord[]>([]);
  const [manualPlacementSession, setManualPlacementSession] = useState<{
    candidate: ManualPlacementCandidate;
    pointerId: number | null;
    ghost: ManualPlacementDragGhost;
    previewTime: Date | null;
    pushPreview: ManualPlacementPushPreviewResult | null;
  } | null>(null);
  const manualPlacementSessionRef = useRef<typeof manualPlacementSession>(null);
  const manualPlacementPointerIdRef = useRef<number | null>(null);
  const updateManualPlacementSession = useCallback(
    (
      updater: (
        prev: typeof manualPlacementSession
      ) => typeof manualPlacementSession
    ) => {
      setManualPlacementSession((prev) => {
        const next = updater(prev);
        manualPlacementSessionRef.current = next;
        return next;
      });
    },
    []
  );
  useEffect(() => {
    manualPlacementSessionRef.current = manualPlacementSession;
  }, [manualPlacementSession]);
  const renderDayStart = useMemo(
    () => getRenderDayStart(currentDate, effectiveTimeZone ?? "UTC"),
    [currentDate, effectiveTimeZone]
  );
  const renderDayEnd = useMemo(
    () =>
      addDaysInTimeZone(
        renderDayStart,
        1,
        effectiveTimeZone ?? "UTC"
      ),
    [renderDayStart, effectiveTimeZone]
  );
  const goalMetaById = useMemo(() => {
    const monumentEmojiById = new Map<string, string | null>();
    for (const monument of monuments ?? []) {
      if (monument?.id)
        monumentEmojiById.set(monument.id, monument.emoji ?? null);
    }
    const map = new Map<
      string,
      { title: string | null; emoji: string | null }
    >();
    Object.values(projectGoalRelations ?? {}).forEach((relation) => {
      if (!relation?.goalId) return;
      const title = relation.goalName ?? null;
      const emoji =
        relation.goalEmoji ??
        (relation.goalMonumentId
          ? (monumentEmojiById.get(relation.goalMonumentId) ?? null)
          : null);
      map.set(relation.goalId, { title, emoji });
    });
    return map;
  }, [projectGoalRelations, monuments]);

  const [allInstances, setAllInstances] = useState<ScheduleInstance[]>([]);
  const [instances, setInstances] = useState<ScheduleInstance[]>([]);
  const windowsRef = useRef<RepoWindow[]>(windows);
  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);
  const currentDateRef = useRef(currentDate);
  useEffect(() => {
    currentDateRef.current = currentDate;
  }, [currentDate]);
  const overlayWindowIdsWithEvents = useMemo(() => {
    const ids = new Set<string>();
    for (const instance of allInstances) {
      const overlayWindowId = instance?.overlay_window_id;
      if (typeof overlayWindowId === "string" && overlayWindowId.length > 0) {
        ids.add(overlayWindowId);
      }
    }
    return ids;
  }, [allInstances]);
  const [overlayVisibilityNowMs, setOverlayVisibilityNowMs] = useState(() =>
    Date.now()
  );
  const instanceStatusLogRef = useRef<Map<string, ScheduleInstance["status"]>>(
    new Map()
  );
  const habitStatusFlipRef = useRef<
    Map<
      string,
      {
        lastStatus: ScheduleInstance["status"] | null;
        lastChange: number;
        flipCount: number;
      }
    >
  >(new Map());
  const logInstanceStatusChange = useCallback(
    (
      source: string,
      instanceId: string,
      nextStatus: ScheduleInstance["status"] | null | undefined
    ) => {
      if (!instanceId) return;
      const prev = instanceStatusLogRef.current.get(instanceId) ?? null;
      const normalized =
        typeof nextStatus === "string" && nextStatus.length > 0
          ? nextStatus
          : null;
      if (prev === normalized) {
        return;
      }
      instanceStatusLogRef.current.set(instanceId, normalized ?? undefined);
      console.log("[INSTANCE STATUS]", {
        source,
        instanceId,
        previousStatus: prev,
        nextStatus: normalized,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  const instancesById = useMemo(() => {
    const map = new Map<string, ScheduleInstance>();
    for (const instance of instances) {
      if (instance?.id) {
        map.set(instance.id, instance);
      }
    }
    return map;
  }, [instances]);
  const [scheduledProjectIds, setScheduledProjectIds] = useState<
    Set<string>
  >(new Set());
  const [metaStatus, setMetaStatus] = useState<LoadStatus>("idle");
  const [instancesStatus, setInstancesStatus] = useState<LoadStatus>("idle");
  const [schedulerDebug, setSchedulerDebug] =
    useState<SchedulerDebugState | null>(null);
  const [pendingInstanceStatuses, setPendingInstanceStatuses] = useState<
    Map<string, ScheduleInstance["status"]>
  >(new Map());
  const [pendingBacklogTaskIds, setPendingBacklogTaskIds] = useState<
    Set<string>
  >(new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set()
  );
  const expandedProjectsRef = useRef<Set<string>>(expandedProjects);
  useEffect(() => {
    expandedProjectsRef.current = expandedProjects;
  }, [expandedProjects]);
  const [hasInteractedWithProjects, setHasInteractedWithProjects] =
    useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [
    isClearingUncompletedScheduleInstances,
    setIsClearingUncompletedScheduleInstances,
  ] = useState(false);
  const [isRecyclingManualEvents, setIsRecyclingManualEvents] =
    useState(false);
  const [isManualSchedulingMode, setIsManualSchedulingMode] = useState(false);
  const [hasAutoRunToday, setHasAutoRunToday] = useState<boolean | null>(null);
  const [dayTransitionDirection, setDayTransitionDirection] =
    useState<DayTransitionDirection>(0);
  const [isSwipingDayView, setIsSwipingDayView] = useState(false);
  const [skipNextDayAnimation, setSkipNextDayAnimation] = useState(false);
  const [isJumpToDateOpen, setIsJumpToDateOpen] = useState(false);
  const [jumpToDateSnapshot, setJumpToDateSnapshot] =
    useState<JumpToDateSnapshot | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [focusInstanceId, setFocusInstanceId] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] =
    useState<ScheduleInstance | null>(null);
  const [editingSnapshot, setEditingSnapshot] =
    useState<EditingSnapshot | null>(null);

  useEffect(() => {
    const snapshotWithInstance =
      editingSnapshot as EditingSnapshotWithInstance | null;
    setEditingInstance(snapshotWithInstance?.instance ?? null);
  }, [editingSnapshot]);

  const [topBarHeight, setTopBarHeight] = useState<number | null>(null);
  const sliderControls = useAnimationControls();
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const activePressRef = useRef<{
    instanceId: string;
    habitId?: string;
    shortPress: (() => void) | null;
    pointerId?: number;
  } | null>(null);
  const shortPressHandledRef = useRef(false);
  const [longPressBounceId, setLongPressBounceId] = useState<string | null>(
    null
  );
  const longPressBounceTimeoutRef = useRef<number | null>(null);
  const [completionBounceId, setCompletionBounceId] = useState<string | null>(
    null
  );
  const completionBounceTimeoutRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<HTMLElement | null>(null);
  const pendingLongPressActionRef = useRef<{
    action: () => void;
    instanceId: string;
    originData: ScheduleEditOrigin | null;
  } | null>(null);
  const [peekModels, setPeekModels] = useState<{
    previous?: DayTimelineModel | null;
    next?: DayTimelineModel | null;
  }>({});
  const [modeType, setModeType] = useState<SchedulerModeType>("REGULAR");
  const [modeMonumentId, setModeMonumentId] = useState<string | null>(null);
  const [modeSkillIds, setModeSkillIds] = useState<string[]>([]);
  const [isModeSheetOpen, setIsModeSheetOpen] = useState(false);
  const modeSelection = useMemo<SchedulerModeSelection>(() => {
    switch (modeType) {
      case "MONUMENTAL":
        return { type: "MONUMENTAL", monumentId: modeMonumentId };
      case "SKILLED":
        return { type: "SKILLED", skillIds: modeSkillIds };
      case "RUSH":
        return { type: "RUSH" };
      case "REST":
        return { type: "REST" };
      default:
        return { type: "REGULAR" };
    }
  }, [modeType, modeMonumentId, modeSkillIds]);
  const resolvedModePayload = useMemo(
    () => selectionToSchedulerModePayload(modeSelection),
    [modeSelection]
  );
  const handleModeTypeChange = useCallback(
    (type: SchedulerModeType) => {
      if (type === modeType) {
        return;
      }
      void hapticSoftTick();
      setModeType(type);
      if (type === "MONUMENTAL") {
        setModeMonumentId((prev) => {
          if (prev && monuments.some((monument) => monument.id === prev)) {
            return prev;
          }
          return monuments[0]?.id ?? null;
        });
      }
    },
    [modeType, monuments]
  );
  const handleMonumentChange = useCallback((id: string | null) => {
    if (id === modeMonumentId) {
      return;
    }
    void hapticSoftTick();
    setModeMonumentId(id);
  }, [modeMonumentId]);
  const handleSkillToggle = useCallback((skillId: string) => {
    void hapticSoftTick();
    setModeSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return Array.from(next);
    });
  }, []);
  const handleClearSkills = useCallback(() => {
    if (modeSkillIds.length === 0) {
      return;
    }
    void hapticSoftTick();
    setModeSkillIds([]);
  }, [modeSkillIds.length]);

  const peekDataDepsRef = useRef<{
    projectMap: typeof projectMap;
    taskMap: typeof taskMap;
    tasksByProjectId: typeof tasksByProjectId;
    habits: typeof habits;
    unscheduledProjects: typeof unscheduledProjects;
    schedulerFailureByProjectId: typeof schedulerFailureByProjectId;
    schedulerDebug: typeof schedulerDebug;
    schedulerTimelinePlacements: typeof schedulerTimelinePlacements;
    timeZoneShortName: string;
    friendlyTimeZone: string;
    effectiveTimeZone: string;
  } | null>(null);

  const [peekState, setPeekState] = useState<PeekState>({
    direction: 0,
    offset: 0,
  });
  const backlogTaskPreviousStageRef = useRef<Map<string, TaskLite["stage"]>>(
    new Map()
  );
  const resolvedEditingInstance = editingInstance;

  useEffect(() => {
    setPendingInstanceStatuses((prev) => {
      if (prev.size === 0) return prev;
      const activeIds = new Set(instances.map((instance) => instance.id));
      let changed = false;
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (!activeIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [instances]);

  const clearScheduleData = useCallback(() => {
    setWindows([]);
    setAllInstances([]);
    setInstances([]);
    setTasks([]);
    setProjects([]);
    setSkills([]);
    setMonuments([]);
    setProjectSkillIds({});
    setProjectGoalRelations({});
    setHabits([]);
    setSyncPairings({});
    setScheduledProjectIds(new Set());
    setPendingInstanceStatuses(new Map());
    setPendingBacklogTaskIds(new Set());
    backlogTaskPreviousStageRef.current = new Map();
    scheduleDatasetRef.current = null;
  }, []);
  const [pxPerMin, setPxPerMin] = useState<number>(INITIAL_PX_PER_MIN);
  const animatedPxPerMin = useMotionValue<number>(pxPerMin);
  const zoomAnimationRef = useRef<AnimationPlaybackControls | null>(null);
  const basePxPerMinRef = useRef(INITIAL_PX_PER_MIN);
  // Skip the first post-mount viewport/layout pass so the midpoint fallback
  // remains visible on mobile until the page has settled.
  const zoomLayoutSyncReadyRef = useRef(false);
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialPxPerMin: number;
    initialHeight: number;
    anchorProgress: number;
    initialScrollY: number;
  } | null>(null);
  const pinchActiveRef = useRef(false);
  const stopZoomAnimation = useCallback(() => {
    zoomAnimationRef.current?.stop();
    zoomAnimationRef.current = null;
  }, []);

  const commitZoomPxPerMin = useCallback(
    (
      next: number,
      options?: {
        markAsUserSelected?: boolean;
        syncAnimated?: boolean;
      }
    ) => {
      const clamped = clampPxPerMin(next);
      if (options?.markAsUserSelected) {
        zoomLayoutSyncReadyRef.current = true;
      }
      if (options?.syncAnimated) {
        stopZoomAnimation();
        animatedPxPerMin.set(clamped);
      }
      setPxPerMin((prev) => {
        return Math.abs(prev - clamped) < 0.001 ? prev : clamped;
      });
    },
    [animatedPxPerMin, stopZoomAnimation]
  );

  const animateZoomTo = useCallback(
    (target: number) => {
      const clamped = clampPxPerMin(target);
      if (prefersReducedMotion) {
        stopZoomAnimation();
        animatedPxPerMin.set(clamped);
        return;
      }
      if (Math.abs(animatedPxPerMin.get() - clamped) < 0.0005) {
        return;
      }
      stopZoomAnimation();
      zoomAnimationRef.current = animate(animatedPxPerMin, clamped, {
        type: "spring",
        stiffness: 140,
        damping: 26,
        mass: 0.9 as number,
      });
    },
    [animatedPxPerMin, prefersReducedMotion, stopZoomAnimation]
  );

  const commitPinchToSnap = useCallback(() => {
    const snapped = snapPxPerMin(animatedPxPerMin.get());
    commitZoomPxPerMin(snapped, {
      markAsUserSelected: true,
      syncAnimated: true,
    });
  }, [animatedPxPerMin, commitZoomPxPerMin]);

  useEffect(() => {
    if (pinchActiveRef.current) return;
    animateZoomTo(pxPerMin);
  }, [pxPerMin, animateZoomTo]);

  useEffect(() => {
    return () => {
      stopZoomAnimation();
    };
  }, [stopZoomAnimation]);
  const hasLoadedHabitCompletionState = useRef(false);
  const lastTimelineChromeHeightRef = useRef(0);
  const [memoCompletionState, setMemoCompletionState] =
    useState<MemoCompletionDraftState | null>(null);

  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (prevUserId === null && userId === null) return;
    if (!prevUserId && userId) return;
    if (prevUserId && !userId) {
      clearScheduleData();
      setMetaStatus("idle");
      setInstancesStatus("idle");
      loadInstancesRef.current = async () => {};
      return;
    }

    // ... rest of the useEffect remains the same ...
  }, [userId]);

  useEffect(() => {
    if (modeType !== "MONUMENTAL") return;
    if (monuments.length === 0) {
      if (modeMonumentId !== null) setModeMonumentId(null);
      return;
    }
    const hasCurrent = modeMonumentId
      ? monuments.some((monument) => monument.id === modeMonumentId)
      : false;
    if (!hasCurrent) {
      setModeMonumentId(monuments[0]?.id ?? null);
    }
  }, [modeType, monuments, modeMonumentId]);

  useEffect(() => {
    setModeSkillIds((prev) => {
      if (prev.length === 0) return prev;
      const valid = new Set(skills.map((skill) => skill.id));
      const filtered = prev.filter((id) => valid.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [skills]);

  useEffect(() => {
    if (userId) return;
    setModeType("REGULAR");
    setModeMonumentId(null);
    setModeSkillIds([]);
  }, [userId]);

  useEffect(() => {
    if (!habitCompletionStorageKey) {
      setHabitCompletionByDate({});
      hasLoadedHabitCompletionState.current = false;
      return;
    }
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(habitCompletionStorageKey);
      if (!raw) {
        setHabitCompletionByDate({});
        hasLoadedHabitCompletionState.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") {
        setHabitCompletionByDate({});
        hasLoadedHabitCompletionState.current = true;
        return;
      }
      const next: HabitCompletionByDate = {};
      for (const [dateKey, value] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        if (typeof dateKey !== "string" || dateKey.length === 0) continue;
        if (!value || typeof value !== "object") continue;
        const dayMap: Record<string, HabitCompletionStatus> = {};
        for (const [habitId, status] of Object.entries(
          value as Record<string, unknown>
        )) {
          if (typeof habitId !== "string" || habitId.length === 0) continue;
          if (status === "completed") {
            dayMap[habitId] = "completed";
          }
        }
        if (Object.keys(dayMap).length > 0) {
          next[dateKey] = dayMap;
        }
      }
      setHabitCompletionByDate(next);
    } catch (error) {
      console.error("Failed to load habit completion state", error);
      setHabitCompletionByDate({});
    } finally {
      hasLoadedHabitCompletionState.current = true;
    }
  }, [habitCompletionStorageKey]);

  useEffect(() => {
    if (!habitCompletionStorageKey) return;
    if (!hasLoadedHabitCompletionState.current) return;
    if (typeof window === "undefined") return;
    try {
      if (Object.keys(habitCompletionByDate).length === 0) {
        window.localStorage.removeItem(habitCompletionStorageKey);
      } else {
        window.localStorage.setItem(
          habitCompletionStorageKey,
          JSON.stringify(habitCompletionByDate)
        );
      }
    } catch (error) {
      console.error("Failed to persist habit completion state", error);
    }
  }, [habitCompletionByDate, habitCompletionStorageKey]);

  const updateCurrentDate = useCallback(
    (
      nextDate: Date,
      options?: {
        direction?: DayTransitionDirection;
        animate?: boolean;
      }
    ) => {
      const shouldAnimate = options?.animate ?? true;
      if (!prefersReducedMotion && view === "day" && shouldAnimate) {
        const resolvedDirection =
          options?.direction ??
          (() => {
            const diff = nextDate.getTime() - currentDate.getTime();
            if (diff === 0) return 0 as DayTransitionDirection;
            return diff > 0 ? 1 : -1;
          })();
        setDayTransitionDirection(resolvedDirection);
      } else {
        setDayTransitionDirection(0);
      }
      hasAppliedInitialDateFallbackRef.current = true;
      const tz = stableTimeZone ?? normalizeTimeZone(effectiveTimeZone);
      setCurrentDateKey(formatScheduleDateKey(nextDate, tz));
    },
    [prefersReducedMotion, view, currentDate, stableTimeZone, effectiveTimeZone]
  );

  useEffect(() => {
    if (view !== "day") {
      setDayTransitionDirection(0);
    }
  }, [view]);

  useEffect(() => {
    if (initialDateWasValid) return;
    if (hasAppliedInitialDateFallbackRef.current) return;
    const tz =
      stableTimeZone ??
      (profileLoading ? null : normalizeTimeZone(effectiveTimeZone));
    if (!tz) return;
    // Only apply the invalid-date fallback once so setup/timezone changes
    // cannot override user date navigation after the page has initialized.
    hasAppliedInitialDateFallbackRef.current = true;
    setCurrentDateKey(formatScheduleDateKey(new Date(), tz));
  }, [initialDateWasValid, stableTimeZone, effectiveTimeZone, profileLoading]);

  useEffect(() => {
    setMemoCompletionState(null);
  }, [dayViewDateKey]);
  const timeZoneShortName = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone: effectiveTimeZone,
        timeZoneName: "short",
      });
      const part = formatter
        .formatToParts(currentDate)
        .find((item) => item.type === "timeZoneName");
      return part?.value ?? "";
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Unable to format time zone name", error);
      }
      return "";
    }
  }, [currentDate, effectiveTimeZone]);
  const scheduleContentPaddingTop = useMemo(() => {
    if (topBarHeight !== null && Number.isFinite(topBarHeight)) {
      const clamped = Math.max(0, topBarHeight);
      return `calc(${clamped}px + 1rem)`;
    }
    return "calc(4rem + env(safe-area-inset-top, 0px))";
  }, [topBarHeight]);
  const friendlyTimeZone = useMemo(() => {
    if (!effectiveTimeZone) return "UTC";
    const segments = effectiveTimeZone.split("/");
    const city = segments.pop();
    const region = segments.length > 0 ? segments.join(" / ") : "";
    const readableCity = city?.replace(/_/g, " ");
    const readableRegion = region.replace(/_/g, " ");
    if (readableCity && readableRegion) {
      return `${readableCity} · ${readableRegion}`;
    }
    if (readableCity) return readableCity;
    if (readableRegion) return readableRegion;
    return effectiveTimeZone.replace(/_/g, " ");
  }, [effectiveTimeZone]);
  const previousDayDate = useMemo(() => {
    const prev = new Date(currentDate);
    prev.setDate(currentDate.getDate() - 1);
    return prev;
  }, [currentDate]);
  const nextDayDate = useMemo(() => {
    const next = new Date(currentDate);
    next.setDate(currentDate.getDate() + 1);
    return next;
  }, [currentDate]);
  const previousDayLabel = useMemo(
    () => formatDayViewLabel(previousDayDate, effectiveTimeZone),
    [previousDayDate, effectiveTimeZone]
  );
  const nextDayLabel = useMemo(
    () => formatDayViewLabel(nextDayDate, effectiveTimeZone),
    [nextDayDate, effectiveTimeZone]
  );
  const previousDayKey = useMemo(() => {
    const tz = stableTimeZone ?? effectiveTimeZone ?? "UTC";
    return formatScheduleDateKey(previousDayDate, tz);
  }, [previousDayDate, stableTimeZone, effectiveTimeZone]);
  const nextDayKey = useMemo(() => {
    const tz = stableTimeZone ?? effectiveTimeZone ?? "UTC";
    return formatScheduleDateKey(nextDayDate, tz);
  }, [nextDayDate, stableTimeZone, effectiveTimeZone]);
  const recordHabitCompletionRemote = useCallback(
    async (params: {
      habitId: string;
      completedAt: string;
      action: "complete" | "undo";
      scheduleInstanceId?: string | null;
      durationMin?: number | null;
    }) => {
      if (!userId) return;
      const completionDate = new Date(params.completedAt);
      const completedAtISO = Number.isNaN(completionDate.getTime())
        ? new Date().toISOString()
        : completionDate.toISOString();
      try {
        const response = await fetch("/api/habits/completion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            habitId: params.habitId,
            completedAt: completedAtISO,
            timeZone: effectiveTimeZone,
            action: params.action,
            scheduleInstanceId: params.scheduleInstanceId ?? undefined,
            durationMin: params.durationMin ?? undefined,
          }),
        });
        if (!response.ok) {
          console.error(
            "Failed to sync habit completion metadata",
            await response.text()
          );
          void hapticErrorPattern();
        }
      } catch (error) {
        console.error("Failed to sync habit completion metadata", error);
        void hapticErrorPattern();
      }
    },
    [effectiveTimeZone, userId]
  );
  const completionTimestampForDateKey = useCallback(
    (dateKey: string) => {
      const [yearStr, monthStr, dayStr] = dateKey.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day)
      ) {
        return new Date().toISOString();
      }
      try {
        const base = makeDateInTimeZone(
          { year, month, day, hour: 12, minute: 0 },
          effectiveTimeZone
        );
        return base.toISOString();
      } catch {
        return new Date().toISOString();
      }
    },
    [effectiveTimeZone]
  );
  const setProjectExpansion = useCallback(
    (projectId: string, nextState?: boolean) => {
      setHasInteractedWithProjects(true);
      setExpandedProjects((prev) => {
        const next = new Set(prev);
        const shouldExpand =
          typeof nextState === "boolean" ? nextState : !next.has(projectId);
        if (shouldExpand) next.add(projectId);
        else next.delete(projectId);
        return next;
      });
    },
    [setExpandedProjects, setHasInteractedWithProjects]
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleSchedulePointerDown = (event: PointerEvent) => {
      if (!expandedProjectsRef.current.size) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-expanded-project-id]")) return;
      if (!target.closest("[data-schedule-root]")) return;
      setExpandedProjects(new Set());
    };
    document.addEventListener("pointerdown", handleSchedulePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleSchedulePointerDown);
    };
  }, [setExpandedProjects]);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchStartWidth = useRef<number>(0);
  const hasVerticalTouchMovement = useRef<boolean>(false);
  const swipeDeltaRef = useRef(0);
  const swipeScrollProgressRef = useRef<number | null>(null);
  const jumpPullControls = useAnimationControls();
  const [isInlineJumpToDateOpen, setIsInlineJumpToDateOpen] = useState(false);
  const [isInlineJumpEditorMode, setIsInlineJumpEditorMode] = useState(false);
  const [inlineJumpRevealHeight, setInlineJumpRevealHeight] = useState(
    INLINE_JUMP_REVEAL_HEIGHT_PX
  );
  const [inlineJumpMaxRevealHeight, setInlineJumpMaxRevealHeight] = useState(
    INLINE_JUMP_REVEAL_HEIGHT_PX
  );
  const shouldUseInlineJumpEditorPanel =
    isInlineJumpToDateOpen && isInlineJumpEditorMode;
  const inlineJumpEffectiveRevealHeight = shouldUseInlineJumpEditorPanel
    ? inlineJumpMaxRevealHeight
    : inlineJumpRevealHeight;
  const inlineJumpRevealHeightRef = useRef(inlineJumpEffectiveRevealHeight);
  const jumpPullStartYRef = useRef<number | null>(null);
  const jumpPullDistanceRef = useRef(0);
  const isJumpPullingRef = useRef(false);
  const inlineJumpPullThreshold = Math.min(
    220,
    Math.max(145, inlineJumpEffectiveRevealHeight * 0.32)
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateInlineJumpRevealHeight = () => {
      const viewportHeightRaw =
        window.visualViewport?.height ?? window.innerHeight ?? 0;
      const viewportHeight = Number.isFinite(viewportHeightRaw)
        ? viewportHeightRaw
        : 0;
      const topChromeOffset =
        topBarHeight !== null && Number.isFinite(topBarHeight)
          ? Math.max(0, topBarHeight) + 16
          : 0;
      const availableHeight = Math.max(0, viewportHeight - topChromeOffset);
      const nextHeight = computeInlineJumpRevealHeight(availableHeight);
      const nextMaxHeight = computeInlineJumpMaxRevealHeight(availableHeight);
      setInlineJumpRevealHeight(nextHeight);
      setInlineJumpMaxRevealHeight(nextMaxHeight);
    };

    updateInlineJumpRevealHeight();
    window.addEventListener("resize", updateInlineJumpRevealHeight);
    window.visualViewport?.addEventListener(
      "resize",
      updateInlineJumpRevealHeight
    );
    return () => {
      window.removeEventListener("resize", updateInlineJumpRevealHeight);
      window.visualViewport?.removeEventListener(
        "resize",
        updateInlineJumpRevealHeight
      );
    };
  }, [topBarHeight]);

  useEffect(() => {
    if (!isInlineJumpToDateOpen) {
      inlineJumpRevealHeightRef.current = inlineJumpEffectiveRevealHeight;
      return;
    }
    if (shouldUseInlineJumpEditorPanel) {
      jumpPullControls.stop();
      jumpPullControls.set({ y: 0 });
      inlineJumpRevealHeightRef.current = inlineJumpEffectiveRevealHeight;
      return;
    }
    if (
      inlineJumpRevealHeightRef.current !== inlineJumpEffectiveRevealHeight
    ) {
      void jumpPullControls.start({
        y: inlineJumpEffectiveRevealHeight,
        transition: inlineJumpOpenTransition,
      });
    }
    inlineJumpRevealHeightRef.current = inlineJumpEffectiveRevealHeight;
  }, [
    inlineJumpEffectiveRevealHeight,
    isInlineJumpToDateOpen,
    shouldUseInlineJumpEditorPanel,
    jumpPullControls,
  ]);

  const resetInlineJumpPullState = useCallback(() => {
    isJumpPullingRef.current = false;
    jumpPullStartYRef.current = null;
    jumpPullDistanceRef.current = 0;
  }, []);

  const animateInlineJumpOpen = useCallback(
    async ({ source = "button" }: { source?: "button" | "pull" } = {}) => {
      jumpPullControls.stop();
      resetInlineJumpPullState();
      setIsJumpToDateOpen(false);
      setIsInlineJumpToDateOpen(true);

      if (isInlineJumpEditorMode) {
        jumpPullControls.set({ y: 0 });
        return;
      }

      if (prefersReducedMotion) {
        jumpPullControls.set({ y: inlineJumpEffectiveRevealHeight });
        return;
      }

      if (source === "button" && typeof window !== "undefined") {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }

      await jumpPullControls.start({
        y: inlineJumpEffectiveRevealHeight,
        transition: inlineJumpOpenTransition,
      });
    },
    [
      inlineJumpEffectiveRevealHeight,
      isInlineJumpEditorMode,
      jumpPullControls,
      prefersReducedMotion,
      resetInlineJumpPullState,
    ]
  );

  const animateInlineJumpClosed = useCallback(
    async ({ unmount = true }: { unmount?: boolean } = {}) => {
      jumpPullControls.stop();
      resetInlineJumpPullState();

      if (prefersReducedMotion) {
        jumpPullControls.set({ y: 0 });
        if (unmount) setIsInlineJumpToDateOpen(false);
        return;
      }

      if (shouldUseInlineJumpEditorPanel) {
        jumpPullControls.set({ y: 0 });
        if (unmount) setIsInlineJumpToDateOpen(false);
        return;
      }

      await jumpPullControls.start({
        y: -6,
        transition: inlineJumpCloseTransition,
      });
      jumpPullControls.set({ y: 0 });
      if (unmount) setIsInlineJumpToDateOpen(false);
    },
    [
      jumpPullControls,
      shouldUseInlineJumpEditorPanel,
      prefersReducedMotion,
      resetInlineJumpPullState,
    ]
  );

  const canInitiateJumpPull = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (view !== "day") return false;
    if (prefersReducedMotion) return false;
    if (pinchActiveRef.current) return false;
    if (manualPlacementSessionRef.current) return false;
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    return scrollY <= 2;
  }, [view, prefersReducedMotion]);

  const navLock = useRef(false);
  const loadReqIdRef = useRef(0);
  const loadInstancesRef = useRef<() => Promise<void>>(async () => {});
  const refreshScheduleData = useCallback(async () => {
    await loadInstancesRef.current();
  }, []);

  const snapToFiveMinuteGrid = useCallback((date: Date) => {
    const intervalMs = 5 * 60 * 1000;
    const timestamp = date.getTime();
    const snapped = Math.round(timestamp / intervalMs) * intervalMs;
    return new Date(snapped);
  }, []);

  const applyOptimisticManualPlacement = useCallback(
    (
      candidate: ManualPlacementCandidate,
      snappedStart: Date
    ): OptimisticManualPlacement | null => {
      if (!userId) return null;
      const snappedEnd = new Date(
        snappedStart.getTime() + candidate.durationMinutes * 60_000
      );
      const startUtc = snappedStart.toISOString();
      const endUtc = snappedEnd.toISOString();
      const nowIso = new Date().toISOString();
      const tempId = candidate.instanceId
        ? null
        : `manual-placement-optimistic-${nowIso}-${Math.random()
            .toString(36)
            .slice(2)}`;
      const previousInstances = instances;
      const previousAllInstances = allInstances;

      const updateExisting = (list: ScheduleInstance[]) =>
        list.map((instance) =>
          candidate.instanceId && instance.id === candidate.instanceId
            ? {
                ...instance,
                start_utc: startUtc,
                end_utc: endUtc,
                duration_min: candidate.durationMinutes,
                status: instance.status ?? "scheduled",
                locked: true,
                placement_source: "manual",
                window_id: null,
                day_type_time_block_id: null,
                time_block_id: null,
                overlay_window_id: null,
              }
            : instance
        );

      const appendCreated = (list: ScheduleInstance[]) => {
        if (!tempId || !candidate.sourceType || !candidate.sourceId) {
          return list;
        }
        if (list.some((instance) => instance.id === tempId)) return list;
        const optimisticInstance = {
          id: tempId,
          user_id: userId,
          source_type: candidate.sourceType,
          source_id: candidate.sourceId,
          start_utc: startUtc,
          end_utc: endUtc,
          duration_min: candidate.durationMinutes,
          status: "scheduled",
          weight_snapshot: 0,
          energy_resolved: candidate.energy ?? "NO",
          event_name: candidate.title ?? null,
          locked: true,
          placement_source: "manual",
          window_id: null,
          day_type_time_block_id: null,
          time_block_id: null,
          overlay_window_id: null,
          practice_context_monument_id: null,
          metadata: null,
          canceled_reason: null,
          completed_at: null,
          updated_at: nowIso,
        } as ScheduleInstance;
        return [...list, optimisticInstance];
      };

      setInstances(
        candidate.instanceId
          ? updateExisting(previousInstances)
          : appendCreated(previousInstances)
      );
      setAllInstances(
        candidate.instanceId
          ? updateExisting(previousAllInstances)
          : appendCreated(previousAllInstances)
      );

      return {
        tempId,
        previousInstances,
        previousAllInstances,
      };
    },
    [allInstances, instances, userId]
  );

  const reconcileOptimisticManualPlacement = useCallback(
    (optimistic: OptimisticManualPlacement | null, serverId: string | null) => {
      if (!optimistic?.tempId || !serverId) return;
      const replaceTempId = (list: ScheduleInstance[]) => {
        const hasServerInstance = list.some(
          (instance) => instance.id === serverId
        );
        if (hasServerInstance) {
          return list.filter((instance) => instance.id !== optimistic.tempId);
        }
        return list
          .map((instance) =>
            instance.id === optimistic.tempId
              ? { ...instance, id: serverId }
              : instance
          );
      };
      setInstances(replaceTempId);
      setAllInstances(replaceTempId);
    },
    []
  );

  const rollbackOptimisticManualPlacement = useCallback(
    (optimistic: OptimisticManualPlacement | null) => {
      if (!optimistic) return;
      setInstances(optimistic.previousInstances);
      setAllInstances(optimistic.previousAllInstances);
    },
    []
  );

  const commitManualPlacement = useCallback(
    async (candidate: ManualPlacementCandidate, previewStart: Date) => {
      const snappedStart = snapToFiveMinuteGrid(previewStart);
      const startUtc = snappedStart.toISOString();
      const optimistic = applyOptimisticManualPlacement(candidate, snappedStart);
      try {
        const response = candidate.instanceId
          ? await fetch(`/api/schedule/instances/${candidate.instanceId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                startUtc,
                skipConflictResolution: true,
              }),
            })
          : await fetch("/api/schedule/instances", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                sourceType: candidate.sourceType,
                sourceId: candidate.sourceId,
                startUtc,
                durationMin: candidate.durationMinutes,
                energyResolved: candidate.energy,
                eventName: candidate.title,
              }),
            });
        if (!response.ok) {
          const message = await readScheduleApiError(response);
          console.error("Manual placement update failed", {
            responseStatus: response.status,
            message,
          });
          throw new Error(message);
        }
        const successPayload = (await response.json().catch(() => null)) as
          | {
              success?: boolean;
              startUtc?: string;
              instance?: { id?: string | null } | null;
              displacedProjectWarnings?: Array<unknown>;
            }
          | null;
        const serverInstanceId =
          typeof successPayload?.instance?.id === "string" &&
          successPayload.instance.id.trim().length > 0
            ? successPayload.instance.id.trim()
            : null;
        reconcileOptimisticManualPlacement(optimistic, serverInstanceId);
        setManualPlacementSession(null);
        manualPlacementSessionRef.current = null;
        manualPlacementPointerIdRef.current = null;
        toast.success("Event placed", "Manual placement committed.");
        if (
          Array.isArray(successPayload?.displacedProjectWarnings) &&
          successPayload.displacedProjectWarnings.length > 0
        ) {
          toast.warning(
            "Some projects could not be re-placed",
            "One or more displaced projects could not be legally re-placed."
          );
        }
        await refreshScheduleData();
      } catch (error) {
        console.error("Manual placement failed", error);
        rollbackOptimisticManualPlacement(optimistic);
        toast.error(
          "Manual placement failed",
          error instanceof Error ? error.message : "Please try again or pick another time."
        );
      }
    },
    [
      applyOptimisticManualPlacement,
      reconcileOptimisticManualPlacement,
      refreshScheduleData,
      rollbackOptimisticManualPlacement,
      snapToFiveMinuteGrid,
      toast,
    ]
  );

  useEffect(() => {
    const handleManualPlacementRequest = (event: Event) => {
      const detail = (event as CustomEvent<ManualPlacementRequestDetail>).detail;
      const result = detail?.result;
      const sourceType = normalizeManualPlacementSourceType(result?.type);
      const sourceId =
        typeof result?.id === "string" && result.id.trim().length > 0
          ? result.id.trim()
          : null;
      const instanceId =
        typeof result?.scheduleInstanceId === "string" &&
        result.scheduleInstanceId.trim().length > 0
          ? result.scheduleInstanceId.trim()
          : null;
      if (!result || (!instanceId && (!sourceType || !sourceId))) {
        toast.error(
          "Manual placement unavailable",
          "No schedulable Event source was provided."
        );
        return;
      }
      const safeDuration =
        typeof result.durationMinutes === "number" &&
        Number.isFinite(result.durationMinutes) &&
        result.durationMinutes > 0
          ? result.durationMinutes
          : 60;

      const nextStart = (() => {
        if (result.nextScheduledAt) {
          const parsed = new Date(result.nextScheduledAt);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return new Date();
      })();

      const pointer = detail?.pointer;
      const initialX =
        typeof pointer?.clientX === "number"
          ? pointer.clientX
          : window.innerWidth / 2;
      const initialY =
        typeof pointer?.clientY === "number"
          ? pointer.clientY
          : window.innerHeight / 2;
      const pointerId =
        typeof pointer?.pointerId === "number" ? pointer.pointerId : null;
      manualPlacementPointerIdRef.current = pointerId;
      const initialWidth =
        typeof pointer?.width === "number" &&
        Number.isFinite(pointer.width) &&
        pointer.width > 0
          ? pointer.width
          : Math.min(320, Math.max(240, window.innerWidth - 48));

      const candidate: ManualPlacementCandidate = {
        instanceId,
        sourceId,
        durationMinutes: safeDuration,
        title: result.name ?? null,
        sourceType,
        energy:
          typeof result.energy === "string" ? result.energy : null,
        goalName:
          typeof result.goalName === "string" ? result.goalName : null,
        habitType: readManualPlacementHabitType(result),
        currentStreakDays:
          typeof result.currentStreakDays === "number" &&
          Number.isFinite(result.currentStreakDays)
            ? result.currentStreakDays
            : null,
        globalRank:
          typeof result.global_rank === "number" &&
          Number.isFinite(result.global_rank)
            ? result.global_rank
            : null,
      };
      const snappedPreview = snapToFiveMinuteGrid(nextStart);
      const session = {
        candidate,
        pointerId,
        ghost: {
          x: initialX,
          y: initialY,
          label: result.name ?? "Manual placement",
          mode: "pickup" as const,
          pointerId,
          width: initialWidth,
        },
        previewTime: snappedPreview,
        pushPreview: computeManualPlacementPushPreview(
          candidate,
          snappedPreview,
          currentDayProjectInstancesRef.current
        ),
      };
      setManualPlacementSession(session);
      manualPlacementSessionRef.current = session;
      setSkipNextDayAnimation(true);
      navigate("day");
    };

    window.addEventListener(
      "schedule:manual-placement-requested",
      handleManualPlacementRequest as EventListener
    );
    return () => {
      window.removeEventListener(
        "schedule:manual-placement-requested",
        handleManualPlacementRequest as EventListener
      );
    };
  }, [navigate, snapToFiveMinuteGrid, toast]);
  const scheduleDatasetRef = useRef<ScheduleEventDataset | null>(null);
  const PRIMARY_WRITE_WINDOW_DAYS = 28;
  const FULL_WRITE_WINDOW_DAYS = MAX_SCHEDULER_WRITE_DAYS;
  const isSchedulingRef = useRef(false);
  const isManualSchedulingRef = useRef(false);
  const externalSchedulingRunsRef = useRef(0);
  const syncSchedulingState = useCallback(() => {
    const running =
      isManualSchedulingRef.current || externalSchedulingRunsRef.current > 0;
    isSchedulingRef.current = running;
    setIsScheduling(running);
  }, []);

  const persistAutoRunDate = useCallback(
    (dateKey: string) => {
      if (!userId) return;
      if (typeof window === "undefined") return;
      const storageKey = `schedule:lastAutoRun:${userId}`;
      try {
        window.localStorage.setItem(storageKey, dateKey);
      } catch (error) {
        console.warn("Failed to store schedule auto-run timestamp", error);
      }
    },
    [userId]
  );

  const readLastAutoRunDate = useCallback((): string | null => {
    if (!userId) return null;
    if (typeof window === "undefined") return null;
    const storageKey = `schedule:lastAutoRun:${userId}`;
    try {
      return window.localStorage.getItem(storageKey);
    } catch (error) {
      console.warn("Failed to read schedule auto-run timestamp", error);
      return null;
    }
  }, [userId]);

  const determineDensity = useCallback((viewportHeight?: number | null) => {
    const height =
      typeof viewportHeight === "number" && Number.isFinite(viewportHeight)
        ? viewportHeight
        : null;
    if (!height) return 2;
    if (height <= 640) return 1.25;
    if (height <= 780) return 1.4;
    if (height <= 920) return 1.55;
    return 2;
  }, []);

  const applyDensity = useCallback((next: number) => {
    setPxPerMin((prev) => {
      const prevBase = basePxPerMinRef.current;
      const prevZoom = prevBase > 0 ? prev / prevBase : 1;
      basePxPerMinRef.current = next;
      const nextValue = snapPxPerMin(next * prevZoom);
      return Math.abs(prev - nextValue) < 0.001 ? prev : nextValue;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;

    const recompute = () => {
      if (!zoomLayoutSyncReadyRef.current) return;
      if (pinchActiveRef.current) return;
      const visualViewport = window.visualViewport;
      const activeElement = document.activeElement;
      const isTimelineNexusFocused =
        activeElement instanceof Element &&
        Boolean(
          activeElement.closest('[data-fab-timeline-nexus="true"]'),
        );
      const isKeyboardLikeViewportShrink =
        typeof visualViewport?.height === "number" &&
        window.innerHeight - visualViewport.height >= 80;
      if (isTimelineNexusFocused && isKeyboardLikeViewportShrink) return;
      const viewportHeight =
        visualViewport?.height ?? window.innerHeight;
      const density = determineDensity(viewportHeight);
      applyDensity(density);
    };

    const readyFrame = window.requestAnimationFrame(() => {
      zoomLayoutSyncReadyRef.current = true;
    });

    window.addEventListener("resize", recompute);
    window.addEventListener("orientationchange", recompute);
    viewport?.addEventListener("resize", recompute);

    return () => {
      window.cancelAnimationFrame(readyFrame);
      window.removeEventListener("resize", recompute);
      window.removeEventListener("orientationchange", recompute);
      viewport?.removeEventListener("resize", recompute);
      zoomLayoutSyncReadyRef.current = false;
    };
  }, [determineDensity, applyDensity]);

  const startHour = 0;
  const year = currentDate.getFullYear();

  const refreshScheduledProjectIds = useCallback(async () => {
    if (!userId) return;
    const ids = await fetchScheduledProjectIds(userId);
    setScheduledProjectIds(new Set(ids));
  }, [userId]);

  useEffect(() => {
    setSchedulerDebug(null);
    setHasAutoRunToday(null);
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    if (!Number.isNaN(currentDate.getTime())) {
      const tz = stableTimeZone ?? effectiveTimeZone ?? "UTC";
      params.set("date", formatScheduleDateKey(currentDate, tz));
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    view,
    currentDate,
    router,
    pathname,
    stableTimeZone,
    effectiveTimeZone,
  ]);

  useEffect(() => {
    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (prevUserId && !userId) {
      clearScheduleData();
      setMetaStatus("idle");
      setInstancesStatus("idle");
      loadInstancesRef.current = async () => {};
      return;
    }

    if (!userId) {
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let active = true;

    const applyDataset = (payload: ScheduleEventDataset) => {
      updateScheduleEnergyLookup(payload.energyLookup);
      setTasks(payload.tasks);
      setPendingBacklogTaskIds(new Set());
      backlogTaskPreviousStageRef.current = new Map();
      setProjects(payload.projects);
      setSkills(payload.skills);
      setMonuments(payload.monuments);
      setProjectSkillIds(payload.projectSkillIds);
      setProjectGoalRelations(payload.projectGoalRelations);
      setHabits(payload.habits);
      setSyncPairings(payload.syncPairings ?? {});
      const nextInstances = payload.instances ?? [];
      const notificationInstances = buildScheduleBlockNotificationInstances(
        nextInstances,
        payload
      );
      syncScheduleBlockLocalNotificationsForDataset({
        payload,
        windowsSnapshot: windowsRef.current,
        date: currentDateRef.current,
        timeZone: effectiveTimeZone ?? localTimeZone ?? null,
        source: "dataset",
      });
      void syncScheduleWidgetPayload(notificationInstances, {
        timeZone: effectiveTimeZone ?? localTimeZone ?? null,
        date: new Date(),
      })
        .then((result) => {
          if (process.env.NODE_ENV !== "production") {
            console.info("[schedule.widget.sync]", {
              inputInstances: nextInstances.length,
              result,
            });
          }
        })
        .catch((error) => {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[schedule.widget.sync_failed]", error);
          }
        });
      setAllInstances(nextInstances);
      setInstances(nextInstances);
      nextInstances.forEach((instance) => {
        if (!instance?.id) return;
        logInstanceStatusChange("REFRESH_LOAD", instance.id, instance.status);
      });
      setScheduledProjectIds(new Set(payload.scheduledProjectIds));
    };

    const load = async () => {
      const localRunId = runIdRef.current;
      const reqId = ++loadReqIdRef.current;
      if (!active) return;
      setMetaStatus("loading");
      setInstancesStatus("loading");
      try {
        const params = new URLSearchParams();
        params.set("lookaheadDays", String(FULL_WRITE_WINDOW_DAYS));
        params.set("timeZone", effectiveTimeZone || "UTC");
        const response = await fetch(
          `/api/schedule/events?${params.toString()}`,
          {
            cache: "no-store",
          }
        );
        if (reqId !== loadReqIdRef.current) return; // stale response, ignore
        if (!active) return;
        if (!response.ok) {
          throw new Error(`Failed to load schedule data (${response.status})`);
        }
        const payload = (await response.json()) as ScheduleEventDataset;
        if (reqId !== loadReqIdRef.current) return; // stale response, ignore
        if (!active) return;
        if (localRunId !== runIdRef.current) return; // stale scheduler run
        scheduleDatasetRef.current = payload;
        applyDataset(payload);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load schedule dataset", error);
        scheduleDatasetRef.current = null;
        clearScheduleData();
      } finally {
        if (!active) return;
        setMetaStatus("loaded");
        setInstancesStatus("loaded");
      }
    };

    loadInstancesRef.current = load;
    void load();

    return () => {
      active = false;
    };
  }, [
    userId,
    effectiveTimeZone,
    localTimeZone,
    clearScheduleData,
    FULL_WRITE_WINDOW_DAYS,
    logInstanceStatusChange,
  ]);

  useEffect(() => {
    if (!userId) return;
    const payload = scheduleDatasetRef.current;
    if (!payload || windows.length === 0) return;

    syncScheduleBlockLocalNotificationsForDataset({
      payload,
      windowsSnapshot: windows,
      date: currentDate,
      timeZone: effectiveTimeZone ?? localTimeZone ?? null,
      source: "windows",
    });
  }, [userId, windows, currentDate, effectiveTimeZone, localTimeZone]);

  const refreshDayTypeWindows = useCallback(async () => {
    if (!userId) {
      setWindows([]);
      return;
    }
    const tz = localTimeZone ?? effectiveTimeZone ?? "UTC";
    const dayKey = formatScheduleDateKey(currentDate, tz);
    const params = new URLSearchParams();
    params.set("dayKey", dayKey);
    params.set("timeZone", tz);

    try {
      const response = await fetch(`/api/windows/for-date?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch windows (${response.status})`);
      }
      const payload = await response.json();
      if (payload?.windows) {
        setWindows(payload.windows);
      }
    } catch (error) {
      console.error("Failed to fetch day-type-aware windows", error);
      setWindows([]);
    }
  }, [
    userId,
    currentDate,
    localTimeZone,
    effectiveTimeZone,
  ]);

  useEffect(() => {
    void refreshDayTypeWindows();
  }, [refreshDayTypeWindows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      void refreshDayTypeWindows();
    };
    window.addEventListener(DAY_TYPE_BLOCK_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(DAY_TYPE_BLOCK_UPDATED_EVENT, handler);
    };
  }, [refreshDayTypeWindows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userId) {
      setOverlayWindows([]);
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setOverlayWindows([]);
      return;
    }

    const tz = effectiveTimeZone || "UTC";
    const renderDayStart = getRenderDayStart(currentDate, tz);
    const renderDayEnd = addDaysInTimeZone(renderDayStart, 1, tz);
    const dayStartIso = renderDayStart.toISOString();
    const dayEndIso = renderDayEnd.toISOString();
    let active = true;

    async function fetchOverlayWindows() {
      try {
        const { data, error } = await supabase
          .from("overlay_windows" as never)
          .select("id,created_at,updated_at,start_utc,end_utc,label,mode")
          .eq("user_id", userId)
          .lt("start_utc", dayEndIso)
          .gt("end_utc", dayStartIso)
          .order("start_utc", { ascending: true });
        if (!active) return;
        if (error) {
          console.error("Failed to load overlay windows", error);
          setOverlayWindows([]);
          return;
        }
        setOverlayWindows(data ?? []);
      } catch (fetchError) {
        if (!active) return;
        console.error("Failed to load overlay windows", fetchError);
        setOverlayWindows([]);
      }
    }

    const refreshHandler = () => {
      void fetchOverlayWindows();
    };
    window.addEventListener("schedule:overlay-windows-updated", refreshHandler);
    void fetchOverlayWindows();

    return () => {
      active = false;
      window.removeEventListener(
        "schedule:overlay-windows-updated",
        refreshHandler
      );
    };
  }, [userId, currentDate, effectiveTimeZone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (overlayWindows.length === 0) return;
    setOverlayVisibilityNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setOverlayVisibilityNowMs(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [overlayWindows.length]);

  useEffect(() => {
    if (!userId) {
      setCommandBlocks([]);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      start: renderDayStart.toISOString(),
      end: renderDayEnd.toISOString(),
      timezone: resolvedScheduleTimeZone,
    });

    async function fetchCommandBlocks() {
      try {
        const response = await fetch(`/api/command-blocks?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });

        if (!active) return;

        if (!response.ok) {
          console.error("Failed to load command blocks", response.status);
          setCommandBlocks([]);
          return;
        }

        const payload = (await response.json()) as {
          commandBlocks?: CommandBlockRecord[];
          commandBlockRuleOccurrences?: CommandBlockRecord[];
        };
        setCommandBlocks([
          ...(payload.commandBlockRuleOccurrences ?? []),
          ...(payload.commandBlocks ?? []),
        ]);
      } catch (fetchError) {
        if (!active || controller.signal.aborted) return;
        console.error("Failed to load command blocks", fetchError);
        setCommandBlocks([]);
      }
    }

    void fetchCommandBlocks();

    return () => {
      active = false;
      controller.abort();
    };
  }, [userId, renderDayStart, renderDayEnd, resolvedScheduleTimeZone]);

  useEffect(() => {
    if (!userId) {
      setJumpToDateSnapshot(null);
      return;
    }
    let isCancelled = false;
    const tz = effectiveTimeZone || "UTC";
    const baseDate = currentDate;
    if (!baseDate || Number.isNaN(baseDate.getTime())) {
      setJumpToDateSnapshot(null);
      return;
    }

    const baseDayStart = startOfDayInTimeZone(baseDate, tz);
    const todayStart = getSchedulerDayAnchorForNow(new Date(), tz);
    const weekStart = addDaysInTimeZone(
      baseDayStart,
      -weekdayInTimeZone(baseDayStart, tz),
      tz
    );
    const weekEnd = addDaysInTimeZone(weekStart, 7, tz);
    const dayParts = getDatePartsInTimeZone(baseDayStart, tz);
    const monthAnchor = makeDateInTimeZone(
      {
        year: dayParts.year,
        month: dayParts.month,
        day: 1,
        hour: 12,
        minute: 0,
      },
      tz
    );
    const monthStart = startOfDayInTimeZone(monthAnchor, tz);
    const daysInMonth = new Date(
      Date.UTC(dayParts.year, dayParts.month, 0)
    ).getUTCDate();
    const monthEnd = addDaysInTimeZone(monthStart, daysInMonth, tz);

    const weekDays = Array.from({ length: 7 }, (_, index) =>
      addDaysInTimeZone(weekStart, index, tz)
    );
    const monthDays = Array.from({ length: daysInMonth }, (_, index) =>
      addDaysInTimeZone(monthStart, index, tz)
    );
    const fallbackTotals = () => ({ ...EMPTY_ENERGY_TOTALS });

    const loadSnapshot = async () => {
      let dayTotals = fallbackTotals();
      let weekTotals = fallbackTotals();
      let monthTotals = fallbackTotals();

      try {
        const [today, week, month] = await Promise.all([
          computeEnergyHoursForDateRange([todayStart], userId),
          computeEnergyHoursForDateRange(weekDays, userId),
          computeEnergyHoursForDateRange(monthDays, userId),
        ]);
        dayTotals = today ?? fallbackTotals();
        weekTotals = week ?? fallbackTotals();
        monthTotals = month ?? fallbackTotals();
      } catch (error) {
        console.warn(
          "[JumpToDateSnapshot] Failed to compute energy hours",
          error
        );
      }

      let weekGoals: number | undefined;
      let monthGoals: number | undefined;
      let weekLikelyGoals: Array<{
        id: string;
        title: string;
        emoji?: string;
        completionUtc?: string | null;
      }> = [];
      let monthLikelyGoals: Array<{
        id: string;
        title: string;
        emoji?: string;
        completionUtc?: string | null;
      }> = [];
      try {
        const {
          weekGoalIds,
          monthGoalIds,
          weekLikelyGoals: weekComputed,
          monthLikelyGoals: monthComputed,
        } = await computeProjectedGoalsLikely(
          weekStart,
          weekEnd,
          monthStart,
          monthEnd,
          userId
        );
        weekGoals = weekGoalIds.size;
        monthGoals = monthGoalIds.size;
        const resolveGoal = (entry: {
          id: string;
          completionUtc?: string | null;
        }) => {
          const { id, completionUtc } = entry;
          const meta = goalMetaById.get(id);
          return {
            id,
            title: meta?.title ?? "Goal",
            emoji: meta?.emoji ?? "🎯",
            completionUtc: completionUtc ?? null,
          };
        };
        weekLikelyGoals = weekComputed.map(resolveGoal);
        monthLikelyGoals = monthComputed.map(resolveGoal);
      } catch (error) {
        console.warn(
          "[JumpToDateSnapshot] Failed to compute projected goals",
          error
        );
      }

      if (isCancelled) return;
      setJumpToDateSnapshot({
        energyHours: {
          day: { ...dayTotals },
          week: { ...weekTotals },
          month: { ...monthTotals },
        },
        projected: {
          weekGoalsCompleted: weekGoals,
          monthGoalsCompleted: monthGoals,
          weekLikelyGoals,
          monthLikelyGoals,
        },
      });
    };

    void loadSnapshot();

    return () => {
      isCancelled = true;
    };
  }, [userId, currentDate, effectiveTimeZone, goalMetaById]);

  const habitMap = useMemo(() => {
    const map: Record<string, HabitScheduleItem> = {};
    for (const habit of habits) map[habit.id] = habit;
    return map;
  }, [habits]);

  const filterInstancesForDate = useCallback(
    (date: Date, timeZone: string) => {
    if (allInstances.length === 0) {
      return [];
    }
    const renderDayStart = getRenderDayStart(date, timeZone);
    const renderDayEnd = addDaysInTimeZone(renderDayStart, 1, timeZone);
    const startMs = renderDayStart.getTime();
    const endMs = renderDayEnd.getTime();
      let filtered = allInstances.filter((instance) => {
        const start = new Date(instance.start_utc ?? "").getTime();
        const end = new Date(instance.end_utc ?? "").getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return false;
        }
        return end > startMs && start < endMs;
      });
      filtered = filtered.filter(
        (instance) => instance.status !== "missed" && instance.status !== "canceled"
      );

      // Filter out completed instances that overlap with scheduled instances
      const scheduledInstances = filtered.filter(
        (instance) => instance.status === "scheduled"
      );
      const scheduledWithTimes = scheduledInstances.map((instance) => ({
        instance,
        startMs: new Date(instance.start_utc ?? "").getTime(),
        endMs: new Date(instance.end_utc ?? "").getTime(),
      }));

      const instanceById = new Map(
        allInstances.map((candidate) => [candidate.id, candidate])
      );
      const pairedPartnerInstanceIds = new Set<string>();
      const pairedPartnerSourceKeys = new Set<string>();
      const pairedPartnerWindowsBySourceKey = new Map<
        string,
        Array<{ startMs: number; endMs: number }>
      >();
      for (const visibleInstance of filtered) {
        if (visibleInstance.source_type !== "HABIT") continue;
        const habit = habitMap[visibleInstance.source_id];
        if (!habit || normalizeHabitType(habit.habitType) !== "SYNC") continue;

        const syncStartMs = new Date(
          visibleInstance.start_utc ?? ""
        ).getTime();
        const syncEndMs = new Date(visibleInstance.end_utc ?? "").getTime();

        for (const partnerId of syncPairings[visibleInstance.id] ?? []) {
          const partner =
            instanceById.get(partnerId) ??
            filtered.find((candidate) => candidate.id === partnerId);
          if (!partner) continue;

          pairedPartnerInstanceIds.add(partner.id);
          const sourceKey = `${partner.source_type}:${partner.source_id}`;
          pairedPartnerSourceKeys.add(sourceKey);

          const windows = pairedPartnerWindowsBySourceKey.get(sourceKey) ?? [];
          if (Number.isFinite(syncStartMs) && Number.isFinite(syncEndMs)) {
            windows.push({ startMs: syncStartMs, endMs: syncEndMs });
          }

          const partnerStartMs = new Date(partner.start_utc ?? "").getTime();
          const partnerEndMs = new Date(partner.end_utc ?? "").getTime();
          if (Number.isFinite(partnerStartMs) && Number.isFinite(partnerEndMs)) {
            windows.push({ startMs: partnerStartMs, endMs: partnerEndMs });
          }

          if (windows.length > 0) {
            pairedPartnerWindowsBySourceKey.set(sourceKey, windows);
          }
        }
      }

      const completedIdsToHide = new Set<string>();

      // Check each completed instance against all scheduled instances
      for (const instance of filtered) {
        if (instance.status !== "completed") continue;

        const completedStart = new Date(instance.start_utc ?? "").getTime();
        const completedEnd = new Date(instance.end_utc ?? "").getTime();

        if (!Number.isFinite(completedStart) || !Number.isFinite(completedEnd))
          continue;

        // Skip hiding completed SYNC habit instances - they represent aggregated activity
        // and should remain visible even when overlapping with scheduled instances
        if (instance.source_type === "HABIT") {
          const habit = habitMap[instance.source_id];
          if (habit && normalizeHabitType(habit.habitType) === "SYNC") {
            continue;
          }
        }

        const completedSourceKey = `${instance.source_type}:${instance.source_id}`;
        const pairedById = pairedPartnerInstanceIds.has(instance.id);
        const pairedBySource = pairedPartnerSourceKeys.has(completedSourceKey);
        const pairedWindows =
          pairedPartnerWindowsBySourceKey.get(completedSourceKey) ?? [];
        const overlapsPairedWindow = pairedWindows.some(
          (window) =>
            completedEnd > window.startMs && completedStart < window.endMs
        );

        if (pairedById || (pairedBySource && overlapsPairedWindow)) continue;

        // Check if this completed instance overlaps with any scheduled instance
        for (const scheduled of scheduledWithTimes) {
          if (
            completedEnd > scheduled.startMs &&
            completedStart < scheduled.endMs
          ) {
            // Overlap detected - hide this completed instance
            completedIdsToHide.add(instance.id);
            break; // No need to check other scheduled instances
          }
        }
      }

      // Filter out the overlapping completed instances
      filtered = filtered.filter(
        (instance) => !completedIdsToHide.has(instance.id)
      );

      if (DEBUG_DAY_SHIFT) {
        const earlyInstance = filtered.find((entry) => {
          if (!entry?.start_utc) return false;
          const localStart = toZonedTime(new Date(entry.start_utc), timeZone);
          return localStart.getHours() < 4;
        });
        if (earlyInstance) {
          const localStart = toZonedTime(
            new Date(earlyInstance.start_utc),
            timeZone
          );

          console.group("DAY SHIFT TRACE");
          console.log("viewedDate:", date);
          console.log("timeZone:", timeZone);
          console.log("renderDayStart:", renderDayStart);
          console.log("renderDayEnd:", renderDayEnd);
          console.log("instance overlap before 4am local:", {
            id: earlyInstance.id,
            source_type: earlyInstance.source_type,
            start_utc: earlyInstance.start_utc,
            end_utc: earlyInstance.end_utc,
            localStartHour: localStart.getHours(),
          });
          console.groupEnd();
        }
      }
      return filtered;
    },
    [allInstances, habitMap, syncPairings]
  );

  const visibleInstances = useMemo(() => {
    if (!userId) return [];
    return filterInstancesForDate(currentDate, effectiveTimeZone);
  }, [
    userId,
    currentDate,
    effectiveTimeZone,
    filterInstancesForDate,
    allInstances,
    refreshScheduledProjectIds,
    localTimeZone,
    resolvedModePayload,
    loadInstancesRef,
  ]);

  useEffect(() => {
    const habitInstanceSnapshot = instances
      .filter((inst) => inst?.source_type === "HABIT")
      .map((inst) => ({
        id: inst.id,
        status: inst.status,
        completed_at: inst.completed_at,
        start_utc: inst.start_utc,
        end_utc: inst.end_utc,
      }));
    console.log("[HABIT_COMPLETION][EFFECT] run", {
      timestamp: new Date().toISOString(),
      instanceCount: instances.length,
      effectiveTimeZone,
      habitInstanceSnapshot,
    });
    setHabitCompletionByDate((prev) => {
      console.log("[HABIT_COMPLETION][EFFECT] prevState", {
        keys: Object.keys(prev),
        snapshot: prev,
      });
      const next = mergeHabitCompletionStateFromInstances(
        prev,
        instances,
        effectiveTimeZone
      );
      if (next === prev) {
        console.log("[HABIT_COMPLETION][EFFECT] no change", {
          keys: Object.keys(prev),
        });
      } else {
        console.log("[HABIT_COMPLETION][EFFECT] updated", {
          keys: Object.keys(next),
          snapshot: next,
        });
      }
      return next;
    });
  }, [instances, effectiveTimeZone]);
  const projectItems = useMemo(
    () => buildProjectItems(projects, tasks),
    [projects, tasks]
  );

  const taskMap = useMemo(() => {
    const map: Record<string, TaskLite> = {};
    for (const t of tasks) map[t.id] = t;
    return map;
  }, [tasks]);

  const skillMonumentMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const skill of skills) {
      map[skill.id] = skill.monument_id ?? null;
    }
    return map;
  }, [skills]);

  const practiceContextDisplayById = useMemo(() => {
    const map = new Map<string, string>();
    for (const monument of monuments) {
      if (!monument?.id) continue;
      const title = monument.title ?? "Practice context";
      const display = monument.emoji ? `${monument.emoji} ${title}` : title;
      map.set(monument.id, display);
    }
    return map;
  }, [monuments]);

  useEffect(() => {
    const snapshots = backlogTaskPreviousStageRef.current;
    for (const [taskId] of snapshots) {
      const task = taskMap[taskId];
      if (!task || task.stage !== "PERFECT") {
        snapshots.delete(taskId);
      }
    }
  }, [taskMap]);

  const tasksByProjectId = useMemo(() => {
    const map: Record<string, TaskLite[]> = {};
    for (const task of tasks) {
      const projectId = task.project_id;
      if (!projectId) continue;
      const existing = map[projectId];
      if (existing) {
        existing.push(task);
      } else {
        map[projectId] = [task];
      }
    }
    return map;
  }, [tasks]);

  const projectMap = useMemo(() => {
    const map: Record<string, (typeof projectItems)[number]> = {};
    for (const p of projectItems) map[p.id] = p;
    return map;
  }, [projectItems]);

  const editingEventTitle = useMemo(() => {
    if (!resolvedEditingInstance) return "Scheduled event";
    const sourceId = resolvedEditingInstance.source_id ?? "";
    if (resolvedEditingInstance.source_type === "TASK") {
      const task = taskMap[sourceId];
      if (task?.name?.trim()) {
        return task.name;
      }
      const parent =
        task?.project_id && projectMap[task.project_id]
          ? projectMap[task.project_id]
          : null;
      if (parent?.name?.trim()) {
        return parent.name;
      }
    } else if (resolvedEditingInstance.source_type === "PROJECT") {
      const project = projectMap[sourceId];
      if (project?.name?.trim()) {
        return project.name;
      }
    } else if (resolvedEditingInstance.source_type === "HABIT") {
      const habit = habitMap[sourceId];
      if (habit?.name?.trim()) {
        return habit.name;
      }
    }
    return sourceId || "Scheduled event";
  }, [resolvedEditingInstance, taskMap, projectMap, habitMap]);

  const editingProjectId =
    editingSnapshot?.source_type === "PROJECT"
      ? (editingSnapshot.projectId ?? null)
      : null;

  const editingHabitId =
    editingSnapshot?.source_type === "HABIT"
      ? (editingSnapshot.habitId ?? null)
      : null;

  const editingLayoutId = editingInstance?.id
    ? getScheduleInstanceLayoutId(editingInstance.id)
    : null;

  const fabEditTarget = useMemo(() => {
    const originRect = editingSnapshot?.originData
      ? {
          top: editingSnapshot.originData.y,
          left: editingSnapshot.originData.x,
          width: editingSnapshot.originData.width,
          height: editingSnapshot.originData.height,
        }
      : null;

    if (
      editingSnapshot?.source_type === "PROJECT" &&
      editingProjectId
    ) {
      const project = projectMap[editingProjectId] ?? null;
      return {
        entityType: "PROJECT" as const,
        entityId: editingProjectId,
        instanceId: editingInstance?.id ?? null,
        title: editingEventTitle ?? null,
        layoutId: editingLayoutId,
        originRect,
        stage: project?.stage ?? null,
      };
    }

    if (editingSnapshot?.source_type === "HABIT" && editingHabitId) {
      const habitSnapshot =
        editingSnapshot.habitSnapshot ??
        buildHabitEditSnapshot(habitMap[editingHabitId] ?? null);

      return {
        entityType: "HABIT" as const,
        entityId: editingHabitId,
        instanceId: editingInstance?.id ?? null,
        title: habitSnapshot?.name ?? editingEventTitle ?? null,
        layoutId: editingLayoutId,
        originRect,
        habitSnapshot,
      };
    }

    return null;
  }, [
    editingEventTitle,
    editingHabitId,
    editingInstance?.id,
    editingLayoutId,
    editingProjectId,
    editingSnapshot?.source_type,
    editingSnapshot?.originData,
    editingSnapshot?.habitSnapshot,
    habitMap,
    projectMap,
  ]);

  const isProjectEditing =
    editingSnapshot?.source_type === "PROJECT" &&
    Boolean(editingSnapshot.projectId);

  const isHabitEditing =
    editingSnapshot?.source_type === "HABIT" &&
    Boolean(editingSnapshot.habitId);

  const previousSnapshotRef = useRef<EditingSnapshot | null>(null);
  useEffect(() => {
    if (previousSnapshotRef.current !== editingSnapshot) {
      console.log("[ScheduleEdit] editingSnapshot changed", {
        prev: describeEditingSnapshot(previousSnapshotRef.current),
        next: describeEditingSnapshot(editingSnapshot),
        timestamp: scheduleEditNow(),
      });
      previousSnapshotRef.current = editingSnapshot;
    }
  }, [editingSnapshot]);

  const previousProjectEditingRef = useRef<boolean>(isProjectEditing);
  useEffect(() => {
    if (previousProjectEditingRef.current !== isProjectEditing) {
      console.log("[ScheduleEdit] isProjectEditing changed", {
        prev: previousProjectEditingRef.current,
        next: isProjectEditing,
        snapshot: describeEditingSnapshot(editingSnapshot),
        timestamp: scheduleEditNow(),
      });
      previousProjectEditingRef.current = isProjectEditing;
    }
  }, [isProjectEditing, editingSnapshot]);

  const previousHabitEditingRef = useRef<boolean>(isHabitEditing);
  useEffect(() => {
    if (previousHabitEditingRef.current !== isHabitEditing) {
      console.log("[ScheduleEdit] isHabitEditing changed", {
        prev: previousHabitEditingRef.current,
        next: isHabitEditing,
        snapshot: describeEditingSnapshot(editingSnapshot),
        timestamp: scheduleEditNow(),
      });
      previousHabitEditingRef.current = isHabitEditing;
    }
  }, [isHabitEditing, editingSnapshot]);

  const windowMap = useMemo(() => buildWindowMap(windows), [windows]);

  const projectInstances = useMemo(
    () => computeProjectInstances(instances, projectMap, windowMap),
    [instances, projectMap, windowMap]
  );

  const projectInstanceIds = useMemo(
    () => collectProjectInstanceIds(projectInstances),
    [projectInstances]
  );

  const unscheduledProjects = useMemo(() => {
    return projectItems.filter((project) => {
      if (scheduledProjectIds.has(project.id)) return false;
      return !projectInstanceIds.has(project.id);
    });
  }, [projectItems, projectInstanceIds, scheduledProjectIds]);

  const schedulerFailureByProjectId = useMemo(() => {
    if (!schedulerDebug) return {};
    return schedulerDebug.failures.reduce<
      Record<string, SchedulerRunFailure[]>
    >((acc, failure) => {
      const id = failure.itemId;
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(failure);
      return acc;
    }, {});
  }, [schedulerDebug]);

  const schedulerTimelinePlacements = useMemo(() => {
    if (!schedulerDebug) return [] as SchedulerTimelinePlacement[];

    const placements: SchedulerTimelinePlacement[] = [];

    for (const entry of schedulerDebug.timeline) {
      if (!entry) continue;
      const start = new Date(entry.startUTC);
      const end = new Date(entry.endUTC);
      if (!isValidDate(start) || !isValidDate(end)) continue;
      if (entry.type === "PROJECT") {
        const project = projectMap[entry.projectId];
        const durationMin =
          typeof entry.durationMin === "number" &&
          Number.isFinite(entry.durationMin)
            ? entry.durationMin
            : typeof project?.duration_min === "number" &&
                Number.isFinite(project.duration_min)
              ? project.duration_min
              : null;
        const energySource =
          typeof entry.energyResolved === "string" &&
          entry.energyResolved.trim().length > 0
            ? entry.energyResolved
            : (project?.energy ?? null);
        const energyLabel = normalizeEnergyLabel(energySource);

        placements.push({
          type: "PROJECT",
          projectId: entry.projectId,
          projectName: project?.name || "Untitled project",
          locked: entry.locked ?? false,
          start,
          end,
          startUtc: new Date(entry.startUTC),
          rawStart: entry.startUTC,
          rawEnd: entry.endUTC,
          durationMinutes: durationMin,
          energyLabel,
          decision: entry.decision,
        });
      } else if (entry.type === "HABIT") {
        const habit = habitMap[entry.habitId];
        const habitName = entry.habitName?.trim() || habit?.name || "Habit";
        const durationSource =
          typeof entry.durationMin === "number" &&
          Number.isFinite(entry.durationMin)
            ? entry.durationMin
            : typeof habit?.durationMinutes === "number" &&
                Number.isFinite(habit.durationMinutes)
              ? habit.durationMinutes
              : DEFAULT_HABIT_DURATION_MIN;
        const energySource =
          typeof entry.energyResolved === "string" &&
          entry.energyResolved.trim().length > 0
            ? entry.energyResolved
            : (habit?.window?.energy ?? null);
        const energyLabel = normalizeEnergyLabel(energySource);
        const habitTypeValue = (habit?.habitType ?? "HABIT").toUpperCase();
        const normalizedHabitType =
          habitTypeValue === "ASYNC" ? "SYNC" : habitTypeValue;
        let placementPracticeContextId = entry.practiceContextId ?? null;
        if (normalizedHabitType === "PRACTICE" && habit?.skillMonumentId) {
          placementPracticeContextId = habit.skillMonumentId;
        }

        placements.push({
          type: "HABIT",
          habitId: entry.habitId,
          habitName,
          start,
          end,
          startUtc: new Date(entry.startUTC),
          rawStart: entry.startUTC,
          rawEnd: entry.endUTC,
          durationMinutes: durationSource,
          energyLabel,
          decision: entry.decision,
          clipped: entry.clipped ?? false,
          practiceContextId: placementPracticeContextId,
        });
      }
    }

    return placements;
  }, [schedulerDebug, projectMap, habitMap]);

  useEffect(() => {
    if (!userId || view !== "day") {
      setPeekModels({});
      peekDataDepsRef.current = null;
      return;
    }

    const previousDeps = peekDataDepsRef.current;
    const shouldForceReload = Boolean(
      previousDeps &&
      (previousDeps.projectMap !== projectMap ||
        previousDeps.taskMap !== taskMap ||
        previousDeps.tasksByProjectId !== tasksByProjectId ||
        previousDeps.habits !== habits ||
        previousDeps.unscheduledProjects !== unscheduledProjects ||
        previousDeps.schedulerFailureByProjectId !==
          schedulerFailureByProjectId ||
        previousDeps.schedulerDebug !== schedulerDebug ||
        previousDeps.schedulerTimelinePlacements !==
          schedulerTimelinePlacements ||
        previousDeps.timeZoneShortName !== timeZoneShortName ||
        previousDeps.friendlyTimeZone !== friendlyTimeZone ||
        previousDeps.effectiveTimeZone !== effectiveTimeZone)
    );

    peekDataDepsRef.current = {
      projectMap,
      taskMap,
      tasksByProjectId,
      habits,
      unscheduledProjects,
      schedulerFailureByProjectId,
      schedulerDebug,
      schedulerTimelinePlacements,
      timeZoneShortName,
      friendlyTimeZone,
      effectiveTimeZone,
    };

    let cancelled = false;

    async function load(
      direction: "previous" | "next",
      date: Date,
      forceReload: boolean
    ) {
      const targetKey = formatScheduleDateKey(date, effectiveTimeZone);
      let shouldFetch = true;
      setPeekModels((prev) => {
        const prevModel = prev[direction];
        if (
          !forceReload &&
          prevModel &&
          prevModel.dayViewDateKey === targetKey
        ) {
          shouldFetch = false;
          return prev;
        }
        shouldFetch = true;
        return { ...prev, [direction]: null };
      });
      if (!shouldFetch) return;

      try {
        const dayWindows: RepoWindow[] = [];
        const instancesForDay = filterInstancesForDate(date, effectiveTimeZone);
        if (cancelled) {
          return;
        }
        const model = buildDayTimelineModel({
          date,
          windows: dayWindows,
          instances: instancesForDay,
          projectMap,
          taskMap,
          tasksByProjectId,
          habits,
          startHour,
          pxPerMin,
          unscheduledProjects,
          schedulerFailureByProjectId,
          schedulerDebug,
          schedulerTimelinePlacements,
          timeZoneShortName,
          friendlyTimeZone,
          localTimeZone: effectiveTimeZone,
          todayDateKey: canonicalTodayDateKey,
        });
        if (cancelled) return;
        if (model.dayViewDateKey !== targetKey) return;
        setPeekModels((prev) => ({ ...prev, [direction]: model }));
      } catch (error) {
        console.error("Failed to load adjacent day preview", error);
        if (cancelled) return;
        setPeekModels((prev) => ({ ...prev, [direction]: null }));
      }
    }

    void load("previous", previousDayDate, shouldForceReload);
    void load("next", nextDayDate, shouldForceReload);

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    view,
    previousDayDate,
    nextDayDate,
    effectiveTimeZone,
    projectMap,
    taskMap,
    tasksByProjectId,
    habits,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    filterInstancesForDate,
    timeZoneShortName,
    friendlyTimeZone,
    pxPerMin,
  ]);

  useEffect(() => {
    if (!userId || view !== "day") return;

    setPeekModels((prev) => {
      let changed = false;
      const nextState: typeof prev = { ...prev };
      for (const direction of ["previous", "next"] as const) {
        const entry = prev[direction];
        if (!entry) continue;
        const occupiedSegments = buildTimelineOccupiedSegments({
          projectInstances: entry.projectInstances,
          habitPlacements: entry.habitPlacements,
          standaloneTaskInstances: entry.standaloneTaskInstances,
          taskInstancesByProject: entry.taskInstancesByProject,
        });
        const timelineGaps = buildTimelineGaps({
          occupiedSegments,
          currentDate: entry.date,
          timeZone: effectiveTimeZone,
        });
        const windowReports = computeWindowReportsForDay({
          windows: entry.windows,
          projectInstances: entry.projectInstances,
          unscheduledProjects,
          schedulerFailureByProjectId,
          schedulerDebug,
          schedulerTimelinePlacements,
          habitPlacements: entry.habitPlacements,
          currentDate: entry.date,
          timeZone: effectiveTimeZone,
          gaps: timelineGaps,
        });
        nextState[direction] = {
          ...entry,
          startHour,
          windowReports,
        };
        changed = true;
      }
      return changed ? nextState : prev;
    });
  }, [
    pxPerMin,
    startHour,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    userId,
    view,
    effectiveTimeZone,
  ]);

  const instanceStatusById = useMemo(() => {
    const map: Record<string, ScheduleInstance["status"] | null> = {};
    for (const inst of instances) {
      map[inst.id] = inst.status ?? null;
    }
    return map;
  }, [instances]);

  useEffect(() => {
    const flipState = habitStatusFlipRef.current;
    const now = Date.now();
    for (const key of Array.from(flipState.keys())) {
      if (!(key in instanceStatusById)) {
        flipState.delete(key);
      }
    }
    for (const [instanceId, status] of Object.entries(instanceStatusById)) {
      const normalizedStatus =
        typeof status === "string" && status.length > 0 ? status : null;
      const prev = flipState.get(instanceId);
      if (prev?.lastStatus === normalizedStatus) {
        continue;
      }
      const flipCount =
        prev && now - prev.lastChange <= 300 ? prev.flipCount + 1 : 1;
      flipState.set(instanceId, {
        lastStatus: normalizedStatus,
        lastChange: now,
        flipCount,
      });
      if (flipCount > 1 && typeof window !== "undefined") {
        const detail = {
          metric: "schedule.card_flicker_detected",
          instanceId,
          lastStatus: prev?.lastStatus ?? null,
          nextStatus: normalizedStatus,
          timestamp: now,
        };
        window.dispatchEvent(new CustomEvent("schedule-telemetry", { detail }));
        console.warn("[schedule.card_flicker_detected]", detail);
      }
    }
  }, [instanceStatusById]);

  const buildXpAwardPayload = useCallback(
    (instance: ScheduleInstance) => {
      const collectSkillIds = (ids: (string | null | undefined)[]) =>
        Array.from(
          new Set(
            ids.filter(
              (id): id is string => typeof id === "string" && id.length > 0
            )
          )
        );

      if (instance.source_type === "TASK") {
        const task = taskMap[instance.source_id];
        if (!task) return null;
        const uniqueSkillIds = collectSkillIds([task.skill_id]);
        const monumentIds = uniqueSkillIds
          .map((id) => skillMonumentMap[id])
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0
          );
        return {
          kind: "task" as const,
          amount: 1,
          skillIds: uniqueSkillIds,
          monumentIds,
        };
      }

      if (instance.source_type === "PROJECT") {
        const linkedSkillIds = projectSkillIds[instance.source_id] ?? [];
        const taskDerivedSkillIds = (
          tasksByProjectId[instance.source_id] ?? []
        ).map((task) => task.skill_id);
        const uniqueSkillIds = collectSkillIds([
          ...linkedSkillIds,
          ...taskDerivedSkillIds,
        ]);
        const monumentIds = uniqueSkillIds
          .map((id) => skillMonumentMap[id])
          .filter(
            (id): id is string => typeof id === "string" && id.length > 0
          );
        return {
          kind: "project" as const,
          amount: 3,
          skillIds: uniqueSkillIds,
          monumentIds,
        };
      }

      if (instance.source_type === "HABIT") {
        const habit = habitMap[instance.source_id];
        const skillId = habit?.skillId ?? null;
        if (!skillId) return null;
        const monumentId = skillMonumentMap[skillId];
        const monumentIds =
          monumentId && monumentId.length > 0 ? [monumentId] : [];
        return {
          kind: "habit" as const,
          amount: 1,
          skillIds: [skillId],
          monumentIds,
        };
      }

      return null;
    },
    [habitMap, projectSkillIds, skillMonumentMap, taskMap, tasksByProjectId]
  );

  const computeTrimmedHabitTiming = useCallback(
    (instance: ScheduleInstance | undefined) => {
      if (!instance) return null;
      if (instance.source_type !== "HABIT") return null;
      const start = instance.start_utc ? new Date(instance.start_utc) : null;
      const end = instance.end_utc ? new Date(instance.end_utc) : null;
      if (!start || !end) return null;
      const startMs = start.getTime();
      const endMs = end.getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
      const nowMs = Date.now();
      if (nowMs <= startMs || nowMs >= endMs) return null;
      const trimmedDurationMin = Math.max(
        1,
        Math.round((nowMs - startMs) / 60000)
      );
      const completionIso = new Date(nowMs).toISOString();
      return {
        completionIso,
        endUTC: completionIso,
        durationMin: trimmedDurationMin,
      };
    },
    []
  );

  const handleToggleInstanceCompletion = useCallback(
    async (instanceId: string, nextStatus: "completed" | "scheduled") => {
      if (!userId) {
        console.warn("No authenticated user available for status update");
        return;
      }

      const instance = instancesById.get(instanceId);
      const isOverlayBacked = Boolean(instance?.overlay_window_id);
      const logOverlayStage = (
        stage: number,
        detail?: Record<string, unknown>
      ) => {
        if (!isOverlayBacked) return;
        console.log(`[OVERLAY_TOGGLE][stage${stage}]`, {
          instanceId,
          nextStatus,
          overlay_window_id: instance?.overlay_window_id ?? null,
          ...detail,
        });
      };
      logOverlayStage(2, { reason: "toggle invoked" });
      const isLockedInstance = instance?.locked === true;
      logOverlayStage(3, {
        locked: isLockedInstance,
      });
      const previousStatus = instance?.status ?? null;
      const pending = pendingInstanceStatuses.has(instanceId);
      logOverlayStage(4, { isPending: pending });
      const dayKey =
        instance?.start_utc && stableTimeZone
          ? formatLocalDateKey(new Date(instance.start_utc), stableTimeZone)
          : canonicalTodayDateKey;
      if (pending) {
        logOverlayStage(4, { reason: "pending block" });
        console.log(`[SKIP] reason=pending instanceId=${instanceId}`);
        void hapticWarningPattern();
        return;
      }
      logOverlayStage(4, { reason: "guards pass" });
      logOverlayStage(5, { previousStatus, dayKey });
      console.log("[INSTANCE WRITE][USER_TAP]", {
        instanceId,
        previousStatus,
        nextStatus,
        timestamp: new Date().toISOString(),
      });
      console.log(
        `[TAP] instanceId=${instanceId} habitId=${
          instance?.source_id ?? "null"
        } day=${dayKey} sourceType=${
          instance?.source_type ?? "UNKNOWN"
        } pending=${pending} nextStatus=${nextStatus}`
      );

      const mutationTargetIds = [instanceId];
      setPendingInstanceStatuses((prev) => {
        const next = new Map(prev);
        mutationTargetIds.forEach((id) => next.set(id, nextStatus));
        return next;
      });

      const trimCandidate =
        nextStatus === "completed" && instance
          ? computeTrimmedHabitTiming(instance)
          : null;
      const completionIso =
        nextStatus === "completed"
          ? (trimCandidate?.completionIso ?? new Date().toISOString())
          : undefined;
      const allowPastCompletion =
        instance?.source_type === "HABIT" &&
        isInstancePastDay(instance, completionIso, stableTimeZone ?? "UTC");
      const trimResult =
        nextStatus === "completed" && instance
          ? instance.source_type === "HABIT" && allowPastCompletion
            ? null
            : trimCandidate
          : null;
      const targets: StatusTarget[] = mutationTargetIds.map((id) => ({
        id,
        status: nextStatus,
        completedAt: nextStatus === "completed" ? completionIso : null,
      }));
      let previousInstances: ScheduleInstance[] | null = null;
      let previousAllInstances: ScheduleInstance[] | null = null;
      let hasLoggedOptimisticUpdate = false;
      const applyOptimisticInstanceUpdate = () => {
        setInstances((prev) => {
          previousInstances = prev;
          const next = applyStatusTargets(prev, targets);
          if (!hasLoggedOptimisticUpdate) {
            logInstanceStatusChange("USER_TAP_LOCAL", instanceId, nextStatus);
            hasLoggedOptimisticUpdate = true;
          }
          return next;
        });
        setAllInstances((prev) => {
          previousAllInstances = prev;
          return applyStatusTargets(prev, targets);
        });
      };
      applyOptimisticInstanceUpdate();
      logOverlayStage(7, { reason: "optimistic applied" });

      try {
        logOverlayStage(5, { reason: "sending update" });
        console.log(
          `[MUTATE] instanceId=${instanceId} next=${nextStatus} completed_at=${
            completionIso ?? "null"
          }`
        );
        const result = await updateInstanceStatus(
          instanceId,
          nextStatus,
          nextStatus === "completed"
            ? {
                completedAtUTC: completionIso,
                updates:
                  trimResult && !allowPastCompletion
                    ? {
                        endUTC: trimResult.endUTC,
                        durationMin: trimResult.durationMin,
                      }
                    : undefined,
                allowPast: allowPastCompletion,
              }
            : undefined
        );
        const okResult = !result.error && (result.status ?? 500) < 400;
        logOverlayStage(6, { status: result.status, ok: okResult });
        console.log(
          `[RESULT] instanceId=${instanceId} http=${
            result.status ?? "n/a"
          } ok=${okResult} body=${
            result.error?.message ?? result.statusText ?? ""
          }`
        );
        if (result.error) {
          throw result.error;
        }

        const previousStatus = instance?.status ?? null;
        const isUndo =
          nextStatus === "scheduled" && previousStatus === "completed";
        const shouldAwardXp = nextStatus === "completed" || isUndo;

        if (shouldAwardXp && instance) {
          const payload = buildXpAwardPayload(instance);
          if (payload) {
            const baseAwardKey = `sched:${instance.id}:${payload.kind}`;
            const body: Record<string, unknown> = {
              scheduleInstanceId: instance.id,
              kind: payload.kind,
              amount: isUndo ? -payload.amount : payload.amount,
              awardKeyBase: isUndo ? `${baseAwardKey}:undo` : baseAwardKey,
              completion: {
                action: isUndo ? "undo" : "complete",
                sourceType: instance.source_type,
                sourceId: instance.source_id,
                completedAt:
                  nextStatus === "completed"
                    ? (trimResult?.endUTC ?? completionIso)
                    : instance.completed_at ?? completionIso,
                scheduleInstanceId: instance.id,
                wasScheduled: true,
                durationMin:
                  trimResult?.durationMin ??
                  (typeof instance.duration_min === "number"
                    ? instance.duration_min
                    : null),
                timeZone: stableTimeZone ?? effectiveTimeZone,
              },
            };
            if (payload.skillIds.length > 0) {
              body.skillIds = payload.skillIds;
            }
            if (payload.monumentIds.length > 0) {
              body.monumentIds = payload.monumentIds;
            }
            try {
              const response = await fetch("/api/xp/award", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (!response.ok) {
                console.error(
                  "Failed to award XP for schedule completion",
                  await response.text()
                );
              }
            } catch (awardError) {
              console.error(
                "Failed to award XP for schedule completion",
                awardError
              );
            }
          }
        }

        if (instance?.source_type === "HABIT" && instance.source_id) {
          const completionTimestamp =
            (nextStatus === "completed"
              ? (trimResult?.endUTC ?? completionIso)
              : null) ??
            instance.end_utc ??
            instance.start_utc ??
            new Date().toISOString();
          const action = nextStatus === "completed" ? "complete" : "undo";
          void recordHabitCompletionRemote({
            habitId: instance.source_id,
            completedAt: completionTimestamp,
            action,
            scheduleInstanceId: instance.id,
            durationMin:
              trimResult?.durationMin ??
              (typeof instance.duration_min === "number"
                ? instance.duration_min
                : null),
          });
        }
        if (nextStatus === "completed") {
          void hapticComplete();
        }
      } catch (error) {
        console.error(error);
        void hapticErrorPattern();
        if (previousInstances) {
          setInstances(previousInstances);
        }
        if (previousAllInstances) {
          setAllInstances(previousAllInstances);
        }
      } finally {
        setPendingInstanceStatuses((prev) => {
          const next = new Map(prev);
          mutationTargetIds.forEach((id) => next.delete(id));
          return next;
        });
        logOverlayStage(8, { reason: "pending cleared" });
      }
    },
    [
      userId,
      setInstances,
      instancesById,
      buildXpAwardPayload,
      recordHabitCompletionRemote,
      computeTrimmedHabitTiming,
      logInstanceStatusChange,
      setAllInstances,
      setPendingInstanceStatuses,
      pendingInstanceStatuses,
      stableTimeZone,
      effectiveTimeZone,
      canonicalTodayDateKey,
      applyStatusTargets,
    ]
  );

  const getHabitCompletionStatus = useCallback(
    (dateKey: string, habitId: string): HabitCompletionStatus => {
      const dayMap = habitCompletionByDate[dateKey];
      const status = dayMap?.[habitId] ?? "scheduled";
      return status;
    },
    [habitCompletionByDate]
  );

  const updateHabitCompletionStatus = useCallback(
    (
      dateKey: string,
      habitId: string,
      status: HabitCompletionStatus | null
    ) => {
      setHabitCompletionByDate((prev) => {
        const prevDay = prev[dateKey];
        if (status === null || status === "scheduled") {
          if (!prevDay || !(habitId in prevDay)) {
            return prev;
          }
          const next = { ...prev };
          const nextDay = { ...prevDay };
          delete nextDay[habitId];
          if (Object.keys(nextDay).length === 0) {
            delete next[dateKey];
          } else {
            next[dateKey] = nextDay;
          }
          return next;
        }
        if (prevDay?.[habitId] === status) {
          return prev;
        }
        const next = { ...prev };
        const nextDay = { ...(prevDay ?? {}) };
        nextDay[habitId] = status;
        next[dateKey] = nextDay;
        return next;
      });
    },
    []
  );

  const toggleHabitCompletionStatus = useCallback(
    (dateKey: string, completionKey: string): HabitCompletionStatus => {
      const current = getHabitCompletionStatus(dateKey, completionKey);
      const nextStatus: HabitCompletionStatus =
        current === "completed" ? "scheduled" : "completed";
      updateHabitCompletionStatus(dateKey, completionKey, nextStatus);
      return nextStatus;
    },
    [getHabitCompletionStatus, updateHabitCompletionStatus]
  );

  const triggerCompletionBounce = useCallback((instanceId: string) => {
    if (!instanceId) return;
    setCompletionBounceId(instanceId);
    if (completionBounceTimeoutRef.current !== null) {
      window.clearTimeout(completionBounceTimeoutRef.current);
      completionBounceTimeoutRef.current = null;
    }
    completionBounceTimeoutRef.current = window.setTimeout(() => {
      setCompletionBounceId((current) =>
        current === instanceId ? null : current
      );
      completionBounceTimeoutRef.current = null;
    }, COMPLETION_BOUNCE_DURATION_MS);
  }, []);

  const handleHabitCardActivation = useCallback(
    (placement: HabitTimelinePlacement, dateKey: string) => {
      const isPending = placement.instanceId
        ? pendingInstanceStatuses.has(placement.instanceId)
        : false;
      const currentStatus = getHabitCompletionStatus(
        dateKey,
        getHabitCompletionStateKey(placement)
      );
      const plannedNextStatus: HabitCompletionStatus =
        currentStatus === "completed" ? "scheduled" : "completed";
      if (isPending) {
        console.log(
          `[SKIP] reason=pending instanceId=${placement.instanceId ?? "null"}`
        );
      }
      console.log(
        `[TAP] instanceId=${placement.instanceId ?? "null"} habitId=${
          placement.habitId
        } day=${dateKey} sourceType=${
          placement.habitType ?? "HABIT"
        } pending=${isPending} nextStatus=${plannedNextStatus}`
      );
      const completionTimestamp =
        isValidDate(placement.end) &&
        typeof placement.end.toISOString === "function"
          ? placement.end.toISOString()
          : completionTimestampForDateKey(dateKey);
      if (placement.habitType === "MEMO" && plannedNextStatus === "completed") {
        setMemoCompletionState({
          habitId: placement.habitId,
          habitName: placement.habitName,
          habitType: placement.habitType,
          skillId: placement.skillId,
          skillIcon: null,
          memoCaptureConfig: placement.memoCaptureConfig ?? null,
          dateKey,
          instanceId: placement.instanceId,
          completionIso: completionTimestamp,
        });
        return;
      }
      if (placement.instanceId && isPending) {
        return;
      }
      const nextStatus = toggleHabitCompletionStatus(
        dateKey,
        getHabitCompletionStateKey(placement)
      );
      const instanceId = placement.instanceId;
      if (instanceId) {
        triggerCompletionBounce(instanceId);
        const targetStatus: "completed" | "scheduled" =
          nextStatus === "completed" ? "completed" : "scheduled";
        void handleToggleInstanceCompletion(instanceId, targetStatus);
      } else {
        const action = nextStatus === "completed" ? "complete" : "undo";
        void recordHabitCompletionRemote({
          habitId: placement.habitId,
          completedAt: completionTimestamp,
          action,
        });
      }
    },
    [
      toggleHabitCompletionStatus,
      handleToggleInstanceCompletion,
      triggerCompletionBounce,
      completionTimestampForDateKey,
      recordHabitCompletionRemote,
      getHabitCompletionStatus,
      pendingInstanceStatuses,
    ]
  );

  const handleCloseEditSheet = useCallback(() => {
    logEditingSnapshotEvent("handleCloseEditSheet", null, {
      reason: "close",
    });
    setEditingSnapshot(null);
  }, []);

  const handleMemoCompletionSubmitted = useCallback(async () => {
    if (!memoCompletionState) return;

    updateHabitCompletionStatus(
      memoCompletionState.dateKey,
      getHabitCompletionStateKey(memoCompletionState),
      "completed"
    );
    if (memoCompletionState.instanceId) {
      triggerCompletionBounce(memoCompletionState.instanceId);
      await handleToggleInstanceCompletion(
        memoCompletionState.instanceId,
        "completed"
      );
    } else {
      await recordHabitCompletionRemote({
        habitId: memoCompletionState.habitId,
        completedAt: memoCompletionState.completionIso,
        action: "complete",
      });
    }
    setMemoCompletionState(null);
  }, [
    handleToggleInstanceCompletion,
    memoCompletionState,
    recordHabitCompletionRemote,
    triggerCompletionBounce,
    updateHabitCompletionStatus,
  ]);

  const handleToggleBacklogTaskCompletion = useCallback(
    async (taskId: string) => {
      const task = taskMap[taskId];
      if (!task) return;
      if (pendingBacklogTaskIds.has(taskId)) {
        void hapticWarningPattern();
        return;
      }

      const currentStage = task.stage;
      const isCurrentlyCompleted = currentStage === "PERFECT";
      const snapshots = backlogTaskPreviousStageRef.current;

      let nextStage: TaskLite["stage"];
      if (isCurrentlyCompleted) {
        nextStage = snapshots.get(taskId) ?? "PRODUCE";
      } else {
        snapshots.set(taskId, currentStage);
        nextStage = "PERFECT";
      }

      if (nextStage === currentStage) {
        if (!isCurrentlyCompleted) {
          snapshots.delete(taskId);
        }
        return;
      }

      setPendingBacklogTaskIds((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, stage: nextStage } : t))
      );

      try {
        const { error } = await updateTaskStage(taskId, nextStage);
        if (error) {
          throw error;
        }

        if (isCurrentlyCompleted) {
          snapshots.delete(taskId);
        }
        if (nextStage === "PERFECT") {
          void hapticComplete();
        }

        const shouldAwardXp = isCurrentlyCompleted || nextStage === "PERFECT";
        if (shouldAwardXp && userId) {
          const isUndo = isCurrentlyCompleted;
          const skillIdsRaw = task.skill_id ? [task.skill_id] : [];
          const uniqueSkillIds = Array.from(
            new Set(
              skillIdsRaw.filter(
                (id): id is string => typeof id === "string" && id.length > 0
              )
            )
          );
          const monumentIds = uniqueSkillIds
            .map((id) => skillMonumentMap[id])
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0
            );

          const baseAwardKey = `backlog:${taskId}:task`;
          const body: Record<string, unknown> = {
            kind: "task",
            amount: isUndo ? -1 : 1,
            awardKeyBase: isUndo ? `${baseAwardKey}:undo` : baseAwardKey,
            completion: {
              action: isUndo ? "undo" : "complete",
              sourceType: "TASK",
              sourceId: taskId,
              completedAt: new Date().toISOString(),
              wasScheduled: false,
              durationMin:
                typeof task.duration_min === "number" &&
                Number.isFinite(task.duration_min)
                  ? Math.max(0, Math.round(task.duration_min))
                  : null,
              timeZone: stableTimeZone ?? effectiveTimeZone,
            },
          };
          if (uniqueSkillIds.length > 0) {
            body.skillIds = uniqueSkillIds;
          }
          if (monumentIds.length > 0) {
            body.monumentIds = monumentIds;
          }

          try {
            const response = await fetch("/api/xp/award", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!response.ok) {
              console.error(
                "Failed to award XP for backlog task completion",
                await response.text()
              );
            }
          } catch (awardError) {
            console.error(
              "Failed to award XP for backlog task completion",
              awardError
            );
          }
        }
      } catch (error) {
        console.error("Failed to toggle backlog task completion", error);
        void hapticErrorPattern();
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, stage: currentStage } : t))
        );
        if (!isCurrentlyCompleted) {
          snapshots.delete(taskId);
        }
      } finally {
        setPendingBacklogTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [
      taskMap,
      pendingBacklogTaskIds,
      setTasks,
      skillMonumentMap,
      userId,
      stableTimeZone,
      effectiveTimeZone,
    ]
  );
  function navigate(next: ScheduleView) {
    if (navLock.current) return;
    navLock.current = true;
    setView(next);
    setTimeout(() => {
      navLock.current = false;
    }, 300);
  }

  function handleBack() {
    router.push("/dashboard");
  }

  const handleToday = () => {
    updateCurrentDate(new Date());
    navigate("day");
  };

  const runScheduler = useCallback(
    async (args?: {
      writeThroughDays?: number | null;
      background?: boolean;
    }) => {
      const background = args?.background ?? false;
      if (!userId) {
        if (!background) {
          console.warn("No authenticated user available for scheduler run");
        }
        return;
      }

      runIdRef.current += 1;
      const localNow = new Date();
      const utcOffsetMinutes = -localNow.getTimezoneOffset();
      const timeZone: string | null = effectiveTimeZone ?? null;

      if (!background) {
        if (isSchedulingRef.current) return;
        isManualSchedulingRef.current = true;
        syncSchedulingState();
      }

      try {
        const response = await fetch(
          "/api/scheduler/run?writeThroughDays=14",
          {
            method: "POST",
            cache: "no-store",
            keepalive: background,
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              localTimeIso: localNow.toISOString(),
              timeZone,
              utcOffsetMinutes,
              mode: resolvedModePayload,
              writeThroughDays: args?.writeThroughDays ?? null,
            }),
          },
        );

        if (background) {
          if (!response.ok) {
            console.error("Background scheduler run failed", response.status);
          }
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        const raw = await response.text();

        if (!response.ok) {
          const errInfo = {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            contentType,
            body: raw.slice(0, 500),
          };
          console.error("Scheduler run failed", errInfo);
          throw new Error(`Scheduler run failed: ${JSON.stringify(errInfo)}`);
        }

        if (!contentType.includes("application/json")) {
          throw new Error(
            `Expected JSON but got ${contentType || "unknown"}. Payload snippet: ${raw
              .slice(0, 500)
              .replace(/\s+/g, " ")}`
          );
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch (err) {
          throw new Error(
            `Scheduler response JSON parse failed: ${String(err)} | raw snippet: ${raw
              .slice(0, 500)
              .replace(/\s+/g, " ")}`
          );
        }

        const parsed = parseSchedulerDebugPayload(payload);
        if (parsed) {
          // Add summary logging for debugging
          const failureSummary = (parsed.failures || []).reduce((acc, f) => {
            acc[f.reason] = (acc[f.reason] || 0) + 1;
            return acc;
          }, {});
          console.log("🔍 SCHEDULER DEBUG SUMMARY:", {
            placedCount: parsed.placedCount,
            totalFailures: parsed.failures?.length,
            failureReasons: failureSummary,
            failedProjectIds: parsed.failures
              ?.filter((f) => f.itemId)
              .map((f) => f.itemId)
              .slice(0, 10),
            placedProjectIds: parsed.placedProjectIds?.slice(0, 10),
            debugSummary: parsed.debugSummary,
          });

          setSchedulerDebug({
            runAt: new Date().toISOString(),
            ...parsed,
          });
          if (parsed.placedProjectIds.length > 0) {
            setScheduledProjectIds((prev) => {
              let changed = false;
              const next = new Set(prev);
              for (const id of parsed.placedProjectIds) {
                if (!next.has(id)) {
                  next.add(id);
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          }
        } else {
          if (parseError) {
            console.error("Failed to parse scheduler response", parseError);
          }
          const fallbackError =
            parseError ??
            (!response.ok
              ? payload
              : { message: "Scheduler response missing schedule payload" });
          setSchedulerDebug({
            runAt: new Date().toISOString(),
            failures: [],
            placedCount: 0,
            placedProjectIds: [],
            timeline: [],
            error: fallbackError,
          });
        }
      } catch (error) {
        if (!background) {
          console.error("Failed to run scheduler", error);
          setSchedulerDebug({
            runAt: new Date().toISOString(),
            failures: [],
            placedCount: 0,
            placedProjectIds: [],
            timeline: [],
            error,
          });
        } else {
          console.error("Background scheduler run failed", error);
        }
      } finally {
        if (!background) {
          isManualSchedulingRef.current = false;
          syncSchedulingState();
          try {
            await loadInstancesRef.current();
          } catch (error) {
            console.error("Failed to reload schedule instances", error);
          }
          try {
            await refreshScheduledProjectIds();
          } catch (error) {
            console.error("Failed to refresh scheduled project history", error);
          }
        }
      }
    },
    [
      userId,
      refreshScheduledProjectIds,
      localTimeZone,
      resolvedModePayload,
      loadInstancesRef,
      syncSchedulingState,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const globalWithScheduler = window as typeof window & {
      __runScheduler?: (options?: {
        writeThroughDays?: number | null;
      }) => Promise<void>;
    };
    globalWithScheduler.__runScheduler = runScheduler;
    return () => {
      delete globalWithScheduler.__runScheduler;
    };
  }, [runScheduler]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSchedulerRunningChange = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { running?: unknown } | null)
          : null;

      if (detail?.running === true) {
        externalSchedulingRunsRef.current += 1;
        syncSchedulingState();
        return;
      }

      externalSchedulingRunsRef.current = Math.max(
        0,
        externalSchedulingRunsRef.current - 1
      );
      syncSchedulingState();
      void loadInstancesRef.current().catch((error) => {
        console.error("Failed to reload schedule instances", error);
      });
      void refreshScheduledProjectIds().catch((error) => {
        console.error("Failed to refresh scheduled project history", error);
      });
    };

    window.addEventListener(
      SCHEDULE_SCHEDULER_RUNNING_EVENT,
      handleSchedulerRunningChange
    );
    return () => {
      window.removeEventListener(
        SCHEDULE_SCHEDULER_RUNNING_EVENT,
        handleSchedulerRunningChange
      );
    };
  }, [refreshScheduledProjectIds, syncSchedulingState]);

  useEffect(() => {
    if (!userId) return;
    if (metaStatus !== "loaded" || instancesStatus !== "loaded") return;
    const todayKey =
      canonicalTodayDateKey ??
      formatScheduleDateKey(new Date(), effectiveTimeZone ?? "UTC");
    const stored = readLastAutoRunDate();
    if (stored === todayKey) {
      if (hasAutoRunToday !== true) setHasAutoRunToday(true);
    } else if (hasAutoRunToday !== false) {
      setHasAutoRunToday(false);
    }
  }, [
    userId,
    metaStatus,
    instancesStatus,
    readLastAutoRunDate,
    hasAutoRunToday,
    canonicalTodayDateKey,
    effectiveTimeZone,
  ]);

  const handleRescheduleClick = useCallback(async () => {
    if (!userId) return;
    const todayKey =
      canonicalTodayDateKey ??
      formatScheduleDateKey(new Date(), effectiveTimeZone ?? "UTC");
    await runScheduler({ writeThroughDays: PRIMARY_WRITE_WINDOW_DAYS });
    if (
      ENABLE_BACKGROUND_SCHEDULER &&
      PRIMARY_WRITE_WINDOW_DAYS < FULL_WRITE_WINDOW_DAYS
    ) {
      void runScheduler({
        writeThroughDays: FULL_WRITE_WINDOW_DAYS,
        background: true,
      });
    }
    persistAutoRunDate(todayKey);
    setHasAutoRunToday(true);
  }, [
    userId,
    runScheduler,
    persistAutoRunDate,
    refreshScheduledProjectIds,
    loadInstancesRef,
    canonicalTodayDateKey,
    effectiveTimeZone,
  ]);

  const handleClearUncompletedScheduleInstances = useCallback(async () => {
    if (!userId || isClearingUncompletedScheduleInstances) return;

    setIsClearingUncompletedScheduleInstances(true);
    try {
      const response = await fetch(
        "/api/schedule/instances/clear-uncompleted",
        {
          method: "DELETE",
          cache: "no-store",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            deleted?: number;
            preservedLockedFuture?: number | null;
            error?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to clear uncompleted schedule instances"
        );
      }

      await refreshScheduleData();
      await refreshScheduledProjectIds();
      void hapticComplete();
      const preservedLockedFuture =
        typeof payload?.preservedLockedFuture === "number" &&
        Number.isFinite(payload.preservedLockedFuture)
          ? payload.preservedLockedFuture
          : 0;
      toast.success(
        "Clear uncompleted Events",
        preservedLockedFuture > 0
          ? "Cleared uncompleted Events; kept locked future Events."
          : "Cleared uncompleted Events."
      );
    } catch (error) {
      console.error("Failed to clear uncompleted schedule instances", error);
      void hapticErrorPattern();
      toast.error(
        "Schedule clear failed",
        error instanceof Error ? error.message : "Try again in a moment."
      );
    } finally {
      setIsClearingUncompletedScheduleInstances(false);
    }
  }, [
    userId,
    isClearingUncompletedScheduleInstances,
    refreshScheduleData,
    refreshScheduledProjectIds,
    toast,
  ]);

  const handleRecycleManualEvents = useCallback(async () => {
    if (!userId || isRecyclingManualEvents) return;

    setIsRecyclingManualEvents(true);
    try {
      const response = await fetch(
        "/api/schedule/instances/recycle-manual",
        {
          method: "POST",
          cache: "no-store",
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            recycled?: number;
            placed?: number;
            failed?: number;
            skipped?: number;
            message?: string;
            error?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to recycle stale manual Events"
        );
      }

      await refreshScheduleData();
      await refreshScheduledProjectIds();
      void hapticComplete();
      const recycled = payload?.recycled ?? 0;
      const placed = payload?.placed ?? 0;
      const failed = payload?.failed ?? 0;
      const skipped = payload?.skipped ?? 0;
      toast.success(
        recycled > 0 ? "Manual Events recycled" : "No manual Events recycled",
        payload?.message ??
          `${recycled} recycled, ${placed} placed, ${failed} failed, ${skipped} skipped.`
      );
    } catch (error) {
      console.error("Failed to recycle manual Events", error);
      void hapticErrorPattern();
      toast.error(
        "Recycle failed",
        error instanceof Error ? error.message : "Try again in a moment."
      );
    } finally {
      setIsRecyclingManualEvents(false);
    }
  }, [
    userId,
    isRecyclingManualEvents,
    refreshScheduleData,
    refreshScheduledProjectIds,
    toast,
  ]);

  const handleToggleManualSchedulingMode = useCallback(() => {
    setIsManualSchedulingMode((active) => !active);
    void hapticPress();
  }, []);

  const dayTimelineContainerRef = useRef<HTMLDivElement | null>(null);
  const swipeContainerRef = useRef<HTMLDivElement | null>(null);
  const inlineJumpPanelRef = useRef<HTMLDivElement | null>(null);

  const isInsideInlineJumpPanelTarget = (target: EventTarget | null) => {
    return (
      target instanceof HTMLElement &&
      Boolean(target.closest("[data-inline-jump-panel]"))
    );
  };

  const isTouchWithinInlineJumpPanel = (touch: Touch) => {
    const panel = inlineJumpPanelRef.current;
    if (!panel) return false;
    return isTouchWithinElement(touch, panel);
  };

  const isEventFromInlineJumpPanel = (event: React.SyntheticEvent | Event) => {
    if (isInsideInlineJumpPanelTarget(event.target)) return true;

    const nativeEvent =
      "nativeEvent" in event
        ? (event.nativeEvent as Event & { composedPath?: () => EventTarget[] })
        : (event as Event & { composedPath?: () => EventTarget[] });
    const path = nativeEvent.composedPath?.();
    if (Array.isArray(path)) {
      if (path.some(isInsideInlineJumpPanelTarget)) return true;
    }

    const touchEvent = nativeEvent as TouchEvent;
    const touches = [
      ...Array.from(touchEvent.touches ?? []),
      ...Array.from(touchEvent.changedTouches ?? []),
    ];
    if (touches.some(isTouchWithinInlineJumpPanel)) return true;

    return false;
  };

  const isTouchFromFabOverlay = (event: React.TouchEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.("[data-fab-overlay], [data-fab-reschedule-overlay]")
    ) {
      return true;
    }
    const path = (
      event.nativeEvent as
        | TouchEvent
        | (TouchEvent & { composedPath?: () => EventTarget[] })
    )?.composedPath?.();
    if (Array.isArray(path)) {
      return path.some(
        (node) =>
          node instanceof HTMLElement &&
          node.closest?.("[data-fab-overlay], [data-fab-reschedule-overlay]")
      );
    }
    return false;
  };

  function handleTouchStart(e: React.TouchEvent) {
    if (isEventFromInlineJumpPanel(e)) return;
    if (isTouchFromFabOverlay(e)) return;

    if (isInlineJumpToDateOpen) {
      if (shouldUseInlineJumpEditorPanel) return;
      void closeInlineJumpToDate();
      return;
    }

    swipeScrollProgressRef.current = null;

    const touches = e.touches;
    if (view === "day" && touches.length >= 2) {
      const container = dayTimelineContainerRef.current;
      if (container) {
        const firstTouch = touches[0];
        const secondTouch = touches[1];
        if (
          firstTouch &&
          secondTouch &&
          isTouchWithinElement(firstTouch, container) &&
          isTouchWithinElement(secondTouch, container)
        ) {
          const distance = getTouchDistance(firstTouch, secondTouch);
          if (distance > 0) {
            const height = container.offsetHeight;
            if (height > 0 && typeof window !== "undefined") {
              const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
              const rect = container.getBoundingClientRect();
              const containerTop = rect.top + scrollY;
              const centerClientY =
                (firstTouch.clientY + secondTouch.clientY) / 2;
              const anchorPageY = centerClientY + scrollY;
              const anchorOffset = anchorPageY - containerTop;
              const progressRaw = anchorOffset / height;
              const anchorProgress = Number.isFinite(progressRaw)
                ? Math.min(Math.max(progressRaw, 0), 1)
                : 0.5;
              // Prevent the browser from hijacking the pinch for page zoom
              e.preventDefault();
              stopZoomAnimation();
              const currentZoom = clampPxPerMin(animatedPxPerMin.get());
              commitZoomPxPerMin(currentZoom, { syncAnimated: true });
              pinchStateRef.current = {
                initialDistance: distance,
                initialPxPerMin: currentZoom,
                initialHeight: height,
                anchorProgress,
                initialScrollY: scrollY,
              };
              pinchActiveRef.current = true;
              touchStartX.current = null;
              touchStartY.current = null;
              touchStartWidth.current = 0;
              hasVerticalTouchMovement.current = false;
              swipeDeltaRef.current = 0;
              sliderControls.stop();
              setIsSwipingDayView(false);
              setPeekState((prev) => {
                if (prev.direction === 0 && prev.offset === 0) {
                  return prev;
                }
                return { direction: 0, offset: 0 };
              });
            }
            return;
          }
        }
      }
    }

    if (touches.length > 1) {
      touchStartX.current = null;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      return;
    }

    if (view !== "day" || prefersReducedMotion || pinchActiveRef.current) {
      touchStartX.current = null;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      return;
    }

    const firstTouch = touches[0];
    if (!firstTouch) {
      touchStartX.current = null;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      return;
    }

    touchStartX.current = firstTouch.clientX;
    touchStartY.current = firstTouch.clientY;
    touchStartWidth.current = swipeContainerRef.current?.offsetWidth ?? 0;
    hasVerticalTouchMovement.current = false;
    swipeDeltaRef.current = 0;
    sliderControls.stop();
    if (typeof window !== "undefined") {
      const container = dayTimelineContainerRef.current;
      const viewportHeightRaw =
        window.visualViewport?.height ?? window.innerHeight ?? 0;
      const viewportHeight = Number.isFinite(viewportHeightRaw)
        ? viewportHeightRaw
        : 0;
      if (container) {
        const height = container.offsetHeight;
        if (height > 0) {
          const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
          const rect = container.getBoundingClientRect();
          const containerTop = rect.top + scrollY;
          const anchorOffset = viewportHeight > 0 ? viewportHeight / 2 : 0;
          const anchorPosition = scrollY + anchorOffset;
          const relative = anchorPosition - containerTop;
          const clamped = Math.min(Math.max(relative, 0), height);
          swipeScrollProgressRef.current = clamped / height;
        }
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (isEventFromInlineJumpPanel(e)) return;
    if (isTouchFromFabOverlay(e)) return;
    if (isInlineJumpToDateOpen) {
      if (shouldUseInlineJumpEditorPanel) return;
    }
    if (pinchActiveRef.current) {
      const pinchState = pinchStateRef.current;
      if (!pinchState) {
        pinchActiveRef.current = false;
        return;
      }
      if (e.touches.length < 2) {
        commitPinchToSnap();
        pinchStateRef.current = null;
        pinchActiveRef.current = false;
        return;
      }
      const firstTouch = e.touches[0];
      const secondTouch = e.touches[1];
      if (!firstTouch || !secondTouch) return;
      const distance = getTouchDistance(firstTouch, secondTouch);
      if (!(distance > 0) || !(pinchState.initialDistance > 0)) return;
      e.preventDefault();
      const scale = distance / pinchState.initialDistance;
      const target = clampPxPerMin(pinchState.initialPxPerMin * scale);
      commitZoomPxPerMin(target, {
        markAsUserSelected: true,
        syncAnimated: true,
      });
      if (typeof window !== "undefined") {
        const base = pinchState.initialPxPerMin;
        const baseHeight = pinchState.initialHeight;
        if (base > 0 && baseHeight > 0) {
          const heightScale = target / base;
          if (Number.isFinite(heightScale)) {
            const newHeight = baseHeight * heightScale;
            const deltaHeight = newHeight - baseHeight;
            let targetScroll =
              pinchState.initialScrollY +
              deltaHeight * pinchState.anchorProgress;
            const viewportHeightRaw =
              window.visualViewport?.height ?? window.innerHeight ?? 0;
            const viewportHeight = Number.isFinite(viewportHeightRaw)
              ? viewportHeightRaw
              : 0;
            const doc =
              typeof document !== "undefined" ? document.documentElement : null;
            if (doc && Number.isFinite(viewportHeight)) {
              const maxScroll = doc.scrollHeight - viewportHeight;
              if (Number.isFinite(maxScroll)) {
                targetScroll = Math.min(
                  Math.max(targetScroll, 0),
                  Math.max(0, maxScroll)
                );
              } else {
                targetScroll = Math.max(targetScroll, 0);
              }
            } else {
              targetScroll = Math.max(targetScroll, 0);
            }
            window.scrollTo({ top: targetScroll, behavior: "auto" });
          }
        }
      }
      return;
    }

    if (e.touches.length > 1) return;
    if (view !== "day" || prefersReducedMotion) return;
    const touch = e.touches[0];
    if (!touch) return;

    if (touchStartY.current === null) {
      touchStartY.current = touch.clientY;
    }

    if (!hasVerticalTouchMovement.current && touchStartY.current !== null) {
      const verticalDiff = Math.abs(touch.clientY - touchStartY.current);
      if (verticalDiff > VERTICAL_SCROLL_THRESHOLD_PX) {
        const horizontalDiff =
          touchStartX.current !== null
            ? Math.abs(touch.clientX - touchStartX.current)
            : 0;
        if (
          verticalDiff >
          horizontalDiff * VERTICAL_SCROLL_SLOPE + VERTICAL_SCROLL_BIAS_PX
        ) {
          hasVerticalTouchMovement.current = true;
        }
      }
    }

    if (hasVerticalTouchMovement.current) {
      const isDownward = touch.clientY > (touchStartY.current ?? touch.clientY);
      if (
        isDownward &&
        (canInitiateJumpPull() ||
          isJumpPullingRef.current ||
          isInlineJumpToDateOpen)
      ) {
        if (touchStartX.current !== null || isSwipingDayView) {
          touchStartX.current = null;
          touchStartWidth.current = 0;
          swipeDeltaRef.current = 0;
          swipeScrollProgressRef.current = null;
          sliderControls.set({ x: 0 });
          if (isSwipingDayView) {
            setIsSwipingDayView(false);
          }
          setPeekState((prev) => {
            if (prev.direction === 0 && prev.offset === 0) {
              return prev;
            }
            return { direction: 0, offset: 0 };
          });
        }
        e.preventDefault();
        isJumpPullingRef.current = true;
        if (jumpPullStartYRef.current === null) {
          jumpPullStartYRef.current = touchStartY.current ?? touch.clientY;
        }
        const rawDistance = touch.clientY - jumpPullStartYRef.current;
        const distance = Math.round(
          rawDistance * INLINE_JUMP_PULL_RESISTANCE
        );
        const clamped = Math.min(
          Math.max(0, distance),
          inlineJumpEffectiveRevealHeight
        );
        jumpPullDistanceRef.current = clamped;
        jumpPullControls.set({ y: clamped });
        return;
      }
      if (touchStartX.current !== null || isSwipingDayView) {
        touchStartX.current = null;
        touchStartWidth.current = 0;
        swipeDeltaRef.current = 0;
        swipeScrollProgressRef.current = null;
        sliderControls.set({ x: 0 });
        if (isSwipingDayView) {
          setIsSwipingDayView(false);
        }
        setPeekState((prev) => {
          if (prev.direction === 0 && prev.offset === 0) {
            return prev;
          }
          return { direction: 0, offset: 0 };
        });
      }
      return;
    }

    if (touchStartX.current === null) return;
    const width =
      touchStartWidth.current || swipeContainerRef.current?.offsetWidth || 1;
    const diff = touch.clientX - touchStartX.current;
    const clamped = Math.max(Math.min(diff, width), -width);
    swipeDeltaRef.current = clamped;
    sliderControls.set({ x: clamped });
    if (!isSwipingDayView && Math.abs(clamped) > 4) {
      setIsSwipingDayView(true);
    }
    const direction: DayTransitionDirection =
      clamped === 0 ? 0 : clamped < 0 ? 1 : -1;
    const offset = Math.abs(clamped);
    setPeekState((prev) => {
      if (prev.direction === direction && Math.abs(prev.offset - offset) < 1) {
        return prev;
      }
      return { direction, offset };
    });
  }

  async function handleTouchEnd(e?: React.TouchEvent) {
    if (e && isEventFromInlineJumpPanel(e)) return;
    if (pinchActiveRef.current) {
      pinchActiveRef.current = false;
      pinchStateRef.current = null;
      commitPinchToSnap();
      sliderControls.set({ x: 0 });
      swipeDeltaRef.current = 0;
      touchStartX.current = null;
      touchStartWidth.current = 0;
      swipeScrollProgressRef.current = null;
      setIsSwipingDayView(false);
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      setPeekState((prev) => {
        if (prev.direction === 0 && prev.offset === 0) {
          return prev;
        }
        return { direction: 0, offset: 0 };
      });
      return;
    }

    if (view !== "day" || prefersReducedMotion) {
      if (isJumpPullingRef.current || jumpPullDistanceRef.current > 0) {
        void animateInlineJumpClosed();
      }
      touchStartX.current = null;
      setIsSwipingDayView(false);
      setPeekState({ direction: 0, offset: 0 });
      swipeScrollProgressRef.current = null;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      return;
    }
    if (isJumpPullingRef.current) {
      const distance = jumpPullDistanceRef.current;
      if (distance >= inlineJumpPullThreshold) {
        void animateInlineJumpOpen({ source: "pull" });
      } else {
        void animateInlineJumpClosed();
      }
      touchStartX.current = null;
      touchStartWidth.current = 0;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      swipeDeltaRef.current = 0;
      swipeScrollProgressRef.current = null;
      setPeekState({ direction: 0, offset: 0 });
      setIsSwipingDayView(false);
      return;
    }
    if (touchStartX.current === null) {
      setIsSwipingDayView(false);
      setPeekState({ direction: 0, offset: 0 });
      swipeScrollProgressRef.current = null;
      touchStartY.current = null;
      hasVerticalTouchMovement.current = false;
      return;
    }
    const width =
      touchStartWidth.current || swipeContainerRef.current?.offsetWidth || 1;
    const diff = swipeDeltaRef.current;
    const threshold = Math.min(140, width * 0.28);
    const absDiff = Math.abs(diff);
    if (absDiff > threshold) {
      const direction: DayTransitionDirection = diff < 0 ? 1 : -1;
      const target = direction === 1 ? -width : width;
      await sliderControls.start({
        x: target,
        transition: { type: "spring", stiffness: 280, damping: 32 },
      });
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + direction);
      setSkipNextDayAnimation(true);
      updateCurrentDate(nextDate, { direction, animate: false });
    } else {
      swipeScrollProgressRef.current = null;
      await sliderControls.start({
        x: 0,
        transition: { type: "spring", stiffness: 280, damping: 32 },
      });
    }
    sliderControls.set({ x: 0 });
    swipeDeltaRef.current = 0;
    touchStartX.current = null;
    touchStartWidth.current = 0;
    setPeekState({ direction: 0, offset: 0 });
    setIsSwipingDayView(false);
    touchStartY.current = null;
    hasVerticalTouchMovement.current = false;
  }

  const handleTouchCancel = (e: React.TouchEvent) => {
    void handleTouchEnd(e);
  };

  const handleJumpToDateSelect = (date: Date) => {
    setIsJumpToDateOpen(false);
    setSkipNextDayAnimation(true);
    updateCurrentDate(date, { animate: false });
    navigate("day");
  };

  const closeInlineJumpToDate = useCallback(async () => {
    if (!isInlineJumpToDateOpen) return;
    void hapticSnap();
    await animateInlineJumpClosed();
  }, [animateInlineJumpClosed, isInlineJumpToDateOpen]);

  const openInlineJumpToDateFromButton = useCallback(() => {
    if (isInlineJumpToDateOpen) {
      void closeInlineJumpToDate();
      return;
    }

    touchStartY.current = null;
    hasVerticalTouchMovement.current = false;

    if (typeof window !== "undefined") {
      const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
      if (scrollY > 2) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }

    void hapticSnap();
    void animateInlineJumpOpen({ source: "button" });
  }, [
    animateInlineJumpOpen,
    closeInlineJumpToDate,
    isInlineJumpToDateOpen,
  ]);

  const handleInlineJumpToDateSelect = useCallback(
    (date: Date) => {
      setIsInlineJumpToDateOpen(false);
      jumpPullControls.set({ y: 0 });
      setSkipNextDayAnimation(true);
      updateCurrentDate(date, { animate: false });
      navigate("day");
    },
    [jumpPullControls, updateCurrentDate]
  );

  const handleSearchResultSelect = ({
    instanceId,
    date,
  }: {
    instanceId: string;
    date: Date;
  }) => {
    setIsSearchOpen(false);
    setSkipNextDayAnimation(true);
    updateCurrentDate(date, { animate: false });
    navigate("day");
    setFocusInstanceId(instanceId);
  };

  // Editor opening logic moved inline to decouple from schedule instances

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const cancelLongPress = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const triggerLongPressFeedback = useCallback((instanceId: string) => {
    if (!instanceId) return;
    setLongPressBounceId(instanceId);
    if (longPressBounceTimeoutRef.current !== null) {
      window.clearTimeout(longPressBounceTimeoutRef.current);
      longPressBounceTimeoutRef.current = null;
    }
    longPressBounceTimeoutRef.current = window.setTimeout(() => {
      setLongPressBounceId((current) =>
        current === instanceId ? null : current
      );
      longPressBounceTimeoutRef.current = null;
    }, LONG_PRESS_FEEDBACK_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressBounceTimeoutRef.current !== null) {
        window.clearTimeout(longPressBounceTimeoutRef.current);
        longPressBounceTimeoutRef.current = null;
      }
      if (completionBounceTimeoutRef.current !== null) {
        window.clearTimeout(completionBounceTimeoutRef.current);
        completionBounceTimeoutRef.current = null;
      }
    };
  }, []);

  const openInstanceEditor = useCallback(
    (instance: ScheduleInstance, originData: ScheduleEditOrigin | null) => {
      const sourceType = normalizeEditableScheduleSourceType(
        instance.source_type
      );
      if (!sourceType || !instance.source_id) {
        return;
      }

      const nextSnapshot: EditingSnapshot = {
        source_type: sourceType,
        projectId: sourceType === "PROJECT" ? instance.source_id : null,
        habitId: sourceType === "HABIT" ? instance.source_id : null,
        habitSnapshot:
          sourceType === "HABIT"
            ? buildHabitEditSnapshot(habitMap[instance.source_id] ?? null)
            : null,
        originData,
      };
      logEditingSnapshotEvent("openInstanceEditor", nextSnapshot, {
        instanceId: instance.id,
        hasOrigin: Boolean(originData),
      });
      setEditingSnapshot({
        ...nextSnapshot,
        instance,
      } as EditingSnapshot & { instance?: ScheduleInstance });
    },
    [habitMap]
  );

  const preventTimelineCardSelectStart = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  const bindProjectTimelineNoSelectSurface = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;
      element.addEventListener("selectstart", preventTimelineCardSelectStart);
    },
    [preventTimelineCardSelectStart]
  );

  const handleInstancePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      instance?: ScheduleInstance | null,
      onShortPress?: (() => void) | null,
      onLongPress?: (() => void) | null,
      habitId?: string,
      placement?: HabitTimelinePlacement
    ) => {
      if (onLongPress) {
        console.log("[INTERACT] POINTER DOWN", {
          pointerType: event.pointerType,
          button: event.button,
          buttons: event.buttons,
          instanceId: instance?.id,
        });
        if (instance?.overlay_window_id) {
          console.log("[OVERLAY_TOGGLE][stage1] pointer down", {
            instanceId: instance.id,
            overlay_window_id: instance.overlay_window_id,
            pointer: event.pointerType,
          });
        }
        if (event.pointerType !== "mouse") {
          event.preventDefault();
        }
        if (!instance && !habitId) return;
        const pointerType = event.pointerType;
        const isTouchLike =
          pointerType === "touch" ||
          pointerType === "pen" ||
          pointerType === "mouse" ||
          pointerType === "" ||
          pointerType === undefined;
        if (pointerType === "mouse" && event.button !== 0) {
          return;
        }
        if (DEBUG_LONG_PRESS) {
          console.log(
            `[LONGPRESS] down ${instance?.id || habitId} ${event.pointerType} ${
              event.button
            } ${event.buttons} ${performance.now()}`
          );
        }
        if (!isTouchLike) {
          activePressRef.current = null;
          longPressTriggeredRef.current = false;
          shortPressHandledRef.current = false;
          clearLongPressTimer();
          longPressOriginRef.current = null;
          pendingLongPressActionRef.current = null;
          return;
        }
        longPressOriginRef.current = event.currentTarget;
        event.currentTarget.setPointerCapture(event.pointerId);
        activePressRef.current = {
          instanceId: instance?.id || habitId || "",
          habitId,
          shortPress: onShortPress ?? null,
          pointerId: event.pointerId,
        };
        longPressTriggeredRef.current = false;
        shortPressHandledRef.current = false;
        pendingLongPressActionRef.current = null;
        clearLongPressTimer();
        console.log("[INTERACT] LONG PRESS TIMER SET", {
          delay: SCHEDULE_CARD_LONG_PRESS_MS,
        });
        const timerId = window.setTimeout(() => {
          console.log("[INTERACT] LONG PRESS TIMER FIRED");
          longPressTimerRef.current = null;
          if (DEBUG_LONG_PRESS) {
            console.log(`[LONGPRESS] timer fired`);
          }
          longPressTriggeredRef.current = true;
          if (DEBUG_LONG_PRESS) {
            console.log(`[LONGPRESS] OPEN EDITOR ${instance?.id || habitId}`);
          }
          console.log("[INTERACT] LONGPRESS OPEN", {
            id: instance?.id || habitId,
            source_type: instance?.source_type,
          });
          void hapticLongPress();
          onLongPress();
        }, SCHEDULE_CARD_LONG_PRESS_MS);
        longPressTimerRef.current = timerId;
        return;
      }
      console.log("[INTERACT] POINTER DOWN", {
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        instanceId: instance?.id,
      });
      if (instance?.overlay_window_id) {
        console.log("[OVERLAY_TOGGLE][stage1] pointer down", {
          instanceId: instance?.id,
          overlay_window_id: instance.overlay_window_id,
          pointer: event.pointerType,
        });
      }
      if (event.pointerType !== "mouse") {
        event.preventDefault();
      }
      if (!instance && !habitId) return;
      const pointerType = event.pointerType;
      const isTouchLike =
        pointerType === "touch" ||
        pointerType === "pen" ||
        pointerType === "mouse" ||
        pointerType === "" ||
        pointerType === undefined;
      if (pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (DEBUG_LONG_PRESS) {
        console.log(
          `[LONGPRESS] down ${instance?.id || habitId} ${event.pointerType} ${
            event.button
          } ${event.buttons} ${performance.now()}`
        );
      }
      if (!isTouchLike) {
        activePressRef.current = null;
        longPressTriggeredRef.current = false;
        shortPressHandledRef.current = false;
        clearLongPressTimer();
        longPressOriginRef.current = null;
        pendingLongPressActionRef.current = null;
        return;
      }
      longPressOriginRef.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
      activePressRef.current = {
        instanceId: instance?.id || habitId || "",
        habitId,
        shortPress: onShortPress ?? null,
        pointerId: event.pointerId,
      };
      longPressTriggeredRef.current = false;
      shortPressHandledRef.current = false;
      pendingLongPressActionRef.current = null;
      clearLongPressTimer();
      console.log("[INTERACT] LONG PRESS TIMER SET", {
        delay: SCHEDULE_CARD_LONG_PRESS_MS,
      });
      const timerId = window.setTimeout(() => {
        console.log("[INTERACT] LONG PRESS TIMER FIRED");
        longPressTimerRef.current = null;
        const element = longPressOriginRef.current;
        let originData: ScheduleEditOrigin | null = null;
        if (element) {
          const rect = element.getBoundingClientRect();
          const computed = window.getComputedStyle(element);
          const fallbackRadius = [
            computed.borderTopLeftRadius,
            computed.borderTopRightRadius,
            computed.borderBottomRightRadius,
            computed.borderBottomLeftRadius,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();
          const radius =
            (computed.borderRadius && computed.borderRadius.trim().length > 0
              ? computed.borderRadius
              : fallbackRadius) || "0px";
          const backgroundImage =
            computed.backgroundImage && computed.backgroundImage !== "none"
              ? computed.backgroundImage
              : undefined;
          const backgroundColorRaw = computed.backgroundColor;
          const backgroundColor =
            backgroundColorRaw &&
            backgroundColorRaw !== "rgba(0, 0, 0, 0)" &&
            backgroundColorRaw.toLowerCase() !== "transparent"
              ? backgroundColorRaw
              : undefined;
          const boxShadow =
            computed.boxShadow && computed.boxShadow !== "none"
              ? computed.boxShadow
              : undefined;
          originData = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            borderRadius: radius,
            backgroundColor,
            backgroundImage,
            boxShadow,
          };
        }
        if (DEBUG_LONG_PRESS) {
          console.log(`[LONGPRESS] timer fired`);
        }
        const active = activePressRef.current;
        if (active?.pointerId != null && longPressOriginRef.current) {
          try {
            longPressOriginRef.current.releasePointerCapture(active.pointerId);
          } catch {}
        }
        if (
          instance &&
          instance.source_id &&
          normalizeEditableScheduleSourceType(instance.source_type)
        ) {
          const sourceType = normalizeEditableScheduleSourceType(
            instance.source_type
          );
          if (!sourceType) return;
          if (DEBUG_LONG_PRESS) {
            console.log(`[LONGPRESS] feedback start`);
          }
          triggerLongPressFeedback(instance.id);
          longPressTriggeredRef.current = true;
          if (DEBUG_LONG_PRESS) {
            console.log(
              `[LONGPRESS] OPEN EDITOR ${instance.id} ${
                originData ? "hasOriginData" : "noOriginData"
              }`
            );
          }
          console.log("[INTERACT] LONGPRESS OPEN", {
            id: instance.id,
            source_type: instance.source_type,
          });
          void hapticLongPress();
          const nextSnapshot: EditingSnapshot = {
            source_type: sourceType,
            projectId: sourceType === "PROJECT" ? instance.source_id : null,
            habitId: sourceType === "HABIT" ? instance.source_id : null,
            habitSnapshot:
              sourceType === "HABIT"
                ? buildHabitEditSnapshot(habitMap[instance.source_id] ?? null)
                : null,
            originData,
          };
          logEditingSnapshotEvent("longpress-instance", nextSnapshot, {
            instanceId: instance.id,
            hasOrigin: Boolean(originData),
          });
          setEditingSnapshot({
            ...nextSnapshot,
            instance,
          } as EditingSnapshot & { instance?: ScheduleInstance });
        } else if (!instance && habitId) {
          if (DEBUG_LONG_PRESS) {
            console.log(`[LONGPRESS] feedback start for habit ${habitId}`);
          }
          triggerLongPressFeedback(habitId);
          longPressTriggeredRef.current = true;
          if (DEBUG_LONG_PRESS) {
            console.log(
              `[LONGPRESS] OPEN EDITOR ${habitId} ${
                originData ? "hasOriginData" : "noOriginData"
              }`
            );
          }
          console.log("[INTERACT] LONGPRESS OPEN", {
            id: habitId,
            source_type: "HABIT",
          });
          void hapticLongPress();
          const syntheticHabitInstance: ScheduleInstance = {
            id: `synthetic-${habitId}-${dayViewDateKey}`,
            source_type: "HABIT",
            source_id: habitId,
            user_id: userId ?? "",
            status: "scheduled",
            start_utc: placement?.rawStart ?? "",
            end_utc: placement?.rawEnd ?? "",
            duration_min: placement?.durationMinutes ?? null,
            energy_resolved: placement?.energyLabel ?? null,
            window_id: placement?.window.id ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const nextSnapshot: EditingSnapshot = {
            source_type: "HABIT",
            projectId: null,
            habitId,
            habitSnapshot: buildHabitEditSnapshot(habitMap[habitId] ?? null),
            originData,
          };
          logEditingSnapshotEvent("longpress-habit-synthetic", nextSnapshot, {
            instanceId: syntheticHabitInstance.id,
            hasOrigin: Boolean(originData),
          });
          setEditingSnapshot({
            ...nextSnapshot,
            instance: syntheticHabitInstance,
          } as EditingSnapshot & { instance?: ScheduleInstance });
        }
      }, SCHEDULE_CARD_LONG_PRESS_MS);
      longPressTimerRef.current = timerId;
    },
    [
      clearLongPressTimer,
      habitMap,
      triggerLongPressFeedback,
      dayViewDateKey,
      userId,
    ]
  );

  const handleInstancePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      console.log("[INTERACT] POINTER UP", {
        longPressTriggered: longPressTriggeredRef.current,
        activePress: activePressRef.current,
      });
      if (DEBUG_LONG_PRESS) {
        console.log(
          `[LONGPRESS] up ${
            activePressRef.current?.instanceId || "none"
          } ${performance.now()}`
        );
      }
      const pending = activePressRef.current;
      event.currentTarget.releasePointerCapture(event.pointerId);
      cancelLongPress();
      activePressRef.current = null;
      longPressOriginRef.current = null;
      if (pendingLongPressActionRef.current) {
        console.log("[INTERACT] OPEN EDITOR", {
          instanceId: pendingLongPressActionRef.current.instanceId,
          hasOrigin: Boolean(pendingLongPressActionRef.current.originData),
        });
        const instance = instances.find(
          (inst) => inst.id === pendingLongPressActionRef.current.instanceId
        );
        if (instance) {
          openInstanceEditor(
            instance,
            pendingLongPressActionRef.current.originData
          );
        }
        pendingLongPressActionRef.current = null;
      } else if (pending?.shortPress && !longPressTriggeredRef.current) {
        shortPressHandledRef.current = true;
        pending.shortPress();
      }
    },
    [cancelLongPress, openInstanceEditor]
  );

  const handleInstancePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      console.log("[INTERACT] POINTER CANCEL", {
        activePress: activePressRef.current,
      });
      if (DEBUG_LONG_PRESS) {
        console.log(`[LONGPRESS] cancel ${performance.now()}`);
      }
      event.currentTarget.releasePointerCapture(event.pointerId);
      activePressRef.current = null;
      cancelLongPress();
      longPressOriginRef.current = null;
      pendingLongPressActionRef.current = null;
    },
    [cancelLongPress]
  );

  const shouldBlockClickFromLongPress = useCallback(() => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return true;
    }
    if (shortPressHandledRef.current) {
      shortPressHandledRef.current = false;
      return true;
    }
    return false;
  }, []);

  const handleOpenDayTypeBlockConstraints = useCallback(
    (block: RepoWindow) => {
      if (!block.dayTypeTimeBlockId) return;
      setTimeBlockConstraintsError(null);
      setSelectedTimeBlockForConstraints({
        block,
        energy: resolveEnergyLevel(block.energy) ?? "NO",
        windowKind: normalizeTimeBlockConstraintKind(block.window_kind),
        locationContextId: block.location_context_id ?? null,
        allowAllHabitTypes: block.allowAllHabitTypes ?? true,
        allowedHabitTypes: normalizeConstraintSet(
          block.allowedHabitTypesSet ?? block.allowedHabitTypes
        ),
        allowAllSkills: block.allowAllSkills ?? true,
        allowedSkillIds: normalizeConstraintSet(
          block.allowedSkillIdsSet ?? block.allowedSkillIds
        ),
        allowAllMonuments: block.allowAllMonuments ?? true,
        allowedMonumentIds: normalizeConstraintSet(
          block.allowedMonumentIdsSet ?? block.allowedMonumentIds
        ),
      });
    },
    []
  );

  const handleSaveTimeBlockConstraints = useCallback(async () => {
    const draft = selectedTimeBlockForConstraints;
    if (!draft) return;
    const dayTypeTimeBlockId = draft.block.dayTypeTimeBlockId;
    if (!dayTypeTimeBlockId) {
      setTimeBlockConstraintsError("This Time Block cannot be edited here.");
      return;
    }

    setIsSavingTimeBlockConstraints(true);
    setTimeBlockConstraintsError(null);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      if (!userId) throw new Error("User not found");

      const { error: updateError } = await supabase
        .from("day_type_time_blocks")
        .update({
          energy: draft.energy,
          block_type: draft.windowKind,
          location_context_id: draft.locationContextId,
          allow_all_habit_types: draft.allowAllHabitTypes,
          allow_all_skills: draft.allowAllSkills,
          allow_all_monuments: draft.allowAllMonuments,
        } as never)
        .eq("id", dayTypeTimeBlockId)
        .eq("user_id", userId);
      if (updateError) throw updateError;

      const allowedHabitTypes = Array.from(draft.allowedHabitTypes)
        .map((value) => value.trim().toUpperCase())
        .filter((value, index, array) => value && array.indexOf(value) === index);
      const allowedSkillIds = Array.from(draft.allowedSkillIds)
        .map((value) => value.trim())
        .filter((value, index, array) => value && array.indexOf(value) === index);
      const allowedMonumentIds = Array.from(draft.allowedMonumentIds)
        .map((value) => value.trim())
        .filter((value, index, array) => value && array.indexOf(value) === index);

      const { error: habitDeleteError } = await supabase
        .from("day_type_time_block_allowed_habit_types")
        .delete()
        .eq("day_type_time_block_id", dayTypeTimeBlockId);
      if (habitDeleteError) throw habitDeleteError;
      if (!draft.allowAllHabitTypes && allowedHabitTypes.length > 0) {
        const { error: habitInsertError } = await supabase
          .from("day_type_time_block_allowed_habit_types")
          .insert(
            allowedHabitTypes.map((habitType) => ({
              user_id: userId,
              day_type_time_block_id: dayTypeTimeBlockId,
              habit_type: habitType,
            })) as never
          );
        if (habitInsertError) throw habitInsertError;
      }

      const { error: skillDeleteError } = await supabase
        .from("day_type_time_block_allowed_skills")
        .delete()
        .eq("day_type_time_block_id", dayTypeTimeBlockId);
      if (skillDeleteError) throw skillDeleteError;
      if (!draft.allowAllSkills && allowedSkillIds.length > 0) {
        const { error: skillInsertError } = await supabase
          .from("day_type_time_block_allowed_skills")
          .insert(
            allowedSkillIds.map((skillId) => ({
              user_id: userId,
              day_type_time_block_id: dayTypeTimeBlockId,
              skill_id: skillId,
            })) as never
          );
        if (skillInsertError) throw skillInsertError;
      }

      const { error: monumentDeleteError } = await supabase
        .from("day_type_time_block_allowed_monuments")
        .delete()
        .eq("day_type_time_block_id", dayTypeTimeBlockId);
      if (monumentDeleteError) throw monumentDeleteError;
      if (!draft.allowAllMonuments && allowedMonumentIds.length > 0) {
        const { error: monumentInsertError } = await supabase
          .from("day_type_time_block_allowed_monuments")
          .insert(
            allowedMonumentIds.map((monumentId) => ({
              user_id: userId,
              day_type_time_block_id: dayTypeTimeBlockId,
              monument_id: monumentId,
            })) as never
          );
        if (monumentInsertError) throw monumentInsertError;
      }

      setSelectedTimeBlockForConstraints(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(DAY_TYPE_BLOCK_UPDATED_EVENT));
      }
      void refreshDayTypeWindows();
      toast.success("Time Block updated", "Constraints saved.");
    } catch (error: unknown) {
      console.error("Unable to save Time Block constraints", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save Time Block constraints.";
      setTimeBlockConstraintsError(message);
      toast.error("Unable to save Time Block", message);
    } finally {
      setIsSavingTimeBlockConstraints(false);
    }
  }, [refreshDayTypeWindows, selectedTimeBlockForConstraints, toast]);

  const timeBlockConstraintSkillOptions = useMemo(
    () =>
      skills.map((skill) => ({
        value: skill.id,
        label: skill.name || "Untitled skill",
      })),
    [skills]
  );
  const timeBlockConstraintMonumentOptions = useMemo(
    () =>
      monuments.map((monument) => ({
        value: monument.id,
        label: monument.title || "Untitled monument",
      })),
    [monuments]
  );
  const sortedTimeBlockConstraintSkills = useMemo(
    () =>
      [...skills].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
      ),
    [skills]
  );
  const sortedTimeBlockConstraintMonuments = useMemo(
    () =>
      [...monuments].sort((a, b) =>
        (a.title ?? "").localeCompare(b.title ?? "")
      ),
    [monuments]
  );
  const filteredTimeBlockConstraintSkills = useMemo(() => {
    const term = timeBlockSkillSearch.trim().toLowerCase();
    return sortedTimeBlockConstraintSkills.filter((skill) =>
      (skill.name ?? "").toLowerCase().includes(term)
    );
  }, [sortedTimeBlockConstraintSkills, timeBlockSkillSearch]);
  const filteredTimeBlockConstraintMonuments = useMemo(() => {
    const term = timeBlockMonumentSearch.trim().toLowerCase();
    return sortedTimeBlockConstraintMonuments.filter((monument) =>
      (monument.title ?? "").toLowerCase().includes(term)
    );
  }, [sortedTimeBlockConstraintMonuments, timeBlockMonumentSearch]);
  const selectedTimeBlockLocationOptions = useMemo(() => {
    if (!selectedTimeBlockForConstraints?.locationContextId) {
      return timeBlockLocationOptions ?? [];
    }
    const hasSelected = (timeBlockLocationOptions ?? []).some(
      (option) => option.id === selectedTimeBlockForConstraints.locationContextId
    );
    if (hasSelected) return timeBlockLocationOptions ?? [];
    return [
      ...(timeBlockLocationOptions ?? []),
      {
        id: selectedTimeBlockForConstraints.locationContextId,
        value:
          selectedTimeBlockForConstraints.block.location_context_value ??
          selectedTimeBlockForConstraints.locationContextId,
        label:
          selectedTimeBlockForConstraints.block.location_context_name ??
          selectedTimeBlockForConstraints.block.location_context_value ??
          "Location",
      },
    ];
  }, [selectedTimeBlockForConstraints, timeBlockLocationOptions]);

  const dayTimelineModel = useMemo(() => {
    return buildDayTimelineModel({
      date: currentDate,
      windows,
      instances: visibleInstances,
      projectMap,
      taskMap,
      tasksByProjectId,
      habits,
      startHour,
      pxPerMin,
      unscheduledProjects,
      schedulerFailureByProjectId,
      schedulerDebug,
      schedulerTimelinePlacements,
      timeZoneShortName,
      friendlyTimeZone,
      localTimeZone: effectiveTimeZone,
      todayDateKey: canonicalTodayDateKey,
    });
  }, [
    currentDate,
    windows,
    visibleInstances,
    projectMap,
    taskMap,
    tasksByProjectId,
    habits,
    startHour,
    pxPerMin,
    unscheduledProjects,
    schedulerFailureByProjectId,
    schedulerDebug,
    schedulerTimelinePlacements,
    timeZoneShortName,
    friendlyTimeZone,
    effectiveTimeZone,
    canonicalTodayDateKey,
  ]);

  const currentDayProjectInstances = useMemo(() => {
    if (!dayTimelineModel) return [];
    return dayTimelineModel.projectInstances
      .map((projectInstance) => {
        const clipped = clipSegmentToDay(
          projectInstance.start,
          projectInstance.end,
          renderDayStart,
          renderDayEnd
        );
        if (!clipped) return null;
        return {
          ...projectInstance,
          start: clipped.segStart,
          end: clipped.segEnd,
        };
      })
      .filter((instance): instance is ProjectInstance => instance !== null);
  }, [dayTimelineModel, renderDayStart, renderDayEnd]);

  const currentDayProjectInstancesRef = useRef<ProjectInstance[]>([]);

  useEffect(() => {
    currentDayProjectInstancesRef.current = currentDayProjectInstances;
  }, [currentDayProjectInstances]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const lastPointerClientYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollDirectionRef = useRef<"up" | "down" | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    autoScrollDirectionRef.current = null;
  }, []);

  useEffect(() => {
    if (!manualPlacementSession) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setManualPlacementSession(null);
        manualPlacementSessionRef.current = null;
        manualPlacementPointerIdRef.current = null;
        stopAutoScroll();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manualPlacementSession, stopAutoScroll]);

  useEffect(() => {
    return () => stopAutoScroll();
  }, [stopAutoScroll]);

  const baseTimelineHeight = useMemo(
    () =>
      dayTimelineModel
        ? computeDayTimelineHeightPx(dayTimelineModel.startHour, pxPerMin)
        : 0,
    [dayTimelineModel?.startHour, pxPerMin]
  );

  const measuredTimelineContainerHeight =
    dayTimelineContainerRef.current?.offsetHeight ?? null;

  const timelineChromeHeight = useMemo(() => {
    if (
      measuredTimelineContainerHeight !== null &&
      Number.isFinite(measuredTimelineContainerHeight)
    ) {
      const chrome = Math.max(
        0,
        measuredTimelineContainerHeight - baseTimelineHeight
      );
      if (!Number.isNaN(chrome)) {
        lastTimelineChromeHeightRef.current = chrome;
        return chrome;
      }
    }
    return lastTimelineChromeHeightRef.current;
  }, [measuredTimelineContainerHeight, baseTimelineHeight]);

  const resolveManualPlacementTime = useCallback(
    (clientY: number) => {
      if (!dayTimelineModel) return null;
      const container = dayTimelineContainerRef.current;
      const timelineEl = container?.querySelector(
        ".timeline-content"
      ) as HTMLElement | null;
      if (!timelineEl) return null;
      const rect = timelineEl.getBoundingClientRect();
      const offsetY = clientY - rect.top;
      if (!Number.isFinite(offsetY)) return null;
      const minutesFromStart =
        offsetY / pxPerMin + (dayTimelineModel.startHour ?? 0) * 60;
      const clampedMinutes = Math.min(Math.max(minutesFromStart, 0), 24 * 60);
      return new Date(renderDayStart.getTime() + clampedMinutes * 60_000);
    },
    [dayTimelineModel, pxPerMin, renderDayStart]
  );

  const updatePreviewAndScrollIntent = useCallback(
    (clientY: number) => {
      lastPointerClientYRef.current = clientY;
      const next = resolveManualPlacementTime(clientY);
      const preview = next ? snapToFiveMinuteGrid(next) : null;
      updateManualPlacementSession((prev) =>
        prev
          ? {
              ...prev,
              previewTime: preview ?? prev.previewTime,
              pushPreview: preview
                ? computeManualPlacementPushPreview(
                    prev.candidate,
                    preview,
                    currentDayProjectInstances
                  )
                : null,
            }
          : prev
      );

      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight ?? 0;
      if (!(viewportHeight > 0)) {
        stopAutoScroll();
        return;
      }
      const activationZone = 96;
      const topDistance = clientY;
      const bottomDistance = viewportHeight - clientY;
      const withinTop = topDistance >= 0 && topDistance <= activationZone;
      const withinBottom =
        bottomDistance >= 0 && bottomDistance <= activationZone;

      if (!withinTop && !withinBottom) {
        stopAutoScroll();
        return;
      }

      const direction = withinTop ? "up" : "down";
      const distance = withinTop ? topDistance : bottomDistance;
      const intensity = 1 - Math.min(Math.max(distance / activationZone, 0), 1);
      const minSpeed = 80; // px/sec
      const maxSpeed = 320; // px/sec
      const speed = minSpeed + (maxSpeed - minSpeed) * intensity;

      const step = () => {
        const frameMs = 16;
        const delta = (speed * frameMs) / 1000;
        const sign = direction === "up" ? -1 : 1;
        window.scrollBy({ top: sign * delta, behavior: "auto" });
        const lastY = lastPointerClientYRef.current;
        if (lastY !== null) {
          const refreshed = resolveManualPlacementTime(lastY);
          const preview = refreshed ? snapToFiveMinuteGrid(refreshed) : null;
          updateManualPlacementSession((prev) =>
            prev
              ? {
                  ...prev,
                  previewTime: preview ?? prev.previewTime,
                  pushPreview: preview
                    ? computeManualPlacementPushPreview(
                        prev.candidate,
                        preview,
                        currentDayProjectInstances
                      )
                    : null,
                }
              : prev
          );
        }
        autoScrollFrameRef.current = requestAnimationFrame(step);
      };

      if (autoScrollDirectionRef.current !== direction) {
        stopAutoScroll();
      }
      autoScrollDirectionRef.current = direction;
      if (autoScrollFrameRef.current === null) {
        autoScrollFrameRef.current = requestAnimationFrame(step);
      }
    },
    [
      resolveManualPlacementTime,
      snapToFiveMinuteGrid,
      stopAutoScroll,
      currentDayProjectInstances,
      updateManualPlacementSession,
    ]
  );

  useEffect(() => {
    if (!manualPlacementSession) return;
    const finishManualPlacementAt = (clientY: number) => {
      const session = manualPlacementSessionRef.current;
      if (!session) return;
      const next = resolveManualPlacementTime(clientY);
      const preview =
        next ??
        (session.previewTime
          ? snapToFiveMinuteGrid(session.previewTime)
          : null);
      if (preview) {
        void commitManualPlacement(session.candidate, preview);
      }
      setManualPlacementSession(null);
      manualPlacementSessionRef.current = null;
      manualPlacementPointerIdRef.current = null;
      stopAutoScroll();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      if (pointerId !== null && event.pointerId !== pointerId) return;
      const clientY = event.clientY;
      updateManualPlacementSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ghost: {
            ...prev.ghost,
            x: event.clientX,
            y: event.clientY,
            mode: "placing",
          },
        };
      });
      updatePreviewAndScrollIntent(clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      if (pointerId !== null && event.pointerId !== pointerId) return;
      finishManualPlacementAt(event.clientY);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      if (pointerId !== null && event.pointerId !== pointerId) return;
      setManualPlacementSession(null);
      manualPlacementSessionRef.current = null;
      manualPlacementPointerIdRef.current = null;
      stopAutoScroll();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      const touches = Array.from(event.touches);
      const touch =
        (pointerId !== null
          ? touches.find((item) => item.identifier === pointerId)
          : null) ?? (touches.length === 1 ? touches[0] : null);
      if (!touch) return;

      // iOS Safari can otherwise hand the gesture over to page scrolling and
      // cancel the pointer stream as soon as the drag crosses the timeline.
      if (event.cancelable) {
        event.preventDefault();
      }

      updateManualPlacementSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ghost: {
            ...prev.ghost,
            x: touch.clientX,
            y: touch.clientY,
            mode: "placing",
          },
        };
      });
      lastPointerClientYRef.current = touch.clientY;
      updatePreviewAndScrollIntent(touch.clientY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      const touches = Array.from(event.changedTouches);
      const touch =
        (pointerId !== null
          ? touches.find((item) => item.identifier === pointerId)
          : null) ?? (touches.length === 1 ? touches[0] : null);
      if (!touch) return;
      finishManualPlacementAt(touch.clientY);
    };

    const handleTouchCancel = (event: TouchEvent) => {
      const pointerId = manualPlacementPointerIdRef.current;
      if (pointerId !== null) {
        const touch = Array.from(event.changedTouches).find(
          (item) => item.identifier === pointerId
        );
        if (!touch) return;
      }
      setManualPlacementSession(null);
      manualPlacementSessionRef.current = null;
      manualPlacementPointerIdRef.current = null;
      stopAutoScroll();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [
    commitManualPlacement,
    manualPlacementSession,
    resolveManualPlacementTime,
    snapToFiveMinuteGrid,
    stopAutoScroll,
    updatePreviewAndScrollIntent,
    updateManualPlacementSession,
  ]);

  const renderDayTimeline = useCallback(
    (model: DayTimelineModel | null, options?: DayTimelineRenderOptions) => {
      if (!model) return null;
      const {
        dayViewDateKey,
        date,
        startHour: modelStartHour,
        windows: modelWindows,
        projectInstances: modelProjectInstances,
        taskInstancesByProject: modelTaskInstancesByProject,
        tasksByProjectId: modelTasksByProjectId,
        standaloneTaskInstances: modelStandaloneTaskInstances,
        habitPlacements: modelHabitPlacements,
        windowReports: modelWindowReports,
        viewTimeZone,
      } = model;
      const renderDayStart = getRenderDayStart(date, viewTimeZone);
      const renderDayEnd = addDaysInTimeZone(renderDayStart, 1, viewTimeZone);

      const modelPxPerMin = pxPerMin;
      const todayDateKey = model.todayDateKey;
      console.log("[HABIT_COMPLETION][TIMELINE_DAYKEY]", {
        dayViewDateKey,
        todayDateKey,
        timestamp: new Date().toISOString(),
      });

      const dayHabitPlacements = modelHabitPlacements
        .map((placement) => {
          const clipped = clipSegmentToDay(
            placement.start,
            placement.end,
            renderDayStart,
            renderDayEnd
          );
          if (!clipped) return null;
          return {
            ...placement,
            start: clipped.segStart,
            end: clipped.segEnd,
          };
        })
        .filter(
          (placement): placement is HabitTimelinePlacement => placement !== null
        );
      const dayProjectInstances = modelProjectInstances
        .map((projectInstance) => {
          const clipped = clipSegmentToDay(
            projectInstance.start,
            projectInstance.end,
            renderDayStart,
            renderDayEnd
          );
          if (!clipped) return null;
          return {
            ...projectInstance,
            start: clipped.segStart,
            end: clipped.segEnd,
          };
        })
        .filter(
          (instance): instance is ProjectInstance => instance !== null
        );
      const shouldHideTemporaryOverlayWindow = (
        overlay: OverlayWindowRecord,
        end: Date
      ) => {
        if (!isTemporaryOverlayWindowMode(overlay.mode)) return false;
        if (overlayWindowIdsWithEvents.has(overlay.id)) return false;
        const endMs = end.getTime();
        return Number.isFinite(endMs) && endMs <= overlayVisibilityNowMs;
      };
      const overlaySegments = [
        ...overlayWindows.map((overlay, sourceIndex) => {
          if (!overlay.start_utc || !overlay.end_utc) return null;
          const start = new Date(overlay.start_utc);
          const end = new Date(overlay.end_utc);
          if (shouldHideTemporaryOverlayWindow(overlay, end)) return null;
          const clipped = clipSegmentToDay(
            start,
            end,
            renderDayStart,
            renderDayEnd
          );
          if (!clipped) return null;
          const startMin = getDayMinuteOffset(clipped.segStart, renderDayStart);
          const endMin = getDayMinuteOffset(clipped.segEnd, renderDayStart);
          const durationMin = endMin - startMin;
          if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
          return {
            id: overlay.id,
            source: "overlay_window" as const,
            startMin,
            durationMin,
            label: null,
            icon: null,
            rangeLabel: null,
            createdAt: overlay.created_at,
            updatedAt: overlay.updated_at,
            sourceIndex,
          };
        }),
        ...commandBlocks.map((commandBlock, sourceIndex) => {
          if (!commandBlock.starts_at || !commandBlock.ends_at) return null;
          const start = new Date(commandBlock.starts_at);
          const end = new Date(commandBlock.ends_at);
          const clipped = clipSegmentToDay(
            start,
            end,
            renderDayStart,
            renderDayEnd
          );
          if (!clipped) return null;
          const startMin = getDayMinuteOffset(clipped.segStart, renderDayStart);
          const endMin = getDayMinuteOffset(clipped.segEnd, renderDayStart);
          const durationMin = endMin - startMin;
          if (!Number.isFinite(durationMin) || durationMin <= 0) return null;
          const circleName = commandBlock.circle_name?.trim() || "Circle";
          return {
            id: commandBlock.id,
            source: "command_block" as const,
            startMin,
            durationMin,
            label: `${circleName} Command Block`,
            icon: commandBlock.circle_icon_emoji?.trim() || null,
            rangeLabel: `${formatTimeForWindow(
              clipped.segStart,
              viewTimeZone
            )} - ${formatTimeForWindow(clipped.segEnd, viewTimeZone)}`,
            createdAt: null,
            updatedAt: null,
            sourceIndex,
          };
        }),
      ]
        .filter(
          (segment): segment is OverlayWindowSegment => segment !== null
        )
        .sort((a, b) => a.startMin - b.startMin);
      const overlayWindowSegments = overlaySegments.filter(
        (segment) => segment.source === "overlay_window"
      );
      const overlayWindowLayerRankById = new Map<string, number>();
      [...overlayWindowSegments]
        .sort(compareOverlaySegmentStackOrder)
        .forEach((segment, index) => {
          overlayWindowLayerRankById.set(segment.id, index);
        });
      const getOverlayWindowBaseZIndex = (overlayWindowId: string | null) => {
        if (!overlayWindowId) return null;
        const rank = overlayWindowLayerRankById.get(overlayWindowId);
        if (rank === undefined) return null;
        return (
          TIMELINE_OVERLAY_STACK_BASE_Z_INDEX +
          rank * TIMELINE_OVERLAY_STACK_STEP
        );
      };
      const getOverlayBackedCardZIndex = (
        fallbackZIndex: number,
        overlayWindowId: string | null | undefined
      ) => {
        const overlayBaseZIndex =
          getOverlayWindowBaseZIndex(overlayWindowId ?? null);
        if (overlayBaseZIndex === null) return fallbackZIndex;
        return Math.max(fallbackZIndex, overlayBaseZIndex + 1);
      };
      const getNewerOverlayRanges = (segment: OverlayWindowSegment) => {
        if (segment.source !== "overlay_window") return [];
        return overlayWindowSegments
          .filter(
            (candidate) =>
              candidate.id !== segment.id &&
              compareOverlaySegmentStackOrder(segment, candidate) < 0
          )
          .map((candidate) => {
            const start = candidate.startMin - modelStartHour * 60;
            const end = start + candidate.durationMin;
            const clampedStart = Math.max(0, start);
            const clampedEnd = Math.max(clampedStart, end);
            if (
              !Number.isFinite(clampedStart) ||
              !Number.isFinite(clampedEnd) ||
              clampedEnd <= clampedStart
            ) {
              return null;
            }
            return { start: clampedStart, end: clampedEnd };
          })
          .filter((range): range is MinuteRange => range !== null)
          .sort((a, b) => a.start - b.start);
      };
      const overlayRanges = overlaySegments
        .map((segment) => {
          const start = segment.startMin - modelStartHour * 60;
          const end = start + segment.durationMin;
          const clampedStart = Math.max(0, start);
          const clampedEnd = Math.max(clampedStart, end);
          if (!Number.isFinite(clampedStart) || !Number.isFinite(clampedEnd)) {
            return null;
          }
          if (clampedEnd <= clampedStart) return null;
          return { start: clampedStart, end: clampedEnd };
        })
        .filter(
          (range): range is MinuteRange => range !== null
        )
        .sort((a, b) => a.start - b.start);
      const overlayLayerZIndex = Math.max(
        0,
        TIMELINE_STACK_BASE_Z_INDEX - 5
      );
      const scheduledCardsByInstanceId = new Map<string, ProjectTaskCard[]>();
      for (const projectInstance of dayProjectInstances) {
        const projectTasks =
          modelTaskInstancesByProject[projectInstance.project.id] ?? [];
        const scheduledCards = projectTasks
          .filter((taskInfo) =>
            taskMatchesProjectInstance(
              taskInfo,
              projectInstance.instance,
              projectInstance.start,
              projectInstance.end
            )
          )
          .map((taskInfo) => ({
            key: `scheduled:${taskInfo.instance.id}`,
            kind: "scheduled" as const,
            task: taskInfo.task,
            start: taskInfo.start,
            end: taskInfo.end,
            instanceId: taskInfo.instance.id,
            displayDurationMinutes: Math.max(
              1,
              Math.round(
                (taskInfo.end.getTime() - taskInfo.start.getTime()) / 60000
              )
            ),
          }));
        if (scheduledCards.length > 0) {
          scheduledCardsByInstanceId.set(projectInstance.instance.id, scheduledCards);
        }
      }
      const occupiedSegments: Array<{ start: Date; end: Date }> = [];
      const addOccupiedSegment = (segmentStart: Date, segmentEnd: Date) => {
        if (
          !isValidDate(segmentStart) ||
          !isValidDate(segmentEnd) ||
          segmentStart.getTime() >= segmentEnd.getTime()
        ) {
          return;
        }
        occupiedSegments.push({ start: segmentStart, end: segmentEnd });
      };
      dayHabitPlacements.forEach((placement) =>
        addOccupiedSegment(placement.start, placement.end)
      );
      dayProjectInstances.forEach((instance) =>
        addOccupiedSegment(instance.start, instance.end)
      );
      for (const scheduledCards of scheduledCardsByInstanceId.values()) {
        scheduledCards.forEach((card) =>
          addOccupiedSegment(card.start, card.end)
        );
      }
      modelStandaloneTaskInstances.forEach((taskInfo) =>
        addOccupiedSegment(taskInfo.start, taskInfo.end)
      );

      let hasLoggedInstance = false;

      const toTimelinePosition = (minutes: number) => {
        if (!Number.isFinite(minutes)) return "0px";
        return `calc(var(--timeline-minute-unit) * ${minutes})`;
      };

      const containerClass = options?.disableInteractions
        ? "pointer-events-none select-none"
        : "";

      const timelineTouchAction = manualPlacementSession
        ? "none"
        : TIMELINE_TOUCH_ACTION;

      const containerStyle: CSSProperties = options?.fullBleed
        ? {
            ...TIMELINE_CSS_VARIABLES,
            ...TIMELINE_FULL_BLEED_STYLE,
            touchAction: timelineTouchAction,
          }
        : {
            ...TIMELINE_CSS_VARIABLES,
            touchAction: timelineTouchAction,
          };

      const { habitLayouts, projectLayouts, taskLayouts, syncHabitLaneLayouts } =
        computeTimelineLayoutForSyncHabits({
          habitPlacements: dayHabitPlacements,
          projectInstances: dayProjectInstances,
          taskInstances: modelStandaloneTaskInstances,
          syncPairingsByInstanceId: syncPairings,
        });

      const projectInstanceIndexById = new Map<string, number>();
      dayProjectInstances.forEach((projectInstance, projectIndex) => {
        const instanceId =
          projectInstance.instance?.id ?? projectInstance.instanceId ?? null;
        if (instanceId) {
          projectInstanceIndexById.set(instanceId, projectIndex);
        }
      });

      const habitPairedProjectIndex = new Map<number, number>();
      dayHabitPlacements.forEach((placement, habitIndex) => {
        const instanceId = placement.instanceId;
        if (!instanceId) return;
        const partnerIds = syncPairings[instanceId] ?? [];
        for (const partnerId of partnerIds) {
          const projectIndex = projectInstanceIndexById.get(partnerId);
          if (projectIndex !== undefined) {
            habitPairedProjectIndex.set(habitIndex, projectIndex);
            break;
          }
        }
      });

      const manualTimelineGhost = (() => {
        if (!manualPlacementSession?.previewTime) return null;
        const previewStart = snapToFiveMinuteGrid(
          manualPlacementSession.previewTime
        );
        const previewEnd = new Date(
          previewStart.getTime() +
            manualPlacementSession.candidate.durationMinutes * 60_000
        );
        const clipped = clipSegmentToDay(
          previewStart,
          previewEnd,
          renderDayStart,
          renderDayEnd
        );
        if (!clipped) return null;
        const startMin = getDayMinuteOffset(clipped.segStart, renderDayStart);
        const durationMinutes =
          (clipped.segEnd.getTime() - clipped.segStart.getTime()) / 60000;
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
          return null;
        }
        const startOffsetMinutes = Math.max(
          0,
          startMin - modelStartHour * 60
        );
        const heightPx = Math.max(durationMinutes * modelPxPerMin, 1);
        return {
          top: toTimelinePosition(startOffsetMinutes),
          height: toTimelinePosition(durationMinutes),
          heightPx,
        };
      })();
      const shouldHideManualPlacementInstance = (
        instanceId?: string | null
      ) => {
        const draggedInstanceId =
          manualPlacementSession?.candidate.instanceId;
        return Boolean(
          draggedInstanceId &&
            instanceId &&
            draggedInstanceId === instanceId
        );
      };

      return (
        <div
          className={containerClass}
          ref={options?.containerRef ?? undefined}
          style={containerStyle}
        >
          <DayTimeline
            date={date}
            startHour={modelStartHour}
            pxPerMin={modelPxPerMin}
            zoomPxPerMin={animatedPxPerMin}
            style={TIMELINE_CSS_VARIABLES}
          >
            {modelWindows.map((w) => {
              const { topMinutes, heightMinutes } = windowRectMinutes(
                w,
                modelStartHour
              );
              if (!Number.isFinite(heightMinutes) || heightMinutes <= 0) {
                return null;
              }
              const windowSegments = subtractOverlayRangesFromWindow(
                { start: topMinutes, end: topMinutes + heightMinutes },
                overlayRanges
              );
              if (windowSegments.length === 0) {
                return null;
              }
              return windowSegments.map((segment, index) => {
                const segmentHeightPx = Math.max(
                  0,
                  (segment.end - segment.start) * modelPxPerMin
                );
                const shouldShowLabel =
                  index === 0 &&
                  typeof w.label === "string" &&
                  w.label.trim().length > 0 &&
                  segmentHeightPx >= 24;
                return (
                  <div
                    key={`${w.id}-${index}`}
                    aria-label={index === 0 ? w.label : undefined}
                    className="absolute left-0 flex"
                    style={{
                      top: toTimelinePosition(segment.start),
                      height: toTimelinePosition(segment.end - segment.start),
                    }}
                  >
                    <div className="w-0.5 bg-zinc-700 opacity-50" />
                    {shouldShowLabel ? (
                      w.dayTypeTimeBlockId ? (
                        <DayTypeBlockLabel
                          label={w.label ?? ""}
                          availableHeight={segmentHeightPx}
                          onActivate={() => handleOpenDayTypeBlockConstraints(w)}
                        />
                      ) : (
                        <WindowLabel
                          label={w.label ?? ""}
                          availableHeight={segmentHeightPx}
                        />
                      )
                    ) : null}
                  </div>
                );
              });
            })}
            {modelWindowReports.map((report) => {
              const { rangeStart, rangeEnd } = report;
              if (!isValidDate(rangeStart) || !isValidDate(rangeEnd)) {
                return null;
              }
              const renderRangeStartMin = getDayMinuteOffset(
                rangeStart,
                renderDayStart
              );
              const renderRangeEndMin = getDayMinuteOffset(rangeEnd, renderDayStart);
              const startMin = renderRangeStartMin - modelStartHour * 60;
              const endMin = renderRangeEndMin - modelStartHour * 60;
              const baseRange = { start: startMin, end: endMin };
              const visibleSegments = subtractOverlayRangesFromWindow(
                baseRange,
                overlayRanges
              ).filter(
                (segment) =>
                  Number.isFinite(segment.start) &&
                  Number.isFinite(segment.end) &&
                  segment.end > segment.start
              );
              if (visibleSegments.length === 0) return null;

              const reportContent = (
                <div className="flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-zinc-700/55 bg-transparent px-3 py-2 text-slate-50 shadow-none">
                  <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-white/70">
                    <FlameEmber
                      level={report.energyLabel}
                      size="xs"
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate text-white/75">{report.windowLabel}</span>
                    <span className="shrink-0 text-white/50">
                      {report.rangeLabel}
                    </span>
                    <span className="ml-auto shrink-0 text-[9px] uppercase tracking-wide text-white/45">
                      {report.window.window_kind === "DEFAULT"
                        ? "FOCUS"
                        : report.window.window_kind}
                    </span>
                  </div>
                </div>
              );

              return visibleSegments.map((segment, index) => {
                const heightMinutes = segment.end - segment.start;
                if (!Number.isFinite(heightMinutes) || heightMinutes <= 0) {
                  return null;
                }
                const segmentHeightPx = Math.max(0, heightMinutes * modelPxPerMin);
                return (
                  <div
                    key={`${report.key}-${index}`}
                    className="absolute"
                    style={{
                      ...TIMELINE_CARD_BOUNDS,
                      top: toTimelinePosition(Math.max(0, segment.start)),
                      height: toTimelinePosition(Math.max(0, heightMinutes)),
                      zIndex: 10,
                    }}
                  >
                    {index === 0 ? (
                      reportContent
                    ) : (
                      <div
                        className="h-full w-full rounded-[var(--radius-lg)] border border-slate-700/80 bg-transparent"
                        style={{
                          minHeight: segmentHeightPx,
                        }}
                      />
                    )}
                  </div>
                );
              });
            })}
            <div
              className="pointer-events-none absolute inset-0"
            >
              {overlaySegments.map((segment) => {
                const start = segment.startMin - modelStartHour * 60;
                const end = start + segment.durationMin;
                const clampedStart = Math.max(0, start);
                const clampedEnd = Math.max(clampedStart, end);
                const heightMin = clampedEnd - clampedStart;
                if (!Number.isFinite(heightMin) || heightMin <= 0) return null;
                const isCommandBlock = segment.source === "command_block";
                const visibleSegments = isCommandBlock
                  ? [{ start: clampedStart, end: clampedEnd }]
                  : subtractOverlayRangesFromWindow(
                      { start: clampedStart, end: clampedEnd },
                      getNewerOverlayRanges(segment)
                    );
                const overlayBaseZIndex =
                  segment.source === "overlay_window"
                    ? getOverlayWindowBaseZIndex(segment.id)
                    : null;
                const segmentZIndex =
                  overlayBaseZIndex ?? overlayLayerZIndex;
                return visibleSegments.map((visibleSegment, index) => {
                  const visibleHeightMin =
                    visibleSegment.end - visibleSegment.start;
                  if (
                    !Number.isFinite(visibleHeightMin) ||
                    visibleHeightMin <= 0
                  ) {
                    return null;
                  }
                  const heightPx = visibleHeightMin * modelPxPerMin;
                  const showCommandLabel =
                    isCommandBlock && segment.label && heightPx >= 24;
                  const showCommandRange =
                    showCommandLabel && segment.rangeLabel && heightPx >= 42;
                  return (
                    <div
                      key={`${segment.source}-${segment.id}-${index}`}
                      className={clsx(
                        "absolute overflow-hidden rounded-[var(--radius-lg)] bg-zinc-950",
                        isCommandBlock
                          ? "pointer-events-none border border-white/10 shadow-[0_14px_30px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.08)]"
                          : "pointer-events-auto border border-zinc-800"
                      )}
                      style={{
                        ...TIMELINE_CARD_BOUNDS,
                        top: toTimelinePosition(visibleSegment.start),
                        height: toTimelinePosition(visibleHeightMin),
                        zIndex: segmentZIndex,
                      }}
                      aria-label={segment.label ?? undefined}
                    >
                      {showCommandLabel ? (
                        <div className="flex h-full min-h-0 flex-col justify-center px-3 py-1.5 text-white">
                          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold leading-tight">
                            {segment.icon ? (
                              <span
                                className="shrink-0 leading-none"
                                aria-hidden="true"
                              >
                                {segment.icon}
                              </span>
                            ) : null}
                            <span className="min-w-0 truncate">
                              {segment.label}
                            </span>
                          </div>
                          {showCommandRange ? (
                            <div className="mt-0.5 truncate text-[10px] font-medium leading-tight text-white/60">
                              {segment.rangeLabel}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                });
              })}
            </div>
            {dayHabitPlacements.map((placement, index) => {
              if (!isValidDate(placement.start) || !isValidDate(placement.end))
                return null;
              const normalizedHabitType = normalizeTimelineHabitType(
                placement.habitType
              );
              const displayStart = placement.start;
              const displayEnd = placement.end;
              const startMin = getDayMinuteOffset(displayStart, renderDayStart);
              const startOffsetMinutes = startMin;
              let durationMinutes = Math.max(
                0,
                (displayEnd.getTime() - displayStart.getTime()) / 60000
              );
              if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                durationMinutes = placement.durationMinutes;
              }

              if (DEBUG_DAY_SHIFT && !hasLoggedInstance) {
                hasLoggedInstance = true;
                const diffMinutes =
                  (placement.start.getTime() - date.getTime()) / (1000 * 60);
                const computedTopPx = diffMinutes * modelPxPerMin;
                console.log("RENDER POSITION TRACE", {
                  viewedDate: date,
                  instanceStart: placement.start,
                  diffMinutes,
                  startHour: modelStartHour,
                  pxPerMin: modelPxPerMin,
                  computedTopPx,
                });
              }

              const topStyle = toTimelinePosition(startOffsetMinutes);
              const heightStyle = toTimelinePosition(durationMinutes);
              const habitHeightPx = Math.max(
                durationMinutes * modelPxPerMin,
                0
              );
              const shouldWrapHabitTitle = Number(durationMinutes) >= 30;
              const habitTitleClass = shouldWrapHabitTitle
                ? "pr-8 text-sm font-medium leading-snug line-clamp-2 sm:line-clamp-1 sm:truncate"
                : "truncate pr-8 text-sm font-medium leading-snug";
              const pendingStatus = placement.instanceId
                ? pendingInstanceStatuses.get(placement.instanceId)
                : undefined;
              const isHabitCompleted = resolveHabitCompletionStatus({
                placement,
                dayViewDateKey,
                instanceStatusById,
                getHabitCompletionStatus,
              });
              const disableHabitInteractions =
                options?.disableInteractions || Boolean(pendingStatus);
              const shouldHideHabit = false;
              // TEMP: disabled habit hiding for isolation test
              // if (isHabitCompleted && viewIsFutureDay) {
              //   shouldHideHabit = true;
              // }
              if (shouldHideHabit) {
                return null;
              }
              const isDraggedHabitInstance =
                shouldHideManualPlacementInstance(placement.instanceId);
              if (isDraggedHabitInstance) {
                return null;
              }
              const streakDays = Math.max(
                0,
                Math.round(placement.currentStreakDays ?? 0)
              );
              const showHabitStreakBadge = streakDays >= 2;
              const streakLabel = `${streakDays}x`;
              let streakBadgeStyle: CSSProperties | undefined;
              if (showHabitStreakBadge) {
                let streakBadgeTopPx = HABIT_STREAK_BADGE_TOP_MARGIN_PX;
                const overflow =
                  streakBadgeTopPx +
                  HABIT_STREAK_BADGE_BASE_HEIGHT_PX +
                  HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX -
                  habitHeightPx;
                if (overflow > 0) {
                  streakBadgeTopPx = Math.max(
                    HABIT_STREAK_BADGE_BOTTOM_MARGIN_PX,
                    streakBadgeTopPx - overflow
                  );
                }
                streakBadgeStyle = {
                  top: `${streakBadgeTopPx}px`,
                };
              }
              const habitVisuals = getScheduledHabitCardVisuals({
                habitType: normalizedHabitType,
                completed: isHabitCompleted,
              });
              const cardShadow = habitVisuals.shadow;
              const cardOutline = habitVisuals.outline;
              const habitBorderClass = habitVisuals.borderClass;
              const habitTypeClass = habitVisuals.typeClass;
              const practiceContextIdForPlacement =
                normalizedHabitType === "PRACTICE"
                  ? (placement.practiceContextId ?? null)
                  : null;
              const practiceContextLabel = practiceContextIdForPlacement
                ? (practiceContextDisplayById.get(
                    practiceContextIdForPlacement
                  ) ?? null)
                : null;
              const habitPaddingClass = practiceContextLabel
                ? "pt-4 pb-2"
                : "py-2";
              const originalLayoutMode = habitLayouts[index] ?? "full";
              const pairedProjectIndex = habitPairedProjectIndex.get(index);
              const pairedProjectIsLeft =
                pairedProjectIndex !== undefined &&
                projectLayouts[pairedProjectIndex] === "paired-left";
              const layoutMode = pairedProjectIsLeft
                ? "paired-right"
                : originalLayoutMode;
              const syncLaneLayout = syncHabitLaneLayouts.get(index) ?? null;
              const habitCornerClass = getTimelineCardCornerClass(layoutMode);
              const useCompactShadow =
                habitHeightPx <= HABIT_COMPACT_SHADOW_HEIGHT_PX;
              const isSyncLikeHabitCard =
                normalizedHabitType === "SYNC" || normalizedHabitType === "MEMO";
              const isCompletedHabitCard = isHabitCompleted;
              const habitCardShadowBase = isSyncLikeHabitCard
                ? cardShadow
                : useCompactShadow
                  ? HABIT_COMPACT_SHADOW
                  : cardShadow;
              const habitCardShadow = isCompletedHabitCard
                ? FOCUS_POMO_COMPLETE_SHADOW
                : habitCardShadowBase;
              const isCompletedGemCard = isHabitCompleted;
              const stackingZIndex =
                computeTimelineStackingIndex(startOffsetMinutes);
              const cardStyle: CSSProperties = applyTimelineLayoutStyle(
                {
                  ...TIMELINE_CARD_BOUNDS,
                  top: topStyle,
                  height: heightStyle,
                },
                layoutMode,
                {
                  animate: !prefersReducedMotion,
                  laneLayout: syncLaneLayout,
                }
              );
              const habitCardSurfaceStyle: CSSProperties = {
                ...SCHEDULE_INSTANCE_NO_SELECT_STYLE,
                boxShadow: habitCardShadow,
                outline: cardOutline,
                outlineOffset: "-1px",
                background: habitVisuals.background,
              };
              const hasHabitInstance = Boolean(placement.habitId);
              const habitBounceActive =
                hasHabitInstance && placement.instanceId
                  ? longPressBounceId === placement.instanceId
                  : false;
              const habitCompletionBounceActive =
                hasHabitInstance && placement.instanceId
                  ? completionBounceId === placement.instanceId
                  : false;
              const placementScheduleInstance = placement.instanceId
                ? instancesById.get(placement.instanceId) ?? null
                : null;
              const placementScheduleSourceType =
                normalizeEditableScheduleSourceType(
                  placementScheduleInstance?.source_type
                );
              const placementCanonicalHabitId =
                placementScheduleSourceType === "HABIT" &&
                placementScheduleInstance?.source_id
                  ? placementScheduleInstance.source_id
                  : placement.habitId;
              const handleHabitPrimaryAction = () => {
                if (disableHabitInteractions) {
                  console.log(
                    `[SKIP] reason=disabled instanceId=${
                      placement.instanceId ?? "null"
                    }`
                  );
                  return;
                }
                handleHabitCardActivation(placement, dayViewDateKey);
              };
              const habitPointerHandlers = hasHabitInstance
                ? {
                    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
                      if (disableHabitInteractions) return;
                      handleInstancePointerDown(
                        event,
                        null,
                        handleHabitPrimaryAction,
                        () => {
                          const element = event.currentTarget;
                          let originData: ScheduleEditOrigin | null = null;
                          if (element) {
                            const rect = element.getBoundingClientRect();
                            const computed = window.getComputedStyle(element);
                            const fallbackRadius = [
                              computed.borderTopLeftRadius,
                              computed.borderTopRightRadius,
                              computed.borderBottomRightRadius,
                              computed.borderBottomLeftRadius,
                            ]
                              .filter(Boolean)
                              .join(" ")
                              .trim();
                            const radius =
                              (computed.borderRadius &&
                              computed.borderRadius.trim().length > 0
                                ? computed.borderRadius
                                : fallbackRadius) || "0px";
                            const backgroundImage =
                              computed.backgroundImage &&
                              computed.backgroundImage !== "none"
                                ? computed.backgroundImage
                                : undefined;
                            const backgroundColorRaw = computed.backgroundColor;
                            const backgroundColor =
                              backgroundColorRaw &&
                              backgroundColorRaw !== "rgba(0, 0, 0, 0)" &&
                              backgroundColorRaw.toLowerCase() !== "transparent"
                                ? backgroundColorRaw
                                : undefined;
                            const boxShadow =
                              computed.boxShadow &&
                              computed.boxShadow !== "none"
                                ? computed.boxShadow
                                : undefined;
                            originData = {
                              x: rect.left,
                              y: rect.top,
                              width: rect.width,
                              height: rect.height,
                              borderRadius: radius,
                              backgroundColor,
                              backgroundImage,
                              boxShadow,
                            };
                          }
                          const scheduledHabitInstance =
                            placement.instanceId
                              ? instancesById.get(placement.instanceId) ?? null
                              : null;
                          const scheduledSourceType =
                            normalizeEditableScheduleSourceType(
                              scheduledHabitInstance?.source_type
                            );
                          const canonicalHabitId =
                            scheduledSourceType === "HABIT" &&
                            scheduledHabitInstance?.source_id
                              ? scheduledHabitInstance.source_id
                              : placement.habitId;
                          const resolvedHabit =
                            habitMap[canonicalHabitId] ?? null;
                          const habitSnapshot =
                            buildHabitEditSnapshot(resolvedHabit);
                          const nextSnapshot: EditingSnapshot = {
                            source_type: "HABIT",
                            projectId: null,
                            habitId: canonicalHabitId,
                            habitSnapshot,
                            originData,
                          };
                          if (process.env.NODE_ENV === "development") {
                            console.log("[ScheduleEdit] habit timeline hold", {
                              instanceId: scheduledHabitInstance?.id ?? null,
                              sourceType:
                                scheduledHabitInstance?.source_type ?? "HABIT",
                              sourceId: canonicalHabitId,
                              resolvedHabit: Boolean(resolvedHabit),
                              title: habitSnapshot?.name ?? placement.habitName,
                            });
                          }
                          logEditingSnapshotEvent(
                            "habit-card-pointerdown",
                            nextSnapshot,
                            {
                              hasOrigin: Boolean(originData),
                              placementId: placement.instanceId,
                              sourceId: canonicalHabitId,
                            }
                          );
                          setEditingSnapshot({
                            ...nextSnapshot,
                            instance: scheduledHabitInstance,
                          } as EditingSnapshot & { instance?: ScheduleInstance });
                        },
                        placement.habitId,
                        placement,
                        {
                          energyResolved: placement.energyLabel,
                          durationMin: placement.durationMinutes,
                          windowId: placement.window.id,
                        }
                      );
                    },
                    onPointerUp: (e) => handleInstancePointerUp(e),
                    onPointerCancel: (e) => handleInstancePointerCancel(e),
                  }
                : {};

              const habitLayoutId = placement.instanceId
                ? getScheduleInstanceLayoutId(placement.instanceId)
                : null;
              const habitLayoutTokens = habitLayoutId
                ? scheduleInstanceLayoutTokens(habitLayoutId)
                : null;
              const editorMounted =
                editingProjectId !== null || editingHabitId !== null;
              const hideForEdit =
                editorMounted && editingHabitId === placementCanonicalHabitId;

              if (hideForEdit) {
                return null;
              }

              const habitLayerZIndex =
                isSyncLikeHabitCard && layoutMode === "paired-right"
                  ? stackingZIndex + 1
                  : stackingZIndex;
              const resolvedHabitLayerZIndex = getOverlayBackedCardZIndex(
                habitLayerZIndex,
                placementScheduleInstance?.overlay_window_id
              );
              const layeredCardStyle = {
                ...cardStyle,
                zIndex: resolvedHabitLayerZIndex,
              };

              return (
                <motion.div
                  key={
                    placement.instanceId
                      ? `habit-${placement.instanceId}`
                      : `habit-${placement.habitId}-${dayViewDateKey}-${placement.startMinute}-${placement.endMinute}`
                  }
                  layout="position"
                  layoutId={habitLayoutTokens?.card}
                  className="absolute"
                  style={layeredCardStyle}
                  initial={prefersReducedMotion ? false : { y: 4 }}
                  animate={
                    prefersReducedMotion
                      ? undefined
                      : {
                          opacity: 1,
                          y: 0,
                          scale: habitCompletionBounceActive
                            ? [1, 0.99, 1.004, 1]
                            : habitBounceActive
                              ? 1.04
                              : 1,
                          transition: habitCompletionBounceActive
                            ? { scale: { duration: 0.42, ease: [0.22, 0.72, 0.24, 1] as const } }
                            : undefined,
                        }
                  }
                  exit={prefersReducedMotion ? undefined : { y: 4 }}
                >
                  <div
                    className={clsx(
                      "habit-card relative flex h-full w-full items-center justify-between gap-3 border px-3 text-white shadow-[0_18px_38px_rgba(8,12,32,0.52)] backdrop-blur select-none",
                      habitCornerClass,
                      habitPaddingClass,
                      habitBorderClass,
                      habitTypeClass,
                      isCompletedGemCard &&
                        FOCUS_POMO_COMPLETE_EFFECT_CLASSES,
                      isHabitCompleted
                        ? "habit-card--completed"
                        : "habit-card--scheduled",
                      disableHabitInteractions
                        ? "pointer-events-none cursor-default"
                        : "cursor-pointer"
                    )}
                    role="button"
                    tabIndex={disableHabitInteractions ? -1 : 0}
                    aria-pressed={isHabitCompleted}
                    aria-disabled={disableHabitInteractions}
                    style={habitCardSurfaceStyle}
                    onContextMenu={() => console.log("[LONGPRESS] contextmenu")}
                    onClick={() => {
                      console.log("[INTERACT] CLICK", {
                        shouldBlock: shouldBlockClickFromLongPress(),
                        longPressTriggered: longPressTriggeredRef.current,
                        shortPressHandled: shortPressHandledRef.current,
                        disableInteractions: disableHabitInteractions,
                      });
                      if (shouldBlockClickFromLongPress()) return;
                      handleHabitPrimaryAction();
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }
                      event.preventDefault();
                      handleHabitPrimaryAction();
                    }}
                    {...habitPointerHandlers}
                  >
                    {practiceContextLabel ? (
                      <div
                        className={clsx(
                          "pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight",
                          isCompletedGemCard && "z-[2]"
                        )}
                      >
                        <span className="truncate text-[9px] font-semibold text-white/80">
                          {practiceContextLabel}
                        </span>
                      </div>
                    ) : null}
                    <motion.span
                      layoutId={habitLayoutTokens?.title}
                      className={clsx(
                        habitTitleClass,
                        isCompletedGemCard && "relative z-[2]"
                      )}
                    >
                      {placement.habitName}
                    </motion.span>
                    {showHabitStreakBadge ? (
                      <span
                        className={clsx(
                          "pointer-events-none absolute right-3 top-2 flex items-center gap-0.5 rounded-full bg-white/10 px-1.5 py-[2px] text-xs font-semibold leading-tight text-amber-100",
                          isCompletedGemCard && "z-[2]"
                        )}
                        style={streakBadgeStyle}
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
                        <span className="tracking-normal">{streakLabel}</span>
                      </span>
                    ) : null}
                  </div>
                </motion.div>
              );
            })}
            {manualPlacementSession && manualTimelineGhost ? (
              <div
                className="pointer-events-none absolute"
                style={{
                  ...TIMELINE_CARD_BOUNDS,
                  top: manualTimelineGhost.top,
                  height: manualTimelineGhost.height,
                  zIndex: TIMELINE_STACK_BASE_Z_INDEX + 1000,
                }}
              >
                <ManualPlacementTimelineCard
                  candidate={manualPlacementSession.candidate}
                  label={manualPlacementSession.ghost.label}
                  mode={manualPlacementSession.ghost.mode}
                  heightPx={manualTimelineGhost.heightPx}
                />
              </div>
            ) : null}
            {dayProjectInstances.map(
              ({ instance, project, start, end, assignedWindow }, index) => {
                if (!isValidDate(start) || !isValidDate(end)) return null;
                const displacedPreview = manualPlacementSession?.pushPreview?.displaced.find(
                  (entry) => entry.instanceId === instance.id
                );
                const visualStart = displacedPreview?.start ?? start;
                const visualEnd = displacedPreview?.end ?? end;
                const projectId = project.id;
                const startMin = getDayMinuteOffset(visualStart, renderDayStart);
                const startOffsetMinutes = startMin;
                const durationMinutes = Math.max(
                  0,
                  (visualEnd.getTime() - visualStart.getTime()) / 60000
                );
                const shouldWrapProjectTitle = Number(durationMinutes) >= 30;

                if (DEBUG_DAY_SHIFT && !hasLoggedInstance) {
                  hasLoggedInstance = true;
                  const diffMinutes =
                    (start.getTime() - date.getTime()) / (1000 * 60);
                  const computedTopPx = diffMinutes * modelPxPerMin;
                  console.log("RENDER POSITION TRACE", {
                    viewedDate: date,
                    instanceStart: start,
                    diffMinutes,
                    startHour: modelStartHour,
                    pxPerMin: modelPxPerMin,
                    computedTopPx,
                  });
                }

                const topStyle = toTimelinePosition(startOffsetMinutes);
                const heightStyle = toTimelinePosition(durationMinutes);
                const isExpanded = expandedProjects.has(projectId);
                const scheduledCards: ProjectTaskCard[] =
                  scheduledCardsByInstanceId.get(instance.id) ?? [];
                const hasScheduledBreakdown = scheduledCards.length > 0;
                const tasksLabel =
                  project.taskCount > 0
                    ? `${project.taskCount} ${
                        project.taskCount === 1 ? "task" : "tasks"
                      }`
                    : null;
                const layoutMode = projectLayouts[index] ?? "full";
                const projectCornerClass =
                  getTimelineCardCornerClass(layoutMode);
                const goalRelationInfo = projectGoalRelations[projectId];
                const goalRelationName = goalRelationInfo?.goalName?.trim();
                const goalRelationText =
                  goalRelationName && goalRelationName.length > 0
                    ? goalRelationName
                    : null;
                const collapsedCardPaddingClass = goalRelationText
                  ? "pt-4 pb-2"
                  : "py-2";
                const projectDurationMs = Math.max(
                  end.getTime() - start.getTime(),
                  1
                );
                const projectHeightPx = Math.max(
                  durationMinutes * modelPxPerMin,
                  1
                );
                const positionStyle: CSSProperties = applyTimelineLayoutStyle(
                  {
                    ...TIMELINE_CARD_BOUNDS,
                    top: topStyle,
                    height: heightStyle,
                  },
                  layoutMode,
                  { animate: !prefersReducedMotion }
                );
                const stackingZIndex =
                  computeTimelineStackingIndex(startOffsetMinutes);
                const layeredPositionStyle = {
                  ...positionStyle,
                  zIndex: getOverlayBackedCardZIndex(
                    stackingZIndex,
                    instance.overlay_window_id
                  ),
                };
                const useCompactProjectShadow =
                  projectHeightPx <= TIMELINE_COMPACT_CARD_HEIGHT_PX;
                const sharedCardShadow = useCompactProjectShadow
                  ? TIMELINE_COMPACT_CARD_SHADOW
                  : TIMELINE_RESTING_CARD_SHADOW;
                const sharedCardStyle: CSSProperties = {
                  boxShadow: sharedCardShadow,
                  outline: "1px solid rgba(10, 10, 12, 0.85)",
                  outlineOffset: "-1px",
                };
                const minHeightRatio = Math.min(1, 4 / projectHeightPx);
                const backlogTasks = modelTasksByProjectId[projectId] ?? [];
                const safeMinHeightRatio =
                  minHeightRatio > 0 ? minHeightRatio : 1;
                const fallbackLimit = Math.min(
                  MAX_FALLBACK_TASKS,
                  Math.max(1, Math.floor(1 / safeMinHeightRatio)),
                  backlogTasks.length
                );
                const fallbackCards =
                  !hasScheduledBreakdown && fallbackLimit > 0
                    ? buildFallbackTaskCards({
                        tasks: backlogTasks,
                        projectStart: start,
                        projectEnd: end,
                        instanceId: instance.id,
                        maxCount: fallbackLimit,
                      })
                    : [];
                const displayCards = hasScheduledBreakdown
                  ? scheduledCards
                  : fallbackCards;
                const usingFallback =
                  !hasScheduledBreakdown && displayCards.length > 0;
                const detailParts: string[] = [];
                if (tasksLabel) detailParts.push(tasksLabel);
                const detailText = detailParts.join(" · ");
                const globalRank = project.globalRank;
                const rankDisplay =
                  typeof globalRank === "number" &&
                  Number.isFinite(globalRank) &&
                  globalRank > 0
                    ? `#${globalRank}`
                    : null;
                const hiddenFallbackCount = usingFallback
                  ? Math.max(0, backlogTasks.length - displayCards.length)
                  : 0;
                const canExpand = displayCards.length > 0;
                const pendingStatus = pendingInstanceStatuses.get(instance.id);
                const isPending = pendingStatus !== undefined;
                const effectiveStatus =
                  pendingStatus ?? instance.status ?? "scheduled";
                const isDraggedInstance =
                  shouldHideManualPlacementInstance(instance.id);
                const canToggle =
                  effectiveStatus === "completed" ||
                  effectiveStatus === "scheduled";
                const isCompleted = effectiveStatus === "completed";
                const projectLongPressActive =
                  longPressBounceId === instance.id;
                const projectCompletionBounceActive =
                  completionBounceId === instance.id;

                const editorMounted =
                  editingProjectId !== null || editingHabitId !== null;
                const hideForEdit =
                  editorMounted && editingProjectId === projectId;

                const instanceLayoutId = getScheduleInstanceLayoutId(
                  instance.id
                );
                const layoutTokens =
                  scheduleInstanceLayoutTokens(instanceLayoutId);
                const isLockedProject = instance.locked === true;

                const handleProjectToggle = () => {
                  if (!canToggle || isPending) return;
                  triggerCompletionBounce(instance.id);
                  const nextStatus = isCompleted ? "scheduled" : "completed";
                  void handleToggleInstanceCompletion(instance.id, nextStatus);
                };
                const handleProjectExpand = () => {
                  if (!canExpand) return;
                  setProjectExpansion(projectId);
                };
                const handleProjectPrimaryAction = () => {
                  if (canToggle && !isPending) {
                    handleProjectToggle();
                    return;
                  }
                  if (canExpand) {
                    handleProjectExpand();
                  }
                };
                const projectBackground = isCompleted
                  ? FOCUS_POMO_COMPLETE_BACKGROUND
                  : TIMELINE_DARK_EVENT_BACKGROUND;
                const resolvedProjectShadow = isCompleted
                  ? FOCUS_POMO_COMPLETE_SHADOW
                  : sharedCardShadow;
                const projectCardStyle: CSSProperties = {
                  ...sharedCardStyle,
                  boxShadow: resolvedProjectShadow,
                  outline: isCompleted
                    ? FOCUS_POMO_COMPLETE_OUTLINE
                    : sharedCardStyle.outline,
                  background: projectBackground,
                  opacity: displacedPreview ? 0.92 : undefined,
                  outlineOffset: displacedPreview
                    ? "-2px"
                    : sharedCardStyle.outlineOffset,
                };
                const projectBorderClass = isCompleted
                  ? "border-green-900/45"
                  : "border-black/70";
                const instanceEnergyLevel = resolveEnergyLevel(
                  instance.energy_resolved
                );
                const projectEnergyLevel = resolveEnergyLevel(project.energy);
                const cardEnergyLevel: FlameLevel =
                  instanceEnergyLevel ?? projectEnergyLevel ?? "NO";
                const projectTitleInnerClass = shouldWrapProjectTitle
                  ? "min-w-0 leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate"
                  : "min-w-0 leading-tight truncate";
                if (isDraggedInstance) return null;
                return (
                  <motion.div
                    key={instance.id}
                    data-schedule-instance-id={instance.id}
                    className="absolute"
                    style={layeredPositionStyle}
                    layout={!prefersReducedMotion}
                    transition={
                      prefersReducedMotion
                        ? undefined
                        : { type: "spring", stiffness: 320, damping: 32 }
                    }
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {!isExpanded || !canExpand ? (
                        hideForEdit ? null : (
                          <motion.div
                            key="project"
                            layout="position"
                            layoutId={layoutTokens.card}
                            ref={bindProjectTimelineNoSelectSurface}
                            aria-label={`Project ${project.name}`}
                            role="button"
                            tabIndex={canToggle ? 0 : -1}
                            aria-expanded={canExpand ? isExpanded : undefined}
                            aria-pressed={isCompleted}
                            aria-disabled={!canToggle || isPending}
                            onPointerDown={(event) => {
                              if (options?.disableInteractions) return;
                              handleInstancePointerDown(
                                event,
                                instance,
                                handleProjectPrimaryAction,
                                () => {
                                  const element = event.currentTarget;
                                  let originData: ScheduleEditOrigin | null =
                                    null;
                                  if (element) {
                                    const rect =
                                      element.getBoundingClientRect();
                                    const computed =
                                      window.getComputedStyle(element);
                                    const fallbackRadius = [
                                      computed.borderTopLeftRadius,
                                      computed.borderTopRightRadius,
                                      computed.borderBottomRightRadius,
                                      computed.borderBottomLeftRadius,
                                    ]
                                      .filter(Boolean)
                                      .join(" ")
                                      .trim();
                                    const radius =
                                      (computed.borderRadius &&
                                      computed.borderRadius.trim().length > 0
                                        ? computed.borderRadius
                                        : fallbackRadius) || "0px";
                                    const backgroundImage =
                                      computed.backgroundImage &&
                                      computed.backgroundImage !== "none"
                                        ? computed.backgroundImage
                                        : undefined;
                                    const backgroundColorRaw =
                                      computed.backgroundColor;
                                    const backgroundColor =
                                      backgroundColorRaw &&
                                      backgroundColorRaw !==
                                        "rgba(0, 0, 0, 0)" &&
                                      backgroundColorRaw.toLowerCase() !==
                                        "transparent"
                                        ? backgroundColorRaw
                                        : undefined;
                                    const boxShadow =
                                      computed.boxShadow &&
                                      computed.boxShadow !== "none"
                                        ? computed.boxShadow
                                        : undefined;
                                    originData = {
                                      x: rect.left,
                                      y: rect.top,
                                      width: rect.width,
                                      height: rect.height,
                                      borderRadius: radius,
                                      backgroundColor,
                                      backgroundImage,
                                      boxShadow,
                                    };
                                  }
                                  const nextSnapshot: EditingSnapshot = {
                                    source_type: "PROJECT",
                                    projectId: project.id,
                                    habitId: null,
                                    originData,
                                  };
                                  logEditingSnapshotEvent(
                                    "project-card-pointerdown",
                                    nextSnapshot,
                                    {
                                      projectId: project.id,
                                      hasOrigin: Boolean(originData),
                                      instanceId: instance?.id ?? null,
                                    }
                                  );
                                  setEditingSnapshot({
                                    ...nextSnapshot,
                                    instance: instance ?? null,
                                  } as EditingSnapshot & {
                                    instance?: ScheduleInstance | null;
                                  });
                                },
                                undefined,
                                undefined,
                                {
                                  energyResolved: cardEnergyLevel,
                                  durationMin: Math.max(
                                    1,
                                    Math.round(
                                      (end.getTime() - start.getTime()) / 60000
                                    )
                                  ),
                                  windowId: assignedWindow?.id ?? null,
                                }
                              );
                            }}
                            onPointerUp={(e) => handleInstancePointerUp(e)}
                            onPointerCancel={(e) =>
                              handleInstancePointerCancel(e)
                            }
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              if (options?.disableInteractions) return;
                              handleProjectToggle();
                            }}
                            onClick={() => {
                              if (shouldBlockClickFromLongPress()) return;
                              handleProjectPrimaryAction();
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ")
                                return;
                              event.preventDefault();
                              handleProjectPrimaryAction();
                            }}
                            className={clsx(
                              "relative flex h-full w-full items-center justify-between px-3 text-white backdrop-blur-sm border transition-[background,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] select-none",
                              projectCornerClass,
                              collapsedCardPaddingClass,
                              projectBorderClass,
                              isCompleted &&
                                FOCUS_POMO_COMPLETE_EFFECT_CLASSES,
                              (canExpand || (canToggle && !isPending)) &&
                                "cursor-pointer"
                            )}
                            style={{
                              ...projectCardStyle,
                              ...SCHEDULE_INSTANCE_NO_SELECT_STYLE,
                              touchAction: TIMELINE_TOUCH_ACTION,
                              WebkitTapHighlightColor: "transparent",
                            }}
                            initial={
                              prefersReducedMotion
                                ? false
                                : { y: 4 }
                            }
                            animate={
                              prefersReducedMotion
                                ? undefined
                                : {
                                    opacity: 1,
                                    y: 0,
                                    scale: projectCompletionBounceActive
                                      ? [1, 0.99, 1.004, 1]
                                      : projectLongPressActive
                                        ? 1.03
                                        : 1,
                                    transition: {
                                      delay: hasInteractedWithProjects
                                        ? 0
                                        : index * 0.02,
                                      duration: 0.18,
                                      ease: [0.4, 0, 0.2, 1],
                                      scale: projectCompletionBounceActive
                                        ? { duration: 0.42, ease: [0.22, 0.72, 0.24, 1] as const }
                                        : {
                                            delay: 0,
                                            type: "spring",
                                            stiffness: 520,
                                            damping: 32,
                                          },
                                    },
                                  }
                            }
                            exit={
                              prefersReducedMotion
                                ? undefined
                                : {
                                    y: 4,
                                    transition: {
                                      duration: 0.14,
                                      ease: [0.4, 0, 0.2, 1],
                                    },
                                  }
                            }
                          >
                            {goalRelationText ? (
                              <div className="pointer-events-none absolute right-3 top-0 max-w-[60%] text-right leading-tight">
                                <span className="truncate text-[9px] font-semibold text-white/80">
                                  {goalRelationText}
                                </span>
                              </div>
                            ) : null}
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <div className="min-w-0 space-y-1">
                                <motion.span
                                  layoutId={layoutTokens.title}
                                  className="block text-sm font-medium"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className={projectTitleInnerClass}>
                                      {project.name}
                                    </span>
                                    {isLockedProject ? (
                                      <Lock
                                        className="h-3.5 w-3.5 text-white/80"
                                        aria-label="Locked project"
                                      />
                                    ) : null}
                                    {rankDisplay ? (
                                      <span className="text-xs font-normal text-white/70">
                                        {rankDisplay}
                                      </span>
                                    ) : null}
                                  </span>
                                </motion.span>
                                {detailText ? (
                                  <motion.div
                                    layoutId={layoutTokens.meta}
                                    className="text-xs text-zinc-200/70"
                                  >
                                    {detailText}
                                  </motion.div>
                                ) : null}
                              </div>
                            </div>
                            <SkillEnergyBadge
                              energyLevel={cardEnergyLevel}
                              skillIcon={project.skill_icon}
                              className="flex flex-shrink-0 items-center gap-2"
                              iconClassName="text-lg leading-none"
                              flameClassName="flex-shrink-0"
                            />
                          </motion.div>
                        )
                      ) : (
                        <motion.div
                          key="tasks"
                          data-expanded-project-id={projectId}
                          className="relative h-full w-full"
                          initial={
                            prefersReducedMotion ? false : { y: 4 }
                          }
                          animate={
                            prefersReducedMotion
                              ? undefined
                              : {
                                  opacity: 1,
                                  y: 0,
                                  transition: {
                                    duration: 0.18,
                                    ease: [0.4, 0, 0.2, 1],
                                  },
                                }
                          }
                          exit={
                            prefersReducedMotion
                              ? undefined
                              : {
                                  y: 4,
                                  transition: {
                                    duration: 0.14,
                                    ease: [0.4, 0, 0.2, 1],
                                  },
                                }
                          }
                        >
                          <motion.button
                            type="button"
                            className="absolute right-2 top-2 z-10 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white shadow-[0_10px_18px_rgba(0,0,0,0.45)] backdrop-blur transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                            onClick={(event) => {
                              event.stopPropagation();
                              setProjectExpansion(projectId, false);
                            }}
                          >
                            Back
                          </motion.button>
                          <div
                            className={`relative h-full w-full overflow-hidden p-2 ${projectCornerClass}`}
                          >
                            <AnimatePresence initial={false}>
                              {displayCards.map((taskCard) => {
                                const {
                                  key,
                                  task,
                                  start: taskStart,
                                  end: taskEnd,
                                  kind,
                                  instanceId,
                                } = taskCard;
                                if (
                                  !isValidDate(taskStart) ||
                                  !isValidDate(taskEnd)
                                ) {
                                  return null;
                                }
                                const startOffsetMs =
                                  taskStart.getTime() - start.getTime();
                                const endOffsetMs =
                                  taskEnd.getTime() - start.getTime();
                                const rawStartRatio =
                                  startOffsetMs / projectDurationMs;
                                const rawEndRatio =
                                  endOffsetMs / projectDurationMs;
                                const clampRatio = (value: number) =>
                                  Number.isFinite(value)
                                    ? Math.min(Math.max(value, 0), 1)
                                    : 0;
                                let startRatio = clampRatio(rawStartRatio);
                                let endRatio = clampRatio(rawEndRatio);
                                if (endRatio <= startRatio) {
                                  endRatio = Math.min(
                                    1,
                                    startRatio + minHeightRatio
                                  );
                                }
                                let heightRatio = Math.max(
                                  endRatio - startRatio,
                                  0
                                );
                                if (heightRatio < minHeightRatio) {
                                  heightRatio = minHeightRatio;
                                }
                                if (startRatio + heightRatio > 1) {
                                  const overflow = startRatio + heightRatio - 1;
                                  startRatio = Math.max(
                                    0,
                                    startRatio - overflow
                                  );
                                  heightRatio = Math.min(
                                    heightRatio,
                                    1 - startRatio
                                  );
                                }
                                const topPercent = startRatio * 100;
                                const heightPercent = Math.max(
                                  heightRatio * 100,
                                  minHeightRatio * 100
                                );
                                const allowTaskTitleWrap =
                                  taskCard.displayDurationMinutes >= 30;
                                const taskTitleClass = allowTaskTitleWrap
                                  ? "text-sm font-medium leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate"
                                  : "text-sm font-medium leading-tight truncate";
                                const baseTaskClasses =
                                  "absolute left-0 right-0 flex items-center justify-between rounded-[var(--schedule-instance-radius)] px-3 py-2 select-none";
                                const shinyTaskClasses =
                                  "text-zinc-50 shadow-[0_18px_38px_rgba(8,8,12,0.55)] ring-1 ring-white/20 backdrop-blur";
                                const completedTaskClasses = `${FOCUS_POMO_COMPLETE_EFFECT_CLASSES} text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45 backdrop-blur`;
                                const fallbackTaskClasses =
                                  "text-zinc-100 shadow-[0_16px_32px_rgba(10,10,14,0.5)] ring-1 ring-white/15 backdrop-blur-[2px]";
                                const isFallbackCard = kind === "fallback";
                                const fallbackStage = task.stage
                                  ? task.stage.toString().toUpperCase()
                                  : "";
                                const fallbackCompleted =
                                  isFallbackCard && fallbackStage === "PERFECT";
                                const fallbackPending = isFallbackCard
                                  ? pendingBacklogTaskIds.has(task.id)
                                  : false;
                                const fallbackTaskEnergy =
                                  resolveEnergyLevel(task.energy) ??
                                  resolveEnergyLevel(project.energy) ??
                                  "NO";
                                const energyLevel: FlameLevel =
                                  fallbackTaskEnergy;
                                const pendingStatus =
                                  kind === "scheduled" && instanceId
                                    ? pendingInstanceStatuses.get(instanceId)
                                    : undefined;
                                const scheduledIsPending =
                                  pendingStatus !== undefined;
                                const status =
                                  kind === "scheduled" && instanceId
                                    ? (pendingStatus ??
                                      instanceStatusById[instanceId] ??
                                      "scheduled")
                                    : null;
                                const scheduledCanToggle =
                                  kind === "scheduled" &&
                                  !!instanceId &&
                                  (status === "completed" ||
                                    status === "scheduled");
                                const scheduledCompleted =
                                  status === "completed";
                                const canToggle = isFallbackCard
                                  ? true
                                  : scheduledCanToggle;
                                const isPending = isFallbackCard
                                  ? fallbackPending
                                  : scheduledIsPending;
                                const isCompleted = isFallbackCard
                                  ? fallbackCompleted
                                  : scheduledCompleted;
                                const cardClasses = `${baseTaskClasses} ${
                                  isCompleted
                                    ? completedTaskClasses
                                    : isFallbackCard
                                      ? fallbackTaskClasses
                                      : shinyTaskClasses
                                }`;
                                const tStyle: CSSProperties = {
                                  position: "absolute",
                                  top: `${topPercent}%`,
                                  height: `${heightPercent}%`,
                                  ...sharedCardStyle,
                                  background: isCompleted
                                    ? FOCUS_POMO_COMPLETE_BACKGROUND
                                    : isFallbackCard
                                      ? TIMELINE_FALLBACK_TASK_BACKGROUND
                                      : TIMELINE_SHINY_TASK_BACKGROUND,
                                  ...(isCompleted
                                    ? {
                                        boxShadow: FOCUS_POMO_COMPLETE_SHADOW,
                                        outline: FOCUS_POMO_COMPLETE_OUTLINE,
                                      }
                                    : null),
                                };
                                const progressValue =
                                  kind === "scheduled"
                                    ? Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          (task as { progress?: number })
                                            .progress ?? 0
                                        )
                                      )
                                    : isCompleted
                                      ? 100
                                      : 0;
                                const progressBarClass = isCompleted
                                  ? "absolute left-0 bottom-0 h-[3px] bg-emerald-300/80"
                                  : kind === "scheduled"
                                    ? "absolute left-0 bottom-0 h-[3px] bg-white/40"
                                    : "absolute left-0 bottom-0 h-[3px] bg-white/25";
                                const hasInteractiveRole =
                                  isFallbackCard ||
                                  (kind === "scheduled" && !!instanceId);
                                const taskLongPressActive =
                                  kind === "scheduled" && instanceId
                                    ? longPressBounceId === instanceId
                                    : false;

                                const editorMounted =
                                  editingProjectId !== null ||
                                  editingHabitId !== null;
                                const hideForEdit = Boolean(
                                  editorMounted &&
                                  editingInstance?.id === instanceId &&
                                  longPressTriggeredRef.current
                                );

                                if (hideForEdit) {
                                  return null;
                                }
                                if (
                                  shouldHideManualPlacementInstance(instanceId)
                                ) {
                                  return null;
                                }

                                const nestedLayoutTokens =
                                  kind === "scheduled" && instanceId
                                    ? scheduleInstanceLayoutTokens(
                                        getScheduleInstanceLayoutId(instanceId)
                                      )
                                    : null;

                                const handleTaskCardPrimaryAction = () => {
                                  if (isFallbackCard) {
                                    if (!canToggle || isPending) return;
                                    handleToggleBacklogTaskCompletion(task.id);
                                    return;
                                  }
                                  if (!instanceId) return;
                                  if (!canToggle || isPending) return;
                                  triggerCompletionBounce(instanceId);
                                  const nextStatus = isCompleted
                                    ? "scheduled"
                                    : "completed";
                                  void handleToggleInstanceCompletion(
                                    instanceId,
                                    nextStatus
                                  );
                                };

                                return (
                                  <motion.div
                                    key={key}
                                    layout={instanceId ? "position" : false}
                                    layoutId={nestedLayoutTokens?.card}
                                    data-schedule-instance-id={
                                      kind === "scheduled" && instanceId
                                        ? instanceId
                                        : undefined
                                    }
                                    data-backlog-task-id={
                                      isFallbackCard ? task.id : undefined
                                    }
                                    aria-label={`Task ${task.name}`}
                                    role={
                                      hasInteractiveRole ? "button" : undefined
                                    }
                                    tabIndex={canToggle ? 0 : -1}
                                    aria-pressed={
                                      hasInteractiveRole
                                        ? isCompleted
                                        : undefined
                                    }
                                    aria-disabled={
                                      hasInteractiveRole
                                        ? !canToggle || isPending
                                        : undefined
                                    }
                                    data-completed={
                                      isCompleted ? "true" : "false"
                                    }
                                    className={`${cardClasses}${
                                      canToggle && !isPending
                                        ? " cursor-pointer"
                                        : ""
                                    }`}
                                    style={tStyle}
                                    onPointerDown={(event) => {
                                      if (!instanceId) return;
                                      const taskInstance =
                                        instances.find(
                                          (inst) => inst.id === instanceId
                                        ) || null;
                                      handleInstancePointerDown(
                                        event,
                                        taskInstance,
                                        handleTaskCardPrimaryAction
                                      );
                                    }}
                                    onPointerUp={handleInstancePointerUp}
                                    onPointerCancel={
                                      handleInstancePointerCancel
                                    }
                                    onClick={() => {
                                      if (shouldBlockClickFromLongPress())
                                        return;
                                      handleTaskCardPrimaryAction();
                                    }}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key !== "Enter" &&
                                        event.key !== " "
                                      ) {
                                        return;
                                      }
                                      event.preventDefault();
                                      if (isFallbackCard) {
                                        if (!canToggle || isPending) return;
                                        handleToggleBacklogTaskCompletion(
                                          task.id
                                        );
                                        return;
                                      }
                                      if (!instanceId) return;
                                      if (!canToggle || isPending) return;
                                      const nextStatus = isCompleted
                                        ? "scheduled"
                                        : "completed";
                                      void handleToggleInstanceCompletion(
                                        instanceId,
                                        nextStatus
                                      );
                                    }}
                                    initial={
                                      prefersReducedMotion
                                        ? false
                                        : { y: 6 }
                                    }
                                    animate={
                                      prefersReducedMotion
                                        ? undefined
                                        : {
                                            opacity: 1,
                                            y: 0,
                                            scale: taskLongPressActive
                                              ? 1.03
                                              : 1,
                                            transition: {
                                              duration: 0.18,
                                              ease: [0.4, 0, 0.2, 1],
                                              scale: {
                                                delay: 0,
                                                type: "spring",
                                                stiffness: 500,
                                                damping: 30,
                                              },
                                            },
                                          }
                                    }
                                    exit={
                                      prefersReducedMotion
                                        ? undefined
                                        : {
                                            y: 6,
                                            transition: {
                                              duration: 0.14,
                                              ease: [0.4, 0, 0.2, 1],
                                            },
                                          }
                                    }
                                  >
                                    <div className="flex flex-col">
                                      <motion.span
                                        layoutId={nestedLayoutTokens?.title}
                                        className={taskTitleClass}
                                      >
                                        {task.name}
                                      </motion.span>
                                    </div>
                                    <SkillEnergyBadge
                                      energyLevel={energyLevel}
                                      skillIcon={task.skill_icon}
                                      size="xs"
                                      className="pointer-events-none absolute -top-1 -right-1 flex items-center gap-1 rounded-full bg-zinc-950/70 px-1.5 py-[1px]"
                                      iconClassName="text-xs leading-none"
                                      flameClassName="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                                    />
                                    {progressValue > 0 && (
                                      <div
                                        className={progressBarClass}
                                        style={{ width: `${progressValue}%` }}
                                      />
                                    )}
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                            {usingFallback && hiddenFallbackCount > 0 && (
                              <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                                <span className="rounded-full border border-white/50 bg-white/80 px-2 py-[2px] text-[10px] text-zinc-700 shadow-sm backdrop-blur-sm">
                                  +{hiddenFallbackCount} more task
                                  {hiddenFallbackCount === 1 ? "" : "s"} in
                                  backlog
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              }
            )}
            <AnimatePresence initial={false}>
              {modelStandaloneTaskInstances.map(
                ({ instance, task, start, end }, index) => {
                  if (!isValidDate(start) || !isValidDate(end)) return null;
                  const startMin = getDayMinuteOffset(start, renderDayStart);
                  const startOffsetMinutes = startMin;
                  const durationMinutes = Math.max(
                    0,
                    (end.getTime() - start.getTime()) / 60000
                  );

                  if (DEBUG_DAY_SHIFT && !hasLoggedInstance) {
                    hasLoggedInstance = true;
                    const diffMinutes =
                      (start.getTime() - date.getTime()) / (1000 * 60);
                    const computedTopPx = diffMinutes * modelPxPerMin;
                    console.log("RENDER POSITION TRACE", {
                      viewedDate: date,
                      instanceStart: start,
                      diffMinutes,
                      startHour: modelStartHour,
                      pxPerMin: modelPxPerMin,
                      computedTopPx,
                    });
                  }

                  const progress =
                    (task as { progress?: number }).progress ?? 0;
                  const standaloneEnergyLevel: FlameLevel =
                    resolveEnergyLevel(task.energy) ?? "NO";
                  const pendingStatus = pendingInstanceStatuses.get(
                    instance.id
                  );
                  const isPending = pendingStatus !== undefined;
                  const status =
                    pendingStatus ?? instance.status ?? "scheduled";
                  const canToggle =
                    status === "completed" || status === "scheduled";
                  const isCompleted = status === "completed";
                  const standaloneHeightPx = Math.max(
                    durationMinutes * modelPxPerMin,
                    0
                  );
                  const useCompactStandaloneShadow =
                    standaloneHeightPx <= TIMELINE_COMPACT_CARD_HEIGHT_PX;
                  const baseStandaloneShadow = useCompactStandaloneShadow
                    ? TIMELINE_COMPACT_CARD_SHADOW
                    : "var(--elev-card)";
                  const layoutMode = taskLayouts[index] ?? "full";
                  const style: CSSProperties = applyTimelineLayoutStyle(
                    {
                      ...TIMELINE_CARD_BOUNDS,
                      position: "absolute",
                      top: toTimelinePosition(startOffsetMinutes),
                      height: toTimelinePosition(durationMinutes),
                      boxShadow: isCompleted
                        ? FOCUS_POMO_COMPLETE_SHADOW
                        : baseStandaloneShadow,
                      outline: isCompleted
                        ? FOCUS_POMO_COMPLETE_OUTLINE
                        : "1px solid var(--event-border)",
                      outlineOffset: "-1px",
                      background: isCompleted
                        ? FOCUS_POMO_COMPLETE_BACKGROUND
                        : TIMELINE_NEUTRAL_EVENT_BACKGROUND,
                    },
                    layoutMode,
                    { animate: !prefersReducedMotion }
                  );
                  const stackingZIndex =
                    computeTimelineStackingIndex(startOffsetMinutes);
                  const layeredStyle = {
                    ...style,
                    zIndex: getOverlayBackedCardZIndex(
                      stackingZIndex,
                      instance.overlay_window_id
                    ),
                  };
                  const shouldWrapStandaloneTitle =
                    Number(durationMinutes) >= 30;
                  const standaloneTitleClass = shouldWrapStandaloneTitle
                    ? "text-sm font-medium leading-tight line-clamp-2 sm:line-clamp-1 sm:truncate"
                    : "text-sm font-medium leading-tight truncate";
                  const standaloneBaseClass =
                    "absolute flex items-center justify-between px-3 py-2";
                  const standaloneScheduledClass = `${standaloneBaseClass} text-zinc-100 shadow-[0_12px_28px_rgba(24,24,27,0.35)]`;
                  const standaloneCompletedClass = `${standaloneBaseClass} ${FOCUS_POMO_COMPLETE_EFFECT_CLASSES} text-white shadow-[0_22px_38px_rgba(0,0,0,0.34),0_9px_18px_rgba(3,83,45,0.22),inset_0_1px_0_rgba(255,255,255,0.045),inset_0_-2px_8px_rgba(0,0,0,0.11),inset_0_0_0_1px_rgba(0,0,0,0.08)] ring-1 ring-green-900/45`;
                  const standaloneCornerClass =
                    getTimelineCardCornerClass(layoutMode);
                  const standaloneClassName = [
                    isCompleted
                      ? standaloneCompletedClass
                      : standaloneScheduledClass,
                    standaloneCornerClass,
                    canToggle && !isPending ? "cursor-pointer" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const standaloneLongPressActive =
                    longPressBounceId === instance.id;
                  const standaloneCompletionBounceActive =
                    completionBounceId === instance.id;
                  const isDraggedStandaloneInstance =
                    shouldHideManualPlacementInstance(instance.id);

                  const hideForEdit = Boolean(
                    editingSnapshot &&
                    editingInstance?.id &&
                    editingInstance.id === instance.id &&
                    !editingProjectId &&
                    !editingHabitId
                  );

                  const instanceLayoutId = getScheduleInstanceLayoutId(
                    instance.id
                  );
                  const layoutTokens =
                    scheduleInstanceLayoutTokens(instanceLayoutId);

                  if (hideForEdit) {
                    return null;
                  }

                  if (isDraggedStandaloneInstance) {
                    return null;
                  }

                  const handleStandaloneTaskPrimaryAction = () => {
                    if (!canToggle || isPending) return;
                    triggerCompletionBounce(instance.id);
                    const nextStatus = isCompleted ? "scheduled" : "completed";
                    void handleToggleInstanceCompletion(
                      instance.id,
                      nextStatus
                    );
                  };

                  return (
                    <motion.div
                      key={instance.id}
                      layout="position"
                      layoutId={layoutTokens.card}
                      data-schedule-instance-id={instance.id}
                      aria-label={`Task ${task.name}`}
                      role="button"
                      tabIndex={canToggle ? 0 : -1}
                      aria-pressed={isCompleted}
                      aria-disabled={!canToggle || isPending}
                      data-completed={isCompleted ? "true" : "false"}
                      className={standaloneClassName}
                      style={layeredStyle}
                      onPointerDown={(event) => {
                        handleInstancePointerDown(
                          event,
                          instance,
                          handleStandaloneTaskPrimaryAction
                        );
                      }}
                      onPointerUp={handleInstancePointerUp}
                      onPointerCancel={handleInstancePointerCancel}
                      onClick={() => {
                        if (shouldBlockClickFromLongPress()) return;
                        handleStandaloneTaskPrimaryAction();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }
                        event.preventDefault();
                        if (!canToggle || isPending) return;
                        const nextStatus = isCompleted
                          ? "scheduled"
                          : "completed";
                        void handleToggleInstanceCompletion(
                          instance.id,
                          nextStatus
                        );
                      }}
                      initial={
                        prefersReducedMotion ? false : { y: 4 }
                      }
                      animate={
                        prefersReducedMotion
                          ? undefined
                          : {
                              opacity: 1,
                              y: 0,
                              scale: standaloneCompletionBounceActive
                                ? [1, 0.99, 1.004, 1]
                                : standaloneLongPressActive
                                  ? 1.03
                                  : 1,
                              transition: standaloneCompletionBounceActive
                                ? { scale: { duration: 0.42, ease: [0.22, 0.72, 0.24, 1] as const } }
                                : undefined,
                            }
                      }
                      exit={
                        prefersReducedMotion ? undefined : { y: 4 }
                      }
                    >
                      <div className="flex flex-col">
                        <motion.span
                          layoutId={layoutTokens.title}
                          className={standaloneTitleClass}
                        >
                          {task.name}
                        </motion.span>
                        <motion.div
                          layoutId={layoutTokens.meta}
                          className={
                            isCompleted
                              ? "text-xs text-emerald-100/80"
                              : "text-xs text-zinc-700/80"
                          }
                        >
                          {Math.round(
                            (end.getTime() - start.getTime()) / 60000
                          )}
                          m
                        </motion.div>
                      </div>
                      <SkillEnergyBadge
                        energyLevel={standaloneEnergyLevel}
                        skillIcon={task.skill_icon}
                        size="xs"
                        className="pointer-events-none absolute -top-1 -right-1 flex items-center gap-1 rounded-full bg-zinc-950/70 px-1.5 py-[1px]"
                        iconClassName="text-xs leading-none"
                        flameClassName="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                      />
                      <div
                        className={
                          isCompleted
                            ? "absolute left-0 bottom-0 h-[3px] bg-emerald-300/80"
                            : "absolute left-0 bottom-0 h-[3px] bg-zinc-900/25"
                        }
                        style={{ width: `${progress}%` }}
                      />
                    </motion.div>
                  );
                }
              )}
            </AnimatePresence>
          </DayTimeline>
        </div>
      );
    },
    [
      pxPerMin,
      animatedPxPerMin,
      prefersReducedMotion,
      hasInteractedWithProjects,
      setProjectExpansion,
      expandedProjects,
      overlayWindows,
      overlayWindowIdsWithEvents,
      overlayVisibilityNowMs,
      commandBlocks,
      pendingInstanceStatuses,
      pendingBacklogTaskIds,
      manualPlacementSession,
      snapToFiveMinuteGrid,
      projectGoalRelations,
      getHabitCompletionStatus,
      handleToggleInstanceCompletion,
      handleToggleBacklogTaskCompletion,
      instanceStatusById,
      handleHabitCardActivation,
      handleInstancePointerDown,
      handleInstancePointerUp,
      handleInstancePointerCancel,
      bindProjectTimelineNoSelectSurface,
      shouldBlockClickFromLongPress,
      longPressBounceId,
      completionBounceId,
      triggerCompletionBounce,
      editingInstance,
      editingProjectId,
      editingHabitId,
      habitMap,
    ]
  );

  const dayTimelineNode = useMemo(
    () =>
      renderDayTimeline(dayTimelineModel, {
        containerRef: dayTimelineContainerRef,
        fullBleed: true,
      }),
    [renderDayTimeline, dayTimelineModel]
  );

  useEffect(() => {
    if (view !== "day") {
      swipeScrollProgressRef.current = null;
      return;
    }
    if (typeof window === "undefined") return;
    const snapshot = swipeScrollProgressRef.current;
    if (snapshot === null) return;

    let frame = 0;
    let attempts = 0;
    const maxAttempts = 12;

    const applyScroll = () => {
      const container = dayTimelineContainerRef.current;
      if (!container) {
        if (attempts < maxAttempts) {
          attempts += 1;
          frame = requestAnimationFrame(applyScroll);
          return;
        }
        swipeScrollProgressRef.current = null;
        return;
      }
      const height = container.offsetHeight;
      if (!(height > 0)) {
        if (attempts < maxAttempts) {
          attempts += 1;
          frame = requestAnimationFrame(applyScroll);
          return;
        }
        swipeScrollProgressRef.current = null;
        return;
      }

      const clampedProgress = Math.min(Math.max(snapshot, 0), 1);
      const viewportHeightRaw =
        window.visualViewport?.height ?? window.innerHeight ?? 0;
      const viewportHeight = Number.isFinite(viewportHeightRaw)
        ? viewportHeightRaw
        : 0;
      const anchorOffset = viewportHeight > 0 ? viewportHeight / 2 : 0;
      const rect = container.getBoundingClientRect();
      const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
      const containerTop = rect.top + scrollY;
      const targetRelative = clampedProgress * height;
      let targetScroll = containerTop + targetRelative - anchorOffset;
      if (!Number.isFinite(targetScroll)) {
        swipeScrollProgressRef.current = null;
        return;
      }
      if (targetScroll < 0) targetScroll = 0;
      const doc =
        typeof document !== "undefined" ? document.documentElement : null;
      if (doc) {
        const maxScroll = doc.scrollHeight - viewportHeight;
        if (Number.isFinite(maxScroll)) {
          targetScroll = Math.min(targetScroll, Math.max(0, maxScroll));
        }
      }
      window.scrollTo({ top: targetScroll, behavior: "auto" });
      swipeScrollProgressRef.current = null;
    };

    frame = requestAnimationFrame(applyScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [view, dayTimelineModel?.dayViewDateKey]);

  useEffect(() => {
    if (!focusInstanceId) return;
    const raf = requestAnimationFrame(() => {
      const escapeId = (value: string) => {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
          return CSS.escape(value);
        }
        return value.replace(/"/g, '\\"');
      };
      const target = document.querySelector<HTMLElement>(
        `[data-schedule-instance-id="${escapeId(focusInstanceId)}"]`
      );
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setFocusInstanceId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusInstanceId, dayTimelineModel?.dayViewDateKey]);

  const timeBlockConstraintsPortal =
    selectedTimeBlockForConstraints && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-black/30 p-3 backdrop-blur-[2px] sm:p-4">
            <button
              type="button"
              aria-label="Close Time Block constraints"
              className="absolute inset-0 cursor-default"
              onClick={() => {
                if (!isSavingTimeBlockConstraints) {
                  setSelectedTimeBlockForConstraints(null);
                  setTimeBlockConstraintsError(null);
                }
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Time Block constraints"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-[min(100vw-1.5rem,720px)] overflow-hidden rounded-2xl border border-black/70 bg-[#101219] p-1 text-white shadow-[0_22px_70px_rgba(0,0,0,0.58)]"
            >
              <div className="max-h-[min(82vh,740px)] overflow-y-auto rounded-2xl border border-black/60 bg-[#0d0f14] px-4 py-3 text-sm text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.34)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-semibold text-white/90">
                      {selectedTimeBlockForConstraints.block.label || "Untitled Time Block"}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                      Time Block · {selectedTimeBlockForConstraints.block.start_local} →{" "}
                      {selectedTimeBlockForConstraints.block.end_local}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingTimeBlockConstraints}
                    aria-label={`Cycle Time Block energy from ${selectedTimeBlockForConstraints.energy}`}
                    title={`Energy: ${selectedTimeBlockForConstraints.energy}`}
                    onClick={() =>
                      setSelectedTimeBlockForConstraints((prev) =>
                        prev
                          ? {
                              ...prev,
                              energy: getNextTimeBlockConstraintEnergy(prev.energy),
                            }
                          : prev
                      )
                    }
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-black/70 bg-black/30 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-black/45 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30 disabled:cursor-wait disabled:opacity-55"
                  >
                    <FlameEmber
                      level={selectedTimeBlockForConstraints.energy}
                      size="sm"
                    />
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/60">
                      <span>Block type</span>
                    </div>
                    <Select
                      value={selectedTimeBlockForConstraints.windowKind}
                      onValueChange={(value) =>
                        setSelectedTimeBlockForConstraints((prev) =>
                          prev
                            ? {
                                ...prev,
                                windowKind: normalizeTimeBlockConstraintKind(value),
                              }
                            : prev
                        )
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none focus:ring-0">
                        <SelectValue placeholder="Block type" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                        {TIME_BLOCK_CONSTRAINT_KINDS.map((kind) => (
                          <SelectItem
                            key={kind}
                            value={kind}
                            label={TIME_BLOCK_CONSTRAINT_KIND_LABEL[kind]}
                            className="text-white shadow-none hover:bg-white/10 hover:text-white aria-selected:bg-white/10 aria-selected:text-white aria-selected:shadow-none aria-selected:ring-1 aria-selected:ring-white/10"
                          >
                            {TIME_BLOCK_CONSTRAINT_KIND_LABEL[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/60">
                      <span>Location context</span>
                    </div>
                    <Select
                      value={selectedTimeBlockForConstraints.locationContextId ?? "ANY"}
                      onValueChange={(value) =>
                        setSelectedTimeBlockForConstraints((prev) =>
                          prev
                            ? {
                                ...prev,
                                locationContextId: value === "ANY" ? null : value,
                              }
                            : prev
                        )
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none">
                        <SelectValue placeholder="Anywhere" />
                      </SelectTrigger>
                      <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                        <SelectItem value="ANY" label="Anywhere">
                          Anywhere
                        </SelectItem>
                        {selectedTimeBlockLocationOptions
                          .filter((option) => option.value !== "ANY")
                          .map((option) => (
                            <SelectItem
                              key={option.id}
                              value={option.id}
                              label={option.label ?? option.value ?? ""}
                            >
                              {option.label ?? option.value}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-white/55">
                      {timeBlockLocationsLoading
                        ? "Loading locations..."
                        : "Match this block only when you're at the selected location."}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <details className="group grid gap-1">
                    <summary className="flex min-h-7 w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.26em] text-white/45">
                        Instance Types
                      </span>
                      <span className={TIME_BLOCK_CONSTRAINT_CONTROL_PILL}>
                        <span className="truncate group-open:hidden">
                          {formatTimeBlockConstraintSummary(
                            selectedTimeBlockForConstraints.allowedHabitTypes,
                            TIME_BLOCK_HABIT_TYPE_OPTIONS,
                            selectedTimeBlockForConstraints.allowAllHabitTypes
                          )}
                        </span>
                        <span className="hidden truncate group-open:inline">Choose</span>
                      </span>
                    </summary>
                    <div className="flex flex-wrap gap-1.5 pt-1 sm:gap-2">
                      <button
                        type="button"
                        aria-pressed={selectedTimeBlockForConstraints.allowAllHabitTypes}
                        onClick={() =>
                          setSelectedTimeBlockForConstraints((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  allowAllHabitTypes: true,
                                  allowedHabitTypes: new Set<string>(),
                                }
                              : prev
                          )
                        }
                        className={clsx(
                          TIME_BLOCK_CONSTRAINT_PILL_BASE,
                          selectedTimeBlockForConstraints.allowAllHabitTypes
                            ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                            : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                        )}
                      >
                        Allow ALL
                      </button>
                      {TIME_BLOCK_HABIT_TYPE_OPTIONS.map((option) => {
                        const selected =
                          !selectedTimeBlockForConstraints.allowAllHabitTypes &&
                          selectedTimeBlockForConstraints.allowedHabitTypes.has(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setSelectedTimeBlockForConstraints((prev) => {
                                if (!prev) return prev;
                                const next = new Set(prev.allowedHabitTypes);
                                if (next.has(option.value)) next.delete(option.value);
                                else next.add(option.value);
                                return {
                                  ...prev,
                                  allowAllHabitTypes: false,
                                  allowedHabitTypes: next,
                                };
                              })
                            }
                            className={clsx(
                              TIME_BLOCK_CONSTRAINT_PILL_BASE,
                              selected
                                ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                                : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                            )}
                          >
                            <span className="max-w-[8rem] truncate sm:max-w-[10rem]">
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!selectedTimeBlockForConstraints.allowAllHabitTypes &&
                    selectedTimeBlockForConstraints.allowedHabitTypes.size === 0 ? (
                      <div className="pt-1 text-[10px] text-white/35">
                        No instance types allowed.
                      </div>
                    ) : null}
                  </details>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <details className="group grid gap-1">
                    <summary className="flex min-h-7 w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.26em] text-white/45">
                        Skills
                      </span>
                      <span className={TIME_BLOCK_CONSTRAINT_CONTROL_PILL}>
                        <span className="truncate group-open:hidden">
                          {formatTimeBlockConstraintSummary(
                            selectedTimeBlockForConstraints.allowedSkillIds,
                            timeBlockConstraintSkillOptions,
                            selectedTimeBlockForConstraints.allowAllSkills
                          )}
                        </span>
                        <span className="hidden truncate group-open:inline">Choose</span>
                      </span>
                    </summary>
                    <div className="space-y-2 pt-1">
                      <Input
                        value={timeBlockSkillSearch}
                        onChange={(event) => setTimeBlockSkillSearch(event.target.value)}
                        placeholder="Search skills..."
                        className="h-8 rounded-full border border-black/60 bg-black/30 px-3 text-xs text-white placeholder:text-white/35 focus-visible:ring-white/25"
                      />
                      <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
                        <button
                          type="button"
                          aria-pressed={selectedTimeBlockForConstraints.allowAllSkills}
                          onClick={() =>
                            setSelectedTimeBlockForConstraints((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    allowAllSkills: true,
                                    allowedSkillIds: new Set<string>(),
                                  }
                                : prev
                            )
                          }
                          className={clsx(
                            TIME_BLOCK_CONSTRAINT_PILL_BASE,
                            selectedTimeBlockForConstraints.allowAllSkills
                              ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                              : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                          )}
                        >
                          Allow ALL
                        </button>
                        {filteredTimeBlockConstraintSkills.length === 0 ? (
                          <p className="text-[10px] text-white/35">No skills found.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {filteredTimeBlockConstraintSkills.map((skill) => {
                              const selected =
                                !selectedTimeBlockForConstraints.allowAllSkills &&
                                selectedTimeBlockForConstraints.allowedSkillIds.has(skill.id);
                              return (
                                <button
                                  key={skill.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() =>
                                    setSelectedTimeBlockForConstraints((prev) => {
                                      if (!prev) return prev;
                                      const next = new Set(prev.allowedSkillIds);
                                      if (next.has(skill.id)) next.delete(skill.id);
                                      else next.add(skill.id);
                                      return {
                                        ...prev,
                                        allowAllSkills: false,
                                        allowedSkillIds: next,
                                      };
                                    })
                                  }
                                  className={clsx(
                                    TIME_BLOCK_CONSTRAINT_PILL_BASE,
                                    selected
                                      ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                                      : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                                  )}
                                >
                                  <span className={TIME_BLOCK_CONSTRAINT_OPTION_ICON}>
                                    {(skill.icon ?? "*").trim() || "*"}
                                  </span>
                                  <span className="max-w-[8rem] truncate sm:max-w-[10rem]">
                                    {skill.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {!selectedTimeBlockForConstraints.allowAllSkills &&
                      selectedTimeBlockForConstraints.allowedSkillIds.size === 0 ? (
                        <div className="text-[10px] text-white/35">No skills allowed.</div>
                      ) : null}
                    </div>
                  </details>

                  <details className="group grid gap-1">
                    <summary className="flex min-h-7 w-full cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 truncate text-[9px] font-semibold uppercase tracking-[0.26em] text-white/45">
                        Monuments
                      </span>
                      <span className={TIME_BLOCK_CONSTRAINT_CONTROL_PILL}>
                        <span className="truncate group-open:hidden">
                          {formatTimeBlockConstraintSummary(
                            selectedTimeBlockForConstraints.allowedMonumentIds,
                            timeBlockConstraintMonumentOptions,
                            selectedTimeBlockForConstraints.allowAllMonuments
                          )}
                        </span>
                        <span className="hidden truncate group-open:inline">Choose</span>
                      </span>
                    </summary>
                    <div className="space-y-2 pt-1">
                      <Input
                        value={timeBlockMonumentSearch}
                        onChange={(event) => setTimeBlockMonumentSearch(event.target.value)}
                        placeholder="Search monuments..."
                        className="h-8 rounded-full border border-black/60 bg-black/30 px-3 text-xs text-white placeholder:text-white/35 focus-visible:ring-white/25"
                      />
                      <div className="max-h-40 overflow-y-auto pr-1">
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            aria-pressed={selectedTimeBlockForConstraints.allowAllMonuments}
                            onClick={() =>
                              setSelectedTimeBlockForConstraints((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      allowAllMonuments: true,
                                      allowedMonumentIds: new Set<string>(),
                                    }
                                  : prev
                              )
                            }
                            className={clsx(
                              TIME_BLOCK_CONSTRAINT_PILL_BASE,
                              selectedTimeBlockForConstraints.allowAllMonuments
                                ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                                : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                            )}
                          >
                            Allow ALL
                          </button>
                          {filteredTimeBlockConstraintMonuments.length === 0 ? (
                            <p className="w-full text-[10px] text-white/35">
                              No monuments found.
                            </p>
                          ) : (
                            filteredTimeBlockConstraintMonuments.map((monument) => {
                              const selected =
                                !selectedTimeBlockForConstraints.allowAllMonuments &&
                                selectedTimeBlockForConstraints.allowedMonumentIds.has(
                                  monument.id
                                );
                              return (
                                <button
                                  key={monument.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() =>
                                    setSelectedTimeBlockForConstraints((prev) => {
                                      if (!prev) return prev;
                                      const next = new Set(prev.allowedMonumentIds);
                                      if (next.has(monument.id)) next.delete(monument.id);
                                      else next.add(monument.id);
                                      return {
                                        ...prev,
                                        allowAllMonuments: false,
                                        allowedMonumentIds: next,
                                      };
                                    })
                                  }
                                  className={clsx(
                                    TIME_BLOCK_CONSTRAINT_PILL_BASE,
                                    selected
                                      ? TIME_BLOCK_CONSTRAINT_PILL_SELECTED
                                      : TIME_BLOCK_CONSTRAINT_PILL_UNSELECTED
                                  )}
                                >
                                  <span className={TIME_BLOCK_CONSTRAINT_OPTION_ICON}>
                                    {(monument.emoji ?? "*").trim() || "*"}
                                  </span>
                                  <span className="max-w-[8rem] truncate sm:max-w-[10rem]">
                                    {monument.title}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                      {!selectedTimeBlockForConstraints.allowAllMonuments &&
                      selectedTimeBlockForConstraints.allowedMonumentIds.size === 0 ? (
                        <div className="text-[10px] text-white/35">
                          No monuments allowed.
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>

                {timeBlockConstraintsError ? (
                  <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {timeBlockConstraintsError}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSavingTimeBlockConstraints}
                    onClick={() => {
                      setSelectedTimeBlockForConstraints(null);
                      setTimeBlockConstraintsError(null);
                    }}
                    className="rounded-full border border-black/70 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-black hover:bg-black/20 hover:text-white/90 disabled:opacity-55"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingTimeBlockConstraints}
                    onClick={() => {
                      void handleSaveTimeBlockConstraints();
                    }}
                    className="rounded-full border border-white/20 bg-gradient-to-b from-white/16 to-white/7 px-3 py-1.5 text-xs font-semibold text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_10px_24px_rgba(0,0,0,0.4)] transition hover:border-white/35 hover:from-white/22 hover:to-white/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSavingTimeBlockConstraints ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )
      : null;

  if (!dayTimelineModel) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--muted)]">
        Loading schedule…
      </div>
    );
  }

  return (
    <LayoutGroup id="schedule-shared-layout">
      {timeBlockConstraintsPortal}
      <ProtectedRoute>
        <ScheduleTopBar
          year={year}
          weekdayLabel={dayTimelineModel?.dayViewDetails.weekday}
          monthLabel={
            dayTimelineModel
              ? format(
                  toZonedTime(dayTimelineModel.date, dayTimelineModel.viewTimeZone),
                  "MMM"
                ).toUpperCase()
              : undefined
          }
          onBack={handleBack}
          onToday={handleToday}
          onOpenJumpToDate={openInlineJumpToDateFromButton}
          onOpenSearch={() => {
            void hapticPress();
            setIsSearchOpen(true);
          }}
          onReschedule={handleRescheduleClick}
          canReschedule={!isScheduling}
          isRescheduling={isScheduling}
          onClearUncompletedScheduleInstances={
            handleClearUncompletedScheduleInstances
          }
          isClearingUncompletedScheduleInstances={
            isClearingUncompletedScheduleInstances
          }
          onRecycleManualEvents={handleRecycleManualEvents}
          isRecyclingManualEvents={isRecyclingManualEvents}
          isManualSchedulingMode={isManualSchedulingMode}
          onToggleManualSchedulingMode={handleToggleManualSchedulingMode}
          onHeightChange={setTopBarHeight}
        />
        <div
          className="space-y-4 text-[var(--text)]"
          style={{ paddingTop: scheduleContentPaddingTop }}
          data-schedule-root
        >
          <div
            className={clsx(
              "app-surface relative",
              isInlineJumpToDateOpen ? "overflow-visible" : "overflow-hidden"
            )}
            ref={swipeContainerRef}
            style={{
              touchAction: manualPlacementSession ? "none" : TIMELINE_TOUCH_ACTION,
            }}
            onTouchStart={manualPlacementSession ? undefined : handleTouchStart}
            onTouchMove={manualPlacementSession ? undefined : handleTouchMove}
            onTouchEnd={
              manualPlacementSession
                ? undefined
                : (event) => {
                    void handleTouchEnd(event);
                  }
            }
            onTouchCancel={manualPlacementSession ? undefined : handleTouchCancel}
          >
            <motion.div
              animate={jumpPullControls}
              initial={false}
            >
              <div
                data-inline-jump-panel
                data-no-tab-swipe
                ref={inlineJumpPanelRef}
                aria-hidden={!isInlineJumpToDateOpen}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                style={{
                  height: isInlineJumpToDateOpen ? inlineJumpEffectiveRevealHeight : 0,
                  maxHeight: isInlineJumpToDateOpen
                    ? inlineJumpEffectiveRevealHeight
                    : 0,
                  marginTop: isInlineJumpToDateOpen
                    ? shouldUseInlineJumpEditorPanel
                      ? 0
                      : -inlineJumpEffectiveRevealHeight
                    : 0,
                  overflowY: shouldUseInlineJumpEditorPanel
                    ? "auto"
                    : "hidden",
                  overflowAnchor: shouldUseInlineJumpEditorPanel
                    ? "none"
                    : undefined,
                  overscrollBehavior: "contain",
                  touchAction: "pan-y",
                  WebkitOverflowScrolling: "touch",
                  position: "relative",
                  zIndex: shouldUseInlineJumpEditorPanel ? 80 : 1,
                  pointerEvents: isInlineJumpToDateOpen ? "auto" : "none",
                }}
              >
                {isInlineJumpToDateOpen ? (
                  <JumpToDateSheet
                    variant="inline"
                    open={isInlineJumpToDateOpen}
                    onOpenChange={(open) => {
                      if (!open) void closeInlineJumpToDate();
                    }}
                    currentDate={currentDate}
                    timeZone={effectiveTimeZone}
                    onSelectDate={handleInlineJumpToDateSelect}
                    snapshot={jumpToDateSnapshot ?? undefined}
                    onInlineEditorModeChange={setIsInlineJumpEditorMode}
                  />
                ) : null}
              </div>
              {!shouldUseInlineJumpEditorPanel && (
                <div
                  data-inline-jump-timeline-peek
                  onClick={
                    isInlineJumpToDateOpen
                      ? (event) => {
                          const target = event.target;
                          if (isInsideInlineJumpPanelTarget(target)) return;
                          if (
                            !(
                              target instanceof HTMLElement &&
                              target.closest("[data-inline-jump-timeline-peek]")
                            )
                          ) {
                            return;
                          }
                          void closeInlineJumpToDate();
                        }
                      : undefined
                  }
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {view === "day" && (
                      <ScheduleViewShell key="day">
                        {!dayTimelineModel ? (
                          <div className="flex h-64 items-center justify-center text-zinc-500">
                            Loading schedule...
                          </div>
                        ) : prefersReducedMotion ? (
                          dayTimelineNode
                        ) : isSwipingDayView ? (
                          <div className="relative overflow-hidden">
                            <motion.div animate={sliderControls} initial={false}>
                              {dayTimelineNode}
                            </motion.div>
                            <DayPeekOverlays
                              peekState={peekState}
                              previousLabel={previousDayLabel}
                              nextLabel={nextDayLabel}
                              previousKey={previousDayKey}
                              nextKey={nextDayKey}
                              containerRef={dayTimelineContainerRef}
                              previousModel={peekModels.previous}
                              nextModel={peekModels.next}
                              renderPreview={renderDayTimeline}
                              scrollProgress={swipeScrollProgressRef.current}
                              baseTimelineHeight={baseTimelineHeight}
                              timelineChromeHeight={timelineChromeHeight}
                              pxPerMin={pxPerMin}
                            />
                          </div>
                        ) : skipNextDayAnimation ? (
                          <div key={dayViewDateKey}>{dayTimelineNode}</div>
                        ) : (
                          <AnimatePresence
                            mode="sync"
                            initial={false}
                            custom={dayTransitionDirection}
                          >
                            <motion.div
                              key={dayViewDateKey}
                              custom={dayTransitionDirection}
                              variants={dayTimelineVariants}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              transition={dayTimelineTransition}
                            >
                              {dayTimelineNode}
                            </motion.div>
                          </AnimatePresence>
                        )}
                        <FocusTimelineFab
                          hidden={isJumpToDateOpen || isInlineJumpToDateOpen}
                          editTarget={fabEditTarget}
                          onEditClose={handleCloseEditSheet}
                        />
                      </ScheduleViewShell>
                    )}
                    {view === "focus" && (
                      <ScheduleViewShell key="focus">
                        <FocusTimeline
                          hideFab={isJumpToDateOpen || isInlineJumpToDateOpen}
                          editTarget={fabEditTarget}
                          onEditClose={handleCloseEditSheet}
                        />
                      </ScheduleViewShell>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </ProtectedRoute>
      <MemoCompletionDialog
        open={Boolean(memoCompletionState)}
        context={memoCompletionState}
        onOpenChange={(open) => {
          if (!open) setMemoCompletionState(null);
        }}
        onCompleted={handleMemoCompletionSubmitted}
      />
      <JumpToDateSheet
        open={isJumpToDateOpen}
        onOpenChange={(open) => {
          void hapticSnap();
          setIsJumpToDateOpen(open);
        }}
        currentDate={currentDate}
        timeZone={effectiveTimeZone}
        onSelectDate={handleJumpToDateSelect}
        snapshot={jumpToDateSnapshot ?? undefined}
      />
      <ScheduleSearchSheet
        open={isSearchOpen}
        onOpenChange={(open) => {
          void hapticSnap();
          setIsSearchOpen(open);
        }}
        instances={instances}
        taskMap={taskMap}
        projectMap={projectMap}
        onSelectResult={handleSearchResultSelect}
      />
      <SchedulerModeSheet
        open={isModeSheetOpen}
        onOpenChange={(open) => {
          void hapticSnap();
          setIsModeSheetOpen(open);
        }}
        modeType={modeType}
        onModeTypeChange={handleModeTypeChange}
        monumentId={modeMonumentId}
        onMonumentChange={handleMonumentChange}
        skillIds={modeSkillIds}
        onSkillToggle={handleSkillToggle}
        onClearSkills={handleClearSkills}
        monuments={monuments}
        skills={skills}
      />
      {console.log("[SchedulePage] edit sheet props", {
        snapshot: describeEditingSnapshot(editingSnapshot),
        isProjectEditing,
        isHabitEditing,
      })}
      {!fabEditTarget ? (
        <>
          <ProjectEditSheet
            open={isProjectEditing}
            projectId={editingSnapshot?.projectId ?? null}
            instance={editingInstance}
            onClose={handleCloseEditSheet}
            onInstanceDeleted={refreshScheduleData}
          />
          <HabitEditSheet
            open={isHabitEditing}
            habitId={editingSnapshot?.habitId ?? null}
            instance={editingInstance}
            onClose={handleCloseEditSheet}
            onSaved={refreshScheduleData}
            onInstanceDeleted={refreshScheduleData}
          />
        </>
      ) : null}
    </LayoutGroup>
  );
}
