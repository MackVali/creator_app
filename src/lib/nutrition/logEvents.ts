"use client";

import type { Json } from "@/types/supabase";

export const CREATOR_OPEN_NUTRITION_LOG_EVENT = "creator:open-nutrition-log";
export const CREATOR_NUTRITION_MEAL_SAVED_EVENT =
  "creator:nutrition-meal-saved";
export const CREATOR_SCHEDULE_NUTRITION_LOG_OVERLAY_EVENT =
  "creator:schedule-nutrition-log-overlay-open-changed";

export type CreatorNutritionLogContext = {
  source: "matrix-inferred-meal" | "matrix-scheduled-meal";
  requestId: string;
  syntheticEventId?: string;
  scheduleInstanceId?: string;
  eventId?: string;
  dateKey: string;
  mealName: string;
  timeBlockId: string | null;
  dayTypeTimeBlockId: string | null;
  windowId?: string | null;
  startUtc: string;
  endUtc: string;
  startLocal: string | null;
  endLocal: string | null;
  timeZone: string;
};

export type CreatorOpenNutritionLogDetail = {
  context?: CreatorNutritionLogContext;
};

export type CreatorNutritionMealSavedDetail = {
  mealId: string;
  occurredAt?: string | null;
  metadata?: Json | null;
  context?: CreatorNutritionLogContext | null;
};

const PENDING_CONTEXT_TTL_MS = 30 * 60 * 1000;
let pendingNutritionLogContext:
  | {
      context: CreatorNutritionLogContext;
      createdAt: number;
    }
  | null = null;

function nowMs() {
  return Date.now();
}

export function rememberPendingNutritionLogContext(
  context: CreatorNutritionLogContext
) {
  pendingNutritionLogContext = {
    context,
    createdAt: nowMs(),
  };
}

export function getPendingNutritionLogContext():
  | CreatorNutritionLogContext
  | null {
  if (!pendingNutritionLogContext) return null;
  if (nowMs() - pendingNutritionLogContext.createdAt > PENDING_CONTEXT_TTL_MS) {
    pendingNutritionLogContext = null;
    return null;
  }
  return pendingNutritionLogContext.context;
}

export function clearPendingNutritionLogContext(
  requestId?: string | null
) {
  if (
    requestId &&
    pendingNutritionLogContext?.context.requestId !== requestId
  ) {
    return;
  }
  pendingNutritionLogContext = null;
}

export function dispatchOpenNutritionLogEvent(
  context?: CreatorNutritionLogContext
) {
  if (context) {
    rememberPendingNutritionLogContext(context);
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CreatorOpenNutritionLogDetail>(
      CREATOR_OPEN_NUTRITION_LOG_EVENT,
      {
        detail: context ? { context } : {},
      }
    )
  );
}

export function dispatchNutritionMealSavedEvent(
  detail: CreatorNutritionMealSavedDetail
) {
  if (detail.context?.requestId) {
    clearPendingNutritionLogContext(detail.context.requestId);
  }
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CreatorNutritionMealSavedDetail>(
      CREATOR_NUTRITION_MEAL_SAVED_EVENT,
      { detail }
    )
  );
}
