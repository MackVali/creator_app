import { describe, expect, it } from "vitest";

import { buildAnalyticsHistoryDay } from "@/lib/analytics/history";
import {
  buildManualMyListTodoCompletionKey,
  buildNoteTodoCompletionKey,
} from "@/lib/xp/todoCompletion";

const baseHistoryInput = {
  dayKey: "2026-09-11",
  dayStartUtc: "2026-09-11T05:00:00.000Z",
  dayEndUtc: "2026-09-12T05:00:00.000Z",
  timezone: "America/Chicago",
  now: new Date("2026-09-11T18:00:00.000Z"),
  observedInstances: [],
  areas: [{ id: "area-1", label: "Craft" }],
  skills: [{ id: "skill-1", name: "Writing", monument_id: null }],
  areaSkills: [{ area_id: "area-1", skill_id: "skill-1" }],
  monuments: [],
  goals: [],
  projects: [],
  tasks: [],
  habits: [],
};

describe("TODO completion identity", () => {
  it("builds canonical manual My List and NoteTodo completion keys", () => {
    expect(buildManualMyListTodoCompletionKey("item-1")).toBe(
      "todo:my-list:item-1"
    );
    expect(
      buildNoteTodoCompletionKey({
        owner: { type: "GOAL", id: "goal-1" },
        todoId: "todo-1",
      })
    ).toBe("todo:note:goal:goal-1:todo-1");
  });
});

describe("TODO analytics history", () => {
  it("renders TODO title, +1 logical XP, unplanned count, and skill/area labels", () => {
    const day = buildAnalyticsHistoryDay({
      ...baseHistoryInput,
      completions: [
        {
          id: "completion-1",
          source_type: "TODO",
          source_id: "todo-1",
          source_title: "Draft intro",
          completed_at: "2026-09-11T16:00:00.000Z",
          schedule_instance_id: null,
          was_scheduled: false,
          duration_min: null,
          productivity_day_key: "2026-09-11",
          revoked_at: null,
        },
      ],
      xpEvents: [
        {
          id: "xp-skill",
          amount: 1,
          kind: "todo",
          skill_id: "skill-1",
          monument_id: null,
          area_id: null,
          award_key: "todo:my-list:todo-1:skill:skill-1",
          completion_event_id: "completion-1",
        },
        {
          id: "xp-area",
          amount: 1,
          kind: "todo",
          skill_id: null,
          monument_id: null,
          area_id: "area-1",
          award_key: "todo:my-list:todo-1:area:area-1",
          completion_event_id: "completion-1",
        },
      ],
    });

    expect(day.summary.completedTotal).toBe(1);
    expect(day.summary.completedUnplanned).toBe(1);
    expect(day.summary.xpEarned).toBe(1);
    expect(day.completed[0]).toMatchObject({
      sourceType: "todo",
      title: "Draft intro",
      xpEarned: 1,
      skillLabel: "Writing",
      areaLabel: "Craft",
      wasScheduled: false,
    });
  });
});
