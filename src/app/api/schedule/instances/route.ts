import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database, Json } from "@/types/supabase";
import { enforceManualProjectGoalState } from "@/lib/scheduler/manualPlacementCascade";
import { formatLocalDateKey } from "@/lib/time/tz";

type ScheduleInstanceInsert =
  Database["public"]["Tables"]["schedule_instances"]["Insert"];
type ManualSourceType =
  Database["public"]["Enums"]["schedule_instance_source_type"];
type ManualInstanceCreateResult =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
type ScheduleInstancesTable = {
  insert: (values: ScheduleInstanceInsert) => {
    select: (columns: string) => {
      single: () => Promise<{
        data: ManualInstanceCreateResult | null;
        error: {
          message: string;
          details: string | null;
          hint: string | null;
          code: string | null;
        } | null;
      }>;
    };
  };
};

type CreateManualInstancePayload = {
  sourceType?: unknown;
  source_type?: unknown;
  sourceId?: unknown;
  source_id?: unknown;
  startUtc?: unknown;
  start_utc?: unknown;
  durationMin?: unknown;
  duration_min?: unknown;
  energyResolved?: unknown;
  energy_resolved?: unknown;
  eventName?: unknown;
  event_name?: unknown;
  timeZone?: unknown;
  timezone?: unknown;
  metadata?: unknown;
  timeBlockId?: unknown;
  time_block_id?: unknown;
  windowId?: unknown;
  window_id?: unknown;
  dayTypeTimeBlockId?: unknown;
  day_type_time_block_id?: unknown;
  overlayWindowId?: unknown;
  overlay_window_id?: unknown;
};

const MANUAL_SOURCE_TYPES = new Set<ManualSourceType>([
  "PROJECT",
  "HABIT",
  "TASK",
  "EVENT",
]);

const MANUAL_INSTANCE_CREATE_PROJECTION = [
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

function normalizeSourceType(value: unknown): ManualSourceType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return MANUAL_SOURCE_TYPES.has(normalized as ManualSourceType)
    ? (normalized as ManualSourceType)
    : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

function normalizeMetadata(value: unknown): Json | null {
  return typeof value === "object" && value !== undefined
    ? (value as Json)
    : null;
}

function getPayloadValue(
  payload: CreateManualInstancePayload | null,
  primaryKey: keyof CreateManualInstancePayload,
  fallbackKey: keyof CreateManualInstancePayload
) {
  return payload?.[primaryKey] ?? payload?.[fallbackKey] ?? null;
}

export async function POST(request: NextRequest) {
  const supabase =
    (await createSupabaseServerClient()) as SupabaseClient<Database> | null;
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client unavailable" },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | CreateManualInstancePayload
    | null;
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid manual Event request body" },
      { status: 400 }
    );
  }

  const sourceType = normalizeSourceType(
    getPayloadValue(payload, "sourceType", "source_type")
  );
  const sourceId = normalizeString(
    getPayloadValue(payload, "sourceId", "source_id")
  );
  const startUtc = normalizeString(
    getPayloadValue(payload, "startUtc", "start_utc")
  );
  const durationMin = normalizeDuration(
    getPayloadValue(payload, "durationMin", "duration_min")
  );
  const invalidFields = [
    !sourceType ? "sourceType" : null,
    !sourceId && sourceType !== "EVENT" ? "sourceId" : null,
    !startUtc ? "startUtc" : null,
    !durationMin ? "durationMin" : null,
  ].filter((field): field is string => field !== null);

  if (invalidFields.length > 0) {
    return NextResponse.json(
      {
        error: "Invalid manual Event placement request",
        message: `Missing or invalid manual Event fields: ${invalidFields.join(
          ", "
        )}`,
        invalidFields,
      },
      { status: 400 }
    );
  }

  const parsedStart = new Date(startUtc);
  if (Number.isNaN(parsedStart.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }

  if (sourceType === "PROJECT") {
    const goalStateResult = await enforceManualProjectGoalState({
      userId: user.id,
      client: supabase,
      projectId: sourceId,
    });
    if (!goalStateResult.ok) {
      return NextResponse.json(goalStateResult.blockingError, { status: 409 });
    }
  }

  const nextStartIso = parsedStart.toISOString();
  const nextEndIso = new Date(
    parsedStart.getTime() + durationMin * 60_000
  ).toISOString();
  const energyResolved =
    normalizeString(
      getPayloadValue(payload, "energyResolved", "energy_resolved")
    ) ?? "NO";
  const eventName = normalizeString(
    getPayloadValue(payload, "eventName", "event_name")
  );
  const timeZone =
    normalizeString(getPayloadValue(payload, "timeZone", "timezone")) ?? "UTC";
  const metadata = normalizeMetadata(payload.metadata);
  const timeBlockId = normalizeString(
    getPayloadValue(payload, "timeBlockId", "time_block_id")
  );
  const windowId = normalizeString(
    getPayloadValue(payload, "windowId", "window_id")
  );
  const dayTypeTimeBlockId = normalizeString(
    getPayloadValue(payload, "dayTypeTimeBlockId", "day_type_time_block_id")
  );
  const overlayWindowId = normalizeString(
    getPayloadValue(payload, "overlayWindowId", "overlay_window_id")
  );
  let resolvedSourceId = sourceId;

  if (sourceType === "EVENT" && !resolvedSourceId) {
    const title = eventName ?? "Untitled Event";
    const eventId = crypto.randomUUID();
    const { error: eventError } = await supabase
      .from("events")
      .insert({
        id: eventId,
        user_id: user.id,
        title,
        notes: null,
        kind: "EVENT",
        all_day: false,
        start_at: nextStartIso,
        end_at: nextEndIso,
        timezone: timeZone,
        start_date: formatLocalDateKey(parsedStart, timeZone),
        end_date: formatLocalDateKey(new Date(nextEndIso), timeZone),
        recurrence: "NONE",
        location_name: null,
        location_address: null,
        meeting_provider: null,
        meeting_url: null,
        blocks_time: "DEFAULT",
        visibility: "PRIVATE",
        notification_timing: "NONE",
      });

    if (eventError) {
      return NextResponse.json(
        {
          error: "Unable to create manual Event",
          message: eventError.message,
          details: eventError.details,
          hint: eventError.hint,
          code: eventError.code,
        },
        { status: 500 }
      );
    }

    resolvedSourceId = eventId;
  }

  const insertPayload: ScheduleInstanceInsert = {
    user_id: user.id,
    source_type: sourceType,
    source_id: resolvedSourceId,
    start_utc: nextStartIso,
    end_utc: nextEndIso,
    duration_min: durationMin,
    status: "scheduled",
    locked: true,
    placement_source: "manual",
    window_id: windowId,
    day_type_time_block_id: dayTypeTimeBlockId,
    time_block_id: timeBlockId,
    overlay_window_id: overlayWindowId,
    practice_context_monument_id: null,
    metadata,
    weight_snapshot: 0,
    energy_resolved: energyResolved,
    event_name: eventName,
  };

  const scheduleInstances = supabase.from(
    "schedule_instances"
  ) as unknown as ScheduleInstancesTable;
  const { data, error } = await scheduleInstances
    .insert(insertPayload)
    .select(MANUAL_INSTANCE_CREATE_PROJECTION)
    .single();

  if (error) {
    console.error("Manual schedule instance create error", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      insertShape: {
        source_type: insertPayload.source_type,
        source_id: insertPayload.source_id,
        start_utc: insertPayload.start_utc,
        end_utc: insertPayload.end_utc,
        duration_min: insertPayload.duration_min,
        placement_source: insertPayload.placement_source,
        locked: insertPayload.locked,
        event_name: insertPayload.event_name,
        metadataKeys:
          insertPayload.metadata && typeof insertPayload.metadata === "object"
            ? Object.keys(insertPayload.metadata as Record<string, unknown>)
            : [],
      },
    });
    return NextResponse.json(
      {
        error: "Unable to create manual Event",
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    instance: data,
    eventId: sourceType === "EVENT" ? resolvedSourceId : null,
    startUtc: nextStartIso,
    endUtc: nextEndIso,
  });
}
