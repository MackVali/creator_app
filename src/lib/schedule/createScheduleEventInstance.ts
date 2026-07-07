import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { formatLocalDateKey } from "@/lib/time/tz";

type ScheduleInstanceInsert =
  Database["public"]["Tables"]["schedule_instances"]["Insert"];
type ScheduleInstanceRow =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
type PostgrestLikeError = {
  message: string;
  details: string | null;
  hint: string | null;
  code: string | null;
};
type ScheduleInstancesTable = {
  insert: (values: ScheduleInstanceInsert) => {
    select: (columns: string) => {
      single: () => Promise<{
        data: ScheduleInstanceRow | null;
        error: PostgrestLikeError | null;
      }>;
    };
  };
};

export const MANUAL_INSTANCE_CREATE_PROJECTION = [
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

export type CreateScheduleEventInstanceInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  title: string;
  start: Date;
  startUtc: string;
  endUtc: string;
  durationMin: number;
  timezone: string;
  notes?: string | null;
  energyResolved: string;
  eventName: string | null;
  metadata: Json | null;
  timeBlockId: string | null;
  windowId: string | null;
  dayTypeTimeBlockId: string | null;
  overlayWindowId: string | null;
};

export type CreateScheduleEventInstanceResult = {
  instance: ScheduleInstanceRow;
  eventId: string;
};

export async function createScheduleEventInstance({
  supabase,
  userId,
  title,
  start,
  startUtc,
  endUtc,
  durationMin,
  timezone,
  notes = null,
  energyResolved,
  eventName,
  metadata,
  timeBlockId,
  windowId,
  dayTypeTimeBlockId,
  overlayWindowId,
}: CreateScheduleEventInstanceInput): Promise<CreateScheduleEventInstanceResult> {
  const eventId = crypto.randomUUID();
  const { error: eventError } = await supabase.from("events").insert({
    id: eventId,
    user_id: userId,
    title,
    notes,
    kind: "EVENT",
    all_day: false,
    start_at: startUtc,
    end_at: endUtc,
    timezone,
    start_date: formatLocalDateKey(start, timezone),
    end_date: formatLocalDateKey(new Date(endUtc), timezone),
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
    throw eventError;
  }

  const insertPayload: ScheduleInstanceInsert = {
    user_id: userId,
    source_type: "EVENT",
    source_id: eventId,
    start_utc: startUtc,
    end_utc: endUtc,
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

    const { error: cleanupError } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", userId);

    if (cleanupError) {
      console.error("Manual event cleanup after instance create error failed", {
        eventId,
        userId,
        message: cleanupError.message,
        details: cleanupError.details,
        hint: cleanupError.hint,
        code: cleanupError.code,
      });
    }

    throw error;
  }

  if (!data) {
    throw new Error("Manual schedule instance create returned no data");
  }

  return {
    instance: data,
    eventId,
  };
}
