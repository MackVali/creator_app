import { describe, expect, it, vi } from "vitest";

import type { GlobalPriorityRoadmapItem } from "@/app/(app)/schedule/priorities/utils";

vi.mock("@/lib/haptics/creatorHaptics", () => ({
  hapticComplete: vi.fn(),
  hapticErrorPattern: vi.fn(),
  hapticPress: vi.fn(),
  hapticSnap: vi.fn(),
  hapticSoftTick: vi.fn(),
}));

vi.mock("@/components/ui/FabCreationContext", () => ({
  useFabCreation: () => ({
    openProjectForm: vi.fn(),
    openTaskForm: vi.fn(),
  }),
}));

import {
  buildGlobalPriorityOrderPayload,
  moveGlobalPriorityItem,
} from "@/app/(app)/schedule/priorities/GlobalPriorityRoadmap";

describe("Priority Editor global ordering", () => {
  it("builds the canonical mixed Goal/Campaign save payload", () => {
    const items: GlobalPriorityRoadmapItem[] = [
      {
        id: "goal-1",
        type: "goal",
        name: "Goal 1",
        priority: "HIGH",
        priorityOrder: 1,
      },
      {
        id: "campaign-primary",
        sourceIds: ["campaign-primary", "campaign-duplicate"],
        type: "campaign",
        name: "Campaign",
        priority: "HIGH",
        priorityOrder: 2,
      },
    ];

    expect(buildGlobalPriorityOrderPayload(items)).toEqual([
      { id: "goal-1", type: "goal", priority: "HIGH" },
      { id: "campaign-primary", type: "campaign", priority: "HIGH" },
      { id: "campaign-duplicate", type: "campaign", priority: "HIGH" },
    ]);
  });

  it("reorders top-level items without changing nested campaign semantics", () => {
    const goal: GlobalPriorityRoadmapItem = {
      id: "goal-1",
      type: "goal",
      name: "Goal 1",
      priority: "HIGH",
      priorityOrder: 1,
    };
    const campaign: GlobalPriorityRoadmapItem = {
      id: "campaign-1",
      type: "campaign",
      name: "Campaign",
      priority: "HIGH",
      priorityOrder: 2,
      goals: [
        {
          id: "nested-goal",
          name: "Nested Goal",
          priority: "HIGH",
          priorityOrder: 1,
        },
      ],
    };

    const reordered = moveGlobalPriorityItem(
      [goal, campaign],
      campaign,
      "HIGH",
      goal
    );

    expect(
      buildGlobalPriorityOrderPayload(reordered).map((item) => item.id)
    ).toEqual(["campaign-1", "goal-1"]);
    expect(reordered.find((item) => item.id === "campaign-1")?.goals).toEqual(
      campaign.goals
    );
  });
});
