import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "../../../types/supabase";
import type { FlameLevel } from "@/components/FlameEmber";
import type { WindowLite as RepoWindow } from "@/lib/scheduler/repo";
import { safeDate } from "@/lib/scheduler/safeDate";
import { log } from "@/lib/utils/logGate";
import {
  elapsedMs,
  recordSchedulerPhase,
  schedulerNowMs,
  type SchedulerTiming,
} from "@/lib/scheduler/timing";

export type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];

export type ScheduleContext = {
  energyResolved: FlameLevel;
  durationMin: number;
  windowId: string | null;
};

export type HabitTimelinePlacement = {
  habitId: string;
  habitName: string;
  habitType: string;
  skillId: string | null;
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
export type ScheduleInstanceStatus =
  Database["public"]["Enums"]["schedule_instance_status"];

type Client = SupabaseClient<Database>;

const SCHEDULER_INSTANCE_WRITE_PROJECTION = [
  "id",
  "updated_at",
  "user_id",
  "source_type",
  "source_id",
  "window_id",
  "day_type_time_block_id",
  "time_block_id",
  "start_utc",
  "end_utc",
  "duration_min",
  "status",
  "weight_snapshot",
  "energy_resolved",
  "canceled_reason",
  "completed_at",
  "locked",
  "placement_source",
  "event_name",
  "practice_context_monument_id",
  "overlay_window_id",
  "metadata",
].join(", ");

const SCHEDULER_INSTANCE_CREATE_BATCH_SIZE = 500;

type CreateInstanceInput = {
  userId: string;
  sourceId: string;
  sourceType: ScheduleInstance["source_type"];
  windowId?: string | null;
  dayTypeTimeBlockId?: string | null;
  timeBlockId?: string | null;
  overlayWindowId?: string | null;
  startUTC: string;
  endUTC: string;
  durationMin: number;
  weightSnapshot?: number;
  energyResolved: string;
  eventName?: string | null;
  locked?: boolean;
  placementSource?: ScheduleInstance["placement_source"];
  practiceContextId?: string | null;
  metadata?: ScheduleInstance["metadata"];
};

type ScheduleInstanceInsert =
  Database["public"]["Tables"]["schedule_instances"]["Insert"];

type PendingCreate = {
  row: ScheduleInstanceInsert & { id: string };
  placeholder: ScheduleInstance;
};

export type ScheduleInstanceCreateBatcher = {
  enqueue(input: CreateInstanceInput): ScheduleInstance;
  flush(): Promise<void>;
  readonly size: number;
};

export function computeDurationMin(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60000);
}

function validateCreateInstanceInput(input: CreateInstanceInput) {
  const hasStart =
    typeof input.startUTC === "string" && input.startUTC.length > 0;
  const hasEnd = typeof input.endUTC === "string" && input.endUTC.length > 0;
  const hasDuration =
    typeof input.durationMin === "number" && Number.isFinite(input.durationMin);
  if (
    (hasStart || hasEnd || hasDuration) &&
    !(hasStart && hasEnd && hasDuration)
  ) {
    throw new Error(
      "createInstance payload missing startUTC/endUTC/durationMin"
    );
  }
}

function buildCreateInstanceInsert(
  input: CreateInstanceInput,
  id?: string
): ScheduleInstanceInsert & { id?: string } {
  validateCreateInstanceInput(input);
  const isDayTypeScheduling = Boolean(input.dayTypeTimeBlockId);
  const windowIdValue = input.windowId ?? null;
  const dayTypeTimeBlockIdValue = isDayTypeScheduling
    ? input.dayTypeTimeBlockId ?? null
    : null;
  const timeBlockIdValue = isDayTypeScheduling
    ? input.timeBlockId ?? input.windowId ?? null
    : null;
  const overlayWindowIdValue = input.overlayWindowId ?? null;
  return {
    ...(id ? { id } : {}),
    user_id: input.userId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    window_id: windowIdValue,
    day_type_time_block_id: dayTypeTimeBlockIdValue,
    time_block_id: timeBlockIdValue,
    overlay_window_id: overlayWindowIdValue,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: "scheduled",
    weight_snapshot: input.weightSnapshot ?? 0,
    energy_resolved: input.energyResolved,
    locked: input.locked ?? false,
    placement_source: input.placementSource ?? "scheduler",
    event_name: input.eventName ?? null,
    practice_context_monument_id: input.practiceContextId ?? null,
    metadata: input.metadata ?? null,
  };
}

function buildCreateInstanceFailurePayload(input: CreateInstanceInput) {
  return {
    user_id: input.userId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: "scheduled",
    weight_snapshot: input.weightSnapshot ?? 0,
    energy_resolved: input.energyResolved,
    locked: input.locked ?? false,
    placement_source: input.placementSource ?? "scheduler",
    scheduled_at: null,
  };
}

function createPlaceholderScheduleInstance(
  row: ScheduleInstanceInsert & { id: string }
): ScheduleInstance {
  return {
    ...row,
    updated_at: null,
    canceled_reason: null,
    completed_at: null,
  } as ScheduleInstance;
}

async function ensureClient(client?: Client): Promise<Client> {
  if (client) return client;

  const supabase = getSupabaseBrowser?.();
  if (!supabase) throw new Error("Supabase client not available");
  return supabase as Client;
}

export async function fetchInstancesForRange(
  userId: string,
  startUTC: string,
  endUTC: string,
  client?: Client,
  options?: { suppressQueryLog?: boolean; timing?: SchedulerTiming | null }
) {
  const startedAt = schedulerNowMs();
  const supabase = await ensureClient(client);
  const safeStart = safeDate(startUTC);
  const safeEnd = safeDate(endUTC);
  if (!safeStart || !safeEnd) {
    return {
      data: [],
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
    };
  }
  const base = supabase
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "canceled");

  const startParam = safeStart.toISOString();
  const endParam = safeEnd.toISOString();

  const overlapClause = `and(start_utc.gte.${startParam},start_utc.lt.${endParam}),and(start_utc.lt.${startParam},end_utc.gt.${startParam})`;
  if (!options?.suppressQueryLog) {
    log(
      "debug",
      `[QUERY] range=${startParam}..${endParam} where=${overlapClause}`
    );
  }

  const query = base.or(overlapClause).order("start_utc", { ascending: true });

  const response = await query;
  if (options?.timing) {
    const ms = elapsedMs(startedAt);
    options.timing.schedule.scheduleInstanceQueries.calls += 1;
    options.timing.schedule.scheduleInstanceQueries.totalMs += ms;
    options.timing.schedule.scheduleInstanceQueries.rows +=
      Array.isArray(response.data) ? response.data.length : 0;
    recordSchedulerPhase(
      options.timing,
      "scheduler.schedule.existing_schedule_instance_load",
      ms
    );
  }
  return response;
}

export async function fetchScheduledProjectIds(
  userId: string,
  client?: Client
): Promise<string[]> {
  const supabase = await ensureClient(client);
  const { data, error } = await supabase
    .from("schedule_instances")
    .select("source_id")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT")
    .in("status", ["scheduled", "completed", "missed"]);

  if (error) throw error;

  const ids = new Set<string>();
  for (const record of (data ?? []) as Array<
    Pick<ScheduleInstance, "source_id">
  >) {
    if (record.source_id) ids.add(record.source_id);
  }
  return Array.from(ids);
}

export async function createInstance(
  input: CreateInstanceInput,
  client?: Client
) {
  const supabase = await ensureClient(client);
  const insertPayload = buildCreateInstanceInsert(input);
  const { data, error } = await supabase
    .from("schedule_instances")
    .insert(insertPayload)
    .select(SCHEDULER_INSTANCE_WRITE_PROJECTION)
    .single();
  if (error) {
    log("debug", "[CREATE_INSTANCE_FAIL]", {
      payload: buildCreateInstanceFailurePayload(input),
      error: {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
    });
    throw error;
  }
  return data;
}

export function createScheduleInstanceCreateBatcher(
  client: Client,
  options?: {
    onFlushMs?: (ms: number) => void;
    onFlushStats?: (stats: {
      rows: number;
      maxRows: number;
      insertMs: number;
      selectMs: number;
      flushMs: number;
    }) => void;
  }
): ScheduleInstanceCreateBatcher {
  const pending: PendingCreate[] = [];

  return {
    get size() {
      return pending.length;
    },
    enqueue(input: CreateInstanceInput) {
      const id = crypto.randomUUID();
      const row = buildCreateInstanceInsert(
        input,
        id
      ) as ScheduleInstanceInsert & {
        id: string;
      };
      const placeholder = createPlaceholderScheduleInstance(row);
      pending.push({ row, placeholder });
      return placeholder;
    },
    async flush() {
      if (pending.length === 0) return;
      const entries = pending.splice(0, pending.length);
      const startedAt = schedulerNowMs();
      let insertMs = 0;
      let maxRows = 0;
      try {
        for (
          let index = 0;
          index < entries.length;
          index += SCHEDULER_INSTANCE_CREATE_BATCH_SIZE
        ) {
          const batch = entries.slice(
            index,
            index + SCHEDULER_INSTANCE_CREATE_BATCH_SIZE
          );
          maxRows = Math.max(maxRows, batch.length);
          const queryStartedAt = schedulerNowMs();
          const { data, error } = await client
            .from("schedule_instances")
            .insert(batch.map((entry) => entry.row))
            .select(SCHEDULER_INSTANCE_WRITE_PROJECTION);
          insertMs += elapsedMs(queryStartedAt);
          if (error) {
            logCreateBatchFailure(error, batch);
            throw error;
          }
          const persistedById = new Map(
            ((data ?? []) as ScheduleInstance[]).map((row) => [row.id, row])
          );
          for (const entry of batch) {
            const persisted = persistedById.get(entry.row.id);
            if (persisted) {
              Object.assign(entry.placeholder, persisted);
            }
          }
        }
      } finally {
        const flushMs = elapsedMs(startedAt);
        options?.onFlushMs?.(flushMs);
        options?.onFlushStats?.({
          rows: entries.length,
          maxRows,
          insertMs,
          selectMs: 0,
          flushMs,
        });
      }
    },
  };
}

function logCreateBatchFailure(
  error: PostgrestError,
  batch: PendingCreate[]
) {
  log("debug", "[CREATE_INSTANCE_BATCH_FAIL]", {
    count: batch.length,
    first: batch[0]
      ? {
          id: batch[0].row.id,
          user_id: batch[0].row.user_id,
          source_type: batch[0].row.source_type,
          source_id: batch[0].row.source_id,
          start_utc: batch[0].row.start_utc,
          end_utc: batch[0].row.end_utc,
        }
      : null,
    error: {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    },
  });
}

export async function rescheduleInstance(
  id: string,
  input: {
    windowId?: string | null;
    dayTypeTimeBlockId?: string | null;
    timeBlockId?: string | null;
    overlayWindowId?: string | null;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    weightSnapshot?: number;
    energyResolved: string;
    eventName?: string | null;
    locked?: boolean;
    placementSource?: ScheduleInstance["placement_source"];
    practiceContextId?: string | null;
    metadata?: ScheduleInstance["metadata"];
  },
  client?: Client
) {
  const supabase = await ensureClient(client);
  const isDayTypeScheduling = Boolean(input.dayTypeTimeBlockId);
  const windowIdValue = input.windowId ?? null;
  const dayTypeTimeBlockIdValue = isDayTypeScheduling
    ? input.dayTypeTimeBlockId ?? null
    : null;
  const timeBlockIdValue = isDayTypeScheduling
    ? input.timeBlockId ?? input.windowId ?? null
    : null;
  const overlayWindowIdValue = input.overlayWindowId ?? null;
  const payload: Partial<ScheduleInstance> & {
    window_id?: string | null;
    overlay_window_id?: string | null;
    start_utc: string;
    end_utc: string;
    duration_min: number;
    status: ScheduleInstanceStatus;
    weight_snapshot: number;
    energy_resolved: string;
    completed_at: null;
  } = {
    window_id: windowIdValue,
    day_type_time_block_id: dayTypeTimeBlockIdValue,
    time_block_id: timeBlockIdValue,
    overlay_window_id: overlayWindowIdValue,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: "scheduled",
    weight_snapshot: input.weightSnapshot ?? 0,
    energy_resolved: input.energyResolved,
    completed_at: null,
    event_name: input.eventName ?? null,
    placement_source: input.placementSource ?? "scheduler",
  };
  if (typeof input.metadata !== "undefined") {
    payload.metadata = input.metadata ?? null;
  }
  if (typeof input.practiceContextId !== "undefined") {
    payload.practice_context_monument_id = input.practiceContextId ?? null;
  }
  if (typeof input.locked === "boolean") {
    payload.locked = input.locked;
  }
  return await supabase
    .from("schedule_instances")
    .update(payload)
    .eq("id", id)
    .select(SCHEDULER_INSTANCE_WRITE_PROJECTION)
    .single();
}

export async function updateInstanceStatus(
  id: string,
  status: "completed" | "canceled" | "scheduled",
  options?: {
    completedAtUTC?: string;
    updates?: {
      endUTC?: string;
      durationMin?: number;
    };
    allowPast?: boolean;
  },
  client?: Client
) {
  const supabase = await ensureClient(client);
  const completedAt =
    status === "completed"
      ? (options?.completedAtUTC ?? new Date().toISOString())
      : null;
  const payload: {
    status: ScheduleInstanceStatus;
    completed_at: string | null;
    end_utc?: string;
    duration_min?: number;
  } = {
    status,
    completed_at: completedAt,
  };
  if (options?.updates?.endUTC) {
    payload.end_utc = options.updates.endUTC;
  }
  if (
    typeof options?.updates?.durationMin === "number" &&
    Number.isFinite(options.updates.durationMin)
  ) {
    payload.duration_min = options.updates.durationMin;
  }
  const response = await supabase
    .from("schedule_instances")
    .update(payload)
    .eq("id", id)
    .select(
      "id, user_id, source_type, source_id, status, completed_at, start_utc, end_utc, duration_min"
    )
    .maybeSingle();

  if (!response.data) {
    log("debug", `[WRITE] id=${id} matched=0 filter={id:${id}}`);
  } else {
    const row = response.data;
    log(
      "debug",
      `[WRITE] id=${row.id} matched=1 status=${row.status} completed_at=${row.completed_at} src=${row.source_type} start=${row.start_utc} end=${row.end_utc} duration=${row.duration_min} user=${row.user_id}`
    );
    if (row.source_type === "PROJECT" && row.source_id) {
      const timestamp = new Date().toISOString();
      const projectCompletionAt =
        row.status === "completed" ? row.completed_at : null;
      const projectStage = row.status === "completed" ? "RELEASE" : "BUILD";
      const { error: projectSyncError } = await supabase
        .from("projects")
        .update({
          completed_at: projectCompletionAt,
          updated_at: timestamp,
          stage: projectStage,
        })
        .eq("id", row.source_id)
        .eq("user_id", row.user_id);
      if (projectSyncError) {
        log("error", "[PROJECT_SYNC_FAIL]", {
          instanceId: row.id,
          projectId: row.source_id,
          status: row.status,
          message: projectSyncError.message,
          code: projectSyncError.code,
        });
      } else {
        log("debug", "[PROJECT_SYNC_OK]", {
          instanceId: row.id,
          projectId: row.source_id,
          status: row.status,
          completed_at: projectCompletionAt,
          stage: projectStage,
        });
      }
    }
  }

  return response;
}

export async function updateInstanceStatusBatch(
  updates: Array<{
    id: string;
    status: "completed" | "scheduled";
    completedAtUTC?: string | null;
    allowPast?: boolean;
  }>
) {
  const response = await fetch("/api/schedule/instances/batchStatus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }
  return { status: response.status, ok: response.ok, body: bodyText };
}

export async function markProjectMissed(
  instanceId: string,
  reason?: string,
  client?: Client
) {
  const supabase = await ensureClient(client);
  const payload: Partial<ScheduleInstance> = {
    status: "missed",
    missed_reason: reason ?? null,
    start_utc: null,
    end_utc: null,
    window_id: null,
    day_type_time_block_id: null,
    time_block_id: null,
  };
  return await supabase
    .from("schedule_instances")
    .update(payload)
    .eq("id", instanceId);
}

type ProjectInstanceSyncResult = {
  updated: number;
  error: null | { message: string };
};

export async function completePendingProjectInstances(
  projectId: string,
  options?: {
    completedAtUTC?: string;
    skipInstanceIds?: string[];
  },
  client?: Client
): Promise<ProjectInstanceSyncResult> {
  const supabase = await ensureClient(client);
  const skip = new Set(
    (options?.skipInstanceIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
  );

  const { data, error } = await supabase
    .from("schedule_instances")
    .select("id")
    .eq("source_type", "PROJECT")
    .eq("source_id", projectId)
    .eq("status", "scheduled");

  if (error) {
    return {
      updated: 0,
      error: {
        message: error.message ?? "Failed to load project schedule instances",
      },
    };
  }

  const idsToUpdate = (data ?? [])
    .map((row) => row.id)
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && !skip.has(id)
    );

  if (idsToUpdate.length === 0) {
    return { updated: 0, error: null };
  }

  const completedAt = options?.completedAtUTC ?? new Date().toISOString();
  const { error: updateError } = await supabase
    .from("schedule_instances")
    .update({
      status: "completed",
      completed_at: completedAt,
    })
    .in("id", idsToUpdate);

  if (updateError) {
    return {
      updated: 0,
      error: {
        message:
          updateError.message ?? "Failed to update project schedule instances",
      },
    };
  }

  return { updated: idsToUpdate.length, error: null };
}

export async function fetchBacklogNeedingSchedule(
  userId: string,
  client?: Client
) {
  const supabase = await ensureClient(client);
  return await supabase
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "missed")
    .order("weight_snapshot", { ascending: false });
}

export async function cleanupTransientInstances(
  userId: string,
  client?: Client,
  options?: { debug?: boolean }
) {
  const supabase = await ensureClient(client);
  const query = supabase.from("schedule_instances");
  if (!query || typeof query.delete !== "function") {
    return { data: null, error: null };
  }
  if (options?.debug === true) {
    const { data, error } = await supabase
      .from("schedule_instances")
      .select("id, source_id, source_type, status, start_utc, end_utc, canceled_reason, event_name")
      .eq("user_id", userId)
      .eq("status", "canceled");

    if (error) {
      return { data: null, error };
    }

    console.log("[SCHEDULER_DEBUG_CLEANUP_TRANSIENT]", {
      event: "CLEANUP_TRANSIENT_SKIPPED_DEBUG",
      userId,
      skippedDeleteCount: data?.length ?? 0,
      rows: (data ?? []).map((row) => ({
        id: row.id ?? null,
        source_id: row.source_id ?? null,
        source_type: row.source_type ?? null,
        status: row.status ?? null,
        start_utc: row.start_utc ?? null,
        end_utc: row.end_utc ?? null,
        canceled_reason: row.canceled_reason ?? null,
        event_name: row.event_name ?? null,
      })),
    });

    return { data, error: null };
  }
  return query.delete().eq("user_id", userId).eq("status", "canceled");
}
