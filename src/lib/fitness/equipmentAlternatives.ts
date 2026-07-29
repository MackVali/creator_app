import type { FitnessProfileEquipment } from "@/lib/fitness/profile";
import type {
  FitnessRoutineExercisePrescription,
  FitnessRoutineTemplate,
} from "@/lib/fitness/routineTemplates";

export type FitnessEquipmentProfile = FitnessProfileEquipment;

export type FitnessExerciseMovementRole =
  | "horizontal push"
  | "vertical push"
  | "horizontal pull"
  | "vertical pull"
  | "squat"
  | "hip hinge"
  | "knee flexion"
  | "calf raise"
  | "biceps isolation"
  | "triceps isolation"
  | "core flexion"
  | "core stability"
  | "conditioning";

export type FitnessExerciseAlternative = {
  exerciseId: string;
  equipmentProfiles: readonly FitnessEquipmentProfile[];
};

export type FitnessExerciseAlternativeRule = {
  exerciseId: string;
  movementRole: FitnessExerciseMovementRole;
  alternatives: readonly FitnessExerciseAlternative[];
};

export type FitnessActivePlanExerciseOverride = {
  routineTemplateId: string;
  originalExerciseId: string;
  replacementExerciseId: string;
};

export type FitnessResolvedExerciseReplacement = {
  routineTemplateId: string;
  routineTitle: string;
  originalExerciseId: string;
  replacementExerciseId: string;
  movementRole: FitnessExerciseMovementRole;
  choices: readonly FitnessExerciseAlternative[];
};

export type FitnessExerciseCatalogItem = {
  equipment: string;
};

export type FitnessExerciseCatalog = ReadonlyMap<string, FitnessExerciseCatalogItem>;

const HOME_GYM_EQUIPMENT_TERMS = [
  "bodyweight",
  "dumbbell",
  "kettlebell",
  "band",
  "bench",
  "box",
  "bars",
  "bar or rings",
  "rings",
  "pull-up",
  "jump rope",
  "medicine ball",
  "track",
  "open space",
  "wall",
  "plate",
];

export const FITNESS_EQUIPMENT_PROFILE_OPTIONS = [
  "Bodyweight",
  "Dumbbells",
  "Home gym",
  "Full gym",
] as const satisfies readonly FitnessEquipmentProfile[];

export const FITNESS_EXERCISE_ALTERNATIVE_RULES: readonly FitnessExerciseAlternativeRule[] = [
  rule("Incline Push-up", "horizontal push", [
    alternative("Push-up", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Bench Press", "horizontal push", [
    alternative("Push-up", ["Bodyweight"]),
    alternative("Dumbbell Press", ["Dumbbells", "Home gym"]),
  ]),
  rule("Incline Bench Press", "horizontal push", [
    alternative("Push-up", ["Bodyweight"]),
    alternative("Dumbbell Press", ["Dumbbells", "Home gym"]),
  ]),
  rule("Dumbbell Press", "horizontal push", [
    alternative("Push-up", ["Bodyweight"]),
  ]),
  rule("Shoulder Press", "vertical push", [
    alternative("Pike Push-up", ["Bodyweight"]),
    alternative("Arnold Press", ["Dumbbells", "Home gym"]),
  ]),
  rule("Lateral Raise", "vertical push", [
    alternative("Pike Push-up", ["Bodyweight"]),
    alternative("Arnold Press", ["Dumbbells", "Home gym"]),
  ]),
  rule("Triceps Extension", "triceps isolation", [
    alternative("Close-Grip Push-up", ["Bodyweight"]),
  ]),
  rule("Dip", "horizontal push", [
    alternative("Close-Grip Push-up", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Pull-up", "vertical pull", [
    alternative("Prone Lat Pull-down", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
    alternative("Inverted Row", ["Home gym"]),
  ]),
  rule("Chin-up", "vertical pull", [
    alternative("Prone Lat Pull-down", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
    alternative("Inverted Row", ["Home gym"]),
  ]),
  rule("Inverted Row", "horizontal pull", [
    alternative("Prone W Raise", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
  ]),
  rule("Bent-Over Row", "horizontal pull", [
    alternative("Prone W Raise", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
  ]),
  rule("Dumbbell Row", "horizontal pull", [
    alternative("Prone W Raise", ["Bodyweight"]),
  ]),
  rule("Lat Pulldown", "vertical pull", [
    alternative("Prone Lat Pull-down", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
    alternative("Pull-up", ["Home gym"]),
  ]),
  rule("Seated Cable Row", "horizontal pull", [
    alternative("Prone W Raise", ["Bodyweight"]),
    alternative("Dumbbell Row", ["Dumbbells", "Home gym"]),
    alternative("Inverted Row", ["Home gym"]),
  ]),
  rule("Face Pull", "horizontal pull", [
    alternative("Prone W Raise", ["Bodyweight"]),
    alternative("Reverse Fly", ["Dumbbells", "Home gym"]),
  ]),
  rule("Curl", "biceps isolation", [
    alternative("Self-Resisted Curl", ["Bodyweight"]),
    alternative("Hammer Curl", ["Dumbbells", "Home gym"]),
  ]),
  rule("Back Squat", "squat", [
    alternative("Bodyweight Squat", ["Bodyweight"]),
    alternative("Goblet Squat", ["Dumbbells", "Home gym"]),
  ]),
  rule("Goblet Squat", "squat", [
    alternative("Bodyweight Squat", ["Bodyweight"]),
  ]),
  rule("Front Squat", "squat", [
    alternative("Bodyweight Squat", ["Bodyweight"]),
    alternative("Goblet Squat", ["Dumbbells", "Home gym"]),
  ]),
  rule("Deadlift", "hip hinge", [
    alternative("Hip Hinge", ["Bodyweight"]),
    alternative("Romanian Deadlift", ["Dumbbells", "Home gym"]),
  ]),
  rule("Romanian Deadlift", "hip hinge", [
    alternative("Hip Hinge", ["Bodyweight"]),
  ]),
  rule("Hip Thrust", "hip hinge", [
    alternative("Glute Bridge", ["Bodyweight", "Dumbbells", "Home gym"]),
  ]),
  rule("Good Morning", "hip hinge", [
    alternative("Hip Hinge", ["Bodyweight"]),
    alternative("Romanian Deadlift", ["Dumbbells", "Home gym"]),
  ]),
  rule("Leg Curl", "knee flexion", [
    alternative("Nordic Curl", ["Bodyweight", "Dumbbells", "Home gym"]),
  ]),
  rule("Hanging Knee Raise", "core flexion", [
    alternative("Leg Raise", ["Bodyweight", "Dumbbells", "Home gym"]),
  ]),
  rule("Dead Hang", "core stability", [
    alternative("Plank", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Power Clean", "hip hinge", [
    alternative("Broad Jump", ["Bodyweight"]),
    alternative("Dumbbell Clean", ["Dumbbells", "Home gym"]),
  ]),
  rule("Hang Clean", "hip hinge", [
    alternative("Broad Jump", ["Bodyweight"]),
    alternative("Dumbbell Clean", ["Dumbbells", "Home gym"]),
  ]),
  rule("Push Press", "vertical push", [
    alternative("Pike Push-up", ["Bodyweight"]),
    alternative("Arnold Press", ["Dumbbells", "Home gym"]),
  ]),
  rule("Box Jump", "conditioning", [
    alternative("Broad Jump", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Medicine Ball Slam", "conditioning", [
    alternative("Burpee", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Jump Rope", "conditioning", [
    alternative("High Knees", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Kettlebell Swing", "hip hinge", [
    alternative("Hip Hinge", ["Bodyweight"]),
    alternative("Romanian Deadlift", ["Dumbbells"]),
  ]),
  rule("Farmer's Carry", "core stability", [
    alternative("Plank", ["Bodyweight"]),
  ]),
  rule("Suitcase Carry", "core stability", [
    alternative("Side Plank", ["Bodyweight"]),
  ]),
  rule("Overhead Carry", "vertical push", [
    alternative("Pike Push-up", ["Bodyweight"]),
  ]),
  rule("Pallof Press", "core stability", [
    alternative("Side Plank", ["Bodyweight", "Dumbbells"]),
  ]),
  rule("Couch Stretch", "core stability", [
    alternative("Hip Opener", ["Bodyweight", "Dumbbells"]),
  ]),
];

const FITNESS_EXERCISE_ALTERNATIVE_RULE_BY_ID = new Map(
  FITNESS_EXERCISE_ALTERNATIVE_RULES.map((ruleConfig) => [
    ruleConfig.exerciseId,
    ruleConfig,
  ]),
);

function rule(
  exerciseId: string,
  movementRole: FitnessExerciseMovementRole,
  alternatives: readonly FitnessExerciseAlternative[],
): FitnessExerciseAlternativeRule {
  return { exerciseId, movementRole, alternatives };
}

function alternative(
  exerciseId: string,
  equipmentProfiles: readonly FitnessEquipmentProfile[],
): FitnessExerciseAlternative {
  return { exerciseId, equipmentProfiles };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function getFitnessPlanEquipmentProfileFromTemplateEquipment(
  equipment: string,
): FitnessEquipmentProfile {
  const normalized = normalizeText(equipment);
  if (normalized === "bodyweight") return "Bodyweight";
  if (normalized === "dumbbells") return "Dumbbells";
  if (normalized === "full gym") return "Full gym";
  return "Home gym";
}

export function isFitnessExerciseEquipmentCompatible(
  exercise: FitnessExerciseCatalogItem,
  equipmentProfile: FitnessEquipmentProfile,
) {
  if (equipmentProfile === "Full gym") return true;

  const equipment = normalizeText(exercise.equipment);
  if (equipmentProfile === "Bodyweight") {
    return (
      equipment.includes("bodyweight") ||
      equipment.includes("open space") ||
      equipment.includes("track") ||
      equipment.includes("wall")
    );
  }

  if (equipmentProfile === "Dumbbells") {
    return (
      isFitnessExerciseEquipmentCompatible(exercise, "Bodyweight") ||
      equipment.includes("dumbbell")
    );
  }

  return HOME_GYM_EQUIPMENT_TERMS.some((term) => equipment.includes(term));
}

export function getFitnessExerciseReplacementChoices({
  exerciseId,
  equipmentProfile,
  exerciseCatalog,
}: {
  exerciseId: string;
  equipmentProfile: FitnessEquipmentProfile;
  exerciseCatalog: FitnessExerciseCatalog;
}) {
  const ruleConfig = FITNESS_EXERCISE_ALTERNATIVE_RULE_BY_ID.get(exerciseId);
  if (!ruleConfig) return [];

  return ruleConfig.alternatives.filter((choice) => {
    if (!choice.equipmentProfiles.includes(equipmentProfile)) return false;
    const exercise = exerciseCatalog.get(choice.exerciseId);
    return exercise
      ? isFitnessExerciseEquipmentCompatible(exercise, equipmentProfile)
      : false;
  });
}

export function assertFitnessEquipmentAlternativesAreSeeded(
  exerciseIds: ReadonlySet<string>,
) {
  const missing = new Set<string>();

  FITNESS_EXERCISE_ALTERNATIVE_RULES.forEach((ruleConfig) => {
    if (!exerciseIds.has(ruleConfig.exerciseId)) missing.add(ruleConfig.exerciseId);
    ruleConfig.alternatives.forEach((choice) => {
      if (!exerciseIds.has(choice.exerciseId)) missing.add(choice.exerciseId);
    });
  });

  if (missing.size > 0) {
    throw new Error(
      `Fitness equipment alternatives reference missing seeded exercises: ${[
        ...missing,
      ].join(", ")}`,
    );
  }
}

function getExerciseCatalogItem(
  exerciseId: string,
  exerciseCatalog: FitnessExerciseCatalog,
) {
  const exercise = exerciseCatalog.get(exerciseId);
  if (!exercise) {
    throw new Error(`Fitness routine exercise is missing from fitness seeds: ${exerciseId}`);
  }

  return exercise;
}

function getOverrideKey(routineTemplateId: string, originalExerciseId: string) {
  return `${routineTemplateId}::${originalExerciseId}`;
}

export function getFitnessExerciseOverrideMap(
  overrides: readonly FitnessActivePlanExerciseOverride[] | undefined,
) {
  return new Map(
    (overrides ?? []).map((override) => [
      getOverrideKey(override.routineTemplateId, override.originalExerciseId),
      override,
    ]),
  );
}

export function filterFitnessExerciseOverridesForEquipment({
  routines,
  equipmentProfile,
  exerciseCatalog,
  exerciseOverrides,
}: {
  routines: readonly FitnessRoutineTemplate[];
  equipmentProfile: FitnessEquipmentProfile;
  exerciseCatalog: FitnessExerciseCatalog;
  exerciseOverrides: readonly FitnessActivePlanExerciseOverride[];
}) {
  return exerciseOverrides.filter((override) => {
    const routine = routines.find((item) => item.id === override.routineTemplateId);
    const prescription = routine?.exercises.find(
      (exercise) => exercise.name === override.originalExerciseId,
    );
    if (!routine || !prescription) return false;

    const originalExercise = exerciseCatalog.get(prescription.name);
    if (!originalExercise) return false;
    if (isFitnessExerciseEquipmentCompatible(originalExercise, equipmentProfile)) {
      return false;
    }

    return getFitnessExerciseReplacementChoices({
      exerciseId: prescription.name,
      equipmentProfile,
      exerciseCatalog,
    }).some((choice) => choice.exerciseId === override.replacementExerciseId);
  });
}

export function resolveFitnessRoutineTemplateForEquipment({
  routine,
  equipmentProfile,
  exerciseCatalog,
  exerciseOverrides,
}: {
  routine: FitnessRoutineTemplate;
  equipmentProfile: FitnessEquipmentProfile;
  exerciseCatalog: FitnessExerciseCatalog;
  exerciseOverrides?: readonly FitnessActivePlanExerciseOverride[];
}): {
  routine: FitnessRoutineTemplate;
  replacements: FitnessResolvedExerciseReplacement[];
} {
  const overrideMap = getFitnessExerciseOverrideMap(exerciseOverrides);
  const replacements: FitnessResolvedExerciseReplacement[] = [];
  const exercises = routine.exercises.map((prescription) => {
    const originalExercise = getExerciseCatalogItem(prescription.name, exerciseCatalog);
    if (isFitnessExerciseEquipmentCompatible(originalExercise, equipmentProfile)) {
      return prescription;
    }

    const ruleConfig = FITNESS_EXERCISE_ALTERNATIVE_RULE_BY_ID.get(prescription.name);
    if (!ruleConfig) {
      throw new Error(
        `Fitness exercise ${prescription.name} has no authored ${equipmentProfile} alternative.`,
      );
    }

    const choices = getFitnessExerciseReplacementChoices({
      exerciseId: prescription.name,
      equipmentProfile,
      exerciseCatalog,
    });
    const override = overrideMap.get(getOverrideKey(routine.id, prescription.name));
    const selectedChoice =
      choices.find((choice) => choice.exerciseId === override?.replacementExerciseId) ??
      choices[0];

    if (!selectedChoice) {
      throw new Error(
        `Fitness exercise ${prescription.name} has no compatible ${equipmentProfile} alternative.`,
      );
    }

    replacements.push({
      routineTemplateId: routine.id,
      routineTitle: routine.title,
      originalExerciseId: prescription.name,
      replacementExerciseId: selectedChoice.exerciseId,
      movementRole: ruleConfig.movementRole,
      choices,
    });

    return {
      ...prescription,
      name: selectedChoice.exerciseId,
    } satisfies FitnessRoutineExercisePrescription;
  });

  return {
    routine: {
      ...routine,
      equipment: equipmentProfile,
      exercises,
    },
    replacements,
  };
}

export function resolveFitnessPlanRoutineTemplatesForEquipment({
  routines,
  equipmentProfile,
  exerciseCatalog,
  exerciseOverrides,
}: {
  routines: readonly FitnessRoutineTemplate[];
  equipmentProfile: FitnessEquipmentProfile;
  exerciseCatalog: FitnessExerciseCatalog;
  exerciseOverrides?: readonly FitnessActivePlanExerciseOverride[];
}) {
  const resolved = routines.map((routine) =>
    resolveFitnessRoutineTemplateForEquipment({
      routine,
      equipmentProfile,
      exerciseCatalog,
      exerciseOverrides,
    }),
  );

  return {
    routines: resolved.map((item) => item.routine),
    replacements: resolved.flatMap((item) => item.replacements),
  };
}
