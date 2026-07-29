import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/scheduler/repo", () => ({
  normalizeBlockType: (value?: string | null) => {
    const normalized = value?.trim().toUpperCase();
    return normalized === "MEAL" || normalized === "BREAK" || normalized === "PRACTICE"
      ? normalized
      : "DEFAULT";
  },
}));

import {
  buildMatrixScheduledMealNutritionLogContext,
  claimMatrixInferredMealLogOpen,
  findActualScheduledMealTimeBlock,
  releaseMatrixInferredMealLogOpen,
  type MatrixMealScheduleInstance,
  type MatrixMealTimeBlockWindow,
  type MatrixScheduledMealEventData,
} from "@/app/(app)/schedule/matrix/matrixInferredMealEvents";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const functionBlock = (name: string) => {
  const start = matrixContent.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\nfunction ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

const callbackBlock = (name: string) => {
  const start = matrixContent.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n  const ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

const effectAfter = (needle: string) => {
  const start = matrixContent.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const effectStart = matrixContent.lastIndexOf("useEffect(() => {", start);
  expect(effectStart).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n\n  const ", start + 1);
  return matrixContent.slice(effectStart, next === -1 ? undefined : next);
};

const mealWindow: MatrixMealTimeBlockWindow = {
  id: "window-1",
  label: "Lunch",
  window_kind: "MEAL",
  timeBlockId: "time-block-1",
  dayTypeTimeBlockId: "day-type-time-block-1",
  window_id: "overlay-window-1",
  start_local: "12:00",
  end_local: "12:30",
};

const eventInstance: MatrixMealScheduleInstance = {
  id: "schedule-instance-1",
  source_type: "EVENT",
  time_block_id: "time-block-1",
  day_type_time_block_id: null,
  window_id: null,
};

describe("Matrix Meal Event Nutrition action", () => {
  it("detects actual scheduled Meal Events from Time Block metadata, not titles", () => {
    expect(findActualScheduledMealTimeBlock(eventInstance, [mealWindow])).toBe(
      mealWindow
    );
    expect(
      findActualScheduledMealTimeBlock(
        { ...eventInstance, source_type: "HABIT" },
        [mealWindow]
      )
    ).toBeNull();
    expect(
      findActualScheduledMealTimeBlock(eventInstance, [
        { ...mealWindow, window_kind: "FOCUS" },
      ])
    ).toBeNull();
  });

  it("preserves scheduled Event and Meal Time Block identity in Nutrition context", () => {
    const meal: MatrixScheduledMealEventData = {
      scheduleInstanceId: "schedule-instance-1",
      eventId: "event-1",
      title: "Lunch",
      timeBlockId: "time-block-1",
      dayTypeTimeBlockId: "day-type-time-block-1",
      windowId: "overlay-window-1",
      dateKey: "2026-07-29",
      startUtc: "2026-07-29T17:00:00.000Z",
      endUtc: "2026-07-29T17:30:00.000Z",
      startLocal: "12:00",
      endLocal: "12:30",
    };

    expect(
      buildMatrixScheduledMealNutritionLogContext({
        meal,
        timeZone: "America/Chicago",
      })
    ).toMatchObject({
      source: "matrix-scheduled-meal",
      scheduleInstanceId: "schedule-instance-1",
      eventId: "event-1",
      mealName: "Lunch",
      timeBlockId: "time-block-1",
      dayTypeTimeBlockId: "day-type-time-block-1",
      windowId: "overlay-window-1",
      dateKey: "2026-07-29",
      timeZone: "America/Chicago",
    });
  });

  it("uses the existing stomach icon for Meal Events and preserves non-Meal flame rendering", () => {
    const actionBlock = functionBlock("MatrixMealNutritionActionButton");
    const rowBlock = functionBlock("MatrixScheduledEventRowCard");

    expect(actionBlock).toContain('icon="game-icons:stomach"');
    expect(actionBlock).toContain('aria-label="Log meal"');
    expect(actionBlock).toContain("data-matrix-meal-nutrition-action");
    expect(rowBlock.indexOf("isMatrixMealEvent(event)")).toBeLessThan(
      rowBlock.indexOf('energyLevel !== "NO"')
    );
    expect(rowBlock).toContain("<FlameEmber");
  });

  it("opens Nutrition only from the stomach action, not from card completion", () => {
    const actionBlock = functionBlock("MatrixMealNutritionActionButton");
    const completeBlock = callbackBlock("handleCompleteScheduledEvent");

    expect(actionBlock).toContain("onClick={activateMealNutrition}");
    expect(actionBlock).toContain("onTouchEnd={activateMealNutrition}");
    expect(actionBlock).toContain("onOpen(event)");
    expect(completeBlock).not.toContain("dispatchOpenNutritionLogEvent");
    expect(completeBlock).not.toContain("openInferredMealNutritionLog(event)");
  });

  it("prevents icon taps from propagating into card gestures and double-tap completion", () => {
    const actionBlock = functionBlock("MatrixMealNutritionActionButton");

    expect(matrixContent).toContain("MATRIX_CARD_INTERACTIVE_ACTION_SELECTOR");
    expect(matrixContent).toContain("[data-matrix-meal-nutrition-action]");
    expect(actionBlock).toContain("interactionEvent.stopPropagation()");
    expect(actionBlock).toContain("interactionEvent.preventDefault()");
    expect(actionBlock).toContain("onPointerDown={stopActionPropagation}");
    expect(actionBlock).toContain("onTouchStart={stopActionPropagation}");
    expect(actionBlock).toContain("onDoubleClick={stopActionActivation}");
  });

  it("guards rapid repeated taps from opening duplicate Nutrition forms", () => {
    const pendingIds = new Set<string>();

    expect(claimMatrixInferredMealLogOpen(pendingIds, "meal-1")).toBe(true);
    expect(claimMatrixInferredMealLogOpen(pendingIds, "meal-1")).toBe(false);
    expect(claimMatrixInferredMealLogOpen(pendingIds, "meal-2")).toBe(true);
    releaseMatrixInferredMealLogOpen(pendingIds, "meal-1");
    expect(claimMatrixInferredMealLogOpen(pendingIds, "meal-1")).toBe(true);

    expect(matrixContent).toContain("pendingScheduledMealLogIdsRef");
  });

  it("completes only the matching Meal Event after a successful Nutrition save", () => {
    const saveEffect = effectAfter("handleNutritionMealSaved");

    expect(saveEffect).toContain('context.source === "matrix-inferred-meal"');
    expect(saveEffect).toContain("markInferredMealEventCompleted({");
    expect(saveEffect).toContain('context.source === "matrix-scheduled-meal"');
    expect(saveEffect).toContain("context.scheduleInstanceId");
    expect(saveEffect).toContain(
      'commitScheduledEventCompletion(scheduleInstanceId, "completed")'
    );
    expect(saveEffect).not.toContain(
      "CREATOR_SCHEDULE_NUTRITION_LOG_OVERLAY_EVENT"
    );
  });
});
