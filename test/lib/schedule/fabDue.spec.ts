import { describe, expect, it } from "vitest";

import {
  resolveHabitNextDueAt,
  resolveProjectNextDueAt,
  type FabDueHabitInput,
} from "@/lib/schedule/fabDue";

const timeZone = "America/Chicago";
const now = new Date("2026-09-10T15:00:00.000Z");

function habit(overrides: Partial<FabDueHabitInput>): FabDueHabitInput {
  return {
    id: "habit-1",
    name: "Practice",
    habit_type: "HABIT",
    recurrence: "daily",
    recurrence_days: null,
    recurrence_mode: null,
    anchor_type: null,
    anchor_value: null,
    anchor_start_date: null,
    created_at: "2026-09-01T15:00:00.000Z",
    updated_at: "2026-09-01T15:00:00.000Z",
    last_completed_at: null,
    next_due_override: null,
    window: null,
    ...overrides,
  };
}

describe("FAB Nexus due helpers", () => {
  it("includes a habit when canonical recurrence says it is due", () => {
    const nextDueAt = resolveHabitNextDueAt({
      habit: habit({}),
      now,
      timeZone,
    });

    expect(nextDueAt).toBeTruthy();
  });

  it("excludes a habit completed today", () => {
    const nextDueAt = resolveHabitNextDueAt({
      habit: habit({ last_completed_at: "2026-09-10T14:00:00.000Z" }),
      now,
      timeZone,
    });

    expect(nextDueAt).toBeNull();
  });

  it("includes an overdue interval habit", () => {
    const nextDueAt = resolveHabitNextDueAt({
      habit: habit({
        recurrence: "weekly",
        last_completed_at: "2026-08-20T15:00:00.000Z",
      }),
      now,
      timeZone,
    });

    expect(nextDueAt).toBe("2026-08-27T09:00:00.000Z");
  });

  it("includes a project with an overdue own due date", () => {
    const nextDueAt = resolveProjectNextDueAt({
      project: {
        completed_at: null,
        due_date: "2026-09-01",
        goal_id: null,
      },
      goalDueDatesById: new Map(),
      now,
      timeZone,
    });

    expect(nextDueAt).toBe("2026-09-01T09:00:00.000Z");
  });
});
