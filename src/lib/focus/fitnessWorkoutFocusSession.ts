export const FITNESS_WORKOUT_FOCUS_SESSION_STORAGE_KEY =
  "creator:fitness-workout-focus-session";

export type FitnessWorkoutFocusSessionExercise = {
  id: string;
  name: string;
  sets?: string;
  reps?: string;
  duration?: string;
  weight?: string;
};

export type FitnessWorkoutFocusSessionPayload = {
  source: "fitness";
  workoutName: string;
  createdAt: string;
  exercises: FitnessWorkoutFocusSessionExercise[];
};

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

      return {
        id: readString(exerciseRecord.id) || name,
        name,
        sets: readString(exerciseRecord.sets),
        reps: readString(exerciseRecord.reps),
        duration: readString(exerciseRecord.duration),
        weight: readString(exerciseRecord.weight),
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
