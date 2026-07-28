import type { FitnessWorkoutDatabaseEntry } from "@/lib/focus/fitnessWorkoutFocusSession";
import {
  getFitnessExerciseProgressionSummary,
  normalizeFitnessExerciseName,
  type FitnessExerciseProgressionSummary,
  type FitnessLoggedSetPerformance,
} from "@/lib/fitness/progressiveOverload";
import {
  getFitnessMuscleGroupLabel,
  resolveFitnessMuscleGroupId,
} from "@/lib/fitness/muscleStats";

type FitnessWeightUnit = "lb" | "kg" | "bodyweight" | "assisted" | "machine";

export type FitnessExerciseCatalogItem = {
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup?: string;
  movementType?: string;
  equipment?: string;
};

export type FitnessExerciseRecordType =
  | "heaviest_weight"
  | "highest_reps"
  | "longest_duration";

export type FitnessExerciseRecord = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  type: FitnessExerciseRecordType;
  typeLabel: string;
  valueLabel: string;
  numericValue: number;
  unit: FitnessWeightUnit | "sec";
  loggedAt: string;
  workoutName: string;
  setNumber: number;
};

export type FitnessExerciseRecentSession = {
  id: string;
  workoutName: string;
  loggedAt: string;
  setResultSummary: string;
};

export type FitnessExerciseHistory = {
  exerciseId: string;
  exerciseName: string;
  primaryMuscleGroup: string;
  movementType: string | null;
  equipment: string | null;
  lastTrainedAt: string | null;
  latestPerformance: string | null;
  suggestedTarget: string | null;
  progressionReason: string;
  records: FitnessExerciseRecord[];
  recentSessions: FitnessExerciseRecentSession[];
};

type ParsedFitnessSet = FitnessLoggedSetPerformance & {
  sessionId: string;
  completedAt: string;
};

const FITNESS_UNITS = new Set(["lb", "kg", "bodyweight", "assisted", "machine"]);

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

function getSetStatus(set: Record<string, unknown>) {
  const status = text(set.status);
  const completionStatus = text(set.completionStatus);
  if (status === "dismissed" || completionStatus === "dismissed") return "dismissed";
  if (status === "pending" || completionStatus === "pending") return "pending";
  if (status === "completed" || completionStatus === "completed") return "completed";
  return null;
}

function getWorkoutTimestamp(
  entry: FitnessWorkoutDatabaseEntry,
  log: Record<string, unknown>,
  set: Record<string, unknown>,
) {
  return (
    text(set.completedAt) ||
    text(log.completedAt) ||
    text(log.loggedAt) ||
    text(log.updatedAt) ||
    entry.updatedAt ||
    entry.createdAt
  );
}

function parseCompletedFitnessSets(
  entries: readonly FitnessWorkoutDatabaseEntry[],
): ParsedFitnessSet[] {
  return entries.flatMap((entry) => {
    const metadata = record(record(entry.values).metadata);
    const log = record(metadata.fitnessWorkoutLog);
    if (log.version !== 1 || !Array.isArray(log.exercises)) return [];
    if (log.status === "in_progress" || log.status === "abandoned") return [];
    if (log.status && log.status !== "completed") return [];

    const workoutName = text(log.workoutName) || "Workout";
    const sessionTimestamp =
      text(log.completedAt) ||
      text(log.loggedAt) ||
      text(log.updatedAt) ||
      entry.updatedAt ||
      entry.createdAt;
    const rawSessionId = text(log.sessionId);
    const sessionId = rawSessionId || `${entry.id || "fitness-entry"}-${sessionTimestamp}`;

    return log.exercises.flatMap((exerciseValue) => {
      const exercise = record(exerciseValue);
      const exerciseName = text(exercise.name);
      const exerciseId = text(exercise.exerciseId) || exerciseName;
      if ((!exerciseId && !exerciseName) || !Array.isArray(exercise.sets)) return [];

      return exercise.sets.flatMap((setValue, index): ParsedFitnessSet[] => {
        const set = record(setValue);
        if (set.isWarmup === true) return [];

        const status = getSetStatus(set);
        if (status === "pending" || status === "dismissed") return [];
        if (status && status !== "completed") return [];

        const completedReps = positiveNumber(set.completedReps);
        const completedDurationSeconds = positiveNumber(set.completedDurationSeconds);
        const weight = positiveNumber(set.weight);
        if (completedReps == null && completedDurationSeconds == null && weight == null) {
          return [];
        }

        const completedAt = getWorkoutTimestamp(entry, log, set);
        if (!Number.isFinite(Date.parse(completedAt))) return [];

        const rawUnit = text(set.unit);
        const unit = FITNESS_UNITS.has(rawUnit) ? (rawUnit as FitnessWeightUnit) : null;

        return [{
          sessionId,
          loggedAt: sessionTimestamp || completedAt,
          completedAt,
          workoutName,
          exerciseId,
          exerciseName: exerciseName || exerciseId,
          setNumber: positiveNumber(set.setNumber) ?? index + 1,
          plannedReps: positiveNumber(set.plannedReps),
          completedReps,
          completedDurationSeconds,
          weight,
          unit,
        }];
      });
    });
  });
}

function latestTimestamp(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second) > Date.parse(first) ? second : first;
}

function compareNewest(first: string, second: string) {
  return Date.parse(second) - Date.parse(first);
}

function formatDuration(seconds: number) {
  if (seconds % 60 === 0 && seconds >= 60) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "min" : "min"}`;
  }
  return `${seconds} sec`;
}

function formatLoad(weight: number | null | undefined, unit: string | null | undefined) {
  if (unit === "bodyweight") return "bodyweight";
  if (weight != null && unit) return `${weight} ${unit}`;
  return null;
}

function formatRecordValue(recordType: FitnessExerciseRecordType, value: number, unit: string) {
  if (recordType === "longest_duration") return formatDuration(value);
  if (recordType === "highest_reps") return `${value} reps`;
  return `${value} ${unit}`;
}

function recordTypeLabel(type: FitnessExerciseRecordType, unit: string) {
  if (type === "longest_duration") return "Longest duration";
  if (type === "highest_reps") return "Highest reps";
  return `Heaviest ${unit}`;
}

function getRecordCandidate(set: ParsedFitnessSet) {
  if (set.completedDurationSeconds != null) {
    return {
      type: "longest_duration" as const,
      numericValue: set.completedDurationSeconds,
      unit: "sec" as const,
    };
  }
  if (set.unit === "bodyweight" && set.completedReps != null) {
    return {
      type: "highest_reps" as const,
      numericValue: set.completedReps,
      unit: "bodyweight" as const,
    };
  }
  if (
    (set.unit === "lb" || set.unit === "kg" || set.unit === "machine") &&
    set.weight != null
  ) {
    return {
      type: "heaviest_weight" as const,
      numericValue: set.weight,
      unit: set.unit,
    };
  }
  return null;
}

function isBetterRecord(
  candidate: Pick<FitnessExerciseRecord, "numericValue" | "loggedAt">,
  current: Pick<FitnessExerciseRecord, "numericValue" | "loggedAt"> | undefined,
) {
  if (!current) return true;
  if (candidate.numericValue !== current.numericValue) {
    return candidate.numericValue > current.numericValue;
  }
  return Date.parse(candidate.loggedAt) > Date.parse(current.loggedAt);
}

function summarizeSessionSets(sets: readonly ParsedFitnessSet[]) {
  const sorted = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  if (sorted.length === 0) return "";
  if (sorted.every((set) => set.completedDurationSeconds != null)) {
    return `${sorted.map((set) => set.completedDurationSeconds).join(", ")} sec`;
  }

  const loadGroups = new Map<string, number[]>();
  sorted.forEach((set) => {
    if (set.completedReps == null) return;
    const load = formatLoad(set.weight, set.unit) ?? "unloaded";
    loadGroups.set(load, [...(loadGroups.get(load) ?? []), set.completedReps]);
  });

  return Array.from(loadGroups)
    .map(([load, reps]) => `${load} · ${reps.join(", ")} reps`)
    .join("; ");
}

function buildProgressionExplanation(
  summary: FitnessExerciseProgressionSummary | null,
  latestSets: readonly ParsedFitnessSet[],
) {
  if (!summary || latestSets.length === 0) return "No completed history yet.";
  const latestLoad = formatLoad(summary.latestWeight, summary.latestUnit);
  const missedSets = latestSets.filter(
    (set) =>
      set.plannedReps != null &&
      (set.completedReps == null || set.completedReps < set.plannedReps),
  ).length;
  const targetReps =
    latestSets.find((set) => set.plannedReps != null)?.plannedReps ??
    summary.latestCompletedReps;

  if (missedSets > 0 && latestLoad) {
    return `Hold at ${latestLoad} - the latest workout missed the target on ${missedSets} ${missedSets === 1 ? "set" : "sets"}.`;
  }

  if (summary.suggestedWeight != null && summary.suggestedUnit) {
    const targetLine = targetReps != null
      ? `all latest working sets reached ${targetReps} reps.`
      : "the latest working sets were completed.";
    return `Increase to ${summary.suggestedWeight} ${summary.suggestedUnit} - ${targetLine}`;
  }

  if (summary.suggestedUnit === "bodyweight" && summary.suggestedReps != null) {
    return `Increase to bodyweight x ${summary.suggestedReps} - all latest working sets reached ${targetReps ?? summary.latestCompletedReps} reps.`;
  }

  const latestSummary = summarizeSessionSets(latestSets);
  return latestSummary
    ? `Last performance: ${latestSummary}. No automatic increase available.`
    : "No completed history yet.";
}

function resolveCatalogItem(
  exerciseId: string,
  exerciseName: string,
  catalogById: Map<string, FitnessExerciseCatalogItem>,
  catalogByName: Map<string, FitnessExerciseCatalogItem>,
) {
  return (
    catalogById.get(exerciseId) ??
    catalogByName.get(normalizeFitnessExerciseName(exerciseName)) ??
    null
  );
}

function toHistory(
  exerciseId: string,
  exerciseName: string,
  sets: readonly ParsedFitnessSet[],
  catalogItem: FitnessExerciseCatalogItem | null,
): FitnessExerciseHistory {
  const sortedSets = [...sets].sort((a, b) => compareNewest(a.completedAt, b.completedAt));
  const lastTrainedAt = sortedSets.reduce<string | null>(
    (latest, set) => latestTimestamp(latest, set.completedAt),
    null,
  );
  const latestSessionId = sortedSets[0]?.sessionId ?? null;
  const latestSets = latestSessionId
    ? sortedSets.filter((set) => set.sessionId === latestSessionId)
    : [];
  const performances: FitnessLoggedSetPerformance[] = sortedSets.map((set) => ({
    loggedAt: set.loggedAt,
    workoutName: set.workoutName,
    exerciseId: set.exerciseId,
    exerciseName: set.exerciseName,
    setNumber: set.setNumber,
    plannedReps: set.plannedReps,
    completedReps: set.completedReps,
    completedDurationSeconds: set.completedDurationSeconds,
    weight: set.weight,
    unit: set.unit,
  }));
  const progression = getFitnessExerciseProgressionSummary(performances, {
    exerciseId,
    exerciseName,
  });
  const recordByKey = new Map<string, FitnessExerciseRecord>();

  sortedSets.forEach((set) => {
    const candidate = getRecordCandidate(set);
    if (!candidate) return;

    const key = `${candidate.type}:${candidate.unit}`;
    const nextRecord: FitnessExerciseRecord = {
      id: `${exerciseId}:${key}`,
      exerciseId,
      exerciseName,
      type: candidate.type,
      typeLabel: recordTypeLabel(candidate.type, candidate.unit),
      valueLabel: formatRecordValue(candidate.type, candidate.numericValue, candidate.unit),
      numericValue: candidate.numericValue,
      unit: candidate.unit,
      loggedAt: set.completedAt,
      workoutName: set.workoutName,
      setNumber: set.setNumber,
    };
    if (isBetterRecord(nextRecord, recordByKey.get(key))) {
      recordByKey.set(key, nextRecord);
    }
  });

  const sessionsById = new Map<string, ParsedFitnessSet[]>();
  sortedSets.forEach((set) => {
    sessionsById.set(set.sessionId, [...(sessionsById.get(set.sessionId) ?? []), set]);
  });
  const recentSessions = Array.from(sessionsById.entries())
    .map(([sessionId, sessionSets]) => ({
      id: sessionId,
      workoutName: sessionSets[0]?.workoutName ?? "Workout",
      loggedAt: sessionSets.reduce<string>(
        (latest, set) =>
          Date.parse(set.loggedAt) > Date.parse(latest) ? set.loggedAt : latest,
        sessionSets[0]?.loggedAt ?? "",
      ),
      setResultSummary: summarizeSessionSets(sessionSets),
    }))
    .filter((session) => session.loggedAt && session.setResultSummary)
    .sort((a, b) => compareNewest(a.loggedAt, b.loggedAt))
    .slice(0, 5);
  const groupId = resolveFitnessMuscleGroupId(
    catalogItem?.exerciseId ?? exerciseId,
    catalogItem?.exerciseName ?? exerciseName,
  );

  return {
    exerciseId,
    exerciseName,
    primaryMuscleGroup: catalogItem?.primaryMuscleGroup ?? getFitnessMuscleGroupLabel(groupId),
    movementType: catalogItem?.movementType ?? null,
    equipment: catalogItem?.equipment ?? null,
    lastTrainedAt,
    latestPerformance: recentSessions[0]?.setResultSummary ?? null,
    suggestedTarget: progression?.nextLabel ?? null,
    progressionReason: buildProgressionExplanation(progression, latestSets),
    records: Array.from(recordByKey.values()).sort((a, b) => {
      const typeOrder =
        a.type === b.type
          ? 0
          : a.type === "heaviest_weight"
            ? -1
            : b.type === "heaviest_weight"
              ? 1
              : a.type.localeCompare(b.type);
      return typeOrder || compareNewest(a.loggedAt, b.loggedAt);
    }),
    recentSessions,
  };
}

export function getFitnessExerciseHistories(
  entries: readonly FitnessWorkoutDatabaseEntry[],
  catalog: readonly FitnessExerciseCatalogItem[] = [],
): FitnessExerciseHistory[] {
  const sets = parseCompletedFitnessSets(entries);
  const catalogById = new Map(catalog.map((item) => [item.exerciseId, item]));
  const catalogByName = new Map(
    catalog.map((item) => [normalizeFitnessExerciseName(item.exerciseName), item]),
  );
  const grouped = new Map<string, { exerciseId: string; exerciseName: string; sets: ParsedFitnessSet[] }>();

  sets.forEach((set) => {
    const catalogItem = resolveCatalogItem(
      set.exerciseId,
      set.exerciseName,
      catalogById,
      catalogByName,
    );
    const exerciseId = catalogItem?.exerciseId ?? set.exerciseId;
    const exerciseName = catalogItem?.exerciseName ?? set.exerciseName;
    const key = exerciseId || normalizeFitnessExerciseName(exerciseName);
    const current = grouped.get(key);

    grouped.set(key, {
      exerciseId,
      exerciseName,
      sets: [...(current?.sets ?? []), set],
    });
  });

  return Array.from(grouped.values())
    .map((group) =>
      toHistory(
        group.exerciseId,
        group.exerciseName,
        group.sets,
        resolveCatalogItem(group.exerciseId, group.exerciseName, catalogById, catalogByName),
      ),
    )
    .sort((a, b) => compareNewest(a.lastTrainedAt ?? "", b.lastTrainedAt ?? ""));
}

export function getFitnessExerciseHistory(
  entries: readonly FitnessWorkoutDatabaseEntry[],
  exercise: { exerciseId: string; exerciseName: string },
  catalog: readonly FitnessExerciseCatalogItem[] = [],
) {
  const histories = getFitnessExerciseHistories(entries, catalog);
  const exact = histories.find(
    (history) => history.exerciseId && history.exerciseId === exercise.exerciseId,
  );
  if (exact) return exact;

  const normalizedName = normalizeFitnessExerciseName(exercise.exerciseName);
  return histories.find(
    (history) => normalizeFitnessExerciseName(history.exerciseName) === normalizedName,
  ) ?? null;
}

export function getFitnessPrHighlights(
  histories: readonly FitnessExerciseHistory[],
  limit = 3,
) {
  return histories
    .flatMap((history) => history.records.map((record) => ({ history, record })))
    .sort((a, b) => compareNewest(a.history.lastTrainedAt ?? "", b.history.lastTrainedAt ?? ""))
    .slice(0, limit);
}
