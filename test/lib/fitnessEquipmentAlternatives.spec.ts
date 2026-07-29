import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertFitnessEquipmentAlternativesAreSeeded,
  FITNESS_EQUIPMENT_PROFILE_OPTIONS,
  filterFitnessExerciseOverridesForEquipment,
  resolveFitnessPlanRoutineTemplatesForEquipment,
  resolveFitnessRoutineTemplateForEquipment,
  type FitnessExerciseCatalog,
} from "../../src/lib/fitness/equipmentAlternatives";
import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineAtIndex,
  resolveFitnessPlanRoutineSequence,
} from "../../src/lib/fitness/planTemplates";

const ppl = FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === "push-pull-legs")!;
const seededExerciseSource = readFileSync("src/components/notes/NoteSlashTextarea.tsx", "utf8");
const seededCatalog = new Map(
  [...seededExerciseSource.matchAll(/\{\s*name: "([^"]+)"[\s\S]*?equipment: "([^"]+)"/g)].map(
    ([, name, equipment]) => [name, { equipment }],
  ),
) as FitnessExerciseCatalog;

const catalog = new Map(
  [
    ["Bench Press", "Barbell or dumbbells"],
    ["Shoulder Press", "Barbell or dumbbells"],
    ["Incline Bench Press", "Barbell or dumbbells"],
    ["Lateral Raise", "Dumbbells or cable"],
    ["Triceps Extension", "Dumbbell, cable, or band"],
    ["Pull-up", "Pull-up bar"],
    ["Bent-Over Row", "Barbell"],
    ["Seated Cable Row", "Cable machine"],
    ["Face Pull", "Cable or band"],
    ["Curl", "Dumbbells or barbell"],
    ["Back Squat", "Barbell"],
    ["Romanian Deadlift", "Barbell or dumbbells"],
    ["Walking Lunge", "Bodyweight or dumbbells"],
    ["Leg Curl", "Machine"],
    ["Calf Raise", "Bodyweight, machine, or dumbbells"],
    ["Push-up", "Bodyweight"],
    ["Pike Push-up", "Bodyweight"],
    ["Dumbbell Press", "Dumbbells"],
    ["Arnold Press", "Dumbbells"],
    ["Close-Grip Push-up", "Bodyweight"],
    ["Prone Lat Pull-down", "Bodyweight"],
    ["Dumbbell Row", "Dumbbell"],
    ["Inverted Row", "Bar or rings"],
    ["Prone W Raise", "Bodyweight"],
    ["Reverse Fly", "Dumbbells or cable"],
    ["Self-Resisted Curl", "Bodyweight"],
    ["Hammer Curl", "Dumbbells"],
    ["Bodyweight Squat", "Bodyweight"],
    ["Goblet Squat", "Dumbbell or kettlebell"],
    ["Hip Hinge", "Bodyweight"],
    ["Nordic Curl", "Bodyweight"],
  ].map(([name, equipment]) => [name, { equipment }]),
) as FitnessExerciseCatalog;

describe("Fitness equipment alternatives", () => {
  it("covers active plan templates for lightweight equipment profiles", () => {
    assertFitnessEquipmentAlternativesAreSeeded(new Set(seededCatalog.keys()));

    FITNESS_PLAN_TEMPLATES.forEach((plan) => {
      FITNESS_EQUIPMENT_PROFILE_OPTIONS.filter(
        (equipmentProfile) => equipmentProfile !== "Full gym",
      ).forEach((equipmentProfile) => {
        expect(() =>
          resolveFitnessPlanRoutineTemplatesForEquipment({
            routines: resolveFitnessPlanRoutineSequence(plan),
            equipmentProfile,
            exerciseCatalog: seededCatalog,
          }),
        ).not.toThrow();
      });
    });
  });

  it("resolves incompatible PPL exercises to authored bodyweight alternatives", () => {
    const { replacements } = resolveFitnessPlanRoutineTemplatesForEquipment({
      routines: resolveFitnessPlanRoutineSequence(ppl),
      equipmentProfile: "Bodyweight",
      exerciseCatalog: catalog,
    });

    expect(replacements.length).toBeGreaterThan(0);
    expect(replacements).toContainEqual(
      expect.objectContaining({
        routineTemplateId: "push-day",
        originalExerciseId: "Bench Press",
        replacementExerciseId: "Push-up",
      }),
    );
    expect(replacements).toContainEqual(
      expect.objectContaining({
        routineTemplateId: "pull-day",
        originalExerciseId: "Seated Cable Row",
        replacementExerciseId: "Prone W Raise",
      }),
    );
  });

  it("preserves routine order and exact prescriptions when replacing exercises", () => {
    const push = resolveFitnessPlanRoutineAtIndex(ppl, 0)!;
    const { routine } = resolveFitnessRoutineTemplateForEquipment({
      routine: push,
      equipmentProfile: "Dumbbells",
      exerciseCatalog: catalog,
    });

    expect(routine.exercises.map((exercise) => exercise.name)).toEqual([
      "Bench Press",
      "Shoulder Press",
      "Incline Bench Press",
      "Lateral Raise",
      "Triceps Extension",
    ]);
    expect(routine.exercises.map(({ sets, reps, repRange, restSeconds }) => ({
      sets,
      reps,
      repRange,
      restSeconds,
    }))).toEqual(
      push.exercises.map(({ sets, reps, repRange, restSeconds }) => ({
        sets,
        reps,
        repRange,
        restSeconds,
      })),
    );
  });

  it("does not treat barbell-only lifts as home-gym compatible", () => {
    const legs = resolveFitnessPlanRoutineAtIndex(ppl, 2)!;
    const { routine, replacements } = resolveFitnessRoutineTemplateForEquipment({
      routine: legs,
      equipmentProfile: "Home gym",
      exerciseCatalog: catalog,
    });

    expect(routine.exercises[0]?.name).toBe("Goblet Squat");
    expect(replacements).toContainEqual(
      expect.objectContaining({
        originalExerciseId: "Back Squat",
        replacementExerciseId: "Goblet Squat",
      }),
    );
  });

  it("applies saved overrides when loading the next active-plan routine", () => {
    const pull = resolveFitnessPlanRoutineAtIndex(ppl, 1)!;
    const { routine, replacements } = resolveFitnessRoutineTemplateForEquipment({
      routine: pull,
      equipmentProfile: "Dumbbells",
      exerciseCatalog: catalog,
      exerciseOverrides: [
        {
          routineTemplateId: "pull-day",
          originalExerciseId: "Pull-up",
          replacementExerciseId: "Dumbbell Row",
        },
      ],
    });

    expect(routine.exercises[0]?.name).toBe("Dumbbell Row");
    expect(replacements[0]).toMatchObject({
      routineTemplateId: "pull-day",
      originalExerciseId: "Pull-up",
      replacementExerciseId: "Dumbbell Row",
    });
  });

  it("keeps compatible manual overrides and clears invalid ones when equipment changes", () => {
    const routines = resolveFitnessPlanRoutineSequence(ppl);

    expect(
      filterFitnessExerciseOverridesForEquipment({
        routines,
        equipmentProfile: "Dumbbells",
        exerciseCatalog: catalog,
        exerciseOverrides: [
          {
            routineTemplateId: "pull-day",
            originalExerciseId: "Pull-up",
            replacementExerciseId: "Dumbbell Row",
          },
          {
            routineTemplateId: "push-day",
            originalExerciseId: "Bench Press",
            replacementExerciseId: "Push-up",
          },
        ],
      }),
    ).toEqual([
      {
        routineTemplateId: "pull-day",
        originalExerciseId: "Pull-up",
        replacementExerciseId: "Dumbbell Row",
      },
    ]);

    expect(
      filterFitnessExerciseOverridesForEquipment({
        routines,
        equipmentProfile: "Full gym",
        exerciseCatalog: catalog,
        exerciseOverrides: [
          {
            routineTemplateId: "pull-day",
            originalExerciseId: "Pull-up",
            replacementExerciseId: "Dumbbell Row",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("fails clearly when an authored alternative is not in the seeded catalog", () => {
    expect(() => assertFitnessEquipmentAlternativesAreSeeded(new Set(catalog.keys()))).toThrow(
      /missing seeded exercises/,
    );
  });
});
