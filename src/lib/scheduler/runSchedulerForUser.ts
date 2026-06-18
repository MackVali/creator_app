import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "../../../types/supabase";
import { markMissedAndQueue, scheduleBacklog } from "./reschedule";
import type { SchedulerModePayload } from "./modes";
import type { GeoCoordinates } from "./sunlight";
import {
  elapsedMs,
  schedulerNowMs,
  type SchedulerTiming,
} from "./timing";

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
  timing?: SchedulerTiming | null;
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
  client: Client,
  timing?: SchedulerTiming | null
): Promise<ResetResult> {
  const startedAt = schedulerNowMs();
  const { data: instancesToMiss, error: fetchError } = await client
    .from("schedule_instances")
    .select("id")
    .eq("user_id", userId)
    .eq("source_type", "PROJECT")
    .eq("status", "scheduled")
    .eq("locked", false);

  if (fetchError) {
    if (timing) {
      timing.runner.resetUnlockedProjects.ms += elapsedMs(startedAt);
    }
    return { count: null, error: fetchError };
  }

  const instanceIds = (instancesToMiss ?? [])
    .map((instance) => instance.id)
    .filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );

  if (instanceIds.length === 0) {
    if (timing) {
      timing.runner.resetUnlockedProjects.ms += elapsedMs(startedAt);
      timing.runner.resetUnlockedProjects.fetched = 0;
      timing.runner.resetUnlockedProjects.updated = 0;
    }
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
    if (timing) {
      timing.runner.resetUnlockedProjects.ms += elapsedMs(startedAt);
      timing.runner.resetUnlockedProjects.fetched = instanceIds.length;
      timing.runner.resetUnlockedProjects.updated = null;
    }
    return { count: null, error: updateError };
  }

  if (timing) {
    timing.runner.resetUnlockedProjects.ms += elapsedMs(startedAt);
    timing.runner.resetUnlockedProjects.fetched = instanceIds.length;
    timing.runner.resetUnlockedProjects.updated = instanceIds.length;
  }
  return { count: instanceIds.length, error: null };
}

export async function runSchedulerForUser(
  userId: string,
  now: Date,
  client: Client,
  options?: RunSchedulerOptions
): Promise<RunSchedulerResult> {
  const timing = options?.timing ?? null;
  const runnerStartedAt = schedulerNowMs();
  try {
  const reset = await resetUnlockedScheduledProjectInstances(
    userId,
    now,
    client,
    timing
  );

  if (reset.error) {
    return { reset: { count: null, error: reset.error } };
  }

  const markStartedAt = schedulerNowMs();
  const markResult = await markMissedAndQueue(userId, now, client);
  if (timing) {
    timing.runner.markMissed.ms += elapsedMs(markStartedAt);
    timing.runner.markMissed.affected = markResult.count ?? null;
  }
  if (markResult.error) {
    console.warn("[SCHEDULER] markMissedAndQueue failed", markResult.error);
  }

  const scheduleStartedAt = schedulerNowMs();
  const scheduleResult = await scheduleBacklog(userId, now, client, {
    timeZone: options?.timeZone,
    location: options?.location,
    utcOffsetMinutes: options?.utcOffsetMinutes,
    mode: options?.mode,
    writeThroughDays: options?.writeThroughDays,
    writeThroughDaysOverride: options?.writeThroughDaysOverride,
    debug: options?.debug,
    parity: options?.parity,
    timing,
  });
  if (timing) {
    timing.runner.scheduleBacklog.ms += elapsedMs(scheduleStartedAt);
  }

  return {
    reset: { count: reset.count ?? 0, error: null },
    marked: {
      count: markResult.count ?? null,
      error: markResult.error ?? null,
    },
    schedule: scheduleResult,
  };
  } finally {
    if (timing) {
      timing.runner.totalMs += elapsedMs(runnerStartedAt);
    }
  }
}

export async function runSchedulerOverlayForUser(
  _userId: string,
  now: Date,
  _client: Client,
  options: RunSchedulerOptions & { overlayWindowId: string }
): Promise<RunSchedulerResult> {
  const timing = options.timing ?? null;
  const runnerStartedAt = schedulerNowMs();
  try {
  const overlayWindowId = options.overlayWindowId.trim();

  // TODO: Implement narrow Dynamic Overlay candidate placement for this
  // overlay window. This Phase 1 runner is intentionally a no-op so OVERLAY
  // requests do not reset unlocked project instances or invoke scheduleBacklog.
  return {
    reset: { count: 0, error: null },
    marked: { count: null, error: null },
    schedule: {
      placed: [],
      failures: [
        {
          itemId: overlayWindowId,
          reason: "OVERLAY_NOT_IMPLEMENTED",
          detail: {
            message:
              "Overlay scheduler mode is recognized, but narrow overlay placement is not implemented yet.",
            overlayWindowId,
            localTimeIso: now.toISOString(),
            timeZone: options.timeZone ?? null,
            utcOffsetMinutes: options.utcOffsetMinutes ?? null,
          },
        },
      ],
      error: null,
      timeline: [],
      debug: [],
      hasPastInstanceSkipped: false,
      paritySummary:
        options.parity === true
          ? {
              parityChecksRun: 0,
              mismatches: 0,
              firstMismatchContext: null,
            }
          : null,
    },
  };
  } finally {
    if (timing) {
      timing.runner.totalMs += elapsedMs(runnerStartedAt);
    }
  }
}
