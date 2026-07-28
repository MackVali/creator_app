import { describe, expect, it } from "vitest";

import {
  DEFAULT_FITNESS_ACTION_TAB_ID,
  FITNESS_ACTION_TAB_SPECS,
} from "../../src/lib/fitness/actionTabs";

describe("Fitness action tabs", () => {
  it("uses Workout as the default Fitness tab", () => {
    expect(DEFAULT_FITNESS_ACTION_TAB_ID).toBe("start");
    expect(FITNESS_ACTION_TAB_SPECS[0]?.id).toBe(DEFAULT_FITNESS_ACTION_TAB_ID);
  });

  it("keeps ME as the last visible Fitness tab", () => {
    expect(FITNESS_ACTION_TAB_SPECS.map((tab) => tab.label)).toEqual([
      "Workout",
      "Exercises",
      "Favorites",
      "Routines",
      "Plans",
      "Custom",
      "ME",
    ]);
    expect(FITNESS_ACTION_TAB_SPECS.at(-1)?.id).toBe("me");
  });
});
