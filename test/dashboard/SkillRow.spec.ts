import { describe, expect, it } from "vitest";
import {
  computeWidth,
  hasVisibleLevelProgress,
} from "../../src/app/(app)/dashboard/_skills/SkillRow";

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

  it("does not render a filled bar for 0 XP into the current level", () => {
    expect(hasVisibleLevelProgress({ xpIntoLevel: 0, progressPercent: 0 })).toBe(false);
    expect(hasVisibleLevelProgress({ xpIntoLevel: 0, progressPercent: 12 })).toBe(false);
  });

  it("renders a filled bar once there is progress into the current level", () => {
    expect(hasVisibleLevelProgress({ xpIntoLevel: 1, progressPercent: 7 })).toBe(true);
  });
});
