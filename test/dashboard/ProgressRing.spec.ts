import { describe, expect, it } from "vitest";
import { calculateDashOffset } from "../../src/app/(app)/dashboard/_skills/ProgressRing";

describe("ProgressRing", () => {
  it("calculates dash offset correctly", () => {
    const radius = 10;
    const circumference = 2 * Math.PI * radius;
    const offset = calculateDashOffset(radius, 75);
    expect(offset).toBeCloseTo(circumference * 0.25);
  });
});

