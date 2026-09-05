import { describe, expect, it, vi } from "vitest";

import { AREAS } from "@/config/areas";
import type { GlobalPriorityRoadmapItem } from "@/app/(app)/schedule/priorities/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/haptics/creatorHaptics", () => ({
  hapticComplete: vi.fn(),
  hapticErrorPattern: vi.fn(),
  hapticPress: vi.fn(),
  hapticSnap: vi.fn(),
  hapticSoftTick: vi.fn(),
  hapticWarningPattern: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseBrowser: vi.fn(),
}));

vi.mock("@/lib/projects/projectCompletion", () => ({
  recordProjectCompletion: vi.fn(),
}));

vi.mock("@/components/ui/FabCreationContext", () => ({
  useFabCreation: () => ({
    openProjectForm: vi.fn(),
    openTaskForm: vi.fn(),
  }),
}));

vi.mock("@/lib/effects/creatorXpRewardVisual", () => ({
  dispatchCreatorXpRewardVisual: vi.fn(),
}));

vi.mock("@/components/xp/CreatorXpSurgeHud", () => ({
  buildCreatorXpSurgePayload: vi.fn(() => ({})),
  resolveCreatorXpSurgeTitle: vi.fn(() => "XP"),
}));

import {
  buildAvailablePriorityFilterOptions,
  filterHabitRoadmapItemsByTimeBlock,
  filterGlobalPriorityItems,
} from "@/app/(app)/schedule/priorities/PriorityEditorClient";

const areaOptions = AREAS.map((area) => ({
  id: area.id,
  name: area.label,
  icon: area.emoji,
  sortOrder: area.sortOrder,
}));

describe("Priority Editor Area filters", () => {
  it("keeps canonical Area filters in CREATOR order", () => {
    const options = buildAvailablePriorityFilterOptions([], areaOptions);

    expect(options.areas.map((option) => option.id)).toEqual([
      "body",
      "mind",
      "work",
      "money",
      "people",
      "life",
      "creation",
      "experience",
    ]);
  });

  it("matches standalone Goals by direct areaId without inferring Monument ancestry", () => {
    const items: GlobalPriorityRoadmapItem[] = [
      {
        id: "area-goal",
        type: "goal",
        name: "Body goal",
        priority: "HIGH",
        areaId: "body",
      },
      {
        id: "monument-goal",
        type: "goal",
        name: "Monument goal",
        priority: "HIGH",
        monumentId: "body-monument",
      },
    ];

    const filtered = filterGlobalPriorityItems(
      items,
      [areaOptions[0]],
      [],
      []
    );

    expect(filtered.map((item) => item.id)).toEqual(["area-goal"]);
  });

  it("matches Campaigns and nested Goals by their own direct Area ownership", () => {
    const items: GlobalPriorityRoadmapItem[] = [
      {
        id: "campaign",
        type: "campaign",
        name: "Body campaign",
        priority: "HIGH",
        areaId: "body",
        goals: [
          {
            id: "body-nested-goal",
            name: "Body nested goal",
            priority: "HIGH",
            areaId: "body",
          },
          {
            id: "work-nested-goal",
            name: "Work nested goal",
            priority: "HIGH",
            areaId: "work",
          },
        ],
      },
    ];

    const filtered = filterGlobalPriorityItems(
      items,
      [areaOptions[0]],
      [],
      []
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("campaign");
    expect(filtered[0]?.goals?.map((goal) => goal.id)).toEqual([
      "body-nested-goal",
    ]);
  });

  it("keeps Area filters in the same OR relation group as Skill filters", () => {
    const items: GlobalPriorityRoadmapItem[] = [
      {
        id: "area-goal",
        type: "goal",
        name: "Body goal",
        priority: "HIGH",
        areaId: "body",
      },
      {
        id: "skill-goal",
        type: "goal",
        name: "Skill goal",
        priority: "HIGH",
        skills: [{ id: "skill-1", name: "Skill", icon: null }],
      },
    ];

    const filtered = filterGlobalPriorityItems(
      items,
      [areaOptions[0]],
      [],
      [{ id: "skill-1", name: "Skill", icon: null }]
    );

    expect(filtered.map((item) => item.id)).toEqual(["area-goal", "skill-goal"]);
  });

  it("filters Habit Time Blocks by Skill-derived areaId, not legacy goalAreaId", () => {
    const filtered = filterHabitRoadmapItemsByTimeBlock(
      [
        {
          id: "habit-canonical",
          name: "Canonical habit",
          habitType: "HABIT",
          areaId: "body",
          goalAreaId: "work",
        },
        {
          id: "habit-legacy-only",
          name: "Legacy habit",
          habitType: "HABIT",
          areaId: null,
          goalAreaId: "body",
        },
      ],
      {
        id: "block-body",
        name: "Body block",
        energy: "NO",
        allowAllHabitTypes: true,
        allowAllSkills: true,
        allowAllAreas: false,
        allowAllMonuments: true,
        allowedHabitTypes: [],
        allowedSkillIds: [],
        allowedAreaIds: ["body"],
        allowedMonumentIds: [],
      }
    );

    expect(filtered.map((item) => item.id)).toEqual(["habit-canonical"]);
  });
});
