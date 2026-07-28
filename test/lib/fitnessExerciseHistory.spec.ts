import { describe, expect, it } from "vitest";

import type {
  FitnessWorkoutDatabaseEntry,
  FitnessWorkoutLogMetadata,
} from "../../src/lib/focus/fitnessWorkoutFocusSession";
import {
  getFitnessExerciseHistories,
  getFitnessPrHighlights,
} from "../../src/lib/fitness/exerciseHistory";

type WorkoutExercise = NonNullable<FitnessWorkoutLogMetadata["exercises"]>[number];
type WorkoutSet = NonNullable<WorkoutExercise["sets"]>[number];

function entry(
  id: string,
  log: FitnessWorkoutLogMetadata,
  createdAt = "2026-07-20T12:00:00.000Z",
): FitnessWorkoutDatabaseEntry {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
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
    totalSets: 1,
    plannedReps: 8,
    completedReps: 8,
    weight: 100,
    unit: "lb",
    status: "completed",
    completionStatus: "completed",
    completedAt: "2026-07-20T12:30:00.000Z",
    isWarmup: false,
    ...overrides,
  };
}

function exercise(
  name: string,
  sets: WorkoutSet[],
  exerciseId = name,
): WorkoutExercise {
  return { exerciseId, name, sets };
}

function log(
  id: string,
  exercises: WorkoutExercise[],
  overrides: Partial<FitnessWorkoutLogMetadata> = {},
): FitnessWorkoutLogMetadata {
  return {
    version: 1,
    sessionId: id,
    status: "completed",
    workoutName: id,
    loggedAt: `2026-07-${id.padStart(2, "0")}T12:00:00.000Z`,
    exercises,
    ...overrides,
  };
}

describe("Fitness exercise history aggregation", () => {
  it("finds the heaviest completed weighted working set", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [
        set({ weight: 100 }),
        set({ setNumber: 2, weight: 135 }),
      ])])),
    ]);

    expect(histories[0].records.find((record) => record.type === "heaviest_weight"))
      .toMatchObject({ valueLabel: "135 lb", typeLabel: "Heaviest lb" });
  });

  it("finds the highest bodyweight rep set", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Push-up", [
        set({ weight: null, unit: "bodyweight", completedReps: 12 }),
        set({ setNumber: 2, weight: null, unit: "bodyweight", completedReps: 18 }),
      ])])),
    ]);

    expect(histories[0].records.find((record) => record.type === "highest_reps"))
      .toMatchObject({ valueLabel: "18 reps", typeLabel: "Highest reps" });
  });

  it("finds the longest timed set", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Plank", [
        set({
          plannedReps: null,
          completedReps: null,
          weight: null,
          unit: "bodyweight",
          completedDurationSeconds: 30,
        }),
        set({
          setNumber: 2,
          plannedReps: null,
          completedReps: null,
          weight: null,
          unit: "bodyweight",
          completedDurationSeconds: 45,
        }),
      ])])),
    ]);

    expect(histories[0].records.find((record) => record.type === "longest_duration"))
      .toMatchObject({ valueLabel: "45 sec", typeLabel: "Longest duration" });
  });

  it("excludes warmup, pending, dismissed, in-progress, and abandoned work", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [
        set({ weight: 100 }),
        set({ setNumber: 2, weight: 200, isWarmup: true }),
        set({ setNumber: 3, weight: 205, status: "pending", completionStatus: "pending" }),
        set({ setNumber: 4, weight: 210, status: "dismissed", completionStatus: "dismissed" }),
      ])])),
      entry("entry-2", log("21", [exercise("Bench Press", [set({ weight: 225 })])], {
        status: "in_progress",
      })),
      entry("entry-3", log("22", [exercise("Bench Press", [set({ weight: 245 })])], {
        status: "abandoned",
      })),
    ]);

    expect(histories[0].records.find((record) => record.type === "heaviest_weight"))
      .toMatchObject({ valueLabel: "100 lb" });
  });

  it("includes legacy version-1 logs without status", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [set({ weight: 115 })])], {
        status: undefined,
      })),
    ]);

    expect(histories[0].records.find((record) => record.type === "heaviest_weight"))
      .toMatchObject({ valueLabel: "115 lb" });
  });

  it("keeps lb and kg records separate", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [
        set({ weight: 135, unit: "lb" }),
        set({ setNumber: 2, weight: 100, unit: "kg" }),
      ])])),
    ]);

    expect(histories[0].records.filter((record) => record.type === "heaviest_weight"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ valueLabel: "135 lb" }),
        expect.objectContaining({ valueLabel: "100 kg" }),
      ]));
  });

  it("returns the latest five completed sessions sorted newest first", () => {
    const entries = [18, 19, 20, 21, 22, 23].map((day) =>
      entry(
        `entry-${day}`,
        log(String(day), [exercise("Bench Press", [set({ weight: day })])]),
      ),
    );

    const histories = getFitnessExerciseHistories(entries);

    expect(histories[0].recentSessions.map((session) => session.workoutName)).toEqual([
      "23",
      "22",
      "21",
      "20",
      "19",
    ]);
  });

  it("explains a hold when the latest workout misses target reps", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [
        set({ weight: 100, plannedReps: 8, completedReps: 8 }),
        set({ setNumber: 2, weight: 100, plannedReps: 8, completedReps: 7 }),
        set({ setNumber: 3, weight: 100, plannedReps: 8, completedReps: 6 }),
      ])])),
    ]);

    expect(histories[0].progressionReason).toBe(
      "Hold at 100 lb - the latest workout missed the target on 2 sets.",
    );
  });

  it("explains an increase when the latest workout reaches target reps", () => {
    const histories = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Bench Press", [
        set({ weight: 100, plannedReps: 8, completedReps: 8 }),
        set({ setNumber: 2, weight: 100, plannedReps: 8, completedReps: 8 }),
      ])])),
    ]);

    expect(histories[0].progressionReason).toBe(
      "Increase to 105 lb - all latest working sets reached 8 reps.",
    );
  });

  it("does not create fake PR highlights for empty or planned-only history", () => {
    const plannedOnly = getFitnessExerciseHistories([
      entry("entry-1", log("20", [exercise("Push-up", [
        set({
          completedReps: null,
          weight: null,
          unit: "bodyweight",
          status: undefined,
          completionStatus: undefined,
        }),
      ])])),
    ]);

    expect(getFitnessExerciseHistories([])).toEqual([]);
    expect(plannedOnly).toEqual([]);
    expect(getFitnessPrHighlights(plannedOnly)).toEqual([]);
  });
});
