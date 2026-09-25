import type { Json } from "@/types/supabase";

export type EventScheduleInstanceLike = {
  source_type?: string | null;
  source_id?: string | null;
  metadata?: Json | null;
} | null | undefined;

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function isLinkedEventScheduleInstance(
  instance: EventScheduleInstanceLike
) {
  return (
    normalizeString(instance?.source_type)?.toUpperCase() === "EVENT" &&
    Boolean(normalizeString(instance?.source_id))
  );
}

export function isInteractiveEventScheduleInstance(
  instance: EventScheduleInstanceLike
) {
  return isLinkedEventScheduleInstance(instance);
}
