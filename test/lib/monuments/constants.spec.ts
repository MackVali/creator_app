import { describe, expect, it } from "vitest";

import {
  MAX_MONUMENTS,
  getMaxMonumentsForTier,
} from "@/lib/monuments/constants";

describe("monument limits", () => {
  it("uses 8 as the global Monument cap", () => {
    expect(MAX_MONUMENTS).toBe(8);
  });

  it.each([
    ["CREATOR"],
    ["CREATOR PLUS"],
    ["ADMIN"],
    ["creator"],
    [" creator plus "],
    [null],
    [undefined],
    ["UNKNOWN"],
  ])("resolves %s to the global Monument cap", (tier) => {
    expect(getMaxMonumentsForTier(tier)).toBe(MAX_MONUMENTS);
  });
});
