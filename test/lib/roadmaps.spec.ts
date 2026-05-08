import { describe, expect, it } from "vitest";

import { findMissingMonumentRoadmapGoalIds } from "../../lib/queries/roadmap-reconciliation";

describe("findMissingMonumentRoadmapGoalIds", () => {
  it("returns monument goals not represented by top-level roadmap items or campaigns", () => {
    expect(
      findMissingMonumentRoadmapGoalIds({
        monumentGoalIds: ["goal-1", "goal-2", "goal-3", "goal-4"],
        roadmapGoalItemIds: ["goal-1"],
        campaignGoalIds: ["goal-3"],
      })
    ).toEqual(["goal-2", "goal-4"]);
  });

  it("deduplicates repeated monument goal ids while preserving first-seen order", () => {
    expect(
      findMissingMonumentRoadmapGoalIds({
        monumentGoalIds: ["goal-2", "goal-1", "goal-2", "goal-3"],
        roadmapGoalItemIds: ["goal-1"],
        campaignGoalIds: [],
      })
    ).toEqual(["goal-2", "goal-3"]);
  });
});
