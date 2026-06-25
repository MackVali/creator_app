import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "../../../types/supabase";
import {
  fetchBacklogNeedingSchedule,
  cleanupTransientInstances,
  fetchInstancesForRange,
  computeDurationMin,
  createInstance,
  createScheduleInstanceCreateBatcher,
  markProjectMissed,
  type ScheduleInstance,
  type ScheduleInstanceCreateBatcher,
} from "./instanceRepo";
import {
  buildProjectItems,
  DEFAULT_PROJECT_DURATION_MIN,
} from "./projects";
import type { ProjectLite } from "./weight";
import {
  pickProjectOverlapLoser,
  type CanonicalGoalRecord,
  type CanonicalProjectRecord,
  getCanonicalProjectGlobalRankUpdates,
} from "./projectOrdering";
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
  normalizeRecurrenceMode,
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
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
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
import type { ConstraintItem } from "./constraints";
import {
  passesTimeBlockConstraints,
  normalizeSet,
  normalizeIdSet,
} from "./constraints";
import { log, type ThrottleOptions } from "@/lib/utils/logGate";
import { MAX_SCHEDULE_LOOKAHEAD_DAYS } from "./limits";
import {
  elapsedMs,
  recordSchedulerPhase,
  recordSchedulerDbWrite,
  schedulerNowMs,
  type SchedulerTiming,
} from "./timing";

type Client = SupabaseClient<Database>;
type ScheduleInstanceInsert =
  Database["public"]["Tables"]["schedule_instances"]["Insert"];
type ScheduleInstanceUpdate =
  Database["public"]["Tables"]["schedule_instances"]["Update"];

const SCHEDULER_DIRECT_WRITE_BATCH_SIZE = 500;
const HABIT_REVALIDATION_CANCEL_BATCH_SIZE = 100;
const PROJECT_RANK_WRITE_BATCH_SIZE = 25;

type CompatibleWindowRecord = {
  id: string;
  key: string;
  startLocal: Date;
  endLocal: Date;
  availableStartLocal: Date;
  energyIdx: number;
  energy?: string | null;
  fromPrevDay?: boolean;
  dayTypeTimeBlockId?: string | null;
  timeBlockId?: string | null;
  locationContextId?: string | null;
  locationContextValue?: string | null;
  isOverlayCandidate?: boolean;
  overlayWindowId?: string | null;
  gateTrace: BlockGateSample;
};

type OverlayWindowBlock = {
  id: string | null;
  startMs: number;
  endMs: number;
};

type OverlayWindowBlockCache = {
  blocksByKey: Map<string, Promise<OverlayWindowBlock[]>>;
  resolvedBlocksByKey: Map<string, OverlayWindowBlock[]>;
};

function createOverlayWindowBlockCache(): OverlayWindowBlockCache {
  return {
    blocksByKey: new Map<string, Promise<OverlayWindowBlock[]>>(),
    resolvedBlocksByKey: new Map<string, OverlayWindowBlock[]>(),
  };
}

export type DynamicOverlayWindowCache = {
  effectiveNow: Date;
  windowsByKey: Map<string, Promise<WindowLite[]>>;
  resolvedWindowsByKey: Map<string, WindowLite[]>;
};

export function createDynamicOverlayWindowCache(
  effectiveNow = new Date()
): DynamicOverlayWindowCache {
  return {
    effectiveNow: new Date(effectiveNow),
    windowsByKey: new Map<string, Promise<WindowLite[]>>(),
    resolvedWindowsByKey: new Map<string, WindowLite[]>(),
  };
}

type DynamicOverlayWindowRow = {
  id?: string | null;
  label?: string | null;
  start_utc?: string | null;
  end_utc?: string | null;
  mode?: string | null;
  block_type?: string | null;
  energy?: string | null;
  location_context_id?: string | null;
  allow_all_instance_types?: boolean | null;
  allow_all_skills?: boolean | null;
  allow_all_monuments?: boolean | null;
  location_context?: {
    id?: string | null;
    value?: string | null;
    label?: string | null;
  } | null;
};

type OverlayWindowInstanceTypeWhitelistRow = {
  overlay_window_id: string | null;
  instance_type: string | null;
};

type OverlayWindowSkillWhitelistRow = {
  overlay_window_id: string | null;
  skill_id: string | null;
};

type OverlayWindowMonumentWhitelistRow = {
  overlay_window_id: string | null;
  monument_id: string | null;
};

type ScheduleSegment = {
  start: number;
  end: number;
};

type AnchorSourceSegment = ScheduleSegment & {
  ownershipKey: string;
};

type SyncInvariantViolationReason =
  | "INVALID_TIME_RANGE"
  | "UNDER_DURATION"
  | "LOCATION_MISMATCH"
  | "WINDOW_KIND_MISMATCH"
  | "SYNC_OVERLAP"
  | "ANCHOR_REUSE"
  | "PARTIAL_ANCHOR_OVERLAP"
  | "WINDOW_UNRESOLVED";

type ResolvedWindowEntry = {
  window: WindowLite;
  startLocal: Date;
  endLocal: Date;
  startMs: number;
  endMs: number;
  key: string;
};

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
const SCHEDULER_HABIT_WINDOW_DEBUG_LOGGING =
  process.env.SCHEDULER_DEBUG_LOGGING === "true";
const SCHEDULER_HABIT_WINDOW_DEBUG_TAG = "[SCHEDULER_HABIT_WINDOWS_DEBUG]";
const HABIT_PLACEMENT_AUDIT_LOGGING =
  process.env.DEBUG_HABIT_PLACEMENT_AUDIT === "true";
const HABIT_PLACEMENT_AUDIT_TAG = "[HABIT_PLACEMENT_AUDIT]";
const HABIT_PLACEMENT_AUDIT_TARGET_NAMES = new Set([
  "BRUSH TEETH",
  "SHOWER",
  "WASH FACE",
  "READ",
  "LATIN",
  "MEDITATE",
  "CHECK NOTIS",
  "RECORD CONTENT",
  "STRETCH",
  "CLEAN ROOM",
  "RUN PROMO",
]);

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

const normalizeHabitPlacementAuditName = (name?: string | null) =>
  (name ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const shouldAuditHabitPlacement = (
  habit: Pick<HabitScheduleItem, "name">
) => {
  if (!HABIT_PLACEMENT_AUDIT_LOGGING) return false;
  return HABIT_PLACEMENT_AUDIT_TARGET_NAMES.has(
    normalizeHabitPlacementAuditName(habit.name)
  );
};

const toAuditIso = (value: Date | string | number | null | undefined) => {
  if (value === null || typeof value === "undefined") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const scheduleInstanceAuditPayload = (
  instance: ScheduleInstance | null | undefined
) => ({
  instanceId: instance?.id ?? null,
  sourceId: instance?.source_id ?? null,
  sourceType: instance?.source_type ?? null,
  status: instance?.status ?? null,
  startUtc: instance?.start_utc ?? null,
  endUtc: instance?.end_utc ?? null,
  locked: instance?.locked ?? null,
  canceledReason: instance?.canceled_reason ?? null,
});

const logHabitPlacementAudit = (
  habit: Pick<HabitScheduleItem, "id" | "name" | "habitType">,
  event: string,
  data?: Record<string, unknown>
) => {
  if (!shouldAuditHabitPlacement(habit)) return;
  log("debug", HABIT_PLACEMENT_AUDIT_TAG, {
    event,
    habitId: habit.id,
    habitName: habit.name ?? null,
    habitType: habit.habitType ?? null,
    ...data,
  });
};

type BlockIdentityCarrier = Partial<
  Record<
    | "dayTypeTimeBlockId"
    | "day_type_time_block_id"
    | "timeBlockId"
    | "time_block_id",
    string | null
  >
>;

const getAuditDayTypeTimeBlockId = (
  value: BlockIdentityCarrier | null | undefined
) => value?.dayTypeTimeBlockId ?? value?.day_type_time_block_id ?? null;

const getAuditTimeBlockId = (
  value: BlockIdentityCarrier | null | undefined
) => value?.timeBlockId ?? value?.time_block_id ?? null;

const habitPlacementWindowAuditPayload = (params: {
  target?: {
    id: string;
    key: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal: Date;
  } | null;
  window?: WindowLite | null;
  targetKey?: string | null;
}) => ({
  windowId: params.window?.id ?? params.target?.id ?? null,
  windowKey: params.targetKey ?? params.target?.key ?? null,
  windowStart: toAuditIso(params.target?.startLocal ?? null),
  windowEnd: toAuditIso(params.target?.endLocal ?? null),
  availableStart: toAuditIso(params.target?.availableStartLocal ?? null),
  timeBlockId: params.window?.id ?? null,
  dayTypeTimeBlockId: getAuditDayTypeTimeBlockId(params.window),
});

const getSegmentOverlapConflict = (
  startMs: number,
  endMs: number,
  segments: ScheduleSegment[]
) => {
  for (const segment of segments) {
    const overlapStart = Math.max(startMs, segment.start);
    const overlapEnd = Math.min(endMs, segment.end);
    if (overlapEnd <= overlapStart) continue;
    return { start: overlapStart, end: overlapEnd };
  }
  return null;
};

const hasContinuousAnchorCoverage = (
  startMs: number,
  endMs: number,
  anchorSegments: ScheduleSegment[]
) => {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return false;
  }

  const segments = anchorSegments
    .filter((segment) => segment.end > startMs && segment.start < endMs)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let coveredUntil = startMs;
  for (const segment of segments) {
    const segmentStart = Math.max(segment.start, startMs);
    const segmentEnd = Math.min(segment.end, endMs);
    if (segmentEnd <= segmentStart) continue;
    if (segmentStart > coveredUntil) {
      return false;
    }
    coveredUntil = Math.max(coveredUntil, segmentEnd);
    if (coveredUntil >= endMs) {
      return true;
    }
  }

  return false;
};

const addMergedScheduleSegment = (
  segments: ScheduleSegment[],
  startMs: number,
  endMs: number
) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  const normalizedStart = Math.floor(startMs);
  const normalizedEnd = Math.floor(endMs);
  if (normalizedEnd <= normalizedStart) return;

  segments.push({ start: normalizedStart, end: normalizedEnd });
  segments.sort((a, b) => a.start - b.start || a.end - b.end);

  let writeIndex = 0;
  for (const segment of segments) {
    if (writeIndex === 0) {
      segments[writeIndex] = segment;
      writeIndex += 1;
      continue;
    }
    const previous = segments[writeIndex - 1];
    if (segment.start <= previous.end) {
      previous.end = Math.max(previous.end, segment.end);
      continue;
    }
    segments[writeIndex] = segment;
    writeIndex += 1;
  }
  segments.length = writeIndex;
};

const addMergedScheduleSegmentToMap = (
  segmentMap: Map<string, ScheduleSegment[]>,
  key: string,
  startMs: number,
  endMs: number
) => {
  const existing = segmentMap.get(key);
  if (existing) {
    addMergedScheduleSegment(existing, startMs, endMs);
    return;
  }
  const segments: ScheduleSegment[] = [];
  addMergedScheduleSegment(segments, startMs, endMs);
  if (segments.length > 0) {
    segmentMap.set(key, segments);
  }
};

function normalizeProjectGlobalRank(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

const subtractScheduleSegments = (
  segments: ScheduleSegment[],
  claimedSegments: ScheduleSegment[]
) => {
  if (claimedSegments.length === 0) {
    return [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  const claims = [...claimedSegments].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
  const available: ScheduleSegment[] = [];

  for (const segment of [...segments].sort(
    (a, b) => a.start - b.start || a.end - b.end
  )) {
    let cursor = segment.start;
    for (const claim of claims) {
      if (claim.end <= cursor) continue;
      if (claim.start >= segment.end) break;
      if (claim.start > cursor) {
        available.push({
          start: cursor,
          end: Math.min(claim.start, segment.end),
        });
      }
      cursor = Math.max(cursor, claim.end);
      if (cursor >= segment.end) break;
    }
    if (cursor < segment.end) {
      available.push({ start: cursor, end: segment.end });
    }
  }

  return available;
};

const getAnchorOwnershipKey = (params: {
  instanceId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  startMs: number;
  endMs: number;
}) => {
  const instanceId = params.instanceId?.trim();
  if (instanceId) {
    return `instance:${instanceId}`;
  }
  return [
    "source",
    params.sourceType ?? "UNKNOWN",
    params.sourceId ?? "UNKNOWN",
    Math.floor(params.startMs),
    Math.floor(params.endMs),
  ].join(":");
};

const addAnchorSourceSegmentToMap = (
  sourceSegmentMap: Map<string, AnchorSourceSegment[]>,
  key: string,
  segment: AnchorSourceSegment
) => {
  const existing = sourceSegmentMap.get(key);
  if (!existing) {
    sourceSegmentMap.set(key, [segment]);
    return;
  }
  const duplicate = existing.some(
    (candidate) =>
      candidate.ownershipKey === segment.ownershipKey &&
      Math.abs(candidate.start - segment.start) < 30 &&
      Math.abs(candidate.end - segment.end) < 30
  );
  if (duplicate) return;
  existing.push(segment);
  existing.sort((a, b) => a.start - b.start || a.end - b.end);
};

const addClaimedAnchorOwnership = (
  claimedOwnershipKeys: Set<string>,
  claimedSegmentsByWindowKey: Map<string, ScheduleSegment[]>,
  key: string,
  segment: AnchorSourceSegment
) => {
  if (claimedOwnershipKeys.has(segment.ownershipKey)) return;
  claimedOwnershipKeys.add(segment.ownershipKey);
  addMergedScheduleSegmentToMap(
    claimedSegmentsByWindowKey,
    key,
    segment.start,
    segment.end
  );
};

const isSegmentFullyCovered = (
  covered: ScheduleSegment,
  covering: ScheduleSegment
) => covered.start >= covering.start && covered.end <= covering.end;

const removeOwnedAnchorSegments = (
  sourceSegments: AnchorSourceSegment[],
  ownedKeys: Set<string> | undefined
) => {
  if (!ownedKeys || ownedKeys.size === 0) {
    return sourceSegments.map(({ start, end }) => ({ start, end }));
  }
  return sourceSegments
    .filter((segment) => !ownedKeys.has(segment.ownershipKey))
    .map(({ start, end }) => ({ start, end }));
};

const isScheduledSyncInstance = (
  instance: ScheduleInstance | null | undefined,
  habitTypeById: Map<string, string>
) =>
  instance?.source_type === "HABIT" &&
  instance.status === "scheduled" &&
  normalizeHabitTypeValue(habitTypeById.get(instance.source_id ?? "")) ===
    "SYNC";

const isScheduledNonSyncAnchorInstance = (
  instance: ScheduleInstance | null | undefined,
  habitTypeById: Map<string, string>
) => {
  if (!instance || instance.status !== "scheduled") return false;
  if (instance.source_type !== "HABIT") return true;
  return (
    normalizeHabitTypeValue(habitTypeById.get(instance.source_id ?? "")) !==
    "SYNC"
  );
};

const getScheduleInstanceRangeMs = (
  instance: ScheduleInstance | null | undefined
) => {
  const startMs = new Date(instance?.start_utc ?? "").getTime();
  const endMs = new Date(instance?.end_utc ?? "").getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return { startMs, endMs };
};

const getUniqueScheduledInstancesForValidation = (
  instances: ScheduleInstance[],
  candidate: ScheduleInstance
) => {
  const byId = new Map<string, ScheduleInstance>();
  const anonymous: ScheduleInstance[] = [];
  for (const instance of instances) {
    if (!instance || instance.status !== "scheduled") continue;
    const id = instance.id ?? null;
    if (id) {
      byId.set(id, instance);
    } else if (instance !== candidate) {
      anonymous.push(instance);
    }
  }
  if (candidate.id) {
    byId.set(candidate.id, candidate);
  } else {
    anonymous.push(candidate);
  }
  return [...byId.values(), ...anonymous];
};

const validateSyncInstanceInvariants = (params: {
  candidate: ScheduleInstance;
  habit: HabitScheduleItem;
  desiredDurationMs: number;
  instances: ScheduleInstance[];
  habitTypeById: Map<string, string>;
  getWindowEntriesForInstance: (instance: ScheduleInstance) => ResolvedWindowEntry[];
  fallbackWindowKey?: string | null;
  fallbackWindow?: WindowLite | null;
}):
  | { ok: true }
  | {
      ok: false;
      reason: SyncInvariantViolationReason;
      blockerId?: string | null;
      anchorId?: string | null;
    } => {
  const {
    candidate,
    habit,
    desiredDurationMs,
    instances,
    habitTypeById,
    getWindowEntriesForInstance,
    fallbackWindowKey = null,
    fallbackWindow = null,
  } = params;
  const candidateRange = getScheduleInstanceRangeMs(candidate);
  if (!candidateRange) return { ok: false, reason: "INVALID_TIME_RANGE" };
  if (candidateRange.endMs - candidateRange.startMs + 1 < desiredDurationMs) {
    return { ok: false, reason: "UNDER_DURATION" };
  }

  const candidateEntries = getWindowEntriesForInstance(candidate).filter(
    (entry) =>
      overlapsHalfOpen(
        entry.startMs,
        entry.endMs,
        candidateRange.startMs,
        candidateRange.endMs
      )
  );
  const candidateWindowKeys = new Set(candidateEntries.map((entry) => entry.key));
  if (candidateWindowKeys.size === 0 && fallbackWindowKey) {
    candidateWindowKeys.add(fallbackWindowKey);
  }
  if (candidateWindowKeys.size === 0) {
    return { ok: false, reason: "WINDOW_UNRESOLVED" };
  }

  const candidateWindow =
    candidateEntries[0]?.window ?? fallbackWindow ?? null;
  if (!doesWindowMatchHabitLocation(habit, candidateWindow)) {
    return { ok: false, reason: "LOCATION_MISMATCH" };
  }
  if (!doesWindowHonorHabitConstraints(habit, candidateWindow)) {
    return { ok: false, reason: "WINDOW_KIND_MISMATCH" };
  }

  const hasSameWindow = (instance: ScheduleInstance) => {
    const entries = getWindowEntriesForInstance(instance);
    for (const entry of entries) {
      if (candidateWindowKeys.has(entry.key)) return true;
    }
    return false;
  };

  const snapshot = getUniqueScheduledInstancesForValidation(
    instances,
    candidate
  );

  for (const instance of snapshot) {
    if (instance === candidate) continue;
    if (candidate.id && instance.id === candidate.id) continue;
    if (!isScheduledSyncInstance(instance, habitTypeById)) continue;
    if (!hasSameWindow(instance)) continue;
    const range = getScheduleInstanceRangeMs(instance);
    if (!range) continue;
    if (
      overlapsHalfOpen(
        candidateRange.startMs,
        candidateRange.endMs,
        range.startMs,
        range.endMs
      )
    ) {
      return {
        ok: false,
        reason: "SYNC_OVERLAP",
        blockerId: instance.id ?? null,
      };
    }
  }

  for (const anchor of snapshot) {
    if (!isScheduledNonSyncAnchorInstance(anchor, habitTypeById)) continue;
    if (!hasSameWindow(anchor)) continue;
    const anchorRange = getScheduleInstanceRangeMs(anchor);
    if (!anchorRange) continue;
    if (
      !overlapsHalfOpen(
        candidateRange.startMs,
        candidateRange.endMs,
        anchorRange.startMs,
        anchorRange.endMs
      )
    ) {
      continue;
    }
    if (
      !isSegmentFullyCovered(
        { start: anchorRange.startMs, end: anchorRange.endMs },
        { start: candidateRange.startMs, end: candidateRange.endMs }
      )
    ) {
      return {
        ok: false,
        reason: "PARTIAL_ANCHOR_OVERLAP",
        anchorId: anchor.id ?? null,
      };
    }

    let ownerCount = 0;
    for (const syncInstance of snapshot) {
      if (!isScheduledSyncInstance(syncInstance, habitTypeById)) continue;
      if (!hasSameWindow(syncInstance)) continue;
      const syncRange =
        syncInstance === candidate
          ? candidateRange
          : getScheduleInstanceRangeMs(syncInstance);
      if (!syncRange) continue;
      if (
        isSegmentFullyCovered(
          { start: anchorRange.startMs, end: anchorRange.endMs },
          { start: syncRange.startMs, end: syncRange.endMs }
        )
      ) {
        ownerCount += 1;
        if (ownerCount > 1) {
          return {
            ok: false,
            reason: "ANCHOR_REUSE",
            anchorId: anchor.id ?? null,
          };
        }
      }
    }
  }

  return { ok: true };
};

const findAnchoredSyncCandidate = (
  startMs: number,
  durationMs: number,
  endLimit: number,
  syncSegments: ScheduleSegment[],
  anchorSegments: ScheduleSegment[]
) => {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(durationMs) ||
    !Number.isFinite(endLimit) ||
    durationMs <= 0
  ) {
    return null;
  }

  const anchors = anchorSegments
    .filter((segment) => segment.end > startMs && segment.start < endLimit)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let anchorIndex = 0;
  let blockedUntil = startMs;
  let guard = 0;

  while (
    anchorIndex < anchors.length &&
    guard <= anchors.length + syncSegments.length + 8
  ) {
    while (
      anchorIndex < anchors.length &&
      anchors[anchorIndex].end <= blockedUntil
    ) {
      anchorIndex += 1;
    }
    if (anchorIndex >= anchors.length) break;

    const firstAnchor = anchors[anchorIndex];
    if (firstAnchor.start < blockedUntil) {
      anchorIndex += 1;
      guard += 1;
      continue;
    }

    const candidateStart = firstAnchor.start;
    let candidateEnd = firstAnchor.end;
    if (candidateEnd > endLimit) {
      anchorIndex += 1;
      guard += 1;
      continue;
    }

    let selectedIndex = anchorIndex;
    while (candidateEnd - candidateStart < durationMs) {
      const nextAnchor = anchors[selectedIndex + 1];
      if (!nextAnchor || nextAnchor.start > candidateEnd) {
        candidateEnd = Number.NaN;
        break;
      }
      if (nextAnchor.end > endLimit) {
        candidateEnd = Number.NaN;
        break;
      }
      candidateEnd = Math.max(candidateEnd, nextAnchor.end);
      selectedIndex += 1;
    }

    while (Number.isFinite(candidateEnd)) {
      const nextAnchor = anchors[selectedIndex + 1];
      if (!nextAnchor || nextAnchor.start >= candidateEnd) break;
      if (nextAnchor.end > endLimit) {
        candidateEnd = Number.NaN;
        break;
      }
      candidateEnd = Math.max(candidateEnd, nextAnchor.end);
      selectedIndex += 1;
    }

    if (!Number.isFinite(candidateEnd)) {
      anchorIndex += 1;
      guard += 1;
      continue;
    }

    if (!hasContinuousAnchorCoverage(candidateStart, candidateEnd, anchors)) {
      anchorIndex += 1;
      guard += 1;
      continue;
    }

    const conflict = getSegmentOverlapConflict(
      candidateStart,
      candidateEnd,
      syncSegments
    );
    if (!conflict) {
      return {
        start: candidateStart,
        end: candidateEnd,
      };
    }

    blockedUntil = Math.max(conflict.end, blockedUntil);
    while (
      anchorIndex < anchors.length &&
      anchors[anchorIndex].end <= blockedUntil
    ) {
      anchorIndex += 1;
    }
    guard += 1;
  }

  return null;
};

export const __schedulerAnchorCoverageForTest = {
  findAnchoredSyncCandidate,
  hasContinuousAnchorCoverage,
  removeOwnedAnchorSegments,
  subtractScheduleSegments,
};

function resolveHabitExplicitEnergy(
  habit: Pick<HabitScheduleItem, "energy">
): string | null {
  if (typeof habit.energy !== "string") return null;
  const energy = habit.energy.trim();
  return energy.length > 0 ? energy.toUpperCase() : null;
}

function logHabitWindowCompatibilityFailureDebug(params: {
  branch: "reservation" | "placement";
  habit: Pick<HabitScheduleItem, "id" | "name" | "habitType" | "skillId" | "skillMonumentId">;
  attempts: Array<{
    locationId: string | null;
    locationValue: string | null;
    daylightPreference: string | null;
    enforceLocation: boolean;
  }>;
  windows: WindowLite[];
}) {
  if (!SCHEDULER_HABIT_WINDOW_DEBUG_LOGGING) return;

  const constraintItem = {
    habitType: params.habit.habitType ?? null,
    skillId: params.habit.skillId ?? null,
    skillMonumentId: params.habit.skillMonumentId ?? null,
  };

  log("debug", SCHEDULER_HABIT_WINDOW_DEBUG_TAG, {
    branch: params.branch,
    habitId: params.habit.id,
    habitName: params.habit.name ?? null,
    habitType: params.habit.habitType ?? null,
    skillId: params.habit.skillId ?? null,
    skillMonumentId: params.habit.skillMonumentId ?? null,
    attempts: params.attempts,
    windows: params.windows.map((window) => ({
      windowId: window.id,
      windowLabel: window.label ?? null,
      windowKind: window.window_kind ?? null,
      allowAllInstanceTypes: window.allowAllInstanceTypes ?? null,
      allowAllHabitTypes: window.allowAllHabitTypes ?? null,
      allowAllSkills: window.allowAllSkills ?? null,
      allowAllMonuments: window.allowAllMonuments ?? null,
      allowedInstanceTypes: window.allowedInstanceTypes ?? null,
      allowedHabitTypes: window.allowedHabitTypes ?? null,
      allowedSkillIds: window.allowedSkillIds ?? null,
      allowedMonumentIds: window.allowedMonumentIds ?? null,
      constraintFailureReason: determineConstraintFailureReason(
        constraintItem,
        window
      ),
    })),
  });
}

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
const DAILY_RECURRENCES = new Set(["daily", "everyday", ""]);
const NONE_RECURRENCE_NEVER_DUE_TYPES = new Set([
  "HABIT",
  "CHORE",
  "SYNC",
  "MEMO",
]);

function habitTypePriority(value?: string | null) {
  const normalized = (value ?? "HABIT").toUpperCase();
  return HABIT_TYPE_PRIORITY[normalized] ?? Number.MAX_SAFE_INTEGER;
}

function compareHabitScheduleOrder(
  a: HabitScheduleItem,
  b: HabitScheduleItem,
  dueInfoByHabitId: Map<string, HabitDueEvaluation>,
  defaultDueMs: number
) {
  const dueA = dueInfoByHabitId.get(a.id);
  const dueB = dueInfoByHabitId.get(b.id);
  const dueDiff =
    (dueA?.dueStart?.getTime() ?? defaultDueMs) -
    (dueB?.dueStart?.getTime() ?? defaultDueMs);
  if (dueDiff !== 0) return dueDiff;
  const typeDiff =
    habitTypePriority(a.habitType) - habitTypePriority(b.habitType);
  if (typeDiff !== 0) return typeDiff;
  const aDuration = Number(
    a.durationMinutes ??
      (a as { duration_minutes?: number | null }).duration_minutes ??
      0
  );
  const bDuration = Number(
    b.durationMinutes ??
      (b as { duration_minutes?: number | null }).duration_minutes ??
      0
  );
  if (aDuration !== bDuration) return bDuration - aDuration;
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (aTime !== bTime) return aTime - bTime;
  return a.name.localeCompare(b.name);
}

function normalizeRecurrenceValue(value: string | null | undefined) {
  if (!value) return "daily";
  return value.toLowerCase().trim();
}

function isDailyRecurrenceValue(
  value: string | null | undefined,
  habitType?: string | null
) {
  const raw = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (
    (raw === "" || raw === "none") &&
    normalizeHabitTypeValue(habitType) === "PRACTICE"
  ) {
    return true;
  }
  if (
    raw === "none" &&
    NONE_RECURRENCE_NEVER_DUE_TYPES.has(normalizeHabitTypeValue(habitType))
  ) {
    return false;
  }
  const recurrence = normalizeRecurrenceValue(value);
  return DAILY_RECURRENCES.has(recurrence) || recurrence === "none";
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

type HabitPlacementNoFitCache = Map<string, true>;

type WindowCacheKeyMetadata = WindowLite & {
  day_type_time_block_id?: string | null;
  time_block_id?: string | null;
  timeBlockId?: string | null;
  overlayWindowId?: string | null;
  overlay_window_id?: string | null;
};

type HabitPlacementNoFitCacheStats = {
  hit: number;
  miss: number;
  set: number;
  bypass: number;
};

type HabitPlacementPass =
  | "initialDaily"
  | "postProject"
  | "cleanup"
  | "nonDaily"
  | "finalSyncRetry";

type HabitPassMetric =
  | "compatibleWindowCalls"
  | "compatibleWindowMs"
  | "candidateWindowsConsidered"
  | "daysConsidered"
  | "eligibilitySkips"
  | "existingInstanceChecks"
  | "asyncReads"
  | "asyncReadMs"
  | "reservationChecks"
  | "practiceHistoryChecks"
  | "sortDedupeMs"
  | "dueEvaluationMs"
  | "prePlacementMs";

type HabitAsyncReadSource =
  | "nonDailyMetadataUpdate"
  | "nonDailyPruneCancel"
  | "nonDailyOverrideClear"
  | "habitOverrideClear"
  | "habitRevalidationCancel"
  | "habitRevalidationMiss"
  | "habitPersistFailureMiss"
  | "habitPersistUpdateExisting"
  | "habitPersistInsertNew"
  | "overlayBlocks"
  | "horizonFetchWindows"
  | "fetchWindows"
  | "dynamicOverlayWindows"
  | "other";

const habitPassTimingSuffix: Record<HabitPlacementPass, string> = {
  initialDaily: "InitialDaily",
  postProject: "PostProject",
  cleanup: "Cleanup",
  nonDaily: "NonDaily",
  finalSyncRetry: "FinalSyncRetry",
};

type PlaceItemCounterSnapshot = {
  calls: number;
  noFit: number;
};

function snapshotPlaceItemCounters(
  timing: SchedulerTiming | null | undefined
): PlaceItemCounterSnapshot | null {
  if (!timing) return null;
  return {
    calls: timing.schedule.placeItem.calls,
    noFit: timing.schedule.placeItem.noFit,
  };
}

function recordHabitPlaceItemDelta(
  timing: SchedulerTiming | null | undefined,
  pass: HabitPlacementPass,
  before: PlaceItemCounterSnapshot | null
) {
  if (!timing || !before) return;
  const calls = Math.max(0, timing.schedule.placeItem.calls - before.calls);
  const noFit = Math.max(0, timing.schedule.placeItem.noFit - before.noFit);
  const counters = timing.schedule.habitPlacementInstrumentation;
  switch (pass) {
    case "initialDaily":
      counters.placeCallsInitialDaily += calls;
      counters.placeNoFitInitialDaily += noFit;
      break;
    case "postProject":
      counters.placeCallsPostProject += calls;
      counters.placeNoFitPostProject += noFit;
      break;
    case "cleanup":
      counters.placeCallsCleanup += calls;
      counters.placeNoFitCleanup += noFit;
      break;
    case "nonDaily":
      counters.placeCallsNonDaily += calls;
      counters.placeNoFitNonDaily += noFit;
      break;
    case "finalSyncRetry":
      counters.placeCallsFinalSyncRetry += calls;
      counters.placeNoFitFinalSyncRetry += noFit;
      break;
  }
}

function recordHabitNoFitCacheStats(
  timing: SchedulerTiming | null | undefined,
  stats: HabitPlacementNoFitCacheStats
) {
  if (!timing) return;
  const counters = timing.schedule.habitPlacementInstrumentation;
  counters.noFitCacheHit += stats.hit;
  counters.noFitCacheMiss += stats.miss;
  counters.noFitCacheSet += stats.set;
  counters.noFitCacheBypass += stats.bypass;
}

function recordHabitPassMetric(
  timing: SchedulerTiming | null | undefined,
  pass: HabitPlacementPass | null | undefined,
  metric: HabitPassMetric,
  value = 1
) {
  if (!timing || !pass || !Number.isFinite(value) || value === 0) return;
  const key = `${metric}${habitPassTimingSuffix[pass]}`;
  const counters = timing.schedule.habitPlacementInstrumentation as Record<
    string,
    number
  >;
  counters[key] = Math.round(((counters[key] ?? 0) + value) * 100) / 100;
}

function recordNonDailyHabitMetric(
  timing: SchedulerTiming | null | undefined,
  metric: string,
  value = 1
) {
  if (!timing || !Number.isFinite(value) || value === 0) return;
  const counters = timing.schedule.habitPlacementInstrumentation as Record<
    string,
    number
  >;
  counters[metric] = Math.round(((counters[metric] ?? 0) + value) * 100) / 100;
}

function recordHabitPlacementWallTime(
  timing: SchedulerTiming | null | undefined,
  pass: HabitPlacementPass,
  ms: number
) {
  if (!timing || !Number.isFinite(ms) || ms <= 0) return;
  const metricByPass: Record<HabitPlacementPass, string> = {
    initialDaily: "habitPlacementInitialDailyMs",
    postProject: "habitPlacementPostProjectMs",
    cleanup: "habitPlacementCleanupMs",
    nonDaily: "habitPlacementNonDailyMs",
    finalSyncRetry: "habitPlacementFinalSyncRetryMs",
  };
  recordNonDailyHabitMetric(timing, metricByPass[pass], ms);
}

function recordHabitAsyncReadSource(
  timing: SchedulerTiming | null | undefined,
  pass: HabitPlacementPass | null | undefined,
  source: HabitAsyncReadSource | null | undefined,
  ms: number
) {
  if (!timing || !pass || !Number.isFinite(ms)) return;
  const sourceName = source ?? "other";
  const key = `${capitalizeTimingSegment(sourceName)}${
    habitPassTimingSuffix[pass]
  }`;
  const sourceTiming = timing.schedule.habitAsyncReadSources[key] ?? {
    count: 0,
    ms: 0,
  };
  sourceTiming.count += 1;
  sourceTiming.ms = Math.round((sourceTiming.ms + ms) * 100) / 100;
  timing.schedule.habitAsyncReadSources[key] = sourceTiming;
}

function capitalizeTimingSegment(value: string) {
  return value.length === 0
    ? value
    : `${value[0].toUpperCase()}${value.slice(1)}`;
}

async function recordHabitAsyncRead<T>(
  timing: SchedulerTiming | null | undefined,
  pass: HabitPlacementPass | null | undefined,
  source: HabitAsyncReadSource | null | undefined,
  read: () => Promise<T>
): Promise<T> {
  const startedAt = schedulerNowMs();
  try {
    return await read();
  } finally {
    const ms = elapsedMs(startedAt);
    recordHabitPassMetric(timing, pass, "asyncReads");
    recordHabitPassMetric(timing, pass, "asyncReadMs", ms);
    recordHabitAsyncReadSource(timing, pass, source, ms);
  }
}

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

type FixedHabitRange = {
  start: Date;
  end: Date;
  durationMin: number;
  timeZone: string;
};

type FixedHabitPersistResult = {
  instance: ScheduleInstance | null;
  decision: HabitDraftPlacement["decision"];
  error: unknown | null;
  range: FixedHabitRange | null;
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
  habitAudit?: HabitAuditReport;
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
  const recurrenceMode = normalizeRecurrenceMode(habit.recurrenceMode);
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

  if (
    recurrenceMode === "INTERVAL" &&
    DAILY_RECURRENCES.has(recurrence)
  ) {
    const allowedWeekdays =
      recurrenceDays && recurrenceDays.length > 0
        ? new Set(recurrenceDays)
        : null;
    let cursor = horizonStart;
    while (cursor.getTime() <= horizonEndMs) {
      if (
        !allowedWeekdays ||
        allowedWeekdays.has(weekdayInTimeZone(cursor, zone))
      ) {
        pushUnique(cursor);
      }
      cursor = addDaysInTimeZone(cursor, 1, zone);
    }
    return results.sort((a, b) => a.getTime() - b.getTime());
  }

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

const inspectBlockingHabitOverlap = (params: {
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
          return {
            result: "SYNC_CAP" as const,
            blockerEndMs: null,
          };
        }
      }
      continue;
    }
    if (normalized === "PRACTICE") {
      continue;
    }
    if (!params.candidateIsSync) {
      return {
        result: "NON_SYNC_OVERLAP" as const,
        blockerEndMs: instEndMs,
      };
    }
  }
  return {
    result: false as const,
    blockerEndMs: null,
  };
};

const hasBlockingHabitOverlap = (params: {
  candidateIsSync: boolean;
  candidateId?: string | null;
  startMs: number;
  endMs: number;
  existingInstances: ScheduleInstance[];
  habitTypeById: Map<string, string>;
}) => {
  return inspectBlockingHabitOverlap(params).result;
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
    const isOverlayBacked = Boolean(instance.overlay_window_id);
    if (instance.locked === true && !isOverlayBacked) continue;
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

type PendingScheduleInstanceInsert = {
  row: ScheduleInstanceInsert;
  onError?: (error: PostgrestError) => void;
};

function createScheduleInstanceInsertBatcher(
  supabase: Client,
  timing?: SchedulerTiming | null
) {
  const pending: PendingScheduleInstanceInsert[] = [];

  return {
    get size() {
      return pending.length;
    },
    enqueue(
      row: ScheduleInstanceInsert,
      onError?: (error: PostgrestError) => void
    ) {
      pending.push({ row, onError });
    },
    async flush() {
      if (pending.length === 0) return;
      const entries = pending.splice(0, pending.length);
      for (
        let index = 0;
        index < entries.length;
        index += SCHEDULER_DIRECT_WRITE_BATCH_SIZE
      ) {
        const batch = entries.slice(
          index,
          index + SCHEDULER_DIRECT_WRITE_BATCH_SIZE
        );
        const flushStartedAt = schedulerNowMs();
        const { error } = await supabase
          .from("schedule_instances")
          .insert(batch.map((entry) => entry.row));
        if (timing) {
          recordSchedulerPhase(
            timing,
            "scheduler.schedule.missed_instance_create_writes",
            elapsedMs(flushStartedAt)
          );
        }
        if (error) {
          for (const entry of batch) {
            entry.onError?.(error);
          }
          continue;
        }
        recordSchedulerDbWrite(timing, "inserts", batch.length);
      }
    },
  };
}

async function insertScheduleInstanceRows(
  supabase: Client,
  rows: ScheduleInstanceInsert[],
  timing?: SchedulerTiming | null
) {
  if (rows.length === 0) return null;
  for (
    let index = 0;
    index < rows.length;
    index += SCHEDULER_DIRECT_WRITE_BATCH_SIZE
  ) {
    const batch = rows.slice(index, index + SCHEDULER_DIRECT_WRITE_BATCH_SIZE);
    const { error } = await supabase.from("schedule_instances").insert(batch);
    if (error) return error;
    recordSchedulerDbWrite(timing, "inserts", batch.length);
  }
  return null;
}

async function cancelScheduleInstancesById(
  supabase: Client,
  ids: string[],
  timing?: SchedulerTiming | null
) {
  if (ids.length === 0) return null;
  const payload = {
    status: "canceled",
  } satisfies ScheduleInstanceUpdate;
  for (const batch of chunkIds(ids, SCHEDULER_DIRECT_WRITE_BATCH_SIZE)) {
    const { error } = await supabase
      .from("schedule_instances")
      .update(payload)
      .in("id", batch);
    if (error) return error;
    recordSchedulerDbWrite(timing, "cancels", batch.length);
  }
  return null;
}

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

const resolveWindowLocationContextId = (
  windowRecord?: (WindowLite & { locationContextId?: string | null }) | null
) => {
  if (!windowRecord) return null;
  const raw =
    typeof windowRecord.location_context_id === "string"
      ? windowRecord.location_context_id
      : typeof windowRecord.locationContextId === "string"
        ? windowRecord.locationContextId
        : null;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const doesWindowMatchHabitLocation = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null
) => {
  if (!windowRecord) return true;
  if (!habit) return false;
  const windowLocationId = resolveWindowLocationContextId(windowRecord);
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
    if (windowLocationId) return windowLocationId === habitLocationId;
    return habitLocationValue ? windowLocationValue === habitLocationValue : false;
  }
  if (windowLocationId) return false;
  return habitLocationValue ? windowLocationValue === habitLocationValue : false;
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

const doesWindowHonorHabitConstraints = (
  habit: HabitScheduleItem | undefined,
  windowRecord: WindowLite | null
) => {
  if (!windowRecord) return true;
  if (!habit) return true;
  if (!doesWindowAllowHabitType(habit, windowRecord)) return false;
  const constraintItem: ConstraintItem = {
    habitType: habit.habitType ?? null,
    skillId: habit.skillId ?? null,
    skillIds: null,
    monumentId: null,
    skillMonumentId: habit.skillMonumentId ?? null,
    monumentIds: null,
  };
  return passesTimeBlockConstraints(constraintItem, windowRecord);
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
  supabase: Client,
  timing?: SchedulerTiming | null
) {
  const startedAt = schedulerNowMs();
  let insertedMissed = 0;
  let canceledDuplicates = 0;
  const missedProjectRows: ScheduleInstanceInsert[] = [];
  const duplicateCancelIds: string[] = [];
  try {
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
      missedProjectRows.push({
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
      insertedMissed += 1;
    } else if (instances.length > 1) {
      // Select canonical and mark extras as canceled
      const canonical = selectCanonical(instances);
      const extras = instances.filter((inst) => inst.id !== canonical.id);
      for (const extra of extras) {
        if (extra.id) {
          duplicateCancelIds.push(extra.id);
        }
        canceledDuplicates += 1;
      }
    }
    // If exactly one, leave it as is
  }
  const insertError = await insertScheduleInstanceRows(
    supabase,
    missedProjectRows,
    timing
  );
  if (insertError) {
    throw new Error(
      `Failed to create missed project instances: ${insertError.message}`
    );
  }
  const cancelError = await cancelScheduleInstancesById(
    supabase,
    duplicateCancelIds,
    timing
  );
  if (cancelError) {
    throw new Error(
      `Failed to cancel duplicate project instances: ${cancelError.message}`
    );
  }
  } finally {
    if (timing) {
      const normalizeProjectInstancesMs = elapsedMs(startedAt);
      timing.schedule.normalizeProjectInstances.ms += normalizeProjectInstancesMs;
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.normalize_project_instances",
        normalizeProjectInstancesMs
      );
      timing.schedule.normalizeProjectInstances.loaded =
        Object.keys(projectsMap).length;
      timing.schedule.normalizeProjectInstances.insertedMissed += insertedMissed;
      timing.schedule.normalizeProjectInstances.canceledDuplicates +=
        canceledDuplicates;
    }
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
    timing?: SchedulerTiming | null;
    targetSourceIds?: {
      PROJECT?: string[];
      HABIT?: string[];
    } | null;
  }
): Promise<ScheduleBacklogResult> {
  const timing = options?.timing ?? null;
  const scheduleStartedAt = schedulerNowMs();
  const recordPhaseSince = (label: string, startedAt: number) => {
    if (!timing) return;
    recordSchedulerPhase(timing, label, elapsedMs(startedAt));
  };
  const habitPlacementNoFitCacheStats: HabitPlacementNoFitCacheStats = {
    hit: 0,
    miss: 0,
    set: 0,
    bypass: 0,
  };
  try {
  const supabase = await ensureClient(client);
  const targetProjectIds = new Set(
    (options?.targetSourceIds?.PROJECT ?? []).filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    )
  );
  const targetHabitIds = new Set(
    (options?.targetSourceIds?.HABIT ?? []).filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    )
  );
  const isTargetedSourceRun =
    targetProjectIds.size > 0 || targetHabitIds.size > 0;
  const overlayReconcileStartedAt = schedulerNowMs();
  await reconcileExpiredOverlayWindows(supabase, userId);
  if (timing) {
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.overlay_reconcile_expired",
      elapsedMs(overlayReconcileStartedAt)
    );
  }
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
  const habitPlacementNoFitCache: HabitPlacementNoFitCache = new Map();
  const habitRevalidationCanceledInstanceIds = new Set<string>();
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

  if (!isTargetedSourceRun) {
    // Clear all existing missed habit instances before starting fresh.
    const missedHabitDeleteStartedAt = schedulerNowMs();
    await supabase
      .from("schedule_instances")
      .delete()
      .eq("user_id", userId)
      .eq("source_type", "HABIT")
      .eq("status", "missed");
    if (timing) {
      const missedHabitDeleteMs = elapsedMs(missedHabitDeleteStartedAt);
      recordSchedulerDbWrite(timing, "deletes");
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.schedule_instance_delete_writes",
        missedHabitDeleteMs
      );
    }
  }

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

  const loadDataStartedAt = schedulerNowMs();
  const missed = await fetchBacklogNeedingSchedule(userId, supabase);
  if (missed.error) {
    result.error = missed.error;
    return result;
  }

  const tasks = await fetchReadyTasks(supabase);
  const allProjectsMap = await fetchAllProjectsMap(supabase);
  const fetchedProjectsMap = await fetchProjectsMap(supabase);
  await normalizeProjectInstances(userId, allProjectsMap, supabase, timing);
  const goals = await fetchGoalsForUser(userId, supabase);
  const fetchedHabits = await fetchHabitsForSchedule(userId, supabase);
  const habits = isTargetedSourceRun
    ? fetchedHabits.filter((habit) => targetHabitIds.has(habit.id))
    : fetchedHabits;
  if (timing) {
    const loadDataMs = elapsedMs(loadDataStartedAt);
    timing.schedule.loadData.ms += loadDataMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.input_loading",
      loadDataMs
    );
    timing.schedule.loadData.counts = {
      missed: missed.data?.length ?? 0,
      tasks: tasks.length,
      allProjects: Object.keys(allProjectsMap).length,
      fetchedProjects: Object.keys(fetchedProjectsMap).length,
      goals: goals.length,
      habits: habits.length,
    };
    timing.schedule.backlog.tasks = tasks.length;
    timing.schedule.backlog.habits = habits.length;
    timing.schedule.backlog.projects = Object.keys(fetchedProjectsMap).length;
  }
  const queueBuildStartedAt = schedulerNowMs();
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
    isDailyRecurrenceValue(habit.recurrence, habit.habitType)
  );
  const nonDailyHabits = habits.filter(
    (habit) => !isDailyRecurrenceValue(habit.recurrence, habit.habitType)
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
    const practiceHistoryStartedAt = schedulerNowMs();
    try {
      practiceHistory = await fetchPracticeContextHistory(userId, supabase);
    } catch (error) {
      log("error", "Failed to load practice context history", error);
      practiceHistory = new Map();
    } finally {
      recordPhaseSince(
        "scheduler.schedule.practice_history_loading",
        practiceHistoryStartedAt
      );
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
  const habitScheduledLocalDays = new Map<string, Set<number>>();
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
    const dayMs = normalized.getTime();
    const existing = habitScheduledLocalDays.get(habitId);
    if (existing) {
      existing.add(dayMs);
      return;
    }
    habitScheduledLocalDays.set(habitId, new Set([dayMs]));
  };
  const clearHabitScheduledStart = (
    habitId: string | null | undefined,
    startInput: Date | string | null | undefined
  ) => {
    if (!habitId || !startInput) return;
    const start =
      startInput instanceof Date
        ? new Date(startInput.getTime())
        : new Date(startInput ?? "");
    if (Number.isNaN(start.getTime())) return;
    const normalized = startOfDayInTimeZone(start, timeZone);
    const scheduledDays = habitScheduledLocalDays.get(habitId);
    if (!scheduledDays) return;
    scheduledDays.delete(normalized.getTime());
    if (scheduledDays.size === 0) {
      habitScheduledLocalDays.delete(habitId);
    }
  };
  const getHabitLastScheduledStart = (habitId: string, day?: Date) => {
    const scheduledDays = habitScheduledLocalDays.get(habitId);
    if (!scheduledDays || scheduledDays.size === 0) return null;
    if (day) {
      const targetDayMs = startOfDayInTimeZone(day, timeZone).getTime();
      return scheduledDays.has(targetDayMs) ? new Date(targetDayMs) : null;
    }
    let latestDayMs: number | null = null;
    for (const scheduledDayMs of scheduledDays) {
      if (latestDayMs === null || scheduledDayMs > latestDayMs) {
        latestDayMs = scheduledDayMs;
      }
    }
    return latestDayMs === null ? null : new Date(latestDayMs);
  };
  // Removed legacy windowSnapshot - now using day-type-aware windows via fetchWindowsForDate
  const goalWeightsById = goals.reduce<Record<string, number>>((acc, goal) => {
    acc[goal.id] = goal.weight ?? 0;
    return acc;
  }, {});

  // Recalculate global ranks before processing (they may be stale)
  const goalsById = new Map<string, CanonicalGoalRecord>();
  for (const goal of goals) {
    if (goal && goal.id) {
      goalsById.set(goal.id, goal);
    }
  }

  const ineligibleProjectCountsByGoalStatus: Record<
    "PAUSED" | "COMPLETED",
    number
  > = {
    PAUSED: 0,
    COMPLETED: 0,
  };
  const projectsMap: Record<string, CanonicalProjectRecord> = {};
  for (const [projectId, project] of Object.entries(fetchedProjectsMap)) {
    const goalId = project.goal_id ?? null;
    if (!goalId) {
      projectsMap[projectId] = project;
      continue;
    }

    const goal = goalsById.get(goalId);
    if (goal?.status && goal.status !== "ACTIVE") {
      ineligibleProjectCountsByGoalStatus[goal.status] =
        (ineligibleProjectCountsByGoalStatus[goal.status] ?? 0) + 1;
      continue;
    }

    projectsMap[projectId] = project;
  }

  logSchedulerDebug("[AUTO_PROJECT_ELIGIBILITY]", {
    eligibleProjectCount: Object.keys(projectsMap).length,
    excludedProjectCount:
      ineligibleProjectCountsByGoalStatus.PAUSED +
      ineligibleProjectCountsByGoalStatus.COMPLETED,
    excludedByGoalStatus: ineligibleProjectCountsByGoalStatus,
  });

  const rankRecalculationStartedAt = schedulerNowMs();
  await recalculateGlobalRanks(projectsMap, supabase);
  recordPhaseSince(
    "scheduler.schedule.project_rank_recalculation",
    rankRecalculationStartedAt
  );

  async function recalculateGlobalRanks(
    projectsMap: Record<string, CanonicalProjectRecord>,
    supabase: Client
  ) {
    const canonicalProjectRankAssignments = getCanonicalProjectGlobalRankUpdates(
      Object.values(projectsMap),
      goalsById
    );
    const projectRankUpdates = canonicalProjectRankAssignments.filter(
      ({ id, global_rank }) => {
        const currentRank = normalizeProjectGlobalRank(
          projectsMap[id]?.global_rank ?? projectsMap[id]?.globalRank
        );
        return currentRank !== global_rank;
      }
    );

    if (projectRankUpdates.length === 0) {
      logSchedulerDebug("[PROJECT_RANK_RECALCULATION]", {
        eligibleProjects: canonicalProjectRankAssignments.length,
        changedRanks: 0,
        skippedWrites: canonicalProjectRankAssignments.length,
      });
      return;
    }

    logSchedulerDebug("[PROJECT_RANK_RECALCULATION]", {
      eligibleProjects: canonicalProjectRankAssignments.length,
      changedRanks: projectRankUpdates.length,
      skippedWrites:
        canonicalProjectRankAssignments.length - projectRankUpdates.length,
    });

    for (
      let i = 0;
      i < projectRankUpdates.length;
      i += PROJECT_RANK_WRITE_BATCH_SIZE
    ) {
      const batch = projectRankUpdates.slice(
        i,
        i + PROJECT_RANK_WRITE_BATCH_SIZE
      );
      await Promise.all(
        batch.map(async ({ id, global_rank }) => {
          await supabase.from("projects").update({ global_rank }).eq("id", id);

          if (projectsMap[id]) {
            projectsMap[id].globalRank = global_rank;
            projectsMap[id].global_rank = global_rank;
          }
        })
      );
    }
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
  const projectSkillLoadingStartedAt = schedulerNowMs();
  try {
    const projectIds = Object.keys(projectsMap);
    if (projectIds.length > 0) {
      projectSkillsMap = await fetchProjectSkillsForProjects(
        projectIds,
        supabase
      );
    }
  } catch (error) {
    log("error", "Failed to fetch project skill links for scheduler mode", error);
    projectSkillsMap = {};
  } finally {
    recordPhaseSince(
      "scheduler.schedule.project_skill_loading",
      projectSkillLoadingStartedAt
    );
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
  const baseStartMs = baseStart.getTime();
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
    if (isTargetedSourceRun && !targetProjectIds.has(project.id)) continue;
    enqueue(project);
  }
  if (debugEnabled) {
    projectDebugCounts.totalProjectsConsidered = queue.length;
  }

  const allProjectIds = new Set(projectQueue.map((p) => p.id));
  const finalQueueProjectIds = new Set(queuedProjectIds);
  const writeThroughResolutionStartedAt = schedulerNowMs();
  recordPhaseSince("scheduler.schedule.queue_building", queueBuildStartedAt);
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
  if (timing) {
    const writeThroughResolutionMs = elapsedMs(writeThroughResolutionStartedAt);
    timing.schedule.writeThroughResolutionMs += writeThroughResolutionMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.write_through_days_resolution",
      writeThroughResolutionMs
    );
    timing.schedule.lookaheadDays = lookaheadDays;
    timing.schedule.effectiveDayLimit = effectiveDayLimit;
    timing.schedule.effectiveHorizonDays = effectiveHorizonDays;
    timing.schedule.backlog.queue = queue.length;
    timing.schedule.backlog.days = effectiveDayLimit;
  }
  const cleanupOffsetLimit = Math.max(effectiveDayLimit, habitWriteLookaheadDays);
  const dedupeWindowDays = Math.max(lookaheadDays, 28);
  const rangeEnd = addDaysInTimeZone(baseStart, dedupeWindowDays, timeZone);
  const writeThroughEnd =
    effectiveDayLimit > 0
      ? addDaysInTimeZone(baseStart, effectiveDayLimit, timeZone)
      : baseStart;
  const cleanupDedupeStartedAt = schedulerNowMs();

  if (!isTargetedSourceRun && writeThroughEnd.getTime() > baseStartMs) {
    const rebuildCancelStartedAt = schedulerNowMs();
    const { error } = await supabase
      .from("schedule_instances")
      .update({
        status: "canceled",
        canceled_reason: "RESCHEDULE_REBUILD",
      })
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .eq("locked", false)
      .gte("start_utc", baseStart.toISOString())
      .lt("start_utc", writeThroughEnd.toISOString());
    if (error) {
      result.error = error;
      return result;
    }
    recordSchedulerDbWrite(timing, "cancels");
    recordPhaseSince(
      "scheduler.schedule.reschedule_rebuild_cancel_writes",
      rebuildCancelStartedAt
    );
  }

  const futureOverridePauses: Array<{
    habitId: string;
    overrideStart: Date;
  }> = [];
  for (const habit of habits) {
    const overrideDate = parseNextDueOverride(habit.nextDueOverride);
    if (!overrideDate) continue;
    const overrideStart = startOfDayInTimeZone(overrideDate, timeZone);
    if (overrideStart.getTime() <= baseStartMs) continue;
    futureOverridePauses.push({ habitId: habit.id, overrideStart });
  }
  if (futureOverridePauses.length > 0) {
    const nextDueOverrideCancelStartedAt = schedulerNowMs();
    for (const { habitId, overrideStart } of futureOverridePauses) {
      const { error } = await supabase
        .from("schedule_instances")
        .update({
          status: "canceled",
          canceled_reason: "NEXT_DUE_OVERRIDE",
        })
        .eq("user_id", userId)
        .eq("source_type", "HABIT")
        .eq("source_id", habitId)
        .eq("status", "scheduled")
        .lt("start_utc", overrideStart.toISOString());
      if (error) {
        result.failures.push({
          itemId: habitId,
          reason: "error",
          detail: error,
        });
      } else {
        canceledHabitIds.push(habitId);
        recordSchedulerDbWrite(timing, "cancels");
      }
    }
    recordPhaseSince(
      "scheduler.schedule.next_due_override_cancel_writes",
      nextDueOverrideCancelStartedAt
    );
  }

  const isRescheduleRebuild = true;

  // Assign canonical instance IDs to all queue items for proper reuse
  const canonicalInstancesStartedAt = schedulerNowMs();
  const { data: canonicalInstances } = await supabase
    .from("schedule_instances")
    .select("id, source_id")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT");
  if (timing) {
    const canonicalInstancesMs = elapsedMs(canonicalInstancesStartedAt);
    timing.schedule.scheduleInstanceQueries.calls += 1;
    timing.schedule.scheduleInstanceQueries.totalMs += canonicalInstancesMs;
    timing.schedule.scheduleInstanceQueries.rows +=
      Array.isArray(canonicalInstances) ? canonicalInstances.length : 0;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.existing_schedule_instance_load",
      canonicalInstancesMs
    );
  }

  const projectToInstanceId = new Map<string, string>();
  for (const inst of (canonicalInstances as
    | { id: string; source_id: string }[]
    | null) ?? []) {
    if (inst.source_id) {
      projectToInstanceId.set(inst.source_id, inst.id);
    }
  }

  if (!isRescheduleRebuild) {
    for (const item of queue) {
      const instanceId = projectToInstanceId.get(item.id);
      if (instanceId) {
        item.instanceId = instanceId;
      }
    }
  } else {
    for (const item of queue) {
      item.instanceId = undefined;
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

  const removeInstancesFromBlockerCache = (ids: Set<string>) => {
    if (ids.size === 0) return;
    for (const [cacheKey, blockers] of blockerCache) {
      const filteredBlockers = blockers.filter(
        (inst) => !inst?.id || !ids.has(inst.id)
      );
      if (filteredBlockers.length === blockers.length) continue;
      if (filteredBlockers.length === 0) {
        blockerCache.delete(cacheKey);
      } else {
        blockerCache.set(cacheKey, filteredBlockers);
      }
    }
  };

  const overlapsSchedulerDay = (instance: ScheduleInstance, day: Date) => {
    const start = new Date(instance.start_utc ?? "");
    const end = new Date(instance.end_utc ?? "");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false;
    }
    const dayStart = startOfDayInTimeZone(day, timeZone);
    const dayEnd = addDaysInTimeZone(dayStart, 1, timeZone);
    return overlapsHalfOpen(
      start.getTime(),
      end.getTime(),
      dayStart.getTime(),
      dayEnd.getTime()
    );
  };

  const addUniqueInstance = (
    target: ScheduleInstance[],
    seenIds: Set<string>,
    instance: ScheduleInstance | null | undefined,
    day: Date
  ) => {
    if (!instance?.id) return;
    if (seenIds.has(instance.id)) return;
    if (instance.status !== "scheduled") return;
    if (!overlapsSchedulerDay(instance, day)) return;
    seenIds.add(instance.id);
    target.push(instance);
  };

  const dedupe = await dedupeScheduledProjects(
    supabase,
    userId,
    baseStart,
    rangeEnd,
    allProjectIds,
    writeThroughEnd,
    debugEnabled,
    timing,
    { cancelExtras: !isTargetedSourceRun }
  );
  if (timing) {
    timing.schedule.cleanupDedupe.dedupeFetched = dedupe.allInstances.length;
    timing.schedule.cleanupDedupe.canceled += Array.from(
      dedupe.canceledByProject.values()
    ).reduce((sum, ids) => sum + ids.length, 0);
  }
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
  if (timing) {
    timing.schedule.cleanupDedupe.overlapInvalidated =
      invalidatedInstanceIds.size;
  }
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
    const overlapHabitMissedStartedAt = schedulerNowMs();
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
    recordPhaseSince(
      "scheduler.schedule.overlap_habit_mark_missed",
      overlapHabitMissedStartedAt
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
  // Overlap-invalidated projects must be treated as fresh placements, so drop their reuse state before reassigning instance IDs.
  for (const projectId of overlapProjectIds) {
    reuseInstanceByProject.delete(projectId);
  }
  for (const [projectId, reuseId] of reuseInstanceByProject) {
    if (
      invalidatedInstanceIds.has(reuseId) &&
      !overlapProjectIds.has(projectId)
    ) {
      reuseInstanceByProject.delete(projectId);
    }
  }
  if (isRescheduleRebuild) {
    reuseInstanceByProject.clear();
  }
  let keptLockedInstances: ScheduleInstance[] = [];
  let keptLockedProjects: ScheduleInstance[] = [];
  const rebuildCanceledInstances: ScheduleInstance[] = [];
  const rebuildCanceledInstanceIds = new Set<string>();
  const rebuildCanceledProjectIds = new Set<string>();
  for (const inst of dedupe.allInstances) {
    if (!inst || inst.status !== "scheduled") continue;
    const isInvalidated = inst.id
      ? invalidatedInstanceIds.has(inst.id)
      : false;
    if (inst.locked === true && !isInvalidated) {
      keptLockedInstances.push(inst);
      if (inst.source_type === "PROJECT") {
        keptLockedProjects.push(inst);
      }
      continue;
    }
    if (inst.source_type !== "PROJECT" && inst.source_type !== "HABIT") {
      continue;
    }
    rebuildCanceledInstances.push(inst);
    if (inst.id) {
      rebuildCanceledInstanceIds.add(inst.id);
    }
    if (inst.source_type === "PROJECT" && inst.source_id) {
      rebuildCanceledProjectIds.add(inst.source_id);
    }
  }

  if (!isTargetedSourceRun && rebuildCanceledInstanceIds.size > 0) {
    const rebuildCancelStartedAt = schedulerNowMs();
    await cancelInstancesAsRescheduleRebuild(
      supabase,
      Array.from(rebuildCanceledInstanceIds)
    );
    recordPhaseSince(
      "scheduler.schedule.reschedule_rebuild_cancel_writes",
      rebuildCancelStartedAt
    );
    if (timing) {
      timing.schedule.cleanupDedupe.canceled += rebuildCanceledInstanceIds.size;
      recordSchedulerDbWrite(timing, "cancels", rebuildCanceledInstanceIds.size);
    }
    for (const inst of rebuildCanceledInstances) {
      if (inst.id) {
        removeInstanceFromBuckets(inst.id);
      }
      if (inst.source_type === "PROJECT" && inst.source_id) {
        reuseInstanceByProject.delete(inst.source_id);
      }
    }
    removeInstancesFromBlockerCache(rebuildCanceledInstanceIds);
    if (rebuildCanceledProjectIds.size > 0) {
      for (const item of queue) {
        if (rebuildCanceledProjectIds.has(item.id)) {
          item.instanceId = undefined;
        }
      }
    }
  }
  if (timing) {
    const cleanupDedupeMs = elapsedMs(cleanupDedupeStartedAt);
    timing.schedule.cleanupDedupe.ms += cleanupDedupeMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.cleanup_dedupe_reconcile",
      cleanupDedupeMs
    );
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
          removal = pickProjectOverlapLoser(
            last,
            current,
            projectItemMap,
            goalsById
          );
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
    const duration = Number(def.duration_min ?? 0);
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

  const shouldTreatProjectAsCompleted = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!instance) return false;
    if (instance.source_type !== "PROJECT") return false;
    if (instance.status !== "completed") return false;
    const completionAnchorMs = new Date(
      instance.completed_at ?? instance.end_utc ?? instance.start_utc ?? ""
    ).getTime();
    if (!Number.isFinite(completionAnchorMs)) return false;
    if (completionAnchorMs < completedRetentionStartMs) return false;
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
      instance.source_type === "HABIT" &&
      normalizeHabitTypeValue(habitType) === "SYNC";
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
      shouldTreatProjectAsCompleted(inst)
    ) {
      completedProjectIds.add(inst.source_id);
    }
    if (inst.status !== "scheduled" || inst.locked !== true) {
      continue;
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

  // Register only locked scheduled blockers before HABIT_PASS_START.
  for (const inst of keptLockedInstances) {
    registerInstanceForOffsets(inst);
  }
  let baseBlockers: ScheduleInstance[] = [...keptLockedInstances];
  const habitPassState = {
    blockingInstances: [] as ScheduleInstance[],
    blockingInstanceIds: new Set<string>(),
  };
  const addHabitBlocker = (inst: ScheduleInstance | null | undefined) => {
    if (!inst) return;
    if (!isBlockingInstance(inst)) return;
    const id = inst.id ?? null;
    if (id && habitPassState.blockingInstanceIds.has(id)) return;
    habitPassState.blockingInstances.push(inst);
    if (id) {
      habitPassState.blockingInstanceIds.add(id);
    }
  };
  for (const inst of keptLockedInstances) {
    if (inst.source_type !== "HABIT") continue;
    addHabitBlocker(inst);
  }

  for (const inst of keptLockedInstances) {
    if (inst.source_type !== "PROJECT") continue;
    const projectId = inst.source_id ?? "";
    if (!projectId) continue;
    keptInstancesByProject.set(projectId, inst);
  }

  if (!isRescheduleRebuild) {
    for (const item of queue) {
      if (item.instanceId) continue;
      const reuseId = reuseInstanceByProject.get(item.id);
      if (!reuseId) continue;
      item.instanceId = reuseId;
      reuseInstanceByProject.delete(item.id);
    }
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

  // Eligible placement queue must preserve canonical global-rank ordering with weight as a secondary tie-breaker.
  queue.sort((a, b) => {
    const aRank = a.globalRank ?? Number.POSITIVE_INFINITY;
    const bRank = b.globalRank ?? Number.POSITIVE_INFINITY;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
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
  const reservedHabitPlacementsByOffset = new Map<
    number,
    Map<string, HabitReservation>
  >();
  const windowCache = new Map<string, WindowLite[]>();
  const overlayBlockCache = createOverlayWindowBlockCache();
  const dynamicOverlayCache = createDynamicOverlayWindowCache(baseDate);
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
        if (timing) {
          timing.schedule.backlog.windowsLoaded += windows.length;
        }

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

    const habitPlacementStartedAt = schedulerNowMs();
    const placeItemBefore = snapshotPlaceItemCounters(timing);
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
      overlayBlockCache,
      dynamicOverlayCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      createBatcher: scheduleInstanceCreateBatch,
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
      clearHabitScheduledStart,
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
      isRescheduleRebuild,
      noFitCache: habitPlacementNoFitCache,
      noFitCacheStats: habitPlacementNoFitCacheStats,
      habitRevalidationCanceledInstanceIds,
      habitTimingPass: "initialDaily",
      timing,
    });
    recordHabitPlaceItemDelta(timing, "initialDaily", placeItemBefore);
    if (timing) {
      const habitPlacementMs = elapsedMs(habitPlacementStartedAt);
      timing.schedule.habitPasses.placementMs += habitPlacementMs;
      recordHabitPlacementWallTime(timing, "initialDaily", habitPlacementMs);
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.habit_placement",
        habitPlacementMs
      );
    }
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

  const safeMissedInsertBatch = createScheduleInstanceInsertBatcher(
    supabase,
    timing
  );
  const scheduleInstanceCreateBatch = createScheduleInstanceCreateBatcher(
    supabase,
    {
      onFlushMs: (ms) => {
        if (!timing || ms <= 0) return;
        recordSchedulerPhase(
          timing,
          "scheduler.schedule.schedule_instance_create_writes",
          ms
        );
      },
      onFlushStats: (stats) => {
        if (!timing) return;
        timing.schedule.createWrites.batchFlushCount += 1;
        timing.schedule.createWrites.batchRowsTotal += stats.rows;
        timing.schedule.createWrites.batchMaxRows = Math.max(
          timing.schedule.createWrites.batchMaxRows,
          stats.maxRows
        );
        timing.schedule.createWrites.batchInsertMs += stats.insertMs;
        timing.schedule.createWrites.batchSelectMs += stats.selectMs;
        timing.schedule.createWrites.batchFlushMs += stats.flushMs;
      },
    }
  );
  const finalSyncRetryCreateBatch = createScheduleInstanceCreateBatcher(
    supabase,
    {
      onFlushMs: (ms) => {
        if (!timing || ms <= 0) return;
        timing.schedule.createWrites.finalSyncRetryBatchedCreateMs += ms;
        recordSchedulerPhase(
          timing,
          "scheduler.schedule.schedule_instance_create_writes",
          ms
        );
      },
      onFlushStats: (stats) => {
        if (!timing) return;
        timing.schedule.createWrites.finalSyncRetryBatchedCreateCount +=
          stats.rows;
      },
    }
  );
  const flushScheduleInstanceCreates = async () => {
    await scheduleInstanceCreateBatch.flush();
  };
  const flushFinalSyncRetryCreates = async () => {
    await finalSyncRetryCreateBatch.flush();
  };
  const flushMissedInstanceCreates = async () => {
    const flushStartedAt = schedulerNowMs();
    await safeMissedInsertBatch.flush();
    recordPhaseSince("scheduler.schedule.missed_instance_flush", flushStartedAt);
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
    const energyResolved = resolveHabitExplicitEnergy(habit) ?? "NO";
    const missedStart = startOfDayInTimeZone(baseStart, timeZone);
    const missedEnd = addDaysInTimeZone(missedStart, 1, timeZone);
    const rawDuration = Number(habit.durationMinutes ?? 0);
    const durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : DEFAULT_HABIT_DURATION_MIN;
    safeMissedInsertBatch.enqueue(
      {
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
      },
      (error) => {
        result.failures.push({
          itemId: habit.id,
          reason: "error",
          detail: error,
        });
      }
    );
    missedHabitIds.add(habit.id);
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
    const overrideClears = new Set<string>();
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
      const metadataUpdateStartedAt = schedulerNowMs();
      const { data, error } = await recordHabitAsyncRead(
        timing,
        "nonDaily",
        "nonDailyMetadataUpdate",
        () =>
          supabase
            .from("schedule_instances")
            .update({ metadata: merged })
            .eq("id", instance.id)
            .select("*")
            .single()
      );
      recordNonDailyHabitMetric(
        timing,
        "nonDailyMetadataUpdateMs",
        elapsedMs(metadataUpdateStartedAt)
      );
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
      const startedAt = schedulerNowMs();
      const scanStartedAt = schedulerNowMs();
      const seen = new Set<string>();
      const bucket: ScheduleInstance[] = [];
      const consider = (inst: ScheduleInstance | null | undefined) => {
        recordHabitPassMetric(timing, "nonDaily", "existingInstanceChecks");
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
      recordNonDailyHabitMetric(
        timing,
        "nonDailyExistingInstanceScanMs",
        elapsedMs(scanStartedAt)
      );
      const sortStartedAt = schedulerNowMs();
      bucket.sort((a, b) => {
        const diff = startValueForInstance(a) - startValueForInstance(b);
        if (diff !== 0) return diff;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
      recordNonDailyHabitMetric(
        timing,
        "nonDailySortDedupeMs",
        elapsedMs(sortStartedAt)
      );
      recordHabitPassMetric(
        timing,
        "nonDaily",
        "sortDedupeMs",
        elapsedMs(startedAt)
      );
      return bucket;
    };

    const shouldPreloadOverlayCaches = nonDailyHabits.some((habit) => {
      const normalizedType =
        habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
      return normalizedType !== "SYNC" && !hasFixedHabitLocalTime(habit);
    });
    if (shouldPreloadOverlayCaches) {
      const preloadStartedAt = schedulerNowMs();
      const preloadDates: Date[] = [];
      for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
        preloadDates.push(
          addDaysInTimeZone(horizonStartLocalDay, offset, timeZone)
        );
      }
      await preloadOverlayWindowCachesForDates({
        supabase,
        dates: preloadDates,
        timeZone,
        userId,
        overlayBlockCache,
        dynamicOverlayCache,
        timing,
      });
      recordNonDailyHabitMetric(
        timing,
        "nonDailyPreloadMs",
        elapsedMs(preloadStartedAt)
      );
    }

    const localDayCacheKey = (day: Date) =>
      formatDateKeyInTimeZone(startOfDayInTimeZone(day, timeZone), timeZone);
    const prepareNonDailyWindowsForDay = async (
      day: Date,
      options?: { recordElapsedMs?: boolean }
    ) => {
      const recordElapsedMs = options?.recordElapsedMs !== false;
      const startedAt = schedulerNowMs();
      const cacheKey = dateCacheKey(day);
      const hadPreparedWindows = windowCache.has(cacheKey);
      recordNonDailyHabitMetric(
        timing,
        hadPreparedWindows
          ? "nonDailyPrepareWindowsForDayCacheHit"
          : "nonDailyPrepareWindowsForDayCacheMiss"
      );
      await prepareWindowsForDay(day);
      if (!hadPreparedWindows && windowCache.has(cacheKey)) {
        recordNonDailyHabitMetric(
          timing,
          "nonDailyPrepareWindowsForDayCacheSet"
        );
      }
      if (recordElapsedMs) {
        recordNonDailyHabitMetric(
          timing,
          "nonDailyPrepareWindowsForDayMs",
          elapsedMs(startedAt)
        );
      }
    };
    if (shouldPreloadOverlayCaches) {
      const preloadPreparedWindowsStartedAt = schedulerNowMs();
      const preloadPreparedWindowDates: Date[] = [];
      for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
        preloadPreparedWindowDates.push(
          addDaysInTimeZone(horizonStartLocalDay, offset, timeZone)
        );
      }
      await Promise.allSettled(
        preloadPreparedWindowDates.map((day) =>
          prepareNonDailyWindowsForDay(day, { recordElapsedMs: false })
        )
      );
      recordNonDailyHabitMetric(
        timing,
        "nonDailyPrepareWindowsForDayPreloadMs",
        elapsedMs(preloadPreparedWindowsStartedAt)
      );
    }
    const nonDailySunlightByDay = new Map<
      string,
      {
        today: SunlightBounds;
        previous: SunlightBounds;
        next: SunlightBounds;
      }
    >();
    const getNonDailySunlightForDay = (day: Date) => {
      const key = localDayCacheKey(day);
      const cached = nonDailySunlightByDay.get(key);
      if (cached) {
        recordNonDailyHabitMetric(timing, "nonDailySunlightCacheHit");
        return cached;
      }
      recordNonDailyHabitMetric(timing, "nonDailySunlightCacheMiss");
      const sunlightOptions =
        typeof timeZoneOffsetMinutes === "number"
          ? { offsetMinutes: timeZoneOffsetMinutes }
          : undefined;
      const bundle = {
        today: resolveSunlightBounds(day, timeZone, location, sunlightOptions),
        previous: resolveSunlightBounds(
          addDaysInTimeZone(day, -1, timeZone),
          timeZone,
          location,
          sunlightOptions
        ),
        next: resolveSunlightBounds(
          addDaysInTimeZone(day, 1, timeZone),
          timeZone,
          location,
          sunlightOptions
        ),
      };
      nonDailySunlightByDay.set(key, bundle);
      recordNonDailyHabitMetric(timing, "nonDailySunlightCacheSet");
      return bundle;
    };
    const nonDailyCompatibleWindowCache = new Map<
      string,
      FetchCompatibleWindowsResult
    >();
    const canCacheNonDailyCompatibleWindows =
      !debugEnabled && parityOptions?.enabled !== true;
    recordNonDailyHabitMetric(
      timing,
      canCacheNonDailyCompatibleWindows
        ? "nonDailyCompatibilityCacheEnabled"
        : "nonDailyCompatibilityCacheDisabled"
    );
    const cloneCompatibleWindowResult = (
      value: FetchCompatibleWindowsResult
    ): FetchCompatibleWindowsResult => ({
      ...value,
      windows: value.windows.map((win) => ({
        ...win,
        startLocal: new Date(win.startLocal),
        endLocal: new Date(win.endLocal),
        availableStartLocal: new Date(win.availableStartLocal),
      })),
      filterCounters: value.filterCounters
        ? { ...value.filterCounters }
        : undefined,
    });
    const nonDailyCompatibleWindowCacheKey = (params: {
      day: Date;
      now?: Date;
      energy: string;
      durationMin: number;
      habitType?: string | null;
      skillId?: string | null;
      skillMonumentId?: string | null;
      locationContextId?: string | null;
      locationContextValue?: string | null;
      daylightPreference: "ALL_DAY" | "DAY" | "NIGHT";
      anchorPreference: "FRONT" | "BACK";
      requireLocationContextMatch: boolean;
      hasExplicitLocationContext: boolean;
    }) =>
      JSON.stringify({
        day: localDayCacheKey(params.day),
        timeZone,
        now: params.now?.toISOString() ?? null,
        energy: params.energy,
        durationMin: params.durationMin,
        habitType: params.habitType ?? null,
        skillId: params.skillId ?? null,
        skillMonumentId: params.skillMonumentId ?? null,
        locationContextId: params.locationContextId ?? null,
        locationContextValue: params.locationContextValue ?? null,
        daylightPreference: params.daylightPreference,
        anchorPreference: params.anchorPreference,
        requireLocationContextMatch: params.requireLocationContextMatch,
        hasExplicitLocationContext: params.hasExplicitLocationContext,
        restMode: isRestMode,
        userId,
        parityEnabled: parityOptions?.enabled === true,
      });

    for (const habit of nonDailyHabits) {
      const nonDailyHabitStartedAt = schedulerNowMs();
      const normalizedType =
        habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
      if (normalizedType === "SYNC") {
        recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
        continue;
      }
      const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
      if (nextDueOverride) {
        const overrideDayStart = startOfDayInTimeZone(
          nextDueOverride,
          timeZone
        );
        const baseStartMs = baseStart.getTime();
        if (baseStartMs < overrideDayStart.getTime()) {
          recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
          continue;
        }
        overrideClears.add(habit.id);
      }

      const nonDailyPlanStartedAt = schedulerNowMs();
      const plan = computeNonDailyChainPlan(
        habit,
        baseDate.toISOString(),
        timeZone
      );
      recordHabitPassMetric(
        timing,
        "nonDaily",
        "dueEvaluationMs",
        elapsedMs(nonDailyPlanStartedAt)
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
      recordHabitPassMetric(
        timing,
        "nonDaily",
        "prePlacementMs",
        elapsedMs(nonDailyHabitStartedAt)
      );
      const resolvedEnergy = resolveHabitExplicitEnergy(habit) ?? "";
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
      const daylightPreference: "ALL_DAY" | "DAY" | "NIGHT" =
        daylightRaw === "DAY" || daylightRaw === "NIGHT"
          ? daylightRaw
          : "ALL_DAY";
      const anchorRaw = habit.windowEdgePreference
        ? String(habit.windowEdgePreference).toUpperCase().trim()
        : "FRONT";
      const anchorPreference: "FRONT" | "BACK" =
        anchorRaw === "BACK" ? "BACK" : "FRONT";
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
        const placeRoleStartedAt = schedulerNowMs();
        try {
          const minStartDate = new Date(params.minStartUtc);
          if (Number.isNaN(minStartDate.getTime())) {
            recordNonDailyHabitMetric(timing, "nonDailySkippedRoleCount");
            return { instance: null, startLocalDay: null };
          }
          let cursorDay = startOfDayInTimeZone(minStartDate, timeZone);
          let firstDay = true;
          while (cursorDay.getTime() <= horizonEndLocalDay.getTime()) {
            const dayLoopStartedAt = schedulerNowMs();
            recordHabitPassMetric(timing, "nonDaily", "daysConsidered");
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
              recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
              recordNonDailyHabitMetric(
                timing,
                "nonDailyDayLoopMs",
                elapsedMs(dayLoopStartedAt)
              );
              cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
              firstDay = false;
              continue;
            }
            const localDayMs = cursorDay.getTime();
            if (blockLocalDays.has(localDayMs)) {
              recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
              recordNonDailyHabitMetric(
                timing,
                "nonDailyDayLoopMs",
                elapsedMs(dayLoopStartedAt)
              );
              cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
              firstDay = false;
              continue;
            }
            if (hasFixedHabitLocalTime(habit)) {
              const fixedRange = buildFixedHabitRange(habit, cursorDay, timeZone);
              if (!fixedRange) {
                recordNonDailyHabitMetric(timing, "nonDailyFailedRoleCount");
                recordNonDailyHabitMetric(
                  timing,
                  "nonDailyDayLoopMs",
                  elapsedMs(dayLoopStartedAt)
                );
                return { instance: null, startLocalDay: null };
              }
              if (
                firstDay &&
                fixedRange.end.getTime() <= minStartDate.getTime()
              ) {
                recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
                recordNonDailyHabitMetric(
                  timing,
                  "nonDailyDayLoopMs",
                  elapsedMs(dayLoopStartedAt)
                );
                cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
                firstDay = false;
                continue;
              }
              const fixedMetadata = mergeNonDailyMetadata(
                params.reuseInstance?.metadata,
                {
                  role: params.role,
                  dueAtUtc: params.dueAtUtc,
                  anchorCompletedAtUtc: plan.anchor.completedAtUtc,
                  chainKey,
                }
              );
              const fixedPlacementStartedAt = schedulerNowMs();
              const fixedResult = await upsertFixedHabitInstance({
                client: supabase,
                userId,
                habit,
                day: cursorDay,
                timeZone,
                existingInstance: params.reuseInstance ?? null,
                metadata: fixedMetadata,
                timing,
                habitTimingPass: "nonDaily",
              });
              const fixedPlacementMs = elapsedMs(fixedPlacementStartedAt);
              recordNonDailyHabitMetric(
                timing,
                "nonDailyPlaceItemInWindowsMs",
                fixedPlacementMs
              );
              recordNonDailyHabitMetric(
                timing,
                "nonDailyPersistMs",
                fixedPlacementMs
              );
              if (
                fixedResult.error ||
                !fixedResult.instance ||
                !fixedResult.range
              ) {
                if (fixedResult.error) {
                  result.failures.push({
                    itemId: habit.id,
                    reason: "error",
                    detail: fixedResult.error,
                  });
                }
                recordNonDailyHabitMetric(
                  timing,
                  "nonDailyDayLoopMs",
                  elapsedMs(dayLoopStartedAt)
                );
                cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
                firstDay = false;
                continue;
              }
              const persisted = fixedResult.instance;
              if (persisted?.id) {
                createdThisRun.add(persisted.id);
                nonDailyReplacementInstanceIds.add(persisted.id);
              }
              registerInstanceForOffsets(persisted);
              recordHabitScheduledStart(habit.id, persisted.start_utc ?? "");
              addHabitBlocker(persisted);
              result.placed.push(persisted);
              result.timeline.push({
                type: "HABIT",
                habit: {
                  id: habit.id,
                  name: habit.name,
                  windowId: null,
                  windowLabel: null,
                  startUTC:
                    persisted.start_utc ?? fixedResult.range.start.toISOString(),
                  endUTC:
                    persisted.end_utc ?? fixedResult.range.end.toISOString(),
                  durationMin: fixedResult.range.durationMin,
                  energyResolved: persisted.energy_resolved ?? null,
                },
                decision: fixedResult.decision,
                scheduledDayOffset: offset,
              });
              recordNonDailyHabitMetric(timing, "nonDailyPlacedRoleCount");
              recordNonDailyHabitMetric(
                timing,
                "nonDailyDayLoopMs",
                elapsedMs(dayLoopStartedAt)
              );
              return { instance: persisted, startLocalDay: cursorDay };
            }
            const candidateBuildStartedAt = schedulerNowMs();
            let candidateBuildAccountedMs = 0;
            const prepareWindowsStartedAt = schedulerNowMs();
            await prepareNonDailyWindowsForDay(cursorDay);
            const prepareWindowsMs = elapsedMs(prepareWindowsStartedAt);
            candidateBuildAccountedMs += prepareWindowsMs;
            const getDayInstancesStartedAt = schedulerNowMs();
            const existingInstancesForDay = getDayInstances(offset);
            const getDayInstancesMs = elapsedMs(getDayInstancesStartedAt);
            candidateBuildAccountedMs += getDayInstancesMs;
            recordNonDailyHabitMetric(
              timing,
              "nonDailyGetDayInstancesMs",
              getDayInstancesMs
            );
            let sunlightBundle: ReturnType<
              typeof getNonDailySunlightForDay
            > | null = null;
            const sunlightStartedAt = schedulerNowMs();
            if (daylightPreference === "ALL_DAY") {
              recordNonDailyHabitMetric(
                timing,
                "nonDailyAllDaySunlightSkipCount"
              );
            } else {
              sunlightBundle = getNonDailySunlightForDay(cursorDay);
            }
            const sunlightMs = elapsedMs(sunlightStartedAt);
            candidateBuildAccountedMs += sunlightMs;
            recordNonDailyHabitMetric(
              timing,
              "nonDailySunlightResolveMs",
              sunlightMs
            );
            const daylightConstraint =
              daylightPreference === "ALL_DAY"
                ? null
                : {
                    preference: daylightPreference as "DAY" | "NIGHT",
                    sunrise: sunlightBundle?.today.sunrise ?? null,
                    sunset: sunlightBundle?.today.sunset ?? null,
                    dawn: sunlightBundle?.today.dawn ?? null,
                    dusk: sunlightBundle?.today.dusk ?? null,
                    previousSunset: sunlightBundle?.previous.sunset ?? null,
                    previousDusk: sunlightBundle?.previous.dusk ?? null,
                    nextDawn:
                      sunlightBundle?.next.dawn ??
                      sunlightBundle?.next.sunrise ??
                      null,
                    nextSunrise: sunlightBundle?.next.sunrise ?? null,
                  };
            const nightSunlightBundle =
              daylightConstraint?.preference === "NIGHT"
                ? {
                    today: sunlightBundle?.today ?? {
                      sunrise: null,
                      sunset: null,
                      dawn: null,
                      dusk: null,
                    },
                    previous: sunlightBundle?.previous ?? {
                      sunrise: null,
                      sunset: null,
                      dawn: null,
                      dusk: null,
                    },
                    next: sunlightBundle?.next ?? {
                      sunrise: null,
                      sunset: null,
                      dawn: null,
                      dusk: null,
                    },
                  }
                : null;
            const compatibleNow =
              horizonStartLocalDay.getTime() === cursorDay.getTime()
                ? baseDate
                : undefined;
            const hasExplicitLocationContext =
              Boolean(locationContextId) || Boolean(locationContextValue);
            const compatibleFetchOuterStartedAt = schedulerNowMs();
            const compatibleCacheKey = nonDailyCompatibleWindowCacheKey({
              day: cursorDay,
              now: compatibleNow,
              energy: resolvedEnergy,
              durationMin,
              habitType: habit.habitType,
              skillId: habit.skillId ?? null,
              skillMonumentId: habit.skillMonumentId ?? null,
              locationContextId,
              locationContextValue,
              daylightPreference,
              anchorPreference,
              requireLocationContextMatch: true,
              hasExplicitLocationContext,
            });
            const cachedCompatibleDayResult = canCacheNonDailyCompatibleWindows
              ? nonDailyCompatibleWindowCache.get(compatibleCacheKey)
              : undefined;
            if (canCacheNonDailyCompatibleWindows) {
              recordNonDailyHabitMetric(
                timing,
                cachedCompatibleDayResult
                  ? "nonDailyCompatibilityCacheHit"
                  : "nonDailyCompatibilityCacheMiss"
              );
            } else {
              recordNonDailyHabitMetric(
                timing,
                "nonDailyCompatibilityCacheBypass"
              );
              if (debugEnabled) {
                recordNonDailyHabitMetric(
                  timing,
                  "nonDailyCompatibilityCacheBypassDebug"
                );
              }
              if (parityOptions?.enabled === true) {
                recordNonDailyHabitMetric(
                  timing,
                  "nonDailyCompatibilityCacheBypassParity"
                );
              }
            }
            const compatibleDayResult = cachedCompatibleDayResult
              ? cloneCompatibleWindowResult(cachedCompatibleDayResult)
              : await fetchCompatibleWindowsForItem(
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
                    now: compatibleNow,
                    cache: windowCache,
                    overlayBlockCache,
                    dynamicOverlayCache,
                    restMode: isRestMode,
                    userId,
                    parity: parityOptions,
                    locationContextId,
                    locationContextValue,
                    daylight: daylightConstraint,
                    enforceNightSpan:
                      daylightConstraint?.preference === "NIGHT",
                    nightSunlight: nightSunlightBundle,
                    anchor: anchorPreference,
                    requireLocationContextMatch: true,
                    hasExplicitLocationContext,
                    locationDebugContext,
                    timing,
                    habitTimingPass: "nonDaily",
                  }
                );
            if (
              canCacheNonDailyCompatibleWindows &&
              !cachedCompatibleDayResult
            ) {
              nonDailyCompatibleWindowCache.set(
                compatibleCacheKey,
                cloneCompatibleWindowResult(compatibleDayResult)
              );
              recordNonDailyHabitMetric(
                timing,
                "nonDailyCompatibilityCacheSet"
              );
            }
            const compatibleFetchOuterMs = elapsedMs(
              compatibleFetchOuterStartedAt
            );
            candidateBuildAccountedMs += compatibleFetchOuterMs;
            recordNonDailyHabitMetric(
              timing,
              "nonDailyFetchCompatibleWindowsOuterMs",
              compatibleFetchOuterMs
            );
            const candidateBuildMs = elapsedMs(candidateBuildStartedAt);
            recordNonDailyHabitMetric(
              timing,
              "nonDailyCandidateBuildMs",
              candidateBuildMs
            );
            recordNonDailyHabitMetric(
              timing,
              "nonDailyCandidateBuildOtherMs",
              Math.max(0, candidateBuildMs - candidateBuildAccountedMs)
            );
            const compatibleWindows = compatibleDayResult.windows;
          if (compatibleWindows.length === 0) {
            recordHabitPassMetric(timing, "nonDaily", "eligibilitySkips");
            recordNonDailyHabitMetric(
              timing,
              "nonDailyDayLoopMs",
              elapsedMs(dayLoopStartedAt)
            );
            cursorDay = addDaysInTimeZone(cursorDay, 1, timeZone);
            firstDay = false;
            continue;
          }
          recordHabitPassMetric(
            timing,
            "nonDaily",
            "candidateWindowsConsidered",
            compatibleWindows.length
          );
          const placementStartedAt = schedulerNowMs();
          const persistWriteBefore =
            timing?.schedule.placeItem.persistWriteMs ?? 0;
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
            createBatcher: scheduleInstanceCreateBatch,
            metadata: mergeNonDailyMetadata(params.reuseInstance?.metadata, {
              role: params.role,
              dueAtUtc: params.dueAtUtc,
              anchorCompletedAtUtc: plan.anchor.completedAtUtc,
              chainKey,
            }),
            debugEnabled,
            timing,
          });
          recordNonDailyHabitMetric(
            timing,
            "nonDailyPlaceItemInWindowsMs",
            elapsedMs(placementStartedAt)
          );
          recordNonDailyHabitMetric(
            timing,
            "nonDailyPersistMs",
            Math.max(
              0,
              (timing?.schedule.placeItem.persistWriteMs ?? 0) -
                persistWriteBefore
            )
          );
          if (!("status" in placement)) {
            if (placement.error && placement.error !== "NO_FIT") {
              result.failures.push({
                itemId: habit.id,
                reason: "error",
                detail: placement.error,
              });
            }
            recordNonDailyHabitMetric(
              timing,
              "nonDailyDayLoopMs",
              elapsedMs(dayLoopStartedAt)
            );
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
            recordNonDailyHabitMetric(
              timing,
              "nonDailyDayLoopMs",
              elapsedMs(dayLoopStartedAt)
            );
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
          recordNonDailyHabitMetric(timing, "nonDailyPlacedRoleCount");
          recordNonDailyHabitMetric(
            timing,
            "nonDailyDayLoopMs",
            elapsedMs(dayLoopStartedAt)
          );
          return { instance: persisted, startLocalDay: cursorDay };
        }
          recordNonDailyHabitMetric(timing, "nonDailyFailedRoleCount");
          return { instance: null, startLocalDay: null };
        } finally {
          recordNonDailyHabitMetric(
            timing,
            "nonDailyPlaceRoleMs",
            elapsedMs(placeRoleStartedAt)
          );
        }
      };

      const nonDailyRoleLoopStartedAt = schedulerNowMs();
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
      recordNonDailyHabitMetric(
        timing,
        "nonDailyRoleLoopMs",
        elapsedMs(nonDailyRoleLoopStartedAt)
      );

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
        const pruneCancelStartedAt = schedulerNowMs();
        await recordHabitAsyncRead(
          timing,
          "nonDaily",
          "nonDailyPruneCancel",
          () =>
            cancelScheduleInstance(inst.id, {
              reason: "NON_DAILY_CHAIN_PRUNE",
            })
        );
        recordNonDailyHabitMetric(
          timing,
          "nonDailyPruneCancelMs",
          elapsedMs(pruneCancelStartedAt)
        );
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

    if (overrideClears.size > 0) {
      const overrideClearStartedAt = schedulerNowMs();
      const { error } = await recordHabitAsyncRead(
        timing,
        "nonDaily",
        "nonDailyOverrideClear",
        () =>
          supabase
            .from("habits")
            .update({ next_due_override: null })
            .eq("user_id", userId)
            .in("id", Array.from(overrideClears))
      );
      recordNonDailyHabitMetric(
        timing,
        "nonDailyOverrideClearMs",
        elapsedMs(overrideClearStartedAt)
      );
      if (error) {
        log("error", "[HABIT_OVERRIDE_CLEAR]", {
          error,
          habitIds: Array.from(overrideClears),
        });
      }
    }

    return nonDailyReplacementInstanceIds;
  };
  const initialHabitPassStartedAt = schedulerNowMs();
  const nonDailyHabitPassStartedAt = schedulerNowMs();
  const nonDailyPlaceItemBefore = snapshotPlaceItemCounters(timing);
  nonDailyReplacementInstanceIds =
    await scheduleNonDailyHabitsAcrossHorizon(nonDailyHabits);
  recordHabitPlaceItemDelta(timing, "nonDaily", nonDailyPlaceItemBefore);
  const nonDailyHabitPassMs = elapsedMs(nonDailyHabitPassStartedAt);
  recordHabitPlacementWallTime(timing, "nonDaily", nonDailyHabitPassMs);
  if (timing) {
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.non_daily_habit_pass",
      nonDailyHabitPassMs
    );
  }
  await flushMissedInstanceCreates();
  await flushScheduleInstanceCreates();
  const syncPostPassStartedAt = schedulerNowMs();
  const scheduleSyncHabitsAcrossHorizon = async () => {
    logSchedulerDebug("[SCHEDULER_ORDER] SYNC_PAIRING_POST_PASS_START");

    const syncInstancesCreated: ScheduleInstance[] = [];
    const syncPairingsByInstanceId: Record<string, string[]> = {};
    const claimedPartnerInstanceIds = new Set<string>();
    const scheduledInstanceLookup = new Map<string, ScheduleInstance>();
    const registerSyncCandidate = (inst: ScheduleInstance | null | undefined) => {
      if (!inst?.id || inst.status !== "scheduled") return;
      if (inst.source_type === "HABIT") {
        const habitType = habitTypeById.get(inst.source_id ?? "") ?? "HABIT";
        if (normalizeHabitTypeValue(habitType) === "SYNC") return;
      }
      scheduledInstanceLookup.set(inst.id, inst);
    };

    for (const inst of keptLockedInstances) {
      registerSyncCandidate(inst);
    }
    for (const bucket of dayInstancesByOffset.values()) {
      for (const inst of bucket) {
        registerSyncCandidate(inst);
      }
    }
    recordPhaseSince(
      "scheduler.schedule.sync_candidate_building",
      syncPostPassStartedAt
    );

    const allScheduledInstances = Array.from(scheduledInstanceLookup.values());
    const syncHabitsDue: Map<
      string,
      { habit: HabitScheduleItem; minOffset: number }
    > = new Map();

    const syncDueEvaluationStartedAt = schedulerNowMs();
    for (let offset = 0; offset < effectiveDayLimit; offset += 1) {
      const day =
        offset === 0
          ? baseStart
          : addDaysInTimeZone(baseStart, offset, timeZone);

      for (const habit of habits) {
        const normalizedType =
          habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
        if (normalizedType !== "SYNC") continue;

        const windowDays = habit.windowId ? null : habit.window?.days ?? null;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone,
          windowDays,
          lastScheduledStart: null,
          nextDueOverride,
        });
        if (!dueInfo.isDue) continue;

        const existing = syncHabitsDue.get(habit.id);
        if (!existing || offset < existing.minOffset) {
          syncHabitsDue.set(habit.id, { habit, minOffset: offset });
        }
      }
    }
    if (timing) {
      const syncDueEvaluationMs = elapsedMs(syncDueEvaluationStartedAt);
      timing.schedule.habitPasses.dueEvaluationMs += syncDueEvaluationMs;
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.habit_due_evaluation",
        syncDueEvaluationMs
      );
    }

    const uniqueSyncHabits = Array.from(syncHabitsDue.values());
    const syncCandidatePairingStartedAt = schedulerNowMs();
    for (const syncEntry of uniqueSyncHabits) {
      const habit = syncEntry.habit;
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
          ) {
            return null;
          }
          return {
            start,
            end,
            id: inst.id as string,
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

      if (!syncResult.finalStart || !syncResult.finalEnd) {
        continue;
      }
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
      const syncInstanceCreateStartedAt = schedulerNowMs();
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
      recordPhaseSince(
        "scheduler.schedule.sync_instance_create_writes",
        syncInstanceCreateStartedAt
      );

      if (!syncInstance?.id) {
        continue;
      }
      recordSchedulerDbWrite(timing, "inserts", 1);

      syncInstancesCreated.push(syncInstance);
      const syncStartMs = new Date(startUtc).getTime();
      const syncEndMs = new Date(endUtc).getTime();
      const pairedValid = (syncResult.pairedInstances ?? []).filter((id) => {
        const partner = scheduledInstanceLookup.get(id) ?? null;
        if (!partner || !partner.start_utc || !partner.end_utc) return false;
        const partnerStart = new Date(partner.start_utc).getTime();
        const partnerEnd = new Date(partner.end_utc).getTime();
        if (!Number.isFinite(partnerStart) || !Number.isFinite(partnerEnd)) {
          return false;
        }
        return partnerEnd > syncStartMs && partnerStart < syncEndMs;
      });
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
        scheduledDayOffset: 0,
        availableStartLocal: syncResult.finalStart.toISOString(),
        windowStartLocal: null,
        instanceId: syncInstance.id,
      });

      registerInstanceForOffsets(syncInstance);
      addHabitBlocker(syncInstance);
    }
    recordPhaseSince(
      "scheduler.schedule.sync_candidate_pairing",
      syncCandidatePairingStartedAt
    );

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
        const syncPairingPersistStartedAt = schedulerNowMs();
        const { error: pairingError } = await supabase
          .from("schedule_sync_pairings")
          .upsert(pairingRows, { onConflict: "sync_instance_id" });
        const syncPairingPersistMs = elapsedMs(syncPairingPersistStartedAt);
        if (pairingError) {
          result.failures.push({
            itemId: "sync-pairings-persist",
            reason: "error",
            detail: pairingError,
          });
        } else {
          recordSchedulerDbWrite(timing, "upserts", pairingRows.length);
          if (timing) {
            timing.schedule.syncPairings.persistedRows += pairingRows.length;
            timing.schedule.syncPairings.lookupMs += syncPairingPersistMs;
            recordSchedulerPhase(
              timing,
              "scheduler.schedule.sync_pairing_lookup",
              syncPairingPersistMs
            );
            recordSchedulerPhase(
              timing,
              "scheduler.schedule.schedule_instance_upsert_writes",
              syncPairingPersistMs
            );
          }
        }
      }
    }

    logSchedulerDebug("[SCHEDULER_ORDER] SYNC_PAIRING_POST_PASS_END", {
      syncInstancesCreated: syncInstancesCreated.length,
    });

    return syncPairingsByInstanceId;
  };
  result.syncPairings = await scheduleSyncHabitsAcrossHorizon();
  recordPhaseSince("scheduler.schedule.sync_post_pass", syncPostPassStartedAt);
  if (timing) {
    timing.schedule.habitPasses.totalMs += elapsedMs(initialHabitPassStartedAt);
  }

  logSchedulerDebug("[SCHEDULER_ORDER] HABIT_PASS_END", {
    habitCount: habitPassState.blockingInstances.length,
    samples: habitPassState.blockingInstances.slice(0, 5).map((inst) => ({
      id: inst.id,
      source_id: inst.source_id,
      start_utc: inst.start_utc,
      end_utc: inst.end_utc,
    })),
  });

  const invalidLockedProjectInstanceIds: string[] = [];
  const invalidLockedProjectIds = new Set<string>();
  if (keptLockedProjects.length > 0) {
    const lockedProjectRevalidationStartedAt = schedulerNowMs();
    const validatedLockedProjects: ScheduleInstance[] = [];
    for (const instance of keptLockedProjects) {
      const instanceId = instance.id ?? null;
      if (!instanceId) {
        validatedLockedProjects.push(instance);
        continue;
      }
      const dayTypeTimeBlockId =
        (instance as any).dayTypeTimeBlockId ??
        (instance as any).day_type_time_block_id ??
        null;
      if (!dayTypeTimeBlockId) {
        validatedLockedProjects.push(instance);
        continue;
      }
      const start = safeDate(instance.start_utc);
      if (!start) {
        validatedLockedProjects.push(instance);
        continue;
      }
      const day = startOfDayInTimeZone(start, timeZone);
      await prepareWindowsForDay(day);
      const windowsForDay = getWindowsForDay(day);
      const targetWindow = windowsForDay.find(
        (win) =>
          (win.dayTypeTimeBlockId ??
            (win as any).day_type_time_block_id ??
            null) === dayTypeTimeBlockId
      );
      if (!targetWindow) {
        validatedLockedProjects.push(instance);
        continue;
      }
      const projectId = instance.source_id ?? "";
      if (!projectId) {
        validatedLockedProjects.push(instance);
        continue;
      }
      const projectGoalMonumentId = getProjectGoalMonumentId(projectId);
      const constraintItem: ConstraintItem = {
        habitType: null,
        skillId: null,
        skillIds: getProjectSkillIds(projectId),
        monumentId: projectGoalMonumentId,
        skillMonumentId: null,
        monumentIds: projectGoalMonumentId ? [projectGoalMonumentId] : null,
        isProject: true,
        allowEmptyProjectCandidates: true,
      };
      if (passesTimeBlockConstraints(constraintItem, targetWindow)) {
        validatedLockedProjects.push(instance);
        continue;
      }
      invalidLockedProjectInstanceIds.push(instanceId);
      invalidLockedProjectIds.add(projectId);
      logCancel("PROJECT_CONSTRAINT_REVALIDATION", instance, {
        dayKey: formatDateKeyInTimeZone(day, timeZone),
        dayOffset: dayOffsetFor(instance.start_utc ?? "") ?? null,
      });
    }
    keptLockedProjects = validatedLockedProjects;
    if (invalidLockedProjectInstanceIds.length > 0) {
      const invalidInstanceIdSet = new Set(invalidLockedProjectInstanceIds);
      const invalidLockedCancelStartedAt = schedulerNowMs();
      await cancelInstancesAsRescheduleRebuild(
        supabase,
        invalidLockedProjectInstanceIds
      );
      recordPhaseSince(
        "scheduler.schedule.reschedule_rebuild_cancel_writes",
        invalidLockedCancelStartedAt
      );
      keptLockedInstances = keptLockedInstances.filter(
        (inst) => !invalidInstanceIdSet.has(inst.id ?? "")
      );
      keptLockedProjects = keptLockedInstances.filter(
        (inst) => inst.source_type === "PROJECT"
      );
      if (invalidLockedProjectIds.size > 0) {
        for (const item of queue) {
          if (invalidLockedProjectIds.has(item.id)) {
            item.instanceId = undefined;
          }
        }
      }
    }
    recordPhaseSince(
      "scheduler.schedule.locked_project_revalidation",
      lockedProjectRevalidationStartedAt
    );
  }
  baseBlockers = [...keptLockedInstances];

  const dedupedProjectQueue = queue;

  const habitReservationPassStartedAt = schedulerNowMs();
  for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
    const allowSchedulingToday = offset < effectiveDayLimit;
    const shouldScheduleHabits =
      allowSchedulingToday && offset < habitWriteLookaheadDays;
    if (!shouldScheduleHabits) {
      continue;
    }

    let windowAvailability = windowAvailabilityByDay.get(offset);
    if (!windowAvailability) {
      windowAvailability = new Map<string, WindowAvailabilityBounds>();
      windowAvailabilityByDay.set(offset, windowAvailability);
    }

    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);
    await prepareWindowsForDay(day);

    const reservationStartedAt = schedulerNowMs();
    const reservedPlacements = await reserveMandatoryHabitsForDay({
      userId,
      habits: dailyHabits,
      day,
      offset,
      timeZone,
      parity: parityOptions,
      availability: windowAvailability,
      baseDate,
      windowCache,
      overlayBlockCache,
      dynamicOverlayCache,
      maxGapCache: dayMaxGapCache,
      client: supabase,
      sunlightLocation: location,
      timeZoneOffsetMinutes,
      durationMultiplier,
      restMode: isRestMode,
      existingInstances: getDayInstances(offset),
      getWindowsForDay,
      getLastScheduledHabitStart: getHabitLastScheduledStart,
      audit: habitAudit,
      debugEnabled,
      isRescheduleRebuild,
      timing,
    });
    if (timing) {
      const reservationMs = elapsedMs(reservationStartedAt);
      timing.schedule.habitPasses.reservationMs += reservationMs;
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.habit_reservation",
        reservationMs
      );
    }

    const overlapInvalidated = overlapInvalidatedHabitsByOffset.get(offset);
    if (overlapInvalidated && overlapInvalidated.length > 0) {
      for (const instance of overlapInvalidated) {
        const habitId = instance.source_id ?? null;
        if (!habitId) continue;
        const reservation = reservedPlacements.get(habitId) ?? null;
        if (!reservation) continue;
        if (reservation.availabilitySnapshot) {
          windowAvailability.set(reservation.windowKey, {
            front: new Date(reservation.availabilitySnapshot.front.getTime()),
            back: new Date(reservation.availabilitySnapshot.back.getTime()),
          });
        } else {
          windowAvailability.delete(reservation.windowKey);
        }
        reservedPlacements.delete(habitId);
      }
    }

    reservedHabitPlacementsByOffset.set(offset, reservedPlacements);
  }
  recordPhaseSince(
    "scheduler.schedule.habit_reservation_pass",
    habitReservationPassStartedAt
  );

  const initialDailyHabitPassStartedAt = schedulerNowMs();
  for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
    const allowSchedulingToday = offset < effectiveDayLimit;
    const shouldScheduleHabits =
      allowSchedulingToday && offset < habitWriteLookaheadDays;
    if (!shouldScheduleHabits) {
      continue;
    }

    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);
    const windowAvailability = windowAvailabilityByDay.get(offset);
    if (!windowAvailability) {
      continue;
    }

    await ensureHabitPlacementsForDay(
      offset,
      day,
      windowAvailability,
      reservedHabitPlacementsByOffset.get(offset)
    );
  }
  recordPhaseSince(
    "scheduler.schedule.initial_daily_habit_pass",
    initialDailyHabitPassStartedAt
  );

  const isScheduledTimedProjectBlocker = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!instance) return false;
    if (instance.status !== "scheduled") return false;
    const start = safeDate(instance.start_utc);
    const end = safeDate(instance.end_utc);
    if (!start || !end) return false;
    return end.getTime() > start.getTime();
  };
  const isScheduledTimedHabitBlocker = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (!isScheduledTimedProjectBlocker(instance)) return false;
    const sourceType =
      instance?.source_type ??
      ((instance as { sourceType?: string | null }).sourceType ?? null);
    return sourceType === "HABIT";
  };

  // ===== PROJECT REBUILD PASS (ONE SHOT) =====
  logSchedulerDebug("[SCHEDULER] ENTER project placement pass", {
    runId: Math.random().toString(36).substring(7),
  });

  logSchedulerDebug("[SCHEDULER_BLOCKERS] PROJECT_PASS_START", {
    lockedProjectCount: baseBlockers.filter((b) => b.source_type === "PROJECT")
      .length,
    habitBlockingCount: habitPassState.blockingInstances.length,
    syncHabitCount: habitPassState.blockingInstances.filter(
      (h) => normalizeHabitTypeValue(habitTypeById.get(h.source_id ?? "")) === "SYNC"
    ).length,
  });

  // Build a live blocker list for project placement: locked blockers + habit blockers.
  let projectPassLegacyWindowCount = 0;
  const projectPassBaseBlockers = baseBlockers.filter((inst) => {
    if (!isScheduledTimedProjectBlocker(inst)) {
      return false;
    }
    if (inst.source_type !== "PROJECT") {
      return false;
    }
    const legacyWindowBlocker = isLegacyWindowBoundInstance(inst);
    if (legacyWindowBlocker) {
      projectPassLegacyWindowCount += 1;
    }
    return true;
  });
  const projectPassLockedProjectCount = projectPassBaseBlockers.length;
  const projectPassState = {
    queue: dedupedProjectQueue,
    dayWindowsCache: projectDayWindowsCache,
    blockingInstances: [] as ScheduleInstance[],
    blockingInstanceIds: new Set<string>(),
  };
  placementDebugCollector?.setQueuedCount(projectPassState.queue.length);
  const addProjectBlocker = (inst: ScheduleInstance | null | undefined) => {
    if (!inst) return;
    const id = inst.id ?? null;
    if (id && projectPassState.blockingInstanceIds.has(id)) return;
    projectPassState.blockingInstances.push(inst);
    if (id) {
      projectPassState.blockingInstanceIds.add(id);
    }
  };
  for (const inst of baseBlockers) {
    if (!isScheduledTimedProjectBlocker(inst)) continue;
    addProjectBlocker(inst);
  }
  for (const inst of habitPassState.blockingInstances) {
    if (!isScheduledTimedHabitBlocker(inst)) continue;
    addProjectBlocker(inst);
  }
  const attempted = new Set<string>();
  const scheduledProjectIds = new Set<string>();
  const projectAttemptCounts = new Map<string, number>();
  const projectAttemptLimit = 1;
  const projectPassStartedAt = schedulerNowMs();
  if (timing) {
    timing.schedule.projectPass.queued = projectPassState.queue.length;
    timing.schedule.backlog.blockers = projectPassState.blockingInstances.length;
  }

  for (const item of projectPassState.queue) {
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
    const projectGoalMonumentId = getProjectGoalMonumentId(item.id);
    const projectGoalMonumentIds =
      projectGoalMonumentId !== null ? [projectGoalMonumentId] : null;
    // Create window availability for project placement (fresh per project)
    const projectWindowAvailability = new Map<string, WindowAvailabilityBounds>();
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
    const blockingCounts = projectPassState.blockingInstances.reduce(
      (acc, inst) => {
        acc.total += 1;
        acc.bySourceType[inst.source_type ?? "UNKNOWN"] =
          (acc.bySourceType[inst.source_type ?? "UNKNOWN"] ?? 0) + 1;
        return acc;
      },
      { total: 0, bySourceType: {} as Record<string, number> }
    );

    const habitInstances = projectPassState.blockingInstances.filter(
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

    const projectBlockerDiagnostics = projectPassState.blockingInstances.reduce(
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
      blockers_total: projectPassState.blockingInstances.length,
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
        if (projectPassState.dayWindowsCache.has(dayCacheKey)) {
          schedulerDebugSummary.probe.dayWindowsCacheHits += 1;
        } else {
          schedulerDebugSummary.probe.dayWindowsCacheMisses += 1;
        }
      }

      // Get windows for this specific day
      await prepareWindowsForDay(currentDay);
      const preloadedDayWindows = getWindowsForDay(currentDay);
      const preloadedDayWindowCount = preloadedDayWindows.length;
      const projectSkillIds = getProjectSkillIds(item.id);
      const compatibleDayResult = await fetchCompatibleWindowsForItem(
        supabase,
        currentDay,
        {
          ...item,
          isProject: true,
          skillIds: projectSkillIds,
          monumentId: projectGoalMonumentId,
          monumentIds: projectGoalMonumentIds,
          allowEmptyProjectCandidates: Boolean(item.instanceId),
        },
        timeZone,
        {
          availability: projectWindowAvailability,
          cloneAvailabilityBeforeMutating: true,
          forceDayScopedAvailabilityKey: true,
          now: dayOffset === 0 ? baseDate : undefined, // Only apply "now" constraint on first day
          cache: projectPassState.dayWindowsCache,
          overlayBlockCache,
          dynamicOverlayCache,
          restMode: isRestMode,
          userId,
          parity: parityOptions,
          preloadedWindows: preloadedDayWindows,
          locationDebugContext,
          trackFilterCounters: debugEnabled,
          timing,
          // Don't use horizonEnd here - we're searching day by day
        }
        );
        const compatibleWindows = compatibleDayResult.windows;
        const compatibleFilterCounters = compatibleDayResult.filterCounters;
        placementDebugCollector?.recordDayScan(item.id, {
          dayOffset,
          blocksConsidered: preloadedDayWindowCount,
          candidatesGenerated: compatibleWindows.length,
        filterCounters: compatibleFilterCounters,
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
        for (const win of compatibleWindows) {
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
          windowsAfterFetchCompatible: compatibleWindows.length,
        };
      }

      if (compatibleWindows.length === 0) continue;
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
        windows: compatibleWindows,
        date: currentDay, // Use the current day we're searching
        timeZone,
        client: supabase,
        ignoreProjectIds: new Set([item.id]),
        notBefore: dayOffset === 0 ? baseDate : undefined, // Only apply notBefore on first day
        existingInstances: projectPassState.blockingInstances,
        habitTypeById,
        maxGapCache: dayMaxGapCache,
        blockerCache,
        createBatcher: scheduleInstanceCreateBatch,
        windowEdgePreference: null,
        debugEnabled,
        timing,
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
                    compatibleWindows.length > 0 &&
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
      placementWindow = findPlacementWindow(compatibleWindows, placed.data);
      break; // Stop searching - we found a slot
    }

    // Process the placement result
    if (!placedData) {
      // Failed to place anywhere in the horizon
      const debugInfo = `NO_FIT: duration=${item.duration_min}, energy=${item.energy}, horizon_days=${effectiveHorizonDays}`;

      if (!item.instanceId) {
        // Create missed instance with reason
        safeMissedInsertBatch.enqueue(
          {
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
          },
          (error) => {
            log("error", "Failed to create missed instance:", error);
          }
        );
      } else {
        // Update existing instance with detailed reason
        const missedReasonUpdateStartedAt = schedulerNowMs();
        const { error: updateError } = await supabase
          .from("schedule_instances")
          .update({ missed_reason: debugInfo })
          .eq("id", item.instanceId);
        recordPhaseSince(
          "scheduler.schedule.missed_instance_update_writes",
          missedReasonUpdateStartedAt
        );
        if (updateError) {
          log("error", "Failed to update missed reason:", updateError);
        } else {
          recordSchedulerDbWrite(timing, "updates", 1);
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
    addProjectBlocker(placedData);
  }

  logSchedulerDebug("[SCHEDULER] EXIT project placement pass");
  if (timing) {
    const projectPassMs = elapsedMs(projectPassStartedAt);
    timing.schedule.projectPass.ms += projectPassMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.project_task_placement",
      projectPassMs
    );
    timing.schedule.projectPass.placed = scheduledProjectIds.size;
    timing.schedule.projectPass.failed = Math.max(
      0,
      projectPassState.queue.length - scheduledProjectIds.size
    );
  }
  await flushMissedInstanceCreates();
  // ==========================================

  const postProjectHabitPassStartedAt = schedulerNowMs();
  for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
    const allowSchedulingToday = offset < effectiveDayLimit;
    const shouldScheduleHabits =
      allowSchedulingToday && offset < habitWriteLookaheadDays;
    if (!shouldScheduleHabits) continue;

    let windowAvailability = windowAvailabilityByDay.get(offset);
    if (!windowAvailability) {
      windowAvailability = new Map<string, WindowAvailabilityBounds>();
      windowAvailabilityByDay.set(offset, windowAvailability);
    }

    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);
    await prepareWindowsForDay(day);
    const habitPlacementStartedAt = schedulerNowMs();
    const placeItemBefore = snapshotPlaceItemCounters(timing);
    const dayResult = await scheduleHabitsForDay({
      userId,
      habits: dailyHabits,
      day,
      offset,
      timeZone,
      parity: parityOptions,
      availability: windowAvailability,
      baseDate,
      windowCache,
      overlayBlockCache,
      dynamicOverlayCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      createBatcher: scheduleInstanceCreateBatch,
      client: supabase,
      sunlightLocation: location,
      timeZoneOffsetMinutes,
      durationMultiplier,
      restMode: isRestMode,
      existingInstances: getDayInstances(offset),
      registerInstance: registerInstanceForOffsets,
      getWindowsForDay,
      getLastScheduledHabitStart: getHabitLastScheduledStart,
      recordHabitScheduledStart,
      clearHabitScheduledStart,
      createdThisRun,
      logCancel,
      habitMap: habitById,
      taskContextById,
      contextTaskCounts,
      practiceHistory,
      effectiveLastCompletedAt,
      getProjectGoalMonumentId,
      reservedPlacements: reservedHabitPlacementsByOffset.get(offset),
      audit: habitAudit,
      debugEnabled,
      nonDailyHabitIds,
      nonDailyReplacementInstanceIds,
      isRescheduleRebuild,
      noFitCache: habitPlacementNoFitCache,
      noFitCacheStats: habitPlacementNoFitCacheStats,
      habitRevalidationCanceledInstanceIds,
      habitTimingPass: "postProject",
      timing,
    });
    recordHabitPlaceItemDelta(timing, "postProject", placeItemBefore);
    if (timing) {
      const habitPlacementMs = elapsedMs(habitPlacementStartedAt);
      timing.schedule.habitPasses.placementMs += habitPlacementMs;
      recordHabitPlacementWallTime(timing, "postProject", habitPlacementMs);
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.habit_placement",
        habitPlacementMs
      );
    }

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
  }
  if (timing) {
    const postProjectHabitPassMs = elapsedMs(postProjectHabitPassStartedAt);
    timing.schedule.habitPasses.totalMs += postProjectHabitPassMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.post_project_habit_pass",
      postProjectHabitPassMs
    );
  }

  if (!isTargetedSourceRun) {
    const habitPassRemovedInstanceIds = new Set<string>();
    for (const bucket of dayInstancesByOffset.values()) {
      for (let index = bucket.length - 1; index >= 0; index -= 1) {
        const inst = bucket[index];
        if (!inst) continue;
        if (inst.status !== "scheduled") continue;
        if (inst.locked === true) continue;
        if (inst.source_type !== "PROJECT" && inst.source_type !== "HABIT") {
          continue;
        }
        if (inst.id) {
          habitPassRemovedInstanceIds.add(inst.id);
        }
        bucket.splice(index, 1);
      }
    }
    removeInstancesFromBlockerCache(habitPassRemovedInstanceIds);
  }

  const cleanupHabitPassStartedAt = schedulerNowMs();
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
    const reservedPlacements = reservedHabitPlacementsByOffset.get(offset);
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

    if (shouldScheduleHabits && !isRescheduleRebuild) {
      await ensureHabitPlacementsForDay(
        offset,
        day,
        windowAvailability,
        reservedPlacements
      );
    } else if (shouldScheduleHabits) {
      logSchedulerDebug(
        "[SCHEDULER] Skipping post-project habit ensure during reschedule rebuild",
        { offset, day: formatDateKeyInTimeZone(day, timeZone) }
      );
    } else {
      const hasHabitInstances = dayInstances.some(
        (inst) => inst?.source_type === "HABIT" && inst.status === "scheduled"
      );
      if (hasHabitInstances) {
        const habitPlacementStartedAt = schedulerNowMs();
        const placeItemBefore = snapshotPlaceItemCounters(timing);
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
      overlayBlockCache,
      dynamicOverlayCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      createBatcher: scheduleInstanceCreateBatch,
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
          clearHabitScheduledStart,
          createdThisRun,
          logCancel,
          habitMap: habitById,
          taskContextById,
          contextTaskCounts,
        practiceHistory,
        effectiveLastCompletedAt,
        getProjectGoalMonumentId,
        allowScheduling: false,
        onPersistedHabit: addHabitBlocker,
        audit: habitAudit,
        debugEnabled,
        nonDailyHabitIds,
        nonDailyReplacementInstanceIds,
        isRescheduleRebuild,
        noFitCache: habitPlacementNoFitCache,
        noFitCacheStats: habitPlacementNoFitCacheStats,
        habitRevalidationCanceledInstanceIds,
        habitTimingPass: "cleanup",
        timing,
      });
        recordHabitPlaceItemDelta(timing, "cleanup", placeItemBefore);
        if (timing) {
          const habitPlacementMs = elapsedMs(habitPlacementStartedAt);
          timing.schedule.habitPasses.placementMs += habitPlacementMs;
          recordHabitPlacementWallTime(timing, "cleanup", habitPlacementMs);
          recordSchedulerPhase(
            timing,
            "scheduler.schedule.habit_placement",
            habitPlacementMs
          );
        }
        if (cleanupResult.failures.length > 0) {
          result.failures.push(...cleanupResult.failures);
        }
      }
    }
  }
  if (timing) {
    const cleanupHabitPassMs = elapsedMs(cleanupHabitPassStartedAt);
    timing.schedule.habitPasses.totalMs += cleanupHabitPassMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.cleanup_habit_pass",
      cleanupHabitPassMs
    );
  }

  const runFinalSyncRetryForDay = async (offset: number, day: Date) => {
    recordNonDailyHabitMetric(timing, "finalSyncRetryDaysConsidered");
    let windowAvailability = windowAvailabilityByDay.get(offset);
    if (!windowAvailability) {
      windowAvailability = new Map<string, WindowAvailabilityBounds>();
      windowAvailabilityByDay.set(offset, windowAvailability);
    }

    await prepareWindowsForDay(day);

    const finalDayInstances: ScheduleInstance[] = [];
    const seenIds = new Set<string>();
    for (const inst of getDayInstances(offset)) {
      addUniqueInstance(finalDayInstances, seenIds, inst, day);
    }
    for (const inst of result.placed) {
      addUniqueInstance(finalDayInstances, seenIds, inst, day);
    }
    for (const inst of keptInstancesByProject.values()) {
      addUniqueInstance(finalDayInstances, seenIds, inst, day);
    }
    for (const inst of dedupe.allInstances) {
      const sourceId = inst?.source_id ?? null;
      const isScheduledSyncHabit =
        inst?.source_type === "HABIT" &&
        sourceId !== null &&
        normalizeHabitTypeValue(habitTypeById.get(sourceId)) === "SYNC";
      if (inst?.source_type === "PROJECT") {
        continue;
      }
      if (inst?.source_type === "HABIT" && !isScheduledSyncHabit) {
        continue;
      }
      addUniqueInstance(finalDayInstances, seenIds, inst, day);
    }

    const finalDayStartMs = startOfDayInTimeZone(day, timeZone).getTime();
    const finalSyncDueInfoByHabitId = new Map<string, HabitDueEvaluation>();
    const getFinalDayScheduledHabitStart = (
      habitId: string,
      targetDay = day
    ) => {
      const targetDayMs = startOfDayInTimeZone(targetDay, timeZone).getTime();
      for (const inst of finalDayInstances) {
        if (
          inst?.source_type !== "HABIT" ||
          inst.status !== "scheduled" ||
          inst.source_id !== habitId ||
          !inst.start_utc
        ) {
          continue;
        }
        const instStart = new Date(inst.start_utc);
        if (Number.isNaN(instStart.getTime())) continue;
        const instDayMs = startOfDayInTimeZone(instStart, timeZone).getTime();
        if (instDayMs === targetDayMs) {
          return new Date(instDayMs);
        }
      }
      return null;
    };

    const finalSyncCandidateBuildStartedAt = schedulerNowMs();
    const finalSyncHabits = dailyHabits
      .filter((habit) => {
        const normalizedType =
          habitTypeById.get(habit.id) ??
          normalizeHabitTypeValue(habit.habitType);
        if (normalizedType !== "SYNC") return false;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const overrideDayStart = nextDueOverride
          ? startOfDayInTimeZone(nextDueOverride, timeZone)
          : null;
        if (
          overrideDayStart &&
          overrideDayStart.getTime() < finalDayStartMs &&
          isDailyRecurrenceValue(habit.recurrence, habit.habitType)
        ) {
          return false;
        }
        const windowDays = habit.windowId ? null : habit.window?.days ?? null;
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone,
          windowDays,
          lastScheduledStart: getFinalDayScheduledHabitStart(habit.id, day),
          nextDueOverride,
        });
        finalSyncDueInfoByHabitId.set(habit.id, dueInfo);
        return true;
      })
      .sort((a, b) =>
        compareHabitScheduleOrder(
          a,
          b,
          finalSyncDueInfoByHabitId,
          finalDayStartMs
        )
      );
    recordNonDailyHabitMetric(
      timing,
      "finalSyncRetryCandidateBuildMs",
      elapsedMs(finalSyncCandidateBuildStartedAt)
    );
    recordNonDailyHabitMetric(
      timing,
      "finalSyncRetryEligibleHabitCount",
      finalSyncHabits.length
    );
    if (finalSyncHabits.length === 0) {
      return;
    }

    const habitPlacementStartedAt = schedulerNowMs();
    const placeItemBefore = snapshotPlaceItemCounters(timing);
    const createWritesBefore =
      (timing?.schedule.createWrites.syncImmediateCreateMs ?? 0) +
      (timing?.schedule.createWrites.nonSyncBatchedCreateMs ?? 0) +
      (timing?.schedule.createWrites.finalSyncRetryBatchedCreateMs ?? 0);
    const finalResult = await scheduleHabitsForDay({
      userId,
      habits: finalSyncHabits,
      day,
      offset,
      timeZone,
      parity: parityOptions,
      availability: windowAvailability,
      baseDate,
      windowCache,
      overlayBlockCache,
      dynamicOverlayCache,
      maxGapCache: dayMaxGapCache,
      blockerCache,
      createBatcher: finalSyncRetryCreateBatch,
      client: supabase,
      sunlightLocation: location,
      timeZoneOffsetMinutes,
      durationMultiplier,
      restMode: isRestMode,
      existingInstances: finalDayInstances,
      registerInstance: registerInstanceForOffsets,
      getWindowsForDay,
      getLastScheduledHabitStart: getFinalDayScheduledHabitStart,
      recordHabitScheduledStart,
      clearHabitScheduledStart,
      createdThisRun,
      logCancel,
      habitMap: habitById,
      taskContextById,
      contextTaskCounts,
      practiceHistory,
      effectiveLastCompletedAt,
      getProjectGoalMonumentId,
      audit: habitAudit,
      debugEnabled,
      nonDailyHabitIds,
      nonDailyReplacementInstanceIds,
      isRescheduleRebuild,
      postAnchorSyncRetry: true,
      noFitCache: habitPlacementNoFitCache,
      noFitCacheStats: habitPlacementNoFitCacheStats,
      habitRevalidationCanceledInstanceIds,
      habitTimingPass: "finalSyncRetry",
      timing,
    });
    recordNonDailyHabitMetric(
      timing,
      "finalSyncRetryScheduleHabitsForDayMs",
      elapsedMs(habitPlacementStartedAt)
    );
    const createWritesAfter =
      (timing?.schedule.createWrites.syncImmediateCreateMs ?? 0) +
      (timing?.schedule.createWrites.nonSyncBatchedCreateMs ?? 0) +
      (timing?.schedule.createWrites.finalSyncRetryBatchedCreateMs ?? 0);
    recordNonDailyHabitMetric(
      timing,
      "finalSyncRetryCreateWritesMs",
      Math.max(0, createWritesAfter - createWritesBefore)
    );
    recordHabitPlaceItemDelta(timing, "finalSyncRetry", placeItemBefore);
    if (timing) {
      const habitPlacementMs = elapsedMs(habitPlacementStartedAt);
      timing.schedule.habitPasses.placementMs += habitPlacementMs;
      recordHabitPlacementWallTime(timing, "finalSyncRetry", habitPlacementMs);
      recordSchedulerPhase(
        timing,
        "scheduler.schedule.habit_placement",
        habitPlacementMs
      );
    }

    if (finalResult.placements.length > 0) {
      result.timeline.push(...finalResult.placements);
    }
    if (finalResult.instances.length > 0) {
      result.placed.push(...finalResult.instances);
      for (const inst of finalResult.instances) {
        addHabitBlocker(inst);
      }
    }
    if (finalResult.failures.length > 0) {
      result.failures.push(...finalResult.failures);
    }
  };

  const finalSyncHabitPassStartedAt = schedulerNowMs();
  for (let offset = 0; offset < habitWriteLookaheadDays; offset += 1) {
    const allowSchedulingToday = offset < effectiveDayLimit;
    const shouldScheduleHabits =
      allowSchedulingToday && offset < habitWriteLookaheadDays;
    if (!shouldScheduleHabits) continue;

    const day =
      offset === 0 ? baseStart : addDaysInTimeZone(baseStart, offset, timeZone);
    await runFinalSyncRetryForDay(offset, day);
  }
  const finalSyncRetryCreateWritesBefore =
    (timing?.schedule.createWrites.syncImmediateCreateMs ?? 0) +
    (timing?.schedule.createWrites.nonSyncBatchedCreateMs ?? 0) +
    (timing?.schedule.createWrites.finalSyncRetryBatchedCreateMs ?? 0);
  await flushFinalSyncRetryCreates();
  const finalSyncRetryCreateWritesAfter =
    (timing?.schedule.createWrites.syncImmediateCreateMs ?? 0) +
    (timing?.schedule.createWrites.nonSyncBatchedCreateMs ?? 0) +
    (timing?.schedule.createWrites.finalSyncRetryBatchedCreateMs ?? 0);
  recordNonDailyHabitMetric(
    timing,
    "finalSyncRetryCreateWritesMs",
    Math.max(
      0,
      finalSyncRetryCreateWritesAfter - finalSyncRetryCreateWritesBefore
    )
  );
  if (timing) {
    const finalSyncHabitPassMs = elapsedMs(finalSyncHabitPassStartedAt);
    timing.schedule.habitPasses.totalMs += finalSyncHabitPassMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.final_sync_retry_pass",
      finalSyncHabitPassMs
    );
  }

  const postPlacementReconcileStartedAt = schedulerNowMs();
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
      const overlapProjectMissedStartedAt = schedulerNowMs();
      await invalidateInstancesAsMissed(
        supabase,
        unscheduledOverlapIds,
        result
      );
      recordPhaseSince(
        "scheduler.schedule.overlap_project_mark_missed",
        overlapProjectMissedStartedAt
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
  recordPhaseSince(
    "scheduler.schedule.post_placement_reconciliation",
    postPlacementReconcileStartedAt
  );

  await flushMissedInstanceCreates();
  await flushScheduleInstanceCreates();
  const finalInvariantStartedAt = schedulerNowMs();
  const finalRangeResponse = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase,
    { suppressQueryLog: debugEnabled, timing }
  );
  if (finalRangeResponse.error) {
    throw finalRangeResponse.error;
  }
  const finalInstances = (finalRangeResponse.data ?? []) as ScheduleInstance[];
  if (timing) {
    timing.schedule.finalInvariant.fetched = finalInstances.length;
  }
  const finalInvariantInstances = buildFinalInvariantInstances(
    finalInstances,
    habitTypeById
  );
  if (timing) {
    timing.schedule.finalInvariant.scanned = finalInvariantInstances.length;
  }
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
  const { canceled: cancelIdSet } = collectFinalInvariantCancels(
    nonProjectInstances,
    {
      nonDailyHabitIds,
      replacementInstanceIds: nonDailyReplacementInstanceIds,
    }
  );
  if (!isTargetedSourceRun && cancelIdSet.size > 0) {
    for (const id of cancelIdSet) {
      logCancel(
        "FINAL_INVARIANT_CANCEL_BULK",
        finalInstanceById.get(id) ?? null
      );
    }
    const finalInvariantCancelStartedAt = schedulerNowMs();
    await cancelInstancesAsIllegalOverlap(supabase, Array.from(cancelIdSet));
    recordPhaseSince(
      "scheduler.schedule.final_invariant_cancel_writes",
      finalInvariantCancelStartedAt
    );
    if (timing) {
      timing.schedule.finalInvariant.canceled += cancelIdSet.size;
      recordSchedulerDbWrite(timing, "cancels", cancelIdSet.size);
    }
  }
  const remainingInstances = finalInvariantInstances.filter((entry) => {
    const id = entry.instance.id ?? "";
    return id.length > 0 && !cancelIdSet.has(id);
  });
  // Rebuild still needs to honor the PROJECT exclusion used above.
  const remainingNonProjectInstances = remainingInstances.filter(
    (inst) => !inst.isProject
  );
  const { canceled: remainingCancels, overlapPairs: remainingOverlapPairs } =
    collectFinalInvariantCancels(remainingNonProjectInstances, {
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
    const remainingCancelStartedAt = schedulerNowMs();
    for (const id of remainingCancels) {
      logCancel("FINAL_INVARIANT_CANCEL", finalInstanceById.get(id) ?? null);
      await cancelScheduleInstance(id, {
        reason: "ILLEGAL_OVERLAP",
        fault: "SYSTEM",
      });
      removeInstanceFromBuckets(id);
    }
    recordPhaseSince(
      "scheduler.schedule.final_invariant_cancel_writes",
      remainingCancelStartedAt
    );
    if (timing) {
      timing.schedule.finalInvariant.canceled += remainingCancels.size;
      recordSchedulerDbWrite(timing, "cancels", remainingCancels.size);
    }
  }
  if (timing) {
    const finalInvariantMs = elapsedMs(finalInvariantStartedAt);
    timing.schedule.finalInvariant.ms += finalInvariantMs;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.final_invariant_scan_cancel",
      finalInvariantMs
    );
  }

  // Always clean up old missed HABIT instances so accumulation doesn't depend on a perfect run
  const finalCleanupStartedAt = schedulerNowMs();
  const missedCleanupCutoff = addDaysInTimeZone(
    baseStart,
    -HABIT_MISSED_RETENTION_DAYS,
    timeZone
  );
  const missedCleanupDeleteStartedAt = schedulerNowMs();
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
  } else {
    recordSchedulerDbWrite(timing, "deletes");
  }
  recordPhaseSince(
    "scheduler.schedule.missed_instance_delete_writes",
    missedCleanupDeleteStartedAt
  );

  if (typeof supabase.from === "function") {
    const transientCleanupStartedAt = schedulerNowMs();
    const cleanupResult = await cleanupTransientInstances(userId, supabase, {
      debug: debugEnabled,
    });
    recordPhaseSince(
      "scheduler.schedule.transient_instance_cleanup",
      transientCleanupStartedAt
    );
    if (cleanupResult.error) {
      result.failures.push({
        itemId: "cleanup-transient-instances",
        reason: "error",
        detail: cleanupResult.error,
      });
    }
  }
  recordPhaseSince("scheduler.schedule.final_cleanup", finalCleanupStartedAt);

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
    schedulerDebugSummary.habitAudit = habitAudit.report;
    result.debugSummary = schedulerDebugSummary;
    result.placementTrace = placementDebugCollector?.buildTrace();
  }

  return result;
  } finally {
    recordHabitNoFitCacheStats(timing, habitPlacementNoFitCacheStats);
    if (timing) {
      timing.schedule.totalMs += elapsedMs(scheduleStartedAt);
    }
  }
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
  debugEnabled: boolean,
  timing?: SchedulerTiming | null,
  options?: { cancelExtras?: boolean }
): Promise<DedupeResult> {
  const response = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase,
    { suppressQueryLog: debugEnabled, timing }
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
      if (withinWriteThrough) {
        // PROJECT rebuild should clear these rows, not keep one around for reuse.
        extras.push(inst);
        continue;
      }
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
  const cancelExtras = options?.cancelExtras !== false;

  for (const extra of extras) {
    if (!cancelExtras) continue;
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
  overlayBlockCache?: OverlayWindowBlockCache;
  dynamicOverlayCache?: DynamicOverlayWindowCache;
  maxGapCache: Map<string, number>;
  client: Client;
  sunlightLocation?: GeoCoordinates | null;
  timeZoneOffsetMinutes?: number | null;
  durationMultiplier?: number;
  restMode?: boolean;
  existingInstances: ScheduleInstance[];
  getWindowsForDay: (day: Date) => WindowLite[];
  getLastScheduledHabitStart: (habitId: string, day?: Date) => Date | null;
  parity?: FetchWindowsParityOptions | undefined;
  audit?: HabitAuditTracker;
  debugEnabled?: boolean;
  isRescheduleRebuild?: boolean;
  timing?: SchedulerTiming | null;
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
    overlayBlockCache,
    dynamicOverlayCache,
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
    isRescheduleRebuild = false,
    timing = null,
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
  let windowEntriesByKey: Map<string, ResolvedWindowEntry[]> | null = null;

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
    const useLegacyWindowLookup = windowEntriesByKey === null;
    for (const instance of bucket) {
      const instanceStart = new Date(instance.start_utc ?? "");
      const instanceEnd = new Date(instance.end_utc ?? "");
      if (Number.isNaN(instanceStart.getTime())) continue;
      if (Number.isNaN(instanceEnd.getTime())) continue;
      if (instanceEnd.getTime() <= instanceStart.getTime()) continue;
      const instanceDayStart = startOfDayInTimeZone(instanceStart, zone);
      if (instanceDayStart.getTime() !== dayStartMs) continue;
      const instanceKey = getAvailabilityWindowKey({
        dayTypeTimeBlockId: getInstanceWindowValue(
          instance,
          "day_type_time_block_id",
          "dayTypeTimeBlockId"
        ),
        windowId: getInstanceWindowValue(instance, "window_id", "windowId"),
        timeBlockId: getInstanceWindowValue(
          instance,
          "time_block_id",
          "timeBlockId"
        ),
        startUtc: instance.start_utc ?? null,
        endUtc: instance.end_utc ?? null,
      });
      const candidateEntries = windowEntriesByKey?.get(instanceKey) ?? null;
      if (!candidateEntries || candidateEntries.length === 0) {
        if (!useLegacyWindowLookup) continue;
        const windowRecord = instance.window_id
          ? (windowsById.get(instance.window_id) ?? null)
          : null;
        if (!doesWindowMatchHabitLocation(habit, windowRecord)) continue;
        if (!doesWindowHonorHabitConstraints(habit, windowRecord)) continue;
        return true;
      }
      for (const entry of candidateEntries) {
        if (instanceStart < entry.startLocal) continue;
        if (instanceEnd > entry.endLocal) continue;
        if (!doesWindowMatchHabitLocation(habit, entry.window)) continue;
        if (!doesWindowHonorHabitConstraints(habit, entry.window)) continue;
        return true;
      }
    }
    return false;
  };

  const hasFixedTimeHabit = habits.some((habit) => {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    return normalizedType !== "SYNC" && hasFixedHabitLocalTime(habit);
  });

  if ((!windows || windows.length === 0) && !hasFixedTimeHabit) {
    if (auditEnabled) {
      for (const habit of habits) {
        const normalizedType = normalizeHabitTypeValue(habit.habitType);
        if (normalizedType === "PRACTICE" || normalizedType === "RELAXER") {
          continue;
        }
        const windowDays = habit.windowId ? null : habit.window?.days ?? null;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone: zone,
          windowDays,
          lastScheduledStart: getLastScheduledHabitStart(habit.id, day),
          nextDueOverride,
        });
        if (!dueInfo.isDue) continue;
        if (!isRescheduleRebuild && hasValidScheduledInstance(habit)) {
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
  const anchorSourceSegmentsByWindowKey = new Map<
    string,
    AnchorSourceSegment[]
  >();
  const claimedAnchorSegmentsByWindowKey = new Map<string, ScheduleSegment[]>();
  const claimedAnchorOwnershipKeys = new Set<string>();

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

  const addAnchorSegment = (
    key: string,
    startMs: number,
    endMs: number,
    ownershipKey: string
  ) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    if (normalizedEnd <= normalizedStart) return;
    const sourceSegment: AnchorSourceSegment = {
      start: normalizedStart,
      end: normalizedEnd,
      ownershipKey,
    };
    addAnchorSourceSegmentToMap(
      anchorSourceSegmentsByWindowKey,
      key,
      sourceSegment
    );
    const existing = anchorSegmentsByWindowKey.get(key);
    if (!existing) {
      anchorSegmentsByWindowKey.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      const syncSegments = syncUsageByWindow.get(key) ?? [];
      for (const segment of syncSegments) {
        if (!isSegmentFullyCovered(sourceSegment, segment)) continue;
        addClaimedAnchorOwnership(
          claimedAnchorOwnershipKeys,
          claimedAnchorSegmentsByWindowKey,
          key,
          sourceSegment
        );
      }
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
    const syncSegments = syncUsageByWindow.get(key) ?? [];
    for (const segment of syncSegments) {
      if (!isSegmentFullyCovered(sourceSegment, segment)) continue;
      addClaimedAnchorOwnership(
        claimedAnchorOwnershipKeys,
        claimedAnchorSegmentsByWindowKey,
        key,
        sourceSegment
      );
    }
  };

  const getUnclaimedAnchorSegments = (key: string) =>
    subtractScheduleSegments(
      removeOwnedAnchorSegments(
        anchorSourceSegmentsByWindowKey.get(key) ?? [],
        claimedAnchorOwnershipKeys
      ),
      claimedAnchorSegmentsByWindowKey.get(key) ?? []
    );

  const claimSyncAnchorCoverage = (
    key: string,
    startMs: number,
    endMs: number
  ) => {
    for (const segment of anchorSourceSegmentsByWindowKey.get(key) ?? []) {
      if (claimedAnchorOwnershipKeys.has(segment.ownershipKey)) continue;
      if (segment.start < startMs || segment.end > endMs) continue;
      addClaimedAnchorOwnership(
        claimedAnchorOwnershipKeys,
        claimedAnchorSegmentsByWindowKey,
        key,
        segment
      );
    }
  };

  const getSyncOverlapConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => {
    for (const segment of segments) {
      const overlapStart = Math.max(startMs, segment.start);
      const overlapEnd = Math.min(endMs, segment.end);
      if (overlapEnd <= overlapStart) continue;
      return { start: overlapStart, end: overlapEnd };
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
    const windowDays = habit.windowId ? null : habit.window?.days ?? null;
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const overrideDayStart = nextDueOverride
      ? startOfDayInTimeZone(nextDueOverride, zone)
      : null;

    if (overrideDayStart) {
      const todayStart = startOfDayInTimeZone(day, zone);
      if (todayStart.getTime() < overrideDayStart.getTime()) {
        continue;
      }
    }
    const lastScheduledStart = getLastScheduledHabitStart(habit.id, day);
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: day,
      timeZone: zone,
      windowDays,
      lastScheduledStart,
      nextDueOverride,
    });
    if (!dueInfo.isDue) {
      continue;
    }
    if (!isRescheduleRebuild && hasValidScheduledInstance(habit)) {
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

  windowEntriesByKey = new Map<string, ResolvedWindowEntry[]>();
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
      const isSyncInstance = normalizeHabitTypeValue(habitType) === "SYNC";
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
          claimSyncAnchorCoverage(entry.key, segmentStart, segmentEnd);
        } else {
          const segmentStart = Math.max(entry.startMs, startMs);
          const segmentEnd = Math.min(entry.endMs, endMs);
          addAnchorSegment(
            entry.key,
            segmentStart,
            segmentEnd,
            getAnchorOwnershipKey({
              instanceId: instance.id ?? null,
              sourceType: instance.source_type ?? null,
              sourceId: instance.source_id ?? null,
              startMs,
              endMs,
            })
          );
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
    if (baseDurationMs <= 0) {
      continue;
    }
    let scheduledDurationMs = baseDurationMs;

    const resolvedEnergy = resolveHabitExplicitEnergy(habit) ?? "";
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
    const allowedWindowKinds = undefined;

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
    let sawExpiredTodayWindows = false;

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
          overlayBlockCache,
          dynamicOverlayCache,
          now: offset === 0 ? baseDate : undefined,
          locationContextId: attempt.locationId,
          locationContextValue: attempt.locationValue,
          daylight: attempt.daylight,
          ignoreAvailability: isSyncHabit,
          anchor: anchorPreference,
          restMode,
          userId,
          parity,
          isHabitReservation: true,
          enforceNightSpan: daylightConstraint?.preference === "NIGHT",
          nightSunlight: nightSunlightBundle,
          requireLocationContextMatch:
            hasExplicitLocationContext && attempt.enforceLocation,
          hasExplicitLocationContext,
          preloadedWindows:
            attempt.daylight?.preference === "NIGHT"
              ? nightEligibleWindows
              : windows,
          allowedWindowKinds,
          timing,
          auditZeroStageCallback: auditEnabled
            ? (stage) => {
                lastZeroStage = stage;
              }
            : undefined,
        }
      );
      const windowsForAttempt = windowsForAttemptResult.windows;
      if (offset === 0 && windowsForAttemptResult.expiredToday) {
        sawExpiredTodayWindows = true;
      }
      if (windowsForAttempt.length > 0) {
        compatibleWindows = windowsForAttempt;
        break;
      }
    }

    if (compatibleWindows.length === 0) {
      if (!(offset === 0 && sawExpiredTodayWindows)) {
        logHabitWindowCompatibilityFailureDebug({
          branch: "reservation",
          habit,
          attempts: attemptQueue.map((attempt) => ({
            locationId: attempt.locationId,
            locationValue: attempt.locationValue,
            daylightPreference: attempt.daylight?.preference ?? null,
            enforceLocation: attempt.enforceLocation,
          })),
          windows,
        });
        if (auditEnabled) {
          audit.report.scheduling.dueReservationFailed_NoCompatibleWindows += 1;
          audit.addSample("dueReservationFailed_NoCompatibleWindows", habit.id);
          audit.recordWindowZeroStage(lastZeroStage);
        }
      }
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
      if (
        typeof baseNowMs === "number" &&
        baseNowMs > constraintLowerBound &&
        baseNowMs < endLimit
      ) {
        constraintLowerBound = baseNowMs;
      }

      const desiredDurationMs = scheduledDurationMs;
      const syncSegments = syncUsageByWindow.get(target.key) ?? [];
      const anchorSegments = isSyncHabit
        ? getUnclaimedAnchorSegments(target.key)
        : (anchorSegmentsByWindowKey.get(target.key) ?? []);
      let startCandidate: number | null = null;
      let endCandidate: number | null = null;
      let clipped = false;

      if (isSyncHabit && anchorSegments.length > 0) {
        const safeWindowStart = Number.isFinite(windowStartMs)
          ? windowStartMs
          : startMs;
        const searchStart =
          typeof baseNowMs === "number"
            ? Math.max(safeWindowStart, baseNowMs)
            : safeWindowStart;
        const anchoredCandidate = findAnchoredSyncCandidate(
          searchStart,
          desiredDurationMs,
          endLimit,
          syncSegments,
          anchorSegments
        );
        if (anchoredCandidate) {
          startCandidate = anchoredCandidate.start;
          endCandidate = anchoredCandidate.end;
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

      if (isSyncHabit) {
        if (anchorSegments.length === 0) {
          continue;
        }
        const anchoredCandidate = findAnchoredSyncCandidate(
          startCandidate,
          desiredDurationMs,
          endLimit,
          syncSegments,
          anchorSegments
        );
        if (!anchoredCandidate) {
          continue;
        }
        startCandidate = anchoredCandidate.start;
        endCandidate = anchoredCandidate.end;
      }

      const candidateDurationMs = endCandidate - startCandidate;
      if (candidateDurationMs <= 0) {
        continue;
      }
      if (isSyncHabit && candidateDurationMs + 1 < desiredDurationMs) {
        continue;
      }
      scheduledDurationMs = candidateDurationMs;
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
              Number.isFinite(windowStartMs) ? windowStartMs : startLimit,
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
              endLimit
            );
          }
        }
      }

      if (isSyncHabit) {
        const startMs = startDate.getTime();
        const endMs = endDate.getTime();
        addSyncUsage(target.key, startMs, endMs);
        claimSyncAnchorCoverage(target.key, startMs, endMs);
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
  overlayBlockCache?: OverlayWindowBlockCache;
  dynamicOverlayCache?: DynamicOverlayWindowCache;
  maxGapCache?: Map<string, number>;
  blockerCache?: BlockerCache;
  createBatcher?: ScheduleInstanceCreateBatcher;
  client: Client;
  sunlightLocation?: GeoCoordinates | null;
  timeZoneOffsetMinutes?: number | null;
  durationMultiplier?: number;
  restMode?: boolean;
  existingInstances: ScheduleInstance[];
  registerInstance: (instance: ScheduleInstance) => void;
  getWindowsForDay: (day: Date) => WindowLite[];
  getLastScheduledHabitStart: (habitId: string, day?: Date) => Date | null;
  recordHabitScheduledStart: (habitId: string, start: Date | string) => void;
  clearHabitScheduledStart: (
    habitId: string | null | undefined,
    start: Date | string | null | undefined
  ) => void;
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
  onPersistedHabit?: (instance: ScheduleInstance | null | undefined) => void;
  isRescheduleRebuild?: boolean;
  postAnchorSyncRetry?: boolean;
  noFitCache?: HabitPlacementNoFitCache;
  noFitCacheStats?: HabitPlacementNoFitCacheStats;
  habitRevalidationCanceledInstanceIds?: Set<string>;
  habitTimingPass?: HabitPlacementPass;
  timing?: SchedulerTiming | null;
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
    overlayBlockCache,
    dynamicOverlayCache,
    maxGapCache,
    blockerCache,
    createBatcher,
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
    clearHabitScheduledStart,
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
    onPersistedHabit,
    isRescheduleRebuild = false,
    postAnchorSyncRetry = false,
    noFitCache,
    noFitCacheStats,
    habitRevalidationCanceledInstanceIds,
    habitTimingPass,
    timing = null,
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
  const prePlacementStartedAt = schedulerNowMs();
  const clearHabitOverrides = async () => {
    if (!client || overridesToClear.size === 0) return;
    const ids = Array.from(overridesToClear);
    if (ids.length === 0) return;
    try {
      await recordHabitAsyncRead(
        timing,
        habitTimingPass,
        "habitOverrideClear",
        () =>
          client
            .from("habits")
            .update({ next_due_override: null })
            .in("id", ids)
            .eq("user_id", userId)
      );
    } catch (error) {
      log("error", "Failed to clear habit due overrides", error);
    } finally {
      overridesToClear.clear();
    }
  };
  if (!habits.length) {
    recordHabitPassMetric(
      timing,
      habitTimingPass,
      "prePlacementMs",
      elapsedMs(prePlacementStartedAt)
    );
    await clearHabitOverrides();
    return result;
  }
  recordHabitPassMetric(timing, habitTimingPass, "daysConsidered");

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
  const runCanceledInstanceIds =
    habitRevalidationCanceledInstanceIds ?? new Set<string>();
  const recordHabitRevalidationCancelSuccess = (instance: ScheduleInstance) => {
    if (!instance?.id) return;
    canceledInstanceIds.add(instance.id);
    runCanceledInstanceIds.add(instance.id);
    restoreAvailabilityForInstance(instance.id);
  };
  const recordHabitRevalidationCancelFailure = (
    instance: ScheduleInstance,
    detail: unknown
  ) => {
    result.failures.push({
      itemId: instance.source_id ?? instance.id ?? "unknown",
      reason: "error",
      detail,
    });
  };
  const cancelScheduledInstances = async (instances: ScheduleInstance[]) => {
    const canceled = new Set<string>();
    const uniqueInstances: ScheduleInstance[] = [];
    const instanceById = new Map<string, ScheduleInstance>();
    for (const instance of instances) {
      const id = instance?.id ?? null;
      if (!id) continue;
      if (createBatcher?.discard(id)) {
        canceled.add(id);
        recordHabitRevalidationCancelSuccess(instance);
        continue;
      }
      if (canceledInstanceIds.has(id) || runCanceledInstanceIds.has(id)) {
        canceled.add(id);
        recordHabitRevalidationCancelSuccess(instance);
        continue;
      }
      if (instanceById.has(id)) continue;
      instanceById.set(id, instance);
      uniqueInstances.push(instance);
    }
    if (uniqueInstances.length === 0) {
      return canceled;
    }

    for (
      let start = 0;
      start < uniqueInstances.length;
      start += HABIT_REVALIDATION_CANCEL_BATCH_SIZE
    ) {
      const batch = uniqueInstances.slice(
        start,
        start + HABIT_REVALIDATION_CANCEL_BATCH_SIZE
      );
      const ids = batch
        .map((instance) => instance.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) continue;
      try {
        const cancel = await recordHabitAsyncRead(
          timing,
          habitTimingPass,
          "habitRevalidationCancel",
          () =>
            client
              .from("schedule_instances")
              .update({ status: "canceled" })
              .in("id", ids)
              .select("id")
        );
        if (cancel.error) {
          for (const instance of batch) {
            recordHabitRevalidationCancelFailure(instance, cancel.error);
          }
          continue;
        }
        const updatedIds = new Set(
          ((cancel.data ?? []) as Array<{ id?: string | null }>)
            .map((row) => row.id)
            .filter((id): id is string => Boolean(id))
        );
        for (const instance of batch) {
          const id = instance.id ?? null;
          if (!id) continue;
          if (updatedIds.has(id)) {
            canceled.add(id);
            recordHabitRevalidationCancelSuccess(instance);
          } else {
            recordHabitRevalidationCancelFailure(
              instance,
              new Error("Habit revalidation cancel matched no rows")
            );
          }
        }
      } catch (error) {
        log(
          "error",
          "Failed to cancel habit instances during revalidation",
          error
        );
        for (const instance of batch) {
          recordHabitRevalidationCancelFailure(instance, error);
        }
      }
    }

    return canceled;
  };
  const cancelScheduledInstance = async (instance: ScheduleInstance) => {
    if (!instance?.id) return false;
    const canceled = await cancelScheduledInstances([instance]);
    return canceled.has(instance.id);
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
      const miss = await recordHabitAsyncRead(
        timing,
        habitTimingPass,
        "habitRevalidationMiss",
        () =>
          client
            .from("schedule_instances")
            .update(payload)
            .eq("id", instance.id)
            .select("id")
            .single()
      );
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
  const anchorSourceSegmentsByWindowKey = new Map<
    string,
    AnchorSourceSegment[]
  >();
  const claimedAnchorSegmentsByWindowKey = new Map<string, ScheduleSegment[]>();
  const claimedAnchorOwnershipKeys = new Set<string>();
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
  for (const [habitId, habit] of habitMap) {
    if (habitTypeById.has(habitId)) continue;
    habitTypeById.set(habitId, normalizeHabitTypeValue(habit.habitType));
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

  const addAnchorSegment = (
    key: string,
    startMs: number,
    endMs: number,
    ownershipKey: string
  ) => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    const normalizedStart = Math.floor(startMs);
    const normalizedEnd = Math.floor(endMs);
    if (normalizedEnd <= normalizedStart) return;
    const sourceSegment: AnchorSourceSegment = {
      start: normalizedStart,
      end: normalizedEnd,
      ownershipKey,
    };
    addAnchorSourceSegmentToMap(
      anchorSourceSegmentsByWindowKey,
      key,
      sourceSegment
    );
    const existing = anchorSegmentsByWindowKey.get(key);
    if (!existing) {
      anchorSegmentsByWindowKey.set(key, [
        { start: normalizedStart, end: normalizedEnd },
      ]);
      const syncSegments = syncUsageByWindow.get(key) ?? [];
      for (const segment of syncSegments) {
        if (!isSegmentFullyCovered(sourceSegment, segment)) continue;
        addClaimedAnchorOwnership(
          claimedAnchorOwnershipKeys,
          claimedAnchorSegmentsByWindowKey,
          key,
          sourceSegment
        );
      }
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
    const syncSegments = syncUsageByWindow.get(key) ?? [];
    for (const segment of syncSegments) {
      if (!isSegmentFullyCovered(sourceSegment, segment)) continue;
      addClaimedAnchorOwnership(
        claimedAnchorOwnershipKeys,
        claimedAnchorSegmentsByWindowKey,
        key,
        sourceSegment
      );
    }
  };

  const getUnclaimedAnchorSegments = (key: string) =>
    subtractScheduleSegments(
      removeOwnedAnchorSegments(
        anchorSourceSegmentsByWindowKey.get(key) ?? [],
        claimedAnchorOwnershipKeys
      ),
      claimedAnchorSegmentsByWindowKey.get(key) ?? []
    );

  const claimSyncAnchorCoverage = (
    key: string,
    startMs: number,
    endMs: number
  ) => {
    for (const segment of anchorSourceSegmentsByWindowKey.get(key) ?? []) {
      if (claimedAnchorOwnershipKeys.has(segment.ownershipKey)) continue;
      if (segment.start < startMs || segment.end > endMs) continue;
      addClaimedAnchorOwnership(
        claimedAnchorOwnershipKeys,
        claimedAnchorSegmentsByWindowKey,
        key,
        segment
      );
    }
  };

  const getSyncOverlapConflict = (
    startMs: number,
    endMs: number,
    segments: { start: number; end: number }[]
  ) => {
    for (const segment of segments) {
      const overlapStart = Math.max(startMs, segment.start);
      const overlapEnd = Math.min(endMs, segment.end);
      if (overlapEnd <= overlapStart) continue;
      return { start: overlapStart, end: overlapEnd };
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

  const existingInstanceClassificationStartedAt = schedulerNowMs();
  for (const inst of existingInstances) {
    recordHabitPassMetric(timing, habitTimingPass, "existingInstanceChecks");
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
    recordHabitPassMetric(
      timing,
      habitTimingPass,
      "existingInstanceChecks",
      bucket.length
    );
    bucket.sort((a, b) => startValueForInstance(a) - startValueForInstance(b));
    const isNonDailyHabit = Boolean(nonDailyHabitIds?.has(habitId));
    if (postAnchorSyncRetry) {
      if (bucket.length > 0) {
        existingByHabitId.set(habitId, bucket[0]);
        carryoverInstances.push(...bucket);
      }
      continue;
    }
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
  recordHabitPassMetric(
    timing,
    habitTimingPass,
    "sortDedupeMs",
    elapsedMs(existingInstanceClassificationStartedAt)
  );

  for (const [habitId, bucket] of scheduledHabitBuckets) {
    const habit = habitMap.get(habitId);
    if (!habit) continue;
    logHabitPlacementAudit(habit, "existing_bucket_classified", {
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      postAnchorSyncRetry,
      bucket: bucket.map(scheduleInstanceAuditPayload),
      existingByHabitId: scheduleInstanceAuditPayload(
        existingByHabitId.get(habitId)
      ),
      duplicatesToCancel: duplicatesToCancel
        .filter((instance) => instance?.source_id === habitId)
        .map(scheduleInstanceAuditPayload),
    });
  }

  existingInstances.length = 0;
  for (const inst of carryoverInstances) {
    existingInstances.push(inst);
  }

  const dayInstances = existingInstances
    .map((inst) => ({ ...inst }))
    .filter((inst) => !canceledInstanceIds.has(inst?.id ?? ""));

  const removeInstanceById = (
    list: ScheduleInstance[],
    instanceId: string | null | undefined
  ) => {
    if (!instanceId) return;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index]?.id === instanceId) {
        list.splice(index, 1);
      }
    }
  };

  const getScheduledHabitDayMs = (
    instance: ScheduleInstance | null | undefined
  ) => {
    if (
      !instance ||
      instance.source_type !== "HABIT" ||
      instance.status !== "scheduled" ||
      !instance.start_utc
    ) {
      return null;
    }
    const start = new Date(instance.start_utc);
    if (Number.isNaN(start.getTime())) return null;
    return startOfDayInTimeZone(start, zone).getTime();
  };

  const findSurvivingScheduledHabitInstance = (
    habitId: string,
    targetDayMs: number,
    excludedInstanceId: string | null | undefined
  ) => {
    const candidates = [dayInstances, placedSoFar, existingInstances];
    const seenIds = new Set<string>();
    for (const list of candidates) {
      for (const instance of list) {
        const instanceId = instance?.id ?? null;
        if (!instance || !instanceId || seenIds.has(instanceId)) continue;
        seenIds.add(instanceId);
        if (instanceId === excludedInstanceId) continue;
        if (canceledInstanceIds.has(instanceId)) continue;
        if (instance.source_type !== "HABIT") continue;
        if (instance.status !== "scheduled") continue;
        if (instance.source_id !== habitId) continue;
        if (getScheduledHabitDayMs(instance) !== targetDayMs) continue;
        return instance;
      }
    }
    return null;
  };

  const cleanupCanceledHabitInstance = (instance: ScheduleInstance) => {
    if (instance.source_type !== "HABIT") return;
    const habitId = instance.source_id ?? null;
    if (!habitId) return;
    const instanceId = instance.id ?? null;
    const instanceDayMs = getScheduledHabitDayMs(instance);
    removeInstanceById(dayInstances, instanceId);
    removeInstanceById(placedSoFar, instanceId);
    removeInstanceById(existingInstances, instanceId);
    if (existingByHabitId.get(habitId)?.id === instanceId) {
      existingByHabitId.delete(habitId);
    }
    instance.status = "canceled";
    if (instanceDayMs === null) return;
    const survivor = findSurvivingScheduledHabitInstance(
      habitId,
      instanceDayMs,
      instanceId
    );
    if (survivor) {
      if (!existingByHabitId.has(habitId)) {
        existingByHabitId.set(habitId, survivor);
      }
      return;
    }
    const habit = habitMap.get(habitId) ?? null;
    const normalizedType =
      habitTypeById.get(habitId) ?? normalizeHabitTypeValue(habit?.habitType);
    if (
      normalizedType === "SYNC" ||
      repeatablePracticeIds.has(habitId) ||
      nonDailyHabitIds?.has(habitId) ||
      !isDailyRecurrenceValue(habit?.recurrence, habit?.habitType)
    ) {
      return;
    }
    clearHabitScheduledStart(habitId, instance.start_utc);
  };

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

  const hasFixedTimeHabit = habits.some((habit) => {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    return normalizedType !== "SYNC" && hasFixedHabitLocalTime(habit);
  });

  if ((!windows || windows.length === 0) && !hasFixedTimeHabit) {
    if (auditEnabled) {
      for (const habit of habits) {
        const windowDays = habit.windowId ? null : habit.window?.days ?? null;
        const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
        const missingWindowDueStartedAt = schedulerNowMs();
        const dueInfo = evaluateHabitDueOnDate({
          habit,
          date: day,
          timeZone: zone,
          windowDays,
          lastScheduledStart: repeatablePracticeIds.has(habit.id)
            ? null
            : getLastScheduledHabitStart(habit.id, day),
          nextDueOverride,
        });
        recordHabitPassMetric(
          timing,
          habitTimingPass,
          "dueEvaluationMs",
          elapsedMs(missingWindowDueStartedAt)
        );
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
  windows = windows ?? [];

  const windowsById = new Map<string, WindowLite>();
  for (const win of windows) {
    windowsById.set(win.id, win);
  }

  const invalidHabitInstances: ScheduleInstance[] = [];
  const typeMismatchInstances: ScheduleInstance[] = [];
  const seenInvalidIds = new Set<string>();
  for (let index = dayInstances.length - 1; index >= 0; index -= 1) {
    recordHabitPassMetric(timing, habitTimingPass, "existingInstanceChecks");
    const instance = dayInstances[index];
    if (!instance) continue;
    if (instance.source_type !== "HABIT") continue;
    if (instance.status !== "scheduled") continue;
    const habitId = instance.source_id ?? null;
    if (!habitId) continue;
    const habit = habitMap.get(habitId);
    if (!habit) continue;
    const normalizedHabitType =
      habitTypeById.get(habitId) ?? normalizeHabitTypeValue(habit.habitType);
    if (normalizedHabitType !== "SYNC" && hasFixedHabitLocalTime(habit)) {
      continue;
    }
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
    const hasWindowTypeMatch = doesWindowHonorHabitConstraints(
      habit,
      windowRecord
    );
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
    const windowDays = habit.windowId ? null : habit.window?.days ?? null;
    const lastScheduledStart = getLastScheduledHabitStart(habitId, day);
    const revalidationDueStartedAt = schedulerNowMs();
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: instanceDayStart,
      timeZone: zone,
      windowDays,
      lastScheduledStart,
      nextDueOverride,
    });
    recordHabitPassMetric(
      timing,
      habitTimingPass,
      "dueEvaluationMs",
      elapsedMs(revalidationDueStartedAt)
    );
    if (!dueInfo.isDue) {
      if (
        instance.id &&
        createdThisRun.has(instance.id) &&
        dueInfo.debugTag === "LAST_SCHEDULED_TODAY"
      ) {
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
      const duplicateHabit = duplicate.source_id
        ? habitMap.get(duplicate.source_id)
        : null;
      if (duplicateHabit) {
        logHabitPlacementAudit(duplicateHabit, "duplicate_cancel_attempt", {
          day: formatDateKeyInTimeZone(day, zone),
          dayStart: toAuditIso(dayStart),
          offset,
          duplicate: scheduleInstanceAuditPayload(duplicate),
          existingByHabitId: scheduleInstanceAuditPayload(
            duplicate.source_id
              ? existingByHabitId.get(duplicate.source_id)
              : null
          ),
        });
      }
      logCancelOnce("REVALIDATION_DUPLICATE_CANCEL", duplicate);
    }
    const canceledDuplicates =
      await cancelScheduledInstances(duplicatesToCancel);
    for (const duplicate of duplicatesToCancel) {
      if (duplicate?.id && canceledDuplicates.has(duplicate.id)) {
        cleanupCanceledHabitInstance(duplicate);
      }
    }
  }

  for (const instance of dayInstances) {
    if (!instance || instance.source_type !== "HABIT") continue;
    if (instance.status !== "scheduled") continue;
    if (
      isRescheduleRebuild &&
      instance.locked !== true &&
      !(instance.id && createdThisRun.has(instance.id))
    ) {
      continue;
    }
    recordHabitScheduledStart(instance.source_id ?? null, instance.start_utc);
  }

  if (!allowScheduling && auditEnabled) {
    for (const habit of habits) {
      const windowDays = habit.windowId ? null : habit.window?.days ?? null;
      const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
      const auditDueStartedAt = schedulerNowMs();
      const dueInfo = evaluateHabitDueOnDate({
        habit,
        date: day,
        timeZone: zone,
        windowDays,
        lastScheduledStart: repeatablePracticeIds.has(habit.id)
          ? null
          : getLastScheduledHabitStart(habit.id, day),
        nextDueOverride,
      });
      recordHabitPassMetric(
        timing,
        habitTimingPass,
        "dueEvaluationMs",
        elapsedMs(auditDueStartedAt)
      );
      recordDueEvaluationForAudit(habit, dueInfo);
    }
  }

  for (const inst of dayInstances) {
    if (!inst || inst.status !== "scheduled") continue;
    const isSyncOverlapInstance =
      inst.source_type === "HABIT" &&
      Boolean(
        inst.source_id &&
          normalizeHabitTypeValue(habitTypeById.get(inst.source_id)) === "SYNC"
      );
    if (isSyncOverlapInstance) continue;
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

  const getWindowEntriesForSeedInstance = (instance: ScheduleInstance) => {
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
    const keyedEntries = windowEntriesByKey.get(instanceKey);
    if (keyedEntries) return keyedEntries;

    const instanceDayTypeTimeBlockId =
      (instance as any).day_type_time_block_id ??
      (instance as any).dayTypeTimeBlockId ??
      null;
    const instanceWindowId = instance.window_id ?? null;
    const instanceTimeBlockId =
      (instance as any).time_block_id ?? (instance as any).timeBlockId ?? null;
    const matchingEntries = windowEntries.filter((entry) => {
      const entryDayTypeTimeBlockId =
        entry.window.dayTypeTimeBlockId ??
        (entry.window as any).day_type_time_block_id ??
        null;
      const entryTimeBlockId =
        (entry.window as any).time_block_id ??
        (entryDayTypeTimeBlockId ? entry.window.id : null);
      if (
        instanceDayTypeTimeBlockId &&
        entryDayTypeTimeBlockId === instanceDayTypeTimeBlockId
      ) {
        return true;
      }
      if (instanceWindowId && entry.window.id === instanceWindowId) {
        return true;
      }
      if (
        instanceTimeBlockId &&
        (entryTimeBlockId === instanceTimeBlockId ||
          entry.window.id === instanceTimeBlockId)
      ) {
        return true;
      }
      return false;
    });
    if (matchingEntries.length > 0) return matchingEntries;
    return postAnchorSyncRetry ? [] : windowEntries;
  };

  for (const instance of [...dayInstances]) {
    if (!isScheduledSyncInstance(instance, habitTypeById)) continue;
    const habitId = instance.source_id ?? null;
    const habit = habitId ? habitMap.get(habitId) : null;
    if (!habit) continue;
    const rawDuration = Number(habit.durationMinutes ?? 0);
    let durationMin =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : DEFAULT_HABIT_DURATION_MIN;
    if (durationMultiplier !== 1) {
      durationMin = Math.max(1, Math.round(durationMin * durationMultiplier));
    }
    const validation = validateSyncInstanceInvariants({
      candidate: instance,
      habit,
      desiredDurationMs: durationMin * 60000,
      instances: dayInstances,
      habitTypeById,
      getWindowEntriesForInstance: getWindowEntriesForSeedInstance,
      fallbackWindowKey: getAvailabilityWindowKey({
        dayTypeTimeBlockId:
          (instance as any).day_type_time_block_id ??
          (instance as any).dayTypeTimeBlockId ??
          null,
        windowId: instance.window_id ?? null,
        timeBlockId: instance.time_block_id ?? null,
        startUtc: instance.start_utc ?? null,
        endUtc: instance.end_utc ?? null,
      }),
      fallbackWindow:
        instance.window_id ? (windowsById.get(instance.window_id) ?? null) : null,
    });
    if (validation.ok) continue;
    logHabitPlacementAudit(habit, "sync_invariant_rejection", {
      reason: validation.reason,
      phase: "existing_snapshot",
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      postAnchorSyncRetry,
      candidate: scheduleInstanceAuditPayload(instance),
      blockerId: "blockerId" in validation ? validation.blockerId : null,
      anchorId: "anchorId" in validation ? validation.anchorId : null,
    });
    logCancelOnce(`SYNC_INVARIANT_${validation.reason}`, instance);
    if (await cancelScheduledInstance(instance)) {
      cleanupCanceledHabitInstance(instance);
    }
  }

  const dueHabits: HabitScheduleItem[] = [];
  for (const habit of habits) {
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    if (postAnchorSyncRetry && normalizedType !== "SYNC") {
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      continue;
    }
    if (normalizedType === "PRACTICE") {
      if (process.env.NODE_ENV === "test" && habit.id === "habit-practice") {
        logSchedulerDebug("practice offset check", { offset });
      }
    }
    if (normalizedType === "PRACTICE" && offset >= PRACTICE_LOOKAHEAD_DAYS) {
      if (process.env.NODE_ENV === "test" && habit.id === "habit-practice") {
        logSchedulerDebug("skip practice due to offset", offset);
      }
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      continue;
    }
    // Exclude unreserved SYNC/ASYNC habits from regular habit scheduling - they get post-pass treatment.
    // Reserved SYNC habits must continue so the reservation can be consumed and persisted.
    if (
      normalizedType === "SYNC" &&
      !postAnchorSyncRetry &&
      !reservedPlacements?.has(habit.id)
    ) {
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      continue;
    }
    if (
      postAnchorSyncRetry &&
      dayInstances.some(
        (inst) =>
          inst?.source_type === "HABIT" &&
          inst.status === "scheduled" &&
          inst.source_id === habit.id
      )
    ) {
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      continue;
    }
    const windowDays = habit.windowId ? null : habit.window?.days ?? null;
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const overrideDayStart = nextDueOverride
      ? startOfDayInTimeZone(nextDueOverride, zone)
      : null;

    if (overrideDayStart) {
      const todayStart = startOfDayInTimeZone(day, zone);
      if (todayStart.getTime() < overrideDayStart.getTime()) {
        recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
        continue;
      }
    }
    // Use effective lastCompletedAt if more recent than habit's lastCompletedAt
    const effectiveLastCompletedAtForHabit = effectiveLastCompletedAt.get(
      habit.id
    );
    const habitWithEffectiveLastCompletedAt = {
      ...habit,
      lastCompletedAt:
        effectiveLastCompletedAtForHabit || habit.lastCompletedAt,
    };
    const auditEffectiveLastCompletedAt =
      effectiveLastCompletedAtForHabit || habit.lastCompletedAt || null;
    const dueEvalLastScheduledStart = repeatablePracticeIds.has(habit.id)
      ? null
      : getLastScheduledHabitStart(habit.id, day);
    const existingInstanceBeforeDue = existingByHabitId.get(habit.id) ?? null;
    const dueEvaluationStartedAt = schedulerNowMs();
    const tracedDueInfo = evaluateHabitDueOnDate({
      habit: habitWithEffectiveLastCompletedAt,
      date: day,
      timeZone: zone,
      windowDays,
      lastScheduledStart: dueEvalLastScheduledStart,
      nextDueOverride,
    });
    recordHabitPassMetric(
      timing,
      habitTimingPass,
      "dueEvaluationMs",
      elapsedMs(dueEvaluationStartedAt)
    );
    recordDueEvaluationForAudit(habit, tracedDueInfo);
    const dueInfo = tracedDueInfo;
    if (
      normalizedType === "PRACTICE" &&
      process.env.NODE_ENV === "test" &&
      habit.id === "habit-practice"
    ) {
      logSchedulerDebug("practice due info", { offset, isDue: dueInfo.isDue });
    }
    if (!dueInfo.isDue) {
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      logHabitPlacementAudit(habit, "due_habits_entry", {
        enteredDueHabits: false,
        debugTag: dueInfo.debugTag,
        dueStart: toAuditIso(dueInfo.dueStart),
        day: formatDateKeyInTimeZone(day, zone),
        dayStart: toAuditIso(dayStart),
        offset,
        lastScheduledStart: toAuditIso(dueEvalLastScheduledStart),
        existingByHabitId: scheduleInstanceAuditPayload(existingInstanceBeforeDue),
        effectiveLastCompletedAt: auditEffectiveLastCompletedAt,
        postAnchorSyncRetry,
      });
      continue;
    }
    if (overrideDayStart) {
      const overrideMs = overrideDayStart.getTime();
      const dayMs = dayStart.getTime();
      if (dayMs > overrideMs || (dayMs === overrideMs && dueInfo.isDue)) {
        overridesToClear.add(habit.id);
      }
    }
    dueInfoByHabitId.set(habit.id, dueInfo);
    dueHabits.push(habit);
    logHabitPlacementAudit(habit, "due_habits_entry", {
      enteredDueHabits: true,
      debugTag: dueInfo.debugTag,
      dueStart: toAuditIso(dueInfo.dueStart),
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      lastScheduledStart: toAuditIso(dueEvalLastScheduledStart),
      existingByHabitId: scheduleInstanceAuditPayload(existingInstanceBeforeDue),
      effectiveLastCompletedAt: auditEffectiveLastCompletedAt,
      postAnchorSyncRetry,
    });
  }

  if (dueHabits.length === 0) {
    recordHabitPassMetric(
      timing,
      habitTimingPass,
      "prePlacementMs",
      elapsedMs(prePlacementStartedAt)
    );
    await clearHabitOverrides();
    return result;
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
      const isSyncInstance = normalizeHabitTypeValue(habitType) === "SYNC";
      const candidateEntries = getWindowEntriesForSeedInstance(instance);
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
            claimSyncAnchorCoverage(entry.key, segmentStart, segmentEnd);
          } else {
            const segmentStart = Math.max(entry.startMs, startMs);
            const segmentEnd = Math.min(entry.endMs, endMs);
            addAnchorSegment(
              entry.key,
              segmentStart,
              segmentEnd,
              getAnchorOwnershipKey({
                instanceId: instance.id ?? null,
                sourceType: instance.source_type ?? null,
                sourceId: instance.source_id ?? null,
                startMs,
                endMs,
              })
            );
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

  const dueSortStartedAt = schedulerNowMs();
  const sortedHabits = [...dueHabits].sort((a, b) =>
    compareHabitScheduleOrder(a, b, dueInfoByHabitId, defaultDueMs)
  );
  recordHabitPassMetric(
    timing,
    habitTimingPass,
    "sortDedupeMs",
    elapsedMs(dueSortStartedAt)
  );

  const practicePlacementCounts = new Map<string, number>();
  const failedHabitIds = new Set<string>();
  const habitQueue = [...sortedHabits];
  recordHabitPassMetric(
    timing,
    habitTimingPass,
    "prePlacementMs",
    elapsedMs(prePlacementStartedAt)
  );
  while (habitQueue.length > 0) {
    const habit = habitQueue.shift();
    if (!habit) continue;
    const shouldLogPlacementAudit = shouldAuditHabitPlacement(habit);
    if (failedHabitIds.has(habit.id)) continue;
    const isRepeatablePractice = repeatablePracticeIds.has(habit.id);
    let existingInstance: ScheduleInstance | null = null;
    if (isRepeatablePractice) {
      existingInstance = takeExistingPracticeInstance(habit.id);
    } else {
      existingInstance = existingByHabitId.get(habit.id) ?? null;
    }
    logHabitPlacementAudit(habit, "existing_before_placement", {
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      postAnchorSyncRetry,
      existingByHabitId: scheduleInstanceAuditPayload(existingInstance),
    });
    const normalizedType =
      habitTypeById.get(habit.id) ?? normalizeHabitTypeValue(habit.habitType);
    const isSyncHabit = normalizedType === "SYNC";
    if (hasFixedHabitLocalTime(habit) && !isSyncHabit) {
      if (!allowScheduling && !existingInstance) {
        continue;
      }
      const fixedResult = await upsertFixedHabitInstance({
        client,
        userId,
        habit,
        day,
        timeZone: zone,
        existingInstance,
        timing,
        habitTimingPass,
      });
      if (fixedResult.error || !fixedResult.instance || !fixedResult.range) {
        result.failures.push({
          itemId: habit.id,
          reason: "error",
          detail: fixedResult.error,
        });
        failedHabitIds.add(habit.id);
        continue;
      }

      const persisted = fixedResult.instance;
      if (persisted.id && fixedResult.decision !== "kept") {
        createdThisRun.add(persisted.id);
        result.instances.push(persisted);
      }
      existingByHabitId.set(habit.id, persisted);
      registerInstance(persisted);
      upsertInstance(dayInstances, persisted);
      if (!placedSoFar.some((instance) => instance.id === persisted.id)) {
        placedSoFar.push(persisted);
      }
      recordHabitScheduledStart(habit.id, persisted.start_utc ?? "");
      const startUTC =
        persisted.start_utc ?? fixedResult.range.start.toISOString();
      const endUTC = persisted.end_utc ?? fixedResult.range.end.toISOString();
      if (auditEnabled) {
        audit.report.scheduling.dueScheduledSuccessfullyToday += 1;
      }
      onPersistedHabit?.(persisted);
      result.placements.push({
        type: "HABIT",
        habit: {
          id: habit.id,
          name: habit.name,
          windowId: null,
          windowLabel: null,
          startUTC,
          endUTC,
          durationMin: fixedResult.range.durationMin,
          energyResolved: persisted.energy_resolved ?? null,
          practiceContextId:
            normalizedType === "PRACTICE"
              ? (persisted.practice_context_monument_id ?? null)
              : null,
        },
        decision: fixedResult.decision,
        scheduledDayOffset: offset,
        availableStartLocal: startUTC,
        windowStartLocal: startUTC,
        instanceId: persisted.id,
      });
      continue;
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
    if (baseDurationMs <= 0) {
      continue;
    }
    let scheduledDurationMs = baseDurationMs;

    const resolvedEnergy = resolveHabitExplicitEnergy(habit) ?? "";
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
      !doesWindowHonorHabitConstraints(habit, existingWindowRecord);
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
    const allowsHabitOverlap = isSyncHabit;
    const anchorRaw = habit.windowEdgePreference
      ? String(habit.windowEdgePreference).toUpperCase().trim()
      : "FRONT";
    const anchorPreference = anchorRaw === "BACK" ? "BACK" : "FRONT";
    const allowedWindowKinds = undefined;
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
    let sawExpiredTodayWindows = false;
    recordHabitPassMetric(timing, habitTimingPass, "reservationChecks");
    const reservation = reservedPlacements?.get(habit.id) ?? null;
    let usedReservation = false;
    let reservedStartMs: number | null = null;
    let reservedEndMs: number | null = null;
    let reservedClipped = false;
    if (reservation && windowsById.has(reservation.windowId)) {
      const reservedWindow = windowsById.get(reservation.windowId) ?? null;
      if (reservedWindow) {
        const constraintItem = {
          habitType: habit.habitType ?? null,
          skillId: habit.skillId ?? null,
          skillIds: habit.skillIds ?? null,
          monumentId: habit.monumentId ?? null,
          skillMonumentId: habit.skillMonumentId ?? null,
          monumentIds: habit.monumentIds ?? null,
        };
        if (
          doesWindowMatchHabitLocation(habit, reservedWindow) &&
          passesTimeBlockConstraints(constraintItem, reservedWindow)
        ) {
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
      }
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

    let lastZeroStage: string | null = null;
    if (!usedReservation) {
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
            overlayBlockCache,
            dynamicOverlayCache,
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
              hasExplicitLocationContext && attempt.enforceLocation,
            hasExplicitLocationContext,
            preloadedWindows:
              attempt.daylight?.preference === "NIGHT"
                ? nightEligibleWindows
                : windows,
            allowedWindowKinds,
            habitTimingPass,
            timing,
            auditZeroStageCallback: auditEnabled || shouldLogPlacementAudit
              ? (stage) => {
                  lastZeroStage = stage;
                }
              : undefined,
          }
        );
        const windowsForAttempt = windowsForAttemptResult.windows;
        if (offset === 0 && windowsForAttemptResult.expiredToday) {
          sawExpiredTodayWindows = true;
        }
        if (windowsForAttempt.length > 0) {
          compatibleWindows = windowsForAttempt;
          break;
        }
      }
      if (
        compatibleWindows.length === 0 &&
        auditEnabled &&
        lastZeroStage &&
        !(offset === 0 && sawExpiredTodayWindows)
      ) {
        audit.recordWindowZeroStage(lastZeroStage);
      }
    }
    logHabitPlacementAudit(habit, "compatible_windows", {
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      compatibleWindowsCount: compatibleWindows.length,
      lastZeroStage,
      sawExpiredTodayWindows,
      usedReservation,
      source: usedReservation ? "reservation" : "fetchCompatibleWindowsForItem",
      attempts: attemptQueue.map((attempt) => ({
        locationId: attempt.locationId,
        locationValue: attempt.locationValue,
        daylightPreference: attempt.daylight?.preference ?? null,
        enforceLocation: attempt.enforceLocation,
      })),
    });

    if (compatibleWindows.length === 0) {
      recordHabitPassMetric(timing, habitTimingPass, "eligibilitySkips");
      if (offset === 0 && sawExpiredTodayWindows) {
        logHabitPlacementAudit(habit, "placement_rejection", {
          reason: "expiredTodayWindows",
          day: formatDateKeyInTimeZone(day, zone),
          dayStart: toAuditIso(dayStart),
          offset,
          compatibleWindowsCount: compatibleWindows.length,
          lastZeroStage,
        });
        continue;
      }
      logHabitWindowCompatibilityFailureDebug({
        branch: "placement",
        habit,
        attempts: attemptQueue.map((attempt) => ({
          locationId: attempt.locationId,
          locationValue: attempt.locationValue,
          daylightPreference: attempt.daylight?.preference ?? null,
          enforceLocation: attempt.enforceLocation,
        })),
        windows,
      });
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
      logHabitPlacementAudit(habit, "placement_rejection", {
        reason: "NO_WINDOW",
        day: formatDateKeyInTimeZone(day, zone),
        dayStart: toAuditIso(dayStart),
        offset,
        compatibleWindowsCount: compatibleWindows.length,
        lastZeroStage,
      });
      result.failures.push({ itemId: habit.id, reason: "NO_WINDOW" });
      continue;
    }

    let placedInWindow = false;
    let persistFailed = false;
    for (const target of compatibleWindows) {
      recordHabitPassMetric(timing, habitTimingPass, "candidateWindowsConsidered");
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
        isDailyRecurrenceValue(habit.recurrence ?? null, habit.habitType)
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
      const anchorSegments = isSyncHabit
        ? getUnclaimedAnchorSegments(target.key)
        : (anchorSegmentsByWindowKey.get(target.key) ?? []);
      if (isSyncHabit && postAnchorSyncRetry && anchorSegments.length === 0) {
        continue;
      }
      let startCandidate: number | null = usedReservation
        ? reservedStartMs
        : null;
      let endCandidate: number | null = usedReservation ? reservedEndMs : null;
      let clipped = usedReservation ? reservedClipped : false;

      if (isSyncHabit && anchorSegments.length > 0) {
        const safeWindowStart = Number.isFinite(windowStartMs)
          ? windowStartMs
          : startMs;
        const earliestStart =
          typeof dueStartMs === "number" && Number.isFinite(dueStartMs)
            ? Math.max(safeWindowStart, dueStartMs)
            : safeWindowStart;
        const searchStart =
          typeof baseNowMs === "number"
            ? Math.max(earliestStart, baseNowMs)
            : earliestStart;
        const anchoredCandidate = findAnchoredSyncCandidate(
          searchStart,
          desiredDurationMs,
          endLimit,
          syncSegments,
          anchorSegments
        );
        if (anchoredCandidate) {
          startCandidate = anchoredCandidate.start;
          endCandidate = anchoredCandidate.end;
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
          logHabitPlacementAudit(habit, "placement_rejection", {
            reason: "candidateStart >= endLimit",
            day: formatDateKeyInTimeZone(day, zone),
            dayStart: toAuditIso(dayStart),
            offset,
            candidateStart: toAuditIso(candidateStart),
            endLimit: toAuditIso(endLimit),
            latestStartAllowed: toAuditIso(latestStartAllowed),
            ...habitPlacementWindowAuditPayload({ target, window }),
          });
          continue;
        }

        if (candidateStart > latestStartAllowed) {
          logHabitPlacementAudit(habit, "placement_rejection", {
            reason: "candidateStart > latestStartAllowed",
            day: formatDateKeyInTimeZone(day, zone),
            dayStart: toAuditIso(dayStart),
            offset,
            candidateStart: toAuditIso(candidateStart),
            endLimit: toAuditIso(endLimit),
            latestStartAllowed: toAuditIso(latestStartAllowed),
            ...habitPlacementWindowAuditPayload({ target, window }),
          });
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
        isSyncHabit &&
        hasSyncOverlap(startCandidate, endCandidate, syncSegments)
      ) {
        const syncDurationMs = endCandidate - startCandidate;
        const latestStartAllowed = endLimit - syncDurationMs;
        let adjustedStart = startCandidate;
        let adjustedEnd = endCandidate;
        let guard = 0;
        while (hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)) {
          const conflict = findFirstSyncConflict(
            adjustedStart,
            adjustedEnd,
            syncSegments
          );
          if (!conflict) break;
          adjustedStart = Math.max(conflict.end, adjustedStart);
          if (adjustedStart > latestStartAllowed) break;
          adjustedEnd = adjustedStart + syncDurationMs;
          guard += 1;
          if (guard > syncSegments.length + 4) break;
        }
        if (
          adjustedStart > latestStartAllowed ||
          adjustedEnd <= adjustedStart ||
          adjustedEnd > endLimit ||
          hasSyncOverlap(adjustedStart, adjustedEnd, syncSegments)
        ) {
          continue;
        }
        startCandidate = adjustedStart;
        endCandidate = adjustedEnd;
      }
      if (isSyncHabit && postAnchorSyncRetry) {
        const anchoredCandidate = findAnchoredSyncCandidate(
          startCandidate,
          desiredDurationMs,
          endLimit,
          syncSegments,
          anchorSegments
        );
        if (!anchoredCandidate) {
          continue;
        }
        startCandidate = anchoredCandidate.start;
        endCandidate = anchoredCandidate.end;
        const habitDurationMs =
          Math.max(1, Number(habit.duration_minutes ?? 0)) * 60_000;
        if (endCandidate - startCandidate < habitDurationMs) {
          continue;
        }
      } else if (isSyncHabit) {
        if (anchorSegments.length === 0) {
          continue;
        }
        const anchoredCandidate = findAnchoredSyncCandidate(
          startCandidate,
          desiredDurationMs,
          endLimit,
          syncSegments,
          anchorSegments
        );
        if (!anchoredCandidate) {
          continue;
        }
        startCandidate = anchoredCandidate.start;
        endCandidate = anchoredCandidate.end;
      }
      let overlapInspection = inspectBlockingHabitOverlap({
        candidateIsSync: isSyncHabit,
        candidateId: existingInstance?.id ?? null,
        startMs: startCandidate,
        endMs: endCandidate,
        existingInstances: placedSoFar,
        habitTypeById,
      });
      if (overlapInspection.result === "NON_SYNC_OVERLAP") {
        const retryDurationMs = endCandidate - startCandidate;
        let overlapRetryGuard = 0;
        while (overlapInspection.result === "NON_SYNC_OVERLAP") {
          const blockerEndMs = overlapInspection.blockerEndMs;
          if (!Number.isFinite(blockerEndMs)) {
            break;
          }
          const nextCandidateStart = Math.max(
            blockerEndMs,
            startCandidate + 1
          );
          const nextCandidateEnd = nextCandidateStart + retryDurationMs;
          if (
            nextCandidateStart > latestStartAllowedFallback ||
            nextCandidateEnd > endLimit
          ) {
            break;
          }
          startCandidate = nextCandidateStart;
          endCandidate = nextCandidateEnd;
          overlapInspection = inspectBlockingHabitOverlap({
            candidateIsSync: isSyncHabit,
            candidateId: existingInstance?.id ?? null,
            startMs: startCandidate,
            endMs: endCandidate,
            existingInstances: placedSoFar,
            habitTypeById,
          });
          overlapRetryGuard += 1;
          if (overlapRetryGuard > placedSoFar.length + 4) {
            break;
          }
        }
      }
      if (overlapInspection.result) {
        logHabitPlacementAudit(habit, "placement_rejection", {
          reason: "overlapInspection.result",
          day: formatDateKeyInTimeZone(day, zone),
          dayStart: toAuditIso(dayStart),
          offset,
          overlapResult: overlapInspection.result,
          blockerEndMs: overlapInspection.blockerEndMs,
          blockerEnd: toAuditIso(overlapInspection.blockerEndMs),
          candidateStart: toAuditIso(startCandidate),
          candidateEnd: toAuditIso(endCandidate),
          latestStartAllowed: toAuditIso(latestStartAllowedFallback),
          ...habitPlacementWindowAuditPayload({ target, window }),
        });
        continue;
      }

      if (normalizedType === "PRACTICE") {
        recordHabitPassMetric(timing, habitTimingPass, "practiceHistoryChecks");
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

      const candidateDurationMs = endCandidate - startCandidate;
      if (candidateDurationMs <= 0) {
        continue;
      }
      if (isSyncHabit && candidateDurationMs + 1 < desiredDurationMs) {
        continue;
      }
      scheduledDurationMs = candidateDurationMs;
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

      if (isSyncHabit) {
        const draftCandidate = {
          ...(existingInstance ?? {}),
          id:
            existingInstance?.id ??
            `draft:${habit.id}:${candidateStartUTC}:${candidateEndUTC}`,
          user_id: userId,
          source_id: habit.id,
          source_type: "HABIT",
          status: "scheduled",
          start_utc: candidateStartUTC,
          end_utc: candidateEndUTC,
          duration_min: durationMinutes,
          window_id: window.id,
          energy_resolved: energyResolved,
        } as ScheduleInstance;
        const validation = validateSyncInstanceInvariants({
          candidate: draftCandidate,
          habit,
          desiredDurationMs,
          instances: [...dayInstances, ...placedSoFar],
          habitTypeById,
          getWindowEntriesForInstance: getWindowEntriesForSeedInstance,
          fallbackWindowKey: target.key,
          fallbackWindow: window,
        });
        if (!validation.ok) {
          logHabitPlacementAudit(habit, "sync_invariant_rejection", {
            reason: validation.reason,
            phase: "candidate",
            day: formatDateKeyInTimeZone(day, zone),
            dayStart: toAuditIso(dayStart),
            offset,
            postAnchorSyncRetry,
            candidate: scheduleInstanceAuditPayload(draftCandidate),
            blockerId: "blockerId" in validation ? validation.blockerId : null,
            anchorId: "anchorId" in validation ? validation.anchorId : null,
            ...habitPlacementWindowAuditPayload({ target, window }),
          });
          continue;
        }
      }

      if (!isRepeatablePractice) {
        recordHabitPassMetric(timing, habitTimingPass, "existingInstanceChecks");
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
        if (isSyncHabit) {
          const validation = validateSyncInstanceInvariants({
            candidate: existingInstance,
            habit,
            desiredDurationMs,
            instances: [...dayInstances, ...placedSoFar],
            habitTypeById,
            getWindowEntriesForInstance: getWindowEntriesForSeedInstance,
            fallbackWindowKey: target.key,
            fallbackWindow: window,
          });
          if (!validation.ok) {
            logHabitPlacementAudit(habit, "sync_invariant_rejection", {
              reason: validation.reason,
              phase: "kept",
              day: formatDateKeyInTimeZone(day, zone),
              dayStart: toAuditIso(dayStart),
              offset,
              postAnchorSyncRetry,
              candidate: scheduleInstanceAuditPayload(existingInstance),
              blockerId: "blockerId" in validation ? validation.blockerId : null,
              anchorId: "anchorId" in validation ? validation.anchorId : null,
              ...habitPlacementWindowAuditPayload({ target, window }),
            });
            logCancelOnce(`SYNC_INVARIANT_${validation.reason}`, existingInstance);
            if (await cancelScheduledInstance(existingInstance)) {
              cleanupCanceledHabitInstance(existingInstance);
              existingInstance = null;
            }
            continue;
          }
        }
        decision = "kept";
        instanceId = existingInstance.id;
        persisted = existingInstance;
        registerInstance(existingInstance);
        onPersistedHabit?.(existingInstance);
      } else {
        if (!allowScheduling) {
          continue;
        }
        let placementNoFitCacheKey: string | null = null;
        if (noFitCache) {
          placementNoFitCacheKey = buildHabitPlacementNoFitCacheKey({
            habitId: habit.id,
            habitType: normalizedType,
            dayKey,
            offset,
            timeZone: zone,
            durationMinutes,
            energyResolved,
            practiceContextId: practiceContextId ?? null,
            reuseInstanceId: existingInstance?.id ?? null,
            window,
            windowKey: target.key,
            windowStartMs: isSyncHabit
              ? startCandidate
              : target.startLocal.getTime(),
            windowEndMs: isSyncHabit
              ? endCandidate
              : target.endLocal.getTime(),
            candidateStartMs: startCandidate,
            candidateEndMs: endCandidate,
            fromPrevDay: window.fromPrevDay ?? false,
            blockers: placedSoFar,
          });
        } else {
          if (noFitCacheStats) {
            noFitCacheStats.bypass += 1;
          }
        }
        if (
          placementNoFitCacheKey !== null &&
          noFitCache?.has(placementNoFitCacheKey)
        ) {
          if (noFitCacheStats) {
            noFitCacheStats.hit += 1;
          }
          logHabitPlacementAudit(habit, "placement_rejection", {
            reason: "placeItemInWindows NO_FIT",
            cache: "hit",
            day: formatDateKeyInTimeZone(day, zone),
            dayStart: toAuditIso(dayStart),
            offset,
            candidateStart: candidateStartUTC,
            candidateEnd: candidateEndUTC,
            durationMinutes,
            ...habitPlacementWindowAuditPayload({ target, window }),
          });
          continue;
        }
        if (placementNoFitCacheKey !== null) {
          if (noFitCacheStats) {
            noFitCacheStats.miss += 1;
          }
        }
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
              startLocal: isSyncHabit
                ? new Date(startCandidate)
                : target.startLocal,
              endLocal: isSyncHabit ? new Date(endCandidate) : target.endLocal,
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
          createBatcher,
          allowSyncCreateBatching: postAnchorSyncRetry,
          reuseInstanceId: existingInstance?.id,
          existingInstances: placedSoFar,
          allowHabitOverlap: allowsHabitOverlap,
          habitTypeById,
          windowEdgePreference: habit.windowEdgePreference,
          debugEnabled,
          timing,
        });

        if (!("status" in placement)) {
          if (placement.error === "NO_FIT") {
            if (placementNoFitCacheKey !== null) {
              noFitCache?.set(placementNoFitCacheKey, true);
              if (noFitCacheStats) {
                noFitCacheStats.set += 1;
              }
            }
            logHabitPlacementAudit(habit, "placement_rejection", {
              reason: "placeItemInWindows NO_FIT",
              day: formatDateKeyInTimeZone(day, zone),
              dayStart: toAuditIso(dayStart),
              offset,
              candidateStart: candidateStartUTC,
              candidateEnd: candidateEndUTC,
              durationMinutes,
              ...habitPlacementWindowAuditPayload({ target, window }),
            });
          }
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
          logHabitPlacementAudit(habit, "placement_rejection", {
            reason: "PERSIST_FAILED",
            day: formatDateKeyInTimeZone(day, zone),
            dayStart: toAuditIso(dayStart),
            offset,
            candidateStart: candidateStartUTC,
            candidateEnd: candidateEndUTC,
            reuseInstanceId: existingInstance?.id ?? null,
            hasPlacementData: Boolean(placement.data),
            error:
              placement.error instanceof Error
                ? placement.error.message
                : String(placement.error ?? "missing placement data"),
            ...habitPlacementWindowAuditPayload({ target, window }),
          });
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
            const { error: missError } = await recordHabitAsyncRead(
              timing,
              habitTimingPass,
              "habitPersistFailureMiss",
              () =>
                client
                  .from("schedule_instances")
                  .update({ status: "missed", missed_reason: "PERSIST_FAILED" })
                  .eq("id", existingInstance.id)
            );
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
        if (isSyncHabit) {
          const validation = validateSyncInstanceInvariants({
            candidate: persisted,
            habit,
            desiredDurationMs,
            instances: [...dayInstances, ...placedSoFar],
            habitTypeById,
            getWindowEntriesForInstance: getWindowEntriesForSeedInstance,
            fallbackWindowKey: target.key,
            fallbackWindow: window,
          });
          if (!validation.ok) {
            logHabitPlacementAudit(habit, "sync_invariant_rejection", {
              reason: validation.reason,
              phase: "persisted",
              day: formatDateKeyInTimeZone(day, zone),
              dayStart: toAuditIso(dayStart),
              offset,
              postAnchorSyncRetry,
              candidate: scheduleInstanceAuditPayload(persisted),
              blockerId: "blockerId" in validation ? validation.blockerId : null,
              anchorId: "anchorId" in validation ? validation.anchorId : null,
              ...habitPlacementWindowAuditPayload({ target, window }),
            });
            logCancelOnce(`SYNC_INVARIANT_${validation.reason}`, persisted);
            await cancelScheduledInstance(persisted);
            if (existingInstance?.id === persisted.id) {
              cleanupCanceledHabitInstance(existingInstance);
              existingInstance = null;
            }
            existingByHabitId.delete(habit.id);
            continue;
          }
        }
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
      logHabitPlacementAudit(habit, "placement_success", {
        day: formatDateKeyInTimeZone(day, zone),
        dayStart: toAuditIso(dayStart),
        offset,
        decision,
        persistedId: persisted.id ?? null,
        persistedStart: startUTC,
        persistedEnd: endUTC,
        windowId: persisted.window_id ?? window.id,
        timeBlockId: getAuditTimeBlockId(persisted) ?? window.id,
        dayTypeTimeBlockId:
          getAuditDayTypeTimeBlockId(persisted) ??
          targetDayTypeTimeBlockId,
        targetWindowKey: target.key,
      });

      addAnchorStart(anchorStartsByWindowKey, target.key, startDate.getTime());
      if (isSyncHabit) {
        const startMs = startDate.getTime();
        const endMs = endDate.getTime();
        addSyncUsage(target.key, startMs, endMs);
        claimSyncAnchorCoverage(target.key, startMs, endMs);
      }
      upsertInstance(dayInstances, persisted);
      let availabilitySnapshot: { front: Date; back: Date } | null = null;
      if (!usedReservation && !allowsHabitOverlap) {
        const liveBoundsBeforeUpdate = availability.get(target.key) ?? bounds ?? null;
        availabilitySnapshot = liveBoundsBeforeUpdate
          ? {
              front: new Date(liveBoundsBeforeUpdate.front.getTime()),
              back: new Date(liveBoundsBeforeUpdate.back.getTime()),
            }
          : null;
        if (liveBoundsBeforeUpdate) {
          if (anchorPreference === "BACK") {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              liveBoundsBeforeUpdate.front.getTime(),
              startDate.getTime()
            );
          } else {
            setAvailabilityBoundsForKey(
              availability,
              target.key,
              endDate.getTime(),
              liveBoundsBeforeUpdate.back.getTime()
            );
          }
        } else if (anchorPreference === "BACK") {
          setAvailabilityBoundsForKey(
            availability,
            target.key,
            Number.isFinite(windowStartMs) ? windowStartMs : startDate.getTime(),
            startDate.getTime()
          );
        } else {
          setAvailabilityBoundsForKey(
            availability,
            target.key,
            endDate.getTime(),
            endLimit
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

      onPersistedHabit?.(persisted);

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

  for (const habit of habits) {
    if (!shouldAuditHabitPlacement(habit)) continue;
    const finalRows = dayInstances
      .filter(
        (instance) =>
          instance?.source_type === "HABIT" &&
          instance.source_id === habit.id
      )
      .map(scheduleInstanceAuditPayload);
    logHabitPlacementAudit(habit, "final_day_habit_rows", {
      day: formatDateKeyInTimeZone(day, zone),
      dayStart: toAuditIso(dayStart),
      offset,
      postAnchorSyncRetry,
      finalRows,
    });
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

function parseFixedLocalClock(value?: string | null) {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  return { hour, minute, second };
}

function hasFixedHabitLocalTime(habit: HabitScheduleItem | null | undefined) {
  return Boolean(
    parseFixedLocalClock(habit?.fixedStartLocal) &&
      parseFixedLocalClock(habit?.fixedEndLocal)
  );
}

function buildFixedHabitRange(
  habit: HabitScheduleItem,
  day: Date,
  fallbackTimeZone: string
): FixedHabitRange | null {
  const startClock = parseFixedLocalClock(habit.fixedStartLocal);
  const endClock = parseFixedLocalClock(habit.fixedEndLocal);
  if (!startClock || !endClock) return null;
  const timeZone = normalizeTimeZone(habit.fixedTimezone ?? fallbackTimeZone);
  const start = setTimeInTimeZone(
    day,
    timeZone,
    startClock.hour,
    startClock.minute
  );
  const end = setTimeInTimeZone(day, timeZone, endClock.hour, endClock.minute);
  if (end.getTime() <= start.getTime()) return null;
  return {
    start,
    end,
    durationMin: Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 60000)
    ),
    timeZone,
  };
}

async function upsertFixedHabitInstance(params: {
  client: Client;
  userId: string;
  habit: HabitScheduleItem;
  day: Date;
  timeZone: string;
  existingInstance?: ScheduleInstance | null;
  metadata?: ScheduleInstance["metadata"] | null;
  timing?: SchedulerTiming | null;
  habitTimingPass?: HabitPlacementPass;
}): Promise<FixedHabitPersistResult> {
  const {
    client,
    userId,
    habit,
    day,
    timeZone,
    existingInstance,
    metadata,
    timing = null,
    habitTimingPass = null,
  } = params;
  const range = buildFixedHabitRange(habit, day, timeZone);
  if (!range) {
    return {
      instance: null,
      decision: "skipped",
      error: new Error("Invalid fixed habit time range"),
      range: null,
    };
  }

  const startUTC = range.start.toISOString();
  const endUTC = range.end.toISOString();
  const energyResolved = resolveHabitExplicitEnergy(habit) ?? "NO";
  const normalizedType = normalizeHabitTypeValue(habit.habitType);
  const practiceContextId =
    normalizedType === "PRACTICE" ? (habit.skillMonumentId ?? null) : null;
  const updatePayload = {
    start_utc: startUTC,
    end_utc: endUTC,
    duration_min: range.durationMin,
    status: "scheduled",
    locked: true,
    placement_source: "scheduler",
    window_id: null,
    day_type_time_block_id: null,
    time_block_id: null,
    energy_resolved: energyResolved,
    event_name: habit.name ?? null,
    practice_context_monument_id: practiceContextId,
    ...(metadata ? { metadata } : {}),
  } satisfies Database["public"]["Tables"]["schedule_instances"]["Update"];

  if (
    existingInstance?.id &&
    !metadata &&
    existingInstance.start_utc === startUTC &&
    existingInstance.end_utc === endUTC &&
    existingInstance.duration_min === range.durationMin &&
    existingInstance.locked === true &&
    existingInstance.status === "scheduled" &&
    existingInstance.window_id === null &&
    existingInstance.time_block_id === null &&
    (existingInstance.energy_resolved ?? "NO").toUpperCase() ===
      energyResolved.toUpperCase()
  ) {
    return {
      instance: existingInstance,
      decision: "kept",
      error: null,
      range,
    };
  }

  if (existingInstance?.id) {
    const { data, error } = await recordHabitAsyncRead(
      timing,
      habitTimingPass,
      "habitPersistUpdateExisting",
      () =>
        client
          .from("schedule_instances")
          .update(updatePayload)
          .eq("id", existingInstance.id)
          .eq("user_id", userId)
          .select("*")
          .single()
    );
    return {
      instance: error ? null : ((data as ScheduleInstance | null) ?? null),
      decision: "rescheduled",
      error,
      range,
    };
  }

  const insertPayload = {
    user_id: userId,
    source_type: "HABIT",
    source_id: habit.id,
    weight_snapshot: 0,
    ...updatePayload,
  } satisfies Database["public"]["Tables"]["schedule_instances"]["Insert"];
  const { data, error } = await recordHabitAsyncRead(
    timing,
    habitTimingPass,
    "habitPersistInsertNew",
    () =>
      client
        .from("schedule_instances")
        .insert(insertPayload)
        .select("*")
        .single()
  );
  return {
    instance: error ? null : ((data as ScheduleInstance | null) ?? null),
    decision: "new",
    error,
    range,
  };
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
  sourceType?: string | null;
  skillId?: string | null;
  skillIds?: string[] | null;
  monumentId?: string | null;
  skillMonumentId?: string | null;
  monumentIds?: string[] | null;
  isProject?: boolean;
  allowEmptyProjectCandidates?: boolean;
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
    isOverlayCandidate?: boolean;
    overlayWindowId?: string | null;
    energy?: string | null;
    locationContextId?: string | null;
    locationContextValue?: string | null;
    gateTrace: BlockGateSample;
  }>;
  filterCounters?: PlacementFilterWaterfall;
  expiredToday?: boolean;
};

export async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: ConstraintAwareItem,
  timeZone: string,
  options?: {
    now?: Date;
    availability?: Map<string, WindowAvailabilityBounds>;
    cloneAvailabilityBeforeMutating?: boolean;
    forceDayScopedAvailabilityKey?: boolean;
    cache?: Map<string, WindowLite[]>;
    overlayBlockCache?: OverlayWindowBlockCache;
    dynamicOverlayCache?: DynamicOverlayWindowCache;
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
    isHabitReservation?: boolean;
    locationDebugContext?: {
      rejectedByLocation?: () => void;
      acceptedWithWindowLocationButNullItemLocation?: () => void;
    };
    auditZeroStageCallback?: (stage: string | null) => void;
    horizonEnd?: Date;
    parity?: FetchWindowsParityOptions | null;
    habitTimingPass?: HabitPlacementPass;
    timing?: SchedulerTiming | null;
  }
): Promise<FetchCompatibleWindowsResult> {
  const timing = options?.timing ?? null;
  const habitTimingPass = options?.habitTimingPass ?? null;
  const startedAt = schedulerNowMs();
  const isProjectCall = item.isProject === true || item.sourceType === "PROJECT";
  const isHabitCall =
    Boolean(item.habitType) || item.sourceType === "HABIT" || !isProjectCall;
  let windowsIn = 0;
  let windowsOut = 0;
  if (timing) {
    timing.schedule.compatibleWindows.calls += 1;
    if (isProjectCall) timing.schedule.compatibleWindows.projectCalls += 1;
    if (isHabitCall) timing.schedule.compatibleWindows.habitCalls += 1;
  }
  if (isHabitCall) {
    recordHabitPassMetric(timing, habitTimingPass, "compatibleWindowCalls");
  }
  try {
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
  const filterCounters: PlacementFilterWaterfall | null = trackFilters
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

  let overlayBlocksPromise: Promise<OverlayWindowBlock[]> = Promise.resolve([]);
  if (userId && userId.length > 0) {
    const resolvedOverlayBlocks = getResolvedCachedOverlayWindowBlocksForDate(
      date,
      timeZone,
      userId,
      options?.overlayBlockCache
    );
    overlayBlocksPromise = resolvedOverlayBlocks
      ? Promise.resolve(resolvedOverlayBlocks)
      : recordHabitAsyncRead(timing, habitTimingPass, "overlayBlocks", () =>
          getCachedOverlayWindowBlocksForDate(
            supabase,
            date,
            timeZone,
            userId,
            options?.overlayBlockCache,
            timing
          )
        );
  }
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
        const dayWindows = await recordHabitAsyncRead(
          timing,
          habitTimingPass,
          "horizonFetchWindows",
          () =>
            fetchWindowsForDate(currentDay, supabase, timeZone, {
              ...windowOptionsBase,
            })
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
    windows = await recordHabitAsyncRead(
      timing,
      habitTimingPass,
      "fetchWindows",
      () =>
        fetchWindowsForDate(date, supabase, timeZone, {
          ...windowOptionsBase,
        })
    );
    cache?.set(cacheKey, windows);
  }

  const constraintItem = {
    habitType: item.habitType ?? null,
    sourceType: item.sourceType ?? null,
    skillId: item.skillId ?? null,
    skillIds: item.skillIds ?? null,
    monumentId: item.monumentId ?? null,
    skillMonumentId: item.skillMonumentId ?? null,
    monumentIds: item.monumentIds ?? null,
    isProject: item.isProject ?? false,
    allowEmptyProjectCandidates: item.allowEmptyProjectCandidates ?? false,
  };

  if (userId && userId.length > 0) {
    const overlayNow =
      options?.now ?? options?.dynamicOverlayCache?.effectiveNow ?? new Date();
    if (windowOccurrences) {
      const occurrenceDays: Date[] = [];
      let cursor = new Date(date);
      const endDate = options?.horizonEnd ? new Date(options.horizonEnd) : date;
      while (cursor <= endDate) {
        occurrenceDays.push(new Date(cursor));
        cursor = addDaysInTimeZone(cursor, 1, timeZone);
      }
      for (const occurrenceDate of occurrenceDays) {
        const resolvedDynamicWindows =
          getResolvedCachedDynamicOverlayWindowsForDate(
            occurrenceDate,
            timeZone,
            userId,
            overlayNow,
            options?.dynamicOverlayCache
          );
        const dynamicWindows = resolvedDynamicWindows
          ? resolvedDynamicWindows
          : await recordHabitAsyncRead(
              timing,
              habitTimingPass,
              "dynamicOverlayWindows",
              () =>
                getCachedDynamicOverlayWindowsForDate(
                  supabase,
                  occurrenceDate,
                  timeZone,
                  userId,
                  overlayNow,
                  options?.dynamicOverlayCache,
                  timing
                )
            );
        for (const window of dynamicWindows) {
          windowOccurrences.push({ window, occurrenceDate });
        }
      }
      windows = windowOccurrences.map((occ) => occ.window);
    } else {
      const resolvedDynamicWindows =
        getResolvedCachedDynamicOverlayWindowsForDate(
          date,
          timeZone,
          userId,
          overlayNow,
          options?.dynamicOverlayCache
        );
      const dynamicWindows = resolvedDynamicWindows
        ? resolvedDynamicWindows
        : await recordHabitAsyncRead(
            timing,
            habitTimingPass,
            "dynamicOverlayWindows",
            () =>
              getCachedDynamicOverlayWindowsForDate(
                supabase,
                date,
                timeZone,
                userId,
                overlayNow,
                options?.dynamicOverlayCache,
                timing
              )
          );
      if (dynamicWindows.length > 0) {
        windows = [...windows, ...dynamicWindows];
      }
    }
  }

  const windowOccurrencesBeforeConstraints = windowOccurrences;
  const windowsBeforeConstraints = windows;
  const originalWindowCount =
    windowOccurrencesBeforeConstraints?.length ?? windowsBeforeConstraints.length;
  windowsIn = originalWindowCount;
  const hasConstraints =
    (windows?.some?.(
      (win) =>
        win.allowAllInstanceTypes === false ||
        win.allowAllHabitTypes === false ||
        win.allowAllSkills === false ||
        win.allowAllMonuments === false ||
        (win.allowedInstanceTypes && win.allowedInstanceTypes.length > 0) ||
        (win.allowedHabitTypes && win.allowedHabitTypes.length > 0) ||
        (win.allowedSkillIds && win.allowedSkillIds.length > 0) ||
        (win.allowedMonumentIds && win.allowedMonumentIds.length > 0)
    ) ??
      false) ||
    (windowOccurrences?.some?.(
      ({ window: win }) =>
        win.allowAllInstanceTypes === false ||
        win.allowAllHabitTypes === false ||
        win.allowAllSkills === false ||
        win.allowAllMonuments === false ||
        (win.allowedInstanceTypes && win.allowedInstanceTypes.length > 0) ||
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
        allowAllInstanceTypes: win.allowAllInstanceTypes,
        allowAllHabitTypes: win.allowAllHabitTypes,
        allowAllSkills: win.allowAllSkills,
        allowAllMonuments: win.allowAllMonuments,
        allowedInstanceTypes: win.allowedInstanceTypes,
        allowedHabitTypes: win.allowedHabitTypes,
        allowedSkillIds: win.allowedSkillIds,
        allowedMonumentIds: win.allowedMonumentIds,
        allowedInstanceTypesSet: win.allowedInstanceTypesSet ?? null,
        allowedHabitTypesSet: win.allowedHabitTypesSet ?? null,
        allowedSkillIdsSet: win.allowedSkillIdsSet ?? null,
        allowedMonumentIdsSet: win.allowedMonumentIdsSet ?? null,
        window_kind: win.window_kind,
        windowKind: (win as any).windowKind ?? null,
        block_type: (win as any).block_type ?? null,
        blockType: (win as any).blockType ?? null,
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

    if (windowOccurrencesBeforeConstraints) {
      windowOccurrences = filteredWindowOccurrences;
      windows = filteredWindowOccurrences.map((occ) => occ.window);
    } else if (filteredWindowList) {
      windows = filteredWindowList;
    } else {
      windows = [];
    }
    if (filterCounters && constraintCounts) {
      mergeFilterCounters(filterCounters, constraintCounts);
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
    : options?.cloneAvailabilityBeforeMutating && options.availability
      ? cloneAvailabilityMap(options.availability)
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
  const shouldEnforceLocation = options?.requireLocationContextMatch === true;
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

  const compatible: CompatibleWindowRecord[] = [];
  const compareCompatibleWindows = (
    a: CompatibleWindowRecord,
    b: CompatibleWindowRecord
  ) => {
    const startDiff =
      a.availableStartLocal.getTime() - b.availableStartLocal.getTime();
    if (startDiff !== 0) return startDiff;
    const energyDiff = a.energyIdx - b.energyIdx;
    if (energyDiff !== 0) return energyDiff;
    const rawStartDiff = a.startLocal.getTime() - b.startLocal.getTime();
    if (rawStartDiff !== 0) return rawStartDiff;
    return a.id.localeCompare(b.id);
  };

  const restMode = options?.restMode ?? false;
  const isHabitReservation =
    options?.isHabitReservation === true && !constraintItem.isProject;

  let totalWindows = 0;
  let afterAllowedWindowKinds = 0;
  let afterEnergy = 0;
  let afterLocation = 0;
  let afterNowTrim = 0;
  let afterDaylight = 0;
  let afterAvailability = 0;
  let afterDuration = 0;
  let expiredToday = false;
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
    } else if (!isHabitReservation && energyIdx < itemIdx) {
      recordStage("energy match", false, "window energy lower than item");
      addFilterRejection(filterCounters, "ENERGY_MISMATCH");
      continue;
    }
    recordStage("energy match", true);
    if (stagePassCounts) stagePassCounts["energy match"] += 1;
    if (options?.horizonEnd) afterEnergy++;

    const windowLocationId = resolveWindowLocationContextId(win);
    const windowLocationValue = normalizeLocationContextValue(
      win.location_context_value ?? null
    );
    const windowHasLocation = Boolean(windowLocationId || windowLocationValue);
    const attemptHasLocation = Boolean(desiredLocationId || desiredLocationValue);
    const blockRequiresExactLocation = windowLocationId !== null;
    const applyLocationGate =
      blockRequiresExactLocation ||
      shouldEnforceLocation ||
      options?.hasExplicitLocationContext === true ||
      attemptHasLocation;

    if (applyLocationGate) {
      if (stagePassCounts) stagePassCounts["location match"] += 1;
      if (options?.horizonEnd) afterLocation++;

      if (windowLocationId !== null) {
        if (!desiredLocationId) {
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
        const idsBothPresent = Boolean(desiredLocationId && windowLocationId);
        const idsMatch = idsBothPresent && desiredLocationId === windowLocationId;
        const valueFallbackMatches =
          !idsBothPresent &&
          Boolean(
            desiredLocationValue && windowLocationValue === desiredLocationValue
          );
        if (!idsMatch && !valueFallbackMatches) {
          recordStage("location match", false, "location context id missing");
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
      const baseWindowId =
        descriptor.windowId ??
        descriptor.window_id ??
        descriptor.timeBlockId ??
        descriptor.time_block_id ??
        descriptor.dayTypeTimeBlockId ??
        descriptor.day_type_time_block_id ??
        win.id ??
        "window";
      keyDescriptor = {
        dayTypeTimeBlockId: null,
        day_type_time_block_id: null,
        windowId: null,
        window_id: null,
        timeBlockId: null,
        time_block_id: null,
        id:
          startMs !== null && endMs !== null
            ? `${baseWindowId}:${startMs}-${endMs}`
            : String(baseWindowId),
        startMs,
        endMs,
      };
    }
    const key = getAvailabilityWindowKey(keyDescriptor);
    const startMs = startLocal.getTime();
    const endMs = endLocal.getTime();

    let frontBoundMs = startMs;
    if (typeof nowMs === "number") {
      if (endMs <= nowMs) {
        expiredToday = true;
        continue;
      }
      if (startMs < nowMs && nowMs < endMs) {
        frontBoundMs = nowMs;
      }
    }
    recordStage("nowMs trim", true);
    if (stagePassCounts) stagePassCounts["nowMs trim"] += 1;
    if (options?.horizonEnd) afterNowTrim++;

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

    if (frontBoundMs >= backBoundMs) {
      continue;
    }
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

    if (frontBoundMs >= backBoundMs) {
      continue;
    }
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

    let candidateEndMs = candidateStartMs + durationMs;
    if (isHabitReservation) {
      candidateEndMs = Math.min(candidateEndMs, backBoundMs);
    } else if (candidateEndMs > backBoundMs) {
      continue;
    }
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
      isOverlayCandidate: win.isOverlayCandidate ?? false,
      overlayWindowId: win.overlayWindowId ?? null,
      gateTrace,
    });
  }

  compatible.sort(compareCompatibleWindows);

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

  const overlayBlocks = await overlayBlocksPromise;
  let finalCompatible = compatible;
  if (overlayBlocks.length > 0) {
    finalCompatible = applyOverlayBlocks(compatible, overlayBlocks, durationMs);
    finalCompatible.sort(compareCompatibleWindows);
  }

  const compatibleWindows = finalCompatible.map((win) => ({
    id: win.id,
    key: win.key,
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    availableStartLocal: win.availableStartLocal,
    dayTypeTimeBlockId: win.dayTypeTimeBlockId ?? null,
    timeBlockId: win.timeBlockId ?? null,
    fromPrevDay: win.fromPrevDay ?? undefined,
    isOverlayCandidate: win.isOverlayCandidate ?? undefined,
    overlayWindowId: win.overlayWindowId ?? null,
  }));
  windowsOut = compatibleWindows.length;
  if (timing) {
    timing.schedule.compatibleWindows.windowsIn += windowsIn;
    timing.schedule.compatibleWindows.windowsOut += windowsOut;
    if (windowsOut === 0) {
      timing.schedule.compatibleWindows.zeroResults += 1;
    }
    if (filterCounters) {
      const target = timing.schedule.compatibleWindows.constraintRejections;
      target.dayTypeIncompatible =
        (target.dayTypeIncompatible ?? 0) + filterCounters.dayTypeIncompatible;
      target.itemTypeNotAllowed =
        (target.itemTypeNotAllowed ?? 0) + filterCounters.itemTypeNotAllowed;
      target.skillNotAllowed =
        (target.skillNotAllowed ?? 0) + filterCounters.skillNotAllowed;
      target.monumentNotAllowed =
        (target.monumentNotAllowed ?? 0) + filterCounters.monumentNotAllowed;
      target.locationMismatch =
        (target.locationMismatch ?? 0) + filterCounters.locationMismatch;
      target.energyMismatch =
        (target.energyMismatch ?? 0) + filterCounters.energyMismatch;
    }
  }
  return {
    windows: compatibleWindows,
    filterCounters: filterCounters ?? undefined,
    expiredToday,
  };
  } finally {
    if (timing) {
      const compatibleMs = elapsedMs(startedAt);
      timing.schedule.compatibleWindows.totalMs += compatibleMs;
      if (isHabitCall) {
        recordHabitPassMetric(
          timing,
          habitTimingPass,
          "compatibleWindowMs",
          compatibleMs
        );
      }
    }
  }
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

async function loadOverlayWindowBlocksForDate(
  supabase: Client,
  date: Date,
  timeZone: string,
  userId: string,
  timing?: SchedulerTiming | null
): Promise<OverlayWindowBlock[]> {
  const startedAt = schedulerNowMs();
  const tz = timeZone || "UTC";
  const dayStart = startOfDayInTimeZone(date, tz);
  const dayEnd = addDaysInTimeZone(dayStart, 1, tz);
  const isoStart = dayStart.toISOString();
  const isoEnd = dayEnd.toISOString();

  const { data, error } = await supabase
    .from("overlay_windows" as any)
    .select<{
      id: string | null;
      start_utc: string | null;
      end_utc: string | null;
      mode?: string | null;
    }>(
      "id,start_utc,end_utc,mode"
    )
    .eq("user_id", userId)
    .lt("start_utc", isoEnd)
    .gt("end_utc", isoStart);

  if (error) {
    logSchedulerDebug("[OVERLAY_WINDOWS] load failed", {
      userId,
      date: date.toISOString(),
      timeZone: tz,
      error,
    });
    return [];
  }

  const blocks: OverlayWindowBlock[] = [];
  for (const row of data ?? []) {
    const mode =
      typeof row.mode === "string" ? row.mode.toUpperCase().trim() : null;
    if (mode && mode !== "MANUAL" && mode !== "DYNAMIC") continue;
    const start = safeDate(row.start_utc ?? null);
    const end = safeDate(row.end_utc ?? null);
    if (!start || !end) continue;
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= endMs
    ) {
      continue;
    }
    blocks.push({ id: row.id ?? null, startMs, endMs });
  }

  blocks.sort((a, b) => a.startMs - b.startMs);
  if (timing) {
    const ms = elapsedMs(startedAt);
    timing.schedule.overlaySpanLoading.calls += 1;
    timing.schedule.overlaySpanLoading.totalMs += ms;
    timing.schedule.overlaySpanLoading.rows += blocks.length;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.overlay_span_loading",
      ms
    );
  }
  return blocks;
}

function overlayWindowBlockCacheKey(
  userId: string,
  date: Date,
  timeZone: string
) {
  const tz = timeZone || "UTC";
  return `${userId}:${formatDateKeyInTimeZone(date, tz)}:${tz}`;
}

function getCachedOverlayWindowBlocksForDate(
  supabase: Client,
  date: Date,
  timeZone: string,
  userId: string,
  cache: OverlayWindowBlockCache | null | undefined,
  timing?: SchedulerTiming | null
): Promise<OverlayWindowBlock[]> {
  if (!cache) {
    return loadOverlayWindowBlocksForDate(
      supabase,
      date,
      timeZone,
      userId,
      timing
    );
  }

  const key = overlayWindowBlockCacheKey(userId, date, timeZone);
  const resolved = cache.resolvedBlocksByKey.get(key);
  if (resolved) {
    return Promise.resolve(resolved);
  }
  const cached = cache.blocksByKey.get(key);
  if (cached) {
    return cached;
  }

  if (timing) {
    timing.schedule.overlaySpanLoading.demandFallbackCount += 1;
  }
  const pending = loadOverlayWindowBlocksForDate(
    supabase,
    date,
    timeZone,
    userId,
    timing
  )
    .then((blocks) => {
      cache.resolvedBlocksByKey.set(key, blocks);
      return blocks;
    })
    .catch((error) => {
      cache.blocksByKey.delete(key);
      cache.resolvedBlocksByKey.delete(key);
      throw error;
    });
  cache.blocksByKey.set(key, pending);
  return pending;
}

function getResolvedCachedOverlayWindowBlocksForDate(
  date: Date,
  timeZone: string,
  userId: string,
  cache: OverlayWindowBlockCache | null | undefined
): OverlayWindowBlock[] | null {
  if (!cache) return null;
  const key = overlayWindowBlockCacheKey(userId, date, timeZone);
  return cache.resolvedBlocksByKey.get(key) ?? null;
}

function dynamicOverlayCacheKey(
  userId: string,
  date: Date,
  timeZone: string,
  now: Date
) {
  const tz = timeZone || "UTC";
  const nowMs = now.getTime();
  const effectiveNow =
    Number.isFinite(nowMs) ? now.toISOString() : new Date().toISOString();
  return `${userId}:${formatDateKeyInTimeZone(date, tz)}:${tz}:${effectiveNow}`;
}

function getCachedDynamicOverlayWindowsForDate(
  supabase: Client,
  date: Date,
  timeZone: string,
  userId: string,
  now: Date | null | undefined,
  cache: DynamicOverlayWindowCache | null | undefined,
  timing?: SchedulerTiming | null
): Promise<WindowLite[]> {
  const effectiveNow = now ?? cache?.effectiveNow ?? new Date();
  if (!cache) {
    return loadDynamicOverlayWindowsForDate(
      supabase,
      date,
      timeZone,
      userId,
      effectiveNow,
      timing
    );
  }

  const key = dynamicOverlayCacheKey(userId, date, timeZone, effectiveNow);
  const resolved = cache.resolvedWindowsByKey.get(key);
  if (resolved) {
    return Promise.resolve(resolved);
  }
  const cached = cache.windowsByKey.get(key);
  if (cached) {
    return cached;
  }

  if (timing) {
    timing.schedule.overlaySpanLoading.demandFallbackCount += 1;
  }
  const pending = loadDynamicOverlayWindowsForDate(
    supabase,
    date,
    timeZone,
    userId,
    effectiveNow,
    timing
  )
    .then((windows) => {
      cache.resolvedWindowsByKey.set(key, windows);
      return windows;
    })
    .catch((error) => {
      cache.windowsByKey.delete(key);
      cache.resolvedWindowsByKey.delete(key);
      throw error;
    });
  cache.windowsByKey.set(key, pending);
  return pending;
}

function getResolvedCachedDynamicOverlayWindowsForDate(
  date: Date,
  timeZone: string,
  userId: string,
  now: Date | null | undefined,
  cache: DynamicOverlayWindowCache | null | undefined
): WindowLite[] | null {
  if (!cache) return null;
  const effectiveNow = now ?? cache.effectiveNow;
  const key = dynamicOverlayCacheKey(userId, date, timeZone, effectiveNow);
  return cache.resolvedWindowsByKey.get(key) ?? null;
}

async function preloadOverlayWindowCachesForDates(params: {
  supabase: Client;
  dates: Date[];
  timeZone: string;
  userId: string;
  overlayBlockCache: OverlayWindowBlockCache;
  dynamicOverlayCache: DynamicOverlayWindowCache;
  timing?: SchedulerTiming | null;
}) {
  const startedAt = schedulerNowMs();
  const userId = params.userId.trim();
  if (!userId || params.dates.length === 0) return;

  const tz = params.timeZone || "UTC";
  const daysByKey = new Map<
    string,
    { date: Date; start: Date; end: Date; startMs: number; endMs: number }
  >();
  for (const date of params.dates) {
    const start = startOfDayInTimeZone(date, tz);
    const end = addDaysInTimeZone(start, 1, tz);
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    daysByKey.set(formatDateKeyInTimeZone(start, tz), {
      date: start,
      start,
      end,
      startMs,
      endMs,
    });
  }
  const days = Array.from(daysByKey.values()).sort(
    (a, b) => a.startMs - b.startMs
  );
  if (days.length === 0) return;

  const rangeStart = days[0].start;
  const rangeEnd = days[days.length - 1].end;
  const isoStart = rangeStart.toISOString();
  const isoEnd = rangeEnd.toISOString();
  const effectiveNow = params.dynamicOverlayCache.effectiveNow;
  const nowMs = effectiveNow.getTime();
  const isoNow = Number.isFinite(nowMs)
    ? effectiveNow.toISOString()
    : new Date().toISOString();

  let blockCacheSet = false;
  try {
    const { data, error } = await params.supabase
      .from("overlay_windows" as any)
      .select<{
        id: string | null;
        start_utc: string | null;
        end_utc: string | null;
        mode?: string | null;
      }>("id,start_utc,end_utc,mode")
      .eq("user_id", userId)
      .lt("start_utc", isoEnd)
      .gt("end_utc", isoStart);

    if (!error) {
      const blocksByDayKey = new Map<string, OverlayWindowBlock[]>();
      let rangeBlockRows = 0;
      for (const row of data ?? []) {
        const mode =
          typeof row.mode === "string" ? row.mode.toUpperCase().trim() : null;
        if (mode && mode !== "MANUAL" && mode !== "DYNAMIC") continue;
        const start = safeDate(row.start_utc ?? null);
        const end = safeDate(row.end_utc ?? null);
        if (!start || !end) continue;
        const startMs = start.getTime();
        const endMs = end.getTime();
        if (
          !Number.isFinite(startMs) ||
          !Number.isFinite(endMs) ||
          startMs >= endMs
        ) {
          continue;
        }
        rangeBlockRows += 1;
        for (const day of days) {
          if (startMs >= day.endMs || endMs <= day.startMs) continue;
          const key = overlayWindowBlockCacheKey(userId, day.date, tz);
          const list = blocksByDayKey.get(key) ?? [];
          list.push({
            id: row.id ?? null,
            startMs: Math.max(startMs, day.startMs),
            endMs: Math.min(endMs, day.endMs),
          });
          blocksByDayKey.set(key, list);
        }
      }

      let rowCount = 0;
      for (const day of days) {
        const key = overlayWindowBlockCacheKey(userId, day.date, tz);
        const blocks = blocksByDayKey.get(key) ?? [];
        blocks.sort((a, b) => a.startMs - b.startMs);
        params.overlayBlockCache.resolvedBlocksByKey.set(key, blocks);
        params.overlayBlockCache.blocksByKey.delete(key);
        rowCount += blocks.length;
      }
      blockCacheSet = true;
      if (params.timing) {
        params.timing.schedule.overlaySpanLoading.calls += 1;
        params.timing.schedule.overlaySpanLoading.rows += rowCount;
        params.timing.schedule.overlaySpanLoading.rangeBlockRows +=
          rangeBlockRows;
      }
    }
  } catch {
    blockCacheSet = false;
  }

  let dynamicCacheSet = false;
  try {
    const contextJoin = "location_context:location_contexts(id, value, label)";
    const { data, error } = await params.supabase
      .from("overlay_windows" as any)
      .select<DynamicOverlayWindowRow>(
        `id,label,start_utc,end_utc,mode,block_type,energy,location_context_id,allow_all_instance_types,allow_all_skills,allow_all_monuments,${contextJoin}`
      )
      .eq("user_id", userId)
      .eq("mode", "DYNAMIC")
      .lt("start_utc", isoEnd)
      .gt("end_utc", isoStart)
      .gt("end_utc", isoNow);

    if (!error) {
      const rows = (data ?? []).filter((row) => {
        const mode =
          typeof row.mode === "string" ? row.mode.toUpperCase().trim() : null;
        if (mode !== "DYNAMIC") return false;
        const start = safeDate(row.start_utc ?? null);
        const end = safeDate(row.end_utc ?? null);
        if (!start || !end) return false;
        const startMs = start.getTime();
        const endMs = end.getTime();
        return (
          Number.isFinite(startMs) &&
          Number.isFinite(endMs) &&
          startMs < rangeEnd.getTime() &&
          endMs > rangeStart.getTime() &&
          endMs > nowMs &&
          startMs < endMs
        );
      });

      const overlayIds = rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      const [instanceWhitelist, skillWhitelist, monumentWhitelist] =
        overlayIds.length > 0
          ? await Promise.all([
              params.supabase
                .from("overlay_window_allowed_instance_types" as any)
                .select("overlay_window_id,instance_type")
                .in("overlay_window_id", overlayIds),
              params.supabase
                .from("overlay_window_allowed_skills" as any)
                .select("overlay_window_id,skill_id")
                .in("overlay_window_id", overlayIds),
              params.supabase
                .from("overlay_window_allowed_monuments" as any)
                .select("overlay_window_id,monument_id")
                .in("overlay_window_id", overlayIds),
            ])
          : [
              {
                data: [] as OverlayWindowInstanceTypeWhitelistRow[] | null,
                error: null,
              },
              {
                data: [] as OverlayWindowSkillWhitelistRow[] | null,
                error: null,
              },
              {
                data: [] as OverlayWindowMonumentWhitelistRow[] | null,
                error: null,
              },
            ];

      if (instanceWhitelist.error) throw instanceWhitelist.error;
      if (skillWhitelist.error) throw skillWhitelist.error;
      if (monumentWhitelist.error) throw monumentWhitelist.error;

      const instanceAllowMap = new Map<string, Set<string>>();
      for (const row of (instanceWhitelist.data ??
        []) as OverlayWindowInstanceTypeWhitelistRow[]) {
        const key = row.overlay_window_id ?? "";
        if (!key || !row.instance_type) continue;
        const normalized = row.instance_type.toUpperCase().trim();
        if (!normalized) continue;
        const existing = instanceAllowMap.get(key) ?? new Set<string>();
        existing.add(normalized);
        instanceAllowMap.set(key, existing);
      }

      const skillAllowMap = new Map<string, Set<string>>();
      for (const row of (skillWhitelist.data ??
        []) as OverlayWindowSkillWhitelistRow[]) {
        const key = row.overlay_window_id ?? "";
        if (!key || !row.skill_id) continue;
        const normalized = row.skill_id.trim();
        if (!normalized) continue;
        const existing = skillAllowMap.get(key) ?? new Set<string>();
        existing.add(normalized);
        skillAllowMap.set(key, existing);
      }

      const monumentAllowMap = new Map<string, Set<string>>();
      for (const row of (monumentWhitelist.data ??
        []) as OverlayWindowMonumentWhitelistRow[]) {
        const key = row.overlay_window_id ?? "";
        if (!key || !row.monument_id) continue;
        const normalized = row.monument_id.trim();
        if (!normalized) continue;
        const existing = monumentAllowMap.get(key) ?? new Set<string>();
        existing.add(normalized);
        monumentAllowMap.set(key, existing);
      }

      const normalizeAllowAllFlag = (
        flag: boolean | null | undefined,
        whitelistSize: number
      ): boolean => flag === true || (flag == null && whitelistSize === 0);

      const localTimeLabel = (value: Date) => {
        const parts = getDateTimeParts(value, tz);
        return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
      };

      const windowsByDayKey = new Map<string, WindowLite[]>();
      for (const row of rows) {
        if (!row.id) continue;
        const start = safeDate(row.start_utc ?? null);
        const end = safeDate(row.end_utc ?? null);
        if (!start || !end) continue;
        const startMs = start.getTime();
        const endMs = end.getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
        const overlayId = row.id;
        const instanceWhitelist = instanceAllowMap.get(overlayId);
        const skillWhitelist = skillAllowMap.get(overlayId);
        const monumentWhitelist = monumentAllowMap.get(overlayId);
        const locationValue =
          row.location_context_id && row.location_context?.value
            ? String(row.location_context.value).toUpperCase().trim()
            : null;
        const locationLabel =
          row.location_context?.label ?? (locationValue ? locationValue : null);
        const window: WindowLite = {
          id: `overlay:${overlayId}`,
          label: row.label ?? "Dynamic Overlay",
          energy:
            typeof row.energy === "string" && row.energy.trim().length > 0
              ? row.energy.trim().toUpperCase()
              : "",
          start_local: localTimeLabel(start),
          end_local: localTimeLabel(end),
          days: null,
          location_context_id: row.location_context_id ?? null,
          location_context_value: locationValue,
          location_context_name: locationLabel,
          window_kind: normalizeBlockType(row.block_type),
          dayTypeStartUtcMs: startMs,
          dayTypeEndUtcMs: endMs,
          isOverlayCandidate: true,
          overlayWindowId: overlayId,
          allowAllInstanceTypes: normalizeAllowAllFlag(
            row.allow_all_instance_types,
            instanceWhitelist?.size ?? 0
          ),
          allowAllHabitTypes: true,
          allowAllSkills: normalizeAllowAllFlag(
            row.allow_all_skills,
            skillWhitelist?.size ?? 0
          ),
          allowAllMonuments: normalizeAllowAllFlag(
            row.allow_all_monuments,
            monumentWhitelist?.size ?? 0
          ),
          allowedInstanceTypes: Array.from(instanceWhitelist ?? []),
          allowedSkillIds: Array.from(skillWhitelist ?? []),
          allowedMonumentIds: Array.from(monumentWhitelist ?? []),
        };

        for (const day of days) {
          if (startMs >= day.endMs || endMs <= day.startMs) continue;
          const key = dynamicOverlayCacheKey(userId, day.date, tz, effectiveNow);
          const list = windowsByDayKey.get(key) ?? [];
          list.push({ ...window });
          windowsByDayKey.set(key, list);
        }
      }

      let rowCount = 0;
      for (const day of days) {
        const key = dynamicOverlayCacheKey(userId, day.date, tz, effectiveNow);
        const windows = windowsByDayKey.get(key) ?? [];
        windows.sort((a, b) => {
          const startDiff =
            (a.dayTypeStartUtcMs ?? 0) - (b.dayTypeStartUtcMs ?? 0);
          if (startDiff !== 0) return startDiff;
          return a.id.localeCompare(b.id);
        });
        params.dynamicOverlayCache.resolvedWindowsByKey.set(key, windows);
        params.dynamicOverlayCache.windowsByKey.delete(key);
        rowCount += windows.length;
      }
      dynamicCacheSet = true;
      if (params.timing) {
        const whitelistRows =
          ((instanceWhitelist.data ?? []) as unknown[]).length +
          ((skillWhitelist.data ?? []) as unknown[]).length +
          ((monumentWhitelist.data ?? []) as unknown[]).length;
        params.timing.schedule.overlaySpanLoading.dynamicCalls += 1;
        params.timing.schedule.overlaySpanLoading.dynamicRows += rowCount;
        params.timing.schedule.overlaySpanLoading.rangeDynamicRows +=
          rows.length;
        params.timing.schedule.overlaySpanLoading.rangeWhitelistRows +=
          whitelistRows;
      }
    }
  } catch {
    dynamicCacheSet = false;
  } finally {
    if (params.timing) {
      const ms = elapsedMs(startedAt);
      params.timing.schedule.overlaySpanLoading.rangePreloadMs += ms;
      params.timing.schedule.overlaySpanLoading.totalMs += ms;
      params.timing.schedule.overlaySpanLoading.rangeCacheSetDays +=
        blockCacheSet || dynamicCacheSet ? days.length : 0;
      recordSchedulerPhase(
        params.timing,
        "scheduler.schedule.overlay_span_loading",
        ms
      );
    }
  }
}

async function loadDynamicOverlayWindowsForDate(
  supabase: Client,
  date: Date,
  timeZone: string,
  userId: string,
  now: Date,
  timing?: SchedulerTiming | null
): Promise<WindowLite[]> {
  const startedAt = schedulerNowMs();
  const tz = timeZone || "UTC";
  const dayStart = startOfDayInTimeZone(date, tz);
  const dayEnd = addDaysInTimeZone(dayStart, 1, tz);
  const isoStart = dayStart.toISOString();
  const isoEnd = dayEnd.toISOString();
  const nowMs = now.getTime();
  const isoNow = Number.isFinite(nowMs) ? now.toISOString() : new Date().toISOString();
  const contextJoin = "location_context:location_contexts(id, value, label)";

  const { data, error } = await supabase
    .from("overlay_windows" as any)
    .select<DynamicOverlayWindowRow>(
      `id,label,start_utc,end_utc,mode,block_type,energy,location_context_id,allow_all_instance_types,allow_all_skills,allow_all_monuments,${contextJoin}`
    )
    .eq("user_id", userId)
    .eq("mode", "DYNAMIC")
    .lt("start_utc", isoEnd)
    .gt("end_utc", isoStart)
    .gt("end_utc", isoNow);

  if (error) {
    logSchedulerDebug("[OVERLAY_WINDOWS] dynamic load failed", {
      userId,
      date: date.toISOString(),
      timeZone: tz,
      error,
    });
    return [];
  }

  const rows = (data ?? []).filter((row) => {
    const mode =
      typeof row.mode === "string" ? row.mode.toUpperCase().trim() : null;
    if (mode !== "DYNAMIC") return false;
    const start = safeDate(row.start_utc ?? null);
    const end = safeDate(row.end_utc ?? null);
    if (!start || !end) return false;
    const startMs = start.getTime();
    const endMs = end.getTime();
    return (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      startMs < dayEnd.getTime() &&
      endMs > dayStart.getTime() &&
      endMs > nowMs &&
      startMs < endMs
    );
  });

  const overlayIds = rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  type InstanceTypeWhitelistRow = {
    overlay_window_id: string | null;
    instance_type: string | null;
  };
  type SkillWhitelistRow = {
    overlay_window_id: string | null;
    skill_id: string | null;
  };
  type MonumentWhitelistRow = {
    overlay_window_id: string | null;
    monument_id: string | null;
  };

  const [instanceWhitelist, skillWhitelist, monumentWhitelist] =
    overlayIds.length > 0
      ? await Promise.all([
          supabase
            .from("overlay_window_allowed_instance_types" as any)
            .select("overlay_window_id,instance_type")
            .in("overlay_window_id", overlayIds),
          supabase
            .from("overlay_window_allowed_skills" as any)
            .select("overlay_window_id,skill_id")
            .in("overlay_window_id", overlayIds),
          supabase
            .from("overlay_window_allowed_monuments" as any)
            .select("overlay_window_id,monument_id")
            .in("overlay_window_id", overlayIds),
        ])
      : [
          { data: [] as InstanceTypeWhitelistRow[] | null, error: null },
          { data: [] as SkillWhitelistRow[] | null, error: null },
          { data: [] as MonumentWhitelistRow[] | null, error: null },
        ];

  if (instanceWhitelist.error) throw instanceWhitelist.error;
  if (skillWhitelist.error) throw skillWhitelist.error;
  if (monumentWhitelist.error) throw monumentWhitelist.error;

  const instanceAllowMap = new Map<string, Set<string>>();
  for (const row of (instanceWhitelist.data ?? []) as InstanceTypeWhitelistRow[]) {
    const key = row.overlay_window_id ?? "";
    if (!key || !row.instance_type) continue;
    const normalized = row.instance_type.toUpperCase().trim();
    if (!normalized) continue;
    const existing = instanceAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    instanceAllowMap.set(key, existing);
  }

  const skillAllowMap = new Map<string, Set<string>>();
  for (const row of (skillWhitelist.data ?? []) as SkillWhitelistRow[]) {
    const key = row.overlay_window_id ?? "";
    if (!key || !row.skill_id) continue;
    const normalized = row.skill_id.trim();
    if (!normalized) continue;
    const existing = skillAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    skillAllowMap.set(key, existing);
  }

  const monumentAllowMap = new Map<string, Set<string>>();
  for (const row of (monumentWhitelist.data ?? []) as MonumentWhitelistRow[]) {
    const key = row.overlay_window_id ?? "";
    if (!key || !row.monument_id) continue;
    const normalized = row.monument_id.trim();
    if (!normalized) continue;
    const existing = monumentAllowMap.get(key) ?? new Set<string>();
    existing.add(normalized);
    monumentAllowMap.set(key, existing);
  }

  const normalizeAllowAllFlag = (
    flag: boolean | null | undefined,
    whitelistSize: number
  ): boolean => flag === true || (flag == null && whitelistSize === 0);

  const localTimeLabel = (value: Date) => {
    const parts = getDateTimeParts(value, tz);
    return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  };

  const windows: WindowLite[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const start = safeDate(row.start_utc ?? null);
    const end = safeDate(row.end_utc ?? null);
    if (!start || !end) continue;
    const overlayId = row.id;
    const instanceWhitelist = instanceAllowMap.get(overlayId);
    const skillWhitelist = skillAllowMap.get(overlayId);
    const monumentWhitelist = monumentAllowMap.get(overlayId);
    const locationValue =
      row.location_context_id && row.location_context?.value
        ? String(row.location_context.value).toUpperCase().trim()
        : null;
    const locationLabel =
      row.location_context?.label ?? (locationValue ? locationValue : null);

    windows.push({
      id: `overlay:${overlayId}`,
      label: row.label ?? "Dynamic Overlay",
      energy:
        typeof row.energy === "string" && row.energy.trim().length > 0
          ? row.energy.trim().toUpperCase()
          : "",
      start_local: localTimeLabel(start),
      end_local: localTimeLabel(end),
      days: null,
      location_context_id: row.location_context_id ?? null,
      location_context_value: locationValue,
      location_context_name: locationLabel,
      window_kind: normalizeBlockType(row.block_type),
      dayTypeStartUtcMs: start.getTime(),
      dayTypeEndUtcMs: end.getTime(),
      isOverlayCandidate: true,
      overlayWindowId: overlayId,
      allowAllInstanceTypes: normalizeAllowAllFlag(
        row.allow_all_instance_types,
        instanceWhitelist?.size ?? 0
      ),
      allowAllHabitTypes: true,
      allowAllSkills: normalizeAllowAllFlag(
        row.allow_all_skills,
        skillWhitelist?.size ?? 0
      ),
      allowAllMonuments: normalizeAllowAllFlag(
        row.allow_all_monuments,
        monumentWhitelist?.size ?? 0
      ),
      allowedInstanceTypes: Array.from(instanceWhitelist ?? []),
      allowedSkillIds: Array.from(skillWhitelist ?? []),
      allowedMonumentIds: Array.from(monumentWhitelist ?? []),
    });
  }

  const sortedWindows = windows.sort((a, b) => {
    const startDiff =
      (a.dayTypeStartUtcMs ?? 0) - (b.dayTypeStartUtcMs ?? 0);
    if (startDiff !== 0) return startDiff;
    return a.id.localeCompare(b.id);
  });
  if (timing) {
    const ms = elapsedMs(startedAt);
    timing.schedule.overlaySpanLoading.dynamicCalls += 1;
    timing.schedule.overlaySpanLoading.dynamicMs += ms;
    timing.schedule.overlaySpanLoading.dynamicRows += sortedWindows.length;
    recordSchedulerPhase(
      timing,
      "scheduler.schedule.overlay_span_loading",
      ms
    );
  }
  return sortedWindows;
}

function applyOverlayBlocks(
  windows: CompatibleWindowRecord[],
  blockedRanges: OverlayWindowBlock[],
  durationMs: number
): CompatibleWindowRecord[] {
  if (blockedRanges.length === 0) return windows;
  const result: CompatibleWindowRecord[] = [];
  for (const win of windows) {
    result.push(...subtractBlockedRangesFromWindow(win, blockedRanges, durationMs));
  }
  return result;
}

function subtractBlockedRangesFromWindow(
  window: CompatibleWindowRecord,
  blockedRanges: OverlayWindowBlock[],
  durationMs: number
): CompatibleWindowRecord[] {
  const windowOverlayId =
    window.isOverlayCandidate === true ? (window.overlayWindowId ?? null) : null;
  let segments: Array<{ start: number; end: number }> = [
    {
      start: window.availableStartLocal.getTime(),
      end: window.endLocal.getTime(),
    },
  ];

  for (const block of blockedRanges) {
    if (windowOverlayId && block.id === windowOverlayId) continue;
    if (segments.length === 0) break;
    const nextSegments: Array<{ start: number; end: number }> = [];
    for (const segment of segments) {
      if (block.endMs <= segment.start || block.startMs >= segment.end) {
        nextSegments.push(segment);
        continue;
      }
      if (block.startMs > segment.start) {
        const clippedEnd = Math.min(block.startMs, segment.end);
        if (clippedEnd > segment.start) {
          nextSegments.push({ start: segment.start, end: clippedEnd });
        }
      }
      if (block.endMs < segment.end) {
        const clippedStart = Math.max(block.endMs, segment.start);
        if (segment.end > clippedStart) {
          nextSegments.push({ start: clippedStart, end: segment.end });
        }
      }
    }
    segments = nextSegments;
  }

  const trimmed: CompatibleWindowRecord[] = [];
  for (const segment of segments) {
    const lengthMs = segment.end - segment.start;
    if (lengthMs < durationMs) continue;
    trimmed.push({
      ...window,
      startLocal: new Date(segment.start),
      availableStartLocal: new Date(segment.start),
      endLocal: new Date(segment.end),
      gateTrace: {
        ...window.gateTrace,
        freeSegmentMinutes: Math.round(lengthMs / 60000),
      },
    });
}
  return trimmed;
}

async function reconcileExpiredOverlayWindows(
  supabase: Client,
  userId: string,
  now = new Date()
) {
  const isoNow = now.toISOString();
  const { data: windows, error: windowError } = await supabase
    .from("overlay_windows" as any)
    .select("id,mode")
    .eq("user_id", userId)
    .or("mode.is.null,mode.eq.MANUAL")
    .lte("end_utc", isoNow);

  if (windowError) {
    log("warn", "[OVERLAY] failed to fetch expired windows", {
      userId,
      error: windowError,
    });
    return;
  }

  const expiredWindowIds = (windows ?? [])
    .filter((row) => {
      const mode =
        typeof row?.mode === "string" ? row.mode.toUpperCase().trim() : null;
      return mode === null || mode === "" || mode === "MANUAL";
    })
    .map((row) => row?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (expiredWindowIds.length === 0) {
    return;
  }

  const { data: instances, error: instanceError } = await supabase
    .from("schedule_instances")
    .select("id,source_type,status")
    .eq("user_id", userId)
    .in("overlay_window_id", expiredWindowIds)
    .in("status", ["scheduled", "missed"]);

  if (instanceError) {
    log("warn", "[OVERLAY] failed to load overlay instances", {
      userId,
      error: instanceError,
      windowCount: expiredWindowIds.length,
    });
    return;
  }

  const projectIds = new Set<string>();
  const otherIds = new Set<string>();
  for (const instance of instances ?? []) {
    if (!instance?.id) continue;
    if (instance.status === "completed" || instance.status === "canceled") continue;
    if (instance.source_type === "PROJECT") {
      projectIds.add(instance.id);
    } else {
      otherIds.add(instance.id);
    }
  }

  const projectPayload = {
    status: "missed",
    start_utc: null,
    end_utc: null,
    window_id: null,
    day_type_time_block_id: null,
    time_block_id: null,
    locked: false,
    overlay_window_id: null,
  };

  for (const batch of chunkIds(Array.from(projectIds), 1000)) {
    const { error } = await supabase
      .from("schedule_instances")
      .update(projectPayload)
      .in("id", batch);
    if (error) {
      log("warn", "[OVERLAY] failed to release project instances", {
        userId,
        batchSize: batch.length,
        error,
      });
    }
  }

  const otherPayload = {
    status: "missed",
    locked: false,
    overlay_window_id: null,
  };

  for (const batch of chunkIds(Array.from(otherIds), 1000)) {
    const { error } = await supabase
      .from("schedule_instances")
      .update(otherPayload)
      .in("id", batch);
    if (error) {
      log("warn", "[OVERLAY] failed to release overlay instances", {
        userId,
        batchSize: batch.length,
        error,
      });
    }
  }

  logSchedulerDebug("[OVERLAY] reconciled expired windows", {
    userId,
    windowCount: expiredWindowIds.length,
    projectCount: projectIds.size,
    otherCount: otherIds.size,
  });
}

function determineConstraintFailureReason(
  item: ConstraintAwareItem,
  window: WindowLite
): PlacementReasonCode | null {
  if (window.allowAllInstanceTypes === false) {
    const instanceType = item.isProject
      ? "PROJECT"
      : typeof item.sourceType === "string" && item.sourceType.trim()
        ? item.sourceType.toUpperCase().trim()
        : typeof item.habitType === "string"
          ? item.habitType.toUpperCase().trim()
          : null;
    const allowed =
      window.allowedInstanceTypesSet ??
      normalizeSet(window.allowedInstanceTypes);
    if (!instanceType || !allowed || allowed.size === 0 || !allowed.has(instanceType)) {
      return "ITEM_TYPE_NOT_ALLOWED";
    }
  }

  if (window.allowAllHabitTypes === false) {
    const habitType =
      typeof item.habitType === "string"
        ? item.habitType.toUpperCase().trim()
        : null;
    if (habitType) {
      const allowed =
        window.allowedHabitTypesSet ?? normalizeSet(window.allowedHabitTypes);
      if (!allowed || allowed.size === 0 || !allowed.has(habitType)) {
        return "ITEM_TYPE_NOT_ALLOWED";
      }
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

function formatCacheMs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value).toString()
    : "null";
}

function buildHabitPlacementNoFitCacheKey(params: {
  habitId: string;
  habitType: string;
  dayKey: string;
  offset: number;
  timeZone: string;
  durationMinutes: number;
  energyResolved: string;
  practiceContextId: string | null;
  reuseInstanceId: string | null;
  window: WindowLite;
  windowKey: string;
  windowStartMs: number;
  windowEndMs: number;
  candidateStartMs: number;
  candidateEndMs: number;
  fromPrevDay: boolean;
  blockers: ScheduleInstance[];
}) {
  const blockerKey = params.blockers
    .filter((inst) => inst?.status === "scheduled")
    .map((inst) => {
      const startMs = new Date(inst.start_utc ?? "").getTime();
      const endMs = new Date(inst.end_utc ?? "").getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
      return [
        inst.id ?? "",
        inst.source_type ?? "",
        inst.source_id ?? "",
        formatCacheMs(startMs),
        formatCacheMs(endMs),
      ].join("@");
    })
    .filter((value): value is string => value !== null)
    .sort()
    .join(",");
  const windowMetadata = params.window as WindowCacheKeyMetadata;
  const dayTypeTimeBlockId =
    windowMetadata.dayTypeTimeBlockId ??
    windowMetadata.day_type_time_block_id ??
    null;
  const timeBlockId =
    windowMetadata.time_block_id ??
    windowMetadata.timeBlockId ??
    windowMetadata.id ??
    null;
  const overlayWindowId =
    windowMetadata.overlayWindowId ??
    windowMetadata.overlay_window_id ??
    null;

  return [
    params.habitId,
    params.habitType,
    params.dayKey,
    params.offset,
    params.timeZone,
    params.durationMinutes,
    params.energyResolved,
    params.practiceContextId ?? "",
    params.reuseInstanceId ?? "",
    params.window.id,
    params.windowKey,
    dayTypeTimeBlockId ?? "",
    timeBlockId ?? "",
    overlayWindowId ?? "",
    params.fromPrevDay ? "prev" : "same",
    formatCacheMs(params.windowStartMs),
    formatCacheMs(params.windowEndMs),
    formatCacheMs(params.candidateStartMs),
    formatCacheMs(params.candidateEndMs),
    blockerKey,
  ].join("|");
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
