import { describe, expect, it } from "vitest";
import { deriveInitialIndex, computeNextIndex } from "../../src/app/(app)/dashboard/_skills/carouselUtils";
import type { SimpleCategory as Category } from "../../src/app/(app)/dashboard/_skills/carouselUtils";

describe("SkillsCarousel helpers", () => {
  const cats: Category[] = [
    { id: "music", name: "Music" },
    { id: "craft", name: "Craft" },
    { id: "tech", name: "Tech" },
  ];

  it("derives initial index from query", () => {
    expect(deriveInitialIndex(cats, "craft")).toBe(1);
    expect(deriveInitialIndex(cats, "unknown")).toBe(0);
  });

  it("computes next index based on drag", () => {
    expect(computeNextIndex(1, -40, 0, cats.length)).toBe(2);
    expect(computeNextIndex(1, 40, 0, cats.length)).toBe(0);
    expect(computeNextIndex(1, 0, 400, cats.length)).toBe(0);
    expect(computeNextIndex(1, 0, -400, cats.length)).toBe(2);
    expect(computeNextIndex(0, 0, 0, cats.length)).toBe(0);
  });
});
