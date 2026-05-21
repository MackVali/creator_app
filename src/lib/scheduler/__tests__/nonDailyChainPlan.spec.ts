import { describe, expect, it } from "vitest";

import { computeNonDailyChainPlan } from "../nonDailyChain";
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
  recurrenceMode: "INTERVAL",
  anchorType: null,
  anchorValue: null,
  anchorStartDate: null,
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

describe("computeNonDailyChainPlan", () => {
  it("makes a never-completed weekly habit due from creation", () => {
    const createdAt = "2026-05-20T14:30:00.000Z";
    const nowUtc = "2026-05-20T16:00:00.000Z";
    const habit = createHabit({
      id: "habit-new-weekly",
      recurrence: "weekly",
      recurrenceMode: "INTERVAL",
      createdAt,
      updatedAt: createdAt,
      lastCompletedAt: null,
      nextDueOverride: null,
    });

    const plan = computeNonDailyChainPlan(habit, nowUtc, tz);

    expect(plan.anchor).toEqual({
      completedAtUtc: createdAt,
      source: "CREATION",
    });
    expect(plan.primary.dueAtUtc).toBe(createdAt);
    expect(plan.primary.minStartUtc).toBe(nowUtc);
    expect(plan.forecast.dueAtUtc).toBe("2026-05-27T14:30:00.000Z");
  });

  it("makes a completed weekly habit next due seven days after completion", () => {
    const completedAt = "2026-05-20T14:30:00.000Z";
    const habit = createHabit({
      id: "habit-completed-weekly",
      recurrence: "weekly",
      recurrenceMode: "INTERVAL",
      createdAt: "2026-05-01T14:30:00.000Z",
      lastCompletedAt: completedAt,
    });

    const plan = computeNonDailyChainPlan(
      habit,
      "2026-05-20T16:00:00.000Z",
      tz
    );

    expect(plan.anchor).toEqual({
      completedAtUtc: completedAt,
      source: "COMPLETION",
    });
    expect(plan.primary.dueAtUtc).toBe("2026-05-27T14:30:00.000Z");
  });

  it("makes a never-completed monthly habit due from creation", () => {
    const createdAt = "2026-01-31T14:30:00.000Z";
    const habit = createHabit({
      id: "habit-new-monthly",
      recurrence: "monthly",
      recurrenceMode: "INTERVAL",
      createdAt,
      updatedAt: createdAt,
      lastCompletedAt: null,
    });

    const plan = computeNonDailyChainPlan(
      habit,
      "2026-02-01T16:00:00.000Z",
      tz
    );

    expect(plan.anchor.source).toBe("CREATION");
    expect(plan.primary.dueAtUtc).toBe(createdAt);
    expect(plan.primary.dueAtUtc).not.toBe("2026-02-28T14:30:00.000Z");
    expect(plan.forecast.dueAtUtc).toBe("2026-02-28T14:30:00.000Z");
  });

  it("makes every-x-days habits due from creation until first completion", () => {
    const createdAt = "2026-05-20T14:30:00.000Z";
    const baseHabit = createHabit({
      id: "habit-every-five",
      recurrence: "every x days",
      recurrenceDays: [5],
      recurrenceMode: "INTERVAL",
      createdAt,
      updatedAt: createdAt,
      lastCompletedAt: null,
    });

    const initialPlan = computeNonDailyChainPlan(
      baseHabit,
      "2026-05-20T16:00:00.000Z",
      tz
    );
    expect(initialPlan.anchor.source).toBe("CREATION");
    expect(initialPlan.primary.dueAtUtc).toBe(createdAt);
    expect(initialPlan.forecast.dueAtUtc).toBe("2026-05-25T14:30:00.000Z");

    const completedPlan = computeNonDailyChainPlan(
      {
        ...baseHabit,
        lastCompletedAt: "2026-05-21T14:30:00.000Z",
      },
      "2026-05-21T16:00:00.000Z",
      tz
    );
    expect(completedPlan.anchor.source).toBe("COMPLETION");
    expect(completedPlan.primary.dueAtUtc).toBe("2026-05-26T14:30:00.000Z");
  });
});
