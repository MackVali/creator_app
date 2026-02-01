import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestSingleResponse } from "@supabase/postgrest-js";
import type { Database } from "../../../types/supabase";
import {
  fetchInstancesForRange,
  computeDurationMin,
  createInstance,
  rescheduleInstance,
  markProjectMissed,
  type ScheduleInstance,
} from "./instanceRepo";
import { addMin } from "./placer";
import {
  addDaysInTimeZone,
  formatDateKeyInTimeZone,
  getDateTimeParts,
  makeZonedDate,
  setTimeInTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "./timezone";
import { safeDate } from "./safeDate";
import { overlapsHalfOpen } from "./intervals";
import { fetchWindowsForDate, type WindowLite } from "./repo";
import { log } from "@/lib/utils/logGate";
import { getAvailabilityWindowKey } from "./windowKey";

type Client = SupabaseClient<Database>;

export type PlacementFailureStage =
  | "availabilityBounds"
  | "overlap"
  | "durationTooLong"
  | "nowConstraint"
  | "other";

export type PlacementDebugTrace = {
  windowsConsidered: number;
  longestWindowMinutes: number;
  availabilityGapMinutes: number;
  gapWithBlockersMinutes: number | null;
  overlapBlockers: number;
  notBeforeApplied: boolean;
  failureStage: PlacementFailureStage;
};

type PlacementFailurePayloadError = "NO_FIT" | Error;

export type PlacementFailureWindowDiagnostic = {
  blockId: string;
  windowId?: string | null;
  dateIso: string;
  freeSegmentMs: number;
  collisionCount: number;
  firstCollision?: {
    itemId: string;
    type: "PROJECT" | "HABIT";
    start: string;
    end: string;
  };
};

type PlacementFailureDebug = {
  windowDiagnostics: PlacementFailureWindowDiagnostic[];
  largestFreeSegmentMs?: number | null;
};

type PlacementFailurePayload = {
  error: PlacementFailurePayloadError;
  maxGapMs?: number | null;
  skippedDueToMaxGap?: boolean;
  debug?: PlacementFailureDebug;
};

type PlacementResult =
  | PostgrestSingleResponse<ScheduleInstance>
  | PlacementFailurePayload;

export type BlockerCache = Map<string, ScheduleInstance[]>;

function buildBlockerCacheKey(dayKey: string, timeZone?: string | null) {
  const resolvedZone =
    typeof timeZone === "string" && timeZone.trim() ? timeZone.trim() : "UTC";
  return `${dayKey}|${resolvedZone}`;
}

export async function fetchWindowsForRange(
  supabase: Client,
  userId: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date
): Promise<WindowLite[]> {
  const contextJoin = "location_context:location_contexts(id, value, label)";
  const { data, error } = await supabase
    .from("windows")
    .select(
      `id, label, energy, start_local, end_local, days, location_context_id, window_kind, ${contextJoin}`
    )
    .eq("user_id", userId);

  if (error) {
    log("error", "fetchWindowsForRange error", error);
    return [];
  }

  return ((data ?? []) as any[]).map((record: any) => ({
    id: record.id,
    label: record.label ?? "",
    energy: record.energy ?? "",
    start_local: record.start_local ?? "00:00",
    end_local: record.end_local ?? "00:00",
    days: record.days ?? null,
    location_context_id: record.location_context_id ?? null,
    location_context_value:
      typeof record.location_context_id === "string" &&
      record.location_context_id.trim().length > 0
        ? (record.location_context?.value ?? null)
        : null,
    location_context_name: record.location_context?.label ?? null,
    window_kind: record.window_kind ?? "DEFAULT",
  })) as WindowLite[];
}

type MaxGapCacheOptions = {
  notBeforeMs: number | null;
  ignoreProjectIds?: Set<string>;
  reuseInstanceId?: string | null;
  ignoreSelfSourceId?: string | null;
  ignoreSelfSourceType?: ScheduleInstance["source_type"] | null;
};

function buildMaxGapCacheKey(
  date: Date,
  windows: PlaceParams["windows"],
  options: MaxGapCacheOptions
) {
  const dayKey = date.toISOString();
  const windowFingerprint = windows
    .map((win) => {
      const windowKey = getAvailabilityWindowKey({
        dayTypeTimeBlockId: win.dayTypeTimeBlockId ?? null,
        windowId: win.dayTypeTimeBlockId ? null : win.id,
        timeBlockId: win.dayTypeTimeBlockId ? win.id : win.timeBlockId ?? null,
        startLocal: win.startLocal,
        endLocal: win.endLocal,
      });
      const start = win.startLocal.toISOString();
      const end = win.endLocal.toISOString();
      const availableStart =
        win.availableStartLocal?.toISOString() ?? win.startLocal.toISOString();
      return `${windowKey}:${start}:${end}:${availableStart}`;
    })
    .join("|");
  const ignoreKey = options.ignoreProjectIds
    ? Array.from(options.ignoreProjectIds)
        .sort()
        .join(",")
    : "";
  const reuseKey = options.reuseInstanceId ?? "";
  const notBeforeKey =
    typeof options.notBeforeMs === "number"
      ? options.notBeforeMs.toString()
      : "none";
  const selfBlockerKey =
    options.ignoreSelfSourceId && options.ignoreSelfSourceId.length > 0
      ? `${options.ignoreSelfSourceType ?? "ANY"}:${options.ignoreSelfSourceId}`
      : "";
  return `${dayKey}|${windowFingerprint}|${notBeforeKey}|${ignoreKey}|${reuseKey}|${selfBlockerKey}`;
}

function computeMaxGapMs(
  windowRecords: Array<WindowGapRecord | null>,
  instancesByWindow: ScheduleInstance[][],
  options: MaxGapCacheOptions
) {
  let maxGapMs = 0;
  for (const [index, record] of windowRecords.entries()) {
    if (!record) continue;
    const { startMs, endMs, availableStartMs } = record;
    const windowStart = Math.max(
      availableStartMs,
      options.notBeforeMs ?? availableStartMs
    );
    if (windowStart >= endMs) continue;
    const segments: Array<{ start: number; end: number }> = [];
    const instances = instancesByWindow[index] ?? [];
    for (const inst of instances) {
      if (inst.status !== "scheduled") continue;
      if (!shouldInstanceContributeToGap(inst, options)) continue;
      const instStart = safeDate(inst.start_utc);
      const instEnd = safeDate(inst.end_utc);
      if (!instStart || !instEnd) continue;
      const instStartMs = instStart.getTime();
      const instEndMs = instEnd.getTime();
      if (!overlapsHalfOpen(startMs, endMs, instStartMs, instEndMs)) continue;
      segments.push({
        start: Math.max(instStartMs, startMs),
        end: Math.min(instEndMs, endMs),
      });
    }
    segments.sort((a, b) => a.start - b.start);
    let cursor = windowStart;
    for (const segment of segments) {
      if (segment.end <= cursor) continue;
      if (segment.start > cursor) {
        maxGapMs = Math.max(maxGapMs, segment.start - cursor);
      }
      cursor = Math.max(cursor, segment.end);
      if (cursor >= endMs) break;
    }
    if (cursor < endMs) {
      maxGapMs = Math.max(maxGapMs, endMs - cursor);
    }
  }
  return maxGapMs;
}

function shouldInstanceContributeToGap(
  inst: ScheduleInstance,
  options: MaxGapCacheOptions
): boolean {
  if (!inst) return false;
  if (
    options.reuseInstanceId &&
    inst.id &&
    options.reuseInstanceId === inst.id
  ) {
    return false;
  }
  if (
    options.ignoreSelfSourceId &&
    inst.source_id === options.ignoreSelfSourceId &&
    (!options.ignoreSelfSourceType ||
      inst.source_type === options.ignoreSelfSourceType)
  ) {
    return false;
  }
  if (options.ignoreProjectIds && inst.source_type === "PROJECT") {
    const projectId = inst.source_id ?? "";
    if (projectId && options.ignoreProjectIds.has(projectId)) {
      return false;
    }
  }
  return inst.status === "scheduled";
}

function hasValidInstanceBounds(inst: ScheduleInstance) {
  const instStart = safeDate(inst.start_utc);
  const instEnd = safeDate(inst.end_utc);
  return (
    Boolean(instStart && instEnd) &&
    instEnd.getTime() > instStart.getTime()
  );
}

function describeInstanceCollision(
  inst?: ScheduleInstance | null
): {
  itemId: string;
  type: "PROJECT" | "HABIT";
  start: string;
  end: string;
} | undefined {
  if (!inst) return undefined;
  const start = inst.start_utc ?? inst.startUtc ?? inst.start ?? null;
  const end = inst.end_utc ?? inst.endUtc ?? inst.end ?? null;
  if (!start || !end) return undefined;
  const itemId = inst.source_id ?? inst.id ?? "";
  const type = inst.source_type === "HABIT" ? "HABIT" : "PROJECT";
  return {
    itemId,
    type,
    start,
    end,
  };
}

function computeLargestGapMs(
  windowStartMs: number,
  windowEndMs: number,
  blockers: ScheduleInstance[]
) {
  let largest = 0;
  const segments = blockers
    .map((inst) => {
      const instStart = safeDate(inst.start_utc);
      const instEnd = safeDate(inst.end_utc);
      if (!instStart || !instEnd) return null;
      const startMs = Math.max(instStart.getTime(), windowStartMs);
      const endMs = Math.min(instEnd.getTime(), windowEndMs);
      if (endMs <= startMs) return null;
      return { startMs, endMs };
    })
    .filter(
      (segment): segment is { startMs: number; endMs: number } => Boolean(segment)
    )
    .sort((a, b) => a.startMs - b.startMs);

  let cursor = windowStartMs;
  for (const segment of segments) {
    if (segment.endMs <= cursor) continue;
    if (segment.startMs > cursor) {
      largest = Math.max(largest, segment.startMs - cursor);
    }
    cursor = Math.max(cursor, segment.endMs);
    if (cursor >= windowEndMs) {
      break;
    }
  }
  if (cursor < windowEndMs) {
    largest = Math.max(largest, windowEndMs - cursor);
  }
  return largest;
}

function crosses(win: WindowLite): boolean {
  const [sh = 0, sm = 0] = win.start_local.split(":").map(Number);
  const [eh = 0, em = 0] = win.end_local.split(":").map(Number);
  return eh < sh || (eh === sh && em < sm);
}

export function getWindowsForDateFromAll(
  allWindows: WindowLite[],
  date: Date,
  timeZone: string
): WindowLite[] {
  const weekday = weekdayInTimeZone(date, timeZone);
  const prevWeekday = (weekday + 6) % 7;

  const today = allWindows.filter(
    (win) =>
      win.days === null ||
      (Array.isArray(win.days) && win.days.includes(weekday))
  );

  const prev = allWindows
    .filter(
      (win) =>
        win.days === null ||
        (Array.isArray(win.days) && win.days.includes(prevWeekday))
    )
    .filter(crosses)
    .map((win) => ({ ...win, fromPrevDay: true }));

  return [...today, ...prev];
}

type PlaceParams = {
  userId: string;
  item: {
    id: string;
    sourceType: ScheduleInstance["source_type"];
    duration_min: number;
    energy: string;
    weight: number;
    globalRank?: number | null;
    eventName: string;
    practiceContextId?: string | null;
  };
  windows: Array<{
    id: string;
    startLocal: Date;
    endLocal: Date;
    availableStartLocal?: Date;
    key?: string;
    fromPrevDay?: boolean;
    dayTypeTimeBlockId?: string | null;
    timeBlockId?: string | null;
    start_local?: string | null;
    end_local?: string | null;
    dayTypeStartUtcMs?: number | null;
    dayTypeEndUtcMs?: number | null;
  }>;
  date: Date;
  timeZone?: string | null;
  client?: Client;
  reuseInstanceId?: string | null;
  ignoreProjectIds?: Set<string>;
  notBefore?: Date;
  existingInstances?: ScheduleInstance[];
  allowHabitOverlap?: boolean;
  habitTypeById?: Map<string, string>;
  projectGlobalRankMap?: Map<string, number | null>;
  windowEdgePreference?: string | null;
  metadata?: ScheduleInstance["metadata"];
  maxGapCache?: Map<string, number>;
  blockerCache?: BlockerCache;
  debugEnabled?: boolean;
  debugOnFailure?: (info: PlacementDebugTrace) => void;
};

type PlaceWindow = PlaceParams["windows"][number];

type WindowGapRecord = {
  startMs: number;
  endMs: number;
  availableStartMs: number;
};

function parseLocalClock(value?: string | null): { hour: number; minute: number } | null {
  if (!value || typeof value !== "string") return null;
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length === 0) return null;
  const [hour = 0, minute = 0] = parts;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

function isIsoLikeTimestamp(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

function anchorDayForPlacementWindow(
  date: Date,
  timeZone: string,
  fromPrevDay?: boolean
) {
  const baseDay = startOfDayInTimeZone(date, timeZone);
  return fromPrevDay
    ? addDaysInTimeZone(baseDay, 1, timeZone)
    : baseDay;
}

function resolveWindowStartInstant(
  win: PlaceWindow,
  date: Date,
  timeZone: string
): Date | null {
  if (typeof win.dayTypeStartUtcMs === "number") {
    const fromMs = new Date(win.dayTypeStartUtcMs);
    return Number.isFinite(fromMs.getTime()) ? fromMs : null;
  }
  const clock = parseLocalClock(win.start_local);
  if (clock) {
    const anchorDay = anchorDayForPlacementWindow(
      date,
      timeZone,
      win.fromPrevDay ?? false
    );
    return setTimeInTimeZone(anchorDay, timeZone, clock.hour, clock.minute);
  }
  if (win.startLocal instanceof Date) {
    return safeDate(win.startLocal);
  }
  return null;
}

function resolveWindowEndInstant(
  win: PlaceWindow,
  date: Date,
  timeZone: string,
  startInstant: Date
): Date | null {
  if (typeof win.dayTypeEndUtcMs === "number") {
    const fromMs = new Date(win.dayTypeEndUtcMs);
    return Number.isFinite(fromMs.getTime()) ? fromMs : null;
  }
  const clock = parseLocalClock(win.end_local);
  if (clock) {
    const anchorDay = anchorDayForPlacementWindow(
      date,
      timeZone,
      win.fromPrevDay ?? false
    );
    let endDate = setTimeInTimeZone(anchorDay, timeZone, clock.hour, clock.minute);
    if (endDate <= startInstant) {
      const nextDay = addDaysInTimeZone(anchorDay, 1, timeZone);
      endDate = setTimeInTimeZone(nextDay, timeZone, clock.hour, clock.minute);
    }
    return endDate;
  }
  if (win.endLocal instanceof Date) {
    return safeDate(win.endLocal);
  }
  return null;
}

function resolveAvailableStartInstant(
  win: PlaceWindow,
  fallback: Date
): Date {
  const candidate = win.availableStartLocal;
  if (candidate instanceof Date) {
    const clone = new Date(candidate.getTime());
    if (Number.isFinite(clone.getTime())) return clone;
  } else if (typeof candidate === "string" && isIsoLikeTimestamp(candidate)) {
    const parsed = new Date(candidate);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return fallback;
}

const normalizeHabitTypeValue = (value?: string | null) => {
  const raw = (value ?? "HABIT").toUpperCase();
  return raw;
};

function logPlacementFailure(params: {
  item: PlaceParams["item"];
  habitType?: string;
  windowIdsAttempted: string[];
  finalAvailabilityBounds?: { startMs: number; endMs: number } | null;
  windowEdgePreference?: string | null;
  failureReason: string;
  debugEnabled?: boolean;
}) {
  if (params.debugEnabled) return;
  if (params.item.sourceType !== "HABIT") return; // Suppress PROJECT failures
  log("debug", "[PLACEMENT_FAILURE]", {
    habit_id: params.item.id,
    habit_type: params.habitType,
    duration_minutes: params.item.duration_min,
    window_ids_attempted: params.windowIdsAttempted,
    final_availability_bounds: params.finalAvailabilityBounds,
    window_edge_preference: params.windowEdgePreference,
    exact_check_failed: params.failureReason,
  });
}

function rankOrInf(
  p: { globalRank?: number | null } | null | undefined
): number {
  const r = p?.globalRank ?? null;
  return r === null ? Number.POSITIVE_INFINITY : r;
}

function compareProjectPriorityForEviction(
  a: ScheduleInstanceLite,
  b: ScheduleInstanceLite
): number {
  const ar = rankOrInf(a.project);
  const br = rankOrInf(b.project);
  if (ar !== br) return ar - br;
  const aw = a.weight_snapshot ?? 0;
  const bw = b.weight_snapshot ?? 0;
  if (aw !== bw) return bw - aw;
  return a.id.localeCompare(b.id);
}

function pickEvictionLoser(
  existing: ScheduleInstanceLite,
  incoming: PlaceParams["item"]
): "existing" | "incoming" {
  const incomingRank = rankOrInf(incoming);
  const existingRank = rankOrInf(existing.project);
  if (incomingRank !== existingRank) {
    return incomingRank < existingRank ? "existing" : "incoming";
  }
  const existingW = existing.weight_snapshot ?? 0;
  const incomingW = incoming.weight ?? 0;
  if (incomingW !== existingW)
    return incomingW > existingW ? "existing" : "incoming";
  return incoming.id.localeCompare(existing.id) < 0 ? "existing" : "incoming";
}

function determinePlacementFailureStage(params: {
  durationMs: number;
  longestWindowMs: number;
  availabilityGapMs: number;
  maxGapMs: number | null;
  dayBlockingInstances: ScheduleInstance[];
  notBeforeMs: number | null;
  windowRecords: WindowGapRecord[];
}): PlacementFailureStage {
  const {
    durationMs,
    longestWindowMs,
    availabilityGapMs,
    maxGapMs,
    dayBlockingInstances,
    notBeforeMs,
    windowRecords,
  } = params;
  const durationPositive = durationMs > 0;
  if (windowRecords.length === 0) {
    return "other";
  }
  if (durationPositive && availabilityGapMs < durationMs) {
    return "availabilityBounds";
  }
  if (durationPositive && maxGapMs !== null && maxGapMs < durationMs) {
    return "overlap";
  }
  if (durationPositive && longestWindowMs > 0 && durationMs > longestWindowMs) {
    return "durationTooLong";
  }
  if (
    durationPositive &&
    notBeforeMs !== null &&
    windowRecords.every((record) => {
      const start = Math.max(record.availableStartMs, notBeforeMs);
      return start + durationMs > record.endMs;
    })
  ) {
    return "nowConstraint";
  }
  if (dayBlockingInstances.length > 0) {
    return "overlap";
  }
  return "other";
}

type ScheduleInstanceLite = {
  id: string;
  source_type: ScheduleInstance["source_type"];
  source_id: string | null;
  weight_snapshot: number | null;
  globalRank?: number | null;
  project?: { globalRank?: number | null } | null;
};

type HighSlot = {
  startMs: number;
  endMs: number;
  windowId: string;
  availableStartMs: number;
};

export async function findEarliestHighSlot(
  userId: string,
  date: Date,
  timeZone: string,
  durationMin: number,
  client?: Client,
  existingInstances?: ScheduleInstance[],
  notBefore?: Date,
  sourceType?: string
): Promise<HighSlot | null> {
  const windows = await fetchWindowsForDate(date, timeZone, client, { userId });
  const highWindows = windows.filter((win) => win.energy === "HIGH");

  if (highWindows.length === 0) {
    return null;
  }

  const resolvedTimeZone = timeZone ?? "UTC";
  const targetDayParts = getDateTimeParts(date, resolvedTimeZone);
  const notBeforeMs = notBefore ? notBefore.getTime() : null;
  const durationMs = Math.max(0, durationMin) * 60000;

  let earliestSlot: HighSlot | null = null;

  for (const win of highWindows) {
    const windowStart = resolveWindowStart(win, date, resolvedTimeZone);
    const windowEnd = resolveWindowEnd(win, date, resolvedTimeZone);
    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowEnd.getTime();

    if (typeof notBeforeMs === "number" && windowEndMs <= notBeforeMs) {
      continue;
    }

    const startMs =
      typeof notBeforeMs === "number"
        ? Math.max(windowStartMs, notBeforeMs)
        : windowStartMs;

    if (startMs + durationMs > windowEndMs) {
      continue;
    }

    let taken: ScheduleInstance[] = [];
    const isBlockingStatus = (status?: ScheduleInstance["status"] | null) =>
      status === "scheduled";

    if (existingInstances) {
      taken = existingInstances.filter((inst) => {
        if (!inst) return false;
        const instStart = safeDate(inst.start_utc);
        if (!instStart) return false;
        if (win.fromPrevDay !== true) {
          const instDayParts = getDateTimeParts(instStart, resolvedTimeZone);
          if (
            instDayParts.year !== targetDayParts.year ||
            instDayParts.month !== targetDayParts.month ||
            instDayParts.day !== targetDayParts.day
          ) {
            return false;
          }
        }
        if (inst.status !== "scheduled") return false;
        if (!isBlockingStatus(inst.status)) return false;
        const instStartMs = instStart.getTime();
        const instEnd = safeDate(inst.end_utc);
        if (!instEnd) return false;
        const instEndMs = instEnd.getTime();
        if (!Number.isFinite(instEndMs)) return false;
        return overlapsHalfOpen(startMs, windowEndMs, instStartMs, instEndMs);
      });
    }

    // Find the earliest available slot in this window
    const sortedTaken = taken.sort(
      (a, b) =>
        new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );

    let cursorMs = startMs;
    for (const block of sortedTaken) {
      const blockStartMs = new Date(block.start_utc).getTime();
      const blockEndMs = new Date(block.end_utc).getTime();
      if (cursorMs + durationMs <= blockStartMs) {
        break;
      }
      if (blockEndMs > cursorMs) {
        cursorMs = blockEndMs;
      }
    }

    if (cursorMs + durationMs <= windowEndMs) {
      const slotStartMs = cursorMs;
      const slotEndMs = cursorMs + durationMs;
      const slot = {
        startMs: slotStartMs,
        endMs: slotEndMs,
        windowId: win.id,
        availableStartMs: slotStartMs,
      };

      if (!earliestSlot || slotStartMs < earliestSlot.startMs) {
        earliestSlot = slot;
      }
    }
  }

  return earliestSlot;
}

export async function placeItemInWindows(
  params: PlaceParams
): Promise<PlacementResult> {
  const {
    userId,
    item,
    windows,
    date,
    timeZone,
    client,
    reuseInstanceId,
    ignoreProjectIds,
    notBefore,
    existingInstances,
    habitTypeById,
    projectGlobalRankMap,
    windowEdgePreference,
    metadata,
    maxGapCache,
    blockerCache,
    debugEnabled,
    debugOnFailure,
  } = params;
  const cache = blockerCache ?? null;
  let best: null | {
    window: (typeof windows)[number];
    windowIndex: number;
    start: Date;
  } = null;

  const resolvedTimeZone = timeZone ?? "UTC";

  const notBeforeMs = notBefore ? notBefore.getTime() : null;
  const durationMs = Math.max(0, item.duration_min) * 60000;
  const candidateIsSync =
    item.sourceType === "HABIT" &&
    normalizeHabitTypeValue(habitTypeById?.get(item.id) ?? "HABIT") === "SYNC";
  const isBlockingStatus = (status?: ScheduleInstance["status"] | null) =>
    status === "scheduled";
  const selfBlockingSourceId =
    item.sourceType === "PROJECT" ? item.id : null;
  const selfBlockingSourceType =
    selfBlockingSourceId !== null ? item.sourceType : null;
  const shouldIgnoreSelfBlocker = (inst?: ScheduleInstance | null) => {
    if (!inst || !selfBlockingSourceId) return false;
    if (
      selfBlockingSourceType &&
      inst.source_type !== selfBlockingSourceType
    ) {
      return false;
    }
    return inst.source_id === selfBlockingSourceId;
  };

  // Build per-window records using the same time resolution logic as the rest of placement.
  // IMPORTANT: start_local/end_local are "HH:mm" strings; never use new Date("HH:mm").
  const windowRecordsByWindow: Array<WindowGapRecord | null> = windows.map((win) => {
    const startInstant = resolveWindowStartInstant(win, date, resolvedTimeZone);
    if (!startInstant) return null;

    const endInstant = resolveWindowEndInstant(
      win,
      date,
      resolvedTimeZone,
      startInstant
    );
    if (!endInstant) return null;

    const startMs = startInstant.getTime();
    const endMs = endInstant.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return null;
    }

    const availableStartInstant = resolveAvailableStartInstant(win, startInstant);
    const availableStartMs = availableStartInstant.getTime();
    const safeAvailableStartMs = Number.isFinite(availableStartMs)
      ? availableStartMs
      : startMs;

    return { startMs, endMs, availableStartMs: Math.max(startMs, safeAvailableStartMs) };
  });
  const windowRecords: WindowGapRecord[] = windowRecordsByWindow.filter(
    (rec): rec is WindowGapRecord => rec !== null
  );

  const availabilityGapMs = windowRecords.reduce((max, record) => {
    const start =
      notBeforeMs !== null
        ? Math.max(record.availableStartMs, notBeforeMs)
        : record.availableStartMs;
    const gap = Math.max(0, record.endMs - start);
    return Math.max(max, gap);
  }, 0);
  const longestWindowMs = windowRecords.reduce(
    (max, record) => Math.max(max, record.endMs - record.startMs),
    0
  );

  const rangeStartMs = windowRecords.reduce(
    (min, record) => Math.min(min, record.startMs),
    Number.POSITIVE_INFINITY
  );
  const rangeEndMs = windowRecords.reduce(
    (max, record) => Math.max(max, record.endMs),
    Number.NEGATIVE_INFINITY
  );

  const dayKey = formatDateKeyInTimeZone(date, resolvedTimeZone);
  const rangeValid =
    Number.isFinite(rangeStartMs) &&
    Number.isFinite(rangeEndMs) &&
    rangeEndMs > rangeStartMs;
  const cacheKey =
    cache && rangeValid
      ? buildBlockerCacheKey(dayKey, resolvedTimeZone)
      : null;

  const scheduleDateIso = params.date.toISOString();
  const windowDiagnostics: PlacementFailureWindowDiagnostic[] = [];
  const recordWindowDiagnostic = (
    diag: Omit<PlacementFailureWindowDiagnostic, "dateIso">
  ) => {
    const entry: PlacementFailureWindowDiagnostic = {
      ...diag,
      dateIso: scheduleDateIso,
    };
    const diagnosticsList = Array.isArray(windowDiagnostics)
      ? windowDiagnostics
      : [];
    diagnosticsList.push(entry);
    diagnosticsList.sort((a, b) => b.freeSegmentMs - a.freeSegmentMs);
    if (diagnosticsList.length > 3) {
      diagnosticsList.length = 3;
    }
  };

  async function loadDayBlockingInstances(
    cacheInstance: BlockerCache | null,
    cacheKeyValue: string | null
  ): Promise<ScheduleInstance[]> {
    if (existingInstances) {
      if (!rangeValid) {
        return [];
      }
      return existingInstances.filter(
        (inst): inst is ScheduleInstance => {
          if (
            !inst ||
            !isBlockingStatus(inst.status) ||
            inst.status === "canceled" ||
            !hasValidInstanceBounds(inst)
          ) {
            return false;
          }
          const instStart = safeDate(inst.start_utc);
          const instEnd = safeDate(inst.end_utc);
          if (!instStart || !instEnd) {
            return false;
          }
          return overlapsHalfOpen(
            rangeStartMs,
            rangeEndMs,
            instStart.getTime(),
            instEnd.getTime()
          );
        }
      );
    }

    if (!rangeValid) {
      return [];
    }

    const cached = cacheKeyValue && cacheInstance ? cacheInstance.get(cacheKeyValue) : null;
    if (cached) {
      return cached;
    }

    const { data, error } = await fetchInstancesForRange(
      userId,
      new Date(rangeStartMs).toISOString(),
      new Date(rangeEndMs).toISOString(),
      client,
      { suppressQueryLog: Boolean(debugEnabled) }
    );
    if (error) {
      throw error;
    }

    const filtered = (data ?? []).filter(
      (inst): inst is ScheduleInstance =>
        Boolean(inst) &&
        isBlockingStatus(inst.status) &&
        inst.status !== "canceled" &&
        hasValidInstanceBounds(inst)
    );

    if (cacheKeyValue && cacheInstance) {
      cacheInstance.set(cacheKeyValue, filtered);
    }

    return filtered;
  }

  let dayBlockingInstances: ScheduleInstance[];
  try {
    dayBlockingInstances = await loadDayBlockingInstances(cache, cacheKey);
  } catch (error) {
    return { error: error as Error };
  }

  const filterBlockersForWindow = (
    windowStartMs: number,
    windowEndMs: number
  ): ScheduleInstance[] =>
    dayBlockingInstances.filter((inst) => {
      if (!inst) return false;
      if (inst.status !== "scheduled") return false;
      if (inst.status === "canceled") return false;
      if (!hasValidInstanceBounds(inst)) return false;
      if (shouldIgnoreSelfBlocker(inst)) return false;
      if (inst.id === reuseInstanceId) return false;
      if (ignoreProjectIds && inst.source_type === "PROJECT") {
        const projectId = inst.source_id ?? "";
        if (projectId && ignoreProjectIds.has(projectId)) {
          return false;
        }
      }
      const instStart = safeDate(inst.start_utc);
      const instEnd = safeDate(inst.end_utc);
      if (!instStart || !instEnd) return false;
      const instStartMs = instStart.getTime();
      const instEndMs = instEnd.getTime();
      if (instStartMs >= windowEndMs || instEndMs <= windowStartMs) {
        return false;
      }
      return true;
    });

  const windowScopedBlockersByWindow = windowRecordsByWindow.map((record) =>
    record ? filterBlockersForWindow(record.startMs, record.endMs) : []
  );

  const shouldEvaluateMaxGap =
    !candidateIsSync && windowRecords.length > 0 && durationMs > 0;
  const gapCache = maxGapCache ?? new Map<string, number>();
  let skipDayForMaxGap = false;
  let computedMaxGapMs: number | null = null;
  if (shouldEvaluateMaxGap) {
    const baseCacheKey = buildMaxGapCacheKey(params.date, windows, {
      notBeforeMs,
      ignoreProjectIds,
      reuseInstanceId,
      ignoreSelfSourceId: selfBlockingSourceId,
      ignoreSelfSourceType: selfBlockingSourceType,
    });
    const cacheKey = `${baseCacheKey}:${item.duration_min}`;
    let maxGapMs = gapCache.get(cacheKey);
    if (maxGapMs === undefined) {
      maxGapMs = computeMaxGapMs(
        windowRecordsByWindow,
        windowScopedBlockersByWindow,
        {
          notBeforeMs,
          ignoreProjectIds,
          reuseInstanceId,
          ignoreSelfSourceId: selfBlockingSourceId,
          ignoreSelfSourceType: selfBlockingSourceType,
        }
      );
      gapCache.set(cacheKey, maxGapMs);
    }
    computedMaxGapMs = maxGapMs;
    skipDayForMaxGap = maxGapMs < durationMs;
  }

  if (skipDayForMaxGap) {
    const failureStage = determinePlacementFailureStage({
      durationMs,
      longestWindowMs,
      availabilityGapMs,
      maxGapMs: computedMaxGapMs,
      dayBlockingInstances,
      notBeforeMs,
      windowRecords,
    });
    debugOnFailure?.({
      windowsConsidered: windows.length,
      longestWindowMinutes: Math.round(longestWindowMs / 60000),
      availabilityGapMinutes: Math.round(availabilityGapMs / 60000),
      gapWithBlockersMinutes:
        computedMaxGapMs !== null
          ? Math.round(computedMaxGapMs / 60000)
          : null,
      overlapBlockers: dayBlockingInstances.length,
      notBeforeApplied: notBeforeMs !== null,
      failureStage,
    });
    if (windowRecordsByWindow.length > 0) {
      for (const [index, record] of windowRecordsByWindow.entries()) {
        if (!record) continue;
        const windowDef = windows[index];
        if (!windowDef) continue;
        const taken = filterBlockersForWindow(record.startMs, record.endMs);
        const freeSegmentMs = computeLargestGapMs(
          record.startMs,
          record.endMs,
          taken
        );
        recordWindowDiagnostic({
          blockId: windowDef.key ?? windowDef.id,
          windowId: windowDef.id ?? null,
          freeSegmentMs,
          collisionCount: taken.length,
          firstCollision: describeInstanceCollision(taken[0]),
        });
      }
    }
    return {
      error: "NO_FIT",
      skippedDueToMaxGap: true,
      maxGapMs: computedMaxGapMs,
      debug: {
        windowDiagnostics: windowDiagnostics.slice(),
        largestFreeSegmentMs: computedMaxGapMs ?? null,
      },
    };
  }

  if (!skipDayForMaxGap) {
    for (const [index, w] of windows.entries()) {
      const windowRecord = windowRecordsByWindow[index];
      if (!windowRecord) {
        continue;
      }
      const windowStartMs = windowRecord.startMs;
      const windowEndMs = windowRecord.endMs;
      const effectiveWindowStartMs = Math.max(
        windowStartMs,
        windowRecord.availableStartMs
      );

      if (typeof notBeforeMs === "number" && windowEndMs <= notBeforeMs) {
        continue;
      }

      const startMs =
        typeof notBeforeMs === "number"
          ? Math.max(effectiveWindowStartMs, notBeforeMs)
          : effectiveWindowStartMs;

      const taken = filterBlockersForWindow(windowStartMs, windowEndMs);
      const windowBlockId = w.key ?? w.id;
      const freeSegmentMs = computeLargestGapMs(
        windowStartMs,
        windowEndMs,
        taken
      );
      recordWindowDiagnostic({
        blockId: windowBlockId,
        windowId: w.id ?? null,
        freeSegmentMs,
        collisionCount: taken.length,
        firstCollision: describeInstanceCollision(taken[0]),
      });

      const capacityBlockers: ScheduleInstance[] = [];
      const syncBlockers: ScheduleInstance[] = [];
      const projectBlockers: ScheduleInstance[] = [];

      for (const inst of taken) {
        if (!inst) continue;
        if (inst.id === reuseInstanceId) continue;
        if (ignoreProjectIds && inst.source_type === "PROJECT") {
          const projectId = inst.source_id ?? "";
          if (projectId && ignoreProjectIds.has(projectId)) {
            continue;
          }
        }
        if (inst.source_type === "HABIT") {
          const habitType = normalizeHabitTypeValue(
            habitTypeById?.get(inst.source_id ?? "") ?? "HABIT"
          );
          if (habitType === "SYNC") {
            syncBlockers.push(inst);
          } else {
            capacityBlockers.push(inst);
          }
          continue;
        }
        if (inst.source_type === "PROJECT") {
          projectBlockers.push(inst);
        }
        capacityBlockers.push(inst);
      }

      const sorted = (candidateIsSync ? [] : capacityBlockers).sort(
        (a, b) =>
          new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
      );
      const hardBlockers = candidateIsSync ? [] : capacityBlockers;

      const hasSyncOverlapLimit = (
        startMs: number,
        endMs: number,
        blocks: ScheduleInstance[],
        limit: number
      ) => {
        const events: Array<{ time: number; delta: number }> = [];
        for (const block of blocks) {
          const blockStartMs = new Date(block.start_utc).getTime();
          const blockEndMs = new Date(block.end_utc).getTime();
          if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
            continue;
          }
          if (!overlapsHalfOpen(startMs, endMs, blockStartMs, blockEndMs)) continue;
          const overlapStart = Math.max(blockStartMs, startMs);
          const overlapEnd = Math.min(blockEndMs, endMs);
          if (overlapEnd <= overlapStart) continue;
          events.push({ time: overlapStart, delta: 1 });
          events.push({ time: overlapEnd, delta: -1 });
        }
        if (events.length === 0) return false;
        events.sort((a, b) => a.time - b.time || a.delta - b.delta);
        let active = 0;
        let prevTime = startMs;
        let index = 0;
        while (index < events.length) {
          const time = events[index].time;
          if (active >= limit && time > prevTime) {
            return true;
          }
          while (index < events.length && events[index].time === time) {
            active += events[index].delta;
            index += 1;
          }
          prevTime = time;
        }
        return active >= limit;
      };

    const findSyncCandidate = () => {
      if (durationMs <= 0) {
        return new Date(startMs);
      }
      let projectStartAnchorMs = startMs;
      for (const block of projectBlockers) {
        const blockStartMs = new Date(block.start_utc).getTime();
        const blockEndMs = new Date(block.end_utc).getTime();
        if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
          continue;
        }
        if (blockStartMs <= startMs && blockEndMs > startMs) {
          projectStartAnchorMs = Math.max(projectStartAnchorMs, blockEndMs);
        }
      }
      const syncStartMs = Math.max(startMs, projectStartAnchorMs);
      const candidateStarts = new Set<number>();
      candidateStarts.add(syncStartMs);
      for (const block of syncBlockers) {
        const blockStartMs = new Date(block.start_utc).getTime();
        const blockEndMs = new Date(block.end_utc).getTime();
        if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
          continue;
        }
        const endCandidate = blockEndMs;
        const leadCandidate = blockStartMs - durationMs;
        if (endCandidate >= startMs && endCandidate < windowEndMs) {
          candidateStarts.add(endCandidate);
        }
        if (leadCandidate >= startMs && leadCandidate < windowEndMs) {
          candidateStarts.add(leadCandidate);
        }
      }
      const ordered = Array.from(candidateStarts).sort((a, b) => a - b);
      for (const candidateStart of ordered) {
        if (candidateStart < syncStartMs) continue;
        const candidateEnd = candidateStart + durationMs;
        if (candidateEnd > windowEndMs) break;
        if (
          !hasSyncOverlapLimit(candidateStart, candidateEnd, syncBlockers, 2)
        ) {
          return new Date(candidateStart);
        }
      }
      return null;
    };

    const advanceCursorPastHardBlockers = (cursorValue: number) => {
      let cursor = cursorValue;
      while (true) {
        let maxEnd = cursor;
        for (const block of hardBlockers) {
          const blockStartMs = new Date(block.start_utc).getTime();
          const blockEndMs = new Date(block.end_utc).getTime();
          if (!Number.isFinite(blockStartMs) || !Number.isFinite(blockEndMs)) {
            continue;
          }
          const effectiveBlockStartMs =
            typeof notBeforeMs === "number"
              ? Math.max(blockStartMs, notBeforeMs)
              : blockStartMs;
          if (cursor >= effectiveBlockStartMs && cursor < blockEndMs) {
            if (blockEndMs > maxEnd) {
              maxEnd = blockEndMs;
            }
          }
        }
        if (maxEnd === cursor) {
          return cursor;
        }
        cursor = maxEnd;
        if (typeof notBeforeMs === "number" && cursor < notBeforeMs) {
          cursor = notBeforeMs;
        }
      }
    };

    let cursorMs = advanceCursorPastHardBlockers(startMs);
    let candidate: Date | null = candidateIsSync ? findSyncCandidate() : null;

    if (!candidate) {
      for (const block of sorted) {
        cursorMs = advanceCursorPastHardBlockers(cursorMs);
        const blockStart = new Date(block.start_utc);
        const blockEnd = new Date(block.end_utc);

        const blockStartMs = blockStart.getTime();
        const blockEndMs = blockEnd.getTime();

        if (typeof notBeforeMs === "number" && blockEndMs <= notBeforeMs) {
          continue;
        }

        const effectiveBlockStartMs =
          typeof notBeforeMs === "number"
            ? Math.max(blockStartMs, notBeforeMs)
            : blockStartMs;

        if (cursorMs + durationMs <= effectiveBlockStartMs) {
          candidate = new Date(cursorMs);
          break;
        }

        if (blockEndMs > cursorMs) {
          cursorMs = blockEndMs;
          if (typeof notBeforeMs === "number" && cursorMs < notBeforeMs) {
            cursorMs = notBeforeMs;
          }
          cursorMs = advanceCursorPastHardBlockers(cursorMs);
        }
      }

      cursorMs = advanceCursorPastHardBlockers(cursorMs);
      if (!candidate && cursorMs + durationMs <= windowEndMs) {
        candidate = new Date(cursorMs);
      }
    }

    if (!candidate) continue;

    if (typeof notBeforeMs === "number" && candidate.getTime() < notBeforeMs) {
      candidate = new Date(notBeforeMs);
    }

    if (candidateIsSync) {
      best = { window: w, windowIndex: index, start: candidate };
      break;
    }

    if (
      !best ||
      candidate.getTime() < best.start.getTime() ||
      (candidate.getTime() === best.start.getTime() && index < best.windowIndex)
    ) {
      if (
        process.env.DEBUG_OVERNIGHT === "true" &&
        item.id.startsWith("proj-overnight")
      ) {
        log("debug", "overnight candidate", {
          itemId: item.id,
          windowId: w.id,
          start: candidate.toISOString(),
        });
      }
      best = { window: w, windowIndex: index, start: candidate };
    }
  }

  }

  if (!best) {
    logPlacementFailure({
      item,
      habitType: habitTypeById?.get(item.id),
      windowIdsAttempted: windows.map((w) => w.id),
      finalAvailabilityBounds:
        windowRecords.length > 0
          ? {
              startMs: windowRecords[0].availableStartMs,
              endMs: windowRecords[0].endMs,
            }
          : null,
      windowEdgePreference,
      failureReason: "no_compatible_window_found",
      debugEnabled: params.debugEnabled,
    });
    const failureStage = determinePlacementFailureStage({
      durationMs,
      longestWindowMs,
      availabilityGapMs,
      maxGapMs: computedMaxGapMs,
      dayBlockingInstances,
      notBeforeMs,
      windowRecords,
    });
    debugOnFailure?.({
      windowsConsidered: windows.length,
      longestWindowMinutes: Math.round(longestWindowMs / 60000),
      availabilityGapMinutes: Math.round(availabilityGapMs / 60000),
      gapWithBlockersMinutes:
        computedMaxGapMs !== null
          ? Math.round(computedMaxGapMs / 60000)
          : null,
      overlapBlockers: dayBlockingInstances.length,
      notBeforeApplied: notBeforeMs !== null,
      failureStage,
    });
    return {
      error: "NO_FIT",
      maxGapMs: computedMaxGapMs,
      debug: {
        windowDiagnostics: windowDiagnostics.slice(),
        largestFreeSegmentMs: computedMaxGapMs ?? null,
      },
    };
  }

  let startUtc = safeDate(best.start);
  if (!startUtc) {
    logPlacementFailure({
      item,
      habitType: habitTypeById?.get(item.id),
      windowIdsAttempted: [],
      finalAvailabilityBounds: null,
      windowEdgePreference,
      failureReason: "invalid_start_date",
      debugEnabled: params.debugEnabled,
    });
    return { error: "NO_FIT", maxGapMs: computedMaxGapMs };
  }
  let endUtc = safeDate(addMin(best.start, item.duration_min));
  if (!endUtc) {
    logPlacementFailure({
      item,
      habitType: habitTypeById?.get(item.id),
      windowIdsAttempted: [],
      finalAvailabilityBounds: null,
      windowEdgePreference,
      failureReason: "invalid_end_date",
      debugEnabled: params.debugEnabled,
    });
    return { error: "NO_FIT", maxGapMs: computedMaxGapMs };
  }
  let durationMin = item.duration_min;
  // Only apply day boundary clamp for HABIT items, not PROJECT items
  if (
    item.sourceType === "HABIT" &&
    timeZone &&
    best.window.fromPrevDay !== true
  ) {
    const parts = getDateTimeParts(startUtc, timeZone);
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
    if (endUtc.getTime() > maxEndMs) {
      endUtc = safeDate(new Date(maxEndMs));
      if (!endUtc) {
        return { error: "NO_FIT", maxGapMs: computedMaxGapMs };
      }
      const durationMs = endUtc.getTime() - startUtc.getTime();
      if (durationMs <= 0) {
        logPlacementFailure({
          item,
          habitType: habitTypeById?.get(item.id),
          windowIdsAttempted: [],
          finalAvailabilityBounds: null,
          windowEdgePreference,
          failureReason: "day_boundary_clamp_exceeded",
          debugEnabled: params.debugEnabled,
        });
        return { error: "NO_FIT", maxGapMs: computedMaxGapMs };
      }
      durationMin = Math.max(1, Math.round(durationMs / 60000));
    }
  }

  // Exact PROJECT-PROJECT overlap check using final timestamps
  if (item.sourceType === "PROJECT") {
    const hasOverlap = existingInstances?.some((inst) => {
      if (inst.source_type !== "PROJECT") return false;
      const instStart = safeDate(inst.start_utc);
      const instEnd = safeDate(inst.end_utc);
      if (!instStart || !instEnd) return false;
      return overlapsHalfOpen(
        startUtc.getTime(),
        endUtc.getTime(),
        instStart.getTime(),
        instEnd.getTime()
      );
    });
    if (hasOverlap) {
      return { error: "NO_FIT", maxGapMs: computedMaxGapMs };
    }
  }

  // Helper function to extract window references from window-like objects
  function extractWindowRefs(winLike: any): {
    legacyWindowId: string | null;
    dayTypeTimeBlockId: string | null;
    timeBlockId: string | null;
  } {
    // Try to find the WindowLite object at common locations
    const w = winLike.window ?? winLike.baseWindow ?? winLike;

    // Read the dayTypeTimeBlockId (try both camelCase and snake_case)
    const dttbId = w.dayTypeTimeBlockId ?? w.day_type_time_block_id ?? null;
    const timeBlockId =
      (w as any).timeBlockId ?? w.time_block_id ?? w.id ?? null;

    // Determine legacy vs day-type window
    if (dttbId !== null && dttbId !== undefined) {
      // Day-type window
      return {
        legacyWindowId: null,
        dayTypeTimeBlockId: dttbId,
        timeBlockId: timeBlockId,
      };
    } else {
      // Legacy window
      return {
        legacyWindowId: timeBlockId, // The legacy windows.id
        dayTypeTimeBlockId: null,
        timeBlockId: null,
      };
    }
  }

  // Extract window references from the best.window occurrence
  // Note: best.window is a window occurrence object of type:
  // {id: string, startLocal: Date, endLocal: Date, ...}
  // The underlying WindowLite properties (including dayTypeTimeBlockId) are available directly on the occurrence object
  const windowRefs = extractWindowRefs(best.window);

  return await persistPlacement(
    {
      userId,
      item,
      windowId: windowRefs.legacyWindowId,
      dayTypeTimeBlockId: windowRefs.dayTypeTimeBlockId,
      timeBlockId: windowRefs.timeBlockId,
      startUTC: startUtc.toISOString(),
      endUTC: endUtc.toISOString(),
      durationMin,
      reuseInstanceId,
      eventName: item.eventName,
      metadata,
    },
    client
  );
}

function resolveWindowStart(win: WindowLite, date: Date, timeZone: string) {
  if (typeof win.dayTypeStartUtcMs === "number") {
    return new Date(win.dayTypeStartUtcMs);
  }
  const [hour = 0, minute = 0] = win.start_local.split(":").map(Number);
  const anchorDay = anchorDayForPlacementWindow(
    date,
    timeZone,
    win.fromPrevDay ?? false
  );
  return setTimeInTimeZone(anchorDay, timeZone, hour, minute);
}

function resolveWindowEnd(win: WindowLite, date: Date, timeZone: string) {
  if (typeof win.dayTypeEndUtcMs === "number") {
    return new Date(win.dayTypeEndUtcMs);
  }
  const [hour = 0, minute = 0] = win.end_local.split(":").map(Number);
  const anchorDay = anchorDayForPlacementWindow(
    date,
    timeZone,
    win.fromPrevDay ?? false
  );
  let end = setTimeInTimeZone(anchorDay, timeZone, hour, minute);
  const start = resolveWindowStart(win, date, timeZone);
  if (end <= start) {
    const nextDay = addDaysInTimeZone(anchorDay, 1, timeZone);
    end = setTimeInTimeZone(nextDay, timeZone, hour, minute);
  }
  return end;
}

async function persistPlacement(
  params: {
    userId: string;
    item: PlaceParams["item"];
    windowId: string | null;
    dayTypeTimeBlockId?: string | null;
    timeBlockId?: string | null;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    reuseInstanceId?: string | null;
    eventName: string;
    metadata?: ScheduleInstance["metadata"];
  },
  client?: Client
) {
  const {
    userId,
    item,
    windowId,
    dayTypeTimeBlockId,
    timeBlockId,
    startUTC,
    endUTC,
    reuseInstanceId,
    eventName,
    metadata,
  } = params;
  const computedDurationMin = computeDurationMin(
    new Date(startUTC),
    new Date(endUTC)
  );
  if (computedDurationMin <= 0) {
    throw new Error("Invalid duration_min computed for instance");
  }
  if (reuseInstanceId) {
    return await rescheduleInstance(
      reuseInstanceId,
      {
        windowId,
        dayTypeTimeBlockId,
        timeBlockId,
        startUTC,
        endUTC,
        durationMin: computedDurationMin,
        weightSnapshot: item.weight,
        energyResolved: item.energy,
        eventName,
        practiceContextId: item.practiceContextId,
        metadata,
      },
      client
    );
  }
  try {
    const created = await createInstance(
      {
        userId,
        sourceId: item.id,
        sourceType: item.sourceType,
        windowId,
        dayTypeTimeBlockId,
        timeBlockId,
        startUTC,
        endUTC,
        durationMin: computedDurationMin,
        weightSnapshot: item.weight,
        energyResolved: item.energy,
        eventName,
        practiceContextId: item.practiceContextId,
        metadata,
      },
      client
    );
    return {
      data: created,
      error: null,
      status: 201,
      statusText: "Created",
      count: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error as PostgrestSingleResponse<ScheduleInstance>["error"],
      status: 400,
      statusText: "Error",
      count: null,
    };
  }
}
