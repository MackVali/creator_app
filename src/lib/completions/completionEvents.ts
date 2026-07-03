import type { SupabaseClient } from "@supabase/supabase-js";

import {
  formatDateKeyInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
} from "@/lib/scheduler/timezone";
import type { Database } from "@/types/supabase";

export type CompletionSourceType =
  | "GOAL"
  | "PROJECT"
  | "TASK"
  | "HABIT"
  | "EVENT";
export type CompletionAction = "complete" | "undo";

export type CompletionEventInput = {
  action?: CompletionAction;
  sourceType?: CompletionSourceType | null;
  sourceId?: string | null;
  completedAt?: string | null;
  scheduleInstanceId?: string | null;
  wasScheduled?: boolean | null;
  durationMin?: number | null;
  timeZone?: string | null;
  productivityDayKey?: string | null;
  completionKey?: string | null;
};

type Client = SupabaseClient<Database>;

type ScheduleCompletionRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  completed_at: string | null;
  start_utc: string | null;
  end_utc: string | null;
  duration_min: number | null;
};

const COMPLETION_SOURCE_TYPES = new Set<CompletionSourceType>([
  "GOAL",
  "PROJECT",
  "TASK",
  "HABIT",
  "EVENT",
]);

export function isCompletionSchemaMissing(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  return code === "42P01" || code === "42703";
}

export function normalizeCompletionSourceType(
  value: string | null | undefined
): CompletionSourceType | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return COMPLETION_SOURCE_TYPES.has(normalized as CompletionSourceType)
    ? (normalized as CompletionSourceType)
    : null;
}

export function completionProductivityDayKey(
  completedAt: Date,
  timeZone?: string | null
) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  return formatDateKeyInTimeZone(
    startOfDayInTimeZone(completedAt, normalizedTimeZone),
    normalizedTimeZone
  );
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function deriveDurationMinutes(
  explicit: number | null | undefined,
  startIso: string | null | undefined,
  endIso: string | null | undefined
) {
  const normalized = normalizeDuration(explicit);
  if (normalized !== null) return normalized;
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

async function loadScheduleCompletion(
  client: Client,
  userId: string,
  scheduleInstanceId: string | null | undefined
) {
  if (!scheduleInstanceId) return null;
  const { data, error } = await client
    .from("schedule_instances")
    .select("id, source_type, source_id, completed_at, start_utc, end_utc, duration_min")
    .eq("id", scheduleInstanceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ScheduleCompletionRow | null;
}

async function loadSourceDuration(
  client: Client,
  userId: string,
  sourceType: CompletionSourceType,
  sourceId: string
) {
  if (sourceType === "PROJECT") {
    const { data, error } = await client
      .from("projects")
      .select("duration_min, effective_duration_min")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return (
      normalizeDuration((data as { effective_duration_min?: number | null })?.effective_duration_min) ??
      normalizeDuration((data as { duration_min?: number | null })?.duration_min)
    );
  }

  if (sourceType === "TASK") {
    const { data, error } = await client
      .from("tasks")
      .select("duration_min")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return normalizeDuration((data as { duration_min?: number | null })?.duration_min);
  }

  if (sourceType === "HABIT") {
    const { data, error } = await client
      .from("habits")
      .select("duration_minutes")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return normalizeDuration((data as { duration_minutes?: number | null })?.duration_minutes);
  }

  if (sourceType === "EVENT") {
    const { data, error } = await client
      .from("events")
      .select("start_at, end_at")
      .eq("id", sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return deriveDurationMinutes(
      null,
      (data as { start_at?: string | null })?.start_at,
      (data as { end_at?: string | null })?.end_at
    );
  }

  // Goals do not have a reliable duration source today, so leave analytics minutes empty.
  return null;
}

function buildCompletionKey({
  sourceType,
  sourceId,
  scheduleInstanceId,
  productivityDayKey,
}: {
  sourceType: CompletionSourceType;
  sourceId: string;
  scheduleInstanceId: string | null;
  productivityDayKey: string;
}) {
  if (scheduleInstanceId) {
    return `schedule:${scheduleInstanceId}`;
  }
  if (sourceType === "HABIT") {
    return `habit:${sourceId}:${productivityDayKey}`;
  }
  return `${sourceType.toLowerCase()}:${sourceId}`;
}

export async function ensureCompletionEvent({
  client,
  userId,
  input,
}: {
  client: Client;
  userId: string;
  input: CompletionEventInput;
}): Promise<{ id: string | null; completionKey: string | null }> {
  const action = input.action ?? "complete";
  const schedule = await loadScheduleCompletion(
    client,
    userId,
    input.scheduleInstanceId
  );
  const sourceType = normalizeCompletionSourceType(
    input.sourceType ?? schedule?.source_type ?? null
  );
  const sourceId = input.sourceId ?? schedule?.source_id ?? null;
  if (!sourceType || !sourceId) {
    return { id: null, completionKey: null };
  }

  const completedAtDate =
    parseDate(input.completedAt) ??
    parseDate(schedule?.completed_at) ??
    parseDate(schedule?.end_utc) ??
    new Date();
  const completedAt = completedAtDate.toISOString();
  const timeZone = normalizeTimeZone(input.timeZone);
  const productivityDayKey =
    input.productivityDayKey ??
    completionProductivityDayKey(completedAtDate, timeZone);
  const completionKey =
    input.completionKey ??
    buildCompletionKey({
      sourceType,
      sourceId,
      scheduleInstanceId: input.scheduleInstanceId ?? schedule?.id ?? null,
      productivityDayKey,
    });

  if (action === "undo") {
    const { error } = await client
      .from("completion_events")
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("completion_key", completionKey);
    if (error && !isCompletionSchemaMissing(error)) throw error;
    return { id: null, completionKey };
  }

  const durationMin =
    normalizeDuration(input.durationMin) ??
    deriveDurationMinutes(
      schedule?.duration_min ?? null,
      schedule?.start_utc ?? null,
      schedule?.end_utc ?? null
    ) ??
    (await loadSourceDuration(client, userId, sourceType, sourceId));

  const { data, error } = await client
    .from("completion_events")
    .upsert(
      {
        user_id: userId,
        source_type: sourceType,
        source_id: sourceId,
        completed_at: completedAt,
        schedule_instance_id: input.scheduleInstanceId ?? schedule?.id ?? null,
        was_scheduled:
          input.wasScheduled ??
          Boolean(input.scheduleInstanceId ?? schedule?.id),
        duration_min: durationMin,
        time_zone: timeZone,
        productivity_day_key: productivityDayKey,
        completion_key: completionKey,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,completion_key" }
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return { id: data?.id ?? null, completionKey };
}
