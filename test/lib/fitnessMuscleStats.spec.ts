import { describe, expect, it } from "vitest";

import type {
  FitnessWorkoutDatabaseEntry,
  FitnessWorkoutLogMetadata,
} from "../../src/lib/focus/fitnessWorkoutFocusSession";
import { getFitnessMuscleGroupStats } from "../../src/lib/fitness/muscleStats";

type WorkoutSet = NonNullable<
  NonNullable<FitnessWorkoutLogMetadata["exercises"]>[number]["sets"]
>[number];

function entry(
  id: string,
  log: FitnessWorkoutLogMetadata,
): FitnessWorkoutDatabaseEntry {
  return {
    id,
    createdAt: "2026-07-20T12:00:00.000Z",
    updatedAt: "2026-07-20T12:00:00.000Z",
    values: {
      metadata: {
        fitnessWorkoutLog: log,
      },
    },
  };
}

function set(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    setNumber: 1,
    plannedReps: 8,
    completedReps: 8,
    status: "completed",
    completionStatus: "completed",
    completedAt: "2026-07-27T14:00:00.000Z",
    isWarmup: false,
    ...overrides,
  };
}

function log(
  status: FitnessWorkoutLogMetadata["status"],
  exercises: NonNullable<FitnessWorkoutLogMetadata["exercises"]>,
): FitnessWorkoutLogMetadata {
  return {
    version: 1,
    status,
    workoutName: "Workout",
    loggedAt: "2026-07-27T14:00:00.000Z",
    exercises,
  };
}

describe("Fitness muscle group stats", () => {
  it("aggregates completed working sets into the correct muscle groups", () => {
    const stats = getFitnessMuscleGroupStats(
      [
        entry(
          "entry-1",
          log("completed", [
            {
              exerciseId: "bench",
              name: "Bench Press",
              sets: [set({ setNumber: 1 }), set({ setNumber: 2 })],
            },
            {
              exerciseId: "lat-pulldown",
              name: "Lat Pulldown",
              sets: [set()],
            },
          ]),
        ),
      ],
      { now: new Date("2026-07-28T12:00:00.000Z") },
    );

    expect(stats.find((stat) => stat.id === "chest")).toMatchObject({
      completedSetCount: 2,
      workloadPercentage: 100,
    });
    expect(stats.find((stat) => stat.id === "back")).toMatchObject({
      completedSetCount: 1,
      workloadPercentage: 50,
    });
  });

  it("excludes warmup, dismissed, pending, in-progress, abandoned, and malformed data", () => {
    const stats = getFitnessMuscleGroupStats(
      [
        entry(
          "completed-entry",
          log("completed", [
            {
              exerciseId: "bench",
              name: "Bench Press",
              sets: [
                set(),
                set({ isWarmup: true }),
                set({ status: "dismissed", completionStatus: "dismissed" }),
                set({ status: "pending", completionStatus: "pending" }),
                set({ completedReps: null, plannedReps: null }),
              ],
            },
            {
              exerciseId: "",
              name: "",
              sets: [set()],
            },
          ]),
        ),
        entry(
          "in-progress-entry",
          log("in_progress", [{ exerciseId: "bench", name: "Bench Press", sets: [set()] }]),
        ),
        entry(
          "abandoned-entry",
          log("abandoned", [{ exerciseId: "bench", name: "Bench Press", sets: [set()] }]),
        ),
      ],
      { now: new Date("2026-07-28T12:00:00.000Z") },
    );

    expect(stats.find((stat) => stat.id === "chest")?.completedSetCount).toBe(1);
  });

  it("includes legacy version-1 completed logs without status", () => {
    const stats = getFitnessMuscleGroupStats(
      [
        entry("legacy-entry", {
          version: 1,
          workoutName: "Legacy Push",
          loggedAt: "2026-07-27T14:00:00.000Z",
          exercises: [
            {
              exerciseId: "push-up",
              name: "Push-up",
              sets: [
                {
                  plannedReps: 10,
                  completedAt: "2026-07-27T14:00:00.000Z",
                },
              ],
            },
          ],
        }),
      ],
      { now: new Date("2026-07-28T12:00:00.000Z") },
    );

    expect(stats.find((stat) => stat.id === "chest")?.completedSetCount).toBe(1);
  });

  it("keeps zero-set muscle groups present", () => {
    const stats = getFitnessMuscleGroupStats([], {
      now: new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(stats.map((stat) => stat.id)).toEqual([
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "quads",
      "hamstrings",
      "glutes",
      "calves",
      "core",
      "forearms-grip",
    ]);
    expect(stats.every((stat) => stat.completedSetCount === 0)).toBe(true);
  });
});
