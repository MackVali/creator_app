import type { FitnessWorkoutDatabaseEntry } from "@/lib/focus/fitnessWorkoutFocusSession";
import { normalizeFitnessExerciseName } from "@/lib/fitness/progressiveOverload";

export type FitnessMuscleGroupId =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms-grip"
  | "other";

export type FitnessMuscleGroupStat = {
  id: FitnessMuscleGroupId;
  label: string;
  completedSetCount: number;
  lastTrainedAt: string | null;
  workloadPercentage: number;
};

type FitnessMuscleGroupDefinition = {
  id: FitnessMuscleGroupId;
  label: string;
};

const FITNESS_SUPPORTED_MUSCLE_GROUPS: readonly FitnessMuscleGroupDefinition[] = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "glutes", label: "Glutes" },
  { id: "calves", label: "Calves" },
  { id: "core", label: "Core" },
  { id: "forearms-grip", label: "Forearms / Grip" },
] as const;

const FITNESS_OTHER_MUSCLE_GROUP: FitnessMuscleGroupDefinition = {
  id: "other",
  label: "Other",
};

export const FITNESS_MUSCLE_GROUPS: readonly FitnessMuscleGroupDefinition[] =
  FITNESS_SUPPORTED_MUSCLE_GROUPS;

const FITNESS_PRIMARY_MUSCLE_BY_NORMALIZED_EXERCISE = new Map<
  string,
  FitnessMuscleGroupId
>(
  Object.entries({
    "push up": "chest",
    "incline push up": "chest",
    "decline push up": "chest",
    "bench press": "chest",
    "incline bench press": "chest",
    "dumbbell press": "chest",
    "chest fly": "chest",
    "shoulder press": "shoulders",
    "pike push up": "shoulders",
    "lateral raise": "shoulders",
    "front raise": "shoulders",
    "arnold press": "shoulders",
    dip: "chest",
    "close grip push up": "triceps",
    "triceps extension": "triceps",
    "skull crusher": "triceps",
    "pull up": "back",
    "chin up": "back",
    "inverted row": "back",
    "bent over row": "back",
    "dumbbell row": "back",
    "lat pulldown": "back",
    "seated cable row": "back",
    row: "back",
    "face pull": "shoulders",
    "reverse fly": "shoulders",
    curl: "biceps",
    "hammer curl": "biceps",
    "preacher curl": "biceps",
    "bodyweight squat": "quads",
    "goblet squat": "quads",
    "back squat": "quads",
    "front squat": "quads",
    "split squat": "quads",
    "forward lunge": "quads",
    "reverse lunge": "quads",
    "walking lunge": "quads",
    lunge: "quads",
    deadlift: "hamstrings",
    "romanian deadlift": "hamstrings",
    "hip thrust": "glutes",
    "good morning": "hamstrings",
    "hip hinge": "hamstrings",
    "leg curl": "hamstrings",
    "nordic curl": "hamstrings",
    "calf raise": "calves",
    "seated calf raise": "calves",
    plank: "core",
    "side plank": "core",
    "dead bug": "core",
    "bird dog": "core",
    crunch: "core",
    "sit up": "core",
    "leg raise": "core",
    "hanging knee raise": "core",
    "russian twist": "core",
    "pallof press": "core",
    "wood chop": "core",
    "mountain climber": "core",
    "jump rope": "calves",
    "high knees": "quads",
    sprint: "quads",
    "kettlebell swing": "glutes",
    "box jump": "quads",
    "arm circles": "shoulders",
    "hip opener": "glutes",
    "world s greatest stretch": "hamstrings",
    "hamstring stretch": "hamstrings",
    "couch stretch": "quads",
    "child s pose": "back",
    "thoracic rotation": "back",
    "farmer s carry": "forearms-grip",
    "suitcase carry": "core",
    "overhead carry": "shoulders",
    "dead hang": "forearms-grip",
    "plate pinch": "forearms-grip",
    "power clean": "quads",
    "hang clean": "quads",
    "push press": "shoulders",
    "broad jump": "quads",
    "skater jump": "glutes",
  } satisfies Record<string, FitnessMuscleGroupId>),
);

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

function latestTimestamp(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second) > Date.parse(first) ? second : first;
}

export function resolveFitnessMuscleGroupId(exerciseId: string, exerciseName: string) {
  const normalizedId = normalizeFitnessExerciseName(exerciseId);
  const normalizedName = normalizeFitnessExerciseName(exerciseName);

  return (
    FITNESS_PRIMARY_MUSCLE_BY_NORMALIZED_EXERCISE.get(normalizedId) ??
    FITNESS_PRIMARY_MUSCLE_BY_NORMALIZED_EXERCISE.get(normalizedName) ??
    "other"
  );
}

export function getFitnessMuscleGroupLabel(id: FitnessMuscleGroupId) {
  return (
    FITNESS_SUPPORTED_MUSCLE_GROUPS.find((group) => group.id === id)?.label ??
    FITNESS_OTHER_MUSCLE_GROUP.label
  );
}

function getSetStatus(set: Record<string, unknown>) {
  const status = text(set.status);
  const completionStatus = text(set.completionStatus);
  if (status === "dismissed" || completionStatus === "dismissed") return "dismissed";
  if (status === "pending" || completionStatus === "pending") return "pending";
  if (status === "completed" || completionStatus === "completed") return "completed";
  return null;
}

function hasCompletedWorkingSetMetric(set: Record<string, unknown>) {
  if (
    positiveNumber(set.completedReps) != null ||
    positiveNumber(set.completedDurationSeconds) != null
  ) {
    return true;
  }

  return (
    positiveNumber(set.plannedReps) != null ||
    positiveNumber(set.plannedDurationSeconds) != null
  );
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

export function getFitnessMuscleGroupStats(
  entries: readonly FitnessWorkoutDatabaseEntry[],
  options: {
    now?: Date;
    periodStart?: Date;
  } = {},
): FitnessMuscleGroupStat[] {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const periodStart =
    options.periodStart ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodStartMs = periodStart.getTime();
  const statsById = new Map<FitnessMuscleGroupId, FitnessMuscleGroupStat>(
    FITNESS_SUPPORTED_MUSCLE_GROUPS.map((group) => [
      group.id,
      {
        id: group.id,
        label: group.label,
        completedSetCount: 0,
        lastTrainedAt: null,
        workloadPercentage: 0,
      },
    ]),
  );

  entries.forEach((entry) => {
    const metadata = record(record(entry.values).metadata);
    const log = record(metadata.fitnessWorkoutLog);
    if (log.version !== 1 || !Array.isArray(log.exercises)) return;
    if (log.status === "in_progress" || log.status === "abandoned") return;
    if (log.status && log.status !== "completed") return;

    log.exercises.forEach((exerciseValue) => {
      const exercise = record(exerciseValue);
      const exerciseId = text(exercise.exerciseId);
      const exerciseName = text(exercise.name);
      if ((!exerciseId && !exerciseName) || !Array.isArray(exercise.sets)) return;

      const groupId = resolveFitnessMuscleGroupId(exerciseId, exerciseName);
      const group = statsById.get(groupId) ?? {
        ...FITNESS_OTHER_MUSCLE_GROUP,
        completedSetCount: 0,
        lastTrainedAt: null,
        workloadPercentage: 0,
      };

      exercise.sets.forEach((setValue) => {
        const set = record(setValue);
        if (set.isWarmup === true) return;

        const status = getSetStatus(set);
        if (status === "pending" || status === "dismissed") return;
        if (status && status !== "completed") return;
        if (!hasCompletedWorkingSetMetric(set)) return;

        const timestamp = getWorkoutTimestamp(entry, log, set);
        const timestampMs = Date.parse(timestamp);
        if (!Number.isFinite(timestampMs)) return;

        group.lastTrainedAt = latestTimestamp(group.lastTrainedAt, timestamp);
        if (timestampMs >= periodStartMs && timestampMs <= nowMs) {
          group.completedSetCount += 1;
        }
      });

      if (group.id === "other" && (group.completedSetCount > 0 || group.lastTrainedAt)) {
        statsById.set(group.id, group);
      }
    });
  });

  const maxSetCount = Math.max(
    0,
    ...Array.from(statsById.values()).map((stat) => stat.completedSetCount),
  );

  return Array.from(statsById.values()).map((stat) => ({
    ...stat,
    workloadPercentage:
      maxSetCount > 0 ? Math.round((stat.completedSetCount / maxSetCount) * 100) : 0,
  }));
}
