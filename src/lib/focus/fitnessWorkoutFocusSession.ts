export const FITNESS_WORKOUT_FOCUS_SESSION_STORAGE_KEY =
  "creator:fitness-workout-focus-session";
export const FITNESS_WORKOUT_FOCUS_SESSION_RESULT_STORAGE_KEY =
  "creator:fitness-workout-focus-session-result";
export const FITNESS_WORKOUT_FOCUS_SESSION_OUTBOX_STORAGE_KEY =
  "creator:fitness-workout-focus-session-outbox";

export type FitnessWorkoutSessionNoteContext = {
  noteId?: string;
  databaseId?: string;
};

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
  sessionId?: string;
  entryId?: string;
  noteId?: string;
  databaseId?: string;
  workoutName: string;
  createdAt: string;
  startedAt?: string;
  sourceRoutineName?: string | null;
  sourcePlanName?: string | null;
  exercises: FitnessWorkoutFocusSessionExercise[];
  sets?: FitnessWorkoutFocusSessionSet[];
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
  completedAt?: string | null;
};

export type FitnessWorkoutFocusSessionResultPayload = {
  source: "fitness";
  sessionId?: string;
  entryId?: string;
  noteId?: string;
  databaseId?: string;
  workoutName: string;
  sessionCreatedAt: string;
  startedAt?: string;
  updatedAt: string;
  sets: FitnessWorkoutFocusSessionSetResult[];
};

export type FitnessWorkoutLogStatus = "in_progress" | "completed" | "abandoned";

export type FitnessWorkoutLogMetadata = {
  version: 1;
  sessionId?: string;
  status?: FitnessWorkoutLogStatus;
  workoutName?: string;
  sourceRoutineName?: string | null;
  sourcePlanName?: string | null;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  loggedAt?: string;
  exercises?: Array<{
    exerciseId?: string;
    name?: string;
    sets?: Array<{
      exerciseId?: string;
      exerciseName?: string;
      setNumber?: number;
      totalSets?: number;
      plannedReps?: number | null;
      plannedDurationSeconds?: number | null;
      completedReps?: number | null;
      completedDurationSeconds?: number | null;
      weight?: number | null;
      unit?: string | null;
      status?: "pending" | "completed" | "dismissed";
      completionStatus?: "pending" | "completed" | "dismissed" | null;
      completedAt?: string | null;
      isWarmup?: boolean;
      rpe?: number | null;
    }>;
  }>;
};

export type FitnessWorkoutDatabaseEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

export type FitnessWorkoutDatabaseEntries = Record<
  string,
  FitnessWorkoutDatabaseEntry[]
>;

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
    weight,
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
  const sessionId = readString(record.sessionId);
  const entryId = readString(record.entryId);
  const noteId = readString(record.noteId);
  const databaseId = readString(record.databaseId);
  const workoutName = readString(record.workoutName);
  const createdAt = readString(record.createdAt);
  const startedAt = readString(record.startedAt);
  const sourceRoutineName = readString(record.sourceRoutineName);
  const sourcePlanName = readString(record.sourcePlanName);
  const exercises = Array.isArray(record.exercises) ? record.exercises : [];
  const sets = Array.isArray(record.sets)
    ? record.sets.flatMap((setValue): FitnessWorkoutFocusSessionSet[] => {
        if (!setValue || typeof setValue !== "object") return [];
        const set = setValue as Record<string, unknown>;
        const exerciseId = readString(set.exerciseId);
        const exerciseName = readString(set.exerciseName);
        const setNumber = Number(set.setNumber);
        const totalSets = Number(set.totalSets);
        if ((!exerciseId && !exerciseName) || !Number.isFinite(setNumber) || !Number.isFinite(totalSets)) {
          return [];
        }
        return [{
          id: readString(set.id) || `fitness-workout-${sessionId || createdAt}-${exerciseId || exerciseName}-set-${setNumber}`,
          exerciseId: exerciseId || exerciseName,
          exerciseName: exerciseName || exerciseId,
          setNumber,
          totalSets,
          reps: readString(set.reps),
          duration: readString(set.duration),
          plannedReps: optionalNumber(set.plannedReps),
          completedReps: optionalNumber(set.completedReps),
          plannedDurationSeconds: optionalNumber(set.plannedDurationSeconds),
          completedDurationSeconds: optionalNumber(set.completedDurationSeconds),
          weight: readString(set.weight),
          weightUnit: readString(set.weightUnit),
        }];
      })
    : undefined;

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
    ...(sessionId ? { sessionId } : {}),
    ...(entryId ? { entryId } : {}),
    ...(noteId ? { noteId } : {}),
    ...(databaseId ? { databaseId } : {}),
    workoutName,
    createdAt: createdAt || new Date().toISOString(),
    startedAt: startedAt || createdAt || new Date().toISOString(),
    sourceRoutineName: sourceRoutineName || null,
    sourcePlanName: sourcePlanName || null,
    exercises: sanitizedExercises,
    ...(sets && sets.length > 0 ? { sets } : {}),
  };
}

export function readFitnessWorkoutFocusSessionResultPayload(
  value: unknown,
): FitnessWorkoutFocusSessionResultPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sessionId = readString(record.sessionId);
  const entryId = readString(record.entryId);
  const noteId = readString(record.noteId);
  const databaseId = readString(record.databaseId);
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
      completedAt: readString(set.completedAt) || null,
    } satisfies FitnessWorkoutFocusSessionSetResult];
  });

  if (sets.length === 0) return null;
  return {
    source: "fitness",
    ...(sessionId ? { sessionId } : {}),
    ...(entryId ? { entryId } : {}),
    ...(noteId ? { noteId } : {}),
    ...(databaseId ? { databaseId } : {}),
    workoutName,
    sessionCreatedAt,
    startedAt: readString(record.startedAt) || sessionCreatedAt,
    updatedAt: readString(record.updatedAt) || new Date().toISOString(),
    sets,
  };
}

export function expandFitnessWorkoutFocusSessionSets(
  session: FitnessWorkoutFocusSessionPayload,
): FitnessWorkoutFocusSessionSet[] {
  if (session.sets && session.sets.length > 0) return session.sets;

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

function optionalNumber(input: unknown) {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

function getEntryFitnessWorkoutLog(entry: FitnessWorkoutDatabaseEntry) {
  const metadata =
    entry.values.metadata && typeof entry.values.metadata === "object" && !Array.isArray(entry.values.metadata)
      ? (entry.values.metadata as Record<string, unknown>)
      : {};
  const log =
    metadata.fitnessWorkoutLog &&
    typeof metadata.fitnessWorkoutLog === "object" &&
    !Array.isArray(metadata.fitnessWorkoutLog)
      ? (metadata.fitnessWorkoutLog as FitnessWorkoutLogMetadata)
      : null;

  return log?.version === 1 ? log : null;
}

export function isCompletedFitnessWorkoutLog(log: FitnessWorkoutLogMetadata | null) {
  return Boolean(log && log.version === 1 && (log.status == null || log.status === "completed"));
}

export function isInProgressFitnessWorkoutLog(log: FitnessWorkoutLogMetadata | null) {
  return Boolean(log && log.version === 1 && log.status === "in_progress");
}

export function findFitnessWorkoutEntryIndex(
  entries: readonly FitnessWorkoutDatabaseEntry[],
  match: { entryId?: string | null; sessionId?: string | null },
) {
  const entryId = match.entryId?.trim();
  const sessionId = match.sessionId?.trim();
  if (entryId) {
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex >= 0) return entryIndex;
  }
  if (!sessionId) return -1;

  return entries.findIndex(
    (entry) => getEntryFitnessWorkoutLog(entry)?.sessionId === sessionId,
  );
}

export function upsertFitnessWorkoutDatabaseEntry(
  databaseEntries: FitnessWorkoutDatabaseEntries,
  databaseId: string,
  nextEntry: FitnessWorkoutDatabaseEntry,
) {
  const currentEntries = databaseEntries[databaseId] ?? [];
  const nextLog = getEntryFitnessWorkoutLog(nextEntry);
  const matchingIndex = findFitnessWorkoutEntryIndex(currentEntries, {
    entryId: nextEntry.id,
    sessionId: nextLog?.sessionId,
  });
  const nextDatabaseEntries: FitnessWorkoutDatabaseEntries = { ...databaseEntries };

  nextDatabaseEntries[databaseId] =
    matchingIndex >= 0
      ? currentEntries.map((entry, index) => (index === matchingIndex ? nextEntry : entry))
      : [...currentEntries, nextEntry];

  return nextDatabaseEntries;
}

export function getNewestInProgressFitnessWorkoutEntry(
  entries: readonly FitnessWorkoutDatabaseEntry[],
) {
  return [...entries]
    .filter((entry) => isInProgressFitnessWorkoutLog(getEntryFitnessWorkoutLog(entry)))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export function getFitnessWorkoutEntryProgress(entry: FitnessWorkoutDatabaseEntry) {
  const log = getEntryFitnessWorkoutLog(entry);
  const sets = log?.exercises?.flatMap((exercise) => exercise.sets ?? []) ?? [];
  const resolved = sets.filter(
    (set) =>
      set.status === "completed" ||
      set.status === "dismissed" ||
      set.completionStatus === "completed" ||
      set.completionStatus === "dismissed",
  );

  return {
    log,
    completedSetCount: resolved.length,
    totalSetCount: sets.length,
  };
}

export function mergeFitnessWorkoutLogSetResults(
  log: FitnessWorkoutLogMetadata,
  results: readonly FitnessWorkoutFocusSessionSetResult[],
  options: {
    updatedAt?: string;
    status?: FitnessWorkoutLogStatus;
    completedAt?: string | null;
  } = {},
): FitnessWorkoutLogMetadata {
  const resultBySetKey = new Map(
    results.map((result) => [
      `${result.exerciseId || result.exerciseName}\u001F${result.setNumber}`,
      result,
    ]),
  );
  const updatedAt = options.updatedAt ?? new Date().toISOString();

  return {
    ...log,
    status: options.status ?? log.status,
    updatedAt,
    completedAt:
      options.completedAt !== undefined ? options.completedAt : log.completedAt,
    loggedAt: options.status === "completed" ? updatedAt : log.loggedAt,
    exercises: (log.exercises ?? []).map((exercise) => {
      const exerciseId = exercise.exerciseId ?? exercise.name ?? "";
      const exerciseName = exercise.name ?? exerciseId;
      return {
        ...exercise,
        sets: (exercise.sets ?? []).map((set, index) => {
          const setNumber = set.setNumber ?? index + 1;
          const result =
            resultBySetKey.get(`${exerciseId}\u001F${setNumber}`) ??
            resultBySetKey.get(`${exerciseName}\u001F${setNumber}`);
          if (!result) return set;

          const rawWeight = result.weight?.trim();
          const parsedWeight = rawWeight ? Number(rawWeight) : null;
          return {
            ...set,
            exerciseId,
            exerciseName,
            totalSets: result.totalSets,
            plannedReps:
              result.plannedReps != null && result.plannedReps.trim()
                ? Number(result.plannedReps)
                : set.plannedReps ?? null,
            plannedDurationSeconds:
              result.plannedDurationSeconds ?? set.plannedDurationSeconds ?? null,
            completedReps: result.completedReps ?? set.completedReps ?? null,
            completedDurationSeconds:
              result.completedDurationSeconds ?? set.completedDurationSeconds ?? null,
            weight:
              result.weightUnit === "bodyweight"
                ? null
                : Number.isFinite(parsedWeight)
                  ? parsedWeight
                  : set.weight ?? null,
            unit: result.weightUnit || set.unit || null,
            status: result.status ?? set.status ?? "pending",
            completionStatus: result.status ?? set.completionStatus ?? "pending",
            completedAt: result.completedAt ?? set.completedAt ?? null,
          };
        }),
      };
    }),
  };
}

export function buildFitnessWorkoutFocusSessionFromEntry({
  entry,
  databaseId,
  noteId,
}: {
  entry: FitnessWorkoutDatabaseEntry;
  databaseId?: string;
  noteId?: string;
}): {
  payload: FitnessWorkoutFocusSessionPayload | null;
  resolvedSetCount: number;
  totalSetCount: number;
} {
  const log = getEntryFitnessWorkoutLog(entry);
  if (!log || !isInProgressFitnessWorkoutLog(log)) {
    return { payload: null, resolvedSetCount: 0, totalSetCount: 0 };
  }

  const pendingSets: FitnessWorkoutFocusSessionSet[] = [];
  let resolvedSetCount = 0;
  let totalSetCount = 0;
  const exercises: FitnessWorkoutFocusSessionExercise[] = [];

  (log.exercises ?? []).forEach((exercise, exerciseIndex) => {
    const exerciseId = exercise.exerciseId || exercise.name || `exercise-${exerciseIndex + 1}`;
    const exerciseName = exercise.name || exerciseId;
    const sets = exercise.sets ?? [];
    const firstSet = sets[0];
    exercises.push({
      id: exerciseId,
      name: exerciseName,
      sets: String(Math.max(1, sets.length)),
      reps: firstSet?.plannedReps == null ? "" : String(firstSet.plannedReps),
      duration:
        firstSet?.plannedDurationSeconds == null
          ? ""
          : `${firstSet.plannedDurationSeconds} seconds`,
      weight:
        firstSet?.unit === "bodyweight" || firstSet?.weight == null
          ? ""
          : String(firstSet.weight),
      weightUnit: firstSet?.unit ?? "",
    });

    sets.forEach((set, setIndex) => {
      totalSetCount += 1;
      const setNumber = set.setNumber ?? setIndex + 1;
      const totalSets = set.totalSets ?? sets.length;
      const setStatus = set.status ?? set.completionStatus ?? "pending";
      if (setStatus === "completed" || setStatus === "dismissed") {
        resolvedSetCount += 1;
        return;
      }

      pendingSets.push({
        id: `fitness-workout-${log.sessionId || entry.id}-${exerciseIndex + 1}-${encodeURIComponent(exerciseId)}-set-${setNumber}`,
        exerciseId,
        exerciseName,
        setNumber,
        totalSets,
        reps: set.plannedReps == null ? "" : String(set.plannedReps),
        duration:
          set.plannedDurationSeconds == null
            ? ""
            : `${set.plannedDurationSeconds} seconds`,
        plannedReps: set.plannedReps ?? null,
        completedReps: set.completedReps ?? set.plannedReps ?? null,
        plannedDurationSeconds: set.plannedDurationSeconds ?? null,
        completedDurationSeconds: set.completedDurationSeconds ?? null,
        weight: set.unit === "bodyweight" || set.weight == null ? "" : String(set.weight),
        weightUnit: set.unit ?? "",
      });
    });
  });

  if (exercises.length === 0) {
    return { payload: null, resolvedSetCount, totalSetCount };
  }

  return {
    payload: {
      source: "fitness",
      sessionId: log.sessionId,
      entryId: entry.id,
      noteId,
      databaseId,
      workoutName: log.workoutName || "Workout",
      createdAt: entry.createdAt,
      startedAt: log.startedAt || entry.createdAt,
      sourceRoutineName: log.sourceRoutineName ?? null,
      sourcePlanName: log.sourcePlanName ?? null,
      exercises,
      sets: pendingSets,
    },
    resolvedSetCount,
    totalSetCount,
  };
}
