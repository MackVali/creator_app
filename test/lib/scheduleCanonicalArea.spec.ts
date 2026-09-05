import { describe, expect, it } from "vitest";

import {
  matchesCanonicalAreaFilter,
  resolveCanonicalScheduleAreaId,
} from "@/lib/schedule/canonicalArea";

const goalAreaByGoalId = new Map<string, string | null>([
  ["goal-work", "work"],
  ["goal-money", "money"],
  ["goal-creation", "creation"],
]);

const areaBySkillId = new Map<string, string | null>([
  ["fitness", "body"],
  ["writing", "creation"],
  ["unassigned", null],
]);

describe("canonical schedule Area metadata", () => {
  it("resolves Project Area from Goal, not Project Skills", () => {
    const areaId = resolveCanonicalScheduleAreaId(
      { type: "PROJECT", goalId: "goal-work", skillId: "writing" },
      { goalAreaByGoalId, areaBySkillId }
    );

    expect(areaId).toBe("work");
    expect(matchesCanonicalAreaFilter({ areaId }, "work")).toBe(true);
    expect(matchesCanonicalAreaFilter({ areaId }, "creation")).toBe(false);
  });

  it("resolves Habit Area from Skill, not legacy Goal metadata", () => {
    const areaId = resolveCanonicalScheduleAreaId(
      { type: "HABIT", goalId: "goal-money", skillId: "fitness" },
      { goalAreaByGoalId, areaBySkillId }
    );

    expect(areaId).toBe("body");
    expect(matchesCanonicalAreaFilter({ areaId }, "body")).toBe(true);
    expect(matchesCanonicalAreaFilter({ areaId }, "money")).toBe(false);
  });

  it("keeps Area and Skill filters independent", () => {
    const project = {
      areaId: "work",
      skillIds: ["writing"],
    };

    const matchesAreaAndSkill = (areaId: string, skillId: string) =>
      matchesCanonicalAreaFilter(project, areaId) &&
      project.skillIds.includes(skillId);

    expect(matchesAreaAndSkill("work", "writing")).toBe(true);
    expect(matchesAreaAndSkill("creation", "writing")).toBe(false);
  });

  it("does not give Habits a fallback Area when Skill has no Area relation", () => {
    const areaId = resolveCanonicalScheduleAreaId(
      { type: "HABIT", goalId: "goal-money", skillId: "unassigned" },
      { goalAreaByGoalId, areaBySkillId }
    );

    expect(areaId).toBeNull();
    expect(matchesCanonicalAreaFilter({ areaId }, "money")).toBe(false);
  });

  it("resolves Task Area from Goal and ignores Task Skill Area", () => {
    const areaId = resolveCanonicalScheduleAreaId(
      { type: "TASK", goalId: "goal-work", skillId: "writing" },
      { goalAreaByGoalId, areaBySkillId }
    );

    expect(areaId).toBe("work");
  });

  it("falls back to parent Project Goal for legacy Tasks without direct goal_id", () => {
    const areaId = resolveCanonicalScheduleAreaId(
      { type: "TASK", goalId: null, projectId: "project-a", skillId: "writing" },
      {
        goalAreaByGoalId,
        areaBySkillId,
        projectGoalIdByProjectId: new Map([["project-a", "goal-creation"]]),
      }
    );

    expect(areaId).toBe("creation");
  });
});
