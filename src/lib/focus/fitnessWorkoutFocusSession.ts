export const FITNESS_WORKOUT_FOCUS_SESSION_STORAGE_KEY =
  "creator:fitness-workout-focus-session";
export const FITNESS_WORKOUT_FOCUS_SESSION_RESULT_STORAGE_KEY =
  "creator:fitness-workout-focus-session-result";

export type FitnessWorkoutFocusSessionExercise = {
  id: string;
  name: string;
  sets?: string;
  reps?: string;
  duration?: string;
  weight?: string;
  weightUnit?: string;
};

export type FitnessWorkoutFocusSessionPayload = {
  source: "fitness";
  workoutName: string;
  createdAt: string;
  exercises: FitnessWorkoutFocusSessionExercise[];
};

export type FitnessWorkoutFocusSessionSet = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  reps?: string;
  duration?: string;
  plannedReps?: number | null;
  completedReps?: number | null;
  plannedDurationSeconds?: number | null;
  completedDurationSeconds?: number | null;
  weight?: string;
  weightUnit?: string;
};

function parsePlannedReps(value: string | undefined) {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function parsePlannedDurationSeconds(value: string | undefined) {
  const match = value?.trim().toLowerCase().match(
    /^(\d+(?:\.\d+)?)\s*(sec|secs|second|seconds|min|mins|minute|minutes)$/,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(match[2].startsWith("s") ? amount : amount * 60);
}

export type FitnessWorkoutFocusSessionSetResult = {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  totalSets: number;
  plannedReps?: string;
  plannedDurationSeconds?: number | null;
  completedReps?: number | null;
  completedDurationSeconds?: number | null;
  weight?: string;
  weightUnit?: string;
  status?: "pending" | "completed" | "dismissed";
};

export type FitnessWorkoutFocusSessionResultPayload = {
  source: "fitness";
  workoutName: string;
  sessionCreatedAt: string;
  updatedAt: string;
  sets: FitnessWorkoutFocusSessionSetResult[];
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const FITNESS_WEIGHT_UNIT_VALUES = new Set([
  "lb",
  "kg",
  "bodyweight",
  "assisted",
  "machine",
]);

function readFitnessWeight(
  weightValue: unknown,
  weightUnitValue: unknown,
): { weight: string; weightUnit: string } {
  const rawWeight = readString(weightValue);
  const explicitUnit = readString(weightUnitValue).toLowerCase();
  const combinedWeightMatch = rawWeight.match(
    /^(-?\d+(?:\.\d+)?)\s*(lb|kg|assisted|machine)$/i,
  );
  const rawUnit = FITNESS_WEIGHT_UNIT_VALUES.has(explicitUnit)
    ? explicitUnit
    : combinedWeightMatch?.[2]?.toLowerCase() ?? "";

  if (rawUnit === "bodyweight" || rawWeight.toLowerCase() === "bodyweight") {
    return { weight: "", weightUnit: "bodyweight" };
  }

  const weight = combinedWeightMatch?.[1] ?? rawWeight;
  return {
    // A recognized non-bodyweight unit means this is an adjustable load, even
    // when a fresh routine has not supplied a numeric value yet.
    weight: !weight && rawUnit ? "0" : weight,
    // Numeric legacy payloads predate weightUnit; their form default was pounds.
    weightUnit: rawUnit || (weight && Number.isFinite(Number(weight)) ? "lb" : ""),
  };
}

export function readFitnessWorkoutFocusSessionPayload(
  value: unknown,
): FitnessWorkoutFocusSessionPayload | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const source = readString(record.source);
  const workoutName = readString(record.workoutName);
  const createdAt = readString(record.createdAt);
  const exercises = Array.isArray(record.exercises) ? record.exercises : [];

  if (source !== "fitness" || !workoutName || exercises.length === 0) return null;

  const sanitizedExercises = exercises
    .map((exercise): FitnessWorkoutFocusSessionExercise | null => {
      if (!exercise || typeof exercise !== "object") return null;

      const exerciseRecord = exercise as Record<string, unknown>;
      const name = readString(exerciseRecord.name);
      if (!name) return null;
      const load = readFitnessWeight(
        exerciseRecord.weight,
        exerciseRecord.weightUnit,
      );

      return {
        id: readString(exerciseRecord.id) || name,
        name,
        sets: readString(exerciseRecord.sets),
        reps: readString(exerciseRecord.reps),
        duration: readString(exerciseRecord.duration),
        weight: load.weight,
        weightUnit: load.weightUnit,
      };
    })
    .filter((exercise): exercise is FitnessWorkoutFocusSessionExercise =>
      Boolean(exercise),
    );

  if (sanitizedExercises.length === 0) return null;

  return {
    source: "fitness",
    workoutName,
    createdAt: createdAt || new Date().toISOString(),
    exercises: sanitizedExercises,
  };
}

export function readFitnessWorkoutFocusSessionResultPayload(
  value: unknown,
): FitnessWorkoutFocusSessionResultPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const workoutName = readString(record.workoutName);
  const sessionCreatedAt = readString(record.sessionCreatedAt);
  if (record.source !== "fitness" || !workoutName || !sessionCreatedAt || !Array.isArray(record.sets)) {
    return null;
  }

  const sets = record.sets.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const set = value as Record<string, unknown>;
    const exerciseId = readString(set.exerciseId);
    const exerciseName = readString(set.exerciseName);
    const setNumber = Number(set.setNumber);
    const totalSets = Number(set.totalSets);
    if ((!exerciseId && !exerciseName) || !Number.isFinite(setNumber) || !Number.isFinite(totalSets)) {
      return [];
    }
    const status = set.status === "completed" || set.status === "dismissed" ? set.status : "pending";
    const optionalNumber = (input: unknown) =>
      typeof input === "number" && Number.isFinite(input) ? input : null;
    return [{
      exerciseId: exerciseId || exerciseName,
      exerciseName,
      setNumber,
      totalSets,
      plannedReps: readString(set.plannedReps),
      plannedDurationSeconds: optionalNumber(set.plannedDurationSeconds),
      completedReps: optionalNumber(set.completedReps),
      completedDurationSeconds: optionalNumber(set.completedDurationSeconds),
      weight: readString(set.weight),
      weightUnit: readString(set.weightUnit),
      status,
    } satisfies FitnessWorkoutFocusSessionSetResult];
  });

  if (sets.length === 0) return null;
  return {
    source: "fitness",
    workoutName,
    sessionCreatedAt,
    updatedAt: readString(record.updatedAt) || new Date().toISOString(),
    sets,
  };
}

export function expandFitnessWorkoutFocusSessionSets(
  session: FitnessWorkoutFocusSessionPayload,
): FitnessWorkoutFocusSessionSet[] {
  const createdAtMs = Date.parse(session.createdAt);
  const sessionKey = Number.isFinite(createdAtMs)
    ? String(createdAtMs)
    : session.createdAt;

  return session.exercises.flatMap((exercise, exerciseIndex) => {
    const parsedSets = Number.parseInt(exercise.sets ?? "", 10);
    const totalSets =
      Number.isFinite(parsedSets) && parsedSets > 0 ? parsedSets : 1;

    return Array.from({ length: totalSets }, (_, setIndex) => ({
      id: `fitness-workout-${sessionKey}-${exerciseIndex + 1}-${encodeURIComponent(exercise.id)}-set-${setIndex + 1}`,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      setNumber: setIndex + 1,
      totalSets,
      reps: exercise.reps,
      duration: exercise.duration,
      plannedReps: parsePlannedReps(exercise.reps),
      completedReps: parsePlannedReps(exercise.reps),
      plannedDurationSeconds: parsePlannedDurationSeconds(exercise.duration),
      completedDurationSeconds: null,
      weight: exercise.weight,
      weightUnit: exercise.weightUnit,
    }));
  });
}
