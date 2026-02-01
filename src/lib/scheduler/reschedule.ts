import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "../../../types/supabase";
import {
  fetchBacklogNeedingSchedule,
  cleanupTransientInstances,
  fetchInstancesForRange,
  computeDurationMin,
  createInstance,
  markProjectMissed,
  type ScheduleInstance,
} from "./instanceRepo";
import { buildProjectItems, DEFAULT_PROJECT_DURATION_MIN } from "./projects";
import type { ProjectLite } from "./weight";
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchProjectsMap,
  fetchAllProjectsMap,
  fetchProjectSkillsForProjects,
  fetchGoalsForUser,
  normalizeBlockType,
  type FetchWindowsParityOptions,
  type FetchWindowsParityPayload,
  type WindowLite,
  type WindowKind,
} from "./repo";
import {
  getWindowsForDateFromAll,
  placeItemInWindows,
  type BlockerCache,
  type PlacementDebugTrace,
  type PlacementFailurePayload,
  type PlacementFailureStage,
} from "./placement";
import {
  PlacementFilterWaterfall,
  PlacementReasonCode,
  PlacementTruthTrace,
  SchedulerPlacementDebugCollector,
  BlockGateSample,
  ClosestCandidateTrace,
  GateStageResult,
  NoSlotDetail,
} from "./placementTrace";
import { getAvailabilityWindowKey } from "./windowKey";
import { ENERGY } from "./config";
import {
  fetchHabitsForSchedule,
  DEFAULT_HABIT_DURATION_MIN,
  type HabitScheduleItem,
} from "./habits";
import {
  evaluateHabitDueOnDate,
  normalizeDayList,
  normalizeRecurrence,
  nextOnOrAfterAllowedWeekday,
  resolveRecurrenceInterval,
  type HabitDueEvaluation,
} from "./habitRecurrence";
import {
  addDaysInTimeZone,
  addMonthsInTimeZone,
  differenceInCalendarDaysInTimeZone,
  formatDateKeyInTimeZone,
  getDateTimeParts,
  makeZonedDate,
  setTimeInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";
import { safeDate } from "./safeDate";
import { overlapsHalfOpen } from "./intervals";
import {
  computeForecastDueAt,
  computeNonDailyChainPlan,
} from "./nonDailyChain";
import { computeSyncHabitDuration } from "./syncLayout";
import {
  normalizeCoordinates,
  resolveSunlightBounds,
  type GeoCoordinates,
  type SunlightBounds,
} from "./sunlight";
import {
  normalizeSchedulerModePayload,
  type SchedulerModePayload,
} from "./modes";
import { selectPracticeContext } from "./practiceContextSelector";
import {
  passesTimeBlockConstraints,
  normalizeSet,
  normalizeIdSet,
} from "./constraints";
import { log, type ThrottleOptions } from "@/lib/utils/logGate";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "./limits";

type Client = SupabaseClient<Database>;

const START_GRACE_MIN = 1;
const BASE_LOOKAHEAD_DAYS = 14;
const LOOKAHEAD_PER_ITEM_DAYS = 7;
const MAX_LOOKAHEAD_DAYS = MAX_SCHEDULE_LOOKAHEAD_DAYS;
const HABIT_WRITE_LOOKAHEAD_DAYS = BASE_LOOKAHEAD_DAYS;
const DEFAULT_PROJECT_HORIZON_DAYS = 14;
const LOCATION_CLEANUP_DAYS = 7;
const COMPLETED_RETENTION_DAYS = 3;
const PRACTICE_LOOKAHEAD_DAYS = 7;
const HABIT_MISSED_RETENTION_DAYS = 7;
const LOCATION_MISMATCH_REVALIDATION = "LOCATION_MISMATCH_REVALIDATION";

const SCHEDULER_DEBUG_LOGGING = process.env.SCHEDULER_DEBUG === "true";
const SCHEDULER_PROJECT_DEBUG_LOGGING =
  process.env.SCHEDULER_DEBUG_PROJECTS === "true";

const logSchedulerDebug = (
  message: string,
  data?: unknown,
  opts?: ThrottleOptions
) => {
  if (!SCHEDULER_DEBUG_LOGGING) return;
  log("debug", message, data, opts);
};

const logSchedulerInfo = (message: string, data?: unknown) => {
  if (!SCHEDULER_DEBUG_LOGGING) return;
  log("info", message, data);
};

function mapPlacementFailureStage(
  stage: PlacementFailureStage | null | undefined
): PlacementReasonCode {
  switch (stage) {
    case "availabilityBounds":
    case "durationTooLong":
      return "INSUFFICIENT_TIME";
    case "overlap":
      return "COLLISION";
    case "nowConstraint":
      return "NOW_CONSTRAINT";
    default:
      return "UNKNOWN";
  }
}

function recordFilterReasonCounts(
  collector: SchedulerPlacementDebugCollector,
  projectId: string,
  dayOffset: number,
  counters: PlacementFilterWaterfall
) {
  const reasonEntries: Array<[PlacementReasonCode, number]> = [
    ["DAY_TYPE_INCOMPATIBLE", counters.dayTypeIncompatible],
    ["ITEM_TYPE_NOT_ALLOWED", counters.itemTypeNotAllowed],
    ["SKILL_NOT_ALLOWED", counters.skillNotAllowed],
    ["MONUMENT_NOT_ALLOWED", counters.monumentNotAllowed],
    ["LOCATION_MISMATCH", counters.locationMismatch],
    ["ENERGY_MISMATCH", counters.energyMismatch],
  ];
  for (const [reason, count] of reasonEntries) {
    if (count <= 0) continue;
    collector.recordCandidateFailure(
      projectId,
      `filter-${reason}-${dayOffset}`,
      reason,
      {
        blockId: `filter-${reason}-${dayOffset}`,
        details: `filtered ${count} block(s) on day ${dayOffset}`,
      },
      count
    );
  }
}

const getFinitePositiveDuration = (value?: number | null): number | null => {
  const duration = Number(value ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return duration;
};

const resolveProjectDurationMin = (project?: ProjectLite | null): number => {
  return (
    getFinitePositiveDuration(project?.effective_duration_min) ??
    getFinitePositiveDuration(project?.duration_min) ??
    DEFAULT_PROJECT_DURATION_MIN
  );
};

const getInstanceWindowValue = (
  instance: ScheduleInstance,
  snakeKey: string,
  camelKey: string
): string | null => {
  const snakeValue = (instance as any)[snakeKey];
  if (typeof snakeValue === "string" && snakeValue.trim() !== "") return snakeValue;
  const camelValue = (instance as any)[camelKey];
  if (typeof camelValue === "string" && camelValue.trim() !== "") return camelValue;
  return null;
};

const isLegacyWindowBoundInstance = (instance: ScheduleInstance): boolean => {
  const windowId = getInstanceWindowValue(instance, "window_id", "windowId");
  if (!windowId) return false;
  const dayTypeId = getInstanceWindowValue(
    instance,
    "day_type_time_block_id",
    "dayTypeTimeBlockId"
  );
  const timeBlockId = getInstanceWindowValue(
    instance,
    "time_block_id",
    "timeBlockId"
  );
  return dayTypeId === null && timeBlockId === null;
};

const HABIT_TYPE_PRIORITY: Record<string, number> = {
  CHORE: 0,
  HABIT: 1,
  RELAXER: 1,
  PRACTICE: -1,
  TEMP: 1,
  MEMO: 2,
  SYNC: 3,
};
const DAILY_RECURRENCES = new Set(["daily", "none", "everyday", ""]);

function habitTypePriority(value?: string | null) {
  const normalized = (value ?? "HABIT").toUpperCase();
  return HABIT_TYPE_PRIORITY[normalized] ?? Number.MAX_SAFE_INTEGER;
}

function normalizeRecurrenceValue(value: string | null | undefined) {
  if (!value) return "daily";
  return value.toLowerCase().trim();
}

function isDailyRecurrenceValue(value: string | null | undefined) {
  return DAILY_RECURRENCES.has(normalizeRecurrenceValue(value));
}

type ScheduleFailure = {
  itemId: string;
  reason: string;
  detail?: unknown;
};

type ProjectDraftPlacement = {
  type: "PROJECT";
  instance: ScheduleInstance;
  projectId: string;
  decision: "kept" | "new" | "rescheduled" | "skipped";
  scheduledDayOffset?: number;
  availableStartLocal?: string | null;
  windowStartLocal?: string | null;
  locked?: boolean;
};

type HabitDraftPlacement = {
  type: "HABIT";
  habit: {
    id: string;
    name: string;
    windowId: string | null;
    windowLabel: string | null;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    energyResolved: string | null;
    clipped?: boolean;
    practiceContextId?: string | null;
  };
  decision: "kept" | "new" | "rescheduled" | "skipped";
  scheduledDayOffset?: number;
  availableStartLocal?: string | null;
  windowStartLocal?: string | null;
  instanceId?: string;
};

type ScheduleDraftPlacement = ProjectDraftPlacement | HabitDraftPlacement;

type ParitySummary = {
  parityChecksRun: number;
  mismatches: number;
  firstMismatchContext?: string | null;
};

type HabitScheduleDayResult = {
  placements: HabitDraftPlacement[];
  instances: ScheduleInstance[];
  failures: ScheduleFailure[];
};

type HabitReservation = {
  habitId: string;
  windowId: string;
  windowKey: string;
  startMs: number;
  endMs: number;
  startLocal: Date;
  endLocal: Date;
  availableStartLocal: Date;
  clipped: boolean;
  availabilitySnapshot?: { front: Date; back: Date } | null;
};

type HabitAuditSamples = {
  dueAlreadyHasInstanceToday: string[];
  dueReservationFailed_NoCompatibleWindows: string[];
  dueReservationFailed_WindowMissing: string[];
  dueFailed_NoCompatibleWindows: string[];
  dueFailed_WindowMissing: string[];
  dueSkipped_RepeatablePracticeNoWindows: string[];
};

type HabitAuditReport = {
  inputs: {
    offset: number | null;
    dayStart: string | null;
    timezone: string;
    shouldScheduleHabits: {
      maxOffset: number | null;
      persistedDayLimit: number | null;
      habitWriteLookaheadDays: number | null;
      shouldScheduleHabits: boolean | null;
    };
  };
  habitCounts: {
    totalHabits: number;
    byType: Record<string, number>;
  };
  dueEvaluation: {
    dueCount: number;
    notDueCount: number;
    notDueReasons: Record<string, number>;
  };
  scheduling: {
    dueAlreadyHasInstanceToday: number;
    dueSentToReservation: number;
    dueReservedSuccessfully: number;
    dueReservationFailed_NoCompatibleWindows: number;
    dueReservationFailed_WindowMissing: number;
    dueScheduledSuccessfullyToday: number;
    dueFailed_NoCompatibleWindows: number;
    dueFailed_WindowMissing: number;
    dueSkipped_RepeatablePracticeNoWindows: number;
  };
  windowCompatibility: {
    firstStageToZero: Record<string, number>;
  };
  samples: HabitAuditSamples;
};

type ProjectFailureReason =
  | "skippedLocked"
  | "skippedCompleted"
  | "skippedNoWindows"
  | "failedPlacement"
  | "horizonExhausted";

type ProjectDebugCounts = {
  totalProjectsConsidered: number;
  placedProjects: number;
  skippedLocked: number;
  skippedCompleted: number;
  skippedNoWindows: number;
  failedPlacement: number;
  horizonExhausted: number;
};

type MissBucketSummary = {
  count: number;
  exampleProjectId: string | null;
};

type MissBucketKey =
  | "noCompatibleWindows"
  | "failedPlacement"
  | "lockedOrCompleted"
  | "horizonExhausted";

type ProjectDebugSummary = {
  projectsConsidered: number;
  projectsPlaced: number;
  projectsMissed: number;
  missReasonNoCompatibleWindows: MissBucketSummary;
  missReasonFailedPlacement: MissBucketSummary;
  missReasonLockedOrCompleted: MissBucketSummary;
  missReasonHorizonExhausted: MissBucketSummary;
  /** The bucket that contributed the most misses (if any). */
  largestMissReason?:
    | "noCompatibleWindows"
    | "failedPlacement"
    | "lockedOrCompleted"
    | "horizonExhausted";
  largestMissExampleProjectId?: string | null;
};

type FailureBreakdown = {
  availabilityBounds: number;
  overlap: number;
  durationTooLong: number;
  nowConstraint: number;
  other: number;
};

type ProbeProjectAttemptStats = {
  windowsConsidered: number;
  longestWindowMinutes: number;
  availabilityGapMinutes: number;
  gapWithBlockersMinutes: number;
  overlapBlockers: number;
  notBeforeApplied: boolean;
};

type ProbeSmallProjectOutcomeKind = "success" | "no_fit" | "error" | "unknown";

type ProbeProjectDebug = {
  projectId: string;
  durationMinutes: number;
  dayOffset: number;
  firstAttemptDay: ProbeProjectAttemptStats;
  failureStage?: PlacementFailureStage | "placementError" | null;
};

type ProbeSmallProjectAttemptStats = ProbeProjectAttemptStats;

type ProbeSmallProjectDebug = {
  projectId: string;
  durationMinutes: number;
  dayOffset: number;
  failureStage?: PlacementFailureStage | "placementError" | null;
  firstAttemptDay?: ProbeSmallProjectAttemptStats;
  captured?: boolean;
  outcomeKind?: ProbeSmallProjectOutcomeKind;
  errorType?: string | null;
  errorMessage?: string | null;
};

type DayWindowMetrics = {
  windowsFromGetWindowsForDay: number;
  windowsPassedIntoFetchCompatible: number;
  windowsAfterFetchCompatible: number;
};

type SchedulerDebugSummary = {
  projects: {
    total: number;
    eligible: number;
    locked: number;
    completed: number;
    alreadyScheduled: number;
    blockerStats: {
      blockers_total: number;
      blockers_legacy_window: number;
      blockers_kept_locked_projects: number;
      missingDayTypeOrTimeBlock: number;
      windowIdLegacy: number;
      overlapCandidates: number;
    };
  };
  placed: number;
  fail: {
    noWindows: number;
    blocked: number;
    horizonExhausted: number;
    other: number;
  };
  probe: {
    firstEligibleProjectId: string | null;
    compatibleWindowsDay0: number;
    dayWindowsCacheHits: number;
    dayWindowsCacheMisses: number;
    dayWindowMetrics?: Record<number, DayWindowMetrics>;
  };
  location: {
    rejectedByLocation: number;
    acceptedWithWindowLocationButNullItemLocation: number;
  };
  failBreakdown?: FailureBreakdown;
  probeProject?: ProbeProjectDebug;
  probeSmallProject?: ProbeSmallProjectDebug;
};

type HabitAuditTracker = {
  enabled: boolean;
  report: HabitAuditReport;
  addSample: (bucket: keyof HabitAuditSamples, habitId: string) => void;
  incrReason: (map: Record<string, number>, key: string) => void;
  recordNotDue: (reason: string | undefined) => void;
  recordWindowZeroStage: (stage: string | null, habitId?: string) => void;
};

type ScheduleBacklogResult = {
  placed: ScheduleInstance[];
  failures: ScheduleFailure[];
  error?: PostgrestError | null;
  timeline: ScheduleDraftPlacement[];
  debug: Array<{
    instanceId: string;
    reason: string;
    status: string;
    startUtc: string;
    endUtc: string;
    windowId: string | null;
  }>;
  hasPastInstanceSkipped: boolean;
  syncPairings?: Record<string, string[]>;
  projectDebugSummary?: ProjectDebugSummary;
  paritySummary?: ParitySummary | null;
  debugSummary?: SchedulerDebugSummary;
  placementTrace?: PlacementTruthTrace;
};

type WindowAvailabilityBounds = {
  front: Date;
  back: Date;
};

/**
 * Plan NON-DAILY occurrences across the horizon.
 * - For 'every x days': chain from the first due day, then add +x days repeatedly until horizon end.
 * - For 'weekly' WITH recurrenceDays[]: generate all horizon days whose weekday is in recurrenceDays.
 * - For 'weekly' WITHOUT recurrenceDays: chain by +7 days repeatedly starting from first due day.
 * - For 'monthly': chain by +1 month increments starting from first due day.
 * - For any other: fallback to the first due only.
 */
export function planNonDailyOccurrences(params: {
  habit: HabitScheduleItem;
  userTz: string;
  horizonStartLocalDay: Date;
  horizonEndLocalDay: Date;
  firstDueLocalDay: Date;
  existingScheduledLocalDays: Date[];
}): Date[] {
  const {
    habit,
    userTz,
    horizonStartLocalDay,
    horizonEndLocalDay,
    firstDueLocalDay,
    existingScheduledLocalDays,
  } = params;
  const zone = userTz; // timezone already validated upstream; no normalization helper required.
  const horizonStart = startOfDayInTimeZone(horizonStartLocalDay, zone);
  const horizonEnd = startOfDayInTimeZone(horizonEndLocalDay, zone);
  const horizonStartMs = horizonStart.getTime();
  const horizonEndMs = horizonEnd.getTime();

  let anchor = startOfDayInTimeZone(firstDueLocalDay, zone);
  if (anchor.getTime() < horizonStartMs) {
    anchor = horizonStart;
  }
  const existingDaySet = new Set(
    existingScheduledLocalDays
      .map((day) => startOfDayInTimeZone(day, zone))
      .filter((day) => {
        const ms = day.getTime();
        return (
          Number.isFinite(ms) && ms >= horizonStartMs && ms <= horizonEndMs
        );
      })
      .map((day) => day.getTime())
  );
  const skipAnchor = false;
  const recurrence = normalizeRecurrence(habit.recurrence);
  const recurrenceDays = normalizeDayList(habit.recurrenceDays ?? null);

  const results: Date[] = [];
  const pushUnique = (day: Date) => {
    const normalized = startOfDayInTimeZone(day, zone);
    const ms = normalized.getTime();
    if (ms < horizonStartMs || ms > horizonEndMs) return;
    if (existingDaySet.has(ms)) return;
    if (results.some((entry) => entry.getTime() === ms)) return;
    results.push(normalized);
  };

  if (recurrence === "weekly" && recurrenceDays && recurrenceDays.length > 0) {
    const thresholdMs = skipAnchor
      ? addDaysInTimeZone(anchor, 1, zone).getTime()
      : anchor.getTime();
    const seededStart = addDaysInTimeZone(anchor, skipAnchor ? 1 : 0, zone);
    let cursor = nextOnOrAfterAllowedWeekday(seededStart, recurrenceDays, zone);
    if (cursor.getTime() < horizonStartMs) {
      cursor = nextOnOrAfterAllowedWeekday(horizonStart, recurrenceDays, zone);
    }
    while (cursor.getTime() <= horizonEndMs) {
      if (cursor.getTime() >= thresholdMs) {
        pushUnique(cursor);
      }
      const nextDay = addDaysInTimeZone(cursor, 1, zone);
      cursor = nextOnOrAfterAllowedWeekday(nextDay, recurrenceDays, zone);
      if (cursor.getTime() === nextDay.getTime() && nextDay > horizonEnd) {
        break;
      }
    }
    return results.sort((a, b) => a.getTime() - b.getTime());
  }

  const interval = resolveRecurrenceInterval(
    recurrence,
    habit.recurrenceDays ?? null
  );
  const advanceByDays =
    typeof interval.days === "number" && interval.days > 0
      ? interval.days
      : null;
  const advanceByMonths =
    typeof interval.months === "number" && interval.months > 0
      ? interval.months
      : null;

  if (advanceByDays || advanceByMonths) {
    let cursor = anchor;
    if (skipAnchor) {
      if (advanceByDays) {
        cursor = addDaysInTimeZone(cursor, advanceByDays, zone);
      } else if (advanceByMonths) {
        cursor = addMonthsInTimeZone(cursor, advanceByMonths, zone);
      }
    }
    while (cursor.getTime() <= horizonEndMs) {
      if (cursor.getTime() >= horizonStartMs) {
        pushUnique(cursor);
      }
      if (advanceByDays) {
        cursor = addDaysInTimeZone(cursor, advanceByDays, zone);
      } else if (advanceByMonths) {
        cursor = addMonthsInTimeZone(cursor, advanceByMonths, zone);
      }
    }
    return results.sort((a, b) => a.getTime() - b.getTime());
  }

  if (!skipAnchor) {
    pushUnique(anchor);
  }

  return results.sort((a, b) => a.getTime() - b.getTime());
}

type TimelineInstance = {
  instance: ScheduleInstance;
  startMs: number;
  endMs: number;
  isHardBlocker: boolean;
  isProject: boolean;
  isSyncHabit: boolean;
  updatedAtMs: number | null;
};

const compareTimelineInstances = (a: TimelineInstance, b: TimelineInstance) => {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  const aId = a.instance.id ?? "";
  const bId = b.instance.id ?? "";
  return aId.localeCompare(bId);
};

const isIllegalOverlap = (a: TimelineInstance, b: TimelineInstance) => {
  if (a.isProject || b.isProject) return true;
  return a.isHardBlocker && b.isHardBlocker;
};

const debug = process.env.DEBUG_SCHEDULER_OVERLAP === "true";

const hasBlockingHabitOverlap = (params: {
  candidateIsSync: boolean;
  candidateId?: string | null;
  startMs: number;
  endMs: number;
  existingInstances: ScheduleInstance[];
  habitTypeById: Map<string, string>;
}) => {
  const { startMs, endMs, candidateId, existingInstances, habitTypeById } =
    params;
  let syncOverlapCount = 0;
  for (const inst of existingInstances) {
    if (!inst || inst.status !== "scheduled") continue;
    if (candidateId && inst.id === candidateId) continue;
    const instStart = safeDate(inst.start_utc);
    const instEnd = safeDate(inst.end_utc);
    if (!instStart || !instEnd) continue;
    const instStartMs = instStart.getTime();
    const instEndMs = instEnd.getTime();
    if (!Number.isFinite(instStartMs) || !Number.isFinite(instEndMs)) continue;
    if (!overlapsHalfOpen(startMs, endMs, instStartMs, instEndMs)) continue;
    if (inst.source_type !== "HABIT") continue;
    const habitType = habitTypeById.get(inst.source_id ?? "") ?? "HABIT";
    const normalized = normalizeHabitTypeValue(habitType);
    if (normalized === "SYNC") {
      if (params.candidateIsSync) {
        syncOverlapCount += 1;
        if (syncOverlapCount >= 2) {
          return "SYNC_CAP";
        }
      }
      continue;
    }
    if (normalized === "PRACTICE") {
      continue;
    }
    if (!params.candidateIsSync) {
      return "NON_SYNC_OVERLAP";
    }
  }
  return false;
};

type FinalInvariantInstance = {
  instance: ScheduleInstance;
  startMs: number;
  endMs: number;
  isProject: boolean;
  isHabit: boolean;
  isSyncHabit: boolean;
  allowsOverlap: boolean;
  locked: boolean;
  weightSnapshot: number;
};

const buildFinalInvariantInstances = (
  instances: ScheduleInstance[],
  habitTypeMap: Map<string, string>
): FinalInvariantInstance[] => {
  const list: FinalInvariantInstance[] = [];
  for (const instance of instances) {
    if (!instance) continue;
    if (instance.status !== "scheduled") continue;
    const startMs = new Date(instance.start_utc ?? "").getTime();
    const endMs = new Date(instance.end_utc ?? "").getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs) continue;
    const isProject = instance.source_type === "PROJECT";
    const isHabit = instance.source_type === "HABIT";
    const habitType = habitTypeMap.get(instance.source_id ?? "") ?? "HABIT";
    const normalizedHabitType = normalizeHabitTypeValue(habitType);
    const isSyncHabit = isHabit && normalizedHabitType === "SYNC";
    const weightSnapshot = Number.isFinite(instance.weight_snapshot)
      ? instance.weight_snapshot
      : 0;
    list.push({
      instance,
      startMs,
      endMs,
      isProject,
      isHabit,
      isSyncHabit,
      allowsOverlap: isSyncHabit,
      locked: instance.locked === true,
      weightSnapshot,
    });
  }
  list.sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return (a.instance.id ?? "").localeCompare(b.instance.id ?? "");
  });
  return list;
};

const isFinalInvariantOverlapAllowed = (
  a: FinalInvariantInstance,
  b: FinalInvariantInstance
) => a.allowsOverlap || b.allowsOverlap;

const pickFinalInvariantLoser = (
  a: FinalInvariantInstance,
  b: FinalInvariantInstance
) => {
  if (a.locked !== b.locked) {
    return a.locked ? b : a;
  }
  if (a.isHabit !== b.isHabit) {
    return a.isHabit ? b : a;
  }
  if (a.isProject && b.isProject) {
    if (a.weightSnapshot !== b.weightSnapshot) {
      return a.weightSnapshot > b.weightSnapshot ? b : a;
    }
  }
  if (a.startMs !== b.startMs) {
    return a.startMs <= b.startMs ? b : a;
  }
  const aId = a.instance.id ?? "";
  const bId = b.instance.id ?? "";
  return aId.localeCompare(bId) <= 0 ? b : a;
};

type OverlapPair = {
  canceled: FinalInvariantInstance;
  overlapping: FinalInvariantInstance;
};

type CollectCancelsResult = {
  canceled: Set<string>;
  overlapPairs: OverlapPair[];
};

const collectFinalInvariantCancels = (
  instances: FinalInvariantInstance[],
  options?: {
    nonDailyHabitIds?: Set<string>;
    replacementInstanceIds?: Set<string>;
  }
): CollectCancelsResult => {
  const canceled = new Set<string>();
  const overlapPairs: OverlapPair[] = [];
  const active: FinalInvariantInstance[] = [];
  const nonDailyHabitIds = options?.nonDailyHabitIds;
  const replacementInstanceIds = options?.replacementInstanceIds;

  for (const current of instances) {
    const currentId = current.instance.id ?? "";
    if (!currentId || canceled.has(currentId)) continue;

    for (let index = active.length - 1; index >= 0; index -= 1) {
      const activeId = active[index].instance.id ?? "";
      if (!activeId || canceled.has(activeId)) {
        active.splice(index, 1);
        continue;
      }
      if (active[index].endMs <= current.startMs) {
        active.splice(index, 1);
      }
    }

    let removeCurrent = false;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const other = active[index];
      if (
        !overlapsHalfOpen(
          current.startMs,
          current.endMs,
          other.startMs,
          other.endMs
        )
      ) {
        continue;
      }
      if (isFinalInvariantOverlapAllowed(current, other)) continue;
      let loser: FinalInvariantInstance;
      const currentHabitId = current.instance.source_id ?? "";
      const otherHabitId = other.instance.source_id ?? "";
      const isSameHabit =
        current.isHabit &&
        other.isHabit &&
        currentHabitId.length > 0 &&
        currentHabitId === otherHabitId;
      const isNonDailyHabit =
        isSameHabit && Boolean(nonDailyHabitIds?.has(currentHabitId));
      if (
        isNonDailyHabit &&
        replacementInstanceIds &&
        replacementInstanceIds.size > 0
      ) {
        const currentIsReplacement = replacementInstanceIds.has(currentId);
        const otherId = other.instance.id ?? "";
        const otherIsReplacement =
          otherId.length > 0 && replacementInstanceIds.has(otherId);
        if (currentIsReplacement !== otherIsReplacement) {
          loser = currentIsReplacement ? other : current;
        } else {
          loser = pickFinalInvariantLoser(current, other);
        }
      } else {
        loser = pickFinalInvariantLoser(current, other);
      }
      const loserId = loser.instance.id ?? "";
      if (!loserId) continue;
      canceled.add(loserId);
      // Record the overlap pair
      const overlapPair = {
        canceled: loser,
        overlapping: loser === current ? other : current,
      };
      overlapPairs.push(overlapPair);

      // Log PROJECT-PROJECT overlaps with full instance details
      if (loser.isProject && (loser === current ? other : current).isProject) {
        log("error", "[SCHEDULER] PROJECT-PROJECT overlap detected in final invariant:", {
          canceled: {
            id: loser.instance.id,
            source_id: loser.instance.source_id,
              start_utc: loser.instance.start_utc,
              end_utc: loser.instance.end_utc,
              status: loser.instance.status,
              locked: loser.locked,
              window_id: loser.instance.window_id,
              created_at: loser.instance.created_at,
            },
            overlapping: {
              id: (loser === current ? other : current).instance.id,
              source_id: (loser === current ? other : current).instance
                .source_id,
              start_utc: (loser === current ? other : current).instance
                .start_utc,
              end_utc: (loser === current ? other : current).instance.end_utc,
              status: (loser === current ? other : current).instance.status,
              locked: (loser === current ? other : current).locked,
              window_id: (loser === current ? other : current).instance
                .window_id,
              created_at: (loser === current ? other : current).instance
                .created_at,
            },
          }
        );
      }

      if (loserId === currentId) {
        removeCurrent = true;
        break;
      }
      active.splice(index, 1);
    }

    if (!removeCurrent) {
      active.push(current);
    }
  }

  return { canceled, overlapPairs };
};

const pickOverlapLoser = (a: TimelineInstance, b: TimelineInstance) => {
  if (a.isProject !== b.isProject) {
    return a.isProject ? b : a;
  }
  const aUpdated = a.updatedAtMs;
  const bUpdated = b.updatedAtMs;
  if (
    aUpdated !== null &&
    bUpdated !== null &&
    Number.isFinite(aUpdated) &&
    Number.isFinite(bUpdated) &&
    aUpdated !== bUpdated
  ) {
    return aUpdated > bUpdated ? a : b;
  }
  const aId = a.instance.id ?? "";
  const bId = b.instance.id ?? "";
  return aId.localeCompare(bId) > 0 ? a : b;
};

export const buildTimelineInstancesForRange = (
  instances: ScheduleInstance[],
  rangeStart: Date,
  rangeEnd: Date,
  habitTypeMap: Map<string, string>
) => {
  const rangeStartMs = rangeStart.getTime();
  const rangeEndMs = rangeEnd.getTime();
  const timeline: TimelineInstance[] = [];
  for (const instance of instances) {
    if (!instance) continue;
    if (instance.status !== "scheduled") continue;
    if (instance.locked === true) continue;
    const sourceType = instance.source_type;
    if (sourceType !== "PROJECT" && sourceType !== "HABIT") continue;
    const startMs = new Date(instance.start_utc ?? "").getTime();
    const endMs = new Date(instance.end_utc ?? "").getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs) continue;
    if (!overlapsHalfOpen(rangeStartMs, rangeEndMs, startMs, endMs)) continue;
    const isProject = sourceType === "PROJECT";
    const habitId = instance.source_id ?? "";
    const normalizedType = habitTypeMap.get(habitId) ?? "HABIT";
    const isSyncHabit = !isProject && normalizedType === "SYNC";
    const isHardBlocker = isProject || !isSyncHabit;
    const updatedAtMs = instance.updated_at
      ? new Date(instance.updated_at).getTime()
      : Number.NaN;
    timeline.push({
      instance,
      startMs,
      endMs,
      isHardBlocker,
      isProject,
      isSyncHabit,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : null,
    });
  }
  timeline.sort(compareTimelineInstances);
  return timeline;
};

export const detectIllegalOverlapsUTC = (timeline: TimelineInstance[]) => {
  const overlaps: Array<{ a: TimelineInstance; b: TimelineInstance }> = [];
  const active: TimelineInstance[] = [];
  for (const current of timeline) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].endMs <= current.startMs) {
        active.splice(index, 1);
      }
    }
    for (const other of active) {
      if (
        !overlapsHalfOpen(
          current.startMs,
          current.endMs,
          other.startMs,
          other.endMs
        )
      ) {
        continue;
      }
      if (!isIllegalOverlap(current, other)) continue;
      overlaps.push({ a: other, b: current });
    }
    active.push(current);
  }
  return overlaps;
};

export const resolveOverlapChain = (timeline: TimelineInstance[]) => {
  const losers = new Set<string>();
  const active: TimelineInstance[] = [];
  for (const current of timeline) {
    const currentId = current.instance.id;
    if (!currentId || losers.has(currentId)) continue;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const activeId = active[index].instance.id;
      if (!activeId || losers.has(activeId)) {
        active.splice(index, 1);
        continue;
      }
      if (active[index].endMs <= current.startMs) {
        active.splice(index, 1);
      }
    }

    let removedCurrent = false;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const other = active[index];
      if (
        !overlapsHalfOpen(
          current.startMs,
          current.endMs,
          other.startMs,
          other.endMs
        ) ||
        !isIllegalOverlap(current, other)
      ) {
        continue;
      }
      const loser = pickOverlapLoser(current, other);
      const loserId = loser.instance.id;
      if (!loserId) continue;
      losers.add(loserId);
      if (loserId === currentId) {
        removedCurrent = true;
        break;
      }
      active.splice(index, 1);
    }
    if (!removedCurrent) {
      active.push(current);
    }
  }
  return losers;
};

const chunkIds = (ids: string[], size: number) => {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
};

async function invalidateInstancesAsMissed(
  supabase: Client,
  ids: string[],
  result: ScheduleBacklogResult,
  options?: {
    instancesById?: Map<string, ScheduleInstance>;
    onInvalidateHabit?: (instance: ScheduleInstance) => void;
  }
) {
  if (ids.length === 0) return;

  // First, fetch the instances to determine their source_type
  const { data: instances, error: fetchError } = await supabase
    .from("schedule_instances")
    .select("id, source_type")
    .in("id", ids);

  if (fetchError) {
    result.failures.push({
      itemId: "illegal-overlap",
      reason: "error",
      detail: fetchError,
    });
    return;
  }

  const projectIds: string[] = [];
  const habitIds: string[] = [];
  const otherIds: string[] = [];

  for (const instance of instances ?? []) {
    if (instance.source_type === "PROJECT") {
      projectIds.push(instance.id);
    } else if (instance.source_type === "HABIT") {
      habitIds.push(instance.id);
    } else {
      otherIds.push(instance.id);
    }
  }

  // Use markProjectMissed for PROJECT instances to clear temporal fields
  for (const id of projectIds) {
    const { error } = await markProjectMissed(id, "ILLEGAL_OVERLAP", supabase);
    if (error) {
      result.failures.push({
        itemId: "illegal-overlap",
        reason: "error",
        detail: error,
      });
      if (placementDebugCollector && dayFilterCounters) {
        recordFilterReasonCounts(
          placementDebugCollector,
          item.id,
          dayOffset,
          dayFilterCounters
        );
      }
    }
  }

  // Restore in-memory state for HABIT instances before invalidation.
  if (habitIds.length > 0 && options?.onInvalidateHabit) {
    for (const id of habitIds) {
      const instance = options.instancesById?.get(id);
      if (instance) {
        options.onInvalidateHabit(instance);
      }
    }
  }

  const updateMissedBatch = async (batchIds: string[], payload: any) => {
    if (batchIds.length === 0) return;
    const batches = chunkIds(batchIds, 1000);
    for (const batch of batches) {
      if (process.env.NODE_ENV === "test") {
        for (const id of batch) {
          const { error } = await supabase
            .from("schedule_instances")
            .update(payload)
            .eq("id", id);
          if (error) {
            result.failures.push({
              itemId: "illegal-overlap",
              reason: "error",
              detail: error,
            });
          }
        }
      } else {
        const { error } = await supabase
          .from("schedule_instances")
          .update(payload)
          .in("id", batch);
        if (error) {
          result.failures.push({
            itemId: "illegal-overlap",
            reason: "error",
            detail: error,
          });
        }
      }
    }
  };

  // Use regular update for non-PROJECT instances
  if (habitIds.length + otherIds.length > 0) {
    logSchedulerInfo("[OVERLAP] invalidating non-project instances", {
      habitCount: habitIds.length,
      otherCount: otherIds.length,
    });
  }

  if (habitIds.length > 0) {
    await updateMissedBatch(habitIds, {
      status: "missed",
      missed_reason: "ILLEGAL_OVERLAP",
    });
  }

  if (otherIds.length > 0) {
    await updateMissedBatch(otherIds, {
      status: "missed",
    });
  }
}

async function cancelInstancesAsIllegalOverlap(
  supabase: Client,
  ids: string[]
) {
  if (ids.length === 0) return;
  const payload = {
    status: "canceled",
    canceled_reason: "ILLEGAL_OVERLAP_FINAL",
  } as unknown as Database["public"]["Tables"]["schedule_instances"]["Update"];
  const batches = chunkIds(ids, 1000);
  for (const batch of batches) {
    const { error } = await supabase
      .from("schedule_instances")
      .update(payload)
      .in("id", batch);
    if (error) {
      if (error.status === 400) {
        const { error: fallbackError } = await supabase
          .from("schedule_instances")
          .update({ status: "canceled" })
          .in("id", batch);
        if (fallbackError) {
          throw fallbackError;
        }
        continue;
      }
      throw error;
    }
  }
}

async function cancelInstancesAsRescheduleRebuild(
  supabase: Client,
  ids: string[]
) {
  if (ids.length === 0) return;
  const payload = {
    status: "canceled",
    canceled_reason: "RESCHEDULE_REBUILD",
  } as unknown as Database["public"]["Tables"]["schedule_instances"]["Update"];
  const batches = chunkIds(ids, 1000);
  for (const batch of batches) {
    const { error } = await supabase
      .from("schedule_instances")
      .update(payload)
      .in("id", batch);
    if (error) {
      throw error;
    }
  }
}

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client;

  if (typeof window === "undefined") {
    const supabase = await createServerClient();
    if (!supabase) {
      throw new Error("Supabase server client not available");
    }
    return supabase as Client;
  }

  throw new Error("Supabase client not available");
}

function parseNextDueOverride(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

const normalizeLocationContextValue = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().trim();
  if (!normalized || normalized === "ANY") return null;
  return normalized;
};

const doesWindowMatchHabitLocation = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null
) => {
  if (!windowRecord) return true;
  if (!habit) return false;
  const windowLocationId =
    typeof windowRecord.location_context_id === "string" &&
    windowRecord.location_context_id.trim().length > 0
      ? windowRecord.location_context_id.trim()
      : null;
  const windowLocationValue = normalizeLocationContextValue(
    windowRecord.location_context_value ?? null
  );
  const windowRequiresLocation = Boolean(
    windowLocationId || windowLocationValue
  );
  if (!windowRequiresLocation) return true;
  const habitLocationId =
    typeof habit.locationContextId === "string" &&
    habit.locationContextId.trim().length > 0
      ? habit.locationContextId.trim()
      : null;
  const habitLocationValue = normalizeLocationContextValue(
    habit.locationContextValue ?? null
  );
  const habitHasLocation = Boolean(habitLocationId || habitLocationValue);
  if (!habitHasLocation) return false;
  if (habitLocationId) {
    return windowLocationId === habitLocationId;
  }
  return habitLocationValue ? windowLocationValue === habitLocationValue : true;
};

const normalizeHabitTypeValue = (value?: string | null) => {
  const raw = (value ?? "HABIT").toUpperCase();
  return raw;
};

const doesWindowAllowHabitType = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null
) => {
  if (!windowRecord) return true;
  const kind: WindowKind = windowRecord.window_kind ?? "DEFAULT";
  if (kind === "BREAK") {
    return normalizeHabitTypeValue(habit?.habitType) === "RELAXER";
  }
  if (kind === "PRACTICE") {
    return normalizeHabitTypeValue(habit?.habitType) === "PRACTICE";
  }
  return true;
};

export async function markMissedAndQueue(
  userId: string,
  now = new Date(),
  client?: Client
) {
  const supabase = await ensureClient(client);
  const cutoff = new Date(
    now.getTime() - START_GRACE_MIN * 60000
  ).toISOString();
  return await supabase
    .from("schedule_instances")
    .update({ status: "missed" })
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .lt("start_utc", cutoff);
}

async function normalizeProjectInstances(
  userId: string,
  projectsMap: Record<string, ProjectLite>,
  supabase: Client
) {
  // Load ALL existing PROJECT schedule_instances for user (no filters)
  const { data: allProjectInstances, error } = await supabase
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT");

  if (error) {
    throw new Error(`Failed to load project instances: ${error.message}`);
  }

  const instancesByProject = new Map<string, ScheduleInstance[]>();
  for (const instance of allProjectInstances ?? []) {
    const projectId = instance.source_id ?? "";
    if (!projectId) continue;
    const list = instancesByProject.get(projectId) ?? [];
    list.push(instance);
    instancesByProject.set(projectId, list);
  }

  // Deterministic canonical selection: locked > scheduled > missed > canceled > tiebreak
  const getPriority = (status: string, locked: boolean): number => {
    if (locked) return 0; // locked has highest priority
    switch (status) {
      case "scheduled":
        return 1;
      case "missed":
        return 2;
      case "canceled":
        return 3;
      default:
        return 4;
    }
  };

  const selectCanonical = (instances: ScheduleInstance[]): ScheduleInstance => {
    return instances.sort((a, b) => {
      const aPriority = getPriority(a.status, a.locked ?? false);
      const bPriority = getPriority(b.status, b.locked ?? false);
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Tiebreak by id (assuming UUID lexical order)
      return (a.id ?? "").localeCompare(b.id ?? "");
    })[0];
  };

  // Process each project
  for (const [projectId, project] of Object.entries(projectsMap)) {
    const instances = instancesByProject.get(projectId) ?? [];

    if (instances.length === 0) {
      // Create exactly one missed instance
      const { error: insertError } = await supabase
        .from("schedule_instances")
        .insert({
          user_id: userId,
          source_type: "PROJECT",
          source_id: projectId,
          status: "missed",
          start_utc: null,
          end_utc: null,
          duration_min: resolveProjectDurationMin(project),
          window_id: null,
          energy_resolved: project.energy ?? "NO",
          locked: false,
          weight_snapshot: project.weight ?? 0,
        });
      if (insertError) {
        throw new Error(
          `Failed to create missed instance for project ${projectId}: ${insertError.message}`
        );
      }
    } else if (instances.length > 1) {
      // Select canonical and mark extras as canceled
      const canonical = selectCanonical(instances);
      const extras = instances.filter((inst) => inst.id !== canonical.id);
      for (const extra of extras) {
        const { error: updateError } = await supabase
          .from("schedule_instances")
          .update({ status: "canceled" })
          .eq("id", extra.id);
        if (updateError) {
          throw new Error(
            `Failed to cancel duplicate instance ${extra.id}: ${updateError.message}`
          );
        }
      }
    }
    // If exactly one, leave it as is
  }
}

export async function scheduleBacklog(
  userId: string,
  baseDate = new Date(),
  client?: Client,
  options?: {
    timeZone?: string | null;
    location?: GeoCoordinates | null;
    mode?: SchedulerModePayload | null;
    writeThroughDays?: number | null;
    writeThroughDaysOverride?: number | null;
    utcOffsetMinutes?: number | null;
    debug?: boolean | null;
    parity?: boolean | null;
  }
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client);
  const parityEnabled = options?.parity === true;
  const paritySummary: ParitySummary | null = parityEnabled
    ? {
        parityChecksRun: 0,
        mismatches: 0,
        firstMismatchContext: null,
      }
    : null;
  const parityOptions: FetchWindowsParityOptions | undefined =
    parityEnabled && paritySummary
      ? {
          enabled: true,
          onCheck: (payload: FetchWindowsParityPayload) => {
            paritySummary.parityChecksRun += 1;
            if (!payload.mismatch) return;
            paritySummary.mismatches += 1;
            if (
              !paritySummary.firstMismatchContext &&
              payload.context &&
              payload.context.length > 0
            ) {
              paritySummary.firstMismatchContext = payload.context;
            }
          },
        }
      : undefined;
  const windowOptionsBase = {
    userId,
    parity: parityOptions,
  };
  const blockerCache: BlockerCache = new Map<string, ScheduleInstance[]>();
  const result: ScheduleBacklogResult = {
    placed: [],
    failures: [],
    timeline: [],
    debug: [],
    hasPastInstanceSkipped: false,
    paritySummary,
  };
  let placementDebugCollector: SchedulerPlacementDebugCollector | null = null;
  const debugEnabled = Boolean(options?.debug);
  const projectDebugCounts: ProjectDebugCounts = {
    totalProjectsConsidered: 0,
    placedProjects: 0,
    skippedLocked: 0,
    skippedCompleted: 0,
    skippedNoWindows: 0,
    failedPlacement: 0,
    horizonExhausted: 0,
  };
  const locationDebugCounts = {
    rejectedByLocation: 0,
    acceptedWithWindowLocationButNullItemLocation: 0,
  };
  const locationDebugContext = {
    rejectedByLocation: () => {
      locationDebugCounts.rejectedByLocation += 1;
    },
    acceptedWithWindowLocationButNullItemLocation: () => {
      locationDebugCounts.acceptedWithWindowLocationButNullItemLocation += 1;
    },
  };
  const schedulerDebugSummary: SchedulerDebugSummary = {
    projects: {
      total: 0,
      eligible: 0,
      locked: 0,
      completed: 0,
      alreadyScheduled: 0,
    blockerStats: {
      blockers_total: 0,
      blockers_legacy_window: 0,
      blockers_kept_locked_projects: 0,
      missingDayTypeOrTimeBlock: 0,
      windowIdLegacy: 0,
      overlapCandidates: 0,
    },
    },
    placed: 0,
    fail: {
      noWindows: 0,
      blocked: 0,
      horizonExhausted: 0,
      other: 0,
    },
    probe: {
      firstEligibleProjectId: null,
      compatibleWindowsDay0: 0,
      dayWindowsCacheHits: 0,
      dayWindowsCacheMisses: 0,
    },
    location: {
      rejectedByLocation: 0,
      acceptedWithWindowLocationButNullItemLocation: 0,
    },
    failBreakdown: debugEnabled
      ? {
          availabilityBounds: 0,
          overlap: 0,
          durationTooLong: 0,
          nowConstraint: 0,
          other: 0,
        }
      : undefined,
    probeProject: undefined,
  };
  const projectFailureSamples = new Map<ProjectFailureReason, string | null>();
  const projectFailureReasons: ProjectFailureReason[] = [
    "skippedLocked",
    "skippedCompleted",
    "skippedNoWindows",
    "failedPlacement",
    "horizonExhausted",
  ];
  const recordProjectFailure = (
    reason: ProjectFailureReason,
    projectId?: string | null
  ) => {
    if (!debugEnabled) return;
    projectDebugCounts[reason] += 1;
    if (!projectFailureSamples.has(reason)) {
      projectFailureSamples.set(reason, projectId ?? null);
    }
  };
  const cancelLogCounts = new Map<string, number>();
  const canceledHabitIds: string[] = [];

  // Clear all existing missed habit instances before starting fresh
  await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "HABIT")
    .eq("status", "missed");

  const timeZone = options?.timeZone ?? "UTC"; // timezone already validated upstream; no normalization helper required.
  const location = normalizeCoordinates(options?.location ?? null);
  const mode = normalizeSchedulerModePayload(
    options?.mode ?? { type: "REGULAR" }
  );
  const isRushMode = mode.type === "RUSH";
  const isRestMode = mode.type === "REST";
  const restrictProjectsToToday = mode.type === "SKILLED";
  const durationMultiplier = isRushMode ? 0.8 : 1;
  const filteredProjectIds = new Set<string>();
  const noteModeFiltered = (projectId: string) => {
    if (!projectId || filteredProjectIds.has(projectId)) return;
    filteredProjectIds.add(projectId);
    result.failures.push({ itemId: projectId, reason: "MODE_FILTERED" });
  };
  const adjustDuration = (value: number): number => {
    if (!Number.isFinite(value) || value <= 0) return value;
    if (durationMultiplier === 1) return value;
    return Math.max(1, Math.round(value * durationMultiplier));
  };
  const timeZoneOffsetMinutes =
    typeof options?.utcOffsetMinutes === "number" &&
    Number.isFinite(options.utcOffsetMinutes)
      ? options.utcOffsetMinutes
      : null;

  const missed = await fetchBacklogNeedingSchedule(userId, supabase);
  if (missed.error) {
    result.error = missed.error;
    return result;
  }

  const tasks = await fetchReadyTasks(supabase);
  const allProjectsMap = await fetchAllProjectsMap(supabase);
  const projectsMap = await fetchProjectsMap(supabase);
  await normalizeProjectInstances(userId, allProjectsMap, supabase);
  const goals = await fetchGoalsForUser(userId, supabase);
  const habits = await fetchHabitsForSchedule(userId, supabase);
  const habitAllowsOverlap = new Map<string, boolean>();
  const habitById = new Map<string, HabitScheduleItem>();
  const habitTypeById = new Map<string, string>();
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    habitAllowsOverlap.set(habit.id, normalizedType === "SYNC");
    habitTypeById.set(habit.id, normalizedType);
    habitById.set(habit.id, habit);
  }
  const dailyHabits = habits.filter((habit) =>
    isDailyRecurrenceValue(habit.recurrence)
  );
  const nonDailyHabits = habits.filter(
    (habit) => !isDailyRecurrenceValue(habit.recurrence)
  );
  const nonDailyHabitIds = new Set(nonDailyHabits.map((habit) => habit.id));
  const habitTypeCounts: Record<string, number> = {};
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    habitTypeCounts[normalizedType] =
      (habitTypeCounts[normalizedType] ?? 0) + 1;
  }
  const habitAuditReport: HabitAuditReport = {
    inputs: {
      offset: null,
      dayStart: null,
      timezone: timeZone,
      shouldScheduleHabits: {
        maxOffset: null,
        persistedDayLimit: null,
        habitWriteLookaheadDays: null,
        shouldScheduleHabits: null,
      },
    },
    habitCounts: {
      totalHabits: habits.length,
      byType: habitTypeCounts,
    },
    dueEvaluation: {
      dueCount: 0,
      notDueCount: 0,
      notDueReasons: {},
    },
    scheduling: {
      dueAlreadyHasInstanceToday: 0,
      dueSentToReservation: 0,
      dueReservedSuccessfully: 0,
      dueReservationFailed_NoCompatibleWindows: 0,
      dueReservationFailed_WindowMissing: 0,
      dueScheduledSuccessfullyToday: 0,
      dueFailed_NoCompatibleWindows: 0,
      dueFailed_WindowMissing: 0,
      dueSkipped_RepeatablePracticeNoWindows: 0,
    },
    windowCompatibility: {
      firstStageToZero: {},
    },
    samples: {
      dueAlreadyHasInstanceToday: [],
      dueReservationFailed_NoCompatibleWindows: [],
      dueReservationFailed_WindowMissing: [],
      dueFailed_NoCompatibleWindows: [],
      dueFailed_WindowMissing: [],
      dueSkipped_RepeatablePracticeNoWindows: [],
    },
  };

  const habitAudit: HabitAuditTracker = {
    enabled: true,
    report: habitAuditReport,
    addSample: (bucket, habitId) => {
      if (!habitId) return;
      const list = habitAuditReport.samples[bucket];
      if (list.length >= 10) return;
      if (list.includes(habitId)) return;
      list.push(habitId);
    },
    incrReason: (map, key) => {
      map[key] = (map[key] ?? 0) + 1;
    },
    recordNotDue: (reason) => {
      const tag = reason && reason.trim().length > 0 ? reason : "UNKNOWN";
      habitAuditReport.dueEvaluation.notDueCount += 1;
      habitAudit.incrReason(habitAuditReport.dueEvaluation.notDueReasons, tag);
    },
    recordWindowZeroStage: (stage) => {
      if (!stage) return;
      habitAudit.incrReason(
        habitAuditReport.windowCompatibility.firstStageToZero,
        stage
      );
    },
  };
  const taskContextById = new Map<string, string | null>();
  const contextTaskCounts = new Map<string, number>();
  for (const task of tasks) {
    const contextId = task.skill_monument_id
      ? String(task.skill_monument_id).trim()
      : null;
    if (!contextId) continue;
    taskContextById.set(task.id, contextId);
    contextTaskCounts.set(
      contextId,
      (contextTaskCounts.get(contextId) ?? 0) + 1
    );
  }
  let practiceHistory = new Map<string, Date>();
  if (process.env.NODE_ENV !== "test") {
    try {
      practiceHistory = await fetchPracticeContextHistory(userId, supabase);
    } catch (error) {
      log("error", "Failed to load practice context history", error);
      practiceHistory = new Map();
    }
  }
  const createdThisRun = new Set<string>();
  const logCancel = (
    reason: string,
    instance: ScheduleInstance | null | undefined,
    meta?: { dayKey?: string | null; dayOffset?: number | null }
  ) => {
    const id = instance?.id ?? null;
    cancelLogCounts.set(reason, (cancelLogCounts.get(reason) ?? 0) + 1);
    if (instance?.source_type === "HABIT" && id) {
      canceledHabitIds.push(id);
    }
    logSchedulerDebug("[SCHEDULER_CANCEL]", {
      cancel_reason: reason,
      instance_id: id,
      source_type: instance?.source_type ?? null,
      source_id: instance?.source_id ?? null,
      start_utc: instance?.start_utc ?? null,
      end_utc: instance?.end_utc ?? null,
      dayKey: meta?.dayKey ?? null,
      dayOffset: meta?.dayOffset ?? null,
      createdThisRun: id ? createdThisRun.has(id) : false,
    });
  };
  const nowMs = baseDate.getTime();
  const habitLastScheduledStart = new Map<string, Date>();
  const recordHabitScheduledStart = (
    habitId: string | null | undefined,
    startInput: Date | string | null | undefined
  ) => {
    if (!habitId || !startInput) return;
    const start =
      startInput instanceof Date
        ? new Date(startInput.getTime())
        : new Date(startInput ?? "");
    if (Number.isNaN(start.getTime())) return;
    if (start.getTime() < nowMs) return;
    const normalized = startOfDayInTimeZone(start, timeZone);
    const previous = habitLastScheduledStart.get(habitId);
    if (!previous || normalized.getTime() > previous.getTime()) {
      habitLastScheduledStart.set(habitId, normalized);
    }
  };
  const getHabitLastScheduledStart = (habitId: string) =>
    habitLastScheduledStart.get(habitId) ?? null;
  // Removed legacy windowSnapshot - now using day-type-aware windows via fetchWindowsForDate
  const goalWeightsById = goals.reduce<Record<string, number>>((acc, goal) => {
    acc[goal.id] = goal.weight ?? 0;
    return acc;
  }, {});

  // Recalculate global ranks before processing (they may be stale)
  await recalculateGlobalRanks(userId, projectsMap, goals, supabase);

  async function recalculateGlobalRanks(
    userId: string,
    projectsMap: Record<string, any>,
    goals: any[],
    supabase: Client
  ) {
    // Calculate new global ranks based on goal priority + project priority + stage
    const projectScores: Array<{ id: string; score: number }> = [];

    for (const [projectId, project] of Object.entries(projectsMap)) {
      const goal = goals.find((g) => g.id === project.goal_id);
      if (!goal) continue;

      // Score calculation: goal_priority * 1000000 + project_priority * 10000 + stage * 100
      const goalPriority = goal.priority_code
        ? getPriorityIndex(goal.priority_code)
        : 3;
      const projectPriority = project.priority
        ? getPriorityIndex(project.priority)
        : 3;
      const stage = project.stage ? getStageIndex(project.stage) : 3;

      const score =
        goalPriority * 1000000 + projectPriority * 10000 + stage * 100;
      projectScores.push({ id: projectId, score });
    }

    // Sort by score descending (higher score = higher priority = lower rank number)
    projectScores.sort((a, b) => b.score - a.score);

    // Update global_rank in database (rank 1 = highest priority)
    for (let i = 0; i < projectScores.length; i++) {
      const rank = i + 1;
      await supabase
        .from("projects")
        .update({ global_rank: rank })
        .eq("id", projectScores[i].id);

      // Update in-memory map too
      if (projectsMap[projectScores[i].id]) {
        projectsMap[projectScores[i].id].globalRank = rank;
      }
    }
  }

  function getPriorityIndex(priority: string): number {
    const priorityMap: Record<string, number> = {
      "ULTRA-CRITICAL": 6,
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      NO: 1,
    };
    return priorityMap[priority.toUpperCase()] || 3;
  }

  function getStageIndex(stage: string): number {
    const stageMap: Record<string, number> = {
      RESEARCH: 6,
      TEST: 5,
      REFINE: 4,
      BUILD: 3,
      RELEASE: 2,
    };
    return stageMap[stage.toUpperCase()] || 3;
  }

  const projectItems = buildProjectItems(
    Object.values(projectsMap),
    tasks,
    goalWeightsById
  );

  const projectsById = new Map<string, (typeof projectItems)[0]>();
  for (const p of projectItems) {
    if (!projectsById.has(p.id)) {
      projectsById.set(p.id, p);
    }
  }

  const byGlobalRank = (
    a: (typeof projectItems)[0],
    b: (typeof projectItems)[0]
  ) => {
    const aRank = a.globalRank ?? Number.POSITIVE_INFINITY;
    const bRank = b.globalRank ?? Number.POSITIVE_INFINITY;
    return aRank - bRank;
  };

  const projectQueue = [...projectsById.values()].sort(byGlobalRank);
  schedulerDebugSummary.projects.total = projectQueue.length;

  if (!debugEnabled) {
    logSchedulerDebug(
      "[SORT_DEBUG] First sort results (first 10):",
      projectQueue.slice(0, 10).map((p) => ({ id: p.id, rank: p.globalRank }))
    );
  }

  // TEMPORARY ASSERTION: enforce ordering at runtime
  for (let i = 1; i < projectQueue.length; i++) {
    const prev = projectQueue[i - 1];
    const cur = projectQueue[i];
    const prevRank = prev.globalRank ?? Number.POSITIVE_INFINITY;
    const curRank = cur.globalRank ?? Number.POSITIVE_INFINITY;

    if (curRank < prevRank) {
      throw new Error(
        `QUEUE_NOT_SORTED: prev=${prev.id}:${prevRank} cur=${cur.id}:${curRank}`
      );
    }
  }

  const projectItemMap: Record<string, (typeof projectItems)[0]> = {};
  for (const item of projectItems) projectItemMap[item.id] = item;

  const taskSkillsByProjectId = new Map<string, Set<string>>();
  for (const task of tasks) {
    const projectId = task.project_id ?? null;
    if (!projectId) continue;
    if (task.skill_id) {
      const existing =
        taskSkillsByProjectId.get(projectId) ?? new Set<string>();
      existing.add(task.skill_id);
      taskSkillsByProjectId.set(projectId, existing);
    }
  }

  let projectSkillsMap: Record<string, string[]> = {};
  if (mode.type === "SKILLED") {
    try {
      const projectIds = Object.keys(projectsMap);
      if (projectIds.length > 0) {
        projectSkillsMap = await fetchProjectSkillsForProjects(
          projectIds,
          supabase
        );
      }
    } catch (error) {
      log(
        "error",
        "Failed to fetch project skill links for scheduler mode",
        error
      );
      projectSkillsMap = {};
    }
  }

  const projectSkillIdsCache = new Map<string, string[]>();
  const getProjectSkillIds = (projectId: string): string[] => {
    const cached = projectSkillIdsCache.get(projectId);
    if (cached) return cached;
    const set = new Set<string>();
    for (const id of projectSkillsMap[projectId] ?? []) {
      if (id) set.add(id);
    }
    const taskSkillIds = taskSkillsByProjectId.get(projectId);
    if (taskSkillIds) {
      for (const id of taskSkillIds) {
        if (id) set.add(id);
      }
    }
    const ids = Array.from(set);
    projectSkillIdsCache.set(projectId, ids);
    return ids;
  };
  const goalMonumentById = new Map<string, string | null>();
  for (const goal of goals) {
    goalMonumentById.set(goal.id, goal.monumentId ?? null);
  }
  const getProjectGoalMonumentId = (projectId: string): string | null => {
    const project = projectsMap[projectId];
    if (!project) return null;
    const goalId = project.goal_id ?? null;
    if (!goalId) return null;
    return goalMonumentById.get(goalId) ?? null;
  };
  const projectMatchesSelectedMonument = (projectId: string): boolean => {
    if (mode.type !== "MONUMENTAL") return false;
    if (!mode.monumentId) return false;
    const monumentId = getProjectGoalMonumentId(projectId);
    if (!monumentId) return false;
    return monumentId === mode.monumentId;
  };

  const matchesMode = (projectId: string): boolean => {
    if (mode.type === "MONUMENTAL") {
      return true;
    }
    if (mode.type === "SKILLED") {
      const required = new Set(mode.skillIds);
      if (required.size === 0) return false;
      return getProjectSkillIds(projectId).some((id) => required.has(id));
    }
    return true;
  };

  type QueueItem = {
    id: string;
    sourceType: "PROJECT";
    duration_min: number;
    energy: string;
    weight: number;
    goalWeight: number;
    globalRank: number | null;
    instanceId?: string | null;
    preferred?: boolean;
    eventName: string;
  };

  const queue: QueueItem[] = [];
  const baseStart = startOfDayInTimeZone(baseDate, timeZone);
  if (debugEnabled) {
    placementDebugCollector = new SchedulerPlacementDebugCollector(
      timeZone,
      baseStart.toISOString()
    );
  }
  const completedRetentionStart = startOfDayInTimeZone(
    addDaysInTimeZone(baseDate, -COMPLETED_RETENTION_DAYS, timeZone),
    timeZone
  );
  const completedRetentionStartMs = completedRetentionStart.getTime();
  const dayOffsetFor = (startUTC: string): number | undefined => {
    const start = new Date(startUTC);
    if (Number.isNaN(start.getTime())) return undefined;
    const diff = differenceInCalendarDaysInTimeZone(baseStart, start, timeZone);
    return Number.isFinite(diff) ? diff : undefined;
  };

  const reuseInstanceByProject = new Map<string, string>();

  const registerReuseInstance = (
    projectId: string,
    reuseId?: string | null
  ) => {
    if (!reuseId) return;
    if (reuseInstanceByProject.has(projectId)) return;
    reuseInstanceByProject.set(projectId, reuseId);
  };

  const collectReuseIds = (source: Map<string, string[]>) => {
    for (const [projectId, ids] of source) {
      const reuseId = ids.find(Boolean);
      registerReuseInstance(projectId, reuseId);
    }
  };

  const collectPrimaryReuseIds = (source: Map<string, string>) => {
    for (const [projectId, reuseId] of source) {
      registerReuseInstance(projectId, reuseId);
    }
  };

  const queuedProjectIds = new Set(queue.map((item) => item.id));

  const enqueue = (
    def: {
      id: string;
      duration_min: number;
      energy: string | null | undefined;
      weight: number;
      goalWeight?: number;
      globalRank?: number | null;
      name?: string;
    } | null
  ) => {
    if (!def) return;
    let duration = Number(def.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) return;
    duration = adjustDuration(duration);
    if (queuedProjectIds.has(def.id)) return;
    const energy = (def.energy ?? "NO").toString().toUpperCase();
    queue.push({
      id: def.id,
      sourceType: "PROJECT",
      duration_min: duration,
      energy,
      weight: def.weight ?? 0,
      goalWeight: def.goalWeight ?? 0,
      globalRank:
        typeof def.globalRank === "number" && Number.isFinite(def.globalRank)
          ? def.globalRank
          : null,
      preferred: projectMatchesSelectedMonument(def.id),
      eventName: def.name || def.id,
    });
    queuedProjectIds.add(def.id);
  };

  for (const project of projectQueue) {
    enqueue(project);
  }
  if (debugEnabled) {
    projectDebugCounts.totalProjectsConsidered = queue.length;
  }

  // Assign canonical instance IDs to all queue items for proper reuse
  const { data: canonicalInstances } = await supabase
    .from("schedule_instances")
    .select("id, source_id")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT");

  const projectToInstanceId = new Map<string, string>();
  for (const inst of (canonicalInstances as
    | { id: string; source_id: string }[]
    | null) ?? []) {
    if (inst.source_id) {
      projectToInstanceId.set(inst.source_id, inst.id);
    }
  }

  for (const item of queue) {
    const instanceId = projectToInstanceId.get(item.id);
    if (instanceId) {
      item.instanceId = instanceId;
    }
  }

  const allProjectIds = new Set(projectQueue.map((p) => p.id));
  const finalQueueProjectIds = new Set(queuedProjectIds);
  const lookaheadDays = Math.min(
    MAX_LOOKAHEAD_DAYS,
    BASE_LOOKAHEAD_DAYS + queue.length * LOOKAHEAD_PER_ITEM_DAYS
  );
  const requestedWriteThroughDays = options?.writeThroughDays ?? null;
  const persistedDayLimit = (() => {
    if (
      requestedWriteThroughDays === null ||
      requestedWriteThroughDays === undefined
    ) {
      return lookaheadDays;
    }
    const coerced = Math.floor(Number(requestedWriteThroughDays));
    if (!Number.isFinite(coerced) || coerced < 0) return lookaheadDays;
    return Math.min(lookaheadDays, coerced);
  })();
  const writeThroughDaysOverride = (() => {
    const override = options?.writeThroughDaysOverride;
    if (override === null || override === undefined) return null;
    if (typeof override !== "number" || !Number.isFinite(override)) {
      return null;
    }
    const coerced = Math.floor(override);
    if (coerced <= 0) return null;
    return Math.min(coerced, MAX_LOOKAHEAD_DAYS);
  })();
  const effectiveDayLimit = writeThroughDaysOverride ?? persistedDayLimit;
  const hasExplicitProjectHorizon =
    writeThroughDaysOverride !== null || requestedWriteThroughDays !== null;
  const effectiveHorizonDays = debugEnabled
    ? hasExplicitProjectHorizon
      ? effectiveDayLimit
      : Math.min(effectiveDayLimit, DEFAULT_PROJECT_HORIZON_DAYS)
    : effectiveDayLimit;
  const habitWriteLookaheadDays = Math.min(
    lookaheadDays,
    HABIT_WRITE_LOOKAHEAD_DAYS,
    effectiveDayLimit
  );
  const cleanupOffsetLimit = Math.max(effectiveDayLimit, habitWriteLookaheadDays);
  const dedupeWindowDays = Math.max(lookaheadDays, 28);
  const rangeEnd = addDaysInTimeZone(baseStart, dedupeWindowDays, timeZone);
  const writeThroughEnd =
    effectiveDayLimit > 0
      ? addDaysInTimeZone(baseStart, effectiveDayLimit, timeZone)
      : baseStart;
  const dedupe = await dedupeScheduledProjects(
    supabase,
    userId,
    baseStart,
    rangeEnd,
    allProjectIds,
    writeThroughEnd,
    debugEnabled
  );
  if (dedupe.error) {
    result.error = dedupe.error;
    return result;
  }
  if (dedupe.failures.length > 0) {
    result.failures.push(...dedupe.failures);
  }
  const effectiveLastCompletedAt = dedupe.effectiveLastCompletedAt;
  const lockedProjectInstances = dedupe.lockedProjectInstances;
  if (lockedProjectInstances.size > 0) {
    for (const projectId of lockedProjectInstances.keys()) {
      recordProjectFailure("skippedLocked", projectId);
      queuedProjectIds.delete(projectId);
      finalQueueProjectIds.delete(projectId);
    }
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index];
      if (lockedProjectInstances.has(item.id)) {
        queue.splice(index, 1);
      }
    }
  }
  schedulerDebugSummary.projects.locked = lockedProjectInstances.size;
  collectPrimaryReuseIds(dedupe.reusableByProject);
  collectReuseIds(dedupe.canceledByProject);
  const timelineInstances = buildTimelineInstancesForRange(
    dedupe.allInstances,
    baseStart,
    rangeEnd,
    habitTypeById
  );
  const invalidatedInstanceIds = resolveOverlapChain(timelineInstances);
  const timelineById = new Map(
    timelineInstances
      .map((entry) => [entry.instance.id, entry] as const)
      .filter(([id]) => Boolean(id))
  );
  const overlapProjectIds = new Set<string>();
  const overlapProjectInstanceIds = new Map<string, string>();
  const overlapHabitInstanceIds: string[] = [];
  const overlapInstancesById = new Map<string, ScheduleInstance>();
  for (const id of invalidatedInstanceIds) {
    const entry = timelineById.get(id);
    if (!entry) continue;
    if (entry.instance?.id) {
      overlapInstancesById.set(entry.instance.id, entry.instance);
    }
    if (entry.isProject) {
      const projectId = entry.instance.source_id ?? "";
      if (projectId) {
        overlapProjectIds.add(projectId);
        if (!overlapProjectInstanceIds.has(projectId)) {
          overlapProjectInstanceIds.set(projectId, id);
        }
      }
      registerReuseInstance(entry.instance.source_id ?? "", id);
    } else {
      overlapHabitInstanceIds.push(id);
    }
  }
  const pendingOverlapRemovalIds = new Set<string>();
  if (overlapHabitInstanceIds.length > 0) {
    await invalidateInstancesAsMissed(
      supabase,
      overlapHabitInstanceIds,
      result,
      {
        instancesById: overlapInstancesById,
        onInvalidateHabit: (instance) => {
          if (instance.id) {
            pendingOverlapRemovalIds.add(instance.id);
          }
        },
      }
    );
  }
  const overlapInvalidatedHabitsByOffset = new Map<
    number,
    ScheduleInstance[]
  >();
  for (const id of overlapHabitInstanceIds) {
    const instance = overlapInstancesById.get(id);
    if (!instance?.start_utc) continue;
    const offset = dayOffsetFor(instance.start_utc);
    if (typeof offset !== "number") continue;
    const list = overlapInvalidatedHabitsByOffset.get(offset);
    if (list) {
      list.push(instance);
    } else {
      overlapInvalidatedHabitsByOffset.set(offset, [instance]);
    }
  }
  if (
    (process.env.NODE_ENV !== "production" ||
      process.env.SCHEDULER_DEBUG === "true") &&
    timelineInstances.length > 0
  ) {
    const remainingTimeline = timelineInstances.filter(
      (entry) => !invalidatedInstanceIds.has(entry.instance.id)
    );
    const remainingOverlaps = detectIllegalOverlapsUTC(remainingTimeline);
    if (remainingOverlaps.length > 0) {
      throw new Error(
        `Illegal overlaps remain after cleanup: ${remainingOverlaps.length}`
      );
    }
  }
  for (const [projectId, reuseId] of reuseInstanceByProject) {
    if (
      invalidatedInstanceIds.has(reuseId) &&
      !overlapProjectIds.has(projectId)
    ) {
      reuseInstanceByProject.delete(projectId);
    }
  }
  const keptInstances = [...dedupe.keepers].filter(
    (inst) => !invalidatedInstanceIds.has(inst.id)
  );

  // Split kept instances: only locked PROJECT instances should be blockers before HABIT_PASS_START
  const keptLockedProjects = keptInstances.filter(
    (inst) => inst.source_type === "PROJECT" && inst.locked === true
  );
  const keptNonLockedProjects = keptInstances.filter(
    (inst) => inst.source_type === "PROJECT" && inst.locked !== true
  );
  const keptNonProjectInstances = keptInstances.filter(
    (inst) => inst.source_type !== "PROJECT"
  );

  // Cancel non-locked PROJECT instances to prevent them from remaining scheduled
  if (keptNonLockedProjects.length > 0) {
    const nonLockedProjectIds = keptNonLockedProjects
      .map((inst) => inst.id)
      .filter(Boolean) as string[];
    await cancelInstancesAsRescheduleRebuild(supabase, nonLockedProjectIds);
  }

  const keptInstancesByProject = new Map<string, ScheduleInstance>();
  const habitScheduledDatesById = new Map<string, Date[]>();
  for (const instance of dedupe.allInstances) {
    if (!instance || instance.source_type !== "HABIT") continue;
    if (invalidatedInstanceIds.has(instance.id)) continue;
    if (!instance.source_id) continue;
    if (!instance.start_utc) continue;
    if (instance.status !== "scheduled") continue;
    const start = new Date(instance.start_utc);
    if (Number.isNaN(start.getTime())) continue;
    if (start.getTime() < nowMs) continue;
    const normalized = startOfDayInTimeZone(start, timeZone);
    const list = habitScheduledDatesById.get(instance.source_id);
    if (list) {
      list.push(normalized);
    } else {
      habitScheduledDatesById.set(instance.source_id, [normalized]);
    }
  }
  for (const [habitId, dates] of habitScheduledDatesById) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const baseStartMs = baseStart.getTime();
    for (const start of dates) {
      const startMs = start.getTime();
      if (startMs >= baseStartMs) break;
      recordHabitScheduledStart(habitId, start);
    }
  }

  const dayInstancesByOffset = new Map<number, ScheduleInstance[]>();

  const getDayInstances = (offset: number) => {
    let existing = dayInstancesByOffset.get(offset);
    if (!existing) {
      existing = [];
      dayInstancesByOffset.set(offset, existing);
    }
    return existing;
  };

  const removeInstanceFromBuckets = (id: string | null | undefined) => {
    if (!id) return;
    for (const bucket of dayInstancesByOffset.values()) {
      const index = bucket.findIndex((inst) => inst.id === id);
      if (index >= 0) {
        bucket.splice(index, 1);
      }
    }
  };
  if (pendingOverlapRemovalIds.size > 0) {
    for (const id of pendingOverlapRemovalIds) {
      removeInstanceFromBuckets(id);
    }
    pendingOverlapRemovalIds.clear();
  }

  const overlaps = (a: ScheduleInstance, b: ScheduleInstance) => {
    const aStart = new Date(a.start_utc ?? "").getTime();
    const aEnd = new Date(a.end_utc ?? "").getTime();
    const bStart = new Date(b.start_utc ?? "").getTime();
    const bEnd = new Date(b.end_utc ?? "").getTime();
    if (
      !Number.isFinite(aStart) ||
      !Number.isFinite(aEnd) ||
      !Number.isFinite(bStart) ||
      !Number.isFinite(bEnd)
    ) {
      return false;
    }
    return overlapsHalfOpen(aStart, aEnd, bStart, bEnd);
  };

  const allowsOverlap = (
    a: ScheduleInstance,
    b: ScheduleInstance,
    habitOverlapMap: Map<string, boolean>
  ) => {
    if (a.source_type !== "HABIT" || b.source_type !== "HABIT") {
      return false;
    }
    const aId = a.source_id ?? "";
    const bId = b.source_id ?? "";
    return (
      habitOverlapMap.get(aId) === true && habitOverlapMap.get(bId) === true
    );
  };

  const projectWeightForInstance = (instance: ScheduleInstance): number => {
    if (typeof instance?.weight_snapshot === "number") {
      return instance.weight_snapshot;
    }
    const projectId = instance?.source_id ?? "";
    if (!projectId) return 0;
    const def = projectItemMap[projectId];
    return typeof def?.weight === "number" ? def.weight : 0;
  };

  const collectProjectOverlapConflicts = (
    instances: ScheduleInstance[],
    habitOverlapMap: Map<string, boolean>
  ) => {
    const conflicts: ScheduleInstance[] = [];
    const seen = new Set<string>();
    const sorted = instances
      .filter((inst) => inst && inst.status === "scheduled")
      .sort(
        (a, b) =>
          new Date(a.start_utc ?? "").getTime() -
          new Date(b.start_utc ?? "").getTime()
      );

    let last: ScheduleInstance | null = null;
    for (const current of sorted) {
      if (!last) {
        last = current;
        continue;
      }
      if (!overlaps(last, current)) {
        last = current;
        continue;
      }
      if (allowsOverlap(last, current, habitOverlapMap)) {
        last =
          new Date(last.end_utc ?? "").getTime() >=
          new Date(current.end_utc ?? "").getTime()
            ? last
            : current;
        continue;
      }
      let removal: ScheduleInstance | null = null;
      const lastIsProject = last.source_type === "PROJECT";
      const currentIsProject = current.source_type === "PROJECT";
      const lastLocked = last.locked === true;
      const currentLocked = current.locked === true;
      if (lastLocked && currentLocked) {
        last =
          new Date(last.end_utc ?? "").getTime() >=
          new Date(current.end_utc ?? "").getTime()
            ? last
            : current;
        continue;
      }
      if (lastLocked && currentIsProject) {
        removal = current;
      } else if (currentLocked && lastIsProject) {
        removal = last;
      } else {
        if (lastIsProject && !currentIsProject) {
          removal = last;
        } else if (!lastIsProject && currentIsProject) {
          removal = current;
        } else if (lastIsProject && currentIsProject) {
          const lastWeight = projectWeightForInstance(last);
          const currentWeight = projectWeightForInstance(current);
          if (lastWeight < currentWeight) {
            removal = last;
          } else if (currentWeight < lastWeight) {
            removal = current;
          } else {
            const lastStart = new Date(last.start_utc ?? "").getTime();
            const currentStart = new Date(current.start_utc ?? "").getTime();
            removal = currentStart < lastStart ? last : current;
          }
        }
      }
      if (
        removal &&
        removal.source_type === "PROJECT" &&
        !seen.has(removal.id)
      ) {
        conflicts.push(removal);
        seen.add(removal.id);
        if (removal.id === last.id) {
          last = current;
        }
      } else {
        last =
          new Date(last.end_utc ?? "").getTime() >=
          new Date(current.end_utc ?? "").getTime()
            ? last
            : current;
      }
    }
    return conflicts;
  };

  const buildProjectQueueItemFromInstance = (
    inst: ScheduleInstance
  ): QueueItem | null => {
    const projectId = inst.source_id ?? "";
    if (!projectId) return null;
    const def = projectItemMap[projectId];
    if (!def) return null;
    let duration = Number(def.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const energyResolved = (inst.energy_resolved ?? def.energy ?? "NO")
      .toString()
      .toUpperCase();
    return {
      id: projectId,
      sourceType: "PROJECT",
      duration_min: duration,
      energy: energyResolved,
      weight: def.weight ?? 0,
      goalWeight: def.goalWeight ?? 0,
      globalRank:
        typeof def.globalRank === "number" && Number.isFinite(def.globalRank)
          ? def.globalRank
          : null,
      instanceId: inst.id,
      preferred: projectMatchesSelectedMonument(projectId),
      eventName: def.name || def.id,
    };
  };

  const shouldRetainCompletedInstance = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!instance || instance.status !== "completed") return false;
    const startMs = new Date(instance.start_utc ?? "").getTime();
    const endMs = new Date(instance.end_utc ?? "").getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    if (startMs > nowMs && endMs > nowMs) {
      return false;
    }
    if (endMs < completedRetentionStartMs) {
      return false;
    }
    return true;
  };

  const isBlockingInstance = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!instance) return false;
    if (instance.status === "scheduled") return true;
    if (instance.status === "completed") {
      return shouldRetainCompletedInstance(instance);
    }
    return false;
  };

  const registerInstanceForOffsets = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!instance) return;
    if (!instance.id) return;

    removeInstanceFromBuckets(instance.id);

    if (!isBlockingInstance(instance)) {
      return;
    }

    const start = new Date(instance.start_utc);
    const end = new Date(instance.end_utc);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }

    const startDay = startOfDayInTimeZone(start, timeZone);
    const endReferenceMs = Math.max(start.getTime(), end.getTime() - 1);
    if (endReferenceMs < baseStart.getTime()) {
      return;
    }
    const endReference = new Date(endReferenceMs);
    const endDay = startOfDayInTimeZone(endReference, timeZone);

    let startOffset = differenceInCalendarDaysInTimeZone(
      baseStart,
      startDay,
      timeZone
    );
    let endOffset = differenceInCalendarDaysInTimeZone(
      baseStart,
      endDay,
      timeZone
    );

    if (!Number.isFinite(startOffset)) startOffset = 0;
    if (!Number.isFinite(endOffset)) endOffset = startOffset;

    if (endOffset < startOffset) {
      endOffset = startOffset;
    }

    const sourceId = instance.source_id ?? "";
    const habitType = sourceId ? (habitTypeById.get(sourceId) ?? null) : null;
    const isSyncHabit =
      instance.source_type === "HABIT" && habitType === "SYNC";
    if (isSyncHabit) {
      endOffset = startOffset;
    }

    if (startOffset < 0) {
      startOffset = 0;
    }

    if (endOffset >= lookaheadDays) {
      endOffset = lookaheadDays - 1;
    }

    for (let offset = startOffset; offset <= endOffset; offset += 1) {
      if (offset < 0 || offset >= lookaheadDays) continue;
      const bucket = getDayInstances(offset);
      upsertInstance(bucket, instance);
    }
  };

  const cancelScheduleInstance = async (
    instanceId: string | null | undefined,
    details?: { reason?: string; fault?: string }
  ) => {
    if (!instanceId) return;
    if (details) {
      logSchedulerInfo("[SCHEDULER] cancel schedule instance", {
        instanceId,
        reason: details.reason ?? null,
        fault: details.fault ?? null,
      });
    }
    const { error } = await supabase
      .from("schedule_instances")
      .update({ status: "canceled" })
      .eq("id", instanceId);
    if (error) {
      result.failures.push({
        itemId: instanceId,
        reason: "error",
        detail: error,
      });
    }
  };

  const completedProjectIds = new Set<string>();

  for (const inst of dedupe.allInstances) {
    if (invalidatedInstanceIds.has(inst.id)) continue;
    if (
      inst?.source_type === "PROJECT" &&
      inst.status === "completed" &&
      typeof inst.source_id === "string" &&
      inst.source_id &&
      shouldRetainCompletedInstance(inst)
    ) {
      completedProjectIds.add(inst.source_id);
    }
    registerInstanceForOffsets(inst);
  }

  if (completedProjectIds.size > 0) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index];
      if (completedProjectIds.has(item.id)) {
        recordProjectFailure("skippedCompleted", item.id);
        queue.splice(index, 1);
      }
    }
  }
  schedulerDebugSummary.projects.completed = completedProjectIds.size;

  // Register only locked PROJECT instances and non-PROJECT instances as blockers before HABIT_PASS_START
  for (const inst of keptLockedProjects) {
    registerInstanceForOffsets(inst);
  }
  for (const inst of keptNonProjectInstances) {
    registerInstanceForOffsets(inst);
  }
  const baseBlockers: ScheduleInstance[] = [
    ...keptLockedProjects,
    ...keptNonProjectInstances,
  ];
  const habitBlockingInstances: ScheduleInstance[] = [];
  const habitBlockingInstanceIds = new Set<string>();
  const addHabitBlocker = (inst: ScheduleInstance | null | undefined) => {
    if (!inst) return;
    if (!isBlockingInstance(inst)) return;
    const id = inst.id ?? null;
    if (id && habitBlockingInstanceIds.has(id)) return;
    habitBlockingInstances.push(inst);
    if (id) {
      habitBlockingInstanceIds.add(id);
    }
  };
  for (const inst of keptInstances) {
    if (inst.source_type !== "HABIT") continue;
    addHabitBlocker(inst);
  }

  for (const inst of keptLockedProjects) {
    const projectId = inst.source_id ?? "";
    if (!projectId) continue;
    keptInstancesByProject.set(projectId, inst);
  }

  for (const item of queue) {
    if (item.instanceId) continue;
    const reuseId = reuseInstanceByProject.get(item.id);
    if (!reuseId) continue;
    item.instanceId = reuseId;
    reuseInstanceByProject.delete(item.id);
  }
  const horizonStartMs = baseStart.getTime();
  const horizonEndMs = writeThroughEnd.getTime();
  const alreadyScheduledCount = dedupe.allInstances.reduce((count, inst) => {
    if (inst.source_type !== "PROJECT" || inst.status !== "scheduled") {
      return count;
    }
    if (!inst.start_utc) return count;
    const startMs = new Date(inst.start_utc).getTime();
    if (!Number.isFinite(startMs)) return count;
    if (startMs < horizonStartMs || startMs >= horizonEndMs) return count;
    return count + 1;
  }, 0);
  schedulerDebugSummary.projects.alreadyScheduled = alreadyScheduledCount;

  queue.sort((a, b) => {
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    return a.id.localeCompare(b.id);
  });
  schedulerDebugSummary.projects.eligible = queue.length;

  const pickSmallProjectCandidate = (items: QueueItem[]): QueueItem | undefined => {
    let fallback: QueueItem | undefined;
    let smallestDuration = Number.POSITIVE_INFINITY;
    for (const candidate of items) {
      if (candidate.duration_min <= 30) {
        return candidate;
      }
      if (candidate.duration_min < smallestDuration) {
        smallestDuration = candidate.duration_min;
        fallback = candidate;
      }
    }
    return fallback;
  };
  let smallProjectCandidate: QueueItem | undefined;
  let smallProjectFirstAttemptDayOffset: number | null = null;
  let probeSmallFailureTrace: PlacementDebugTrace | null = null;
  let smallProjectFirstAttemptStats: ProbeSmallProjectAttemptStats | null = null;
  if (debugEnabled) {
    smallProjectCandidate = pickSmallProjectCandidate(queue);
  }
  const probeSmallProjectId = debugEnabled ? smallProjectCandidate?.id : undefined;

  const windowAvailabilityByDay = new Map<
    number,
    Map<string, WindowAvailabilityBounds>
  >();
  const windowCache = new Map<string, WindowLite[]>();
  const dayMaxGapCache = new Map<string, number>();
  const projectDayWindowsCache = new Map<string, WindowLite[]>();
  const pendingWindowLoads = new Map<string, Promise<void>>();
  const activeTimeZone = timeZone ?? "UTC";
  const prepareWindowsForDay = async (day: Date) => {
    const cacheKey = dateCacheKey(day);
    if (windowCache.has(cacheKey)) return;
    // Removed legacy windowSnapshot - now using day-type-aware windows via fetchWindowsForDate

    // Align with GLOBAL_DAY_START_HOUR=4 to avoid previous-day date_key lookups
    const dayParts = getDateTimeParts(day, activeTimeZone);
    const anchoredDay = makeZonedDate(
      {
        year: dayParts.year,
        month: dayParts.month,
        day: dayParts.day,
        hour: 4,
        minute: 0,
        second: 0,
      },
      activeTimeZone
    );

    let pending = pendingWindowLoads.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        // Debug logging for window fetching
        if (process.env.SCHEDULER_DEBUG_WINDOWS === "true") {
          const anchoredKey = formatDateKeyInTimeZone(
            anchoredDay,
            activeTimeZone
          );
          log(
            "debug",
            "[RESCHEDULE_WINDOWS]",
            {
              tz: activeTimeZone,
              dayIso: day.toISOString(),
              anchoredIso: anchoredDay.toISOString(),
              anchoredKey,
              useDayTypes: true,
            },
            { key: "RESCHEDULE_WINDOWS", every: 25 }
          );
        }

        const windows = await fetchWindowsForDate(
          anchoredDay,
          supabase,
          activeTimeZone,
          {
            ...windowOptionsBase,
            useDayTypes: true, // Explicitly enable day-type awareness
          }
        );

        // Debug logging for window results
        if (process.env.SCHEDULER_DEBUG_WINDOWS === "true") {
          const anchoredKey = formatDateKeyInTimeZone(
            anchoredDay,
            activeTimeZone
          );
          const withDttbIdCount = windows.filter(
            (win) => win.dayTypeTimeBlockId
          ).length;
          log(
            "debug",
            "[RESCHEDULE_WINDOWS_RESULT]",
            {
              anchoredKey,
              windowsCount: windows.length,
              withDttbIdCount,
            },
            { key: "RESCHEDULE_WINDOWS_RESULT", every: 25 }
          );
        }

        windowCache.set(cacheKey, windows);
      })();
      pendingWindowLoads.set(cacheKey, pending);
    }

    try {
      await pending;
    } finally {
      pendingWindowLoads.delete(cacheKey);
    }
  };
  const getWindowsForDay = (day: Date) => {
    const cacheKey = dateCacheKey(day);
    const cached = windowCache.get(cacheKey);
    if (cached) return cached;
    // Removed legacy windowSnapshot - now using day-type-aware windows via fetchWindowsForDate
    return [];
  };
  const habitPlacementsByOffset = new Map<number, HabitScheduleDayResult>();
  let nonDailyReplacementInstanceIds = new Set<string>();

  const ensureHabitPlacementsForDay = async (
    offset: number,
    day: Date,
    availability: Map<string, WindowAvailabilityBounds>,
    reservedPlacements?: Map<string, HabitReservation>
  ) => {
    const cached = habitPlacementsByOffset.get(offset);
    if (cached) {
      return cached;
    }

    await prepareWindowsForDay(day);
    const existingInstances = getDayInstances(offset);

    const dayResult = await scheduleHabitsForDay({
      userId,
      habits: dailyHabits,
      day,
      offset,
      timeZone,
      parity: parityOptions,
      availability,
      baseDate,
      windowCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      client: supabase,
      sunlightLocation: location,
      timeZoneOffsetMinutes,
      durationMultiplier,
      restMode: isRestMode,
      existingInstances,
      registerInstance: registerInstanceForOffsets,
      getWindowsForDay,
      getLastScheduledHabitStart: getHabitLastScheduledStart,
      recordHabitScheduledStart,
      createdThisRun,
      logCancel,
      habitMap: habitById,
      taskContextById,
      contextTaskCounts,
      practiceHistory,
      effectiveLastCompletedAt,
      getProjectGoalMonumentId,
      reservedPlacements,
      audit: habitAudit,
      debugEnabled,
      nonDailyHabitIds,
      nonDailyReplacementInstanceIds,
    });

    if (dayResult.placements.length > 0) {
      result.timeline.push(...dayResult.placements);
    }
    if (dayResult.instances.length > 0) {
      result.placed.push(...dayResult.instances);
      for (const inst of dayResult.instances) {
        addHabitBlocker(inst);
      }
    }
    if (dayResult.failures.length > 0) {
      result.failures.push(...dayResult.failures);
    }

    habitPlacementsByOffset.set(offset, dayResult);
    return dayResult;
  };

  const missedHabitIds = new Set<string>();
  for (const inst of dedupe.allInstances) {
    if (!inst || inst.source_type !== "HABIT") continue;
    if (inst.status !== "missed") continue;
    if (!inst.source_id) continue;
    missedHabitIds.add(inst.source_id);
  }
  const createMissedHabitInstance = async (
    habit: HabitScheduleItem,
    reason: string
  ) => {
    if (missedHabitIds.has(habit.id)) return;
    const energyResolved = (
      habit.energy ??
      habit.window?.energy ??
      "NO"
    ).toUpperCase();
    const missedStart = startOfDayInTimeZone(baseStart, timeZone);
    const missedEnd = addDaysInTimeZone(missedStart, 1, timeZone);
    const rawDuration = Number(habit.durationMinutes ?? 0);
    const durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : DEFAULT_HABIT_DURATION_MIN;
    const { error } = await supabase.from("schedule_instances").insert({
      user_id: userId,
      source_type: "HABIT",
      source_id: habit.id,
      status: "missed",
      missed_reason: reason,
      start_utc: missedStart.toISOString(),
      end_utc: missedEnd.toISOString(),
      duration_min: durationMin,
      window_id: null,
      energy_resolved: energyResolved,
      weight_snapshot: 0,
      locked: false,
      event_name: habit.name ?? null,
      practice_context_monument_id: habit.practiceContextId ?? null,
    });
    missedHabitIds.add(habit.id);
    if (error) {
      result.failures.push({
        itemId: habit.id,
        reason: "error",
        detail: error,
      });
    }
  };

  /**
   * Feature flag: SCHEDULE_NONDAILY_CHAIN
   * When 'true', non-daily habits are planned across the horizon as a chain (virtual completion).
   * When 'false', the legacy "first instance only" behavior is used.
   */
  const scheduleNonDailyHabitsAcrossHorizon = async (
    nonDailyHabits: HabitScheduleItem[]
  ): Promise<Set<string>> => {
    if (nonDailyHabits.length === 0) return new Set<string>();
    const nonDailyReplacementInstanceIds = new Set<string>();
    const horizonStartLocalDay = startOfDayInTimeZone(baseStart, timeZone);
    const horizonEndLocalDay = startOfDayInTimeZone(
      addDaysInTimeZone(
        baseStart,
        Math.max(habitWriteLookaheadDays - 1, 0),
        timeZone
      ),
      timeZone
    );
    const horizonEndExclusive = addDaysInTimeZone(
      horizonEndLocalDay,
      1,
      timeZone
    );
    const lowerBound = addDaysInTimeZone(
      horizonStartLocalDay,
      -habitWriteLookaheadDays,
      timeZone
    );
    const normalizeRole = (
      metadata: ScheduleInstance["metadata"] | null | undefined
    ): "PRIMARY" | "FORECAST" | null => {
      const roleRaw =
        metadata &&
        typeof metadata === "object" &&
        metadata !== null &&
        "nonDaily" in metadata
          ? ((metadata as any).nonDaily?.role as string | null | undefined)
          : null;
      return roleRaw === "PRIMARY" || roleRaw === "FORECAST" ? roleRaw : null;
    };
    const startValueForInstance = (instance: ScheduleInstance) => {
      const time = new Date(instance.start_utc ?? "").getTime();
      return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
    };
    const mergeNonDailyMetadata = (
      existing: ScheduleInstance["metadata"] | null | undefined,
      payload: {
        role: "PRIMARY" | "FORECAST";
        dueAtUtc: string;
        anchorCompletedAtUtc: string;
        chainKey: string;
      }
    ) => {
      const base =
        existing && typeof existing === "object"
          ? { ...(existing as any) }
          : {};
      return {
        ...base,
        nonDaily: {
          ...(typeof (base as any).nonDaily === "object"
            ? { ...(base as any).nonDaily }
            : {}),
          role: payload.role,
          dueAtUtc: payload.dueAtUtc,
          anchorCompletedAtUtc: payload.anchorCompletedAtUtc,
          chainKey: payload.chainKey,
        },
      };
    };
    const applyMetadataIfNeeded = async (
      instance: ScheduleInstance | null | undefined,
      payload: {
        role: "PRIMARY" | "FORECAST";
        dueAtUtc: string;
        anchorCompletedAtUtc: string;
        chainKey: string;
      }
    ): Promise<ScheduleInstance | null> => {
      if (!instance?.id) return instance ?? null;
      const merged = mergeNonDailyMetadata(instance.metadata, payload);
      instance.metadata = merged as any;
      const { data, error } = await supabase
        .from("schedule_instances")
        .update({ metadata: merged })
        .eq("id", instance.id)
        .select("*")
        .single();
      if (error) {
        result.failures.push({
          itemId: instance.id,
          reason: "error",
          detail: error,
        });
        return instance;
      }
      if (data && "metadata" in data) {
        return data as ScheduleInstance;
      }
      return instance;
    };
    const collectHabitInstances = (habitId: string): ScheduleInstance[] => {
      const seen = new Set<string>();
      const bucket: ScheduleInstance[] = [];
      const consider = (inst: ScheduleInstance | null | undefined) => {
        if (
          !inst ||
          inst.source_type !== "HABIT" ||
          inst.status !== "scheduled" ||
          inst.source_id !== habitId
        ) {
          return;
        }
        const start = safeDate(inst.start_utc);
        if (!start) return;
        const startMs = start.getTime();
        if (
          startMs < lowerBound.getTime() ||
          startMs >= horizonEndExclusive.getTime()
        ) {
          return;
        }
        const id = inst.id ?? "";
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        bucket.push(inst);
      };
      for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
        const dayInstances = getDayInstances(offset);
        for (const inst of dayInstances) {
          consider(inst);
        }
      }
      for (const inst of dedupe.allInstances) {
        consider(inst);
      }
      bucket.sort((a, b) => {
        const diff = startValueForInstance(a) - startValueForInstance(b);
        if (diff !== 0) return diff;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
      return bucket;
    };

    for (const habit of nonDailyHabits) {
      const normalizedType =
        habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
      if (normalizedType === "SYNC") continue;

      const plan = computeNonDailyChainPlan(
        habit,
        baseDate.toISOString(),
        timeZone
      );
      const chainKey = `HABIT:${habit.id}:${plan.anchor.completedAtUtc}`;
      const existingInstances = collectHabitInstances(habit.id);
      const primaryExisting =
        existingInstances.find(
          (inst) => normalizeRole(inst.metadata) === "PRIMARY"
        ) ??
        existingInstances[0] ??
        null;
      const remainingForForecast = existingInstances.filter(
        (inst) => inst !== primaryExisting
      );
      const forecastExisting =
        remainingForForecast.find(
          (inst) => normalizeRole(inst.metadata) === "FORECAST"
        ) ??
        remainingForForecast[0] ??
        null;
      const extras = remainingForForecast.filter(
        (inst) => inst !== forecastExisting
      );
      const rawDuration = Number(habit.durationMinutes ?? 0);
      let durationMin =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : DEFAULT_HABIT_DURATION_MIN;
      if (durationMultiplier !== 1) {
        durationMin = Math.max(1, Math.round(durationMin * durationMultiplier));
      }
      if (durationMin <= 0) {
        await createMissedHabitInstance(habit, "INVALID_DURATION");
        result.failures.push({
          itemId: habit.id,
          reason: "INVALID_DURATION",
        });
        continue;
      }
      const resolvedEnergy = (
        habit.energy ??
        habit.window?.energy ??
        "NO"
      ).toUpperCase();
      const locationContextIdRaw = habit.locationContextId ?? null;
      const locationContextId =
        typeof locationContextIdRaw === "string" &&
        locationContextIdRaw.trim().length > 0
          ? locationContextIdRaw.trim()
          : null;
      const locationContextValueRaw = habit.locationContextValue ?? null;
      const locationContextValue =
        typeof locationContextValueRaw === "string"
          ? normalizeLocationContextValue(locationContextValueRaw)
          : null;
      const daylightRaw = habit.daylightPreference
        ? String(habit.daylightPreference).toUpperCase().trim()
        : "ALL_DAY";
      const daylightPreference =
        daylightRaw === "DAY" || daylightRaw === "NIGHT"
          ? daylightRaw
          : "ALL_DAY";
      const anchorRaw = habit.windowEdgePreference
        ? String(habit.windowEdgePreference).toUpperCase().trim()
        : "FRONT";
      const anchorPreference = anchorRaw === "BACK" ? "BACK" : "FRONT";
      const practiceContextId =
        normalizedType === "PRACTICE" ? (habit.skillMonumentId ?? null) : null;
      const blockLocalDays = new Set<number>();

      const placeRole = async (params: {
        role: "PRIMARY" | "FORECAST";
        dueAtUtc: string;
        minStartUtc: string;
        reuseInstance?: ScheduleInstance | null;
      }): Promise<{
        instance: ScheduleInstance | null;
        startLocalDay?: Date | null;
      }> => {
        const minStartDate = new Date(params.minStartUtc);
        if (Number.isNaN(minStartDate.getTime())) {
          return { instance: null, startLocalDay: null };
        }
        let cursorDay = startOfDayInTimeZone(minStartDate, timeZone);
        let firstDay = true;
        while (cursorDay.getTime() <= horizonEndLocalDay.getTime()) {
          const offset = differenceInCalendarDaysInTimeZone(
            horizonStartLocalDay,
            cursorDay,
            timeZone
          );
          if (
            !Number.isFinite(offset) ||
            offset < 0 ||
            offset >= habitWriteLookaheadDays
          ) {
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          const localDayMs = cursorDay.getTime();
          if (blockLocalDays.has(localDayMs)) {
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          await prepareWindowsForDay(cursorDay);
          const existingInstancesForDay = getDayInstances(offset);
          const sunlightOptions =
            typeof timeZoneOffsetMinutes === "number"
              ? { offsetMinutes: timeZoneOffsetMinutes }
              : undefined;
          const sunlightToday = resolveSunlightBounds(
            cursorDay,
            timeZone,
            location,
            sunlightOptions
          );
          const sunlightPrevious = resolveSunlightBounds(
            addDaysInTimeZone(cursorDay, -1, timeZone),
            timeZone,
            location,
            sunlightOptions
          );
          const sunlightNext = resolveSunlightBounds(
            addDaysInTimeZone(cursorDay, 1, timeZone),
            timeZone,
            location,
            sunlightOptions
          );
          const daylightConstraint =
            daylightPreference === "ALL_DAY"
              ? null
              : {
                  preference: daylightPreference as "DAY" | "NIGHT",
                  sunrise: sunlightToday.sunrise ?? null,
                  sunset: sunlightToday.sunset ?? null,
                  dawn: sunlightToday.dawn ?? null,
                  dusk: sunlightToday.dusk ?? null,
                  previousSunset: sunlightPrevious.sunset ?? null,
                  previousDusk: sunlightPrevious.dusk ?? null,
                  nextDawn: sunlightNext.dawn ?? sunlightNext.sunrise ?? null,
                  nextSunrise: sunlightNext.sunrise ?? null,
                };
          const nightSunlightBundle =
            daylightConstraint?.preference === "NIGHT"
              ? {
                  today: sunlightToday,
                  previous: sunlightPrevious,
                  next: sunlightNext,
                }
              : null;
          const compatibleDayResult = await fetchCompatibleWindowsForItem(
            supabase,
            cursorDay,
            {
              energy: resolvedEnergy,
              duration_min: durationMin,
              habitType: habit.habitType,
              skillId: habit.skillId ?? null,
              skillMonumentId: habit.skillMonumentId ?? null,
            },
            timeZone,
            {
              availability: new Map(),
              now:
                startOfDayInTimeZone(baseStart, timeZone).getTime() ===
                startOfDayInTimeZone(cursorDay, timeZone).getTime()
                  ? baseDate
                  : undefined,
              cache: windowCache,
              restMode: isRestMode,
            userId,
            parity: parityOptions,
            locationContextId,
            locationContextValue,
            daylight: daylightConstraint,
            enforceNightSpan: daylightConstraint?.preference === "NIGHT",
              nightSunlight: nightSunlightBundle,
              anchor: anchorPreference,
              requireLocationContextMatch: true,
              hasExplicitLocationContext:
                Boolean(locationContextId) || Boolean(locationContextValue),
              allowedWindowKinds: ["DEFAULT"],
              locationDebugContext,
            }
          );
          const compatibleWindows = compatibleDayResult.windows;
          if (compatibleWindows.length === 0) {
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          const placement = await placeItemInWindows({
            userId,
            item: {
              id: habit.id,
              sourceType: "HABIT",
              duration_min: durationMin,
              energy: resolvedEnergy,
              weight: 0,
              eventName: habit.name || "Habit",
              practiceContextId,
            },
            windows: compatibleWindows,
            date: cursorDay,
            timeZone,
            client: supabase,
            reuseInstanceId: params.reuseInstance?.id ?? null,
            notBefore: firstDay ? minStartDate : cursorDay,
            existingInstances: existingInstancesForDay,
            allowHabitOverlap: habitAllowsOverlap.get(habit.id) ?? false,
          habitTypeById,
          windowEdgePreference: habit.windowEdgePreference,
          maxGapCache: dayMaxGapCache,
          blockerCache,
          metadata: mergeNonDailyMetadata(params.reuseInstance?.metadata, {
            role: params.role,
            dueAtUtc: params.dueAtUtc,
            anchorCompletedAtUtc: plan.anchor.completedAtUtc,
            chainKey,
            }),
          debugEnabled,
          });
          if (!("status" in placement)) {
            if (placement.error && placement.error !== "NO_FIT") {
              result.failures.push({
                itemId: habit.id,
                reason: "error",
                detail: placement.error,
              });
            }
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          if (placement.error || !placement.data) {
            if (placement.error && placement.error !== "NO_FIT") {
              result.failures.push({
                itemId: habit.id,
                reason: "error",
                detail: placement.error,
              });
            }
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          const persisted = placement.data;
          if (persisted?.id) {
            createdThisRun.add(persisted.id);
            nonDailyReplacementInstanceIds.add(persisted.id);
          }
          registerInstanceForOffsets(persisted);
          recordHabitScheduledStart(habit.id, persisted.start_utc ?? "");
          addHabitBlocker(persisted);
          result.placed.push(persisted);
          const windowLabel =
            getWindowsForDay(cursorDay).find(
              (win) => win.id === persisted.window_id
            )?.label ?? null;
          result.timeline.push({
            type: "HABIT",
            habit: {
              id: habit.id,
              name: habit.name,
              windowId: persisted.window_id ?? null,
              windowLabel,
              startUTC: persisted.start_utc ?? "",
              endUTC: persisted.end_utc ?? "",
              durationMin: durationMin,
              energyResolved: persisted.energy_resolved ?? null,
            },
            decision: params.reuseInstance ? "rescheduled" : "new",
            scheduledDayOffset: offset,
          });
          return { instance: persisted, startLocalDay: cursorDay };
        }
        return { instance: null, startLocalDay: null };
      };

      const primaryPlacement = await placeRole({
        role: "PRIMARY",
        dueAtUtc: plan.primary.dueAtUtc,
        minStartUtc: plan.primary.minStartUtc,
        reuseInstance: primaryExisting ?? forecastExisting ?? extras[0] ?? null,
      });
      let primaryInstance = primaryPlacement.instance ?? null;
      if (!primaryInstance && primaryExisting) {
        const start = safeDate(primaryExisting.start_utc);
        if (start && start.getTime() >= baseDate.getTime()) {
          primaryInstance = primaryExisting;
        }
      }
      if (!primaryPlacement.instance && primaryInstance) {
        primaryInstance = await applyMetadataIfNeeded(primaryInstance, {
          role: "PRIMARY",
          dueAtUtc: plan.primary.dueAtUtc,
          anchorCompletedAtUtc: plan.anchor.completedAtUtc,
          chainKey,
        });
      }
      if (primaryInstance?.start_utc) {
        const primaryDayMs = startOfDayInTimeZone(
          new Date(primaryInstance.start_utc),
          timeZone
        ).getTime();
        if (Number.isFinite(primaryDayMs)) {
          blockLocalDays.add(primaryDayMs);
        }
      }

      let forecastInstance: ScheduleInstance | null = null;
      if (primaryInstance?.start_utc) {
        const forecastDueAt = computeForecastDueAt(
          primaryInstance.start_utc,
          habit,
          timeZone
        );
        const forecastPlacement = await placeRole({
          role: "FORECAST",
          dueAtUtc: forecastDueAt,
          minStartUtc: forecastDueAt,
          reuseInstance: forecastExisting ?? extras[0] ?? null,
        });
        forecastInstance = forecastPlacement.instance ?? null;
        if (!forecastInstance && forecastExisting) {
          const start = safeDate(forecastExisting.start_utc);
          if (start && start.getTime() >= baseDate.getTime()) {
            forecastInstance = forecastExisting;
          }
        }
        if (!forecastPlacement.instance && forecastInstance) {
          forecastInstance = await applyMetadataIfNeeded(forecastInstance, {
            role: "FORECAST",
            dueAtUtc: forecastDueAt,
            anchorCompletedAtUtc: plan.anchor.completedAtUtc,
            chainKey,
          });
        }
        if (forecastInstance?.start_utc) {
          const forecastDayMs = startOfDayInTimeZone(
            new Date(forecastInstance.start_utc),
            timeZone
          ).getTime();
          if (Number.isFinite(forecastDayMs)) {
            blockLocalDays.add(forecastDayMs);
          }
        }
      }

      const keepIds = new Set<string>();
      if (primaryInstance?.id) {
        keepIds.add(primaryInstance.id);
        nonDailyReplacementInstanceIds.add(primaryInstance.id);
      }
      if (forecastInstance?.id) {
        keepIds.add(forecastInstance.id);
        nonDailyReplacementInstanceIds.add(forecastInstance.id);
      }

      for (const inst of existingInstances) {
        if (!inst?.id) continue;
        if (keepIds.has(inst.id)) continue;
        await cancelScheduleInstance(inst.id, {
          reason: "NON_DAILY_CHAIN_PRUNE",
        });
        removeInstanceFromBuckets(inst.id);
      }

      if (!primaryInstance) {
        await createMissedHabitInstance(habit, "NO_FEASIBLE_SLOT_IN_HORIZON");
        result.failures.push({
          itemId: habit.id,
          reason: "NO_FEASIBLE_SLOT_IN_HORIZON",
        });
      } else {
        recordHabitScheduledStart(habit.id, primaryInstance.start_utc ?? "");
        if (forecastInstance) {
          recordHabitScheduledStart(habit.id, forecastInstance.start_utc ?? "");
        }
      }
    }

    return nonDailyReplacementInstanceIds;
  };
  nonDailyReplacementInstanceIds =
    await scheduleNonDailyHabitsAcrossHorizon(nonDailyHabits);

  logSchedulerDebug("[SCHEDULER_ORDER] HABIT_PASS_END", {
    habitCount: habitBlockingInstances.length,
    samples: habitBlockingInstances.slice(0, 5).map((inst) => ({
      id: inst.id,
      source_id: inst.source_id,
      start_utc: inst.start_utc,
      end_utc: inst.end_utc,
    })),
  });

  const dedupedProjectQueue = queue;
  placementDebugCollector?.setQueuedCount(dedupedProjectQueue.length);

  // ===== PROJECT REBUILD PASS (ONE SHOT) =====
  logSchedulerDebug("[SCHEDULER] ENTER project placement pass", {
    runId: Math.random().toString(36).substring(7),
  });

  logSchedulerDebug("[SCHEDULER_BLOCKERS] PROJECT_PASS_START", {
    lockedProjectCount: baseBlockers.filter((b) => b.source_type === "PROJECT")
      .length,
    habitBlockingCount: habitBlockingInstances.length,
    syncHabitCount: habitBlockingInstances.filter(
      (h) => habitTypeById.get(h.source_id ?? "") === "SYNC"
    ).length,
  });

  // Build blocking instances for project placement: base blockers + habit blockers
  let projectPassLegacyWindowCount = 0;
  const projectPassBaseBlockers = baseBlockers.filter((inst) => {
    const legacyWindowBlocker = isLegacyWindowBoundInstance(inst);
    if (legacyWindowBlocker) {
      projectPassLegacyWindowCount += 1;
    }
    const isLockedProject =
      inst.source_type === "PROJECT" && inst.locked === true;
    if (legacyWindowBlocker && !isLockedProject) {
      return false;
    }
    return true;
  });
  const projectPassLockedProjectCount = projectPassBaseBlockers.filter(
    (inst) => inst.source_type === "PROJECT" && inst.locked === true
  ).length;
  const projectBlockingInstances: ScheduleInstance[] = [
    ...projectPassBaseBlockers,
    ...habitBlockingInstances,
  ];
  const attempted = new Set<string>();
  const scheduledProjectIds = new Set<string>();
  const projectAttemptCounts = new Map<string, number>();
  const projectAttemptLimit = 1;

  for (const item of dedupedProjectQueue) {
    placementDebugCollector?.recordProjectQueued(item.id);
    if (!schedulerDebugSummary.probe.firstEligibleProjectId) {
      schedulerDebugSummary.probe.firstEligibleProjectId = item.id;
    }
    const isProbeProject =
      schedulerDebugSummary.probe.firstEligibleProjectId === item.id;
    const isSmallProjectProbe =
      debugEnabled && smallProjectCandidate?.id === item.id;
    let projectFailureTrace: PlacementDebugTrace | null = null;
    const nextAttempt = (projectAttemptCounts.get(item.id) ?? 0) + 1;
    projectAttemptCounts.set(item.id, nextAttempt);
    if (nextAttempt > projectAttemptLimit) {
      schedulerDebugSummary.fail.other += 1;
      result.failures.push({
        itemId: item.id,
        reason: "error",
        detail: "ATTEMPT_LIMIT_EXCEEDED",
      });
      placementDebugCollector?.recordEarlyExit(
        item.id,
        "EARLY_EXIT_NOT_ATTEMPTED",
        "ATTEMPT_LIMIT_EXCEEDED"
      );
      continue;
    }
    const canonicalProject = projectItemMap[item.id];
    const durationMin = Number(canonicalProject?.duration_min ?? 0);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      if (item.instanceId) {
        const { error } = await markProjectMissed(
          item.instanceId,
          "INVALID_DURATION",
          supabase
        );
        if (error) {
          result.failures.push({
            itemId: item.id,
            reason: "error",
            detail: error,
          });
        }
      } else {
        result.failures.push({ itemId: item.id, reason: "INVALID_DURATION" });
      }
      placementDebugCollector?.recordEarlyExit(
        item.id,
        "EARLY_EXIT_NOT_ATTEMPTED",
        "INVALID_DURATION"
      );
      continue;
    }
    if (durationMin !== item.duration_min) {
      item.duration_min = durationMin;
    }
    // Create window availability for project placement (fresh per project)
    const projectWindowAvailability = new Map<
      string,
      WindowAvailabilityBounds
    >();
    if (attempted.has(item.id)) {
      throw new Error(`PROJECT_REATTEMPTED: ${item.id}`);
    }
    attempted.add(item.id);

    let placementErrored = false;
    let hadCompatibleWindows = false;
    let recordedDay0Windows = false;

    // TEMPORARY INSTRUMENTATION: Log project placement begin
    if (SCHEDULER_PROJECT_DEBUG_LOGGING) {
      logSchedulerDebug("[SCHEDULER_PROJECT_DEBUG]", {
        project_id: item.id,
        project_name: item.eventName,
        global_rank: item.globalRank,
        instanceId: item.instanceId,
        duration_min: item.duration_min,
        resolved_energy: item.energy,
        scheduler_horizon_start: baseStart.toISOString(),
        scheduler_horizon_end: writeThroughEnd.toISOString(),
      });
    }

    // Instrumentation: Log projectBlockingInstances summary before placement
    const blockingCounts = projectBlockingInstances.reduce(
      (acc, inst) => {
        acc.total += 1;
        acc.bySourceType[inst.source_type ?? "UNKNOWN"] =
          (acc.bySourceType[inst.source_type ?? "UNKNOWN"] ?? 0) + 1;
        return acc;
      },
      { total: 0, bySourceType: {} as Record<string, number> }
    );

    const habitInstances = projectBlockingInstances.filter(
      (inst) => inst.source_type === "HABIT"
    );
    const habitEntries = habitInstances.slice(0, 10).map((inst) => ({
      id: inst.id,
      source_id: inst.source_id,
      start_utc: inst.start_utc,
      end_utc: inst.end_utc,
    }));

    const knownHabitIds = [
      "f58bc410-ecd5-43e7-8004-0a3973a7cb32",
      "6df93bf9-701a-4a1b-986a-a81b2658f60c",
    ];
    const presentHabitIds = habitInstances
      .map((inst) => inst.id)
      .filter((id) => knownHabitIds.includes(id ?? ""));
    const missingHabitIds = knownHabitIds.filter(
      (id) => !presentHabitIds.includes(id)
    );

    if (SCHEDULER_PROJECT_DEBUG_LOGGING) {
      logSchedulerDebug("[PROJECT_BLOCKING_INSTANCES]", {
        projectId: item.id,
        projectGlobalRank: item.globalRank,
        totalCount: blockingCounts.total,
        countsBySourceType: blockingCounts.bySourceType,
        habitEntries,
        knownHabitIdsPresent: presentHabitIds,
        knownHabitIdsMissing: missingHabitIds,
      });
    }

    const projectBlockerDiagnostics = projectBlockingInstances.reduce(
      (acc, inst) => {
        const payload = inst as any;
        const dayTypeId =
          payload.day_type_time_block_id ??
          payload.dayTypeTimeBlockId ??
          null;
        const timeBlockId = payload.time_block_id ?? payload.timeBlockId ?? null;
        const windowId = payload.window_id ?? payload.windowId ?? null;
        if (dayTypeId === null || timeBlockId === null) {
          acc.missingDayTypeOrTimeBlock += 1;
        }
        if (windowId) {
          acc.windowIdLegacy += 1;
        }
        const start = safeDate(inst.start_utc);
        const end = safeDate(inst.end_utc);
        if (
          inst.status === "scheduled" &&
          start &&
          end &&
          start.getTime() < end.getTime()
        ) {
          acc.overlapCandidates += 1;
        }
        return acc;
      },
      {
        missingDayTypeOrTimeBlock: 0,
        windowIdLegacy: 0,
        overlapCandidates: 0,
      }
    );
    schedulerDebugSummary.projects.blockerStats = {
      ...projectBlockerDiagnostics,
      blockers_total: projectBlockingInstances.length,
      blockers_legacy_window: projectPassLegacyWindowCount,
      blockers_kept_locked_projects: projectPassLockedProjectCount,
    };

    // 🔧 MULTI-DAY PROJECT PLACEMENT FIX
    // Instead of fetching all windows for the horizon at once,
    // search day by day across the full horizon
    let placedData: any = null;
    let placementDayOffset: number | undefined;
    let placementWindow: any;

    // Search across each day in the horizon
    for (let dayOffset = 0; dayOffset < effectiveHorizonDays; dayOffset++) {
      const currentDay =
        dayOffset === 0
          ? baseStart
          : addDaysInTimeZone(baseStart, dayOffset, timeZone);

      const dayCacheKey = dateCacheKey(currentDay);
      if (debugEnabled) {
        if (projectDayWindowsCache.has(dayCacheKey)) {
          schedulerDebugSummary.probe.dayWindowsCacheHits += 1;
        } else {
          schedulerDebugSummary.probe.dayWindowsCacheMisses += 1;
        }
      }

      // Get windows for this specific day
      await prepareWindowsForDay(currentDay);
      const preloadedDayWindows = getWindowsForDay(currentDay);
      const preloadedDayWindowCount = preloadedDayWindows.length;
      const dayWindowResult = await fetchCompatibleWindowsForItem(
        supabase,
        currentDay,
        {
          ...item,
          skillIds: getProjectSkillIds(item.id),
          monumentId: getProjectGoalMonumentId(item.id),
        },
        timeZone,
        {
          availability: projectWindowAvailability,
          forceDayScopedAvailabilityKey: true,
          now: dayOffset === 0 ? baseDate : undefined, // Only apply "now" constraint on first day
          cache: projectDayWindowsCache,
          restMode: isRestMode,
          userId,
          parity: parityOptions,
          allowedWindowKinds: ["DEFAULT"],
          preloadedWindows: preloadedDayWindows,
          locationDebugContext,
          trackFilterCounters: debugEnabled,
          // Don't use horizonEnd here - we're searching day by day
        }
      );
      const dayWindows = dayWindowResult.windows;
      const dayFilterCounters = dayWindowResult.filterCounters;
      placementDebugCollector?.recordDayScan(item.id, {
        dayOffset,
        blocksConsidered: preloadedDayWindowCount,
        candidatesGenerated: dayWindows.length,
        filterCounters: dayFilterCounters,
      });
      const windowGateTraceByBlockId = new Map<string, BlockGateSample>();
      const recordPlacementFailureTrace = (
        failure: PlacementFailurePayload | null
      ) => {
        if (!placementDebugCollector) return;
        const debugInfo = failure?.debug;
        if (!debugInfo) return;
        const windowDiagnostics = debugInfo.windowDiagnostics ?? [];
        if (!(windowDiagnostics?.length)) return;
        const largestFreeSegmentMs = debugInfo.largestFreeSegmentMs ?? null;
        for (const diag of windowDiagnostics) {
          const trace = windowGateTraceByBlockId.get(diag.blockId);
          const candidateMinutes = Math.round(diag.freeSegmentMs / 60000);
          const sample: BlockGateSample = {
            blockId: diag.blockId,
            dateIso: diag.dateIso,
            windowId: trace?.windowId ?? null,
            dayTypeTimeBlockId: trace?.dayTypeTimeBlockId ?? null,
            timeBlockId: trace?.timeBlockId ?? null,
            energy: trace?.energy ?? null,
            locationContextId: trace?.locationContextId ?? null,
            locationContextValue: trace?.locationContextValue ?? null,
            durationMin: trace?.durationMin ?? item.duration_min,
            stageResults: trace?.stageResults ?? [],
            firstFailGate: trace?.firstFailGate ?? null,
            attempted: true,
            freeSegmentMinutes: candidateMinutes,
            collisionCount: diag.collisionCount,
          };
          placementDebugCollector.recordBlockGateSample(item.id, sample);
          placementDebugCollector.recordClosestCandidate(item.id, {
            blockId: diag.blockId,
            dateIso: diag.dateIso,
            firstFailGate: trace?.firstFailGate ?? null,
            energy: trace?.energy ?? null,
            locationContextId: trace?.locationContextId ?? null,
            locationContextValue: trace?.locationContextValue ?? null,
            freeSegmentMinutes: candidateMinutes,
            collisionCount: diag.collisionCount,
            requiredDurationMin: item.duration_min,
            largestFreeSegmentMin: candidateMinutes,
          });
        }
        if (
          largestFreeSegmentMs !== null &&
          (windowDiagnostics?.length ?? 0) > 0
        ) {
          const best = windowDiagnostics[0];
          const bestMinutes = Math.round(largestFreeSegmentMs / 60000);
          const detail: NoSlotDetail = {
            blockId: best.blockId,
            dateIso: best.dateIso,
            largestFreeSegmentMin: bestMinutes,
            requiredDurationMin: item.duration_min,
            firstCollision: best.firstCollision
              ? {
                  itemId: best.firstCollision.itemId,
                  type: best.firstCollision.type,
                  start: best.firstCollision.start,
                  end: best.firstCollision.end,
                }
              : undefined,
          };
          placementDebugCollector.recordNoSlotDetail(item.id, detail);
          placementDebugCollector.recordPassedGatesButNoSlot(item.id, detail);
        }
      };
      if (placementDebugCollector) {
        const blockDateIso = currentDay.toISOString();
        for (const win of dayWindows) {
          const blockId = win.key ?? win.id;
          windowGateTraceByBlockId.set(blockId, win.gateTrace);
          placementDebugCollector.recordBlockGateSample(item.id, {
            ...win.gateTrace,
            blockId,
            dateIso: blockDateIso,
            attempted: false,
          });
        }
      }

      if (debugEnabled && dayOffset < 2) {
        const metrics =
          schedulerDebugSummary.probe.dayWindowMetrics ??
          (schedulerDebugSummary.probe.dayWindowMetrics = {});
        metrics[dayOffset] = {
          windowsFromGetWindowsForDay: preloadedDayWindowCount,
          windowsPassedIntoFetchCompatible: preloadedDayWindowCount,
          windowsAfterFetchCompatible: dayWindows.length,
        };
      }

      if (dayWindows.length === 0) continue;
      if (isSmallProjectProbe && smallProjectFirstAttemptDayOffset === null) {
        smallProjectFirstAttemptDayOffset = dayOffset;
      }
      hadCompatibleWindows = true;
      if (dayOffset === 0 && !recordedDay0Windows) {
        schedulerDebugSummary.probe.compatibleWindowsDay0 += 1;
        recordedDay0Windows = true;
      }

      const reservationsForItem: Array<{
        key: string;
        previous: WindowAvailabilityBounds | null;
      }> = [];
      const releaseReservationsForItem = () => {
        if (reservationsForItem.length === 0) return;
        for (const reservation of reservationsForItem) {
          if (reservation.previous) {
            projectWindowAvailability.set(reservation.key, {
              front: new Date(reservation.previous.front.getTime()),
              back: new Date(reservation.previous.back.getTime()),
            });
          } else {
            projectWindowAvailability.delete(reservation.key);
          }
        }
        reservationsForItem.length = 0;
      };

      // Try to place in this day's windows
      placementDebugCollector?.recordPlacementAttempt(item.id);
      const placed = await placeItemInWindows({
        userId,
        item,
          windows: dayWindows,
          date: currentDay, // Use the current day we're searching
          timeZone,
          client: supabase,
          reuseInstanceId: item.instanceId,
          ignoreProjectIds: new Set([item.id]),
          notBefore: dayOffset === 0 ? baseDate : undefined, // Only apply notBefore on first day
          existingInstances: projectBlockingInstances,
          habitTypeById,
          maxGapCache: dayMaxGapCache,
          blockerCache,
          windowEdgePreference: null,
          debugEnabled,
          debugOnFailure: debugEnabled
            ? (info) => {
                projectFailureTrace = info;
                if (isSmallProjectProbe) {
                  probeSmallFailureTrace = info;
                  if (smallProjectFirstAttemptDayOffset === null) {
                    smallProjectFirstAttemptDayOffset = dayOffset;
                  }
                  const isFirstAttemptDay =
                    smallProjectFirstAttemptDayOffset === dayOffset &&
                    !schedulerDebugSummary.probeSmallProject?.captured;
                  if (isFirstAttemptDay) {
                    const firstAttemptDay: ProbeSmallProjectAttemptStats = {
                      windowsConsidered: info.windowsConsidered,
                      longestWindowMinutes: info.longestWindowMinutes,
                      availabilityGapMinutes: info.availabilityGapMinutes,
                      gapWithBlockersMinutes: info.gapWithBlockersMinutes ?? 0,
                      overlapBlockers: info.overlapBlockers,
                      notBeforeApplied: info.notBeforeApplied,
                    };
                    smallProjectFirstAttemptStats = firstAttemptDay;
                    schedulerDebugSummary.probeSmallProject = {
                      projectId: item.id,
                      durationMinutes: durationMin,
                      dayOffset,
                      failureStage: info.failureStage,
                      firstAttemptDay,
                    };
                  }
                }
                const shouldRecordProbe =
                  isProbeProject &&
                  dayWindows.length > 0 &&
                  !schedulerDebugSummary.probeProject;
                if (shouldRecordProbe) {
                  schedulerDebugSummary.probeProject = {
                    projectId: item.id,
                    durationMinutes: durationMin,
                    dayOffset,
                    firstAttemptDay: {
                      windowsConsidered: info.windowsConsidered,
                      longestWindowMinutes: info.longestWindowMinutes,
                      availabilityGapMinutes: info.availabilityGapMinutes,
                      gapWithBlockersMinutes: info.gapWithBlockersMinutes ?? 0,
                      overlapBlockers: info.overlapBlockers,
                      notBeforeApplied: info.notBeforeApplied,
                    },
                  };
                }
                if (placementDebugCollector) {
                  const reason = mapPlacementFailureStage(info.failureStage);
                  placementDebugCollector.recordCandidateFailure(
                    item.id,
                    `${item.id}:${dayOffset}`,
                    reason,
                    {
                      blockId: `day-${dayOffset}`,
                      details: `stage=${info.failureStage ?? "unknown"} gap=${info.availabilityGapMinutes ?? 0} blockers=${info.overlapBlockers}`,
                    }
                  );
                }
              }
            : undefined,
      });

      if (
        debugEnabled &&
        item.id === probeSmallProjectId &&
        !schedulerDebugSummary.probeSmallProject?.outcomeKind
      ) {
        const baseSummary = schedulerDebugSummary.probeSmallProject ?? {};
        const isSuccess = placed && typeof placed === "object" && "status" in placed;
        const hasErrorField = placed && typeof placed === "object" && "error" in placed;
        const errVal = hasErrorField ? (placed as any).error : null;

        schedulerDebugSummary.probeSmallProject = {
          ...baseSummary,
          captured: true,
          projectId: item.id,
          durationMinutes: item.duration_min,
          dayOffset,
          outcomeKind: isSuccess
            ? "success"
            : hasErrorField
            ? errVal === "NO_FIT"
              ? "no_fit"
              : "error"
            : "unknown",
          errorType:
            !isSuccess && errVal && typeof errVal === "object"
              ? (errVal.name ?? "ErrorObject")
              : !isSuccess
              ? typeof errVal
              : null,
          errorMessage:
            !isSuccess && errVal && typeof errVal === "object"
              ? (errVal.message ?? String(errVal))
              : !isSuccess && hasErrorField
              ? String(errVal)
              : null,
          failureStage: probeSmallFailureTrace?.failureStage ?? null,
        };
      }

      if (
        debugEnabled &&
        probeSmallProjectId &&
        item.id === probeSmallProjectId &&
        !schedulerDebugSummary.probeSmallProject?.captured &&
        !schedulerDebugSummary.probeSmallProject?.outcomeKind
      ) {
        const baseSummary = schedulerDebugSummary.probeSmallProject ?? {};
        const hasStatus = "status" in placed;
        const isFailurePayload =
          !hasStatus &&
          placed !== null &&
          typeof placed === "object" &&
          "error" in placed;
        const outcomeKind: ProbeSmallProjectOutcomeKind = hasStatus
          ? "success"
          : isFailurePayload
          ? placed.error === "NO_FIT"
            ? "no_fit"
            : "error"
          : "unknown";
        const rawError = isFailurePayload ? (placed as { error: unknown }).error : undefined;
        const isObjectError =
          rawError !== undefined &&
          rawError !== null &&
          typeof rawError === "object";
        const errorType =
          isFailurePayload && rawError !== undefined && rawError !== null
            ? isObjectError
              ? ((rawError as any).name ?? "ErrorObject")
              : typeof rawError
            : null;
        const errorMessage =
          isFailurePayload && rawError !== undefined && rawError !== null
            ? isObjectError
              ? (rawError as any).message ?? String(rawError)
              : String(rawError)
            : null;
        const failureStage =
          !hasStatus && projectFailureTrace
            ? projectFailureTrace.failureStage
            : null;
        schedulerDebugSummary.probeSmallProject = {
          ...baseSummary,
          captured: true,
          projectId: item.id,
          durationMinutes: item.duration_min,
          dayOffset,
          outcomeKind,
          errorType,
          errorMessage,
          failureStage,
        };
      }

      if (!("status" in placed)) {
        recordPlacementFailureTrace(placed);
        if (placed.error === "NO_FIT" && placed.skippedDueToMaxGap) {
          continue;
        }
        if (placed.error && placed.error !== "NO_FIT") {
          placementErrored = true;
        }
        continue;
      }

      if (placed.error) {
        placementErrored = true;
        continue;
      }

      if (!placed.data) {
        continue;
      }

      // Successfully placed!
      placedData = placed.data;
      placementDayOffset = dayOffset;
      placementWindow = findPlacementWindow(dayWindows, placed.data);
      break; // Stop searching - we found a slot
    }

    // Process the placement result
    if (!placedData) {
      // Failed to place anywhere in the horizon
      const debugInfo = `NO_FIT: duration=${item.duration_min}, energy=${item.energy}, horizon_days=${effectiveHorizonDays}`;

      if (!item.instanceId) {
        // Create missed instance with reason
        const { error: createError } = await supabase
          .from("schedule_instances")
          .insert({
            user_id: userId,
            source_type: "PROJECT",
            source_id: item.id,
            status: "missed",
            missed_reason: debugInfo,
            start_utc: null,
            end_utc: null,
            duration_min: item.duration_min,
            window_id: null,
            energy_resolved: item.energy,
            locked: false,
            weight_snapshot: item.weight,
          });
        if (createError) {
          log("error", "Failed to create missed instance:", createError);
        }
      } else {
        // Update existing instance with detailed reason
        const { error: updateError } = await supabase
          .from("schedule_instances")
          .update({ missed_reason: debugInfo })
          .eq("id", item.instanceId);
        if (updateError) {
          log("error", "Failed to update missed reason:", updateError);
        }
      }

      result.failures.push({
        itemId: item.id,
        reason: "NO_FEASIBLE_SLOT_IN_HORIZON",
      });

      // TEMPORARY INSTRUMENTATION: Log project placement failed to missed
      if (SCHEDULER_PROJECT_DEBUG_LOGGING) {
        logSchedulerDebug(
          "[SCHEDULER_PROJECT_DEBUG] project placement failed across horizon",
          {
            project_id: item.id,
            instance_id: item.instanceId,
            horizon_days: effectiveHorizonDays,
            reason: "NO_VALID_WINDOWS",
          }
        );
      }
      const failureReason: ProjectFailureReason = placementErrored
        ? "failedPlacement"
        : hadCompatibleWindows
        ? "horizonExhausted"
        : "skippedNoWindows";
      recordProjectFailure(failureReason, item.id);
      const failureKind: keyof SchedulerDebugSummary["fail"] = !hadCompatibleWindows
        ? "noWindows"
        : placementErrored
        ? "blocked"
        : "horizonExhausted";
      schedulerDebugSummary.fail[failureKind] += 1;
      if (debugEnabled && schedulerDebugSummary.failBreakdown) {
        const stage = projectFailureTrace?.failureStage ?? "other";
        schedulerDebugSummary.failBreakdown[stage] += 1;
      }
      continue;
    }

    // Successfully placed!
    if (
      SCHEDULER_PROJECT_DEBUG_LOGGING &&
      (item.id === "f9dfe551-53a5-455c-a41e-ac9bc9b1d9be" ||
        item.globalRank === 1)
    ) {
      logSchedulerDebug("[RANK_DEBUG_PLACED]", {
        id: item.id,
        rank: item.globalRank,
        placedStartUtc: placedData.start_utc,
        placedEndUtc: placedData.end_utc,
        dayOffset: placementDayOffset,
      });
    }

    result.placed.push(placedData);
    placementDebugCollector?.recordPlacementSuccess(
      item.id,
      placedData.start_utc ?? null
    );
    schedulerDebugSummary.placed += 1;
    if (debugEnabled) {
      projectDebugCounts.placedProjects += 1;
    }
    if (placementWindow?.key) {
      const placementEnd = new Date(placedData.end_utc);
      const existingBounds = projectWindowAvailability.get(placementWindow.key);
      if (existingBounds) {
        const nextFront = Math.min(
          placementEnd.getTime(),
          existingBounds.back.getTime()
        );
        existingBounds.front = new Date(nextFront);
      }
    }
    keptInstancesByProject.delete(item.id);
    const decision: ScheduleDraftPlacement["decision"] = item.instanceId
      ? "rescheduled"
      : "new";
    result.timeline.push({
      type: "PROJECT",
      instance: placedData,
      projectId: placedData.source_id ?? item.id,
      decision,
      scheduledDayOffset: placementDayOffset,
      availableStartLocal: placementWindow?.availableStartLocal
        ? placementWindow.availableStartLocal.toISOString()
        : undefined,
      windowStartLocal: placementWindow?.startLocal
        ? placementWindow.startLocal.toISOString()
        : undefined,
      locked: placedData.locked ?? undefined,
    });
    scheduledProjectIds.add(item.id);

    if (item.instanceId) {
      removeInstanceFromBuckets(item.instanceId);
    }
    // Register the placed instance for future reference
    registerInstanceForOffsets(placedData);

    // Add the placed project instance as a blocker for subsequent projects
    projectBlockingInstances.push(placedData);
  }

  logSchedulerDebug("[SCHEDULER] EXIT project placement pass");
  // ==========================================

  for (let offset = 0; offset < cleanupOffsetLimit; offset += 1) {
    let windowAvailability = windowAvailabilityByDay.get(offset);
    if (!windowAvailability) {
      windowAvailability = new Map<string, WindowAvailabilityBounds>();
      windowAvailabilityByDay.set(offset, windowAvailability);
    }

    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);
    await prepareWindowsForDay(day);
    const dayInstances = getDayInstances(offset);
    const allowSchedulingToday = offset < effectiveDayLimit;
    const shouldScheduleHabits =
      allowSchedulingToday && offset < habitWriteLookaheadDays;
    if (offset === 0 && habitAudit.enabled) {
      const dayStart = startOfDayInTimeZone(day, timeZone);
      habitAudit.report.inputs = {
        offset,
        dayStart: dayStart.toISOString(),
        timezone: timeZone,
        shouldScheduleHabits: {
          maxOffset: effectiveDayLimit,
          persistedDayLimit: effectiveDayLimit,
          habitWriteLookaheadDays,
          shouldScheduleHabits,
        },
      };
    }
    let reservedPlacements: Map<string, HabitReservation> | undefined;
    if (shouldScheduleHabits) {
      // Reserve mandatory habit capacity before project placement.
      reservedPlacements = await reserveMandatoryHabitsForDay({
        userId,
        habits: dailyHabits,
        day,
        offset,
        timeZone,
        parity: parityOptions,
        availability: windowAvailability,
        baseDate,
        windowCache,
        maxGapCache: dayMaxGapCache,
        client: supabase,
        sunlightLocation: location,
        timeZoneOffsetMinutes,
        durationMultiplier,
        restMode: isRestMode,
        existingInstances: dayInstances,
        getWindowsForDay,
        getLastScheduledHabitStart: getHabitLastScheduledStart,
        audit: habitAudit,
        debugEnabled,
      });
    }
    const overlapInvalidated = overlapInvalidatedHabitsByOffset.get(offset);
    if (overlapInvalidated && overlapInvalidated.length > 0) {
      for (const instance of overlapInvalidated) {
        const habitId = instance.source_id ?? null;
        if (!habitId) continue;
        const reservation = reservedPlacements?.get(habitId) ?? null;
        if (!reservation) continue;
        if (reservation.availabilitySnapshot) {
          windowAvailability.set(reservation.windowKey, {
            front: new Date(reservation.availabilitySnapshot.front.getTime()),
            back: new Date(reservation.availabilitySnapshot.back.getTime()),
          });
        } else {
          windowAvailability.delete(reservation.windowKey);
        }
        reservedPlacements?.delete(habitId);
      }
    }
    const dayWindows = getWindowsForDay(day);

    if (shouldScheduleHabits) {
      await ensureHabitPlacementsForDay(
        offset,
        day,
        windowAvailability,
        reservedPlacements
      );
    } else {
      const hasHabitInstances = dayInstances.some(
        (inst) => inst?.source_type === "HABIT" && inst.status === "scheduled"
      );
      if (hasHabitInstances) {
    const cleanupResult = await scheduleHabitsForDay({
      userId,
      habits: dailyHabits,
      day,
      offset,
      timeZone,
      parity: parityOptions,
      availability: windowAvailability,
      baseDate,
      windowCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      client: supabase,
          sunlightLocation: location,
          timeZoneOffsetMinutes,
          durationMultiplier,
          restMode: isRestMode,
          existingInstances: dayInstances,
          registerInstance: registerInstanceForOffsets,
          getWindowsForDay,
          getLastScheduledHabitStart: getHabitLastScheduledStart,
          recordHabitScheduledStart,
          createdThisRun,
          logCancel,
          habitMap: habitById,
          taskContextById,
          contextTaskCounts,
        practiceHistory,
        effectiveLastCompletedAt,
        getProjectGoalMonumentId,
        allowScheduling: false,
        audit: habitAudit,
        debugEnabled,
        nonDailyHabitIds,
        nonDailyReplacementInstanceIds,
      });
        if (cleanupResult.failures.length > 0) {
          result.failures.push(...cleanupResult.failures);
        }
      }
    }
  }

  for (const [projectId, inst] of keptInstancesByProject) {
    scheduledProjectIds.add(projectId);
    result.timeline.push({
      type: "PROJECT",
      instance: inst,
      projectId,
      decision: "kept",
      scheduledDayOffset: dayOffsetFor(inst.start_utc) ?? undefined,
      locked: inst.locked ?? undefined,
    });
  }

  if (effectiveDayLimit >= lookaheadDays) {
    const failureMap = new Map<string, ScheduleFailure>();
    for (const item of queue) {
      if (!scheduledProjectIds.has(item.id)) {
        if (!failureMap.has(item.id)) {
          failureMap.set(item.id, { itemId: item.id, reason: "NO_WINDOW" });
        }
      }
    }
    result.failures.push(...Array.from(failureMap.values()));
  }
  if (overlapProjectIds.size > 0) {
    const unscheduledOverlapIds: string[] = [];
    for (const projectId of overlapProjectIds) {
      if (scheduledProjectIds.has(projectId)) continue;
      const instanceId = overlapProjectInstanceIds.get(projectId);
      if (instanceId) {
        unscheduledOverlapIds.push(instanceId);
      }
    }
    if (unscheduledOverlapIds.length > 0) {
      await invalidateInstancesAsMissed(
        supabase,
        unscheduledOverlapIds,
        result
      );
    }
  }

  result.timeline.sort((a, b) => {
    const aTime = placementStartMs(a);
    const bTime = placementStartMs(b);
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
    if (aTime === bTime) {
      return placementKey(a).localeCompare(placementKey(b));
    }
    return aTime - bTime;
  });

  if (placementDebugCollector) {
    for (const placementEntry of result.timeline) {
      const blockInfo = resolvePlacementBlockKey(placementEntry);
      if (!blockInfo.blockId || !blockInfo.start || !blockInfo.end) continue;
      placementDebugCollector.recordBlockOccupancy(blockInfo.blockId, {
        itemId:
          placementEntry.type === "PROJECT"
            ? placementEntry.projectId
            : placementEntry.habit.id,
        type: placementEntry.type,
        start: blockInfo.start,
        end: blockInfo.end,
        pass: placementEntry.type,
      });
    }
  }

  const finalRangeResponse = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase,
    { suppressQueryLog: debugEnabled }
  );
  if (finalRangeResponse.error) {
    throw finalRangeResponse.error;
  }
  const finalInstances = (finalRangeResponse.data ?? []) as ScheduleInstance[];
  const finalInvariantInstances = buildFinalInvariantInstances(
    finalInstances,
    habitTypeById
  );
  const finalInstanceById = new Map<string, ScheduleInstance>();
  for (const entry of finalInvariantInstances) {
    if (entry.instance.id) {
      finalInstanceById.set(entry.instance.id, entry.instance);
    }
  }
  // During rebuild, don't cancel PROJECT instances for overlaps - they were just placed
  const nonProjectInstances = finalInvariantInstances.filter(
    (inst) => !inst.isProject
  );
  const { canceled: cancelIdSet, overlapPairs } = collectFinalInvariantCancels(
    nonProjectInstances,
    {
      nonDailyHabitIds,
      replacementInstanceIds: nonDailyReplacementInstanceIds,
    }
  );
  if (cancelIdSet.size > 0) {
    for (const id of cancelIdSet) {
      logCancel(
        "FINAL_INVARIANT_CANCEL_BULK",
        finalInstanceById.get(id) ?? null
      );
    }
    await cancelInstancesAsIllegalOverlap(supabase, Array.from(cancelIdSet));
  }
  const remainingInstances = finalInvariantInstances.filter((entry) => {
    const id = entry.instance.id ?? "";
    return id.length > 0 && !cancelIdSet.has(id);
  });
  const { canceled: remainingCancels, overlapPairs: remainingOverlapPairs } =
    collectFinalInvariantCancels(remainingInstances, {
      nonDailyHabitIds,
      replacementInstanceIds: nonDailyReplacementInstanceIds,
    });
  if (remainingCancels.size > 0) {
    // Log structured summary of remaining cancels
    const cancelSummaries = Array.from(remainingCancels).map((id) => {
      const instance = finalInvariantInstances.find(
        (inst) => inst.instance.id === id
      );
      return {
        id,
        source_type: instance?.instance.source_type,
        source_id: instance?.instance.source_id,
        start_utc: instance?.instance.start_utc,
        end_utc: instance?.instance.end_utc,
      };
    });
    log("error", "[SCHEDULER] Final invariant violation - remaining overlaps:", {
      count: remainingCancels.size,
      instances: cancelSummaries,
    });

    // Log PROJECT overlap pairs in detail
    const projectOverlapPairs = remainingOverlapPairs.filter(
      (pair) => pair.canceled.isProject || pair.overlapping.isProject
    );
      if (projectOverlapPairs.length > 0) {
        log("error", "[SCHEDULER] PROJECT overlap pairs in final invariant during rebuild:", {
          count: projectOverlapPairs.length,
          pairs: projectOverlapPairs.map((pair) => ({
            canceled: {
              id: pair.canceled.instance.id,
              source_id: pair.canceled.instance.source_id,
              start_utc: pair.canceled.instance.start_utc,
              end_utc: pair.canceled.instance.end_utc,
              status: pair.canceled.instance.status,
              locked: pair.canceled.locked,
            },
            overlapping: {
              id: pair.overlapping.instance.id,
              source_id: pair.overlapping.instance.source_id,
              start_utc: pair.overlapping.instance.start_utc,
              end_utc: pair.overlapping.instance.end_utc,
              status: pair.overlapping.instance.status,
              locked: pair.overlapping.locked,
            },
          })),
        });
      }

    // Log PROJECT instances in final invariant cancels but don't crash
    const projectCancels = cancelSummaries.filter(
      (summary) => summary.source_type === "PROJECT"
    );
    if (projectCancels.length > 0) {
      log("error", "[SCHEDULER] PROJECT instances in final invariant cancels during rebuild:", {
        count: projectCancels.length,
        instances: projectCancels.map((p) => ({
          id: p.id,
          source_id: p.source_id,
          start_utc: p.start_utc,
          end_utc: p.end_utc,
        })),
      });

      // Add to result.failures for each canceled project
      for (const projectCancel of projectCancels) {
        result.failures.push({
          itemId: projectCancel.source_id || projectCancel.id,
          reason: "error",
          detail: "FINAL_INVARIANT_PROJECT_OVERLAP",
        });
      }
    }

    // Cancel non-PROJECT instances and continue
    for (const id of remainingCancels) {
      logCancel("FINAL_INVARIANT_CANCEL", finalInstanceById.get(id) ?? null);
      await cancelScheduleInstance(id, {
        reason: "ILLEGAL_OVERLAP",
        fault: "SYSTEM",
      });
      removeInstanceFromBuckets(id);
    }
  }

  // Always clean up old missed HABIT instances so accumulation doesn't depend on a perfect run
  const missedCleanupCutoff = addDaysInTimeZone(
    baseStart,
    -HABIT_MISSED_RETENTION_DAYS,
    timeZone
  );
  const { error: missedCleanupError } = await supabase
    .from("schedule_instances")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "HABIT")
    .eq("status", "missed")
    .lt("start_utc", missedCleanupCutoff.toISOString());

  if (missedCleanupError) {
    result.failures.push({
      itemId: "cleanup-missed-habits",
      reason: "error",
      detail: missedCleanupError,
    });
  }

  if (typeof supabase.from === "function") {
    const cleanupResult = await cleanupTransientInstances(userId, supabase);
    if (cleanupResult.error) {
      result.failures.push({
        itemId: "cleanup-transient-instances",
        reason: "error",
        detail: cleanupResult.error,
      });
    }
  }

  if (cancelLogCounts.size > 0) {
    const summary = Array.from(cancelLogCounts.entries()).reduce<
      Record<string, number>
    >((acc, [reason, count]) => {
      acc[reason] = count;
      return acc;
    }, {});
    logSchedulerDebug("[SCHEDULER_CANCEL_SUMMARY]", {
      counts: summary,
      topHabitInstanceIds: canceledHabitIds.slice(0, 10),
    });
  }

  if (SCHEDULER_DEBUG_LOGGING) {
    const habitTimeline = result.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    if (result.failures.length > 0 || habitTimeline.length > 0) {
      logSchedulerInfo("scheduleBacklog result:", {
        failures: result.failures,
        habitTimeline,
      });
    }
  }

  // ===== SYNC PAIRING POST-PASS =====
  logSchedulerDebug("[SCHEDULER_ORDER] SYNC_PAIRING_POST_PASS_START");

  const syncInstancesCreated: ScheduleInstance[] = [];
  const syncPairingsByInstanceId: Record<string, string[]> = {};
  // Track partner instances already paired to a SYNC during this run to avoid reusing them
  const claimedPartnerInstanceIds = new Set<string>();
  const finalInstanceLookup = finalInstances.reduce<
    Map<string, ScheduleInstance>
  >((map, inst) => {
    if (inst.id) {
      map.set(inst.id, inst);
    }
    return map;
  }, new Map<string, ScheduleInstance>());

  // Get all scheduled instances from the final range (non-SYNC)
  const allScheduledInstances = finalInstances.filter((inst) => {
    if (inst.status !== "scheduled") return false;
    if (inst.source_type !== "HABIT") return true;
    const habitType = habitTypeById.get(inst.source_id ?? "") ?? "HABIT";
    return habitType !== "SYNC";
  });
  const syncHabitsDue: Map<
    string,
    { habit: HabitScheduleItem; minOffset: number }
  > = new Map();

  // Find due SYNC habits across all days, tracking earliest due offset
  for (let offset = 0; offset < effectiveDayLimit; offset += 1) {
    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);

    for (const habit of habits) {
      const normalizedType =
        habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
      if (normalizedType !== "SYNC") continue;

      const windowDays = habit.window?.days ?? null;
      const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
      const dueInfo = evaluateHabitDueOnDate({
        habit,
        date: day,
        timeZone,
        windowDays,
        lastScheduledStart:
          normalizedType === "SYNC"
            ? null
            : getHabitLastScheduledStart(habit.id),
        nextDueOverride,
      });
      if (dueInfo.isDue) {
        const existing = syncHabitsDue.get(habit.id);
        if (!existing || offset < existing.minOffset) {
          syncHabitsDue.set(habit.id, { habit, minOffset: offset });
        }
      }
    }
  }

  const uniqueSyncHabits = Array.from(syncHabitsDue.values());

  for (const syncEntry of uniqueSyncHabits) {
    const habit = syncEntry.habit;
    // Create sync window (full day for flexibility)
    const syncWindow = {
      start: startOfDayInTimeZone(baseStart, timeZone),
        end: addDaysInTimeZone(
          startOfDayInTimeZone(baseStart, timeZone),
          effectiveDayLimit,
          timeZone
        ),
    };

    const candidates = allScheduledInstances
      .map((inst) => {
        const start = new Date(inst.start_utc ?? "");
        const end = new Date(inst.end_utc ?? "");
        if (
          !Number.isFinite(start.getTime()) ||
          !Number.isFinite(end.getTime())
        )
          return null;
        if (!inst.id) return null;
        return {
          start,
          end,
          id: inst.id,
        };
      })
      .filter(
        (candidate): candidate is { start: Date; end: Date; id: string } =>
          candidate !== null
      );

    const minDurationMs =
      Math.max(
        1,
        Number(habit.duration_minutes ?? habit.durationMinutes ?? 0)
      ) * 60_000;

    logSchedulerDebug("[SYNC_POST_PASS]", {
      habitId: habit.id,
      habitName: habit.name,
      duration_minutes: habit.duration_minutes ?? null,
      durationMinutes: habit.durationMinutes ?? null,
      minDurationMs,
      candidates: candidates.length,
      syncWindow: {
        start: syncWindow.start.toISOString(),
        end: syncWindow.end.toISOString(),
      },
    });

    const unclaimedCandidates = candidates.filter(
      (candidate) => !claimedPartnerInstanceIds.has(candidate.id)
    );
    const effectiveCandidates =
      unclaimedCandidates.length > 0 ? unclaimedCandidates : candidates;

    const syncResult = computeSyncHabitDuration({
      syncWindow,
      minDurationMs,
      candidates: effectiveCandidates,
    });

    if (syncResult.finalStart && syncResult.finalEnd) {
      if (syncResult.finalEnd.getTime() <= syncResult.finalStart.getTime()) {
        continue;
      }
      const durationMin = computeDurationMin(
        syncResult.finalStart,
        syncResult.finalEnd
      );
      if (durationMin <= 0) {
        throw new Error("Invalid duration_min computed for instance");
      }
      const startUtc = syncResult.finalStart.toISOString();
      const endUtc = new Date(
        syncResult.finalStart.getTime() + durationMin * 60000
      ).toISOString();
      // Create SYNC instance
      const syncInstance = await createInstance(
        {
          userId,
          sourceType: "HABIT",
          sourceId: habit.id,
          startUTC: startUtc,
          endUTC: endUtc,
          durationMin,
          energyResolved: habit.energy ?? "NO",
          windowId: null,
          locked: false,
          weightSnapshot: 0,
          eventName: habit.name ?? null,
          practiceContextId: habit.skillMonumentId ?? null,
        },
        supabase
      );

      if (syncInstance) {
        syncInstancesCreated.push(syncInstance);
        const filterValidPartnerIds = (ids: string[] | null | undefined) =>
          (ids ?? []).filter((id) => {
            const partner = id ? finalInstanceLookup.get(id) : null;
            if (!partner || !partner.start_utc || !partner.end_utc)
              return false;
            const partnerStart = new Date(partner.start_utc).getTime();
            const partnerEnd = new Date(partner.end_utc).getTime();
            if (!Number.isFinite(partnerStart) || !Number.isFinite(partnerEnd))
              return false;
            return partnerEnd > syncStartMs && partnerStart < syncEndMs;
          });

        const syncStartMs = new Date(startUtc).getTime();
        const syncEndMs = new Date(endUtc).getTime();
        const pairedValid = filterValidPartnerIds(syncResult.pairedInstances);
        const validatedPartners = pairedValid.filter(
          (id) => !claimedPartnerInstanceIds.has(id)
        );

        syncPairingsByInstanceId[syncInstance.id] = validatedPartners;
        for (const id of validatedPartners) {
          claimedPartnerInstanceIds.add(id);
        }
        result.placed.push(syncInstance);
        result.timeline.push({
          type: "HABIT",
          habit: {
            id: habit.id,
            name: habit.name,
            windowId: null,
            windowLabel: null,
            startUTC: startUtc,
            endUTC: endUtc,
            durationMin,
            energyResolved: habit.energy ?? "NO",
            clipped: false,
            practiceContextId: null,
          },
          decision: "new",
          scheduledDayOffset: 0, // SYNC instances span days
          availableStartLocal: syncResult.finalStart.toISOString(),
          windowStartLocal: null,
          instanceId: syncInstance.id,
        });

        // Register the SYNC instance for blocking
        registerInstanceForOffsets(syncInstance);
      }
    }
  }

  if (syncInstancesCreated.length > 0) {
    const pairingRows = syncInstancesCreated
      .map((instance) => {
        const instanceId = instance.id ?? null;
        if (!instanceId) return null;
        return {
          user_id: userId,
          sync_instance_id: instanceId,
          partner_instance_ids: syncPairingsByInstanceId[instanceId] ?? [],
        };
      })
      .filter(
        (
          value
        ): value is {
          user_id: string;
          sync_instance_id: string;
          partner_instance_ids: string[];
        } => value !== null
      );

    if (pairingRows.length > 0) {
      const { error: pairingError } = await supabase
        .from("schedule_sync_pairings")
        .upsert(pairingRows, { onConflict: "sync_instance_id" });
      if (pairingError) {
        result.failures.push({
          itemId: "sync-pairings-persist",
          reason: "error",
          detail: pairingError,
        });
      }
    }
  }

  result.syncPairings = syncPairingsByInstanceId;

  logSchedulerDebug("[SCHEDULER_ORDER] SYNC_PAIRING_POST_PASS_END", {
    syncInstancesCreated: syncInstancesCreated.length,
  });

  if (habitAudit.enabled && habitAudit.report.inputs.offset === 0) {
    logSchedulerDebug("HABIT_AUDIT_TODAY", JSON.stringify(habitAudit.report));
  }

  if (debugEnabled) {
    const getSampleId = (reason: ProjectFailureReason): string | null => {
      const candidate = projectFailureSamples.get(reason);
      if (!candidate) return null;
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : null;
    };
    const firstAvailableSample = (
      reasons: ProjectFailureReason[]
    ): string | null => {
      for (const reason of reasons) {
        const sample = getSampleId(reason);
        if (sample) return sample;
      }
      return null;
    };

    const bucketSummaries: Record<MissBucketKey, MissBucketSummary> = {
      noCompatibleWindows: {
        count: projectDebugCounts.skippedNoWindows,
        exampleProjectId: getSampleId("skippedNoWindows"),
      },
      failedPlacement: {
        count: projectDebugCounts.failedPlacement,
        exampleProjectId: getSampleId("failedPlacement"),
      },
      lockedOrCompleted: {
        count:
          projectDebugCounts.skippedLocked +
          projectDebugCounts.skippedCompleted,
        exampleProjectId: firstAvailableSample([
          "skippedLocked",
          "skippedCompleted",
        ]),
      },
      horizonExhausted: {
        count: projectDebugCounts.horizonExhausted,
        exampleProjectId: getSampleId("horizonExhausted"),
      },
    };

    const projectsMissed = projectFailureReasons.reduce(
      (sum, reason) => sum + projectDebugCounts[reason],
      0
    );

    const bucketEntries: Array<{
      key: MissBucketKey;
      count: number;
      exampleProjectId: string | null;
    }> = Object.entries(bucketSummaries).map(([key, value]) => ({
      key: key as MissBucketKey,
      count: value.count,
      exampleProjectId: value.exampleProjectId,
    }));

    let largestBucket =
      bucketEntries[0] ?? {
        key: "noCompatibleWindows",
        count: 0,
        exampleProjectId: null,
      };
    for (const entry of bucketEntries) {
      if (entry.count > largestBucket.count) {
        largestBucket = entry;
      }
    }

    const summary: ProjectDebugSummary = {
      projectsConsidered: projectDebugCounts.totalProjectsConsidered,
      projectsPlaced: projectDebugCounts.placedProjects,
      projectsMissed,
      missReasonNoCompatibleWindows: bucketSummaries.noCompatibleWindows,
      missReasonFailedPlacement: bucketSummaries.failedPlacement,
      missReasonLockedOrCompleted: bucketSummaries.lockedOrCompleted,
      missReasonHorizonExhausted: bucketSummaries.horizonExhausted,
      largestMissReason: largestBucket.count > 0 ? largestBucket.key : undefined,
      largestMissExampleProjectId:
        largestBucket.count > 0 ? largestBucket.exampleProjectId : null,
    };
    result.projectDebugSummary = summary;
    schedulerDebugSummary.location = {
      rejectedByLocation: locationDebugCounts.rejectedByLocation,
      acceptedWithWindowLocationButNullItemLocation:
        locationDebugCounts.acceptedWithWindowLocationButNullItemLocation,
    };
    if (
      debugEnabled &&
      smallProjectCandidate &&
      !schedulerDebugSummary.probeSmallProject?.captured
    ) {
      const smallProjectDayOffset =
        smallProjectFirstAttemptDayOffset ?? 0;
      const smallProjectFirstAttemptDay =
        smallProjectFirstAttemptStats ?? undefined;
      schedulerDebugSummary.probeSmallProject ??= {
        projectId: smallProjectCandidate.id,
        durationMinutes: smallProjectCandidate.duration_min,
        dayOffset: smallProjectDayOffset,
        failureStage:
          probeSmallFailureTrace?.failureStage ?? "other",
        firstAttemptDay: smallProjectFirstAttemptDay,
      };
    }
    result.debugSummary = schedulerDebugSummary;
    result.placementTrace = placementDebugCollector?.buildTrace();
  }

  return result;
}

type DedupeResult = {
  scheduled: Set<string>;
  keepers: ScheduleInstance[];
  failures: ScheduleFailure[];
  error: PostgrestError | null;
  canceledByProject: Map<string, string[]>;
  reusableByProject: Map<string, string>;
  allInstances: ScheduleInstance[];
  effectiveLastCompletedAt: Map<string, string>;
  lockedProjectInstances: Map<string, ScheduleInstance>;
};

async function dedupeScheduledProjects(
  supabase: Client,
  userId: string,
  baseStart: Date,
  rangeEnd: Date,
  projectsToReset: Set<string>,
  writeThroughEnd: Date,
  debugEnabled: boolean
): Promise<DedupeResult> {
  const response = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase,
    { suppressQueryLog: debugEnabled }
  );

  if (response.error) {
    return {
      scheduled: new Set<string>(),
      keepers: [],
      failures: [],
      error: response.error,
      canceledByProject: new Map(),
      reusableByProject: new Map(),
      allInstances: [],
      effectiveLastCompletedAt: new Map(),
      lockedProjectInstances: new Map(),
    };
  }

  const allInstances = ((response.data ?? []) as ScheduleInstance[]).filter(
    (inst): inst is ScheduleInstance => Boolean(inst)
  );

  // Build effective lastCompletedAt from allInstances
  const effectiveLastCompletedAt = new Map<string, string>();
  for (const instance of allInstances) {
    if (instance.source_type !== "HABIT" || instance.status !== "completed")
      continue;
    const habitId = instance.source_id;
    if (!habitId) continue;
    const completedAt = instance.end_utc || instance.start_utc;
    if (!completedAt) continue;
    const existing = effectiveLastCompletedAt.get(habitId);
    if (!existing || Date.parse(completedAt) > Date.parse(existing)) {
      effectiveLastCompletedAt.set(habitId, completedAt);
    }
  }

  const keepers = new Map<string, ScheduleInstance>();
  const reusableCandidates = new Map<string, ScheduleInstance>();
  const extras: ScheduleInstance[] = [];
  const lockedProjectInstances = new Map<string, ScheduleInstance>();

  const writeThroughCutoffMs = writeThroughEnd.getTime();
  const baseStartMs = baseStart.getTime();

  for (const inst of allInstances) {
    const isProject = inst.source_type === "PROJECT";
    const projectId = inst.source_id ?? "";
    if (!isProject || !projectId) continue;
    if (inst.status !== "scheduled") continue;
    const isLockedProject = inst.locked === true;
    const startMs = new Date(inst.start_utc ?? "").getTime();
    const withinWriteThrough =
      Number.isFinite(startMs) &&
      startMs >= baseStartMs &&
      startMs < writeThroughCutoffMs;

    if (isLockedProject) {
      const existingLocked = lockedProjectInstances.get(projectId);
      if (existingLocked) {
        const existingStart = new Date(existingLocked.start_utc).getTime();
        const instStart = new Date(inst.start_utc).getTime();
        if (instStart < existingStart) {
          extras.push(existingLocked);
          lockedProjectInstances.set(projectId, inst);
          keepers.set(projectId, inst);
        } else {
          extras.push(inst);
        }
      } else {
        lockedProjectInstances.set(projectId, inst);
        keepers.set(projectId, inst);
      }
    } else {
      const existing = reusableCandidates.get(projectId);
      if (!existing) {
        reusableCandidates.set(projectId, inst);
      } else {
        const existingStart = new Date(existing.start_utc).getTime();
        const instStart = new Date(inst.start_utc).getTime();
        if (instStart < existingStart) {
          extras.push(existing);
          reusableCandidates.set(projectId, inst);
        } else {
          extras.push(inst);
        }
      }
    }
  }

  const failures: ScheduleFailure[] = [];

  const canceledByProject = new Map<string, string[]>();

  for (const extra of extras) {
    const cancel = await supabase
      .from("schedule_instances")
      .update({ status: "canceled" })
      .eq("id", extra.id)
      .select("id")
      .single();

    if (cancel.error) {
      failures.push({
        itemId: extra.source_id,
        reason: "error",
        detail: cancel.error,
      });
      continue;
    }

    const id = cancel.data?.id ?? extra.id;
    const existing = canceledByProject.get(extra.source_id) ?? [];
    existing.push(id);
    canceledByProject.set(extra.source_id, existing);
    extra.status = "canceled";
  }

  const scheduled = new Set<string>();
  for (const key of keepers.keys()) {
    scheduled.add(key);
  }

  const reusableByProject = new Map<string, string>();
  for (const [projectId, inst] of reusableCandidates) {
    reusableByProject.set(projectId, inst.id);
  }

  return {
    scheduled,
    keepers: Array.from(keepers.values()),
    failures,
    error: null,
    canceledByProject,
    reusableByProject,
    allInstances,
    effectiveLastCompletedAt,
    lockedProjectInstances,
  };
}

async function reserveMandatoryHabitsForDay(params: {
  userId: string;
  habits: HabitScheduleItem[];
  day: Date;
  offset: number;
  timeZone: string;
  availability: Map<string, WindowAvailabilityBounds>;
  baseDate: Date;
  windowCache: Map<string, WindowLite[]>;
  maxGapCache: Map<string, number>;
  client: Client;
  sunlightLocation?: GeoCoordinates | null;
  timeZoneOffsetMinutes?: number | null;
  durationMultiplier?: number;
  restMode?: boolean;
  existingInstances: ScheduleInstance[];
  getWindowsForDay: (day: Date) => WindowLite[];
  getLastScheduledHabitStart: (habitId: string) => Date | null;
  parity?: FetchWindowsParityOptions | undefined;
  audit?: HabitAuditTracker;
  debugEnabled?: boolean;
}): Promise<Map<string, HabitReservation>> {
  const {
    userId,
    habits,
    day,
    offset,
    timeZone,
    availability,
    baseDate,
    windowCache,
    maxGapCache,
    client,
    sunlightLocation,
    timeZoneOffsetMinutes = null,
    durationMultiplier = 1,
    restMode = false,
    existingInstances,
    getWindowsForDay,
    getLastScheduledHabitStart,
    parity,
    audit,
    debugEnabled = false,
  } = params;

  const reservations = new Map<string, HabitReservation>();
  if (!habits.length) return reservations;

  const zone = timeZone || "UTC";
  const dayStart = startOfDayInTimeZone(day, zone);
  const dayStartMs = dayStart.getTime();
  const defaultDueMs = dayStart.getTime();
  const baseNowMs = offset === 0 ? baseDate.getTime() : null;
  const auditEnabled = Boolean(audit?.enabled && offset === 0);

  const habitTypeById = new Map<string, string>();
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    habitTypeById.set(habit.id, normalizedType);
  }

  const cacheKey = dateCacheKey(day);
  let windows = windowCache.get(cacheKey);
  if (!windows) {
    windows = getWindowsForDay(day);
    windowCache.set(cacheKey, windows);
  }
  const windowsById = new Map<string, WindowLite>();
  if (windows) {
    for (const win of windows) {
      windowsById.set(win.id, win);
    }
  }

  const scheduledInstancesByHabitId = new Map<string, ScheduleInstance[]>();
  for (const inst of existingInstances) {
    if (!inst) continue;
    if (inst.source_type !== "HABIT") continue;
    if (inst.status !== "scheduled") continue;
    const habitId = inst.source_id ?? "";
    if (!habitId) continue;
    const bucket = scheduledInstancesByHabitId.get(habitId);
    if (bucket) {
      bucket.push(inst);
    } else {
      scheduledInstancesByHabitId.set(habitId, [inst]);
    }
  }

  const hasValidScheduledInstance = (habit: HabitScheduleItem) => {
    const bucket = scheduledInstancesByHabitId.get(habit.id);
    if (!bucket || bucket.length === 0) return false;
    for (const instance of bucket) {
      const instanceStart = new Date(instance.start_utc ?? "");
      if (Number.isNaN(instanceStart.getTime())) continue;
      const instanceDayStart = startOfDayInTimeZone(instanceStart, zone);
      if (instanceDayStart.getTime() !== dayStartMs) continue;
      const windowRecord = instance.window_id
        ? (windowsById.get(instance.window_id) ?? null)
        : null;
      if (!doesWindowMatchHabitLocation(habit, windowRecord)) continue;
      if (!doesWindowAllowHabitType(habit, windowRecord)) continue;
      return true;
    }
    return false;
  };

  if (!windows || windows.length === 0) {
    if (auditEnabled) {
      for (const habit of habits) {
        const normalizedType = normalizeHabitTypeValue(habit.habitType);
        if (normalizedType === "PRACTICE" || normalizedType === "RELAXER") {
          continue;
        }
        const windowDays = habit.window?.days ?? null;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone: zone,
          windowDays,
          lastScheduledStart: getLastScheduledHabitStart(habit.id),
          nextDueOverride,
        });
        if (!dueInfo.isDue) continue;
        if (hasValidScheduledInstance(habit)) {
          audit.report.scheduling.dueAlreadyHasInstanceToday += 1;
          audit.addSample("dueAlreadyHasInstanceToday", habit.id);
          continue;
        }
        audit.report.scheduling.dueReservationFailed_WindowMissing += 1;
        audit.addSample("dueReservationFailed_WindowMissing", habit.id);
      }
    }
    return reservations;
  }

  const syncUsageByWindow = new Map<string, { start: number; end: number }[]>();
  const anchorSegmentsByWindowKey = new Map<
    string,
    { start: number; end: number }[]
  >();

  const addSyncUsage = (key: string, startMs: number, endMs: number) => {
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    )
      return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    const existing = syncUsageByWindow.get(key);
    if (!existing) {
      syncUsageByWindow.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      return;
    }
    const nearDuplicate = existing.some(
      (segment) =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    );
    if (nearDuplicate) return;
    let inserted = false;
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, {
          start: normalizedStart,
          end: normalizedEnd,
        });
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd });
    }
  };

  const addAnchorSegment = (key: string, startMs: number, endMs: number) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    if (normalizedEnd <= normalizedStart) return;
    const existing = anchorSegmentsByWindowKey.get(key);
    if (!existing) {
      anchorSegmentsByWindowKey.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      return;
    }
    const nearDuplicate = existing.some(
      (segment) =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    );
    if (nearDuplicate) return;
    let inserted = false;
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, {
          start: normalizedStart,
          end: normalizedEnd,
        });
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd });
    }
  };

  const getSyncOverlapConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => {
    const events: Array<{ time: number; delta: number }> = [];
    for (const segment of segments) {
      const overlapStart = Math.max(startMs, segment.start);
      const overlapEnd = Math.min(endMs, segment.end);
      if (overlapEnd <= overlapStart) continue;
      events.push({ time: overlapStart, delta: 1 });
      events.push({ time: overlapEnd, delta: -1 });
    }
    if (events.length === 0) return null;
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0;
    let prevTime = startMs;
    let conflictStart: number | null = null;
    let index = 0;
    while (index < events.length) {
      const time = events[index].time;
      if (active >= 2 && time > prevTime && conflictStart === null) {
        conflictStart = prevTime;
      }
      if (active < 2 && conflictStart !== null) {
        return { start: conflictStart, end: prevTime };
      }
      while (index < events.length && events[index].time === time) {
        active += events[index].delta;
        index += 1;
      }
      prevTime = time;
    }
    if (active >= 2) {
      if (conflictStart === null) {
        conflictStart = prevTime;
      }
      return { start: conflictStart, end: endMs };
    }
    if (conflictStart !== null) {
      return { start: conflictStart, end: prevTime };
    }
    return null;
  };

  const hasSyncOverlap = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => getSyncOverlapConflict(startMs, endMs, segments) !== null;

  const findFirstSyncConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => getSyncOverlapConflict(startMs, endMs, segments);

  const dueInfoByHabitId = new Map<string, HabitDueEvaluation>();
  const dueHabits: HabitScheduleItem[] = [];
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    if (normalizedType === "PRACTICE" || normalizedType === "RELAXER") {
      continue;
    }
    const windowDays = habit.window?.days ?? null;
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: day,
      timeZone: zone,
      windowDays,
      lastScheduledStart: getLastScheduledHabitStart(habit.id),
      nextDueOverride,
    });
    if (!dueInfo.isDue) continue;
    if (hasValidScheduledInstance(habit)) {
      if (auditEnabled) {
        audit.report.scheduling.dueAlreadyHasInstanceToday += 1;
        audit.addSample("dueAlreadyHasInstanceToday", habit.id);
      }
      continue;
    }
    if (auditEnabled) {
      audit.report.scheduling.dueSentToReservation += 1;
    }
    dueInfoByHabitId.set(habit.id, dueInfo);
    dueHabits.push(habit);
  }

  if (dueHabits.length === 0) {
    return reservations;
  }

  const windowEntries = windows
    .map((win) => {
      const startLocal = resolveWindowStart(win, day, zone);
      const endLocal = resolveWindowEnd(win, day, zone);
      const startMs = startLocal.getTime();
      const endMs = endLocal.getTime();
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        return null;
      }
      const descriptor = describeAvailabilityWindow(win, startLocal, endLocal);
      const key = getAvailabilityWindowKey(descriptor);
      return {
        window: win,
        startLocal,
        endLocal,
        startMs,
        endMs,
        key,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        window: WindowLite;
        startLocal: Date;
        endLocal: Date;
        startMs: number;
        endMs: number;
        key: string;
      } => entry !== null
    );

  const windowEntriesByKey = new Map<string, typeof windowEntries>();
  for (const entry of windowEntries) {
    const existing = windowEntriesByKey.get(entry.key);
    if (existing) {
      existing.push(entry);
    } else {
      windowEntriesByKey.set(entry.key, [entry]);
    }
  }

  if (windowEntries.length > 0 && existingInstances.length > 0) {
    const anchorableStatuses = new Set([
      "scheduled",
      "completed",
      "in_progress",
    ]);
    for (const instance of existingInstances) {
      if (!instance) continue;
      if (!anchorableStatuses.has(instance.status ?? "")) continue;
      const start = new Date(instance.start_utc ?? "");
      const end = new Date(instance.end_utc ?? "");
      const startMs = start.getTime();
      const endMs = end.getTime();
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        continue;
      }
      const habitId = instance.source_id ?? null;
      const habitType = habitId ? (habitTypeById.get(habitId) ?? null) : null;
      const isSyncInstance = habitType === "SYNC";
      const instanceKey = getAvailabilityWindowKey({
        dayTypeTimeBlockId:
          (instance as any).day_type_time_block_id ??
          (instance as any).dayTypeTimeBlockId ??
          null,
        windowId: instance.window_id ?? null,
        timeBlockId: instance.time_block_id ?? null,
        startUtc: instance.start_utc ?? null,
        endUtc: instance.end_utc ?? null,
      });
      const candidateEntries =
        windowEntriesByKey.get(instanceKey) ?? windowEntries;
      for (const entry of candidateEntries) {
        if (
          !overlapsHalfOpen(
            entry.startMs,
            entry.endMs,
            startMs,
            endMs
          )
        ) {
          continue;
        }
        if (isSyncInstance) {
          const segmentStart = Math.max(entry.startMs, startMs);
          const segmentEnd = Math.min(entry.endMs, endMs);
          addSyncUsage(entry.key, segmentStart, segmentEnd);
        } else {
          const segmentStart = Math.max(entry.startMs, startMs);
          const segmentEnd = Math.min(entry.endMs, endMs);
          addAnchorSegment(entry.key, segmentStart, segmentEnd);
        }
      }
    }
  }

  const sunlightOptions =
    typeof timeZoneOffsetMinutes === "number"
      ? { offsetMinutes: timeZoneOffsetMinutes }
      : undefined;
  const sunlightToday = resolveSunlightBounds(
    day,
    zone,
    sunlightLocation,
    sunlightOptions
  );
  const previousDay = addDaysInTimeZone(day, -1, zone);
  const nextDay = addDaysInTimeZone(day, 1, zone);
  const sunlightPrevious = resolveSunlightBounds(
    previousDay,
    zone,
    sunlightLocation,
    sunlightOptions
  );
  const sunlightNext = resolveSunlightBounds(
    nextDay,
    zone,
    sunlightLocation,
    sunlightOptions
  );

  const sortedHabits = [...dueHabits].sort((a, b) => {
    const dueA = dueInfoByHabitId.get(a.id);
    const dueB = dueInfoByHabitId.get(b.id);
    const dueDiff =
      (dueA?.dueStart?.getTime() ?? defaultDueMs) -
      (dueB?.dueStart?.getTime() ?? defaultDueMs);
    if (dueDiff !== 0) return dueDiff;
    const typeDiff =
      habitTypePriority(a.habitType) - habitTypePriority(b.habitType);
    if (typeDiff !== 0) return typeDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.name.localeCompare(b.name);
  });

  for (const habit of sortedHabits) {
    const rawDuration = Number(habit.durationMinutes ?? 0);
    let durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : DEFAULT_HABIT_DURATION_MIN;
    if (durationMultiplier !== 1) {
      durationMin = Math.max(1, Math.round(durationMin * durationMultiplier));
    }
    const baseDurationMs = durationMin * 60000;
    if (baseDurationMs <= 0) continue;
    let scheduledDurationMs = baseDurationMs;

    const resolvedEnergy = (
      habit.energy ??
      habit.window?.energy ??
      "NO"
    ).toUpperCase();
    const locationContextSource = habit.locationContextValue ?? null;
    const normalizedLocationContext =
      locationContextSource && typeof locationContextSource === "string"
        ? locationContextSource.toUpperCase().trim()
        : null;
    const locationContext =
      normalizedLocationContext === "ANY" ? null : normalizedLocationContext;
    const locationContextIdRaw = habit.locationContextId ?? null;
    const locationContextId =
      typeof locationContextIdRaw === "string" &&
      locationContextIdRaw.trim().length > 0
        ? locationContextIdRaw.trim()
        : null;
    const hasExplicitLocationContext =
      (typeof habit.locationContextId === "string" &&
        habit.locationContextId.trim().length > 0) ||
      (typeof habit.locationContextValue === "string" &&
        habit.locationContextValue.trim().length > 0 &&
        habit.locationContextValue.toUpperCase().trim() !== "ANY");
    const rawDaylight = habit.daylightPreference
      ? String(habit.daylightPreference).toUpperCase().trim()
      : "ALL_DAY";
    const daylightPreference =
      rawDaylight === "DAY" || rawDaylight === "NIGHT"
        ? rawDaylight
        : "ALL_DAY";
    const daylightConstraint =
      daylightPreference === "ALL_DAY"
        ? null
        : {
            preference: daylightPreference as "DAY" | "NIGHT",
            sunrise: sunlightToday.sunrise ?? null,
            sunset: sunlightToday.sunset ?? null,
            dawn: sunlightToday.dawn ?? null,
            dusk: sunlightToday.dusk ?? null,
            previousSunset: sunlightPrevious.sunset ?? null,
            previousDusk: sunlightPrevious.dusk ?? null,
            nextDawn: sunlightNext.dawn ?? sunlightNext.sunrise ?? null,
            nextSunrise: sunlightNext.sunrise ?? null,
          };
    const nightSunlightBundle =
      daylightConstraint?.preference === "NIGHT"
        ? {
            today: sunlightToday,
            previous: sunlightPrevious,
            next: sunlightNext,
          }
        : null;
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    const isSyncHabit = normalizedType === "SYNC";
    const anchorRaw = habit.windowEdgePreference
      ? String(habit.windowEdgePreference).toUpperCase().trim()
      : "FRONT";
    const anchorPreference = anchorRaw === "BACK" ? "BACK" : "FRONT";
    const allowedWindowKinds: WindowKind[] = ["DEFAULT"];

    const attemptKeys = new Set<string>();
    const attemptQueue: Array<{
      locationId: string | null;
      locationValue: string | null;
      daylight: DaylightConstraint | null;
      enforceLocation: boolean;
    }> = [];
    const enqueueAttempt = (
      locationId: string | null,
      locationValue: string | null,
      daylight: DaylightConstraint | null,
      options?: { enforceLocation?: boolean }
    ) => {
      const normalizedId =
        locationId && locationId.trim().length > 0 ? locationId.trim() : null;
      const normalizedValue =
        locationValue && locationValue.length > 0
          ? locationValue.toUpperCase().trim()
          : null;
      const enforceLocation = options?.enforceLocation ?? true;
      const key = `${normalizedId ?? "null"}|${normalizedValue ?? "null"}|${
        daylight?.preference ?? "null"
      }|${enforceLocation ? "strict" : "relaxed"}`;
      if (attemptKeys.has(key)) return;
      attemptKeys.add(key);
      attemptQueue.push({
        locationId: normalizedId,
        locationValue: normalizedValue,
        daylight,
        enforceLocation,
      });
    };

    const hasLocationRequirement = Boolean(
      locationContextId || locationContext
    );
    enqueueAttempt(locationContextId, locationContext, daylightConstraint);
    if (hasLocationRequirement) {
      enqueueAttempt(locationContextId, null, daylightConstraint);
      enqueueAttempt(null, locationContext, daylightConstraint);
    } else {
      enqueueAttempt(null, null, daylightConstraint);
    }
    if (daylightConstraint) {
      enqueueAttempt(locationContextId, locationContext, null);
      if (hasLocationRequirement) {
        enqueueAttempt(locationContextId, null, null);
        enqueueAttempt(null, locationContext, null);
      } else {
        enqueueAttempt(null, null, null);
      }
      if (hasLocationRequirement) {
        enqueueAttempt(null, null, daylightConstraint, {
          enforceLocation: false,
        });
        enqueueAttempt(null, null, null, { enforceLocation: false });
      }
    }
    if (!hasLocationRequirement && !daylightConstraint) {
      enqueueAttempt(null, null, null);
    }

    let compatibleWindows: Array<{
      id: string;
      key: string;
      startLocal: Date;
      endLocal: Date;
      availableStartLocal: Date;
    }> = [];

    const nightEligibleWindows =
      daylightConstraint?.preference === "NIGHT"
        ? windows.filter((win) =>
            windowOverlapsNightSpan(
              win,
              day,
              zone,
              sunlightToday,
              sunlightPrevious,
              sunlightNext
            )
          )
        : windows;

    let lastZeroStage: string | null = null;
    for (const attempt of attemptQueue) {
      const clonedAvailability = cloneAvailabilityMap(availability);
      const windowsForAttemptResult = await fetchCompatibleWindowsForItem(
        client,
        day,
        {
          energy: resolvedEnergy,
          duration_min: durationMin,
          habitType: habit.habitType,
          skillId: habit.skillId ?? null,
          skillMonumentId: habit.skillMonumentId ?? null,
        },
        zone,
        {
          availability: clonedAvailability,
          cache: windowCache,
          now: offset === 0 ? baseDate : undefined,
          locationContextId: attempt.locationId,
          locationContextValue: attempt.locationValue,
          daylight: attempt.daylight,
          ignoreAvailability: isSyncHabit,
          anchor: anchorPreference,
          restMode,
          userId,
          parity,
          enforceNightSpan: daylightConstraint?.preference === "NIGHT",
          nightSunlight: nightSunlightBundle,
          requireLocationContextMatch:
            attempt.enforceLocation || !hasExplicitLocationContext,
          hasExplicitLocationContext,
          preloadedWindows:
            attempt.daylight?.preference === "NIGHT"
              ? nightEligibleWindows
              : windows,
          allowedWindowKinds,
          auditZeroStageCallback: auditEnabled
            ? (stage) => {
                lastZeroStage = stage;
              }
            : undefined,
        }
      );
      const windowsForAttempt = windowsForAttemptResult.windows;
      if (windowsForAttempt.length > 0) {
        adoptAvailabilityMap(availability, clonedAvailability);
        compatibleWindows = windowsForAttempt;
        break;
      }
    }

    if (compatibleWindows.length === 0) {
      if (auditEnabled) {
        audit.report.scheduling.dueReservationFailed_NoCompatibleWindows += 1;
        audit.addSample("dueReservationFailed_NoCompatibleWindows", habit.id);
        audit.recordWindowZeroStage(lastZeroStage);
      }
      continue;
    }

    let reserved = false;
    for (const target of compatibleWindows) {
      const window = windowsById.get(target.id);
      if (!window) {
        continue;
      }

      const bounds = availability.get(target.key);
      const startLimit = target.availableStartLocal.getTime();
      const endLimit = target.endLocal.getTime();
      const windowStartMs = target.startLocal.getTime();
      const startMs = Number.isFinite(startLimit)
        ? startLimit
        : Number.isFinite(windowStartMs)
          ? windowStartMs
          : defaultDueMs;
      let constraintLowerBound = startMs;
      const dueStart = dueInfoByHabitId.get(habit.id)?.dueStart ?? null;
      if (
        typeof baseNowMs === "number" &&
        baseNowMs > constraintLowerBound &&
        baseNowMs < endLimit
      ) {
        constraintLowerBound = baseNowMs;
      }

      const desiredDurationMs = scheduledDurationMs;
      const syncSegments = syncUsageByWindow.get(target.key) ?? [];
      const anchorSegments = anchorSegmentsByWindowKey.get(target.key) ?? [];
      let startCandidate: number | null = null;
      let endCandidate: number | null = null;
      let clipped = false;

      if (isSyncHabit && anchorSegments.length > 0) {
        const safeWindowStart = Number.isFinite(windowStartMs)
          ? windowStartMs
          : startMs;
        const earliestStart = Math.max(safeWindowStart, constraintLowerBound);
        const searchStart =
          typeof baseNowMs === "number"
            ? Math.max(earliestStart, baseNowMs)
            : earliestStart;
        const segments = anchorSegments.filter(
          (segment) => segment.end > safeWindowStart && segment.start < endLimit
        );
        const GAP_TOLERANCE_MS = 60000;
        let index = 0;
        while (index < segments.length && segments[index].end <= searchStart) {
          index += 1;
        }
        if (index < segments.length) {
          let alignedStart = Math.max(segments[index].start, safeWindowStart);
          if (typeof baseNowMs === "number") {
            alignedStart = Math.max(alignedStart, baseNowMs);
          }
          if (alignedStart < segments[index].end) {
            let coverageEnd = Math.min(segments[index].end, endLimit);
            let totalCoverage = coverageEnd - alignedStart;
            let cursor = index;
            while (
              totalCoverage < desiredDurationMs &&
              cursor + 1 < segments.length
            ) {
              const nextSegment = segments[cursor + 1];
              if (
                nextSegment.start > coverageEnd + GAP_TOLERANCE_MS ||
                nextSegment.start >= endLimit
              ) {
                break;
              }
              coverageEnd = Math.min(
                Math.max(coverageEnd, nextSegment.end),
                endLimit
              );
              totalCoverage = coverageEnd - alignedStart;
              cursor += 1;
            }
            if (
              coverageEnd > alignedStart &&
              !hasSyncOverlap(alignedStart, coverageEnd, syncSegments)
            ) {
              startCandidate = alignedStart;
              endCandidate = coverageEnd;
              if (totalCoverage + 1 < desiredDurationMs) {
                clipped = true;
              }
            }
          }
        }
      }

      const latestStartAllowedFallback = endLimit - scheduledDurationMs;

      if (startCandidate === null || endCandidate === null) {
        const latestStartAllowed = latestStartAllowedFallback;
        let candidateStart = Math.max(startLimit, constraintLowerBound);
        if (isSyncHabit) {
          const safeWindowStart = Number.isFinite(windowStartMs)
            ? windowStartMs
            : startMs;
          candidateStart = Math.max(candidateStart, safeWindowStart);
          if (typeof baseNowMs === "number") {
            candidateStart = Math.max(candidateStart, baseNowMs);
          }
        } else if (
          typeof baseNowMs === "number" &&
          baseNowMs > candidateStart &&
          baseNowMs < endLimit
        ) {
          if (anchorPreference === "BACK") {
            const latestStart = endLimit - scheduledDurationMs;
            const desiredStart = Math.min(latestStart, baseNowMs);
            candidateStart = Math.max(startLimit, desiredStart);
          } else {
            candidateStart = baseNowMs;
          }
        }

        if (candidateStart >= endLimit) {
          if (bounds) {
            if (anchorPreference === "BACK") {
              bounds.back = new Date(candidateStart);
              if (bounds.front.getTime() > bounds.back.getTime()) {
                bounds.front = new Date(bounds.back);
              }
            } else {
              bounds.front = new Date(endLimit);
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.back = new Date(bounds.front);
              }
            }
          } else {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              endLimit,
              endLimit
            );
          }
          continue;
        }

        if (candidateStart > latestStartAllowed) {
          if (bounds) {
            if (anchorPreference === "BACK") {
              const clamped = Math.max(
                bounds.front.getTime(),
                latestStartAllowed
              );
              bounds.back = new Date(clamped);
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.front = new Date(bounds.back);
              }
            } else {
              bounds.front = new Date(endLimit);
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.back = new Date(bounds.front);
              }
            }
          } else {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              endLimit,
              endLimit
            );
          }
          continue;
        }

        let candidateEnd = candidateStart + scheduledDurationMs;
        let candidateClipped = false;
        if (candidateEnd > endLimit) {
          candidateEnd = endLimit;
          candidateClipped = true;
        }
        const crossMidnightClamp = clampEndToLocalDay(
          candidateStart,
          candidateEnd,
          zone,
          window.fromPrevDay === true
        );
        if (crossMidnightClamp.clamped) {
          candidateEnd = crossMidnightClamp.endMs;
          candidateClipped = true;
        }
        if (candidateEnd <= candidateStart) {
          setAvailabilityBoundsForKey(
            availability,
            target.key,
            candidateEnd,
            candidateEnd
          );
          if (bounds) {
            if (anchorPreference === "BACK") {
              bounds.back = new Date(
                Math.max(bounds.front.getTime(), candidateStart)
              );
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.front = new Date(bounds.back);
              }
            } else {
              bounds.front = new Date(candidateEnd);
              if (bounds.back.getTime() < bounds.front.getTime()) {
                bounds.back = new Date(bounds.front);
              }
            }
          }
          continue;
        }

        if (
          isSyncHabit &&
          hasSyncOverlap(candidateStart, candidateEnd, syncSegments)
        ) {
          let adjustedStart = candidateStart;
          let adjustedEnd = candidateEnd;
          let guard = 0;
          while (hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)) {
            const conflict = findFirstSyncConflict(
              adjustedStart,
              adjustedEnd,
              syncSegments
            );
            if (!conflict) break;
            adjustedStart = Math.max(conflict.end, adjustedStart + 1);
            if (adjustedStart > latestStartAllowed) break;
            adjustedEnd = adjustedStart + scheduledDurationMs;
            if (adjustedEnd > endLimit) {
              adjustedEnd = endLimit;
              candidateClipped = true;
            }
            guard += 1;
            if (guard > syncSegments.length + 4) break;
          }
          if (
            adjustedStart > latestStartAllowed ||
            adjustedEnd <= adjustedStart ||
            hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)
          ) {
            continue;
          }
          candidateStart = adjustedStart;
          candidateEnd = adjustedEnd;
        }
        const postSyncClamp = clampEndToLocalDay(
          candidateStart,
          candidateEnd,
          zone,
          window.fromPrevDay === true
        );
        if (postSyncClamp.clamped) {
          candidateEnd = postSyncClamp.endMs;
          candidateClipped = true;
        }
        if (candidateEnd <= candidateStart) {
          continue;
        }

        startCandidate = candidateStart;
        endCandidate = candidateEnd;
        clipped = candidateClipped;
      }

      if (startCandidate === null || endCandidate === null) {
        continue;
      }

      scheduledDurationMs = endCandidate - startCandidate;
      if (scheduledDurationMs <= 0) {
        continue;
      }
      if (!clipped && scheduledDurationMs + 1 < desiredDurationMs) {
        clipped = true;
      }

      const startDate = new Date(startCandidate);
      const endDate = new Date(endCandidate);
      if (!isSyncHabit) {
        if (anchorPreference === "BACK") {
          if (bounds) {
            bounds.back = new Date(startDate);
            if (bounds.front.getTime() > bounds.back.getTime()) {
              bounds.front = new Date(bounds.back);
            }
          } else {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              startDate.getTime(),
              startDate.getTime()
            );
          }
        } else {
          if (bounds) {
            bounds.front = new Date(endDate);
            if (bounds.back.getTime() < bounds.front.getTime()) {
              bounds.back = new Date(bounds.front);
            }
          } else {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              endDate.getTime(),
              endDate.getTime()
            );
          }
        }
      }

      if (isSyncHabit) {
        addSyncUsage(target.key, startDate.getTime(), endDate.getTime());
      }

      const availabilitySnapshot = bounds
        ? {
            front: new Date(bounds.front.getTime()),
            back: new Date(bounds.back.getTime()),
          }
        : null;
      reservations.set(habit.id, {
        habitId: habit.id,
        windowId: window.id,
        windowKey: target.key,
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
        startLocal: target.startLocal,
        endLocal: target.endLocal,
        availableStartLocal: new Date(startDate),
        clipped,
        availabilitySnapshot,
      });
      if (auditEnabled) {
        audit.report.scheduling.dueReservedSuccessfully += 1;
      }
      reserved = true;
      break;
    }
    if (!reserved) {
      continue;
    }
  }

  return reservations;
}

async function scheduleHabitsForDay(params: {
  userId: string;
  habits: HabitScheduleItem[];
  day: Date;
  offset: number;
  timeZone: string;
  availability: Map<string, WindowAvailabilityBounds>;
  baseDate: Date;
  windowCache: Map<string, WindowLite[]>;
  maxGapCache?: Map<string, number>;
  blockerCache?: BlockerCache;
  client: Client;
  sunlightLocation?: GeoCoordinates | null;
  timeZoneOffsetMinutes?: number | null;
  durationMultiplier?: number;
  restMode?: boolean;
  existingInstances: ScheduleInstance[];
  registerInstance: (instance: ScheduleInstance) => void;
  getWindowsForDay: (day: Date) => WindowLite[];
  getLastScheduledHabitStart: (habitId: string) => Date | null;
  recordHabitScheduledStart: (habitId: string, start: Date | string) => void;
  createdThisRun: Set<string>;
  logCancel: (
    reason: string,
    instance: ScheduleInstance | null | undefined,
    meta?: { dayKey?: string | null; dayOffset?: number | null }
  ) => void;
  habitMap: Map<string, HabitScheduleItem>;
  taskContextById: Map<string, string | null>;
  contextTaskCounts: Map<string, number>;
  practiceHistory: Map<string, Date>;
  effectiveLastCompletedAt?: Map<string, string>;
  getProjectGoalMonumentId: (projectId: string) => string | null;
  parity?: FetchWindowsParityOptions | undefined;
  allowScheduling?: boolean;
  reservedPlacements?: Map<string, HabitReservation>;
  audit?: HabitAuditTracker;
  nonDailyHabitIds?: Set<string>;
  nonDailyReplacementInstanceIds?: Set<string>;
  debugEnabled?: boolean;
}): Promise<HabitScheduleDayResult> {
  const {
    userId,
    habits,
    day,
    offset,
    timeZone,
    availability,
    baseDate,
    windowCache,
    maxGapCache,
    blockerCache,
    client,
    sunlightLocation,
    timeZoneOffsetMinutes = null,
    durationMultiplier = 1,
    restMode = false,
    existingInstances,
    registerInstance,
    getWindowsForDay,
    getLastScheduledHabitStart,
    recordHabitScheduledStart,
    createdThisRun,
    logCancel,
    habitMap,
    taskContextById,
    contextTaskCounts,
    practiceHistory,
    effectiveLastCompletedAt = new Map<string, string>(),
    getProjectGoalMonumentId,
    parity,
    allowScheduling = true,
    reservedPlacements,
    audit,
    nonDailyHabitIds,
    nonDailyReplacementInstanceIds,
    debugEnabled = false,
  } = params;

  const result: HabitScheduleDayResult = {
    placements: [],
    instances: [],
    failures: [],
  };
  const reservedByInstanceId = new Map<
    string,
    {
      windowId: string;
      windowKey: string;
      startUTC: string;
      endUTC: string;
      availabilitySnapshot: { front: Date; back: Date } | null;
    }
  >();
  const locationMismatchRequeue = new Map<string, ScheduleInstance>();
  const placedSoFar: ScheduleInstance[] = [];
  const overridesToClear = new Set<string>();
  const clearHabitOverrides = async () => {
    if (!client || overridesToClear.size === 0) return;
    const ids = Array.from(overridesToClear);
    if (ids.length === 0) return;
    try {
      await client
        .from("habits")
        .update({ next_due_override: null })
        .in("id", ids)
        .eq("user_id", userId);
    } catch (error) {
      log("error", "Failed to clear habit due overrides", error);
    } finally {
      overridesToClear.clear();
    }
  };
  if (!habits.length) {
    await clearHabitOverrides();
    return result;
  }

  const registerReservationForInstance = (
    instanceId: string | null | undefined,
    reservation: HabitReservation | null | undefined
  ) => {
    if (!instanceId || !reservation) return;
    reservedByInstanceId.set(instanceId, {
      windowId: reservation.windowId,
      windowKey: reservation.windowKey,
      startUTC: new Date(reservation.startMs).toISOString(),
      endUTC: new Date(reservation.endMs).toISOString(),
      availabilitySnapshot: reservation.availabilitySnapshot ?? null,
    });
  };
  const restoreAvailabilityForInstance = (
    instanceId: string | null | undefined
  ) => {
    if (!instanceId) return;
    const reservation = reservedByInstanceId.get(instanceId);
    if (!reservation) return;
    if (reservation.availabilitySnapshot) {
      availability.set(reservation.windowKey, {
        front: new Date(reservation.availabilitySnapshot.front.getTime()),
        back: new Date(reservation.availabilitySnapshot.back.getTime()),
      });
    } else {
      availability.delete(reservation.windowKey);
    }
    reservedByInstanceId.delete(instanceId);
  };

  const canceledInstanceIds = new Set<string>();
  const cancelScheduledInstance = async (instance: ScheduleInstance) => {
    if (!instance?.id) return false;
    try {
      const cancel = await client
        .from("schedule_instances")
        .update({ status: "canceled" })
        .eq("id", instance.id)
        .select("id")
        .single();
      if (cancel.error) {
        result.failures.push({
          itemId: instance.source_id ?? instance.id,
          reason: "error",
          detail: cancel.error,
        });
        return false;
      }
      canceledInstanceIds.add(instance.id);
      restoreAvailabilityForInstance(instance.id);
      return true;
    } catch (error) {
      log(
        "error",
        "Failed to cancel habit instance during revalidation",
        error
      );
      result.failures.push({
        itemId: instance.source_id ?? instance.id,
        reason: "error",
        detail: error,
      });
      return false;
    }
  };
  const missScheduledInstance = async (
    instance: ScheduleInstance,
    reason?: string
  ) => {
    if (!instance?.id) return false;
    try {
      const payload = {
        status: "missed",
        ...(reason ? { missed_reason: reason } : {}),
      } as Database["public"]["Tables"]["schedule_instances"]["Update"];
      const miss = await client
        .from("schedule_instances")
        .update(payload)
        .eq("id", instance.id)
        .select("id")
        .single();
      if (miss.error) {
        result.failures.push({
          itemId: instance.source_id ?? instance.id,
          reason: "error",
          detail: miss.error,
        });
        return false;
      }
      restoreAvailabilityForInstance(instance.id);
      return true;
    } catch (error) {
      log(
        "error",
        "Failed to mark habit instance missed during revalidation",
        error
      );
      result.failures.push({
        itemId: instance.source_id ?? instance.id,
        reason: "error",
        detail: error,
      });
      return false;
    }
  };

  const zone = timeZone || "UTC";
  const dayStart = startOfDayInTimeZone(day, zone);
  const dayEnd = addDaysInTimeZone(dayStart, 1, zone);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();
  const dayKey = dateCacheKey(day);
  const dayOffset = offset;
  const loggedCancelIds = new Set<string>();
  const logCancelOnce = (
    reason: string,
    instance: ScheduleInstance | null | undefined
  ) => {
    const id = instance?.id ?? null;
    if (!id || loggedCancelIds.has(id)) return;
    loggedCancelIds.add(id);
    logCancel(reason, instance, { dayKey, dayOffset });
  };
  const defaultDueMs = dayStart.getTime();
  const baseNowMs = offset === 0 ? baseDate.getTime() : null;
  const auditEnabled = Boolean(audit?.enabled && offset === 0);
  const anchorStartsByWindowKey = new Map<string, number[]>();
  const dueInfoByHabitId = new Map<string, HabitDueEvaluation>();
  const existingByHabitId = new Map<string, ScheduleInstance>();
  const scheduledHabitBuckets = new Map<string, ScheduleInstance[]>();
  const carryoverInstances: ScheduleInstance[] = [];
  const duplicatesToCancel: ScheduleInstance[] = [];
  const syncUsageByWindow = new Map<string, { start: number; end: number }[]>();
  const anchorSegmentsByWindowKey = new Map<
    string,
    { start: number; end: number }[]
  >();
  const habitTypeById = new Map<string, string>();
  const repeatablePracticeIds = new Set<string>();
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    habitTypeById.set(habit.id, normalizedType);
    if (normalizedType === "PRACTICE") {
      const recurrenceRaw =
        typeof habit.recurrence === "string"
          ? habit.recurrence.toLowerCase().trim()
          : "";
      if (!recurrenceRaw || recurrenceRaw === "none") {
        repeatablePracticeIds.add(habit.id);
      }
    }
  }
  const recordDueEvaluationForAudit = (
    habit: HabitScheduleItem,
    dueInfo: HabitDueEvaluation
  ) => {
    if (!auditEnabled) return;
    if (dueInfo.isDue) {
      audit.report.dueEvaluation.dueCount += 1;
    } else {
      audit.recordNotDue(dueInfo.debugTag);
    }
  };

  const addSyncUsage = (key: string, startMs: number, endMs: number) => {
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    )
      return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    const existing = syncUsageByWindow.get(key);
    if (!existing) {
      syncUsageByWindow.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      return;
    }
    const nearDuplicate = existing.some(
      (segment) =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    );
    if (nearDuplicate) return;
    let inserted = false;
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, {
          start: normalizedStart,
          end: normalizedEnd,
        });
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd });
    }
  };

  const addAnchorSegment = (key: string, startMs: number, endMs: number) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    if (normalizedEnd <= normalizedStart) return;
    const existing = anchorSegmentsByWindowKey.get(key);
    if (!existing) {
      anchorSegmentsByWindowKey.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      return;
    }
    const nearDuplicate = existing.some(
      (segment) =>
        Math.abs(segment.start - normalizedStart) < 30 &&
        Math.abs(segment.end - normalizedEnd) < 30
    );
    if (nearDuplicate) return;
    let inserted = false;
    for (let index = 0; index < existing.length; index += 1) {
      if (normalizedStart < existing[index].start) {
        existing.splice(index, 0, {
          start: normalizedStart,
          end: normalizedEnd,
        });
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      existing.push({ start: normalizedStart, end: normalizedEnd });
    }
  };

  const getSyncOverlapConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => {
    const events: Array<{ time: number; delta: number }> = [];
    for (const segment of segments) {
      const overlapStart = Math.max(startMs, segment.start);
      const overlapEnd = Math.min(endMs, segment.end);
      if (overlapEnd <= overlapStart) continue;
      events.push({ time: overlapStart, delta: 1 });
      events.push({ time: overlapEnd, delta: -1 });
    }
    if (events.length === 0) return null;
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);
    let active = 0;
    let prevTime = startMs;
    let conflictStart: number | null = null;
    let index = 0;
    while (index < events.length) {
      const time = events[index].time;
      if (active >= 2 && time > prevTime && conflictStart === null) {
        conflictStart = prevTime;
      }
      if (active < 2 && conflictStart !== null) {
        return { start: conflictStart, end: prevTime };
      }
      while (index < events.length && events[index].time === time) {
        active += events[index].delta;
        index += 1;
      }
      prevTime = time;
    }
    if (active >= 2) {
      if (conflictStart === null) {
        conflictStart = prevTime;
      }
      return { start: conflictStart, end: endMs };
    }
    if (conflictStart !== null) {
      return { start: conflictStart, end: prevTime };
    }
    return null;
  };

  const hasSyncOverlap = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => getSyncOverlapConflict(startMs, endMs, segments) !== null;

  const findFirstSyncConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => getSyncOverlapConflict(startMs, endMs, segments);

  for (const inst of existingInstances) {
    if (!inst) continue;
    if (inst.source_type !== "HABIT" || inst.status !== "scheduled") {
      carryoverInstances.push(inst);
      continue;
    }
    const habitId = inst.source_id ?? null;
    if (!habitId) {
      carryoverInstances.push(inst);
      continue;
    }
    const bucket = scheduledHabitBuckets.get(habitId);
    if (bucket) {
      bucket.push(inst);
    } else {
      scheduledHabitBuckets.set(habitId, [inst]);
    }
  }

  const startValueForInstance = (instance: ScheduleInstance) => {
    const time = new Date(instance.start_utc ?? "").getTime();
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  };

  for (const [habitId, bucket] of scheduledHabitBuckets) {
    bucket.sort((a, b) => startValueForInstance(a) - startValueForInstance(b));
    const isNonDailyHabit = Boolean(nonDailyHabitIds?.has(habitId));
    if (repeatablePracticeIds.has(habitId)) {
      // For repeatable practices, only keep locked instances
      for (const instance of bucket) {
        if (instance.locked === true) {
          existingByHabitId.set(habitId, instance);
          carryoverInstances.push(instance);
        } else {
          duplicatesToCancel.push(instance);
        }
      }
      continue;
    }
    // For non-repeatable habits, only keep the earliest locked instance
    const lockedInstances = bucket.filter((inst) => inst.locked === true);
    if (lockedInstances.length > 0) {
      const keeper = lockedInstances[0];
      existingByHabitId.set(habitId, keeper);
      carryoverInstances.push(keeper);
      // Cancel non-locked instances
      for (const instance of bucket) {
        if (instance !== keeper) {
          duplicatesToCancel.push(instance);
        }
      }
    } else {
      if (isNonDailyHabit && bucket.length > 0) {
        const replacementInstances =
          nonDailyReplacementInstanceIds && nonDailyReplacementInstanceIds.size
            ? bucket.filter(
                (inst) => inst.id && nonDailyReplacementInstanceIds.has(inst.id)
              )
            : [];
        const keeper =
          replacementInstances.length > 0 ? replacementInstances[0] : bucket[0];
        existingByHabitId.set(habitId, keeper);
        carryoverInstances.push(keeper);
        for (const instance of bucket) {
          if (instance !== keeper) {
            duplicatesToCancel.push(instance);
          }
        }
      } else {
        // No locked instances, cancel all
        duplicatesToCancel.push(...bucket);
      }
    }
  }

  existingInstances.length = 0;
  for (const inst of carryoverInstances) {
    existingInstances.push(inst);
  }

  const dayInstances = existingInstances
    .map((inst) => ({ ...inst }))
    .filter((inst) => !canceledInstanceIds.has(inst?.id ?? ""));

  const practiceOverflowInstances: ScheduleInstance[] = [];
  if (offset >= PRACTICE_LOOKAHEAD_DAYS) {
    for (let index = dayInstances.length - 1; index >= 0; index -= 1) {
      const instance = dayInstances[index];
      if (!instance) continue;
      if (instance.source_type !== "HABIT") continue;
      if (instance.status !== "scheduled") continue;
      const habitId = instance.source_id ?? null;
      if (!habitId) continue;
      const normalizedType =
        habitTypeById.get(habitId) ??
        normalizeHabitTypeValue(habitMap.get(habitId)?.habitType);
      if (normalizedType !== "PRACTICE") continue;
      practiceOverflowInstances.push(instance);
      dayInstances.splice(index, 1);
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId);
      }
    }
    if (practiceOverflowInstances.length > 0) {
      for (const overflow of practiceOverflowInstances) {
        if (!overflow?.id) continue;
        logCancelOnce("PRACTICE_OVERFLOW_CANCEL", overflow);
        const canceled = await cancelScheduledInstance(overflow);
        if (canceled) {
          overflow.status = "canceled";
        }
      }
    }
  }

  const cacheKey = dateCacheKey(day);
  let windows = windowCache.get(cacheKey);
  if (!windows) {
    windows = getWindowsForDay(day);
    windowCache.set(cacheKey, windows);
  }

  if (!windows || windows.length === 0) {
    if (auditEnabled) {
      for (const habit of habits) {
        const windowDays = habit.window?.days ?? null;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone: zone,
          windowDays,
          lastScheduledStart: repeatablePracticeIds.has(habit.id)
            ? null
            : getLastScheduledHabitStart(habit.id),
          nextDueOverride,
        });
        recordDueEvaluationForAudit(habit, dueInfo);
        if (!dueInfo.isDue) continue;
        if (repeatablePracticeIds.has(habit.id)) {
          audit.report.scheduling.dueSkipped_RepeatablePracticeNoWindows += 1;
          audit.addSample("dueSkipped_RepeatablePracticeNoWindows", habit.id);
          continue;
        }
        audit.report.scheduling.dueFailed_WindowMissing += 1;
        audit.addSample("dueFailed_WindowMissing", habit.id);
      }
    }
    await clearHabitOverrides();
    return result;
  }

  const windowsById = new Map<string, WindowLite>();
  for (const win of windows) {
    windowsById.set(win.id, win);
  }

  const invalidHabitInstances: ScheduleInstance[] = [];
  const typeMismatchInstances: ScheduleInstance[] = [];
  const seenInvalidIds = new Set<string>();
  for (let index = dayInstances.length - 1; index >= 0; index -= 1) {
    const instance = dayInstances[index];
    if (!instance) continue;
    if (instance.source_type !== "HABIT") continue;
    if (instance.status !== "scheduled") continue;
    const habitId = instance.source_id ?? null;
    if (!habitId) continue;
    const habit = habitMap.get(habitId);
    if (!habit) continue;
    const windowRecord = instance.window_id
      ? (windowsById.get(instance.window_id) ?? null)
      : null;
    const hasLocationMatch = doesWindowMatchHabitLocation(habit, windowRecord);
    if (!hasLocationMatch) {
      if (instance.id && createdThisRun.has(instance.id)) {
        continue;
      }
      const reservation = reservedPlacements?.get(habitId) ?? null;
      if (reservation && instance.id) {
        registerReservationForInstance(instance.id, reservation);
        reservedPlacements?.delete(habitId);
      }
      logCancelOnce("REVALIDATION_LOCATION_REQUEUE_CANCEL", instance);
      const canceled = await cancelScheduledInstance(instance);
      if (canceled) {
        instance.status = "canceled";
        if (!locationMismatchRequeue.has(habitId)) {
          locationMismatchRequeue.set(habitId, instance);
        }
      }
      dayInstances.splice(index, 1);
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId);
      }
      continue;
    }
    const hasWindowTypeMatch = doesWindowAllowHabitType(habit, windowRecord);
    if (!hasWindowTypeMatch) {
      if (instance.id && createdThisRun.has(instance.id)) {
        continue;
      }
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:window_kind`)) {
        typeMismatchInstances.push(instance);
        seenInvalidIds.add(instance.id ?? `${habitId}:window_kind`);
      }
      dayInstances.splice(index, 1);
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId);
      }
      continue;
    }
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const instanceStart = new Date(instance.start_utc ?? "");
    if (Number.isNaN(instanceStart.getTime())) continue;
    const instanceDayStart = startOfDayInTimeZone(instanceStart, zone);
    if (instanceDayStart.getTime() !== dayStart.getTime()) continue;
    const windowDays = habit.window?.days ?? null;
    const lastScheduledStart = getLastScheduledHabitStart(habitId);
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: instanceDayStart,
      timeZone: zone,
      windowDays,
      lastScheduledStart,
      nextDueOverride,
    });
    if (!dueInfo.isDue) {
      if (instance.id && createdThisRun.has(instance.id)) {
        continue;
      }
      if (SCHEDULER_DEBUG_LOGGING) {
        logSchedulerDebug("[SCHEDULER_HABIT_REVALIDATION_CANCEL]", {
          habit_id: habitId,
          instance_id: instance.id ?? null,
          instance_start_utc: instance.start_utc ?? null,
          day_offset: offset,
          day_start_utc: dayStart.toISOString(),
          time_zone: zone,
          due_info: dueInfo,
          inputs: {
            lastCompletedAt: habit.lastCompletedAt ?? null,
            lastScheduledStart: lastScheduledStart?.toISOString?.() ?? null,
            recurrence: habit.recurrence ?? null,
            recurrenceDays: habit.recurrenceDays ?? null,
          },
        });
      }
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:${index}`)) {
        invalidHabitInstances.push(instance);
        seenInvalidIds.add(instance.id ?? `${habitId}:${index}`);
      }
      dayInstances.splice(index, 1);
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId);
      }
      continue;
    }
    recordHabitScheduledStart(habitId, instanceStart);
  }

  if (invalidHabitInstances.length > 0) {
    for (const invalidInstance of invalidHabitInstances) {
      logCancelOnce("REVALIDATION_DUE_INVALID", invalidInstance);
    }
    duplicatesToCancel.push(...invalidHabitInstances);
  }
  if (typeMismatchInstances.length > 0) {
    for (const mismatch of typeMismatchInstances) {
      logCancelOnce("REVALIDATION_WINDOW_KIND", mismatch);
    }
    duplicatesToCancel.push(...typeMismatchInstances);
  }

  if (duplicatesToCancel.length > 0) {
    for (const duplicate of duplicatesToCancel) {
      if (!duplicate?.id) continue;
      logCancelOnce("REVALIDATION_DUPLICATE_CANCEL", duplicate);
      const cancel = await client
        .from("schedule_instances")
        .update({ status: "canceled" })
        .eq("id", duplicate.id)
        .select("id")
        .single();

      if (cancel.error) {
        result.failures.push({
          itemId: duplicate.source_id ?? duplicate.id,
          reason: "error",
          detail: cancel.error,
        });
      } else {
        duplicate.status = "canceled";
      }
    }
  }

  if (!allowScheduling && auditEnabled) {
    for (const habit of habits) {
      const windowDays = habit.window?.days ?? null;
      const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
      const dueInfo = evaluateHabitDueOnDate({
        habit,
        date: day,
        timeZone: zone,
        windowDays,
        lastScheduledStart: repeatablePracticeIds.has(habit.id)
          ? null
          : getLastScheduledHabitStart(habit.id),
        nextDueOverride,
      });
      recordDueEvaluationForAudit(habit, dueInfo);
    }
  }

  for (const inst of dayInstances) {
    if (!inst || inst.status !== "scheduled") continue;
    if (inst.source_type === "PROJECT") continue;
    placedSoFar.push(inst);
  }

  const practiceInstanceQueues = new Map<string, ScheduleInstance[]>();
  if (repeatablePracticeIds.size > 0) {
    for (const instance of dayInstances) {
      if (!instance || instance.source_type !== "HABIT") continue;
      const habitId = instance.source_id ?? null;
      if (!habitId || !repeatablePracticeIds.has(habitId)) continue;
      const queue = practiceInstanceQueues.get(habitId);
      if (queue) {
        queue.push(instance);
      } else {
        practiceInstanceQueues.set(habitId, [instance]);
      }
    }
    for (const queue of practiceInstanceQueues.values()) {
      queue.sort((a, b) => startValueForInstance(a) - startValueForInstance(b));
    }
  }
  const takeExistingPracticeInstance = (habitId: string) => {
    const queue = practiceInstanceQueues.get(habitId);
    if (!queue || queue.length === 0) {
      practiceInstanceQueues.delete(habitId);
      return null;
    }
    const nextInstance = queue.shift() ?? null;
    if (!queue.length) {
      practiceInstanceQueues.delete(habitId);
    }
    return nextInstance ?? null;
  };

  const dueHabits: HabitScheduleItem[] = [];
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    if (normalizedType === "PRACTICE") {
      if (process.env.NODE_ENV === "test" && habit.id === "habit-practice") {
        logSchedulerDebug("practice offset check", { offset });
      }
    }
    if (normalizedType === "PRACTICE" && offset >= PRACTICE_LOOKAHEAD_DAYS) {
      if (process.env.NODE_ENV === "test" && habit.id === "habit-practice") {
        logSchedulerDebug("skip practice due to offset", offset);
      }
      continue;
    }
    // Exclude SYNC/ASYNC habits from regular habit scheduling - they get post-pass treatment
    if (normalizedType === "SYNC") {
      continue;
    }
    const windowDays = habit.window?.days ?? null;
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const overrideDayStart = nextDueOverride
      ? startOfDayInTimeZone(nextDueOverride, zone)
      : null;
    // Use effective lastCompletedAt if more recent than habit's lastCompletedAt
    const effectiveLastCompletedAtForHabit = effectiveLastCompletedAt.get(
      habit.id
    );
    const habitWithEffectiveLastCompletedAt = {
      ...habit,
      lastCompletedAt:
        effectiveLastCompletedAtForHabit || habit.lastCompletedAt,
    };
    const dueInfo = evaluateHabitDueOnDate({
      habit: habitWithEffectiveLastCompletedAt,
      date: day,
      timeZone: zone,
      windowDays,
      lastScheduledStart: repeatablePracticeIds.has(habit.id)
        ? null
        : getLastScheduledHabitStart(habit.id),
      nextDueOverride,
    });
    recordDueEvaluationForAudit(habit, dueInfo);
    if (
      normalizedType === "PRACTICE" &&
      process.env.NODE_ENV === "test" &&
      habit.id === "habit-practice"
    ) {
      logSchedulerDebug("practice due info", { offset, isDue: dueInfo.isDue });
    }
    if (!dueInfo.isDue) continue;
    if (overrideDayStart) {
      const overrideMs = overrideDayStart.getTime();
      const dayMs = dayStart.getTime();
      if (dayMs > overrideMs || (dayMs === overrideMs && dueInfo.isDue)) {
        overridesToClear.add(habit.id);
      }
    }
    dueInfoByHabitId.set(habit.id, dueInfo);
    dueHabits.push(habit);
  }

  if (dueHabits.length === 0) {
    await clearHabitOverrides();
    return result;
  }

  const windowEntries = windows
    .map((win) => {
      const startLocal = resolveWindowStart(win, day, zone);
      const endLocal = resolveWindowEnd(win, day, zone);
      const startMs = startLocal.getTime();
      const endMs = endLocal.getTime();
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        return null;
      }
      const descriptor = describeAvailabilityWindow(win, startLocal, endLocal);
      const key = getAvailabilityWindowKey(descriptor);
      return {
        window: win,
        startLocal,
        endLocal,
        startMs,
        endMs,
        key,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        window: WindowLite;
        startLocal: Date;
        endLocal: Date;
        startMs: number;
        endMs: number;
        key: string;
      } => entry !== null
    );

  const windowEntriesByKey = new Map<string, typeof windowEntries>();
  for (const entry of windowEntries) {
    addAnchorStart(anchorStartsByWindowKey, entry.key, entry.startMs);
    const existing = windowEntriesByKey.get(entry.key);
    if (existing) {
      existing.push(entry);
    } else {
      windowEntriesByKey.set(entry.key, [entry]);
    }
  }

  if (windowEntries.length > 0 && dayInstances.length > 0) {
    const anchorableStatuses = new Set([
      "scheduled",
      "completed",
      "in_progress",
    ]);
    for (const instance of dayInstances) {
      if (!instance) continue;
      if (!anchorableStatuses.has(instance.status ?? "")) continue;
      const start = new Date(instance.start_utc ?? "");
      const end = new Date(instance.end_utc ?? "");
      const startMs = start.getTime();
      const endMs = end.getTime();
      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        endMs <= startMs
      ) {
        continue;
      }
      const habitId = instance.source_id ?? null;
      const habitType = habitId ? (habitTypeById.get(habitId) ?? null) : null;
      const isSyncInstance = habitType === "SYNC";
      const instanceKey = getAvailabilityWindowKey({
        dayTypeTimeBlockId:
          (instance as any).day_type_time_block_id ??
          (instance as any).dayTypeTimeBlockId ??
          null,
        windowId: instance.window_id ?? null,
        timeBlockId: instance.time_block_id ?? null,
        startUtc: instance.start_utc ?? null,
        endUtc: instance.end_utc ?? null,
      });
      const candidateEntries =
        windowEntriesByKey.get(instanceKey) ?? windowEntries;
      for (const entry of candidateEntries) {
        if (
          !overlapsHalfOpen(
            entry.startMs,
            entry.endMs,
            startMs,
            endMs
          )
        ) {
          continue;
        }
        const anchorStart = Math.max(entry.startMs, startMs);
        if (anchorStart < entry.endMs) {
          addAnchorStart(anchorStartsByWindowKey, entry.key, anchorStart);
          if (isSyncInstance) {
            const segmentStart = Math.max(entry.startMs, startMs);
            const segmentEnd = Math.min(entry.endMs, endMs);
            addSyncUsage(entry.key, segmentStart, segmentEnd);
          } else {
            const segmentStart = Math.max(entry.startMs, startMs);
            const segmentEnd = Math.min(entry.endMs, endMs);
            addAnchorSegment(entry.key, segmentStart, segmentEnd);
          }
        }
      }
    }
  }

  const sunlightOptions =
    typeof timeZoneOffsetMinutes === "number"
      ? { offsetMinutes: timeZoneOffsetMinutes }
      : undefined;
  const sunlightToday = resolveSunlightBounds(
    day,
    zone,
    sunlightLocation,
    sunlightOptions
  );
  const previousDay = addDaysInTimeZone(day, -1, zone);
  const nextDay = addDaysInTimeZone(day, 1, zone);
  const sunlightPrevious = resolveSunlightBounds(
    previousDay,
    zone,
    sunlightLocation,
    sunlightOptions
  );
  const sunlightNext = resolveSunlightBounds(
    nextDay,
    zone,
    sunlightLocation,
    sunlightOptions
  );

  const sortedHabits = [...dueHabits].sort((a, b) => {
    const dueA = dueInfoByHabitId.get(a.id);
    const dueB = dueInfoByHabitId.get(b.id);
    const dueDiff =
      (dueA?.dueStart?.getTime() ?? defaultDueMs) -
      (dueB?.dueStart?.getTime() ?? defaultDueMs);
    if (dueDiff !== 0) return dueDiff;
    const typeDiff =
      habitTypePriority(a.habitType) - habitTypePriority(b.habitType);
    if (typeDiff !== 0) return typeDiff;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.name.localeCompare(b.name);
  });

  const practicePlacementCounts = new Map<string, number>();
  const failedHabitIds = new Set<string>();
  const habitQueue = [...sortedHabits];
  while (habitQueue.length > 0) {
    const habit = habitQueue.shift();
    if (!habit) continue;
    if (failedHabitIds.has(habit.id)) continue;
    const isRepeatablePractice = repeatablePracticeIds.has(habit.id);
    let existingInstance: ScheduleInstance | null = null;
    if (isRepeatablePractice) {
      existingInstance = takeExistingPracticeInstance(habit.id);
    } else {
      existingInstance = existingByHabitId.get(habit.id) ?? null;
    }
    const rawDuration = Number(habit.durationMinutes ?? 0);
    let durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : DEFAULT_HABIT_DURATION_MIN;
    if (durationMultiplier !== 1) {
      durationMin = Math.max(1, Math.round(durationMin * durationMultiplier));
    }
    const baseDurationMs = durationMin * 60000;
    if (baseDurationMs <= 0) continue;
    let scheduledDurationMs = baseDurationMs;

    const resolvedEnergy = (
      habit.energy ??
      habit.window?.energy ??
      "NO"
    ).toUpperCase();
    const locationContextSource = habit.locationContextValue ?? null;
    const normalizedLocationContext =
      locationContextSource && typeof locationContextSource === "string"
        ? locationContextSource.toUpperCase().trim()
        : null;
    const locationContext =
      normalizedLocationContext === "ANY" ? null : normalizedLocationContext;
    const locationContextIdRaw = habit.locationContextId ?? null;
    const locationContextId =
      typeof locationContextIdRaw === "string" &&
      locationContextIdRaw.trim().length > 0
        ? locationContextIdRaw.trim()
        : null;
    const hasExplicitLocationContext =
      (typeof habit.locationContextId === "string" &&
        habit.locationContextId.trim().length > 0) ||
      (typeof habit.locationContextValue === "string" &&
        habit.locationContextValue.trim().length > 0 &&
        habit.locationContextValue.toUpperCase().trim() !== "ANY");
    const existingWindowRecord = existingInstance?.window_id
      ? (windowsById.get(existingInstance.window_id) ?? null)
      : null;
    const existingWindowLocationId =
      typeof existingWindowRecord?.location_context_id === "string" &&
      existingWindowRecord.location_context_id.trim().length > 0
        ? existingWindowRecord.location_context_id.trim()
        : null;
    const existingWindowLocationValue =
      existingWindowRecord?.location_context_value &&
      existingWindowRecord.location_context_value.length > 0
        ? existingWindowRecord.location_context_value.toUpperCase().trim()
        : null;
    const existingWindowHasLocation =
      Boolean(existingWindowLocationId) || Boolean(existingWindowLocationValue);
    const hasLocationMismatch =
      existingInstance &&
      hasExplicitLocationContext &&
      ((locationContextId && existingWindowLocationId !== locationContextId) ||
        (!locationContextId &&
          locationContext &&
          existingWindowLocationValue !== locationContext));
    const hasLocationlessMismatch =
      existingInstance &&
      !hasExplicitLocationContext &&
      existingWindowHasLocation;
    const hasWindowTypeMismatch =
      existingInstance &&
      !doesWindowAllowHabitType(habit, existingWindowRecord);
    if (hasLocationMismatch || hasLocationlessMismatch) {
      const reservation = reservedPlacements?.get(habit.id) ?? null;
      if (reservation && existingInstance?.id) {
        registerReservationForInstance(existingInstance.id, reservation);
        reservedPlacements?.delete(habit.id);
      }
      logCancelOnce("REVALIDATION_LOCATION_REQUEUE_CANCEL", existingInstance);
      if (await cancelScheduledInstance(existingInstance)) {
        existingByHabitId.delete(habit.id);
        if (!locationMismatchRequeue.has(habit.id)) {
          locationMismatchRequeue.set(habit.id, existingInstance);
        }
        existingInstance = null;
      }
    } else if (hasWindowTypeMismatch) {
      logCancelOnce("REVALIDATION_EXISTING_WINDOW_KIND", existingInstance);
      if (await cancelScheduledInstance(existingInstance)) {
        existingByHabitId.delete(habit.id);
        existingInstance = null;
      }
    }
    const rawDaylight = habit.daylightPreference
      ? String(habit.daylightPreference).toUpperCase().trim()
      : "ALL_DAY";
    const daylightPreference =
      rawDaylight === "DAY" || rawDaylight === "NIGHT"
        ? rawDaylight
        : "ALL_DAY";
    const daylightConstraint =
      daylightPreference === "ALL_DAY"
        ? null
        : {
            preference: daylightPreference as "DAY" | "NIGHT",
            sunrise: sunlightToday.sunrise ?? null,
            sunset: sunlightToday.sunset ?? null,
            dawn: sunlightToday.dawn ?? null,
            dusk: sunlightToday.dusk ?? null,
            previousSunset: sunlightPrevious.sunset ?? null,
            previousDusk: sunlightPrevious.dusk ?? null,
            nextDawn: sunlightNext.dawn ?? sunlightNext.sunrise ?? null,
            nextSunrise: sunlightNext.sunrise ?? null,
          };
    const nightSunlightBundle =
      daylightConstraint?.preference === "NIGHT"
        ? {
            today: sunlightToday,
            previous: sunlightPrevious,
            next: sunlightNext,
          }
        : null;
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    const isSyncHabit = normalizedType === "SYNC";
    const allowsHabitOverlap = isSyncHabit;
    const anchorRaw = habit.windowEdgePreference
      ? String(habit.windowEdgePreference).toUpperCase().trim()
      : "FRONT";
    const anchorPreference = anchorRaw === "BACK" ? "BACK" : "FRONT";
    const allowedWindowKinds: WindowKind[] =
      normalizedType === "RELAXER"
        ? ["DEFAULT", "BREAK"]
        : normalizedType === "PRACTICE"
          ? ["PRACTICE"]
          : ["DEFAULT"];
    let practiceContextId: string | null = null;

    const attemptKeys = new Set<string>();
    const attemptQueue: Array<{
      locationId: string | null;
      locationValue: string | null;
      daylight: DaylightConstraint | null;
      enforceLocation: boolean;
    }> = [];
    const enqueueAttempt = (
      locationId: string | null,
      locationValue: string | null,
      daylight: DaylightConstraint | null,
      options?: { enforceLocation?: boolean }
    ) => {
      const normalizedId =
        locationId && locationId.trim().length > 0 ? locationId.trim() : null;
      const normalizedValue =
        locationValue && locationValue.length > 0
          ? locationValue.toUpperCase().trim()
          : null;
      const enforceLocation = options?.enforceLocation ?? true;
      const key = `${normalizedId ?? "null"}|${normalizedValue ?? "null"}|${
        daylight?.preference ?? "null"
      }|${enforceLocation ? "strict" : "relaxed"}`;
      if (attemptKeys.has(key)) return;
      attemptKeys.add(key);
      attemptQueue.push({
        locationId: normalizedId,
        locationValue: normalizedValue,
        daylight,
        enforceLocation,
      });
    };

    const hasLocationRequirement = Boolean(
      locationContextId || locationContext
    );
    enqueueAttempt(locationContextId, locationContext, daylightConstraint);
    if (hasLocationRequirement) {
      enqueueAttempt(locationContextId, null, daylightConstraint);
      enqueueAttempt(null, locationContext, daylightConstraint);
    } else {
      enqueueAttempt(null, null, daylightConstraint);
    }
    if (daylightConstraint) {
      enqueueAttempt(locationContextId, locationContext, null);
      if (hasLocationRequirement) {
        enqueueAttempt(locationContextId, null, null);
        enqueueAttempt(null, locationContext, null);
      } else {
        enqueueAttempt(null, null, null);
      }
      if (hasLocationRequirement) {
        enqueueAttempt(null, null, daylightConstraint, {
          enforceLocation: false,
        });
        enqueueAttempt(null, null, null, { enforceLocation: false });
      }
    }
    if (!hasLocationRequirement && !daylightConstraint) {
      enqueueAttempt(null, null, null);
    }

    let compatibleWindows: Array<{
      id: string;
      key: string;
      startLocal: Date;
      endLocal: Date;
      availableStartLocal: Date;
    }> = [];
    const reservation = reservedPlacements?.get(habit.id) ?? null;
    let usedReservation = false;
    let reservedStartMs: number | null = null;
    let reservedEndMs: number | null = null;
    let reservedClipped = false;
    if (reservation && windowsById.has(reservation.windowId)) {
      compatibleWindows = [
        {
          id: reservation.windowId,
          key: reservation.windowKey,
          startLocal: reservation.startLocal,
          endLocal: reservation.endLocal,
          availableStartLocal: reservation.availableStartLocal,
        },
      ];
      usedReservation = true;
      reservedStartMs = reservation.startMs;
      reservedEndMs = reservation.endMs;
      reservedClipped = reservation.clipped;
    }

    const nightEligibleWindows =
      daylightConstraint?.preference === "NIGHT"
        ? windows.filter((win) =>
            windowOverlapsNightSpan(
              win,
              day,
              zone,
              sunlightToday,
              sunlightPrevious,
              sunlightNext
            )
          )
        : windows;

    if (!usedReservation) {
      let lastZeroStage: string | null = null;
      for (const attempt of attemptQueue) {
        const clonedAvailability = cloneAvailabilityMap(availability);
        const windowsForAttemptResult = await fetchCompatibleWindowsForItem(
          client,
          day,
          {
            energy: resolvedEnergy,
            duration_min: durationMin,
            habitType: habit.habitType,
            skillId: habit.skillId ?? null,
            skillMonumentId: habit.skillMonumentId ?? null,
          },
          zone,
          {
            availability: clonedAvailability,
            cache: windowCache,
            now: offset === 0 ? baseDate : undefined,
            locationContextId: attempt.locationId,
            locationContextValue: attempt.locationValue,
            daylight: attempt.daylight,
            ignoreAvailability: allowsHabitOverlap,
            anchor: anchorPreference,
            restMode,
            userId,
            parity,
            enforceNightSpan: daylightConstraint?.preference === "NIGHT",
            nightSunlight: nightSunlightBundle,
            requireLocationContextMatch:
              attempt.enforceLocation || !hasExplicitLocationContext,
            hasExplicitLocationContext,
            preloadedWindows:
              attempt.daylight?.preference === "NIGHT"
                ? nightEligibleWindows
                : windows,
            allowedWindowKinds,
            auditZeroStageCallback: auditEnabled
              ? (stage) => {
                  lastZeroStage = stage;
                }
              : undefined,
          }
        );
        const windowsForAttempt = windowsForAttemptResult.windows;
        if (windowsForAttempt.length > 0) {
          adoptAvailabilityMap(availability, clonedAvailability);
          compatibleWindows = windowsForAttempt;
          break;
        }
      }
      if (compatibleWindows.length === 0 && auditEnabled && lastZeroStage) {
        audit.recordWindowZeroStage(lastZeroStage);
      }
    }

    if (compatibleWindows.length === 0) {
      if (isRepeatablePractice) {
        if (auditEnabled) {
          audit.report.scheduling.dueSkipped_RepeatablePracticeNoWindows += 1;
          audit.addSample("dueSkipped_RepeatablePracticeNoWindows", habit.id);
        }
        continue;
      }
      if (auditEnabled) {
        audit.report.scheduling.dueFailed_NoCompatibleWindows += 1;
        audit.addSample("dueFailed_NoCompatibleWindows", habit.id);
      }
      result.failures.push({ itemId: habit.id, reason: "NO_WINDOW" });
      continue;
    }

    let placedInWindow = false;
    let persistFailed = false;
    for (const target of compatibleWindows) {
      const window = windowsById.get(target.id);
      if (!window) {
        continue;
      }

      const bounds = availability.get(target.key);
      const startLimit = target.availableStartLocal.getTime();
      const endLimit = target.endLocal.getTime();
      const windowStartMs = target.startLocal.getTime();
      const startMs = Number.isFinite(startLimit)
        ? startLimit
        : Number.isFinite(windowStartMs)
          ? windowStartMs
          : defaultDueMs;
      let constraintLowerBound = startMs;
      const dueStart = dueInfoByHabitId.get(habit.id)?.dueStart ?? null;
      const dueStartMs = dueStart ? dueStart.getTime() : null;
      if (
        typeof dueStartMs === "number" &&
        Number.isFinite(dueStartMs) &&
        isDailyRecurrenceValue(habit.recurrence ?? null)
      ) {
        constraintLowerBound = Math.max(constraintLowerBound, dueStartMs);
      }
      if (
        typeof baseNowMs === "number" &&
        baseNowMs > constraintLowerBound &&
        baseNowMs < endLimit
      ) {
        constraintLowerBound = baseNowMs;
      }

      const desiredDurationMs = scheduledDurationMs;
      const syncSegments = syncUsageByWindow.get(target.key) ?? [];
      const anchorSegments = anchorSegmentsByWindowKey.get(target.key) ?? [];
      let startCandidate: number | null = usedReservation
        ? reservedStartMs
        : null;
      let endCandidate: number | null = usedReservation ? reservedEndMs : null;
      let clipped = usedReservation ? reservedClipped : false;

      if (isSyncHabit && anchorSegments.length > 0) {
        const safeWindowStart = Number.isFinite(windowStartMs)
          ? windowStartMs
          : startMs;
        const earliestStart = Math.max(safeWindowStart, constraintLowerBound);
        const searchStart =
          typeof baseNowMs === "number"
            ? Math.max(earliestStart, baseNowMs)
            : earliestStart;
        const segments = anchorSegments.filter(
          (segment) => segment.end > safeWindowStart && segment.start < endLimit
        );
        const GAP_TOLERANCE_MS = 60000;
        let index = 0;
        while (index < segments.length && segments[index].end <= searchStart) {
          index += 1;
        }
        if (index < segments.length) {
          let alignedStart = Math.max(segments[index].start, safeWindowStart);
          if (typeof baseNowMs === "number") {
            alignedStart = Math.max(alignedStart, baseNowMs);
          }
          if (alignedStart < segments[index].end) {
            let coverageEnd = Math.min(segments[index].end, endLimit);
            let totalCoverage = coverageEnd - alignedStart;
            let cursor = index;
            while (
              totalCoverage < desiredDurationMs &&
              cursor + 1 < segments.length
            ) {
              const nextSegment = segments[cursor + 1];
              if (
                nextSegment.start > coverageEnd + GAP_TOLERANCE_MS ||
                nextSegment.start >= endLimit
              ) {
                break;
              }
              coverageEnd = Math.min(
                Math.max(coverageEnd, nextSegment.end),
                endLimit
              );
              totalCoverage = coverageEnd - alignedStart;
              cursor += 1;
            }
            if (
              coverageEnd > alignedStart &&
              !hasSyncOverlap(alignedStart, coverageEnd, syncSegments)
            ) {
              startCandidate = alignedStart;
              endCandidate = coverageEnd;
              if (totalCoverage + 1 < desiredDurationMs) {
                clipped = true;
              }
            }
          }
        }
      }

      const latestStartAllowedFallback = endLimit - scheduledDurationMs;

      if (startCandidate === null || endCandidate === null) {
        const latestStartAllowed = latestStartAllowedFallback;
        let candidateStart = Math.max(startLimit, constraintLowerBound);
        if (isSyncHabit) {
          const safeWindowStart = Number.isFinite(windowStartMs)
            ? windowStartMs
            : startMs;
          candidateStart = Math.max(candidateStart, safeWindowStart);
          if (typeof baseNowMs === "number") {
            candidateStart = Math.max(candidateStart, baseNowMs);
          }
        } else if (
          typeof baseNowMs === "number" &&
          baseNowMs > candidateStart &&
          baseNowMs < endLimit
        ) {
          if (anchorPreference === "BACK") {
            const latestStart = endLimit - scheduledDurationMs;
            const desiredStart = Math.min(latestStart, baseNowMs);
            candidateStart = Math.max(startLimit, desiredStart);
          } else {
            candidateStart = baseNowMs;
          }
        }

        if (candidateStart >= endLimit) {
          if (!allowsHabitOverlap) {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              endLimit,
              endLimit
            );
          }
          continue;
        }

        if (candidateStart > latestStartAllowed) {
          if (!allowsHabitOverlap) {
            if (bounds) {
              if (anchorPreference === "BACK") {
                const clamped = Math.max(
                  bounds.front.getTime(),
                  latestStartAllowed
                );
                bounds.back = new Date(clamped);
                if (bounds.back.getTime() < bounds.front.getTime()) {
                  bounds.front = new Date(bounds.back);
                }
              } else {
                bounds.front = new Date(endLimit);
                if (bounds.back.getTime() < bounds.front.getTime()) {
                  bounds.back = new Date(bounds.front);
                }
              }
            } else {
              setAvailabilityBoundsForKey(
                availability,
                target.key,
                endLimit,
                endLimit
              );
            }
          }
          continue;
        }

        let candidateEnd = candidateStart + scheduledDurationMs;
        let candidateClipped = false;
        if (candidateEnd > endLimit) {
          candidateEnd = endLimit;
          candidateClipped = true;
        }
        const crossMidnightClamp = clampEndToLocalDay(
          candidateStart,
          candidateEnd,
          zone,
          window.fromPrevDay === true
        );
        if (crossMidnightClamp.clamped) {
          candidateEnd = crossMidnightClamp.endMs;
          candidateClipped = true;
        }
        if (candidateEnd <= candidateStart) {
          if (!allowsHabitOverlap) {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              candidateEnd,
              candidateEnd
            );
            if (bounds) {
              if (anchorPreference === "BACK") {
                bounds.back = new Date(
                  Math.max(bounds.front.getTime(), candidateStart)
                );
                if (bounds.back.getTime() < bounds.front.getTime()) {
                  bounds.front = new Date(bounds.back);
                }
              } else {
                bounds.front = new Date(candidateEnd);
                if (bounds.back.getTime() < bounds.front.getTime()) {
                  bounds.back = new Date(bounds.front);
                }
              }
            }
          }
          continue;
        }

        if (
          isSyncHabit &&
          hasSyncOverlap(candidateStart, candidateEnd, syncSegments)
        ) {
          let adjustedStart = candidateStart;
          let adjustedEnd = candidateEnd;
          let guard = 0;
          while (hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)) {
            const conflict = findFirstSyncConflict(
              adjustedStart,
              adjustedEnd,
              syncSegments
            );
            if (!conflict) break;
            adjustedStart = Math.max(conflict.end, adjustedStart + 1);
            if (adjustedStart > latestStartAllowed) break;
            adjustedEnd = adjustedStart + scheduledDurationMs;
            if (adjustedEnd > endLimit) {
              adjustedEnd = endLimit;
              candidateClipped = true;
            }
            guard += 1;
            if (guard > syncSegments.length + 4) break;
          }
          if (
            adjustedStart > latestStartAllowed ||
            adjustedEnd <= adjustedStart ||
            hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)
          ) {
            continue;
          }
          candidateStart = adjustedStart;
          candidateEnd = adjustedEnd;
        }
        const postSyncClamp = clampEndToLocalDay(
          candidateStart,
          candidateEnd,
          zone,
          window.fromPrevDay === true
        );
        if (postSyncClamp.clamped) {
          candidateEnd = postSyncClamp.endMs;
          candidateClipped = true;
        }
        if (candidateEnd <= candidateStart) {
          continue;
        }

        startCandidate = candidateStart;
        endCandidate = candidateEnd;
        clipped = candidateClipped;
      }

      if (startCandidate === null || endCandidate === null) {
        continue;
      }
      if (
        hasBlockingHabitOverlap({
          candidateIsSync: isSyncHabit,
          candidateId: existingInstance?.id ?? null,
          startMs: startCandidate,
          endMs: endCandidate,
          existingInstances: placedSoFar,
          habitTypeById,
        })
      ) {
        continue;
      }

      if (normalizedType === "PRACTICE") {
        const habitSkillContextId = habit.skillMonumentId ?? null;
        if (habitSkillContextId) {
          practiceContextId = habitSkillContextId;
        } else {
          const contextCounts = countContextEventsBefore(
            dayInstances,
            startCandidate,
            dayStartMs,
            dayEndMs,
            habitMap,
            taskContextById,
            getProjectGoalMonumentId
          );
          const lastPracticeContextId = findLastPracticeContextBefore(
            dayInstances,
            startCandidate,
            habitTypeById,
            habitMap,
            taskContextById,
            getProjectGoalMonumentId
          );
          const candidateSet = new Set<string>();
          for (const contextId of contextTaskCounts.keys()) {
            if (contextId) {
              candidateSet.add(contextId);
            }
          }
          for (const contextId of contextCounts.keys()) {
            if (contextId) {
              candidateSet.add(contextId);
            }
          }
          for (const contextId of practiceHistory.keys()) {
            if (contextId) {
              candidateSet.add(contextId);
            }
          }
          if (lastPracticeContextId) {
            candidateSet.add(lastPracticeContextId);
          }
          const candidateContextIds = Array.from(candidateSet);
          const selectedContext = selectPracticeContext({
            candidateContextIds,
            contextEventCounts: contextCounts,
            contextTaskCounts,
            lastPracticedAt: practiceHistory,
            lastContextUsed: lastPracticeContextId,
            windowStart: new Date(startCandidate),
          });
          practiceContextId = selectedContext ?? null;
        }
      } else {
        practiceContextId = null;
      }

      scheduledDurationMs = endCandidate - startCandidate;
      if (scheduledDurationMs <= 0) {
        continue;
      }
      if (!clipped && scheduledDurationMs + 1 < desiredDurationMs) {
        clipped = true;
      }

      if (startCandidate === null || endCandidate === null) {
        continue;
      }

      const durationMinutes = Math.max(
        1,
        Math.round((endCandidate - startCandidate) / 60000)
      );
      const windowLabel = window.label ?? null;
      const windowStartLocal = resolveWindowStart(window, day, zone);
      const candidateStartUTC = new Date(startCandidate).toISOString();
      const candidateEndUTC = new Date(endCandidate).toISOString();
      const energyResolved = window.energy
        ? String(window.energy).toUpperCase()
        : resolvedEnergy;

      if (!isRepeatablePractice) {
        existingInstance = existingByHabitId.get(habit.id) ?? null;
      }
      if (existingInstance && daylightConstraint) {
        const existingWindow = existingInstance.window_id
          ? (windowsById.get(existingInstance.window_id) ?? null)
          : null;
        const withinDaylight = doesInstanceRespectDaylight(
          existingInstance,
          daylightConstraint,
          existingWindow,
          day,
          zone,
          nightSunlightBundle
        );
        if (!withinDaylight) {
          logCancelOnce("DAYLIGHT_REVALIDATION_CANCEL", existingInstance);
          if (await cancelScheduledInstance(existingInstance)) {
            existingByHabitId.delete(habit.id);
            existingInstance = null;
          }
        }
      }

      let needsUpdate = existingInstance
        ? existingInstance.window_id !== window.id ||
          existingInstance.start_utc !== candidateStartUTC ||
          existingInstance.end_utc !== candidateEndUTC ||
          existingInstance.duration_min !== durationMinutes ||
          (existingInstance.energy_resolved ?? "").toUpperCase() !==
            energyResolved
        : true;

      if (normalizedType === "PRACTICE") {
        const existingContext =
          existingInstance?.practice_context_monument_id ?? null;
        const desiredContext = practiceContextId ?? null;
        if (existingContext !== desiredContext) {
          needsUpdate = true;
        }
      }

      const targetDayTypeTimeBlockId =
        (window as any).dayTypeTimeBlockId ??
        (window as any).day_type_time_block_id ??
        null;

      if (!needsUpdate && existingInstance && targetDayTypeTimeBlockId) {
        const existingWindowId = existingInstance.window_id ?? null;
        const existingDayTypeTimeBlockId =
          (existingInstance as any).day_type_time_block_id ??
          (existingInstance as any).dayTypeTimeBlockId ??
          null;
        if (
          existingWindowId !== null ||
          existingDayTypeTimeBlockId !== targetDayTypeTimeBlockId
        ) {
          needsUpdate = true;
        }
      }

      if (!needsUpdate && existingInstance) {
        const overlapsExisting = hasBlockingHabitOverlap({
          candidateIsSync: isSyncHabit,
          candidateId: existingInstance.id ?? null,
          startMs: startCandidate,
          endMs: endCandidate,
          existingInstances: placedSoFar,
          habitTypeById,
        });
        if (overlapsExisting) {
          needsUpdate = true;
        }
      }

      let persisted: ScheduleInstance | null = null;
      let decision: HabitDraftPlacement["decision"] = "new";
      let instanceId: string | undefined;

      if (existingInstance && !needsUpdate) {
        decision = "kept";
        instanceId = existingInstance.id;
        persisted = existingInstance;
        registerInstance(existingInstance);
      } else {
      const placement = await placeItemInWindows({
        userId,
        item: {
          id: habit.id,
          sourceType: "HABIT",
          duration_min: durationMinutes,
          energy: energyResolved,
          weight: 0,
          eventName: habit.name || "Habit",
          practiceContextId:
            normalizedType === "PRACTICE"
              ? (practiceContextId ?? null)
              : undefined,
        },
        windows: [
            {
              id: window.id,
              startLocal: target.startLocal,
              endLocal: target.endLocal,
              availableStartLocal: new Date(startCandidate),
              dayTypeTimeBlockId:
                (window as any).dayTypeTimeBlockId ??
                (window as any).day_type_time_block_id ??
                null,
              timeBlockId: window.id,
              key: target.key,
              fromPrevDay: window.fromPrevDay ?? false,
            },
        ],
        date: day,
        timeZone: zone,
        client,
        maxGapCache,
        blockerCache,
        reuseInstanceId: existingInstance?.id,
          existingInstances: placedSoFar,
          allowHabitOverlap: allowsHabitOverlap,
          habitTypeById,
          windowEdgePreference: habit.windowEdgePreference,
          debugEnabled,
        });

        if (!("status" in placement)) {
          if (placement.error !== "NO_FIT") {
            result.failures.push({
              itemId: habit.id,
              reason: "error",
              detail: placement.error,
            });
          }
          continue;
        }

        if (placement.error || !placement.data) {
          const persistError =
            placement.error ?? new Error("Failed to persist habit instance");
          if (placement.error) {
            const error = placement.error as Partial<{
              message: string;
              details: string;
              hint: string;
              code: string;
            }>;
            log("error", "[HABIT_PERSIST_FAIL]", {
              habitId: habit.id,
              reuseInstanceId: existingInstance?.id ?? null,
              error: {
                message: error.message ?? null,
                details: error.details ?? null,
                hint: error.hint ?? null,
                code: error.code ?? null,
              },
            });
          }
          result.failures.push({
            itemId: habit.id,
            reason: "PERSIST_FAILED",
            detail: persistError,
          });
          failedHabitIds.add(habit.id);
          existingByHabitId.delete(habit.id);
          practiceInstanceQueues.delete(habit.id);
          if (existingInstance?.id) {
            const { error: missError } = await client
              .from("schedule_instances")
              .update({ status: "missed", missed_reason: "PERSIST_FAILED" })
              .eq("id", existingInstance.id);
            if (missError) {
              result.failures.push({
                itemId: habit.id,
                reason: "error",
                detail: missError,
              });
            }
            const removeById = (list: ScheduleInstance[]) => {
              const index = list.findIndex(
                (inst) => inst?.id === existingInstance?.id
              );
              if (index >= 0) list.splice(index, 1);
            };
            removeById(placedSoFar);
            removeById(dayInstances);
          }
          persistFailed = true;
          break;
        }

        persisted = placement.data;
        if (persisted?.id) {
          createdThisRun.add(persisted.id);
        }
        result.instances.push(persisted);
        existingByHabitId.set(habit.id, persisted);
        registerInstance(persisted);
        placedSoFar.push(persisted);
        decision = existingInstance ? "rescheduled" : "new";
        instanceId = persisted.id;
      }

      if (!persisted) {
        continue;
      }

      if (normalizedType === "PRACTICE") {
        const desiredContext = practiceContextId ?? null;
        if (persisted.practice_context_monument_id !== desiredContext) {
          persisted.practice_context_monument_id = desiredContext;
        }
      }

      const startDate = new Date(persisted.start_utc);
      const endDate = new Date(persisted.end_utc);
      recordHabitScheduledStart(habit.id, startDate);
      if (isRepeatablePractice) {
        practicePlacementCounts.set(
          habit.id,
          (practicePlacementCounts.get(habit.id) ?? 0) + 1
        );
      }
      if (normalizedType === "PRACTICE" && practiceContextId) {
        practiceHistory.set(practiceContextId, new Date(startDate));
      }
      const startUTC = startDate.toISOString();
      const endUTC = endDate.toISOString();

      addAnchorStart(anchorStartsByWindowKey, target.key, startDate.getTime());
      if (isSyncHabit) {
        addSyncUsage(target.key, startDate.getTime(), endDate.getTime());
      }
      upsertInstance(dayInstances, persisted);
      let availabilitySnapshot: { front: Date; back: Date } | null = null;
      if (!usedReservation && !allowsHabitOverlap) {
        availabilitySnapshot = bounds
          ? {
              front: new Date(bounds.front.getTime()),
              back: new Date(bounds.back.getTime()),
            }
          : null;
        if (bounds) {
          if (anchorPreference === "BACK") {
            bounds.back = new Date(startDate);
            if (bounds.front.getTime() > bounds.back.getTime()) {
              bounds.front = new Date(bounds.back);
            }
          } else {
            bounds.front = new Date(endDate);
            if (bounds.back.getTime() < bounds.front.getTime()) {
              bounds.back = new Date(bounds.front);
            }
          }
        } else if (anchorPreference === "BACK") {
          setAvailabilityBoundsForKey(
            availability,
            target.key,
            startDate.getTime(),
            startDate.getTime()
          );
        } else {
          setAvailabilityBoundsForKey(
            availability,
            target.key,
            endDate.getTime(),
            endDate.getTime()
          );
        }
      }
      const reservationSnapshot = usedReservation
        ? (reservation?.availabilitySnapshot ?? null)
        : availabilitySnapshot;
      if (
        persisted?.id &&
        !allowsHabitOverlap &&
        typeof reservationSnapshot !== "undefined"
      ) {
        reservedByInstanceId.set(persisted.id, {
          windowId: window.id,
          windowKey: target.key,
          startUTC,
          endUTC,
          availabilitySnapshot: reservationSnapshot ?? null,
        });
      }

      const resolvedDuration = Number.isFinite(persisted.duration_min)
        ? persisted.duration_min
        : durationMinutes;
      const persistedEnergy = (
        persisted.energy_resolved ?? energyResolved
      ).toUpperCase();

      if (auditEnabled) {
        audit.report.scheduling.dueScheduledSuccessfullyToday += 1;
      }

      result.placements.push({
        type: "HABIT",
        habit: {
          id: habit.id,
          name: habit.name,
          windowId: window.id,
          windowLabel,
          startUTC,
          endUTC,
          durationMin: resolvedDuration,
          energyResolved: persistedEnergy,
          clipped,
          practiceContextId:
            normalizedType === "PRACTICE" ? (practiceContextId ?? null) : null,
        },
        decision,
        scheduledDayOffset: offset,
        availableStartLocal: startUTC,
        windowStartLocal: windowStartLocal.toISOString(),
        instanceId,
      });
      placedInWindow = true;
      break;
    }
    if (persistFailed) {
      continue;
    }
    if (!placedInWindow) {
      continue;
    }

    if (isRepeatablePractice) {
      habitQueue.push(habit);
    }
  }

  if (locationMismatchRequeue.size > 0) {
    for (const [habitId, instance] of locationMismatchRequeue) {
      const stillScheduled = dayInstances.some(
        (inst) =>
          inst?.source_type === "HABIT" &&
          inst.status === "scheduled" &&
          inst.source_id === habitId
      );
      if (stillScheduled || !instance?.id) continue;
      const marked = await missScheduledInstance(
        instance,
        LOCATION_MISMATCH_REVALIDATION
      );
      if (marked) {
        instance.status = "missed";
      }
    }
  }

  result.placements.sort((a, b) => {
    const aTime = new Date(a.habit.startUTC).getTime();
    const bTime = new Date(b.habit.startUTC).getTime();
    return aTime - bTime;
  });

  return result;
}

function placementStartMs(entry: ScheduleDraftPlacement) {
  if (entry.type === "PROJECT") {
    return new Date(entry.instance.start_utc).getTime();
  }
  return new Date(entry.habit.startUTC).getTime();
}

function placementKey(entry: ScheduleDraftPlacement) {
  if (entry.type === "PROJECT") {
    const id = entry.projectId || entry.instance.id;
    return `PROJECT:${id}`;
  }
  return `HABIT:${entry.habit.id}`;
}

function upsertInstance(list: ScheduleInstance[], instance: ScheduleInstance) {
  const index = list.findIndex((existing) => existing.id === instance.id);
  if (index >= 0) {
    list[index] = instance;
    return;
  }
  list.push(instance);
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
  if (existing.includes(startMs)) {
    return;
  }
  let insertIndex = 0;
  while (insertIndex < existing.length && existing[insertIndex] < startMs) {
    insertIndex += 1;
  }
  existing.splice(insertIndex, 0, startMs);
}

type NightSpan = {
  start: Date;
  end: Date;
};

type NightSunlightBundle = {
  today: SunlightBounds;
  previous: SunlightBounds;
  next: SunlightBounds;
};

function nightSpanForWindowFromSunlight(
  win: WindowLite,
  todaySunlight: SunlightBounds,
  previousSunlight: SunlightBounds,
  nextSunlight: SunlightBounds
): NightSpan | null {
  const startReference = win.fromPrevDay
    ? (previousSunlight.sunset ?? previousSunlight.dusk)
    : (todaySunlight.sunset ?? todaySunlight.dusk);
  const endReference = win.fromPrevDay
    ? (todaySunlight.dawn ?? todaySunlight.sunrise)
    : (nextSunlight.dawn ?? nextSunlight.sunrise);
  if (!startReference || !endReference) {
    return null;
  }
  return { start: startReference, end: endReference };
}

function windowOverlapsNightSpan(
  win: WindowLite,
  date: Date,
  timeZone: string,
  todaySunlight: SunlightBounds,
  previousSunlight: SunlightBounds,
  nextSunlight: SunlightBounds
) {
  const span = nightSpanForWindowFromSunlight(
    win,
    todaySunlight,
    previousSunlight,
    nextSunlight
  );
  if (!span) return false;
  const startLocal = resolveWindowStart(win, date, timeZone);
  const endLocal = resolveWindowEnd(win, date, timeZone);
  return (
    startLocal.getTime() < span.end.getTime() &&
    endLocal.getTime() > span.start.getTime()
  );
}

type DaylightConstraint = {
  preference: "DAY" | "NIGHT";
  sunrise: Date | null;
  sunset: Date | null;
  dawn: Date | null;
  dusk: Date | null;
  previousSunset: Date | null;
  previousDusk: Date | null;
  nextDawn: Date | null;
  nextSunrise: Date | null;
};

function nightSpanForWindowFromConstraint(
  win: WindowLite,
  daylight: DaylightConstraint
): NightSpan | null {
  const startReference = win.fromPrevDay
    ? (daylight.previousSunset ?? daylight.previousDusk)
    : (daylight.sunset ?? daylight.dusk);
  const endReference = win.fromPrevDay
    ? (daylight.sunrise ?? daylight.dawn)
    : (daylight.nextDawn ?? daylight.nextSunrise);
  if (!startReference || !endReference) {
    return null;
  }
  return { start: startReference, end: endReference };
}

function doesInstanceRespectDaylight(
  instance: ScheduleInstance,
  daylight: DaylightConstraint,
  window: WindowLite | null,
  date: Date,
  timeZone: string,
  nightSunlight: NightSunlightBundle | null
) {
  const start = new Date(instance.start_utc ?? "");
  const end = new Date(instance.end_utc ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return true;
  }

  if (daylight.preference === "DAY") {
    const sunriseMs = daylight.sunrise?.getTime() ?? daylight.dawn?.getTime();
    const sunsetMs = daylight.sunset?.getTime() ?? daylight.dusk?.getTime();
    if (typeof sunriseMs === "number" && start.getTime() < sunriseMs) {
      return false;
    }
    if (typeof sunsetMs === "number" && end.getTime() > sunsetMs) {
      return false;
    }
    return true;
  }

  let span: NightSpan | null = null;
  if (window) {
    span = nightSpanForWindowFromConstraint(window, daylight);
    if (!span && nightSunlight) {
      span = nightSpanForWindowFromSunlight(
        window,
        nightSunlight.today,
        nightSunlight.previous,
        nightSunlight.next
      );
    }
  }

  let startBound: Date;
  let endBound: Date;

  if (span) {
    startBound = span.start;
    endBound = span.end;
  } else {
    const thresholdBase = window?.fromPrevDay
      ? addDaysInTimeZone(date, -1, timeZone)
      : date;
    startBound = setTimeInTimeZone(thresholdBase, timeZone, 19, 0);
    const fallbackEnd =
      daylight.nextDawn ??
      daylight.nextSunrise ??
      nightSunlight?.next.dawn ??
      nightSunlight?.next.sunrise ??
      setTimeInTimeZone(addDaysInTimeZone(date, 1, timeZone), timeZone, 6, 0);
    endBound =
      fallbackEnd ?? new Date(startBound.getTime() + 6 * 60 * 60 * 1000);
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
  if (startMs < startBound.getTime()) return false;
  if (endMs > endBound.getTime()) return false;
  return true;
}

type ConstraintAwareItem = {
  energy: string;
  duration_min: number;
  habitType?: string | null;
  skillId?: string | null;
  skillIds?: string[] | null;
  monumentId?: string | null;
  skillMonumentId?: string | null;
  monumentIds?: string[] | null;
};

type FetchCompatibleWindowsResult = {
  windows: Array<{
    id: string;
    key: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal: Date;
    dayTypeTimeBlockId: string | null;
    timeBlockId: string | null;
    fromPrevDay?: boolean;
    energy?: string | null;
    locationContextId?: string | null;
    locationContextValue?: string | null;
    gateTrace: BlockGateSample;
  }>;
  filterCounters?: PlacementFilterWaterfall;
};

export async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: ConstraintAwareItem,
  timeZone: string,
  options?: {
    now?: Date;
    availability?: Map<string, WindowAvailabilityBounds>;
    forceDayScopedAvailabilityKey?: boolean;
    cache?: Map<string, WindowLite[]>;
    locationContextId?: string | null;
    locationContextValue?: string | null;
    daylight?: DaylightConstraint | null;
    matchEnergyLevel?: boolean;
    ignoreAvailability?: boolean;
    anchor?: "FRONT" | "BACK";
    restMode?: boolean;
    userId?: string | null;
    preloadedWindows?: WindowLite[];
    enforceNightSpan?: boolean;
    nightSunlight?: NightSunlightBundle | null;
    requireLocationContextMatch?: boolean;
    hasExplicitLocationContext?: boolean;
    allowedWindowKinds?: WindowKind[];
    trackFilterCounters?: boolean;
    locationDebugContext?: {
      rejectedByLocation?: () => void;
      acceptedWithWindowLocationButNullItemLocation?: () => void;
    };
    auditZeroStageCallback?: (stage: string | null) => void;
    horizonEnd?: Date;
  parity?: FetchWindowsParityOptions | null;
  }
): Promise<FetchCompatibleWindowsResult> {
  // Debug pipeline tracking
  const debugPipeline = process.env.SCHEDULER_DEBUG_WINDOW_PIPELINE === "true";
  let pipelineLogCount = 0;
  const maxPipelineLogs = 3;
  const cacheKey = dateCacheKey(date);
  const cache = options?.cache;
  let windows: WindowLite[];
  let windowOccurrences: Array<{
    window: WindowLite;
    occurrenceDate: Date;
  }> | null = null;
  const trackFilters = Boolean(options?.trackFilterCounters);
  let filterCounters: PlacementFilterWaterfall | null = trackFilters
    ? {
        totalWindows: 0,
        dayTypeIncompatible: 0,
        itemTypeNotAllowed: 0,
        skillNotAllowed: 0,
        monumentNotAllowed: 0,
        locationMismatch: 0,
        energyMismatch: 0,
      }
    : null;
  const userId = options?.userId ?? undefined;
  const windowOptionsBase = {
    userId,
    parity: options?.parity ?? undefined,
  };
  if (options?.horizonEnd && SCHEDULER_PROJECT_DEBUG_LOGGING) {
    // When horizonEnd is provided, expand windows into concrete occurrences with correct dates
    windowOccurrences = [];
    if (options?.preloadedWindows) {
      const preloaded = options.preloadedWindows;
      let currentDay = new Date(date);
      const endDate = new Date(options.horizonEnd);
      while (currentDay <= endDate) {
        const dayWindows = getWindowsForDateFromAll(
          preloaded,
          currentDay,
          timeZone
        );
        for (const win of dayWindows) {
          windowOccurrences.push({
            window: win,
            occurrenceDate: new Date(currentDay),
          });
        }
        currentDay = addDaysInTimeZone(currentDay, 1, timeZone);
      }
    } else {
      // For projects, fetch windows across the entire horizon
      let currentDay = new Date(date);
      const endDate = new Date(options.horizonEnd);
      while (currentDay <= endDate) {
        const dayWindows = await fetchWindowsForDate(
          currentDay,
          supabase,
          timeZone,
          { ...windowOptionsBase }
        );
        for (const win of dayWindows) {
          windowOccurrences.push({
            window: win,
            occurrenceDate: new Date(currentDay),
          });
        }
        currentDay = addDaysInTimeZone(currentDay, 1, timeZone);
      }
    }
    // For backward compatibility, create a flat windows array (though we'll use windowOccurrences in filtering)
    windows = windowOccurrences.map((occ) => occ.window);
  } else if (options?.preloadedWindows) {
    windows = getWindowsForDateFromAll(
      options.preloadedWindows,
      date,
      timeZone
    );
  } else if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? [];
  } else {
    windows = await fetchWindowsForDate(date, supabase, timeZone, {
      ...windowOptionsBase,
    });
    cache?.set(cacheKey, windows);
  }

  const constraintItem = {
    habitType: item.habitType ?? null,
    skillId: item.skillId ?? null,
    skillIds: item.skillIds ?? null,
    monumentId: item.monumentId ?? null,
    skillMonumentId: item.skillMonumentId ?? null,
    monumentIds: item.monumentIds ?? null,
  };

  const windowOccurrencesBeforeConstraints = windowOccurrences;
  const windowsBeforeConstraints = windows;
  const originalWindowCount =
    windowOccurrencesBeforeConstraints?.length ?? windowsBeforeConstraints.length;
  const hasConstraints =
    (windows?.some?.(
      (win) =>
        win.allowAllHabitTypes === false ||
        win.allowAllSkills === false ||
        win.allowAllMonuments === false ||
        (win.allowedHabitTypes && win.allowedHabitTypes.length > 0) ||
        (win.allowedSkillIds && win.allowedSkillIds.length > 0) ||
        (win.allowedMonumentIds && win.allowedMonumentIds.length > 0)
    ) ??
      false) ||
    (windowOccurrences?.some?.(
      ({ window: win }) =>
        win.allowAllHabitTypes === false ||
        win.allowAllSkills === false ||
        win.allowAllMonuments === false ||
        (win.allowedHabitTypes && win.allowedHabitTypes.length > 0) ||
        (win.allowedSkillIds && win.allowedSkillIds.length > 0) ||
        (win.allowedMonumentIds && win.allowedMonumentIds.length > 0)
    ) ??
      false);

  if (hasConstraints) {
    const constraintCounts = trackFilters ? createEmptyFilterCounters() : null;
    let filteredWindowOccurrences: typeof windowOccurrences | null = null;
    let filteredWindowList: WindowLite[] | null = null;
    let filteredWindowCount = 0;

    const evaluateConstraint = (win: WindowLite) => {
      const passes = passesTimeBlockConstraints(constraintItem, {
        allowAllHabitTypes: win.allowAllHabitTypes,
        allowAllSkills: win.allowAllSkills,
        allowAllMonuments: win.allowAllMonuments,
        allowedHabitTypes: win.allowedHabitTypes,
        allowedSkillIds: win.allowedSkillIds,
        allowedMonumentIds: win.allowedMonumentIds,
        allowedHabitTypesSet: win.allowedHabitTypesSet ?? null,
        allowedSkillIdsSet: win.allowedSkillIdsSet ?? null,
        allowedMonumentIdsSet: win.allowedMonumentIdsSet ?? null,
      });
      if (passes) {
        return { passes: true, reason: null };
      }
      const reason = determineConstraintFailureReason(constraintItem, win);
      if (constraintCounts && reason) {
        addFilterRejection(constraintCounts, reason);
      }
      return { passes: false, reason };
    };

    if (windowOccurrencesBeforeConstraints) {
      const filtered: typeof windowOccurrencesBeforeConstraints = [];
      for (const occ of windowOccurrencesBeforeConstraints) {
        const { passes } = evaluateConstraint(occ.window);
        if (passes) {
          filtered.push(occ);
        }
      }
      filteredWindowOccurrences = filtered;
      filteredWindowCount = filtered.length;
    } else {
      const filtered: WindowLite[] = [];
      for (const win of windowsBeforeConstraints) {
        const { passes } = evaluateConstraint(win);
        if (passes) {
          filtered.push(win);
        }
      }
      filteredWindowList = filtered;
      filteredWindowCount = filtered.length;
    }

    const shouldUseFiltered =
      originalWindowCount === 0 || filteredWindowCount > 0;

    if (shouldUseFiltered) {
      if (filteredWindowOccurrences) {
        windowOccurrences = filteredWindowOccurrences;
        windows = filteredWindowOccurrences.map((occ) => occ.window);
      } else if (filteredWindowList) {
        windows = filteredWindowList;
      }
      if (filterCounters && constraintCounts) {
        mergeFilterCounters(filterCounters, constraintCounts);
      }
    } else {
      windowOccurrences = windowOccurrencesBeforeConstraints;
      windows = windowsBeforeConstraints;
    }
  }
  if (filterCounters) {
    filterCounters.totalWindows += originalWindowCount;
  }

  const itemIdx = energyIndex(item.energy);
  const now = options?.now ? new Date(options.now) : null;
  const nowMs = now?.getTime();
  const durationMs = Math.max(0, item.duration_min) * 60000;
  const availability = options?.ignoreAvailability
    ? undefined
    : options?.availability;

  const desiredLocationId =
    typeof options?.locationContextId === "string" &&
    options.locationContextId.trim().length > 0
      ? options.locationContextId.trim()
      : null;
  const desiredLocationValueRaw =
    options?.locationContextValue && options.locationContextValue.length > 0
      ? options.locationContextValue.toUpperCase().trim()
      : null;
  const desiredLocationValue =
    desiredLocationValueRaw === "ANY" ? null : desiredLocationValueRaw;
  const daylight = options?.daylight ?? null;
  const anchorPreference = options?.anchor === "BACK" ? "BACK" : "FRONT";
  const allowedWindowKindSet =
    options?.allowedWindowKinds && options.allowedWindowKinds.length > 0
      ? new Set(options.allowedWindowKinds)
      : null;
  const shouldEnforceLocation =
    options?.requireLocationContextMatch === true ||
    options?.hasExplicitLocationContext === true;
  const auditZeroStageCallback = options?.auditZeroStageCallback;
  const stageOrder = [
    "allowedWindowKinds",
    "energy match",
    "location match",
    "nowMs trim",
    "daylight/night constraints",
    "availability bounds",
    "duration fit",
  ] as const;
  const createStageRecorder = () => {
    let firstFailGate: string | null = null;
    const stageResults: GateStageResult[] = [];
    return {
      record(name: string, passed: boolean, details?: string | null) {
        stageResults.push({ name, passed, details });
        if (!passed && firstFailGate === null) {
          firstFailGate = name;
        }
      },
      getResults() {
        return stageResults;
      },
      getFirstFailGate() {
        return firstFailGate;
      },
    };
  };
  const stagePassCounts =
    typeof auditZeroStageCallback === "function" && windows.length > 0
      ? {
          allowedWindowKinds: 0,
          "energy match": 0,
          "location match": 0,
          "nowMs trim": 0,
          "daylight/night constraints": 0,
          "availability bounds": 0,
          "duration fit": 0,
        }
      : null;

  const compatible = [] as Array<{
    id: string;
    key: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal: Date;
    energyIdx: number;
    fromPrevDay?: boolean;
    dayTypeTimeBlockId?: string | null;
    timeBlockId?: string | null;
    energy?: string | null;
    locationContextId?: string | null;
    locationContextValue?: string | null;
    gateTrace: BlockGateSample;
  }>;

  const restMode = options?.restMode ?? false;

  let totalWindows = 0;
  let afterAllowedWindowKinds = 0;
  let afterEnergy = 0;
  let afterLocation = 0;
  let afterNowTrim = 0;
  let afterDaylight = 0;
  let afterAvailability = 0;
  let afterDuration = 0;
  if (options?.horizonEnd) {
    totalWindows = windows.length;
  }

  // Process each window, using the correct occurrence date when available
  const windowsToProcess =
    windowOccurrences ||
    windows.map((win) => ({ window: win, occurrenceDate: date }));

  for (const occurrence of windowsToProcess) {
    const win = occurrence.window;
    const occurrenceDate = occurrence.occurrenceDate;

    const stageRecorder = createStageRecorder();
    const recordStage = stageRecorder.record;

    const windowKind = resolveWindowKind(win);
    if (allowedWindowKindSet && !allowedWindowKindSet.has(windowKind)) {
      recordStage("allowedWindowKinds", false, "window kind not allowed");
      addFilterRejection(filterCounters, "DAY_TYPE_INCOMPATIBLE");
      continue;
    }
    if (allowedWindowKindSet) {
      recordStage("allowedWindowKinds", true);
    }
    if (stagePassCounts) stagePassCounts["allowedWindowKinds"] += 1;
    if (options?.horizonEnd) afterAllowedWindowKinds++;
    let energyRaw = win.energy ? String(win.energy).toUpperCase().trim() : "";
    if (restMode) {
      energyRaw = energyRaw === "NO" ? "NO" : "LOW";
    }
    const hasEnergyLabel = energyRaw.length > 0;
    const energyLabel = hasEnergyLabel ? energyRaw : null;
    const energyIdx = hasEnergyLabel
      ? energyIndex(energyLabel, { fallback: ENERGY.LIST.length })
      : ENERGY.LIST.length;
    if (hasEnergyLabel && energyIdx >= ENERGY.LIST.length) {
      recordStage("energy match", false, "window energy invalid");
      addFilterRejection(filterCounters, "ENERGY_MISMATCH");
      continue;
    }
    const requireExactEnergy = options?.matchEnergyLevel ?? false;
    if (requireExactEnergy) {
      if (!hasEnergyLabel) {
        recordStage("energy match", false, "item has no energy label");
        addFilterRejection(filterCounters, "ENERGY_MISMATCH");
        continue;
      }
      if (energyIdx !== itemIdx) {
        recordStage("energy match", false, "energy index mismatch");
        addFilterRejection(filterCounters, "ENERGY_MISMATCH");
        continue;
      }
    } else if (energyIdx < itemIdx) {
      recordStage("energy match", false, "window energy lower than item");
      addFilterRejection(filterCounters, "ENERGY_MISMATCH");
      continue;
    }
    recordStage("energy match", true);
    if (stagePassCounts) stagePassCounts["energy match"] += 1;
    if (options?.horizonEnd) afterEnergy++;

    const windowLocationId =
      typeof win.location_context_id === "string" &&
      win.location_context_id.trim().length > 0
        ? win.location_context_id.trim()
        : null;
    const windowLocationValue =
      win.location_context_value && win.location_context_value.length > 0
        ? win.location_context_value.toUpperCase().trim()
        : null;
    const windowHasLocation = Boolean(windowLocationId || windowLocationValue);
    const attemptHasLocation = Boolean(desiredLocationId || desiredLocationValue);
    const applyLocationGate =
      shouldEnforceLocation || windowLocationId !== null;

    if (applyLocationGate) {
      if (stagePassCounts) stagePassCounts["location match"] += 1;
      if (options?.horizonEnd) afterLocation++;

      if (windowLocationId !== null) {
        if (!attemptHasLocation) {
          recordStage("location match", false, "window requires location context");
          if (!shouldEnforceLocation) {
            options?.locationDebugContext?.acceptedWithWindowLocationButNullItemLocation?.();
          }
          options?.locationDebugContext?.rejectedByLocation?.();
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
        if (desiredLocationId !== windowLocationId) {
          recordStage("location match", false, "window location id mismatch");
          options?.locationDebugContext?.rejectedByLocation?.();
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
      }

      if (options?.requireLocationContextMatch) {
        if (!attemptHasLocation && windowHasLocation) {
          recordStage("location match", false, "required location context missing");
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
      }

      if (desiredLocationId || windowLocationId) {
        if (!desiredLocationId || !windowLocationId) {
          recordStage("location match", false, "location context id missing");
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
        if (windowLocationId !== desiredLocationId) {
          recordStage("location match", false, "location context id mismatch");
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
      } else if (desiredLocationValue) {
        if (!windowLocationValue) {
          recordStage("location match", false, "location context value missing");
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
        if (windowLocationValue !== desiredLocationValue) {
          recordStage("location match", false, "location context value mismatch");
          addFilterRejection(filterCounters, "LOCATION_MISMATCH");
          continue;
        }
      }
      recordStage("location match", true);
    }

    const startLocal = resolveWindowStart(win, occurrenceDate, timeZone);
    const endLocal = resolveWindowEnd(win, occurrenceDate, timeZone);
    const descriptor = describeAvailabilityWindow(win, startLocal, endLocal);
    let keyDescriptor: Parameters<typeof getAvailabilityWindowKey>[0] = descriptor;
    if (options?.forceDayScopedAvailabilityKey) {
      const startCandidate =
        typeof win.dayTypeStartUtcMs === "number"
          ? win.dayTypeStartUtcMs
          : startLocal.getTime();
      const endCandidate =
        typeof win.dayTypeEndUtcMs === "number"
          ? win.dayTypeEndUtcMs
          : endLocal.getTime();
      const startMs = Number.isFinite(startCandidate) ? startCandidate : null;
      const endMs = Number.isFinite(endCandidate) ? endCandidate : null;
      keyDescriptor = {
        ...descriptor,
        dayTypeTimeBlockId: null,
        day_type_time_block_id: null,
        windowId: null,
        window_id: null,
        timeBlockId: null,
        time_block_id: null,
        startMs,
        endMs,
      };
    }
    const key = getAvailabilityWindowKey(keyDescriptor);
    const startMs = startLocal.getTime();
    const endMs = endLocal.getTime();

    if (typeof nowMs === "number" && endMs <= nowMs) continue;
    recordStage("nowMs trim", true);
    if (stagePassCounts) stagePassCounts["nowMs trim"] += 1;
    if (options?.horizonEnd) afterNowTrim++;

    let frontBoundMs =
      typeof nowMs === "number" ? Math.max(startMs, nowMs) : startMs;
    let backBoundMs = endMs;

    const wantsNightSpan =
      daylight?.preference === "NIGHT" || options?.enforceNightSpan === true;
    if (daylight) {
      if (daylight.preference === "DAY") {
        const sunriseMs = daylight.sunrise?.getTime();
        const sunsetMs = daylight.sunset?.getTime();
        if (typeof sunriseMs === "number") {
          frontBoundMs = Math.max(frontBoundMs, sunriseMs);
        }
        if (typeof sunsetMs === "number") {
          backBoundMs = Math.min(backBoundMs, sunsetMs);
        }
      }
    }
    if (wantsNightSpan) {
      let nightSpan: NightSpan | null = null;
      if (daylight?.preference === "NIGHT") {
        nightSpan = nightSpanForWindowFromConstraint(win, daylight);
      }
      if (!nightSpan && options?.nightSunlight) {
        nightSpan = nightSpanForWindowFromSunlight(
          win,
          options.nightSunlight.today,
          options.nightSunlight.previous,
          options.nightSunlight.next
        );
      }
      if (nightSpan) {
        frontBoundMs = Math.max(frontBoundMs, nightSpan.start.getTime());
        backBoundMs = Math.min(backBoundMs, nightSpan.end.getTime());
      } else {
        const thresholdBase = win.fromPrevDay
          ? addDaysInTimeZone(occurrenceDate, -1, timeZone)
          : occurrenceDate;
        const nightThreshold = setTimeInTimeZone(
          thresholdBase,
          timeZone,
          19,
          0
        );
        const nightThresholdMs = nightThreshold.getTime();
        if (Number.isFinite(nightThresholdMs)) {
          frontBoundMs = Math.max(frontBoundMs, nightThresholdMs);
        }
        const fallbackNextDawnMs =
          daylight?.nextDawn?.getTime() ??
          options?.nightSunlight?.next.dawn?.getTime() ??
          options?.nightSunlight?.next.sunrise?.getTime() ??
          null;
        if (typeof fallbackNextDawnMs === "number") {
          backBoundMs = Math.min(backBoundMs, fallbackNextDawnMs);
        }
      }
    }

    if (frontBoundMs >= backBoundMs) continue;
    recordStage("daylight/night constraints", true);
    if (stagePassCounts) stagePassCounts["daylight/night constraints"] += 1;
    if (options?.horizonEnd) afterDaylight++;

    const existingBounds = availability?.get(key) ?? null;
    if (existingBounds) {
      const nextFront = Math.max(frontBoundMs, existingBounds.front.getTime());
      const nextBack = Math.min(backBoundMs, existingBounds.back.getTime());
      if (nextFront >= nextBack) {
        existingBounds.front = new Date(nextBack);
        existingBounds.back = new Date(nextBack);
        continue;
      }
      existingBounds.front = new Date(nextFront);
      existingBounds.back = new Date(nextBack);
      frontBoundMs = existingBounds.front.getTime();
      backBoundMs = existingBounds.back.getTime();
    } else if (availability) {
      setAvailabilityBoundsForKey(availability, key, frontBoundMs, backBoundMs);
    }

    if (frontBoundMs >= backBoundMs) continue;
    recordStage("availability bounds", true);
    if (stagePassCounts) stagePassCounts["availability bounds"] += 1;
    if (options?.horizonEnd) afterAvailability++;

    const endLimitMs = backBoundMs;

    let candidateStartMs: number;
    if (anchorPreference === "BACK") {
      candidateStartMs = backBoundMs - durationMs;
      if (candidateStartMs < startMs) {
        candidateStartMs = startMs;
      }
    } else {
      candidateStartMs = frontBoundMs;
    }

    if (candidateStartMs < frontBoundMs) {
      candidateStartMs = frontBoundMs;
    }

    const candidateEndMs = candidateStartMs + durationMs;
    if (candidateEndMs > backBoundMs) continue;
    recordStage("duration fit", true);
    if (stagePassCounts) stagePassCounts["duration fit"] += 1;
    if (options?.horizonEnd) afterDuration++;

    const endLimitLocal = new Date(endLimitMs);

    const availableStartLocal = new Date(candidateStartMs);

    const freeSegmentMinutes = Math.round(
      Math.max(0, backBoundMs - frontBoundMs) / 60000
    );
    const gateTrace: BlockGateSample = {
      blockId: key,
      dateIso: occurrenceDate.toISOString(),
      windowId: win.id ?? null,
      dayTypeTimeBlockId: descriptor.dayTypeTimeBlockId ?? null,
      timeBlockId: descriptor.timeBlockId ?? null,
      energy: energyLabel,
      locationContextId: windowLocationId,
      locationContextValue: windowLocationValue,
      durationMin: item.duration_min,
      stageResults: stageRecorder.getResults(),
      firstFailGate: stageRecorder.getFirstFailGate() ?? null,
      attempted: false,
      freeSegmentMinutes,
      collisionCount: null,
    };

    compatible.push({
      id: win.id,
      key,
      startLocal,
      endLocal: endLimitLocal,
      availableStartLocal,
      energyIdx,
      fromPrevDay: win.fromPrevDay ?? false,
      dayTypeTimeBlockId: descriptor.dayTypeTimeBlockId,
      timeBlockId: descriptor.timeBlockId,
      energy: energyLabel,
      locationContextId: windowLocationId,
      locationContextValue: windowLocationValue,
      gateTrace,
    });
  }

  compatible.sort((a, b) => {
    const startDiff =
      a.availableStartLocal.getTime() - b.availableStartLocal.getTime();
    if (startDiff !== 0) return startDiff;
    const energyDiff = a.energyIdx - b.energyIdx;
    if (energyDiff !== 0) return energyDiff;
    const rawStartDiff = a.startLocal.getTime() - b.startLocal.getTime();
    if (rawStartDiff !== 0) return rawStartDiff;
    return a.id.localeCompare(b.id);
  });

  if (typeof auditZeroStageCallback === "function") {
    if (windows.length === 0) {
      auditZeroStageCallback(null);
    } else if (compatible.length === 0) {
      let firstStage: string | null = null;
      for (const stage of stageOrder) {
        if ((stagePassCounts?.[stage] ?? 0) === 0) {
          firstStage = stage;
          break;
        }
      }
      auditZeroStageCallback(firstStage);
    }
  }

  if (options?.horizonEnd) {
    logSchedulerDebug(
      "[SCHEDULER_PROJECT_DEBUG] fetchCompatibleWindowsForItem BEFORE filtering",
      { totalWindows }
    );
    logSchedulerDebug(
      "[SCHEDULER_PROJECT_DEBUG] fetchCompatibleWindowsForItem AFTER filtering",
      { totalAfter: compatible.length }
    );
    if (compatible.length === 0) {
      const breakdown = {
        energy_mismatch: totalWindows - afterEnergy,
        duration_too_long: afterAvailability - afterDuration,
        window_outside_horizon: afterEnergy - afterNowTrim,
        window_already_occupied: afterNowTrim - afterAvailability,
        blocked_by_habit_project: afterNowTrim - afterAvailability,
        window_ownership_mismatch: totalWindows - afterAllowedWindowKinds,
        timezone_daykey_mismatch: afterLocation - afterEnergy,
      };
      logSchedulerDebug(
        "[SCHEDULER_PROJECT_DEBUG] fetchCompatibleWindowsForItem ZERO windows breakdown",
        breakdown
      );
    }
    (compatible as any).counters = {
      total: totalWindows,
      afterAllowedWindowKinds,
      afterEnergy,
      afterLocation,
      afterNowTrim,
      afterDaylight,
      afterAvailability,
      afterDuration,
    };
  }

  // Debug pipeline logging for HABIT items
  if (
    debugPipeline &&
    item.habitType &&
    compatible.length === 0 &&
    pipelineLogCount < maxPipelineLogs
  ) {
    pipelineLogCount++;

    // Get sample window for debugging
    const sampleWindow = windows.length > 0 ? windows[0] : null;

    logSchedulerDebug("[WINDOW_PIPELINE]", {
      itemId: item.habitType,
      habitType: item.habitType,
      itemLocationContextId: options?.locationContextId,
      itemEnergy: item.energy,
      stages: {
        start: windows.length,
        afterKind: afterAllowedWindowKinds,
        afterConstraints: hasConstraints
          ? windowOccurrences
            ? windowOccurrences.length
            : windows.length
          : windows.length,
        afterLocation: afterLocation,
        afterEnergy: afterEnergy,
        afterDaylight: afterDaylight,
        afterDuration: afterDuration,
      },
      sampleWindow: sampleWindow
        ? {
            id: sampleWindow.id,
            windowKind: sampleWindow.window_kind,
            locationContextId: sampleWindow.location_context_id,
            energy: sampleWindow.energy,
            dayTypeTimeBlockId: (sampleWindow as any).dayTypeTimeBlockId,
          }
        : null,
    });
  }

  const compatibleWindows = compatible.map((win) => ({
    id: win.id,
    key: win.key,
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    availableStartLocal: win.availableStartLocal,
    dayTypeTimeBlockId: win.dayTypeTimeBlockId ?? null,
    timeBlockId: win.timeBlockId ?? null,
    fromPrevDay: win.fromPrevDay ?? undefined,
  }));
  return {
    windows: compatibleWindows,
    filterCounters: filterCounters ?? undefined,
  };
}

function createEmptyFilterCounters(): PlacementFilterWaterfall {
  return {
    totalWindows: 0,
    dayTypeIncompatible: 0,
    itemTypeNotAllowed: 0,
    skillNotAllowed: 0,
    monumentNotAllowed: 0,
    locationMismatch: 0,
    energyMismatch: 0,
  };
}

function addFilterRejection(
  counters: PlacementFilterWaterfall | null,
  reason: PlacementReasonCode
) {
  if (!counters) return;
  switch (reason) {
    case "DAY_TYPE_INCOMPATIBLE":
      counters.dayTypeIncompatible += 1;
      break;
    case "ITEM_TYPE_NOT_ALLOWED":
      counters.itemTypeNotAllowed += 1;
      break;
    case "SKILL_NOT_ALLOWED":
      counters.skillNotAllowed += 1;
      break;
    case "MONUMENT_NOT_ALLOWED":
      counters.monumentNotAllowed += 1;
      break;
    case "LOCATION_MISMATCH":
      counters.locationMismatch += 1;
      break;
    case "ENERGY_MISMATCH":
      counters.energyMismatch += 1;
      break;
    default:
      break;
  }
}

function mergeFilterCounters(
  target: PlacementFilterWaterfall,
  source: PlacementFilterWaterfall
) {
  target.dayTypeIncompatible += source.dayTypeIncompatible;
  target.itemTypeNotAllowed += source.itemTypeNotAllowed;
  target.skillNotAllowed += source.skillNotAllowed;
  target.monumentNotAllowed += source.monumentNotAllowed;
  target.locationMismatch += source.locationMismatch;
  target.energyMismatch += source.energyMismatch;
  target.totalWindows += source.totalWindows;
}

function determineConstraintFailureReason(
  item: ConstraintAwareItem,
  window: WindowLite
): PlacementReasonCode | null {
  if (window.allowAllHabitTypes === false) {
    const allowed =
      window.allowedHabitTypesSet ?? normalizeSet(window.allowedHabitTypes);
    if (!allowed || allowed.size === 0) {
      return "ITEM_TYPE_NOT_ALLOWED";
    }
    const habitType =
      typeof item.habitType === "string"
        ? item.habitType.toUpperCase().trim()
        : null;
    if (habitType && !allowed.has(habitType)) {
      return "ITEM_TYPE_NOT_ALLOWED";
    }
  }

  if (window.allowAllSkills === false) {
    const allowed =
      window.allowedSkillIdsSet ?? normalizeIdSet(window.allowedSkillIds);
    if (!allowed || allowed.size === 0) {
      return "SKILL_NOT_ALLOWED";
    }
    const skillCandidates = new Set<string>();
    if (item.skillId) {
      const primary = item.skillId.trim();
      if (primary) skillCandidates.add(primary);
    }
    if (Array.isArray(item.skillIds)) {
      for (const val of item.skillIds) {
        if (!val) continue;
        const trimmed = val.trim();
        if (trimmed) skillCandidates.add(trimmed);
      }
    }
    if (skillCandidates.size === 0) return "SKILL_NOT_ALLOWED";
    const hasSkillMatch = Array.from(skillCandidates).some((candidate) =>
      allowed.has(candidate)
    );
    if (!hasSkillMatch) {
      return "SKILL_NOT_ALLOWED";
    }
  }

  if (window.allowAllMonuments === false) {
    const allowed =
      window.allowedMonumentIdsSet ?? normalizeIdSet(window.allowedMonumentIds);
    if (!allowed || allowed.size === 0) {
      return "MONUMENT_NOT_ALLOWED";
    }
    const monumentCandidates = new Set<string>();
    if (item.monumentId) {
      const primary = item.monumentId.trim();
      if (primary) monumentCandidates.add(primary);
    }
    if (item.skillMonumentId) {
      const skillMonument = item.skillMonumentId.trim();
      if (skillMonument) monumentCandidates.add(skillMonument);
    }
    if (Array.isArray(item.monumentIds)) {
      for (const val of item.monumentIds) {
        if (!val) continue;
        const trimmed = val.trim();
        if (trimmed) monumentCandidates.add(trimmed);
      }
    }
    if (monumentCandidates.size === 0) return "MONUMENT_NOT_ALLOWED";
    const hasMonumentMatch = Array.from(monumentCandidates).some((candidate) =>
      allowed.has(candidate)
    );
    if (!hasMonumentMatch) {
      return "MONUMENT_NOT_ALLOWED";
    }
  }

  return null;
}

function cloneAvailabilityMap(source: Map<string, WindowAvailabilityBounds>) {
  const clone = new Map<string, WindowAvailabilityBounds>();
  for (const [key, bounds] of source) {
    clone.set(key, {
      front: new Date(bounds.front.getTime()),
      back: new Date(bounds.back.getTime()),
    });
  }
  return clone;
}

function adoptAvailabilityMap(
  target: Map<string, WindowAvailabilityBounds>,
  source: Map<string, WindowAvailabilityBounds>
) {
  target.clear();
  for (const [key, bounds] of source) {
    target.set(key, {
      front: new Date(bounds.front.getTime()),
      back: new Date(bounds.back.getTime()),
    });
  }
}

function setAvailabilityBoundsForKey(
  availability: Map<string, WindowAvailabilityBounds>,
  key: string,
  frontMs: number,
  backMs: number
) {
  const safeFront = Number.isFinite(frontMs) ? frontMs : backMs;
  const safeBack = Number.isFinite(backMs) ? backMs : frontMs;
  const normalizedFront = Math.min(safeFront, safeBack);
  const normalizedBack = Math.max(safeFront, safeBack);
  const front = new Date(normalizedFront);
  const back = new Date(normalizedBack);
  const existing = availability.get(key);
  if (existing) {
    existing.front = front;
    existing.back = back;
  } else {
    availability.set(key, { front, back });
  }
}

function findPlacementWindow(
  windows: Array<{
    id: string;
    startLocal: Date;
    endLocal: Date;
    key?: string;
    availableStartLocal?: Date;
  }>,
  placement: ScheduleInstance
) {
  if (!placement.window_id) return null;
  const start = new Date(placement.start_utc);
  const match = windows.find(
    (win) => win.id === placement.window_id && isWithinWindow(start, win)
  );
  if (match) return match;
  return windows.find((win) => win.id === placement.window_id) ?? null;
}

function resolvePlacementBlockKey(placement: ScheduleDraftPlacement) {
  const start =
    placement.type === "PROJECT"
      ? placement.instance.start_utc ?? null
      : placement.habit.startUTC ?? null;
  const end =
    placement.type === "PROJECT"
      ? placement.instance.end_utc ?? null
      : placement.habit.endUTC ?? null;
  const baseDescriptor: Parameters<typeof getAvailabilityWindowKey>[0] = {
    dayTypeTimeBlockId:
      placement.type === "PROJECT"
        ? getInstanceWindowValue(
            placement.instance,
            "day_type_time_block_id",
            "dayTypeTimeBlockId"
          )
        : null,
    windowId:
      placement.type === "PROJECT"
        ? getInstanceWindowValue(
            placement.instance,
            "window_id",
            "windowId"
          )
        : placement.type === "HABIT"
        ? placement.habit.windowId ?? null
        : null,
    timeBlockId:
      placement.type === "PROJECT"
        ? getInstanceWindowValue(
            placement.instance,
            "time_block_id",
            "timeBlockId"
          )
        : null,
    startUtc: start,
    endUtc: end,
  };
  const descriptor =
    placement.type === "PROJECT"
      ? {
          ...baseDescriptor,
          dayTypeTimeBlockId: null,
          day_type_time_block_id: null,
          windowId: null,
          window_id: null,
          timeBlockId: null,
          time_block_id: null,
        }
      : baseDescriptor;
  const blockId = getAvailabilityWindowKey(descriptor);
  return { blockId, start, end };
}

function isWithinWindow(
  start: Date,
  win: { startLocal: Date; endLocal: Date }
) {
  return start >= win.startLocal && start < win.endLocal;
}

function describeAvailabilityWindow(
  win: WindowLite,
  startLocal: Date,
  endLocal: Date
) {
  const dayTypeId = win.dayTypeTimeBlockId ?? win.day_type_time_block_id ?? null;
  const isDayTypeWindow = dayTypeId !== null;
  const timeBlockId = isDayTypeWindow
    ? win.id
    : (win as any).time_block_id ?? null;
  return {
    dayTypeTimeBlockId: dayTypeId,
    windowId: isDayTypeWindow ? null : win.id,
    timeBlockId,
    startLocal,
    endLocal,
  } as Parameters<typeof getAvailabilityWindowKey>[0];
}

function isDayTypeWindow(win: WindowLite) {
  return Boolean(
    win.dayTypeTimeBlockId ?? (win as any).day_type_time_block_id ?? null
  );
}

function resolveWindowKind(win: WindowLite): WindowKind {
  const declaredKind =
    typeof win.window_kind === "string"
      ? win.window_kind
      : typeof (win as any).windowKind === "string"
        ? (win as any).windowKind
        : null;
  if (typeof declaredKind === "string" && declaredKind.length > 0) {
    return normalizeBlockType(declaredKind);
  }
  if (isDayTypeWindow(win)) {
    const blockType =
      typeof (win as any).block_type === "string"
        ? (win as any).block_type
        : typeof (win as any).blockType === "string"
          ? (win as any).blockType
          : null;
    return normalizeBlockType(blockType);
  }
  return "DEFAULT";
}

const DATE_CACHE_TIME_ZONE = "America/Chicago";

function dateCacheKey(date: Date) {
  const dayStart = startOfDayInTimeZone(date, DATE_CACHE_TIME_ZONE);
  return formatDateKeyInTimeZone(dayStart, DATE_CACHE_TIME_ZONE);
}

function energyIndex(level?: string | null, options?: { fallback?: number }) {
  const fallback = options?.fallback ?? -1;
  if (!level) return fallback;
  const up = level.toUpperCase();
  const index = ENERGY.LIST.indexOf(up as (typeof ENERGY.LIST)[number]);
  return index === -1 ? fallback : index;
}

function anchorDayForWindow(
  date: Date,
  timeZone: string,
  fromPrevDay?: boolean
) {
  const baseDay = startOfDayInTimeZone(date, timeZone);
  return fromPrevDay
    ? addDaysInTimeZone(baseDay, 1, timeZone)
    : baseDay;
}

function resolveWindowStart(win: WindowLite, date: Date, timeZone: string) {
  if (typeof win.dayTypeStartUtcMs === "number") {
    return new Date(win.dayTypeStartUtcMs);
  }
  const [hour = 0, minute = 0] = win.start_local.split(":").map(Number);
  const anchorDay = anchorDayForWindow(date, timeZone, win.fromPrevDay ?? false);
  return setTimeInTimeZone(anchorDay, timeZone, hour, minute);
}

function resolveWindowEnd(win: WindowLite, date: Date, timeZone: string) {
  if (typeof win.dayTypeEndUtcMs === "number") {
    return new Date(win.dayTypeEndUtcMs);
  }
  const [hour = 0, minute = 0] = win.end_local.split(":").map(Number);
  const anchorDay = anchorDayForWindow(date, timeZone, win.fromPrevDay ?? false);
  let end = setTimeInTimeZone(anchorDay, timeZone, hour, minute);
  const start = resolveWindowStart(win, date, timeZone);
  if (end <= start) {
    const nextDay = addDaysInTimeZone(anchorDay, 1, timeZone);
    end = setTimeInTimeZone(nextDay, timeZone, hour, minute);
  }
  return end;
}

function clampEndToLocalDay(
  startMs: number,
  endMs: number,
  timeZone: string,
  allowCrossMidnight: boolean
) {
  if (allowCrossMidnight) {
    return { endMs, clamped: false };
  }
  const startDate = new Date(startMs);
  const parts = getDateTimeParts(startDate, timeZone);
  const nextDayStart = makeZonedDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day + 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );
  const maxEndMs = nextDayStart.getTime() - 1;
  if (endMs > maxEndMs) {
    return { endMs: maxEndMs, clamped: true };
  }
  return { endMs, clamped: false };
}

function resolveInstanceContext(
  instance: ScheduleInstance | null | undefined,
  habitMap: Map<string, HabitScheduleItem>,
  taskContextById: Map<string, string | null>,
  getProjectGoalMonumentId: (projectId: string) => string | null
): string | null {
  if (!instance) return null;
  if (instance.practice_context_monument_id) {
    return instance.practice_context_monument_id;
  }
  const sourceId = instance.source_id ?? null;
  if (!sourceId) return null;
  if (instance.source_type === "HABIT") {
    const habit = habitMap.get(sourceId);
    return habit?.skillMonumentId ?? null;
  }
  if (instance.source_type === "TASK") {
    return taskContextById.get(sourceId) ?? null;
  }
  if (instance.source_type === "PROJECT") {
    return getProjectGoalMonumentId(sourceId) ?? null;
  }
  return null;
}

function countContextEventsBefore(
  instances: ScheduleInstance[],
  beforeMs: number,
  dayStartMs: number,
  dayEndMs: number,
  habitMap: Map<string, HabitScheduleItem>,
  taskContextById: Map<string, string | null>,
  getProjectGoalMonumentId: (projectId: string) => string | null
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const inst of instances) {
    if (!inst) continue;
    const startMs = new Date(inst.start_utc ?? "").getTime();
    if (!Number.isFinite(startMs)) continue;
    if (startMs >= beforeMs || startMs < dayStartMs || startMs >= dayEndMs)
      continue;
    const contextId = resolveInstanceContext(
      inst,
      habitMap,
      taskContextById,
      getProjectGoalMonumentId
    );
    if (!contextId) continue;
    counts.set(contextId, (counts.get(contextId) ?? 0) + 1);
  }
  return counts;
}

function findLastPracticeContextBefore(
  instances: ScheduleInstance[],
  beforeMs: number,
  habitTypeById: Map<string, string>,
  habitMap: Map<string, HabitScheduleItem>,
  taskContextById: Map<string, string | null>,
  getProjectGoalMonumentId: (projectId: string) => string | null
): string | null {
  let latest: { startMs: number; contextId: string } | null = null;
  for (const inst of instances) {
    if (!inst) continue;
    if (inst.source_type !== "HABIT") continue;
    const habitId = inst.source_id ?? null;
    if (!habitId) continue;
    const habitType = habitTypeById.get(habitId);
    if (habitType !== "PRACTICE") continue;
    const startMs = new Date(inst.start_utc ?? "").getTime();
    if (!Number.isFinite(startMs) || startMs >= beforeMs) continue;
    const contextId = resolveInstanceContext(
      inst,
      habitMap,
      taskContextById,
      getProjectGoalMonumentId
    );
    if (!contextId) continue;
    if (!latest || startMs > latest.startMs) {
      latest = { startMs, contextId };
    }
  }
  return latest?.contextId ?? null;
}

async function fetchPracticeContextHistory(userId: string, client?: Client) {
  const supabase = await ensureClient(client);
  const MAX_RECORDS = 250;
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("practice_context_monument_id, completed_at, end_utc")
    .eq("user_id", userId)
    .eq("source_type", "HABIT")
    .eq("status", "completed")
    .not("practice_context_monument_id", "is", null)
    .order("completed_at", { ascending: false })
    .limit(MAX_RECORDS);

  if (error) {
    throw error;
  }

  const history = new Map<string, Date>();
  for (const record of (data ?? []) as Array<{
    practice_context_monument_id: string | null;
    completed_at: string | null;
    end_utc: string | null;
  }>) {
    const contextId = record.practice_context_monument_id;
    if (!contextId || history.has(contextId)) continue;
    const timestamp = record.completed_at ?? record.end_utc;
    if (!timestamp) continue;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;
    history.set(contextId, date);
  }

  return history;
}
