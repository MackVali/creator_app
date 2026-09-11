import { describe, expect, it } from "vitest";

import { buildProjectScheduleCandidates } from "../projects";
import { placeItemInWindows } from "../placement";
import type { ScheduleInstance, ScheduleInstanceCreateBatcher } from "../instanceRepo";
import type { ProjectLite, TaskLite } from "../weight";

const project = (overrides: Partial<ProjectLite> = {}): ProjectLite => ({
  id: "project-a",
  name: "Project A",
  priority: "MEDIUM",
  stage: "BUILD",
  energy: "LOW",
  duration_min: 45,
  goal_id: "goal-a",
  goal_area_id: "area-a",
  globalRank: 10,
  ...overrides,
});

const task = (overrides: Partial<TaskLite> = {}): TaskLite => ({
  id: "task-a",
  name: "Task A",
  priority: "MEDIUM",
  stage: "Prepare",
  duration_min: 30,
  energy: "MEDIUM",
  project_id: "project-a",
  skill_id: null,
  skill_icon: null,
  completed_at: null,
  ...overrides,
});

describe("buildProjectScheduleCandidates", () => {
  it("keeps a project with no tasks as a PROJECT scheduling candidate", () => {
    const [candidate] = buildProjectScheduleCandidates([project()], []);

    expect(candidate).toMatchObject({
      id: "project-a",
      sourceType: "PROJECT",
      parentProjectId: "project-a",
      duration_min: 45,
    });
  });

  it("turns unfinished project tasks into separate TASK candidates", () => {
    const candidates = buildProjectScheduleCandidates(
      [project({ duration_min: null })],
      [
        task({ id: "task-120", name: "Implement purchase flow", duration_min: 120 }),
        task({ id: "task-60", name: "Confirm ownership state", duration_min: 60 }),
      ]
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.sourceType)).toEqual([
      "TASK",
      "TASK",
    ]);
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual([
      "task-120",
      "task-60",
    ]);
    expect(candidates.map((candidate) => candidate.duration_min).sort((a, b) => b - a)).toEqual([
      120,
      60,
    ]);
  });

  it("excludes completed tasks from automatic task candidates", () => {
    const candidates = buildProjectScheduleCandidates(
      [project()],
      [
        task({ id: "task-open", completed_at: null }),
        task({ id: "task-done", completed_at: "2026-09-11T12:00:00Z" }),
      ]
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["task-open"]);
  });

  it("does not fall back to a generic PROJECT block when all project tasks are completed", () => {
    const candidates = buildProjectScheduleCandidates(
      [project()],
      [
        task({ id: "task-done-a", completed_at: "2026-09-11T12:00:00Z" }),
        task({ id: "task-done-b", completed_at: "2026-09-11T13:00:00Z" }),
      ]
    );

    expect(candidates).toEqual([]);
  });

  it("keeps the parent project global rank authoritative across task chunks", () => {
    const candidates = buildProjectScheduleCandidates(
      [
        project({ id: "project-low-rank", name: "Low Rank", globalRank: 2 }),
        project({ id: "project-high-rank", name: "High Rank", globalRank: 1 }),
      ],
      [
        task({ id: "task-low-rank", project_id: "project-low-rank", priority: "HIGH" }),
        task({ id: "task-high-rank", project_id: "project-high-rank", priority: "LOW" }),
      ]
    ).sort((a, b) => (a.globalRank ?? Infinity) - (b.globalRank ?? Infinity));

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "task-high-rank",
      "task-low-rank",
    ]);
  });

  it("orders tasks by stage and priority when DB enum values are uppercase", () => {
    const candidates = buildProjectScheduleCandidates(
      [project()],
      [
        task({ id: "perfect-high", name: "B", stage: "PERFECT", priority: "HIGH" }),
        task({ id: "prepare-low", name: "A", stage: "PREPARE", priority: "LOW" }),
        task({ id: "produce-high", name: "C", stage: "PRODUCE", priority: "HIGH" }),
      ]
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      "prepare-low",
      "produce-high",
      "perfect-high",
    ]);
  });

  it("allows task chunks from one project to schedule into separate available days", async () => {
    const candidates = buildProjectScheduleCandidates(
      [project({ duration_min: null })],
      [
        task({ id: "task-120", duration_min: 120 }),
        task({ id: "task-60", duration_min: 60 }),
      ]
    ).sort((a, b) => b.duration_min - a.duration_min);
    const created: ScheduleInstance[] = [];
    const createBatcher: ScheduleInstanceCreateBatcher = {
      enqueue(input) {
        const instance = {
          id: `instance-${input.sourceId}`,
          created_at: "",
          updated_at: "",
          user_id: input.userId,
          source_type: input.sourceType,
          source_id: input.sourceId,
          window_id: input.windowId ?? null,
          day_type_time_block_id: input.dayTypeTimeBlockId ?? null,
          time_block_id: input.timeBlockId ?? null,
          overlay_window_id: input.overlayWindowId ?? null,
          start_utc: input.startUTC,
          end_utc: input.endUTC,
          duration_min: input.durationMin,
          status: "scheduled",
          weight_snapshot: input.weightSnapshot ?? null,
          energy_resolved: input.energyResolved,
          canceled_reason: null,
          completed_at: null,
          locked: false,
          placement_source: "scheduler",
          event_name: input.eventName ?? null,
          practice_context_monument_id: input.practiceContextId ?? null,
          metadata: input.metadata ?? null,
        } as ScheduleInstance;
        created.push(instance);
        return instance;
      },
      discard: () => false,
      flush: async () => {},
      get size() {
        return created.length;
      },
    };

    const windows = [
      {
        id: "window-a",
        key: "window-a",
        startLocal: new Date("2026-09-14T09:00:00Z"),
        endLocal: new Date("2026-09-14T12:00:00Z"),
        availableStartLocal: new Date("2026-09-14T09:00:00Z"),
      },
    ];
    const first = await placeItemInWindows({
      userId: "user-a",
      item: {
        id: candidates[0].id,
        sourceType: candidates[0].sourceType,
        duration_min: candidates[0].duration_min,
        energy: candidates[0].energy,
        weight: candidates[0].weight,
        eventName: candidates[0].name,
      },
      windows,
      date: new Date("2026-09-14T00:00:00Z"),
      timeZone: "UTC",
      createBatcher,
      existingInstances: [],
    });
    const second = await placeItemInWindows({
      userId: "user-a",
      item: {
        id: candidates[1].id,
        sourceType: candidates[1].sourceType,
        duration_min: candidates[1].duration_min,
        energy: candidates[1].energy,
        weight: candidates[1].weight,
        eventName: candidates[1].name,
      },
      windows: [
        {
          id: "window-b",
          key: "window-b",
          startLocal: new Date("2026-09-15T09:00:00Z"),
          endLocal: new Date("2026-09-15T12:00:00Z"),
          availableStartLocal: new Date("2026-09-15T09:00:00Z"),
        },
      ],
      date: new Date("2026-09-15T00:00:00Z"),
      timeZone: "UTC",
      createBatcher,
      existingInstances: [],
    });

    expect("status" in first && first.data?.source_type).toBe("TASK");
    expect("status" in second && second.data?.source_type).toBe("TASK");
    expect(created.map((instance) => instance.source_id)).toEqual([
      "task-120",
      "task-60",
    ]);
    expect(created.map((instance) => instance.duration_min)).toEqual([120, 60]);
  });
});
