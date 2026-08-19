import {
  FITNESS_ANATOMY_MUSCLES,
  resolveFitnessAnatomyMuscleActivations,
  type FitnessAnatomyMuscleId,
  type FitnessAnatomyMuscleRole,
} from "@/lib/fitness/anatomyMuscles";
import {
  normalizeFitnessExerciseName,
  type FitnessLoggedSetPerformance,
} from "@/lib/fitness/progressiveOverload";

export type FitnessStrengthSex = "male" | "female";

export type FitnessStrengthLevel =
  | "untrained"
  | "beginner"
  | "novice"
  | "intermediate"
  | "advanced"
  | "elite";

export type FitnessExerciseStrengthResult = {
  exerciseId: string;
  exerciseName: string;
  role: FitnessAnatomyMuscleRole;
  estimatedOneRepMaxKg: number;
  bodyweightRatio: number;
  strengthScore: number;
  strengthLevel: FitnessStrengthLevel;
};

export type FitnessMuscleStrengthStat = {
  id: FitnessAnatomyMuscleId;
  label: string;
  strengthScore: number;
  strengthLevel: FitnessStrengthLevel;
  hasStrengthData: boolean;
  exercises: FitnessExerciseStrengthResult[];
};

type StrengthThresholds = {
  male: readonly [number, number, number, number, number];
  female: readonly [number, number, number, number, number];
};

const standard = (
  male: readonly [number, number, number, number, number],
  female: readonly [number, number, number, number, number],
): StrengthThresholds => ({ male, female });

/**
 * Creator v1 bodyweight-relative strength standards.
 *
 * Each tuple represents:
 * Beginner → Novice → Intermediate → Advanced → Elite
 *
 * These are intentionally isolated here so we can tune/research the exact
 * standards later without changing workout history, anatomy, or UI code.
 */
const STANDARDS = new Map<string, StrengthThresholds>(
  Object.entries({
    // CHEST
    "bench press": standard(
      [0.5, 0.75, 1, 1.5, 2],
      [0.3, 0.5, 0.75, 1, 1.25],
    ),
    "incline bench press": standard(
      [0.4, 0.65, 0.9, 1.25, 1.6],
      [0.25, 0.4, 0.6, 0.85, 1.1],
    ),
    "dumbbell press": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.15, 0.25, 0.4, 0.55, 0.7],
    ),
    "cable fly": standard(
      [0.1, 0.18, 0.28, 0.4, 0.55],
      [0.07, 0.12, 0.2, 0.3, 0.42],
    ),
    "chest fly": standard(
      [0.1, 0.18, 0.28, 0.4, 0.55],
      [0.07, 0.12, 0.2, 0.3, 0.42],
    ),

    // DELTOIDS
    "shoulder press": standard(
      [0.3, 0.5, 0.7, 0.9, 1.15],
      [0.2, 0.3, 0.45, 0.65, 0.85],
    ),
    "arnold press": standard(
      [0.2, 0.35, 0.5, 0.7, 0.9],
      [0.12, 0.22, 0.35, 0.5, 0.68],
    ),
    "lateral raise": standard(
      [0.04, 0.07, 0.11, 0.16, 0.22],
      [0.03, 0.05, 0.08, 0.12, 0.17],
    ),
    "front raise": standard(
      [0.05, 0.08, 0.12, 0.17, 0.23],
      [0.03, 0.05, 0.08, 0.12, 0.17],
    ),

    // BICEPS
    curl: standard(
      [0.12, 0.2, 0.3, 0.42, 0.55],
      [0.08, 0.14, 0.22, 0.32, 0.42],
    ),
    "biceps curl": standard(
      [0.12, 0.2, 0.3, 0.42, 0.55],
      [0.08, 0.14, 0.22, 0.32, 0.42],
    ),
    "hammer curl": standard(
      [0.12, 0.2, 0.3, 0.42, 0.55],
      [0.08, 0.14, 0.22, 0.32, 0.42],
    ),
    "preacher curl": standard(
      [0.1, 0.17, 0.26, 0.36, 0.48],
      [0.07, 0.12, 0.19, 0.28, 0.38],
    ),

    // TRICEPS
    "triceps extension": standard(
      [0.1, 0.18, 0.28, 0.4, 0.52],
      [0.07, 0.12, 0.2, 0.3, 0.4],
    ),
    "skull crusher": standard(
      [0.15, 0.25, 0.38, 0.52, 0.68],
      [0.1, 0.18, 0.28, 0.4, 0.52],
    ),
    "close grip bench press": standard(
      [0.45, 0.7, 0.95, 1.3, 1.7],
      [0.28, 0.45, 0.68, 0.9, 1.18],
    ),

    // FOREARMS / GRIP
    "wrist curl": standard(
      [0.06, 0.1, 0.16, 0.23, 0.32],
      [0.04, 0.07, 0.11, 0.17, 0.24],
    ),
    "reverse wrist curl": standard(
      [0.04, 0.07, 0.11, 0.17, 0.24],
      [0.03, 0.05, 0.08, 0.12, 0.18],
    ),
    "reverse curl": standard(
      [0.09, 0.15, 0.23, 0.32, 0.42],
      [0.06, 0.1, 0.17, 0.24, 0.33],
    ),

    // UPPER BACK
    "bent over row": standard(
      [0.45, 0.65, 0.9, 1.15, 1.4],
      [0.3, 0.45, 0.65, 0.85, 1.1],
    ),
    "seated cable row": standard(
      [0.35, 0.55, 0.8, 1.05, 1.3],
      [0.25, 0.4, 0.6, 0.8, 1],
    ),
    "dumbbell row": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.17, 0.3, 0.45, 0.62, 0.8],
    ),
    "lat pulldown": standard(
      [0.4, 0.6, 0.85, 1.1, 1.35],
      [0.28, 0.45, 0.65, 0.85, 1.05],
    ),

    // TRAPEZIUS
    shrug: standard(
      [0.6, 0.9, 1.25, 1.65, 2.1],
      [0.4, 0.65, 0.95, 1.3, 1.7],
    ),
    "barbell shrug": standard(
      [0.6, 0.9, 1.25, 1.65, 2.1],
      [0.4, 0.65, 0.95, 1.3, 1.7],
    ),
    "dumbbell shrug": standard(
      [0.3, 0.45, 0.65, 0.85, 1.1],
      [0.2, 0.32, 0.48, 0.65, 0.85],
    ),

    // LOWER BACK / POSTERIOR CHAIN
    deadlift: standard(
      [1, 1.25, 1.75, 2.25, 2.75],
      [0.75, 1, 1.5, 2, 2.5],
    ),
    "romanian deadlift": standard(
      [0.65, 0.9, 1.25, 1.65, 2],
      [0.5, 0.75, 1.05, 1.4, 1.75],
    ),
    "good morning": standard(
      [0.3, 0.5, 0.7, 0.95, 1.2],
      [0.2, 0.35, 0.55, 0.75, 1],
    ),
    "back extension": standard(
      [0.15, 0.3, 0.5, 0.7, 0.9],
      [0.1, 0.22, 0.38, 0.55, 0.75],
    ),
    hyperextension: standard(
      [0.15, 0.3, 0.5, 0.7, 0.9],
      [0.1, 0.22, 0.38, 0.55, 0.75],
    ),

    // ABS
    "cable crunch": standard(
      [0.2, 0.35, 0.55, 0.75, 1],
      [0.15, 0.27, 0.42, 0.6, 0.8],
    ),

    // OBLIQUES
    "cable wood chop": standard(
      [0.12, 0.22, 0.35, 0.5, 0.68],
      [0.08, 0.16, 0.27, 0.4, 0.55],
    ),
    "wood chop": standard(
      [0.12, 0.22, 0.35, 0.5, 0.68],
      [0.08, 0.16, 0.27, 0.4, 0.55],
    ),
    "pallof press": standard(
      [0.08, 0.15, 0.24, 0.35, 0.48],
      [0.06, 0.11, 0.18, 0.27, 0.38],
    ),
    "russian twist": standard(
      [0.08, 0.15, 0.25, 0.36, 0.5],
      [0.06, 0.11, 0.19, 0.29, 0.4],
    ),

    // QUADRICEPS
    "back squat": standard(
      [0.75, 1, 1.5, 2, 2.5],
      [0.5, 0.75, 1.25, 1.75, 2.25],
    ),
    "front squat": standard(
      [0.6, 0.85, 1.25, 1.65, 2],
      [0.4, 0.65, 1, 1.4, 1.8],
    ),
    "goblet squat": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.18, 0.3, 0.45, 0.62, 0.8],
    ),
    "leg press": standard(
      [1, 1.5, 2, 2.75, 3.5],
      [0.75, 1.2, 1.7, 2.3, 3],
    ),
    "leg extension": standard(
      [0.3, 0.5, 0.75, 1, 1.3],
      [0.22, 0.38, 0.58, 0.8, 1.05],
    ),
    "bulgarian split squat": standard(
      [0.2, 0.35, 0.5, 0.7, 0.9],
      [0.15, 0.25, 0.4, 0.55, 0.72],
    ),

    // ADDUCTORS
    "adductor machine": standard(
      [0.3, 0.5, 0.75, 1, 1.3],
      [0.25, 0.42, 0.65, 0.9, 1.18],
    ),
    "hip adduction": standard(
      [0.15, 0.25, 0.4, 0.58, 0.78],
      [0.12, 0.2, 0.34, 0.5, 0.68],
    ),
    "sumo squat": standard(
      [0.5, 0.75, 1.1, 1.5, 1.9],
      [0.38, 0.6, 0.9, 1.25, 1.65],
    ),
    "sumo deadlift": standard(
      [1, 1.25, 1.75, 2.25, 2.75],
      [0.75, 1, 1.5, 2, 2.5],
    ),

    // HAMSTRINGS
    "leg curl": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.2, 0.32, 0.5, 0.68, 0.88],
    ),
    "lying leg curl": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.2, 0.32, 0.5, 0.68, 0.88],
    ),
    "seated leg curl": standard(
      [0.25, 0.4, 0.6, 0.8, 1],
      [0.2, 0.32, 0.5, 0.68, 0.88],
    ),

    // GLUTES
    "hip thrust": standard(
      [0.75, 1, 1.5, 2, 2.5],
      [0.75, 1, 1.5, 2, 2.5],
    ),
    "glute bridge": standard(
      [0.5, 0.75, 1.1, 1.5, 1.9],
      [0.5, 0.75, 1.1, 1.5, 1.9],
    ),

    // CALVES
    "calf raise": standard(
      [0.4, 0.65, 0.95, 1.3, 1.7],
      [0.3, 0.5, 0.78, 1.08, 1.45],
    ),
    "standing calf raise": standard(
      [0.4, 0.65, 0.95, 1.3, 1.7],
      [0.3, 0.5, 0.78, 1.08, 1.45],
    ),
    "seated calf raise": standard(
      [0.3, 0.5, 0.75, 1, 1.3],
      [0.22, 0.4, 0.62, 0.85, 1.12],
    ),
    "single leg calf raise": standard(
      [0.15, 0.28, 0.45, 0.65, 0.88],
      [0.12, 0.22, 0.36, 0.52, 0.72],
    ),

    // TIBIALIS
    "tibialis raise": standard(
      [0.08, 0.15, 0.24, 0.35, 0.48],
      [0.06, 0.11, 0.19, 0.28, 0.4],
    ),
    "toe raise": standard(
      [0.08, 0.15, 0.24, 0.35, 0.48],
      [0.06, 0.11, 0.19, 0.28, 0.4],
    ),

    // NECK
    "neck flexion": standard(
      [0.04, 0.07, 0.11, 0.16, 0.22],
      [0.03, 0.05, 0.08, 0.12, 0.17],
    ),
    "neck extension": standard(
      [0.05, 0.09, 0.14, 0.2, 0.28],
      [0.04, 0.07, 0.11, 0.16, 0.22],
    ),
    "neck lateral flexion": standard(
      [0.03, 0.055, 0.09, 0.135, 0.19],
      [0.025, 0.045, 0.075, 0.11, 0.16],
    ),
  }),
);

const MUSCLE_IDS = FITNESS_ANATOMY_MUSCLES.map((muscle) => muscle.id);

const MUSCLE_LABELS = new Map(
  FITNESS_ANATOMY_MUSCLES.map((muscle) => [muscle.id, muscle.label]),
);

function toKg(weight: number, unit: FitnessLoggedSetPerformance["unit"]) {
  if (unit === "kg") return weight;
  if (unit === "lb") return weight * 0.45359237;
  return null;
}

function estimateOneRepMax(weightKg: number, reps: number) {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

function scoreFromThresholds(
  ratio: number,
  thresholds: readonly [number, number, number, number, number],
) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;

  const scoreStops = [20, 40, 60, 80, 100] as const;

  if (ratio <= thresholds[0]) {
    return Math.max(
      1,
      Math.round((ratio / thresholds[0]) * scoreStops[0]),
    );
  }

  for (let index = 1; index < thresholds.length; index += 1) {
    if (ratio <= thresholds[index]) {
      const previousRatio = thresholds[index - 1];
      const nextRatio = thresholds[index];
      const previousScore = scoreStops[index - 1];
      const nextScore = scoreStops[index];

      const progress =
        (ratio - previousRatio) / (nextRatio - previousRatio);

      return Math.round(
        previousScore + progress * (nextScore - previousScore),
      );
    }
  }

  return 100;
}

export function getFitnessStrengthLevel(
  score: number,
): FitnessStrengthLevel {
  if (score <= 0) return "untrained";
  if (score <= 20) return "beginner";
  if (score <= 40) return "novice";
  if (score <= 60) return "intermediate";
  if (score <= 80) return "advanced";
  return "elite";
}

export function getFitnessStrengthLevelLabel(
  level: FitnessStrengthLevel,
) {
  switch (level) {
    case "untrained":
      return "Unrated";
    case "beginner":
      return "Beginner";
    case "novice":
      return "Novice";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
    case "elite":
      return "Elite";
  }
}

function aggregateMuscleStrength(
  exercises: readonly FitnessExerciseStrengthResult[],
) {
  if (exercises.length === 0) return 0;
  if (exercises.length === 1) return exercises[0].strengthScore;

  const sorted = [...exercises].sort(
    (a, b) => b.strengthScore - a.strengthScore,
  );

  const best = sorted[0].strengthScore;
  const second = sorted[1].strengthScore;

  // Keeps one excellent lift from completely defining a muscle,
  // while still allowing users with only one logged movement to score.
  return Math.round(best * 0.7 + second * 0.3);
}

export function getFitnessMuscleStrengthStats({
  performances,
  bodyweightKg,
  sex,
}: {
  performances: readonly FitnessLoggedSetPerformance[];
  bodyweightKg: number | null;
  sex: FitnessStrengthSex;
}): FitnessMuscleStrengthStat[] {
  const resultsByMuscle = new Map<
    FitnessAnatomyMuscleId,
    FitnessExerciseStrengthResult[]
  >(MUSCLE_IDS.map((id) => [id, []]));

  if (
    !bodyweightKg ||
    !Number.isFinite(bodyweightKg) ||
    bodyweightKg <= 0
  ) {
    return MUSCLE_IDS.map((id) => ({
      id,
      label: MUSCLE_LABELS.get(id) ?? id,
      strengthScore: 0,
      strengthLevel: "untrained",
      hasStrengthData: false,
      exercises: [],
    }));
  }

  const bestByExercise = new Map<
    string,
    {
      exerciseId: string;
      exerciseName: string;
      estimatedOneRepMaxKg: number;
      bodyweightRatio: number;
      strengthScore: number;
    }
  >();

  for (const performance of performances) {
    const normalizedId = normalizeFitnessExerciseName(
      performance.exerciseId,
    );
    const normalizedName = normalizeFitnessExerciseName(
      performance.exerciseName,
    );

    const standardForExercise =
      STANDARDS.get(normalizedId) ??
      STANDARDS.get(normalizedName);

    if (!standardForExercise) continue;

    const weight =
      typeof performance.weight === "number" &&
      Number.isFinite(performance.weight) &&
      performance.weight > 0
        ? performance.weight
        : null;

    const reps =
      typeof performance.completedReps === "number" &&
      performance.completedReps > 0
        ? performance.completedReps
        : typeof performance.plannedReps === "number" &&
            performance.plannedReps > 0
          ? performance.plannedReps
          : null;

    if (weight == null || reps == null || reps > 20) continue;

    const weightKg = toKg(weight, performance.unit);
    if (weightKg == null) continue;

    const estimatedOneRepMaxKg = estimateOneRepMax(
      weightKg,
      reps,
    );

    const bodyweightRatio =
      estimatedOneRepMaxKg / bodyweightKg;

    const strengthScore = scoreFromThresholds(
      bodyweightRatio,
      standardForExercise[sex],
    );

    const key =
      normalizedId ||
      normalizedName;

    const current = bestByExercise.get(key);

    if (
      !current ||
      strengthScore > current.strengthScore
    ) {
      bestByExercise.set(key, {
        exerciseId: performance.exerciseId,
        exerciseName: performance.exerciseName,
        estimatedOneRepMaxKg,
        bodyweightRatio,
        strengthScore,
      });
    }
  }

  for (const result of bestByExercise.values()) {
    const activations =
      resolveFitnessAnatomyMuscleActivations(
        result.exerciseId,
        result.exerciseName,
      );

    for (const activation of activations) {
      const roleMultiplier =
        activation.role === "primary" ? 1 : 0.65;

      const adjustedScore = Math.round(
        result.strengthScore * roleMultiplier,
      );

      resultsByMuscle.get(activation.muscleId)?.push({
        exerciseId: result.exerciseId,
        exerciseName: result.exerciseName,
        role: activation.role,
        estimatedOneRepMaxKg: result.estimatedOneRepMaxKg,
        bodyweightRatio: result.bodyweightRatio,
        strengthScore: adjustedScore,
        strengthLevel:
          getFitnessStrengthLevel(adjustedScore),
      });
    }
  }

  return MUSCLE_IDS.map((id) => {
    const exercises = [
      ...(resultsByMuscle.get(id) ?? []),
    ].sort(
      (a, b) =>
        b.strengthScore - a.strengthScore,
    );

    const strengthScore =
      aggregateMuscleStrength(exercises);

    return {
      id,
      label: MUSCLE_LABELS.get(id) ?? id,
      strengthScore,
      strengthLevel:
        getFitnessStrengthLevel(strengthScore),
      hasStrengthData: exercises.length > 0,
      exercises,
    };
  });
}
