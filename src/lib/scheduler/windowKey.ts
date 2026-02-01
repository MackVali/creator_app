import { safeDate } from "./safeDate";

type MaybeDateLike = Date | string | number | null | undefined;

function parseMs(value?: MaybeDateLike): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === "string" && value.length > 0) {
    const date = safeDate(value);
    if (date) {
      return date.getTime();
    }
  }
  return null;
}

export type AvailabilityWindowDescriptor = {
  dayTypeTimeBlockId?: string | null;
  day_type_time_block_id?: string | null;
  windowId?: string | null;
  window_id?: string | null;
  timeBlockId?: string | null;
  time_block_id?: string | null;
  id?: string | null;
  startLocal?: MaybeDateLike;
  endLocal?: MaybeDateLike;
  start?: MaybeDateLike;
  end?: MaybeDateLike;
  startUtc?: MaybeDateLike;
  endUtc?: MaybeDateLike;
  startMs?: number | null;
  endMs?: number | null;
};

export function getAvailabilityWindowKey(
  window: AvailabilityWindowDescriptor
): string {
  const dayTypeId =
    window.dayTypeTimeBlockId ?? window.day_type_time_block_id ?? null;
  if (dayTypeId) return dayTypeId;

  const windowId =
    window.windowId ?? window.window_id ?? window.id ?? null;
  if (windowId) return windowId;

  const timeBlockId =
    window.timeBlockId ?? window.time_block_id ?? null;
  if (timeBlockId) return timeBlockId;

  const startMs =
    window.startMs ??
    parseMs(window.startLocal ?? window.start ?? window.startUtc);
  const endMs =
    window.endMs ?? parseMs(window.endLocal ?? window.end ?? window.endUtc);

  if (startMs !== null && endMs !== null) {
    return `${startMs}-${endMs}`;
  }

  const safeStart = startMs ?? 0;
  const safeEnd = endMs ?? 0;
  const fallbackPrefix = windowId ?? timeBlockId ?? "availability";
  return `${fallbackPrefix}-${safeStart}-${safeEnd}`;
}
