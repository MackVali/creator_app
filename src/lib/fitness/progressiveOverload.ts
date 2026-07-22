export type FitnessLoggedSetPerformance = {
  loggedAt: string;
  workoutName: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  plannedReps?: number | null;
  completedReps?: number | null;
  completedDurationSeconds?: number | null;
  weight?: number | null;
  unit?: "lb" | "kg" | "bodyweight" | "assisted" | "machine" | null;
};

export type FitnessExerciseProgressionSummary = {
  exerciseId: string;
  exerciseName: string;
  latestLoggedAt?: string;
  latestWeight?: number | null;
  latestUnit?: string | null;
  latestCompletedReps?: number | null;
  latestCompletedDurationSeconds?: number | null;
  lastLabel?: string;
  nextLabel?: string;
  suggestedWeight?: number | null;
  suggestedUnit?: string | null;
  suggestedReps?: number | null;
  reason?: string;
};

export function formatFitnessProgressionSuggestionAction(
  summary: FitnessExerciseProgressionSummary,
) {
  if (summary.suggestedUnit === "bodyweight") return "Use bodyweight +1 rep";
  if (summary.suggestedWeight != null && summary.suggestedUnit) {
    return `Use ${summary.suggestedWeight} ${summary.suggestedUnit}`;
  }
  return null;
}

type FitnessHistoryEntry = {
  createdAt?: string;
  values?: Record<string, unknown>;
};

const FITNESS_UNITS = new Set(["lb", "kg", "bodyweight", "assisted", "machine"]);
const LOWER_BODY_COMPOUND_NAMES = [
  "squat",
  "deadlift",
  "leg press",
  "hip thrust",
  "lunge",
  "step-up",
  "step up",
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeFitnessExerciseName(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function extractFitnessLoggedSetPerformances(
  entries: readonly FitnessHistoryEntry[],
): FitnessLoggedSetPerformance[] {
  return entries.flatMap((entry) => {
    const metadata = record(record(entry.values).metadata);
    const log = record(metadata.fitnessWorkoutLog);
    if (log.version !== 1 || !Array.isArray(log.exercises)) return [];

    const loggedAt = text(log.loggedAt) || text(entry.createdAt);
    if (!loggedAt) return [];
    const workoutName = text(log.workoutName) || "Workout";

    return log.exercises.flatMap((exerciseValue) => {
      const exercise = record(exerciseValue);
      const exerciseName = text(exercise.name);
      const exerciseId = text(exercise.exerciseId);
      if ((!exerciseId && !exerciseName) || !Array.isArray(exercise.sets)) return [];

      return exercise.sets.flatMap((setValue, index) => {
        const set = record(setValue);
        if (set.isWarmup === true) return [];
        const rawUnit = text(set.unit);
        const unit = FITNESS_UNITS.has(rawUnit)
          ? (rawUnit as FitnessLoggedSetPerformance["unit"])
          : null;

        return [{
          loggedAt,
          workoutName,
          exerciseId,
          exerciseName,
          setNumber: positiveNumber(set.setNumber) ?? index + 1,
          plannedReps: positiveNumber(set.plannedReps),
          completedReps: positiveNumber(set.completedReps),
          completedDurationSeconds: positiveNumber(set.completedDurationSeconds),
          weight: positiveNumber(set.weight),
          unit,
        }];
      });
    });
  });
}

function representativeNumber(values: Array<number | null | undefined>) {
  const numbers = values.filter((value): value is number => value != null);
  if (numbers.length === 0) return null;
  const counts = new Map<number, number>();
  numbers.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

function formatLoad(weight: number | null, unit: string | null) {
  if (unit === "bodyweight") return "bodyweight";
  return weight != null && unit ? `${weight} ${unit}` : null;
}

function formatPerformance(load: string, reps: number | null, duration: number | null) {
  if (reps != null) return `${load} × ${reps}`;
  if (duration != null) return `${load} × ${duration} sec`;
  return load;
}

export function getFitnessExerciseProgressionSummary(
  performances: readonly FitnessLoggedSetPerformance[],
  exercise: { exerciseId: string; exerciseName: string },
): FitnessExerciseProgressionSummary | null {
  const normalizedName = normalizeFitnessExerciseName(exercise.exerciseName);
  const idMatches = performances.filter(
    (performance) =>
      Boolean(performance.exerciseId && exercise.exerciseId) &&
      performance.exerciseId === exercise.exerciseId,
  );
  const matching = idMatches.length > 0
    ? idMatches
    : performances.filter(
        (performance) =>
          Boolean(normalizedName) &&
          normalizeFitnessExerciseName(performance.exerciseName) === normalizedName,
      );
  if (matching.length === 0) return null;

  const latestLoggedAt = matching.reduce(
    (latest, performance) =>
      Date.parse(performance.loggedAt) > Date.parse(latest) ? performance.loggedAt : latest,
    matching[0].loggedAt,
  );
  const latest = matching.filter((performance) => performance.loggedAt === latestLoggedAt);
  const latestWeight = representativeNumber(latest.map((set) => set.weight));
  const latestUnit = latest.find((set) => set.unit)?.unit ?? null;
  const latestCompletedReps = representativeNumber(latest.map((set) => set.completedReps));
  const missedPlannedReps = latest.some(
    (set) =>
      set.plannedReps != null &&
      (set.completedReps == null || set.completedReps < set.plannedReps),
  );
  const latestCompletedDurationSeconds = representativeNumber(
    latest.map((set) => set.completedDurationSeconds),
  );
  const lastLoad = formatLoad(latestWeight, latestUnit);
  if (!lastLoad) return null;

  const summary: FitnessExerciseProgressionSummary = {
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    latestLoggedAt,
    latestWeight,
    latestUnit,
    latestCompletedReps,
    latestCompletedDurationSeconds,
    lastLabel: formatPerformance(lastLoad, latestCompletedReps, latestCompletedDurationSeconds),
  };

  if (latestUnit === "bodyweight" && latestCompletedReps != null) {
    if (missedPlannedReps) {
      summary.reason = "Repeat the target until every set reaches its planned reps.";
      return summary;
    }
    summary.suggestedUnit = "bodyweight";
    summary.suggestedReps = latestCompletedReps + 1;
    summary.nextLabel = `bodyweight × ${summary.suggestedReps}`;
    summary.reason = "Add one rep while keeping bodyweight.";
    return summary;
  }
  if (latestWeight == null || latestUnit === "assisted") return summary;
  if (missedPlannedReps) {
    summary.reason = "Repeat the current load until every set reaches its planned reps.";
    return summary;
  }

  let increment: number | null = null;
  if (latestUnit === "kg") increment = 2.5;
  if (latestUnit === "lb" || latestUnit === "machine") {
    increment = LOWER_BODY_COMPOUND_NAMES.some((name) => normalizedName.includes(name))
      ? 10
      : 5;
  }
  if (increment == null) return summary;

  summary.suggestedWeight = latestWeight + increment;
  summary.suggestedUnit = latestUnit;
  summary.suggestedReps = latestCompletedReps;
  summary.nextLabel = formatPerformance(
    `${summary.suggestedWeight} ${latestUnit}`,
    latestCompletedReps,
    latestCompletedDurationSeconds,
  );
  summary.reason = `Conservative ${increment} ${latestUnit} increase.`;
  return summary;
}
