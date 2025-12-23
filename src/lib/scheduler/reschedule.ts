import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "../../../types/supabase";
import {
  fetchBacklogNeedingSchedule,
  cleanupTransientInstances,
  fetchInstancesForRange,
  type ScheduleInstance,
} from "./instanceRepo";
import { buildProjectItems, DEFAULT_PROJECT_DURATION_MIN } from "./projects";
import {
  fetchReadyTasks,
  fetchWindowsForDate,
  fetchWindowsSnapshot,
  fetchProjectsMap,
  fetchProjectSkillsForProjects,
  fetchGoalsForUser,
  windowsForDateFromSnapshot,
  type WindowLite,
  type WindowKind,
} from "./repo";
import { placeItemInWindows } from "./placement";
import { ENERGY } from "./config";
import {
  fetchHabitsForSchedule,
  DEFAULT_HABIT_DURATION_MIN,
  type HabitScheduleItem,
} from "./habits";
import {
  evaluateHabitDueOnDate,
  type HabitDueEvaluation,
} from "./habitRecurrence";
import {
  addDaysInTimeZone,
  differenceInCalendarDaysInTimeZone,
  getDateTimeParts,
  makeZonedDate,
  normalizeTimeZone,
  setTimeInTimeZone,
  startOfDayInTimeZone,
} from "./timezone";
import { safeDate } from "./safeDate";
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

type Client = SupabaseClient<Database>;

const START_GRACE_MIN = 1;
const BASE_LOOKAHEAD_DAYS = 28;
const LOOKAHEAD_PER_ITEM_DAYS = 7;
const MAX_LOOKAHEAD_DAYS = 365;
const HABIT_WRITE_LOOKAHEAD_DAYS = BASE_LOOKAHEAD_DAYS;
const LOCATION_CLEANUP_DAYS = 7;
const COMPLETED_RETENTION_DAYS = 3;
const PRACTICE_LOOKAHEAD_DAYS = 7;

const HABIT_TYPE_PRIORITY: Record<string, number> = {
  CHORE: 0,
  HABIT: 1,
  RELAXER: 1,
  PRACTICE: -1,
  TEMP: 1,
  MEMO: 2,
  SYNC: 3,
};

function habitTypePriority(value?: string | null) {
  const normalized = (value ?? "HABIT").toUpperCase();
  if (normalized === "ASYNC") return HABIT_TYPE_PRIORITY.SYNC;
  return HABIT_TYPE_PRIORITY[normalized] ?? Number.MAX_SAFE_INTEGER;
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
};

type WindowAvailabilityBounds = {
  front: Date;
  back: Date;
};

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
    if (instEndMs <= startMs || instStartMs >= endMs) continue;
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
) => a.isSyncHabit && b.isSyncHabit;

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

const collectFinalInvariantCancels = (instances: FinalInvariantInstance[]) => {
  const canceled = new Set<string>();
  const active: FinalInvariantInstance[] = [];

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
      if (current.endMs <= other.startMs || current.startMs >= other.endMs) {
        continue;
      }
      if (isFinalInvariantOverlapAllowed(current, other)) continue;
      const loser = pickFinalInvariantLoser(current, other);
      const loserId = loser.instance.id ?? "";
      if (!loserId) continue;
      canceled.add(loserId);
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

  return canceled;
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
    if (startMs >= rangeEndMs || endMs <= rangeStartMs) continue;
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
      if (current.endMs <= other.startMs || current.startMs >= other.endMs) {
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
        current.endMs <= other.startMs ||
        current.startMs >= other.endMs ||
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
  result: ScheduleBacklogResult
) {
  if (ids.length === 0) return;
  const updatePayload: Database["public"]["Tables"]["schedule_instances"]["Update"] =
    {
      status: "missed",
    };
  if (
    ids.length > 0 &&
    (process.env.NODE_ENV !== "production" ||
      process.env.SCHEDULER_DEBUG === "true")
  ) {
    console.info(
      "[OVERLAP] invalidating instances without missed_reason column",
      { count: ids.length }
    );
  }
  const batches = chunkIds(ids, 1000);
  for (const batch of batches) {
    if (process.env.NODE_ENV === "test") {
      for (const id of batch) {
        const { error } = await supabase
          .from("schedule_instances")
          .update(updatePayload)
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
        .update(updatePayload)
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
  if (!habit) return false;
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
  return raw === "ASYNC" ? "SYNC" : raw;
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

export async function scheduleBacklog(
  userId: string,
  baseDate = new Date(),
  client?: Client,
  options?: {
    timeZone?: string | null;
    location?: GeoCoordinates | null;
    mode?: SchedulerModePayload | null;
    writeThroughDays?: number | null;
    utcOffsetMinutes?: number | null;
  }
): Promise<ScheduleBacklogResult> {
  const supabase = await ensureClient(client);
  const result: ScheduleBacklogResult = {
    placed: [],
    failures: [],
    timeline: [],
    debug: [],
    hasPastInstanceSkipped: false,
  };
  const timeZone = normalizeTimeZone(options?.timeZone);
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
  const projectsMap = await fetchProjectsMap(supabase);
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
      console.error("Failed to load practice context history", error);
      practiceHistory = new Map();
    }
  }
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
    const normalized = startOfDayInTimeZone(start, timeZone);
    const previous = habitLastScheduledStart.get(habitId);
    if (!previous || normalized.getTime() > previous.getTime()) {
      habitLastScheduledStart.set(habitId, normalized);
    }
  };
  const getHabitLastScheduledStart = (habitId: string) =>
    habitLastScheduledStart.get(habitId) ?? null;
  let windowSnapshot: WindowLite[] | null = null;
  try {
    windowSnapshot = await fetchWindowsSnapshot(userId, supabase);
  } catch (_error) {
    windowSnapshot = null;
  }
  const goalWeightsById = goals.reduce<Record<string, number>>((acc, goal) => {
    acc[goal.id] = goal.weight ?? 0;
    return acc;
  }, {});
  const projectItems = buildProjectItems(
    Object.values(projectsMap),
    tasks,
    goalWeightsById
  );

  const projectItemMap: Record<string, any> = {};
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
      console.error(
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
  const completedRetentionStart = startOfDayInTimeZone(
    addDaysInTimeZone(baseDate, -COMPLETED_RETENTION_DAYS, timeZone),
    timeZone
  );
  const completedRetentionStartMs = completedRetentionStart.getTime();
  const nowMs = baseDate.getTime();
  const dayOffsetFor = (startUTC: string): number | undefined => {
    const start = new Date(startUTC);
    if (Number.isNaN(start.getTime())) return undefined;
    const diff = differenceInCalendarDaysInTimeZone(baseStart, start, timeZone);
    return Number.isFinite(diff) ? diff : undefined;
  };

  const seenMissedProjects = new Set<string>();

  for (const m of missed.data ?? []) {
    if (m.source_type !== "PROJECT") continue;
    if (seenMissedProjects.has(m.source_id)) {
      const dedupe = await supabase
        .from("schedule_instances")
        .update({ status: "canceled" })
        .eq("id", m.id)
        .select("id, source_id")
        .single();
      if (dedupe.error) {
        result.failures.push({
          itemId: m.source_id,
          reason: "error",
          detail: dedupe.error,
        });
      }
      continue;
    }
    seenMissedProjects.add(m.source_id);
    const def = projectItemMap[m.source_id];
    if (!def) continue;
    if (!matchesMode(def.id)) {
      noteModeFiltered(def.id);
      continue;
    }

    let duration = Number(def.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      const fallback = Number(m.duration_min ?? 0);
      if (Number.isFinite(fallback) && fallback > 0) {
        duration = fallback;
      } else {
        duration = DEFAULT_PROJECT_DURATION_MIN;
      }
    }
    duration = adjustDuration(duration);

    const resolvedEnergy =
      "energy" in def && def.energy ? String(def.energy) : m.energy_resolved;
    const weight =
      typeof m.weight_snapshot === "number"
        ? m.weight_snapshot
        : (def as { weight?: number }).weight ?? 0;

    queue.push({
      id: def.id,
      sourceType: "PROJECT",
      duration_min: duration,
      energy: (resolvedEnergy ?? "NO").toUpperCase(),
      weight,
      goalWeight: def.goalWeight ?? 0,
      globalRank:
        typeof def.globalRank === "number" && Number.isFinite(def.globalRank)
          ? def.globalRank
          : null,
      instanceId: m.id,
      eventName: def.name || def.id,
    });
  }

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
      globalRank?: number | null;
      name?: string;
    } | null
  ) => {
    if (!def) return;
    if (!matchesMode(def.id)) {
      noteModeFiltered(def.id);
      return;
    }
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

  for (const project of projectItems) {
    enqueue(project);
  }

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
  const habitWriteLookaheadDays = Math.min(
    lookaheadDays,
    HABIT_WRITE_LOOKAHEAD_DAYS
  );
  const dedupeWindowDays = Math.max(lookaheadDays, 28);
  const rangeEnd = addDaysInTimeZone(baseStart, dedupeWindowDays, timeZone);
  const writeThroughEnd =
    persistedDayLimit > 0
      ? addDaysInTimeZone(baseStart, persistedDayLimit, timeZone)
      : baseStart;
  const dedupe = await dedupeScheduledProjects(
    supabase,
    userId,
    baseStart,
    rangeEnd,
    finalQueueProjectIds,
    writeThroughEnd
  );
  if (dedupe.error) {
    result.error = dedupe.error;
    return result;
  }
  if (dedupe.failures.length > 0) {
    result.failures.push(...dedupe.failures);
  }
  const lockedProjectInstances = dedupe.lockedProjectInstances;
  if (lockedProjectInstances.size > 0) {
    for (const projectId of lockedProjectInstances.keys()) {
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
  for (const id of invalidatedInstanceIds) {
    const entry = timelineById.get(id);
    if (!entry) continue;
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
  if (overlapHabitInstanceIds.length > 0) {
    await invalidateInstancesAsMissed(
      supabase,
      overlapHabitInstanceIds,
      result
    );
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
  const keptInstancesByProject = new Map<string, ScheduleInstance>();
  const habitScheduledDatesById = new Map<string, Date[]>();
  for (const instance of dedupe.allInstances) {
    if (!instance || instance.source_type !== "HABIT") continue;
    if (invalidatedInstanceIds.has(instance.id)) continue;
    if (!instance.source_id) continue;
    if (!instance.start_utc) continue;
    const start = new Date(instance.start_utc);
    if (Number.isNaN(start.getTime())) continue;
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
    return aEnd > bStart && aStart < bEnd;
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
    let duration = Number(inst.duration_min ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = Number(def.duration_min ?? 0);
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = DEFAULT_PROJECT_DURATION_MIN;
    }
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
    const habitType = sourceId ? habitTypeById.get(sourceId) ?? null : null;
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
    if (
      details &&
      (process.env.NODE_ENV !== "production" ||
        process.env.SCHEDULER_DEBUG === "true")
    ) {
      console.info("[SCHEDULER] cancel schedule instance", {
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
        queue.splice(index, 1);
      }
    }
  }

  for (const inst of keptInstances) {
    const projectId = inst.source_id ?? "";
    if (!projectId) continue;
    keptInstancesByProject.set(projectId, inst);
    if (inst.locked !== true) {
      registerReuseInstance(projectId, inst.id);
    }
  }

  for (const item of queue) {
    if (item.instanceId) continue;
    const reuseId = reuseInstanceByProject.get(item.id);
    if (!reuseId) continue;
    item.instanceId = reuseId;
    reuseInstanceByProject.delete(item.id);
  }

  queue.sort((a, b) => {
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    return a.id.localeCompare(b.id);
  });

  const windowAvailabilityByDay = new Map<
    number,
    Map<string, WindowAvailabilityBounds>
  >();
  const windowCache = new Map<string, WindowLite[]>();
  const pendingWindowLoads = new Map<string, Promise<void>>();
  const activeTimeZone = timeZone ?? "UTC";
  const prepareWindowsForDay = async (day: Date) => {
    const cacheKey = dateCacheKey(day);
    if (windowCache.has(cacheKey)) return;
    if (windowSnapshot !== null) {
      windowCache.set(
        cacheKey,
        windowsForDateFromSnapshot(windowSnapshot, day, activeTimeZone)
      );
      return;
    }

    let pending = pendingWindowLoads.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const windowDay = setTimeInTimeZone(day, activeTimeZone, 0, 0);
        const windows = await fetchWindowsForDate(
          windowDay,
          supabase,
          activeTimeZone,
          {
            userId,
          }
        );
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
    if (windowSnapshot !== null) {
      const windows = windowsForDateFromSnapshot(
        windowSnapshot,
        day,
        activeTimeZone
      );
      windowCache.set(cacheKey, windows);
      return windows;
    }
    return [];
  };
  const habitPlacementsByOffset = new Map<number, HabitScheduleDayResult>();

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
      habits,
      day,
      offset,
      timeZone,
      availability,
      baseDate,
      windowCache,
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
      habitMap: habitById,
      taskContextById,
      contextTaskCounts,
      practiceHistory,
      getProjectGoalMonumentId,
      reservedPlacements,
      audit: habitAudit,
    });

    if (dayResult.placements.length > 0) {
      result.timeline.push(...dayResult.placements);
    }
    if (dayResult.instances.length > 0) {
      result.placed.push(...dayResult.instances);
    }
    if (dayResult.failures.length > 0) {
      result.failures.push(...dayResult.failures);
    }

    habitPlacementsByOffset.set(offset, dayResult);
    return dayResult;
  };

  const scheduledProjectIds = new Set<string>();
  const maxOffset = restrictProjectsToToday
    ? Math.min(Math.max(persistedDayLimit, 1), 1)
    : persistedDayLimit;
  const cleanupOffsetLimit = Math.max(
    maxOffset,
    Math.min(persistedDayLimit, LOCATION_CLEANUP_DAYS)
  );

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
    const allowSchedulingToday = offset < maxOffset;
    const shouldScheduleHabits =
      allowSchedulingToday &&
      offset < habitWriteLookaheadDays &&
      offset < persistedDayLimit;
    if (offset === 0 && habitAudit.enabled) {
      const dayStart = startOfDayInTimeZone(day, timeZone);
      habitAudit.report.inputs = {
        offset,
        dayStart: dayStart.toISOString(),
        timezone: timeZone,
        shouldScheduleHabits: {
          maxOffset,
          persistedDayLimit,
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
        habits,
        day,
        offset,
        timeZone,
        availability: windowAvailability,
        baseDate,
        windowCache,
        client: supabase,
        sunlightLocation: location,
        timeZoneOffsetMinutes,
        durationMultiplier,
        restMode: isRestMode,
        existingInstances: dayInstances,
        getWindowsForDay,
        getLastScheduledHabitStart: getHabitLastScheduledStart,
        audit: habitAudit,
      });
    }
    const dayWindows = getWindowsForDay(day);
    if (allowSchedulingToday) {
      for (const item of queue) {
        if (scheduledProjectIds.has(item.id)) continue;

        const windows = await fetchCompatibleWindowsForItem(
          supabase,
          day,
          item,
          timeZone,
          {
            availability: windowAvailability,
            now: offset === 0 ? baseDate : undefined,
            cache: windowCache,
            restMode: isRestMode,
            userId,
            preloadedWindows: dayWindows,
            allowedWindowKinds: ["DEFAULT"],
          }
        );
        if (windows.length === 0) continue;

        const reservationsForItem: Array<{
          key: string;
          previous: WindowAvailabilityBounds | null;
        }> = [];
        const releaseReservationsForItem = () => {
          if (reservationsForItem.length === 0) return;
          for (const reservation of reservationsForItem) {
            if (reservation.previous) {
              windowAvailability.set(reservation.key, {
                front: new Date(reservation.previous.front.getTime()),
                back: new Date(reservation.previous.back.getTime()),
              });
            } else {
              windowAvailability.delete(reservation.key);
            }
          }
          reservationsForItem.length = 0;
        };
        const notBeforeMs =
          offset === 0 ? baseDate.getTime() : Number.NEGATIVE_INFINITY;
        for (const win of windows) {
          if (!win.key) continue;
          const candidateStart =
            win.availableStartLocal ?? win.startLocal ?? null;
          if (!candidateStart) continue;
          const candidateStartMs = Math.max(
            candidateStart.getTime(),
            notBeforeMs
          );
          const previousBounds = windowAvailability.get(win.key);
          reservationsForItem.push({
            key: win.key,
            previous: previousBounds
              ? {
                  front: new Date(previousBounds.front.getTime()),
                  back: new Date(previousBounds.back.getTime()),
                }
              : null,
          });
          windowAvailability.set(win.key, {
            front: new Date(candidateStartMs),
            back: new Date(candidateStartMs),
          });
        }

        const placed = await placeItemInWindows({
          userId,
          item,
          windows,
          date: day,
          timeZone,
          client: supabase,
          reuseInstanceId: item.instanceId,
          ignoreProjectIds: new Set([item.id]),
          notBefore: offset === 0 ? baseDate : undefined,
          existingInstances: dayInstances.length > 0 ? dayInstances : undefined,
          habitTypeById,
        });

        if (!("status" in placed)) {
          releaseReservationsForItem();
          if (placed.error !== "NO_FIT") {
            result.failures.push({
              itemId: item.id,
              reason: "error",
              detail: placed.error,
            });
          }
          continue;
        }

        if (placed.error) {
          releaseReservationsForItem();
          result.failures.push({
            itemId: item.id,
            reason: "error",
            detail: placed.error,
          });
          continue;
        }

        releaseReservationsForItem();

        if (placed.data) {
          result.placed.push(placed.data);
          const placementWindow = findPlacementWindow(windows, placed.data);
          if (placementWindow?.key) {
            const placementEnd = new Date(placed.data.end_utc);
            const existingBounds = windowAvailability.get(placementWindow.key);
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
            instance: placed.data,
            projectId: placed.data.source_id ?? item.id,
            decision,
            scheduledDayOffset: dayOffsetFor(placed.data.start_utc) ?? offset,
            availableStartLocal: placementWindow?.availableStartLocal
              ? placementWindow.availableStartLocal.toISOString()
              : undefined,
            windowStartLocal: placementWindow?.startLocal
              ? placementWindow.startLocal.toISOString()
              : undefined,
            locked: placed.data.locked ?? undefined,
          });
          scheduledProjectIds.add(item.id);

          if (item.instanceId) {
            removeInstanceFromBuckets(item.instanceId);
          }
          upsertInstance(dayInstances, placed.data);
          registerInstanceForOffsets(placed.data);
        }
      }

      const conflictProjects = collectProjectOverlapConflicts(
        dayInstances,
        habitAllowsOverlap
      );
      for (const conflict of conflictProjects) {
        await cancelScheduleInstance(conflict.id, {
          reason: "ILLEGAL_OVERLAP",
          fault: "SYSTEM",
        });
        if (conflict.source_type === "PROJECT" && conflict.source_id) {
          keptInstancesByProject.delete(conflict.source_id);
        }
        removeInstanceFromBuckets(conflict.id);
      }
    }

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
          habits,
          day,
          offset,
          timeZone,
          availability: windowAvailability,
          baseDate,
          windowCache,
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
          habitMap: habitById,
          taskContextById,
          contextTaskCounts,
          practiceHistory,
          getProjectGoalMonumentId,
          allowScheduling: false,
          audit: habitAudit,
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

  if (persistedDayLimit >= lookaheadDays) {
    for (const item of queue) {
      if (!scheduledProjectIds.has(item.id)) {
        result.failures.push({ itemId: item.id, reason: "NO_WINDOW" });
      }
    }
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

  const finalRangeResponse = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase
  );
  if (finalRangeResponse.error) {
    throw finalRangeResponse.error;
  }
  const finalInstances = (finalRangeResponse.data ?? []) as ScheduleInstance[];
  const finalInvariantInstances = buildFinalInvariantInstances(
    finalInstances,
    habitTypeById
  );
  const cancelIdSet = collectFinalInvariantCancels(finalInvariantInstances);
  if (cancelIdSet.size > 0) {
    await cancelInstancesAsIllegalOverlap(supabase, Array.from(cancelIdSet));
  }
  const remainingInstances = finalInvariantInstances.filter((entry) => {
    const id = entry.instance.id ?? "";
    return id.length > 0 && !cancelIdSet.has(id);
  });
  const remainingCancels = collectFinalInvariantCancels(remainingInstances);
  if (remainingCancels.size > 0) {
    throw new Error("SCHEDULER_INVARIANT_VIOLATION");
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

  if (
    process.env.NODE_ENV !== "production" ||
    process.env.SCHEDULER_DEBUG === "true"
  ) {
    const habitTimeline = result.timeline.filter(
      (entry) => entry.type === "HABIT"
    );
    if (result.failures.length > 0 || habitTimeline.length > 0) {
      console.info("scheduleBacklog result:", {
        failures: result.failures,
        habitTimeline,
      });
    }
  }

  if (habitAudit.enabled && habitAudit.report.inputs.offset === 0) {
    console.log("HABIT_AUDIT_TODAY", JSON.stringify(habitAudit.report));
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
  lockedProjectInstances: Map<string, ScheduleInstance>;
};

async function dedupeScheduledProjects(
  supabase: Client,
  userId: string,
  baseStart: Date,
  rangeEnd: Date,
  projectsToReset: Set<string>,
  writeThroughEnd: Date
): Promise<DedupeResult> {
  const response = await fetchInstancesForRange(
    userId,
    baseStart.toISOString(),
    rangeEnd.toISOString(),
    supabase
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
      lockedProjectInstances: new Map(),
    };
  }

  const allInstances = ((response.data ?? []) as ScheduleInstance[]).filter(
    (inst): inst is ScheduleInstance => Boolean(inst)
  );

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

    if (projectsToReset.has(projectId)) {
      if (isLockedProject) {
        lockedProjectInstances.set(projectId, inst);
        keepers.set(projectId, inst);
        continue;
      }
      const existing = reusableCandidates.get(projectId);
      if (!existing) {
        reusableCandidates.set(projectId, inst);
        continue;
      }

      const existingStart = new Date(existing.start_utc).getTime();
      const instStart = new Date(inst.start_utc).getTime();

      if (instStart < existingStart) {
        extras.push(existing);
        reusableCandidates.set(projectId, inst);
      } else {
        extras.push(inst);
      }
      continue;
    }

    if (withinWriteThrough && !isLockedProject) {
      extras.push(inst);
      continue;
    }

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
        continue;
      }
      lockedProjectInstances.set(projectId, inst);
    }

    const existing = keepers.get(projectId);
    if (!existing) {
      keepers.set(projectId, inst);
      continue;
    }

    const existingStart = new Date(existing.start_utc).getTime();
    const instStart = new Date(inst.start_utc).getTime();

    if (instStart < existingStart) {
      extras.push(existing);
      keepers.set(projectId, inst);
    } else {
      extras.push(inst);
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
  client: Client;
  sunlightLocation?: GeoCoordinates | null;
  timeZoneOffsetMinutes?: number | null;
  durationMultiplier?: number;
  restMode?: boolean;
  existingInstances: ScheduleInstance[];
  getWindowsForDay: (day: Date) => WindowLite[];
  getLastScheduledHabitStart: (habitId: string) => Date | null;
  audit?: HabitAuditTracker;
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
    client,
    sunlightLocation,
    timeZoneOffsetMinutes = null,
    durationMultiplier = 1,
    restMode = false,
    existingInstances,
    getWindowsForDay,
    getLastScheduledHabitStart,
    audit,
  } = params;

  const reservations = new Map<string, HabitReservation>();
  if (!habits.length) return reservations;

  const parseNextDueOverride = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

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
        ? windowsById.get(instance.window_id) ?? null
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
      const key = windowKey(win.id, startLocal);
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

  const windowEntriesById = new Map<string, typeof windowEntries>();
  for (const entry of windowEntries) {
    const existing = windowEntriesById.get(entry.window.id);
    if (existing) {
      existing.push(entry);
    } else {
      windowEntriesById.set(entry.window.id, [entry]);
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
      const habitType = habitId ? habitTypeById.get(habitId) ?? null : null;
      const isSyncInstance = habitType === "SYNC";
      const candidateEntries =
        (instance.window_id
          ? windowEntriesById.get(instance.window_id)
          : null) ?? windowEntries;
      for (const entry of candidateEntries) {
        if (instance.window_id && entry.window.id !== instance.window_id)
          continue;
        if (endMs <= entry.startMs || startMs >= entry.endMs) continue;
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
      const windowsForAttempt = await fetchCompatibleWindowsForItem(
        client,
        day,
        { energy: resolvedEnergy, duration_min: durationMin },
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
      const dueStartMs = dueStart ? dueStart.getTime() : null;
      if (typeof dueStartMs === "number" && Number.isFinite(dueStartMs)) {
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
  habitMap: Map<string, HabitScheduleItem>;
  taskContextById: Map<string, string | null>;
  contextTaskCounts: Map<string, number>;
  practiceHistory: Map<string, Date>;
  getProjectGoalMonumentId: (projectId: string) => string | null;
  allowScheduling?: boolean;
  reservedPlacements?: Map<string, HabitReservation>;
  audit?: HabitAuditTracker;
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
    habitMap,
    taskContextById,
    contextTaskCounts,
    practiceHistory,
    getProjectGoalMonumentId,
    allowScheduling = true,
    reservedPlacements,
    audit,
  } = params;

  const result: HabitScheduleDayResult = {
    placements: [],
    instances: [],
    failures: [],
  };
  const placedSoFar: ScheduleInstance[] = [];
  const overridesToClear = new Set<string>();
  const parseNextDueOverride = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };
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
      console.error("Failed to clear habit due overrides", error);
    } finally {
      overridesToClear.clear();
    }
  };
  if (!habits.length) {
    await clearHabitOverrides();
    return result;
  }

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
      return true;
    } catch (error) {
      console.error(
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
  const missScheduledInstance = async (instance: ScheduleInstance) => {
    if (!instance?.id) return false;
    try {
      const miss = await client
        .from("schedule_instances")
        .update({ status: "missed" })
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
      return true;
    } catch (error) {
      console.error(
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
    if (repeatablePracticeIds.has(habitId)) {
      if (bucket.length > 0) {
        existingByHabitId.set(habitId, bucket[0]);
      }
      for (const instance of bucket) {
        carryoverInstances.push(instance);
      }
      continue;
    }
    const keeper = bucket.shift();
    if (keeper) {
      existingByHabitId.set(habitId, keeper);
      carryoverInstances.push(keeper);
    }
    for (const duplicate of bucket) {
      duplicatesToCancel.push(duplicate);
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
  const locationMismatchInstances: ScheduleInstance[] = [];
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
      ? windowsById.get(instance.window_id) ?? null
      : null;
    const hasLocationMatch = doesWindowMatchHabitLocation(habit, windowRecord);
    if (!hasLocationMatch) {
      if (!seenInvalidIds.has(instance.id ?? `${habitId}:location`)) {
        locationMismatchInstances.push(instance);
        seenInvalidIds.add(instance.id ?? `${habitId}:location`);
      }
      dayInstances.splice(index, 1);
      if (existingByHabitId.get(habitId)?.id === instance.id) {
        existingByHabitId.delete(habitId);
      }
      continue;
    }
    const hasWindowTypeMatch = doesWindowAllowHabitType(habit, windowRecord);
    if (!hasWindowTypeMatch) {
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
    const dueInfo = evaluateHabitDueOnDate({
      habit,
      date: instanceDayStart,
      timeZone: zone,
      windowDays,
      lastScheduledStart: getLastScheduledHabitStart(habitId),
      nextDueOverride,
    });
    if (!dueInfo.isDue) {
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
    duplicatesToCancel.push(...invalidHabitInstances);
  }
  if (typeMismatchInstances.length > 0) {
    duplicatesToCancel.push(...typeMismatchInstances);
  }

  if (duplicatesToCancel.length > 0) {
    for (const duplicate of duplicatesToCancel) {
      if (!duplicate?.id) continue;
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

  if (locationMismatchInstances.length > 0) {
    for (const mismatch of locationMismatchInstances) {
      if (!mismatch?.id) continue;
      const marked = await missScheduledInstance(mismatch);
      if (marked) {
        mismatch.status = "missed";
      }
    }
  }

  if (!allowScheduling) {
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
      }
    }
    return result;
  }

  for (const inst of dayInstances) {
    if (!inst || inst.status !== "scheduled") continue;
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
        console.log("practice offset check", { offset });
      }
    }
    if (normalizedType === "PRACTICE" && offset >= PRACTICE_LOOKAHEAD_DAYS) {
      if (process.env.NODE_ENV === "test" && habit.id === "habit-practice") {
        console.log("skip practice due to offset", offset);
      }
      continue;
    }
    const windowDays = habit.window?.days ?? null;
    const nextDueOverride = parseNextDueOverride(habit.nextDueOverride);
    const overrideDayStart = nextDueOverride
      ? startOfDayInTimeZone(nextDueOverride, zone)
      : null;
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
    if (
      normalizedType === "PRACTICE" &&
      process.env.NODE_ENV === "test" &&
      habit.id === "habit-practice"
    ) {
      console.log("practice due info", { offset, isDue: dueInfo.isDue });
    }
    if (!dueInfo.isDue) continue;
    if (overrideDayStart && dayStart.getTime() >= overrideDayStart.getTime()) {
      overridesToClear.add(habit.id);
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
      const key = windowKey(win.id, startLocal);
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

  const windowEntriesById = new Map<string, typeof windowEntries>();
  for (const entry of windowEntries) {
    addAnchorStart(anchorStartsByWindowKey, entry.key, entry.startMs);
    const existing = windowEntriesById.get(entry.window.id);
    if (existing) {
      existing.push(entry);
    } else {
      windowEntriesById.set(entry.window.id, [entry]);
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
      const habitType = habitId ? habitTypeById.get(habitId) ?? null : null;
      const isSyncInstance = habitType === "SYNC";
      const candidateEntries =
        (instance.window_id
          ? windowEntriesById.get(instance.window_id)
          : null) ?? windowEntries;
      for (const entry of candidateEntries) {
        if (instance.window_id && entry.window.id !== instance.window_id)
          continue;
        if (endMs <= entry.startMs || startMs >= entry.endMs) continue;
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
  const habitQueue = [...sortedHabits];
  while (habitQueue.length > 0) {
    const habit = habitQueue.shift();
    if (!habit) continue;
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
      ? windowsById.get(existingInstance.window_id) ?? null
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
      if (await missScheduledInstance(existingInstance)) {
        existingByHabitId.delete(habit.id);
        existingInstance = null;
      }
    } else if (hasWindowTypeMismatch) {
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
        const windowsForAttempt = await fetchCompatibleWindowsForItem(
          client,
          day,
          { energy: resolvedEnergy, duration_min: durationMin },
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
      if (typeof dueStartMs === "number" && Number.isFinite(dueStartMs)) {
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
          ? windowsById.get(existingInstance.window_id) ?? null
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
                ? practiceContextId ?? null
                : undefined,
          },
          windows: [
            {
              id: window.id,
              startLocal: target.startLocal,
              endLocal: target.endLocal,
              availableStartLocal: new Date(startCandidate),
              key: target.key,
              fromPrevDay: window.fromPrevDay ?? false,
            },
          ],
          date: day,
          timeZone: zone,
          client,
          reuseInstanceId: existingInstance?.id,
          existingInstances: placedSoFar,
          allowHabitOverlap: allowsHabitOverlap,
          habitTypeById,
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
          result.failures.push({
            itemId: habit.id,
            reason: "error",
            detail:
              placement.error ?? new Error("Failed to persist habit instance"),
          });
          continue;
        }

        persisted = placement.data;
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
      if (!usedReservation && !allowsHabitOverlap) {
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
            normalizedType === "PRACTICE" ? practiceContextId ?? null : null,
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
    if (!placedInWindow) {
      continue;
    }

    if (isRepeatablePractice) {
      habitQueue.push(habit);
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
    ? previousSunlight.sunset ?? previousSunlight.dusk
    : todaySunlight.sunset ?? todaySunlight.dusk;
  const endReference = win.fromPrevDay
    ? todaySunlight.dawn ?? todaySunlight.sunrise
    : nextSunlight.dawn ?? nextSunlight.sunrise;
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
    ? daylight.previousSunset ?? daylight.previousDusk
    : daylight.sunset ?? daylight.dusk;
  const endReference = win.fromPrevDay
    ? daylight.sunrise ?? daylight.dawn
    : daylight.nextDawn ?? daylight.nextSunrise;
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

async function fetchCompatibleWindowsForItem(
  supabase: Client,
  date: Date,
  item: { energy: string; duration_min: number },
  timeZone: string,
  options?: {
    now?: Date;
    availability?: Map<string, WindowAvailabilityBounds>;
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
    auditZeroStageCallback?: (stage: string | null) => void;
  }
) {
  const cacheKey = dateCacheKey(date);
  const cache = options?.cache;
  let windows: WindowLite[];
  const userId = options?.userId ?? null;
  if (options?.preloadedWindows) {
    windows = options.preloadedWindows;
    cache?.set(cacheKey, windows);
  } else if (cache?.has(cacheKey)) {
    windows = cache.get(cacheKey) ?? [];
  } else {
    windows = await fetchWindowsForDate(date, supabase, timeZone, { userId });
    cache?.set(cacheKey, windows);
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
  }>;

  const restMode = options?.restMode ?? false;

  for (const win of windows) {
    const windowKind: WindowKind = win.window_kind ?? "DEFAULT";
    if (allowedWindowKindSet && !allowedWindowKindSet.has(windowKind)) {
      continue;
    }
    if (stagePassCounts) stagePassCounts["allowedWindowKinds"] += 1;
    let energyRaw = win.energy ? String(win.energy).toUpperCase().trim() : "";
    if (restMode) {
      energyRaw = energyRaw === "NO" ? "NO" : "LOW";
    }
    const hasEnergyLabel = energyRaw.length > 0;
    const energyLabel = hasEnergyLabel ? energyRaw : null;
    const energyIdx = hasEnergyLabel
      ? energyIndex(energyLabel, { fallback: ENERGY.LIST.length })
      : ENERGY.LIST.length;
    if (hasEnergyLabel && energyIdx >= ENERGY.LIST.length) continue;
    const requireExactEnergy = options?.matchEnergyLevel ?? false;
    if (requireExactEnergy) {
      if (!hasEnergyLabel) continue;
      if (energyIdx !== itemIdx) continue;
    } else if (energyIdx < itemIdx) {
      continue;
    }
    if (stagePassCounts) stagePassCounts["energy match"] += 1;

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
    const attemptHasLocation = Boolean(
      desiredLocationId || desiredLocationValue
    );

    if (options?.requireLocationContextMatch) {
      if (!attemptHasLocation && windowHasLocation) {
        continue;
      }
    }

    if (desiredLocationId || windowLocationId) {
      if (!desiredLocationId || !windowLocationId) continue;
      if (windowLocationId !== desiredLocationId) continue;
    } else if (desiredLocationValue) {
      if (!windowLocationValue) continue;
      if (windowLocationValue !== desiredLocationValue) continue;
    }
    if (stagePassCounts) stagePassCounts["location match"] += 1;

    const startLocal = resolveWindowStart(win, date, timeZone);
    const endLocal = resolveWindowEnd(win, date, timeZone);
    const key = windowKey(win.id, startLocal);
    const startMs = startLocal.getTime();
    const endMs = endLocal.getTime();

    if (typeof nowMs === "number" && endMs <= nowMs) continue;
    if (stagePassCounts) stagePassCounts["nowMs trim"] += 1;

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
          ? addDaysInTimeZone(date, -1, timeZone)
          : date;
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
    if (stagePassCounts) stagePassCounts["daylight/night constraints"] += 1;

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
    if (stagePassCounts) stagePassCounts["availability bounds"] += 1;

    const endLimitMs = backBoundMs;
    const endLimitLocal = new Date(endLimitMs);

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
    if (stagePassCounts) stagePassCounts["duration fit"] += 1;

    const availableStartLocal = new Date(candidateStartMs);

    compatible.push({
      id: win.id,
      key,
      startLocal,
      endLocal: endLimitLocal,
      availableStartLocal,
      energyIdx,
      fromPrevDay: win.fromPrevDay ?? false,
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

  return compatible.map((win) => ({
    id: win.id,
    key: win.key,
    startLocal: win.startLocal,
    endLocal: win.endLocal,
    availableStartLocal: win.availableStartLocal,
  }));
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

function isWithinWindow(
  start: Date,
  win: { startLocal: Date; endLocal: Date }
) {
  return start >= win.startLocal && start < win.endLocal;
}

function windowKey(windowId: string, startLocal: Date) {
  return `${windowId}:${startLocal.toISOString()}`;
}

function dateCacheKey(date: Date) {
  return date.toISOString();
}

function energyIndex(level?: string | null, options?: { fallback?: number }) {
  const fallback = options?.fallback ?? -1;
  if (!level) return fallback;
  const up = level.toUpperCase();
  const index = ENERGY.LIST.indexOf(up as (typeof ENERGY.LIST)[number]);
  return index === -1 ? fallback : index;
}

function resolveWindowStart(win: WindowLite, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = win.start_local.split(":").map(Number);
  const baseDay = win.fromPrevDay
    ? addDaysInTimeZone(date, -1, timeZone)
    : date;
  return setTimeInTimeZone(baseDay, timeZone, hour, minute);
}

function resolveWindowEnd(win: WindowLite, date: Date, timeZone: string) {
  const [hour = 0, minute = 0] = win.end_local.split(":").map(Number);
  let end = setTimeInTimeZone(date, timeZone, hour, minute);
  const start = resolveWindowStart(win, date, timeZone);
  if (end <= start) {
    const nextDay = addDaysInTimeZone(date, 1, timeZone);
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
