import { describe, expect, it } from "vitest";
import { computeWidth } from "../../src/app/(app)/dashboard/_skills/SkillRow";

describe("SkillRow progress", () => {
  it("computes width for 0%", () => {
    expect(computeWidth(0)).toBe("0%");
  });
  it("computes width for 50%", () => {
    expect(computeWidth(50)).toBe("50%");
  });
  it("computes width for 100%", () => {
    expect(computeWidth(100)).toBe("100%");
  });
});

