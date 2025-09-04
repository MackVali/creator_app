import { describe, expect, it } from "vitest";
import { calculateDashOffset } from "../../src/app/(app)/dashboard/_skills/ProgressRing";

describe("ProgressRing", () => {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;

  it("gives full dash offset at 0%", () => {
    expect(calculateDashOffset(radius, 0)).toBeCloseTo(circumference);
  });

  it("gives half dash offset at 50%", () => {
    expect(calculateDashOffset(radius, 50)).toBeCloseTo(circumference / 2);
  });

  it("gives zero dash offset at 100%", () => {
    expect(calculateDashOffset(radius, 100)).toBeCloseTo(0);
  });
});

