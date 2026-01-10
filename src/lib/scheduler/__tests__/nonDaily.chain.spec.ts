import { describe, expect, it } from "vitest";

import { planNonDailyOccurrences } from "../reschedule";
import { addDaysInTimeZone, startOfDayInTimeZone } from "../timezone";
import type { HabitScheduleItem } from "../habits";

const tz = "UTC";

const createHabit = (
  overrides: Partial<HabitScheduleItem> & { id: string }
): HabitScheduleItem => ({
  id: overrides.id,
  name: "Habit",
  durationMinutes: 30,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  lastCompletedAt: null,
  currentStreakDays: 0,
  longestStreakDays: 0,
  habitType: "HABIT",
  windowId: null,
  energy: "NO",
  recurrence: "weekly",
  recurrenceDays: null,
  skillId: null,
  skillMonumentId: null,
  goalId: null,
  completionTarget: null,
  locationContextId: null,
  locationContextValue: null,
  locationContextName: null,
  daylightPreference: null,
  windowEdgePreference: null,
  nextDueOverride: null,
  window: null,
  ...overrides,
});

const toISODate = (date: Date) =>
  startOfDayInTimeZone(date, tz).toISOString().slice(0, 10);

describe("planNonDailyOccurrences", () => {
  it("chains weekly recurrence days across horizon (weekday set)", () => {
    const habit = createHabit({
      id: "habit-weekly",
      recurrence: "weekly",
      recurrenceDays: [1, 2, 5, 6], // Mon, Tue, Fri, Sat
    });
    const horizonStart = startOfDayInTimeZone(
      new Date("2024-06-01T12:00:00Z"), // Saturday local day
      tz
    );
    const horizonEnd = addDaysInTimeZone(horizonStart, 9, tz);

    const planned = planNonDailyOccurrences({
      habit,
      userTz: tz,
      horizonStartLocalDay: horizonStart,
      horizonEndLocalDay: horizonEnd,
      firstDueLocalDay: horizonStart,
      existingScheduledLocalDays: [],
    });

    const days = planned.map(toISODate);
    expect(days).toEqual([
      "2024-06-01",
      "2024-06-03",
      "2024-06-04",
      "2024-06-07",
      "2024-06-08",
      "2024-06-10",
    ]);
    expect(new Set(days).size).toBe(days.length);
  });

  it("chains every-x-days occurrences forward", () => {
    const habit = createHabit({
      id: "habit-every-x",
      recurrence: "every 7 days",
    });
    const horizonStart = startOfDayInTimeZone(
      new Date("2024-01-01T12:00:00Z"),
      tz
    );
    const firstDue = addDaysInTimeZone(horizonStart, 3, tz);
    const horizonEnd = addDaysInTimeZone(horizonStart, 12, tz);

    const planned = planNonDailyOccurrences({
      habit,
      userTz: tz,
      horizonStartLocalDay: horizonStart,
      horizonEndLocalDay: horizonEnd,
      firstDueLocalDay: firstDue,
      existingScheduledLocalDays: [],
    });

    const days = planned.map(toISODate);
    expect(days).toEqual(["2024-01-04", "2024-01-11"]);
    expect(new Set(days).size).toBe(days.length);
  });

  it("treats existing future instance as virtual completion", () => {
    const habit = createHabit({
      id: "habit-existing",
      recurrence: "every 7 days",
    });
    const horizonStart = startOfDayInTimeZone(
      new Date("2024-01-01T12:00:00Z"),
      tz
    );
    const firstDue = addDaysInTimeZone(horizonStart, 2, tz);
    const horizonEnd = addDaysInTimeZone(horizonStart, 14, tz);

    const planned = planNonDailyOccurrences({
      habit,
      userTz: tz,
      horizonStartLocalDay: horizonStart,
      horizonEndLocalDay: horizonEnd,
      firstDueLocalDay: firstDue,
      existingScheduledLocalDays: [firstDue],
    });

    const days = planned.map(toISODate);
    expect(days).toEqual(["2024-01-10"]);
    expect(new Set(days).size).toBe(days.length);
  });
});
