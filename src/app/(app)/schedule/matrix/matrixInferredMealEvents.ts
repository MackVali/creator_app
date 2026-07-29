import { normalizeBlockType } from "@/lib/scheduler/repo";
import type { CreatorNutritionLogContext } from "@/lib/nutrition/logEvents";
import type { Json } from "@/types/supabase";

export type MatrixMealTimeBlockWindow = {
  id: string;
  sourceWindowId?: string | null;
  label?: string | null;
  start_local?: string | null;
  end_local?: string | null;
  dayTypeStartUtcMs?: number | null;
  dayTypeEndUtcMs?: number | null;
  window_kind?: string | null;
  block_type?: string | null;
  blockType?: string | null;
  dayTypeTimeBlockId?: string | null;
  day_type_time_block_id?: string | null;
  timeBlockId?: string | null;
  time_block_id?: string | null;
  window_id?: string | null;
};

export type MatrixMealScheduleInstance = {
  id: string;
  source_type: string | null;
  time_block_id?: string | null;
  day_type_time_block_id?: string | null;
  window_id?: string | null;
};

export type MatrixNutritionMealCompletionRow = {
  id: string;
  occurred_at?: string | null;
  created_at?: string | null;
  metadata?: Json | null;
  deleted_at?: string | null;
};

export type MatrixInferredMealEventData = {
  syntheticEventId: string;
  title: string;
  timeBlockId: string | null;
  dayTypeTimeBlockId: string | null;
  windowId: string | null;
  dateKey: string;
  startUtc: string;
  endUtc: string;
  startLocal: string | null;
  endLocal: string | null;
  durationMinutes: number | null;
  completed: boolean;
  completedAt: string | null;
  completedMealId: string | null;
};

export type MatrixScheduledMealEventData = {
  scheduleInstanceId: string;
  eventId: string | null;
  title: string;
  timeBlockId: string | null;
  dayTypeTimeBlockId: string | null;
  windowId: string | null;
  dateKey: string;
  startUtc: string;
  endUtc: string;
  startLocal: string | null;
  endLocal: string | null;
};

const MATRIX_INFERRED_MEAL_SOURCE = "matrix-inferred-meal";
const MATRIX_SCHEDULED_MEAL_SOURCE = "matrix-scheduled-meal";
const MATRIX_INFERRED_MEAL_PREFIX = "matrix-inferred-meal";

function trimmed(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

export function normalizeMatrixMealTimeBlockKind(
  window: Pick<
    MatrixMealTimeBlockWindow,
    "window_kind" | "block_type" | "blockType"
  >
) {
  return normalizeBlockType(
    window.window_kind ?? window.block_type ?? window.blockType ?? null
  );
}

export function isMatrixMealTimeBlock(window: MatrixMealTimeBlockWindow) {
  return normalizeMatrixMealTimeBlockKind(window) === "MEAL";
}

function getWindowDayTypeTimeBlockId(window: MatrixMealTimeBlockWindow) {
  return trimmed(
    window.dayTypeTimeBlockId ?? window.day_type_time_block_id ?? null
  );
}

function getWindowSourceTimeBlockId(window: MatrixMealTimeBlockWindow) {
  return trimmed(
    window.timeBlockId ??
      window.time_block_id ??
      window.sourceWindowId ??
      window.id
  );
}

function getWindowId(window: MatrixMealTimeBlockWindow) {
  return trimmed(window.window_id ?? (!getWindowDayTypeTimeBlockId(window) ? window.id : null));
}

function getWindowStartMs(window: MatrixMealTimeBlockWindow) {
  const value = window.dayTypeStartUtcMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getWindowEndMs(window: MatrixMealTimeBlockWindow) {
  const value = window.dayTypeEndUtcMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildMatrixInferredMealEventId(
  window: MatrixMealTimeBlockWindow,
  dateKey: string
) {
  const dayTypeTimeBlockId = getWindowDayTypeTimeBlockId(window);
  const timeBlockId = getWindowSourceTimeBlockId(window);
  const identity = dayTypeTimeBlockId ?? timeBlockId ?? window.id;
  const startPart = getWindowStartMs(window) ?? window.start_local ?? "start";
  return `${MATRIX_INFERRED_MEAL_PREFIX}:${dateKey}:${identity}:${startPart}`;
}

export function isActualScheduledMealEventInTimeBlock(
  instance: MatrixMealScheduleInstance,
  window: MatrixMealTimeBlockWindow
) {
  if (instance.source_type?.trim().toUpperCase() !== "EVENT") return false;

  const dayTypeTimeBlockId = getWindowDayTypeTimeBlockId(window);
  if (
    dayTypeTimeBlockId &&
    instance.day_type_time_block_id === dayTypeTimeBlockId
  ) {
    return true;
  }

  const timeBlockId = getWindowSourceTimeBlockId(window);
  if (timeBlockId && instance.time_block_id === timeBlockId) {
    return true;
  }

  const windowId = getWindowId(window);
  return Boolean(windowId && instance.window_id === windowId);
}

export function findActualScheduledMealTimeBlock(
  instance: MatrixMealScheduleInstance,
  windows: MatrixMealTimeBlockWindow[]
) {
  if (instance.source_type?.trim().toUpperCase() !== "EVENT") return null;
  return (
    windows.find(
      (window) =>
        isMatrixMealTimeBlock(window) &&
        isActualScheduledMealEventInTimeBlock(instance, window)
    ) ?? null
  );
}

function readMetadataRecord(value: Json | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMatrixInferredMealMetadata(value: Json | null | undefined) {
  const metadata = readMetadataRecord(value);
  const nested = readMetadataRecord(metadata?.matrixInferredMeal as Json | null);
  return nested ?? metadata;
}

export function isNutritionMealForInferredMatrixMeal(
  meal: MatrixNutritionMealCompletionRow,
  inferredMeal: Pick<
    MatrixInferredMealEventData,
    | "syntheticEventId"
    | "dateKey"
    | "timeBlockId"
    | "dayTypeTimeBlockId"
    | "startUtc"
    | "endUtc"
  >
) {
  if (meal.deleted_at) return false;

  const metadata = readMatrixInferredMealMetadata(meal.metadata);
  if (metadata?.source === MATRIX_INFERRED_MEAL_SOURCE) {
    if (metadata.syntheticEventId === inferredMeal.syntheticEventId) return true;
    if (
      metadata.dateKey === inferredMeal.dateKey &&
      inferredMeal.dayTypeTimeBlockId &&
      metadata.dayTypeTimeBlockId === inferredMeal.dayTypeTimeBlockId
    ) {
      return true;
    }
    if (
      metadata.dateKey === inferredMeal.dateKey &&
      inferredMeal.timeBlockId &&
      metadata.timeBlockId === inferredMeal.timeBlockId
    ) {
      return true;
    }
  }

  const occurredAt = meal.occurred_at ? new Date(meal.occurred_at).getTime() : NaN;
  const start = new Date(inferredMeal.startUtc).getTime();
  const end = new Date(inferredMeal.endUtc).getTime();
  return (
    Number.isFinite(occurredAt) &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    occurredAt >= start &&
    occurredAt < end
  );
}

export function buildMatrixInferredMealNutritionLogContext({
  inferredMeal,
  timeZone,
}: {
  inferredMeal: MatrixInferredMealEventData;
  timeZone: string;
}): CreatorNutritionLogContext {
  return {
    source: MATRIX_INFERRED_MEAL_SOURCE,
    requestId: `${inferredMeal.syntheticEventId}:${Date.now()}`,
    syntheticEventId: inferredMeal.syntheticEventId,
    dateKey: inferredMeal.dateKey,
    mealName: inferredMeal.title,
    timeBlockId: inferredMeal.timeBlockId,
    dayTypeTimeBlockId: inferredMeal.dayTypeTimeBlockId,
    windowId: inferredMeal.windowId,
    startUtc: inferredMeal.startUtc,
    endUtc: inferredMeal.endUtc,
    startLocal: inferredMeal.startLocal,
    endLocal: inferredMeal.endLocal,
    timeZone,
  };
}

export function buildMatrixScheduledMealNutritionLogContext({
  meal,
  timeZone,
}: {
  meal: MatrixScheduledMealEventData;
  timeZone: string;
}): CreatorNutritionLogContext {
  return {
    source: MATRIX_SCHEDULED_MEAL_SOURCE,
    requestId: `${meal.scheduleInstanceId}:${Date.now()}`,
    scheduleInstanceId: meal.scheduleInstanceId,
    eventId: meal.eventId ?? undefined,
    dateKey: meal.dateKey,
    mealName: meal.title,
    timeBlockId: meal.timeBlockId,
    dayTypeTimeBlockId: meal.dayTypeTimeBlockId,
    windowId: meal.windowId,
    startUtc: meal.startUtc,
    endUtc: meal.endUtc,
    startLocal: meal.startLocal,
    endLocal: meal.endLocal,
    timeZone,
  };
}

export function claimMatrixInferredMealLogOpen(
  pendingIds: Set<string>,
  syntheticEventId: string
) {
  if (pendingIds.has(syntheticEventId)) return false;
  pendingIds.add(syntheticEventId);
  return true;
}

export function releaseMatrixInferredMealLogOpen(
  pendingIds: Set<string>,
  syntheticEventId: string
) {
  pendingIds.delete(syntheticEventId);
}

export function buildMatrixInferredMealEvents({
  windows,
  instances,
  meals,
  dateKey,
}: {
  windows: MatrixMealTimeBlockWindow[];
  instances: MatrixMealScheduleInstance[];
  meals: MatrixNutritionMealCompletionRow[];
  dateKey: string;
}): MatrixInferredMealEventData[] {
  const inferredMealsById = new Map<string, MatrixInferredMealEventData>();

  for (const window of windows) {
    if (!isMatrixMealTimeBlock(window)) continue;
    const startMs = getWindowStartMs(window);
    const endMs = getWindowEndMs(window);
    if (startMs === null || endMs === null || endMs <= startMs) continue;

    const syntheticEventId = buildMatrixInferredMealEventId(window, dateKey);
    if (inferredMealsById.has(syntheticEventId)) continue;
    if (
      instances.some((instance) =>
        isActualScheduledMealEventInTimeBlock(instance, window)
      )
    ) {
      continue;
    }

    const startUtc = new Date(startMs).toISOString();
    const endUtc = new Date(endMs).toISOString();
    const base: MatrixInferredMealEventData = {
      syntheticEventId,
      title: trimmed(window.label) ?? "Meal",
      timeBlockId: getWindowSourceTimeBlockId(window),
      dayTypeTimeBlockId: getWindowDayTypeTimeBlockId(window),
      windowId: getWindowId(window),
      dateKey,
      startUtc,
      endUtc,
      startLocal: trimmed(window.start_local),
      endLocal: trimmed(window.end_local),
      durationMinutes: Math.max(1, Math.round((endMs - startMs) / 60_000)),
      completed: false,
      completedAt: null,
      completedMealId: null,
    };
    const completedMeal = meals.find((meal) =>
      isNutritionMealForInferredMatrixMeal(meal, base)
    );

    inferredMealsById.set(syntheticEventId, {
      ...base,
      completed: Boolean(completedMeal),
      completedAt: completedMeal?.occurred_at ?? completedMeal?.created_at ?? null,
      completedMealId: completedMeal?.id ?? null,
    });
  }

  return Array.from(inferredMealsById.values()).sort((left, right) => {
    const startDifference =
      new Date(left.startUtc).getTime() - new Date(right.startUtc).getTime();
    if (startDifference !== 0) return startDifference;
    return left.syntheticEventId.localeCompare(right.syntheticEventId);
  });
}
