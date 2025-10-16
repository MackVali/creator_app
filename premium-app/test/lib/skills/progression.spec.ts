import { describe, expect, it } from "vitest";

import { baseBracket, xpRequired } from "../../../lib/skills/progression";
import { mapRowToProgress } from "../../../lib/skills/skillProgress";

describe("progression helpers", () => {
  it("computes base bracket for known ranges", () => {
    expect(baseBracket(1)).toBe(10);
    expect(baseBracket(9)).toBe(10);
    expect(baseBracket(10)).toBe(14);
    expect(baseBracket(19)).toBe(14);
    expect(baseBracket(20)).toBe(20);
    expect(baseBracket(29)).toBe(20);
    expect(baseBracket(30)).toBe(24);
    expect(baseBracket(39)).toBe(24);
    expect(baseBracket(40)).toBe(30);
    expect(baseBracket(99)).toBe(30);
    expect(baseBracket(100)).toBe(50);
  });

  it("adds prestige bonus to xp requirement", () => {
    expect(xpRequired(10, 0)).toBe(14);
    expect(xpRequired(10, 3)).toBe(20);
    expect(xpRequired(25, 5)).toBe(30);
    expect(xpRequired(100, 2)).toBe(54);
    expect(xpRequired(8, -3)).toBe(10);
  });
});

describe("mapRowToProgress", () => {
  it("maps xp progress using computed requirement", () => {
    const progress = mapRowToProgress({
      skill_id: "skill",
      level: 12,
      prestige: 2,
      xp_into_level: 5,
    });

    expect(progress).not.toBeNull();
    expect(progress?.xpRequired).toBe(xpRequired(12, 2));
    expect(progress?.xpIntoLevel).toBe(5);
    expect(progress?.progressPercent).toBeCloseTo((5 / xpRequired(12, 2)) * 100);
  });

  it("falls back when numbers are missing or invalid", () => {
    const progress = mapRowToProgress({
      skill_id: "skill",
      level: null,
      prestige: "not-a-number",
      xp_into_level: -10,
    });

    expect(progress).not.toBeNull();
    expect(progress?.level).toBe(1);
    expect(progress?.prestige).toBe(0);
    expect(progress?.xpIntoLevel).toBe(0);
  });
});
