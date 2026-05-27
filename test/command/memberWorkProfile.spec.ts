import { describe, expect, it } from "vitest";

import {
  getWorkLocationContextId,
  getWorkSkillIds,
  memberWorkProfileAllowsWork,
} from "@/lib/command/memberWorkProfile";

describe("memberWorkProfileAllowsWork", () => {
  it("allows all skills when skill constraints are empty", () => {
    expect(
      memberWorkProfileAllowsWork(
        { skill_constraint_ids: [], location_context_ids: ["loc-1"] },
        { skill_id: "skill-a", location_context_id: "loc-1" }
      )
    ).toBe(true);
  });

  it("requires a skill overlap when skill constraints are set", () => {
    expect(
      memberWorkProfileAllowsWork(
        { skill_constraint_ids: ["skill-a"], location_context_ids: ["loc-1"] },
        { skill_id: "skill-b", location_context_id: "loc-1" }
      )
    ).toBe(false);
  });

  it("rejects work when location access is empty", () => {
    expect(
      memberWorkProfileAllowsWork(
        { skill_constraint_ids: [], location_context_ids: [] },
        { skill_id: "skill-a", location_context_id: "loc-1" }
      )
    ).toBe(false);
  });

  it("rejects work with no explicit location context", () => {
    expect(
      memberWorkProfileAllowsWork(
        { skill_constraint_ids: [], location_context_ids: ["loc-1"] },
        { skill_id: "skill-a", location_context_id: null }
      )
    ).toBe(false);
  });

  it("allows only explicitly granted location contexts", () => {
    expect(
      memberWorkProfileAllowsWork(
        { skill_constraint_ids: [], location_context_ids: ["loc-1"] },
        { skill_id: "skill-a", location_context_id: "loc-2" }
      )
    ).toBe(false);
  });
});

describe("command work profile adapters", () => {
  it("normalizes snake and camel skill ids", () => {
    expect(
      getWorkSkillIds({
        skill_id: "skill-a",
        skillId: "skill-b",
        skill_ids: ["skill-c", " "],
        skillIds: ["skill-a", "skill-d"],
      })
    ).toEqual(["skill-a", "skill-b", "skill-c", "skill-d"]);
  });

  it("normalizes direct location context ids", () => {
    expect(
      getWorkLocationContextId({
        location_context_id: " ",
        locationContextId: "loc-1",
      })
    ).toBe("loc-1");
  });
});
