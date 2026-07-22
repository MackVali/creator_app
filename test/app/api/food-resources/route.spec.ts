import { describe, expect, it } from "vitest";

import { getAttachableFoodResourceId } from "@/lib/nutrition/foods";

describe("compatible Grocery food linkage", () => {
  const scannedId = "11111111-1111-4111-8111-111111111111";

  it("attaches a valid scanned catalog UUID when food_id is null", () => {
    expect(getAttachableFoodResourceId(null, scannedId)).toBe(scannedId);
  });

  it("does not replace an existing non-null food_id", () => {
    expect(getAttachableFoodResourceId(
      "22222222-2222-4222-8222-222222222222",
      scannedId,
    )).toBeNull();
  });
});
