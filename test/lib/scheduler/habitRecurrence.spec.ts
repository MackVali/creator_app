import { describe, it, expect } from "vitest";
import { evaluateHabitDueOnDate } from "../../../src/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "../../../src/lib/scheduler/habits";

const BASE_HABIT: HabitScheduleItem = {
  id: "habit-1",
  name: "Daily chore",
  durationMinutes: 30,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  lastCompletedAt: "2024-01-01T00:00:00Z",
  habitType: "CHORE",
  windowId: null,
  recurrence: "daily",
  recurrenceDays: null,
  skillId: null,
  window: null,
};

function createHabit(overrides: Partial<HabitScheduleItem> = {}): HabitScheduleItem {
  return { ...BASE_HABIT, ...overrides };
}

describe("evaluateHabitDueOnDate", () => {
  it("treats 'every N days' chores as not due until the interval passes", () => {
    const habit = createHabit({
      recurrence: "every 3 days",
      lastCompletedAt: "2024-01-01T09:00:00Z",
    });

    const jan2 = evaluateHabitDueOnDate({
      habit,
      date: new Date("2024-01-02T09:00:00Z"),
      timeZone: "UTC",
    });

    const jan3 = evaluateHabitDueOnDate({
      habit,
      date: new Date("2024-01-03T09:00:00Z"),
      timeZone: "UTC",
    });

    const jan4 = evaluateHabitDueOnDate({
      habit,
      date: new Date("2024-01-04T09:00:00Z"),
      timeZone: "UTC",
    });

    expect(jan2.isDue).toBe(false);
    expect(jan3.isDue).toBe(false);
    expect(jan4.isDue).toBe(true);
    expect(jan4.dueStart?.toISOString()).toBe("2024-01-04T00:00:00.000Z");
  });
});
