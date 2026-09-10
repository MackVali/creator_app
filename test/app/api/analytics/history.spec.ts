import { describe, expect, it } from "vitest";

import {
  buildAnalyticsHistoryDay,
  buildCompletionXpById,
  type BuildAnalyticsHistoryDayInput,
} from "../../../../src/lib/analytics/history";

const baseInput = (): BuildAnalyticsHistoryDayInput => ({
  dayKey: "2026-07-27",
  dayStartUtc: "2026-07-27T09:00:00.000Z",
  dayEndUtc: "2026-07-28T09:00:00.000Z",
  timezone: "America/Chicago",
  now: new Date("2026-07-28T12:00:00.000Z"),
  completions: [],
  xpEvents: [],
  observedInstances: [],
  areas: [{ id: "area-1", label: "Work" }],
  skills: [{ id: "skill-1", name: "Writing", monument_id: "mon-1" }],
  areaSkills: [{ area_id: "area-1", skill_id: "skill-1" }],
  monuments: [{ id: "mon-1", title: "Book" }],
  goals: [{ id: "goal-1", name: "Draft", area_id: null, monument_id: "mon-1" }],
  projects: [{ id: "project-1", name: "Chapter", goal_id: "goal-1" }],
  tasks: [
    {
      id: "task-1",
      name: "Outline",
      project_id: "project-1",
      goal_id: null,
      skill_id: "skill-1",
    },
  ],
  habits: [{ id: "habit-1", name: "Morning pages", goal_id: null, skill_id: "skill-1" }],
});

describe("buildCompletionXpById", () => {
  it("does not double-count sibling XP rows for one completion award", () => {
    const xpByCompletion = buildCompletionXpById([
      {
        id: "xp-skill",
        amount: 10,
        kind: "task",
        skill_id: "skill-1",
        monument_id: null,
        area_id: null,
        award_key: "task:task-1:skill:skill-1",
        completion_event_id: "completion-1",
      },
      {
        id: "xp-area",
        amount: 10,
        kind: "task",
        skill_id: null,
        monument_id: null,
        area_id: "area-1",
        award_key: "task:task-1:area:area-1",
        completion_event_id: "completion-1",
      },
    ]);

    expect(xpByCompletion.get("completion-1")).toBe(10);
  });

  it("excludes completion XP awards that have reversal rows", () => {
    const xpByCompletion = buildCompletionXpById([
      {
        id: "xp-positive",
        amount: 15,
        kind: "task",
        skill_id: "skill-1",
        award_key: "task:task-1:skill:skill-1",
        completion_event_id: "completion-1",
      },
      {
        id: "xp-reversal",
        amount: -15,
        kind: "task",
        skill_id: "skill-1",
        award_key: "reverse:task:task-1:skill:skill-1",
        completion_event_id: "completion-1",
      },
    ]);

    expect(xpByCompletion.get("completion-1")).toBeUndefined();
  });
});

describe("buildAnalyticsHistoryDay", () => {
  it("separates planned, unplanned, missed, and revoked completions", () => {
    const input = baseInput();
    input.completions = [
      {
        id: "completion-planned",
        source_type: "TASK",
        source_id: "task-1",
        completed_at: "2026-07-27T15:00:00.000Z",
        schedule_instance_id: "schedule-1",
        was_scheduled: true,
        duration_min: 30,
        productivity_day_key: "2026-07-27",
        revoked_at: null,
      },
      {
        id: "completion-unplanned",
        source_type: "HABIT",
        source_id: "habit-1",
        completed_at: "2026-07-28T08:30:00.000Z",
        schedule_instance_id: null,
        was_scheduled: false,
        duration_min: 10,
        productivity_day_key: "2026-07-27",
        revoked_at: null,
      },
      {
        id: "completion-revoked",
        source_type: "TASK",
        source_id: "task-1",
        completed_at: "2026-07-27T16:00:00.000Z",
        schedule_instance_id: null,
        was_scheduled: false,
        duration_min: 10,
        productivity_day_key: "2026-07-27",
        revoked_at: "2026-07-27T16:05:00.000Z",
      },
    ];
    input.xpEvents = [
      {
        id: "xp-1",
        amount: 20,
        kind: "task",
        skill_id: "skill-1",
        award_key: "task:task-1:skill:skill-1",
        completion_event_id: "completion-planned",
      },
    ];
    input.observedInstances = [
      {
        id: "schedule-1",
        sourceId: "task-1",
        sourceType: "task",
        status: "completed",
        dayStartUtc: "2026-07-27T09:00:00.000Z",
        windowId: "window-1",
        dayTypeTimeBlockId: null,
        timeBlockId: null,
        startUtc: "2026-07-27T14:00:00.000Z",
        endUtc: "2026-07-27T14:30:00.000Z",
        durationMinutes: 30,
      },
      {
        id: "schedule-2",
        sourceId: "habit-1",
        sourceType: "habit",
        status: "scheduled",
        dayStartUtc: "2026-07-27T09:00:00.000Z",
        windowId: "window-1",
        dayTypeTimeBlockId: null,
        timeBlockId: null,
        startUtc: "2026-07-27T17:00:00.000Z",
        endUtc: "2026-07-27T17:15:00.000Z",
        durationMinutes: 15,
      },
    ];

    const history = buildAnalyticsHistoryDay(input);

    expect(history.dayStartUtc).toBe("2026-07-27T09:00:00.000Z");
    expect(history.dayEndUtc).toBe("2026-07-28T09:00:00.000Z");
    expect(history.summary).toMatchObject({
      planned: 2,
      completedPlanned: 1,
      completedUnplanned: 1,
      completedTotal: 2,
      missed: 1,
      executionRate: 50,
      xpEarned: 20,
    });
    expect(history.completed.map((item) => item.id)).toEqual([
      "completion-unplanned",
      "completion-planned",
    ]);
    expect(history.missed).toHaveLength(1);
    expect(
      history.completed.find((item) => item.id === "completion-planned")
    ).toMatchObject({
      scheduledStartUtc: "2026-07-27T14:00:00.000Z",
      scheduledEndUtc: "2026-07-27T14:30:00.000Z",
    });
    expect(history.missed[0]).toMatchObject({
      id: "schedule-2",
      sourceType: "habit",
      title: "Morning pages",
      wasScheduled: true,
    });
    expect(history.completed.some((item) => item.id === "completion-revoked")).toBe(false);
    expect(history.areas).toEqual([{ areaId: "area-1", label: "Work", completed: 2, xpEarned: 20 }]);
  });

  it("keeps execution rate at zero when only unplanned work exists", () => {
    const input = baseInput();
    input.completions = [
      {
        id: "completion-unplanned",
        source_type: "HABIT",
        source_id: "habit-1",
        completed_at: "2026-07-28T08:30:00.000Z",
        schedule_instance_id: null,
        was_scheduled: false,
        duration_min: 10,
        productivity_day_key: "2026-07-27",
        revoked_at: null,
      },
    ];

    const history = buildAnalyticsHistoryDay(input);

    expect(history.summary).toMatchObject({
      planned: 0,
      completedPlanned: 0,
      completedUnplanned: 1,
      completedTotal: 1,
      executionRate: 0,
    });
  });

  it("returns an empty day", () => {
    const history = buildAnalyticsHistoryDay(baseInput());

    expect(history.summary).toEqual({
      planned: 0,
      completedPlanned: 0,
      completedUnplanned: 0,
      completedTotal: 0,
      missed: 0,
      executionRate: 0,
      xpEarned: 0,
    });
    expect(history.completed).toEqual([]);
    expect(history.missed).toEqual([]);
    expect(history.areas).toEqual([]);
  });
});
