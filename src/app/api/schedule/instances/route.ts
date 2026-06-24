import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Database } from "@/types/supabase";
import { enforceManualProjectGoalState } from "@/lib/scheduler/manualPlacementCascade";

type ScheduleInstanceInsert =
  Database["public"]["Tables"]["schedule_instances"]["Insert"];
type ManualSourceType =
  Database["public"]["Enums"]["schedule_instance_source_type"];
type ManualInstanceCreateResult = {
  id: string;
  start_utc: string | null;
  end_utc: string | null;
  duration_min: number;
  locked: boolean;
  placement_source: "scheduler" | "manual";
};
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
};

const MANUAL_SOURCE_TYPES = new Set<ManualSourceType>([
  "PROJECT",
  "HABIT",
  "TASK",
]);

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
    !sourceId ? "sourceId" : null,
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

  const insertPayload: ScheduleInstanceInsert = {
    user_id: user.id,
    source_type: sourceType,
    source_id: sourceId,
    start_utc: nextStartIso,
    end_utc: nextEndIso,
    duration_min: durationMin,
    status: "scheduled",
    locked: true,
    placement_source: "manual",
    window_id: null,
    day_type_time_block_id: null,
    time_block_id: null,
    overlay_window_id: null,
    practice_context_monument_id: null,
    metadata: null,
    weight_snapshot: 0,
    energy_resolved: energyResolved,
    event_name: eventName,
  };

  const scheduleInstances = supabase.from(
    "schedule_instances"
  ) as unknown as ScheduleInstancesTable;
  const { data, error } = await scheduleInstances
    .insert(insertPayload)
    .select("id,start_utc,end_utc,duration_min,locked,placement_source")
    .single();

  if (error) {
    console.error("Manual schedule instance create error", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
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
    startUtc: nextStartIso,
    endUtc: nextEndIso,
  });
}
