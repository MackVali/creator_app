import { describe, expect, it } from "vitest";

import {
  FITNESS_CUSTOM_LIBRARY_METADATA_KEY,
  buildFitnessCustomLibraryEntry,
  customFitnessPlanToTemplate,
  customFitnessRoutineToTemplate,
  getFitnessCustomLibraryFromEntries,
  mergeFitnessCustomLibraryMetadata,
  readFitnessCustomLibraryFromMetadata,
  upsertCustomFitnessExercise,
  upsertCustomFitnessPlan,
  upsertCustomFitnessRoutine,
  type CustomFitnessExercise,
  type CustomFitnessPlan,
  type CustomFitnessRoutine,
  type FitnessCustomLibrary,
} from "../../src/lib/fitness/customLibrary";

const now = "2026-07-30T12:00:00.000Z";

function library(overrides: Partial<FitnessCustomLibrary> = {}): FitnessCustomLibrary {
  return {
    version: 1,
    exercises: [],
    routines: [],
    plans: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const exercise: CustomFitnessExercise = {
  id: "custom-exercise-cable-y-raise",
  name: "Cable Y Raise",
  movementType: "Pull",
  primaryArea: "Rear delts",
  equipment: "Cable",
  guidance: "3 sets x 12 reps",
  notes: "Pause at the top.",
  createdAt: now,
  updatedAt: now,
};

const routine: CustomFitnessRoutine = {
  id: "custom-routine-upper-accessories",
  title: "Upper Accessories",
  goal: "Hypertrophy",
  level: "Intermediate",
  equipment: "Cable",
  durationMinutes: 35,
  exercises: [{ name: "Cable Y Raise", sets: 3, reps: 12, role: "accessory" }],
  createdAt: now,
  updatedAt: now,
};

const plan: CustomFitnessPlan = {
  id: "custom-plan-three-day",
  title: "Three Day Custom",
  description: "Simple custom rotation.",
  goal: "Build muscle",
  level: "Intermediate",
  equipment: "Cable",
  recommendedDaysPerWeek: [3],
  allowedDaysPerWeek: [3],
  sessionLengthOptions: [35],
  routineSequence: ["custom-routine-upper-accessories"],
  createdAt: now,
  updatedAt: now,
};

describe("Fitness custom library metadata", () => {
  it("persists a versioned library without overwriting unrelated metadata", () => {
    const saved = library({ exercises: [exercise] });
    const merged = mergeFitnessCustomLibraryMetadata(
      { unrelated: "keep-me", fitnessProfile: { ok: true } },
      saved,
    );

    expect(merged.unrelated).toBe("keep-me");
    expect(merged.fitnessProfile).toEqual({ ok: true });
    expect(merged[FITNESS_CUSTOM_LIBRARY_METADATA_KEY]).toEqual(saved);
    expect(readFitnessCustomLibraryFromMetadata(merged)).toEqual(saved);
  });

  it("stores the custom library in the existing hidden Fitness metadata entry", () => {
    const saved = library({ exercises: [exercise], routines: [routine], plans: [plan] });
    const entry = buildFitnessCustomLibraryEntry({
      databaseId: "fitness",
      existingEntry: {
        id: "creator-fitness-profile-fitness",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
        values: { metadata: { fitnessProfile: { ok: true } } },
      },
      library: saved,
      now,
    });

    expect(entry.id).toBe("creator-fitness-profile-fitness");
    expect(getFitnessCustomLibraryFromEntries([entry])).toEqual(saved);
    expect(entry.values.metadata).toMatchObject({
      fitnessProfile: { ok: true },
      fitnessCustomLibrary: saved,
    });
  });

  it("upserts exercises, routines, and plans while preserving createdAt", () => {
    const withExercise = upsertCustomFitnessExercise(null, exercise, now);
    const withRoutine = upsertCustomFitnessRoutine(withExercise, routine, now);
    const withPlan = upsertCustomFitnessPlan(withRoutine, plan, now);

    expect(withPlan.createdAt).toBe(now);
    expect(withPlan.exercises).toEqual([exercise]);
    expect(withPlan.routines).toEqual([routine]);
    expect(withPlan.plans).toEqual([plan]);
  });

  it("converts custom routines and plans into reusable template shapes", () => {
    expect(customFitnessRoutineToTemplate(routine)).toMatchObject({
      id: routine.id,
      group: "custom",
      title: routine.title,
      exercises: routine.exercises,
    });
    expect(customFitnessPlanToTemplate(plan)).toMatchObject({
      id: plan.id,
      title: plan.title,
      routineSequence: [routine.id],
    });
  });
});

