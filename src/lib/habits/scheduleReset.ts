import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type HabitRow = Database["public"]["Tables"]["habits"]["Row"];
type ScheduleInstanceUpdate =
  Database["public"]["Tables"]["schedule_instances"]["Update"];

export type HabitSchedulingSnapshot = Pick<
  HabitRow,
  | "name"
  | "habit_type"
  | "recurrence"
  | "recurrence_mode"
  | "recurrence_days"
  | "duration_minutes"
  | "energy"
  | "window_id"
  | "location_context_id"
  | "skill_id"
  | "next_due_override"
  | "daylight_preference"
  | "window_edge_preference"
  | "anchor_type"
  | "anchor_value"
  | "anchor_start_date"
>;

const SCHEDULING_FIELDS = [
  "name",
  "habit_type",
  "recurrence",
  "recurrence_mode",
  "recurrence_days",
  "duration_minutes",
  "energy",
  "window_id",
  "location_context_id",
  "skill_id",
  "next_due_override",
  "daylight_preference",
  "window_edge_preference",
  "anchor_type",
  "anchor_value",
  "anchor_start_date",
] as const satisfies readonly (keyof HabitSchedulingSnapshot)[];

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry)).filter(Number.isFinite);
  }
  return value ?? null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeValue(left);
  const normalizedRight = normalizeValue(right);

  if (Array.isArray(normalizedLeft) || Array.isArray(normalizedRight)) {
    if (!Array.isArray(normalizedLeft) || !Array.isArray(normalizedRight)) {
      return false;
    }
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    return normalizedLeft.every(
      (value, index) => value === normalizedRight[index]
    );
  }

  return normalizedLeft === normalizedRight;
}

export function didHabitSchedulingChange(
  previous: HabitSchedulingSnapshot | null,
  next: Partial<Record<keyof HabitSchedulingSnapshot, unknown>>
): boolean {
  if (!previous) {
    return true;
  }

  return SCHEDULING_FIELDS.some((field) => {
    if (!(field in next)) {
      return false;
    }
    return !valuesEqual(previous[field], next[field]);
  });
}

export async function cancelFutureScheduledHabitInstancesForUpdate({
  supabase,
  userId,
  habitId,
  now = new Date(),
}: {
  supabase: SupabaseClient<Database>;
  userId: string;
  habitId: string;
  now?: Date;
}): Promise<void> {
  const updatePayload: ScheduleInstanceUpdate = {
    status: "canceled",
    canceled_reason: "habit_updated",
    updated_at: now.toISOString(),
  };

  const { error } = await supabase
    .from("schedule_instances")
    .update(updatePayload)
    .eq("user_id", userId)
    .eq("source_type", "HABIT")
    .eq("source_id", habitId)
    .eq("status", "scheduled")
    .gte("start_utc", now.toISOString());

  if (error) {
    throw error;
  }
}
