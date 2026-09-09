import { describe, expect, it } from "vitest";

import {
  FREE_MONUMENTS_PER_AREA,
  PLUS_MONUMENTS_PER_AREA,
  getMaxMonumentsPerArea,
} from "@/lib/monuments/constants";

describe("Monument limits", () => {
  it("allows 4 Monuments per Area for Creator users", () => {
    expect(FREE_MONUMENTS_PER_AREA).toBe(4);
    expect(getMaxMonumentsPerArea(false)).toBe(4);
  });

  it("allows 16 Monuments per Area for Plus users", () => {
    expect(PLUS_MONUMENTS_PER_AREA).toBe(16);
    expect(getMaxMonumentsPerArea(true)).toBe(16);
  });
});
