import { describe, it, expect } from "vitest";
import { evaluateHabitDueOnDate } from "../../../src/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "../../../src/lib/scheduler/habits";

const createHabit = (
  overrides: Partial<HabitScheduleItem> = {}
): HabitScheduleItem =>
  ({
    id: "habit-1",
    name: "Test Habit",
    durationMinutes: 30,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    lastCompletedAt: null,
    habitType: "HABIT",
    windowId: null,
    energy: "LOW",
    recurrence: "weekly",
    recurrenceDays: null,
    skillId: null,
    goalId: null,
    completionTarget: null,
    locationContextId: null,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: null,
    windowEdgePreference: null,
    window: null,
    ...overrides,
  } as HabitScheduleItem);

describe("evaluateHabitDueOnDate", () => {
  const timeZone = "UTC";

  describe("non-daily overdue habits", () => {
    it("returns due for monthly habit with last_completed_at null", () => {
      const habit = createHabit({
        recurrence: "monthly",
        lastCompletedAt: null,
      });

      const result = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-15T00:00:00Z"),
        timeZone,
      });

      expect(result.isDue).toBe(true);
      expect(result.debugTag).toBe("DUE_OVERDUE");
    });

    it("returns due every day for overdue weekly habit until completed", () => {
      const habit = createHabit({
        recurrence: "weekly",
        lastCompletedAt: "2024-01-01T00:00:00Z", // Completed 10 days ago
      });

      // 10 days later - should be due
      const result1 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-11T00:00:00Z"),
        timeZone,
      });
      expect(result1.isDue).toBe(true);
      expect(result1.debugTag).toBe("DUE_OVERDUE");

      // Next day - still due
      const result2 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-12T00:00:00Z"),
        timeZone,
      });
      expect(result2.isDue).toBe(true);
      expect(result2.debugTag).toBe("DUE_OVERDUE");
    });

    it("allows overdue non-daily habit to remain due on days after scheduling", () => {
      const habit = createHabit({
        recurrence: "weekly",
        lastCompletedAt: "2024-01-01T00:00:00Z",
      });

      // First scheduling attempt
      const result1 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-11T00:00:00Z"),
        timeZone,
        lastScheduledStart: null,
      });
      expect(result1.isDue).toBe(true);

      // Simulate scheduling on that day
      const scheduledStart = new Date("2024-01-11T09:00:00Z");

      // Next day check - should still be due (overdue stays due)
      const result2 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-12T00:00:00Z"),
        timeZone,
        lastScheduledStart: scheduledStart,
      });
      expect(result2.isDue).toBe(true);
      expect(result2.debugTag).toBe("DUE_OVERDUE");
    });

    it("allows rescheduling on same day but not next day", () => {
      const habit = createHabit({
        recurrence: "monthly",
        lastCompletedAt: "2023-12-01T00:00:00Z",
      });

      // Simulate already scheduled on due day
      const scheduledStart = new Date("2024-01-01T09:00:00Z");

      // Same day - should be due (rescheduling allowed)
      const result1 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-01T00:00:00Z"),
        timeZone,
        lastScheduledStart: scheduledStart,
      });
      expect(result1.isDue).toBe(true);
      expect(result1.debugTag).toBe("DUE_OVERDUE");

      // Next day - not due until cycle advances
      const result2 = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-02T00:00:00Z"),
        timeZone,
        lastScheduledStart: scheduledStart,
      });
      expect(result2.isDue).toBe(false);
      expect(result2.debugTag).toBe("ALREADY_SCHEDULED_FOR_DUE");
    });

    it("respects per-day scheduling limit", () => {
      const habit = createHabit({
        recurrence: "weekly",
        lastCompletedAt: "2024-01-01T00:00:00Z",
      });

      const today = new Date("2024-01-11T00:00:00Z");
      const scheduledStart = new Date("2024-01-11T10:00:00Z");

      const result = evaluateHabitDueOnDate({
        habit,
        date: today,
        timeZone,
        lastScheduledStart: scheduledStart,
      });

      expect(result.isDue).toBe(false);
      expect(result.debugTag).toBe("LAST_SCHEDULED_TODAY");
    });
  });

  describe("daily habits", () => {
    it("maintains existing daily behavior", () => {
      const habit = createHabit({
        recurrence: "daily",
        lastCompletedAt: "2024-01-01T00:00:00Z",
      });

      const result = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-02T00:00:00Z"),
        timeZone,
      });

      expect(result.isDue).toBe(true);
      expect(result.debugTag).toBe("DUE_DAILY");
    });
  });

  describe("revalidation behavior", () => {
    it("does not cancel valid overdue non-daily habit instance", () => {
      const habit = createHabit({
        recurrence: "monthly",
        lastCompletedAt: "2023-12-01T00:00:00Z",
      });

      // Simulate instance scheduled on due day
      const scheduledStart = new Date("2024-01-01T09:00:00Z");

      // Revalidation on the same day should not cancel
      const result = evaluateHabitDueOnDate({
        habit,
        date: new Date("2024-01-01T00:00:00Z"),
        timeZone,
        lastScheduledStart: scheduledStart,
      });

      expect(result.isDue).toBe(true);
      expect(result.debugTag).toBe("DUE_OVERDUE");
    });
  });
});
