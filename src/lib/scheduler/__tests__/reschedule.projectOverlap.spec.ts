import { describe, expect, it } from "vitest";

import { pickProjectOverlapLoser } from "../projectOrdering";

type TestScheduleInstance = {
  id: string;
  source_type: "PROJECT";
  source_id: string;
  start_utc: string;
  end_utc: string;
  status: "scheduled";
  locked: boolean;
};

describe("pickProjectOverlapLoser", () => {
  it("keeps the better-ranked roadmap project when two project instances overlap", () => {
    const roadmapProject = {
      id: "project-roadmap",
      priority: "MEDIUM",
      stage: "BUILD",
      goal_id: "goal-roadmap",
    };
    const nonRoadmapProject = {
      id: "project-non-roadmap",
      priority: "MEDIUM",
      stage: "BUILD",
      goal_id: "goal-ad-hoc",
    };

    const goalsById = new Map([
      ["goal-roadmap", { id: "goal-roadmap", global_rank: 1 }],
      ["goal-ad-hoc", { id: "goal-ad-hoc", global_rank: null }],
    ]);

    const loser = pickProjectOverlapLoser(
      {
        id: "instance-non-roadmap",
        source_type: "PROJECT",
        source_id: nonRoadmapProject.id,
        start_utc: "2024-01-02T08:00:00Z",
        end_utc: "2024-01-02T09:00:00Z",
        status: "scheduled",
        locked: false,
      } as TestScheduleInstance,
      {
        id: "instance-roadmap",
        source_type: "PROJECT",
        source_id: roadmapProject.id,
        start_utc: "2024-01-02T08:30:00Z",
        end_utc: "2024-01-02T09:30:00Z",
        status: "scheduled",
        locked: false,
      } as TestScheduleInstance,
      {
        [roadmapProject.id]: roadmapProject,
        [nonRoadmapProject.id]: nonRoadmapProject,
      },
      goalsById
    );

    expect(loser?.id).toBe("instance-non-roadmap");
  });
});
