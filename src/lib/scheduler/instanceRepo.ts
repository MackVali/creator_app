import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "../../../types/supabase";
import type { FlameLevel } from "@/components/FlameEmber";
import type { WindowLite as RepoWindow } from "@/lib/scheduler/repo";
import { safeDate } from "@/lib/scheduler/safeDate";

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

export function computeDurationMin(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 60000);
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
  client?: Client
) {
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

  return await base
    .or(
      `and(start_utc.gte.${startParam},start_utc.lt.${endParam}),and(start_utc.lt.${startParam},end_utc.gt.${startParam})`
    )
    .order("start_utc", { ascending: true });
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
  input: {
    userId: string;
    sourceId: string;
    sourceType: ScheduleInstance["source_type"];
    windowId?: string | null;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    weightSnapshot?: number;
    energyResolved: string;
    eventName?: string | null;
    locked?: boolean;
    practiceContextId?: string | null;
  },
  client?: Client
) {
  const hasStart = typeof input.startUTC === "string" && input.startUTC.length > 0;
  const hasEnd = typeof input.endUTC === "string" && input.endUTC.length > 0;
  const hasDuration =
    typeof input.durationMin === "number" && Number.isFinite(input.durationMin);
  if ((hasStart || hasEnd || hasDuration) && !(hasStart && hasEnd && hasDuration)) {
    throw new Error("createInstance payload missing startUTC/endUTC/durationMin");
  }
  const supabase = await ensureClient(client);
  const { data, error } = await supabase
    .from("schedule_instances")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      source_id: input.sourceId,
      window_id: input.windowId ?? null,
      start_utc: input.startUTC,
      end_utc: input.endUTC,
      duration_min: input.durationMin,
      status: "scheduled",
      weight_snapshot: input.weightSnapshot ?? 0,
      energy_resolved: input.energyResolved,
      locked: input.locked ?? false,
      event_name: input.eventName ?? null,
      practice_context_monument_id: input.practiceContextId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    const payload = {
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
      scheduled_at: null,
    };
    console.log("[CREATE_INSTANCE_FAIL]", {
      payload,
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

export async function rescheduleInstance(
  id: string,
  input: {
    windowId?: string | null;
    startUTC: string;
    endUTC: string;
    durationMin: number;
    weightSnapshot?: number;
    energyResolved: string;
    eventName?: string | null;
    locked?: boolean;
    practiceContextId?: string | null;
  },
  client?: Client
) {
  const supabase = await ensureClient(client);
  const payload: Partial<ScheduleInstance> & {
    window_id?: string | null;
    start_utc: string;
    end_utc: string;
    duration_min: number;
    status: ScheduleInstanceStatus;
    weight_snapshot: number;
    energy_resolved: string;
    completed_at: null;
  } = {
    window_id: input.windowId ?? null,
    start_utc: input.startUTC,
    end_utc: input.endUTC,
    duration_min: input.durationMin,
    status: "scheduled",
    weight_snapshot: input.weightSnapshot ?? 0,
    energy_resolved: input.energyResolved,
    completed_at: null,
    event_name: input.eventName ?? null,
  };
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
    .select("*")
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
  },
  client?: Client
) {
  const supabase = await ensureClient(client);
  const completedAt =
    status === "completed"
      ? options?.completedAtUTC ?? new Date().toISOString()
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
  return await supabase.from("schedule_instances").update(payload).eq("id", id);
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
    duration_min: null,
    window_id: null,
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
  client?: Client
) {
  const supabase = await ensureClient(client);
  const query = supabase.from("schedule_instances");
  if (!query || typeof query.delete !== "function") {
    return { data: null, error: null };
  }
  return query.delete().eq("user_id", userId).eq("status", "canceled");
}
