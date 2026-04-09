import { describe, expect, it } from "vitest";
import { passesTimeBlockConstraints } from "../constraints";

describe("passesTimeBlockConstraints empty candidate handling", () => {
  it("allows PROJECTS with empty skill and monument candidates in constrained windows", () => {
    const result = passesTimeBlockConstraints(
      { isProject: true, allowEmptyProjectCandidates: true },
      {
        allowAllSkills: false,
        allowedSkillIds: ["skill-a"],
        allowAllMonuments: false,
        allowedMonumentIds: ["mon-1"],
      }
    );

    expect(result).toBe(true);
  });

  it("still rejects HABITs with empty skill and monument candidates in constrained windows", () => {
    const result = passesTimeBlockConstraints(
      {},
      {
        allowAllSkills: false,
        allowedSkillIds: ["skill-a"],
        allowAllMonuments: false,
        allowedMonumentIds: ["mon-1"],
      }
    );

    expect(result).toBe(false);
  });
});
