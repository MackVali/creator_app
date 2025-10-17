import { describe, it, expect } from "vitest";

import { evaluateHabitDueOnDate } from "../../../src/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "../../../src/lib/scheduler/habits";

function createHabit(
  overrides: Partial<HabitScheduleItem> = {},
): HabitScheduleItem {
  return {
    id: "habit-temp",
    name: "Read",
    durationMinutes: 15,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    lastCompletedAt: null,
    habitType: "TEMP",
    windowId: null,
    energy: null,
    recurrence: "daily",
    recurrenceDays: null,
    skillId: null,
    locationContext: null,
    daylightPreference: null,
    windowEdgePreference: null,
    goalId: "goal-1",
    tempCompletionTarget: 5,
    tempCompletionCount: 0,
    window: null,
    ...overrides,
  };
}

describe("evaluateHabitDueOnDate - Temp habits", () => {
  const evaluationDate = new Date("2025-01-05T15:30:00Z");

  it("marks temp habits as due while they still have completions remaining", () => {
    const habit = createHabit({ tempCompletionCount: 3 });

    const result = evaluateHabitDueOnDate({
      habit,
      date: evaluationDate,
      timeZone: "UTC",
      windowDays: null,
    });

    expect(result.isDue).toBe(true);
    expect(result.dueStart?.toISOString()).toBe("2025-01-05T00:00:00.000Z");
  });

  it("treats temp habits as complete once their completion target is reached", () => {
    const habit = createHabit({ tempCompletionCount: 5 });

    const result = evaluateHabitDueOnDate({
      habit,
      date: evaluationDate,
      timeZone: "UTC",
      windowDays: null,
    });

    expect(result).toEqual({ isDue: false, dueStart: null });
  });

  it("falls back to normal scheduling if the completion target is missing", () => {
    const habit = createHabit({ tempCompletionTarget: null, tempCompletionCount: 10 });

    const result = evaluateHabitDueOnDate({
      habit,
      date: evaluationDate,
      timeZone: "UTC",
      windowDays: null,
    });

    expect(result.isDue).toBe(true);
  });
});
