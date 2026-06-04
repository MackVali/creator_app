import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";
import { markMissedAndQueue, scheduleBacklog } from "./reschedule";
import type { SchedulerModePayload } from "./modes";
import type { GeoCoordinates } from "./sunlight";

type Client = SupabaseClient<Database>;

type ResetResult = {
  count: number | null;
  error: PostgrestError | null;
};

type MarkResult = {
  count: number | null;
  error: PostgrestError | null;
};

export type RunSchedulerOptions = {
  timeZone?: string | null;
  location?: GeoCoordinates | null;
  utcOffsetMinutes?: number | null;
  mode?: SchedulerModePayload | null;
  writeThroughDays?: number | null;
  writeThroughDaysOverride?: number | null;
  debug?: boolean | null;
  parity?: boolean | null;
};

type RunSchedulerSuccess = {
  reset: { count: number; error: null };
  marked: MarkResult;
  schedule: Awaited<ReturnType<typeof scheduleBacklog>>;
};

type RunSchedulerResetError = {
  reset: { count: null; error: PostgrestError };
};

export type RunSchedulerResult = RunSchedulerSuccess | RunSchedulerResetError;

export async function resetUnlockedScheduledProjectInstances(
  userId: string,
  now: Date,
  client: Client
): Promise<ResetResult> {
  const { data: instancesToMiss, error: fetchError } = await client
    .from("schedule_instances")
    .select("id")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT")
    .eq("status", "scheduled")
    .eq("locked", false);

  if (fetchError) {
    return { count: null, error: fetchError };
  }

  const instanceIds = (instancesToMiss ?? [])
    .map((instance) => instance.id)
    .filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );

  if (instanceIds.length === 0) {
    return { count: 0, error: null };
  }

  const { error: updateError } = await client
    .from("schedule_instances")
    .update({
      status: "unscheduled",
      start_utc: null,
      end_utc: null,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
      updated_at: now,
    })
    .in("id", instanceIds);

  if (updateError) {
    return { count: null, error: updateError };
  }

  return { count: instanceIds.length, error: null };
}

export async function runSchedulerForUser(
  userId: string,
  now: Date,
  client: Client,
  options?: RunSchedulerOptions
): Promise<RunSchedulerResult> {
  const reset = await resetUnlockedScheduledProjectInstances(
    userId,
    now,
    client
  );

  if (reset.error) {
    return { reset: { count: null, error: reset.error } };
  }

  const markResult = await markMissedAndQueue(userId, now, client);
  if (markResult.error) {
    console.warn("[SCHEDULER] markMissedAndQueue failed", markResult.error);
  }

  const scheduleResult = await scheduleBacklog(userId, now, client, {
    timeZone: options?.timeZone,
    location: options?.location,
    utcOffsetMinutes: options?.utcOffsetMinutes,
    mode: options?.mode,
    writeThroughDays: options?.writeThroughDays,
    writeThroughDaysOverride: options?.writeThroughDaysOverride,
    debug: options?.debug,
    parity: options?.parity,
  });

  return {
    reset: { count: reset.count ?? 0, error: null },
    marked: {
      count: markResult.count ?? null,
      error: markResult.error ?? null,
    },
    schedule: scheduleResult,
  };
}
