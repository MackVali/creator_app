import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateKeyInTimeZone, normalizeTimeZone } from "@/lib/scheduler/timezone";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;
type ScheduleInstanceObservationRow = Pick<
  Database["public"]["Tables"]["schedule_instances"]["Row"],
  | "id"
  | "user_id"
  | "source_type"
  | "source_id"
  | "status"
  | "start_utc"
  | "end_utc"
  | "duration_min"
  | "time_block_id"
  | "day_type_time_block_id"
  | "window_id"
>;
type ObservedInstanceInsert =
  Database["public"]["Tables"]["daily_schedule_analytics_observed_instances"]["Insert"];
type ObservedInstanceRow =
  Database["public"]["Tables"]["daily_schedule_analytics_observed_instances"]["Row"];

type ObservedScheduleWindowInput = {
  timezone: string;
  dayKey?: string;
  dayStartUtc: string | Date;
  dayEndUtc: string | Date;
};

type UpsertObservedScheduleInstancesInput = ObservedScheduleWindowInput & {
  userId: string;
  scheduleInstances: ScheduleInstanceObservationRow[];
  client?: Client | null;
};

function toIsoString(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid observed schedule window timestamp");
  }
  return date.toISOString();
}

function hasRealObservedPlacementWindow(instance: ScheduleInstanceObservationRow) {
  return (
    Number.isFinite(new Date(instance.start_utc ?? "").getTime()) &&
    Number.isFinite(new Date(instance.end_utc ?? "").getTime())
  );
}

function mapObservedAnalyticsStatus(
  instance: ScheduleInstanceObservationRow
): ObservedInstanceInsert["observed_status"] {
  if (instance.status === "completed") {
    return "completed";
  }

  if (hasRealObservedPlacementWindow(instance)) {
    return "scheduled";
  }

  return null;
}

function buildObservedInstanceInsert(
  userId: string,
  dayKey: string,
  window: { timezone: string; dayStartUtc: string; dayEndUtc: string },
  instance: ScheduleInstanceObservationRow
): ObservedInstanceInsert {
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    day_key: dayKey,
    timezone: window.timezone,
    day_start_utc: window.dayStartUtc,
    day_end_utc: window.dayEndUtc,
    schedule_instance_id: instance.id,
    source_type: instance.source_type,
    source_id: instance.source_id,
    scheduled_start_utc: instance.start_utc,
    scheduled_end_utc: instance.end_utc,
    duration_min: instance.duration_min,
    time_block_id: instance.time_block_id,
    day_type_time_block_id: instance.day_type_time_block_id,
    window_id: instance.window_id,
    observed_status: mapObservedAnalyticsStatus(instance),
  };
}

export async function upsertObservedScheduleInstances(
  input: UpsertObservedScheduleInstancesInput
) {
  const scheduleInstances = input.scheduleInstances.filter(
    (instance): instance is ScheduleInstanceObservationRow =>
      Boolean(instance?.id) && instance.user_id === input.userId
  );
  if (scheduleInstances.length === 0) {
    return { count: 0 };
  }

  const client = input.client ?? createAdminClient();
  if (!client) {
    throw new Error("Supabase admin client unavailable");
  }

  const timezone = normalizeTimeZone(input.timezone);
  const dayStartUtc = toIsoString(input.dayStartUtc);
  const dayEndUtc = toIsoString(input.dayEndUtc);
  const dayKey =
    typeof input.dayKey === "string" && input.dayKey.trim().length > 0
      ? input.dayKey.trim()
      : formatDateKeyInTimeZone(new Date(dayStartUtc), timezone);
  const instanceIds = scheduleInstances.map((instance) => instance.id);

  const { data: existingRows, error: existingError } = await client
    .from("daily_schedule_analytics_observed_instances")
    .select("*")
    .eq("user_id", input.userId)
    .eq("day_key", dayKey)
    .in("schedule_instance_id", instanceIds);

  if (existingError) {
    throw existingError;
  }

  const existingByInstanceId = new Map<string, ObservedInstanceRow>();
  for (const row of existingRows ?? []) {
    existingByInstanceId.set(row.schedule_instance_id, row);
  }

  const nowIso = new Date().toISOString();
  const rows: ObservedInstanceInsert[] = scheduleInstances.map((instance) => {
    const base = buildObservedInstanceInsert(
      input.userId,
      dayKey,
      { timezone, dayStartUtc, dayEndUtc },
      instance
    );
    const existing = existingByInstanceId.get(instance.id);
    if (!existing) {
      return base;
    }

    return {
      ...base,
      id: existing.id,
      first_observed_at: existing.first_observed_at,
      last_observed_at: nowIso,
      observation_count: existing.observation_count + 1,
      scheduled_start_utc:
        existing.scheduled_start_utc ?? base.scheduled_start_utc ?? null,
      scheduled_end_utc:
        existing.scheduled_end_utc ?? base.scheduled_end_utc ?? null,
    };
  });

  const { error } = await client
    .from("daily_schedule_analytics_observed_instances")
    .upsert(rows, {
      onConflict: "user_id,day_key,schedule_instance_id",
      ignoreDuplicates: false,
    });

  if (error) {
    throw error;
  }

  return { count: rows.length };
}
