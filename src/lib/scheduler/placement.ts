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
  getDateTimeParts,
  makeZonedDate,
  addDaysInTimeZone,
  setTimeInTimeZone,
  weekdayInTimeZone,
} from "./timezone";
import { safeDate } from "./safeDate";
import { fetchWindowsForDate, type WindowLite } from "./repo";

type Client = SupabaseClient<Database>;

type PlacementResult =
  | PostgrestSingleResponse<ScheduleInstance>
  | { error: "NO_FIT" | Error };

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
    console.error("fetchWindowsForRange error", error);
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
        ? record.location_context?.value ?? null
        : null,
    location_context_name: record.location_context?.label ?? null,
    window_kind: record.window_kind ?? "DEFAULT",
  })) as WindowLite[];
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
};

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
}) {
  if (params.item.sourceType !== "HABIT") return; // Suppress PROJECT failures
  console.log(
    JSON.stringify({
      habit_id: params.item.id,
      habit_type: params.habitType,
      duration_minutes: params.item.duration_min,
      window_ids_attempted: params.windowIdsAttempted,
      final_availability_bounds: params.finalAvailabilityBounds,
      window_edge_preference: params.windowEdgePreference,
      exact_check_failed: params.failureReason,
    })
  );
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
        const instDayParts = getDateTimeParts(instStart, resolvedTimeZone);
        if (
          instDayParts.year !== targetDayParts.year ||
          instDayParts.month !== targetDayParts.month ||
          instDayParts.day !== targetDayParts.day
        ) {
          return false;
        }
        if (!isBlockingStatus(inst.status)) return false;
        const instStartMs = instStart.getTime();
        const instEndMs = new Date(inst.end_utc).getTime();
        return instEndMs > startMs && instStartMs < windowEndMs;
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
  } = params;
  let best: null | {
    window: (typeof windows)[number];
    windowIndex: number;
    start: Date;
  } = null;

  const resolvedTimeZone = timeZone ?? "UTC";
  const targetDayParts = getDateTimeParts(params.date, resolvedTimeZone);

  const notBeforeMs = notBefore ? notBefore.getTime() : null;
  const durationMs = Math.max(0, item.duration_min) * 60000;
  const candidateIsSync =
    item.sourceType === "HABIT" &&
    normalizeHabitTypeValue(habitTypeById?.get(item.id) ?? "HABIT") === "SYNC";

  for (const [index, w] of windows.entries()) {
    const windowStart = new Date(w.availableStartLocal ?? w.startLocal);
    const windowEnd = new Date(w.endLocal);

    const windowStartMs = windowStart.getTime();
    const windowEndMs = windowEnd.getTime();

    if (typeof notBeforeMs === "number" && windowEndMs <= notBeforeMs) {
      continue;
    }

    const startMs =
      typeof notBeforeMs === "number"
        ? Math.max(windowStartMs, notBeforeMs)
        : windowStartMs;
    const rangeStart = new Date(startMs);

    let taken: ScheduleInstance[] = [];
    const isBlockingStatus = (status?: ScheduleInstance["status"] | null) =>
      status === "scheduled";

    if (existingInstances) {
      taken = existingInstances.filter((inst): inst is ScheduleInstance => {
        if (!inst) return false;
        const instStart = safeDate(inst.start_utc);
        if (!instStart) return false;
        const instDayParts = getDateTimeParts(instStart, resolvedTimeZone);
        if (
          instDayParts.year !== targetDayParts.year ||
          instDayParts.month !== targetDayParts.month ||
          instDayParts.day !== targetDayParts.day
        ) {
          return false;
        }
        if (!isBlockingStatus(inst.status)) return false;
        const instStartMs = instStart.getTime();
        const instEndMs = new Date(inst.end_utc ?? "").getTime();
        return instEndMs > startMs && instStartMs < windowEndMs;
      });
    } else {
      const { data, error } = await fetchInstancesForRange(
        userId,
        rangeStart.toISOString(),
        windowEnd.toISOString(),
        client
      );
      if (error) {
        return { error };
      }
      taken = (data ?? []).filter(
        (inst) =>
          inst && isBlockingStatus(inst.status) && inst.status !== "canceled"
      );
    }

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
        if (blockEndMs <= startMs || blockStartMs >= endMs) continue;
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
        console.log("overnight candidate", {
          itemId: item.id,
          windowId: w.id,
          start: candidate.toISOString(),
        });
      }
      best = { window: w, windowIndex: index, start: candidate };
    }
  }

  if (!best) {
    logPlacementFailure({
      item,
      habitType: habitTypeById?.get(item.id),
      windowIdsAttempted: windows.map((w) => w.id),
      finalAvailabilityBounds:
        windows.length > 0
          ? {
              startMs: windows[0].availableStartLocal?.getTime() ?? null,
              endMs: windows[0].endLocal?.getTime() ?? null,
            }
          : null,
      windowEdgePreference,
      failureReason: "no_compatible_window_found",
    });
    return { error: "NO_FIT" };
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
    });
    return { error: "NO_FIT" };
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
    });
    return { error: "NO_FIT" };
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
        return { error: "NO_FIT" };
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
        });
        return { error: "NO_FIT" };
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
      return (
        instEnd.getTime() > startUtc.getTime() &&
        instStart.getTime() < endUtc.getTime()
      );
    });
    if (hasOverlap) {
      return { error: "NO_FIT" };
    }
  }

  return await persistPlacement(
    {
      userId,
      item,
      windowId: best.window.id,
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

async function persistPlacement(
  params: {
    userId: string;
    item: PlaceParams["item"];
    windowId: string;
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
