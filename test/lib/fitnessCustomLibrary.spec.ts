import { describe, expect, it } from "vitest";

import {
  FITNESS_ROUTINE_TEMPLATES,
  type FitnessRoutineTemplate,
} from "../../src/lib/fitness/routineTemplates";
import {
  FITNESS_CUSTOM_LIBRARY_METADATA_KEY,
  buildFitnessCustomLibraryEntry,
  customFitnessPlanToTemplate,
  customFitnessRoutineToTemplate,
  deleteCustomFitnessExercise,
  deleteCustomFitnessPlan,
  deleteCustomFitnessRoutine,
  getFitnessCustomLibraryFromEntries,
  mergeFitnessCustomLibraryMetadata,
  normalizeFitnessCustomName,
  readFitnessCustomLibrary,
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
  description: "Upper body accessory session.",
  goal: "Hypertrophy",
  level: "Intermediate",
  durationMinutes: 35,
  exercises: [
    {
      exerciseId: "custom-exercise-cable-y-raise",
      source: "custom",
      order: 1,
      name: "Cable Y Raise",
      sets: 3,
      reps: 12,
      role: "accessory",
      restSeconds: 45,
      instruction: "Pause at the top.",
    },
  ],
  createdAt: now,
  updatedAt: now,
};

const plan: CustomFitnessPlan = {
  id: "custom-plan-three-day",
  title: "Three Day Custom",
  description: "Simple custom rotation.",
  goal: "Build muscle",
  level: "Intermediate",
  source: "custom",
  recommendedDaysPerWeek: [3],
  allowedDaysPerWeek: [3],
  routineSequence: [
    {
      id: "custom-plan-sequence-upper-accessories-1",
      routineId: "custom-routine-upper-accessories",
      source: "custom",
      order: 1,
    },
  ],
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

  it("keeps stable ids and createdAt values when editing custom entities", () => {
    const original = library({ exercises: [exercise], routines: [routine], plans: [plan] });
    const editedAt = "2026-07-31T12:00:00.000Z";
    const editedExercise = {
      ...exercise,
      name: "Cable Y Raise Strict",
      updatedAt: editedAt,
    };
    const editedRoutine = {
      ...routine,
      title: "Upper Accessories Strict",
      updatedAt: editedAt,
    };
    const editedPlan = {
      ...plan,
      title: "Three Day Custom Strict",
      updatedAt: editedAt,
    };

    const next = upsertCustomFitnessPlan(
      upsertCustomFitnessRoutine(
        upsertCustomFitnessExercise(original, editedExercise, editedAt),
        editedRoutine,
        editedAt,
      ),
      editedPlan,
      editedAt,
    );

    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]).toMatchObject({
      id: exercise.id,
      name: "Cable Y Raise Strict",
      createdAt: now,
      updatedAt: editedAt,
    });
    expect(next.routines).toHaveLength(1);
    expect(next.routines[0]).toMatchObject({
      id: routine.id,
      title: "Upper Accessories Strict",
      createdAt: now,
      updatedAt: editedAt,
    });
    expect(next.plans).toHaveLength(1);
    expect(next.plans[0]).toMatchObject({
      id: plan.id,
      title: "Three Day Custom Strict",
      createdAt: now,
      updatedAt: editedAt,
    });
  });

  it("blocks reference-unsafe deletes without cascading custom content", () => {
    const saved = library({
      exercises: [exercise],
      routines: [
        {
          ...routine,
          exercises: [
            {
              exerciseId: exercise.id,
              source: "custom",
              order: 1,
              name: exercise.name,
              sets: 3,
              reps: 12,
              role: "accessory",
            } as CustomFitnessRoutine["exercises"][number],
          ],
        },
      ],
      plans: [plan],
    });

    const exerciseDelete = deleteCustomFitnessExercise(saved, exercise.id, now);
    const routineDelete = deleteCustomFitnessRoutine(saved, routine.id, now);
    const planDelete = deleteCustomFitnessPlan(saved, plan.id, now);

    expect(exerciseDelete.ok).toBe(false);
    if (!exerciseDelete.ok) {
      expect(exerciseDelete.references.map((item) => item.title)).toEqual([routine.title]);
    }
    expect(routineDelete.ok).toBe(false);
    if (!routineDelete.ok) {
      expect(routineDelete.references.map((item) => item.title)).toEqual([plan.title]);
    }
    expect(planDelete.ok).toBe(true);
    if (planDelete.ok) {
      expect(planDelete.library.exercises).toEqual([exercise]);
      expect(planDelete.library.routines).toEqual(saved.routines);
      expect(planDelete.library.plans).toEqual([]);
    }
  });

  it("normalizes duplicate labels consistently for builder validation", () => {
    expect(normalizeFitnessCustomName(" Cable   Y-Raise! ")).toBe("cable y raise");
    expect(normalizeFitnessCustomName("Cable Y Raise")).toBe("cable y raise");
  });

  it("converts custom routines and plans into reusable template shapes", () => {
    expect(customFitnessRoutineToTemplate(routine, {
      equipment: "Cable",
      durationMinutes: 34,
    })).toMatchObject({
      id: routine.id,
      group: "custom",
      title: routine.title,
      equipment: "Cable",
      durationMinutes: 35,
      exercises: routine.exercises,
    });
    expect(customFitnessPlanToTemplate(plan)).toMatchObject({
      id: plan.id,
      title: plan.title,
      source: "custom",
      routineSequence: [routine.id],
    });
  });

  it("normalizes legacy custom plan routine ids into ordered source-aware entries", () => {
    const legacy = {
      ...library({ plans: [] }),
      plans: [
        {
          id: "custom-plan-legacy",
          title: "Legacy Plan",
          goal: "Strength",
          level: "Intermediate",
          equipment: "Cable",
          recommendedDaysPerWeek: [3],
          allowedDaysPerWeek: [2, 3, 4],
          sessionLengthOptions: [45],
          routineSequence: ["push-day", "custom-routine-upper-accessories", "push-day"],
          createdAt: now,
          updatedAt: now,
        },
      ],
    };

    expect(readFitnessCustomLibrary(legacy)?.plans[0]).toMatchObject({
      id: "custom-plan-legacy",
      source: "custom",
      allowedDaysPerWeek: [2, 3, 4],
      recommendedDaysPerWeek: [3],
      routineSequence: [
        {
          id: "legacy-1-push-day",
          routineId: "push-day",
          source: "creator",
          order: 1,
        },
        {
          id: "legacy-2-custom-routine-upper-accessories",
          routineId: "custom-routine-upper-accessories",
          source: "custom",
          order: 2,
        },
        {
          id: "legacy-3-push-day",
          routineId: "push-day",
          source: "creator",
          order: 3,
        },
      ],
    });
  });

  it("round-trips exact ordered prescriptions and warmup roles", () => {
    const saved = library({
      routines: [
        {
          ...routine,
          durationMinutes: undefined,
          exercises: [
            {
              exerciseId: "Push-up",
              source: "built-in",
              order: 2,
              name: "Push-up",
              sets: 3,
              reps: 10,
              role: "main",
            },
            {
              exerciseId: exercise.id,
              source: "custom",
              order: 1,
              name: exercise.name,
              sets: 2,
              durationSeconds: 30,
              restSeconds: 20,
              role: "warmup",
              instruction: "Easy tempo.",
            },
          ],
        },
      ],
    });

    const reloaded = readFitnessCustomLibrary(saved);

    expect(reloaded?.routines[0].durationMinutes).toBeUndefined();
    expect(reloaded?.routines[0].exercises).toEqual([
      {
        exerciseId: exercise.id,
        source: "custom",
        order: 1,
        name: exercise.name,
        sets: 2,
        durationSeconds: 30,
        restSeconds: 20,
        role: "warmup",
        instruction: "Easy tempo.",
      },
      {
        exerciseId: "Push-up",
        source: "built-in",
        order: 2,
        name: "Push-up",
        sets: 3,
        reps: 10,
        role: "main",
      },
    ]);
  });

  it("adapts legacy routines without losing executable prescriptions", () => {
    const legacy = {
      version: 1,
      exercises: [],
      routines: [
        {
          id: routine.id,
          title: routine.title,
          goal: routine.goal,
          level: routine.level,
          equipment: "Cable",
          durationMinutes: 40,
          exercises: [
            { name: "Cable Y Raise", sets: 3, reps: 12, role: "primary" },
            { name: "Plank", sets: 2, durationSeconds: 45, role: "conditioning" },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
      plans: [],
      createdAt: now,
      updatedAt: now,
    };

    expect(readFitnessCustomLibrary(legacy)?.routines[0].exercises).toEqual([
      {
        exerciseId: "Cable Y Raise",
        source: "built-in",
        order: 1,
        name: "Cable Y Raise",
        sets: 3,
        reps: 12,
        role: "main",
      },
      {
        exerciseId: "Plank",
        source: "built-in",
        order: 2,
        name: "Plank",
        sets: 2,
        durationSeconds: 45,
        role: "finisher",
      },
    ]);
  });

  it("keeps built-in routine templates immutable when custom routines adapt", () => {
    const before: FitnessRoutineTemplate[] = JSON.parse(JSON.stringify(FITNESS_ROUTINE_TEMPLATES));

    customFitnessRoutineToTemplate(routine, { equipment: "Cable", durationMinutes: 35 });

    expect(FITNESS_ROUTINE_TEMPLATES).toEqual(before);
  });
});
