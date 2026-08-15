import type { FitnessPlanTemplate } from "@/lib/fitness/planTemplates";
import type {
  FitnessRoutineLevel,
  FitnessRoutineTemplate,
} from "@/lib/fitness/routineTemplates";
import {
  FITNESS_PROFILE_ENTRY_KIND,
  buildFitnessProfileEntryId,
  type FitnessProfileDatabaseEntry,
} from "@/lib/fitness/profile";

export const FITNESS_CUSTOM_LIBRARY_METADATA_KEY = "fitnessCustomLibrary";
export const FITNESS_CUSTOM_LIBRARY_VERSION = 1;

export type CustomFitnessExercise = {
  id: string;
  name: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroup?: string;
  trackingType?: "reps" | "timed";
  resistanceType?: "bodyweight" | "weighted" | "assisted" | "machine" | "none";
  defaultSets?: number;
  defaultReps?: number;
  defaultDurationSeconds?: number;
  movementType: string;
  primaryArea: string;
  equipment: string;
  guidance: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomFitnessRoutineExerciseRole = "warmup" | "main" | "accessory" | "finisher";

export type CustomFitnessRoutineExercisePrescription = {
  exerciseId: string;
  source: "built-in" | "custom";
  order: number;
  name: string;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  role: CustomFitnessRoutineExerciseRole;
  restSeconds?: number;
  instruction?: string;
};

export type CustomFitnessRoutine = {
  id: string;
  title: string;
  description?: string;
  goal?: FitnessRoutineTemplate["goal"];
  level?: FitnessRoutineLevel;
  durationMinutes?: number;
  exercises: CustomFitnessRoutineExercisePrescription[];
  createdAt: string;
  updatedAt: string;
};

export type CustomFitnessPlanRoutineSequenceEntry = {
  id: string;
  routineId: string;
  source: "creator" | "custom";
  order: number;
};

export type CustomFitnessPlan = {
  id: string;
  title: string;
  description?: string;
  goal?: string;
  level?: FitnessPlanTemplate["level"];
  source: "custom";
  recommendedDaysPerWeek: number[];
  allowedDaysPerWeek: number[];
  routineSequence: CustomFitnessPlanRoutineSequenceEntry[];
  createdAt: string;
  updatedAt: string;
};

export type FitnessCustomLibrary = {
  version: typeof FITNESS_CUSTOM_LIBRARY_VERSION;
  exercises: CustomFitnessExercise[];
  routines: CustomFitnessRoutine[];
  plans: CustomFitnessPlan[];
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPositiveInteger(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const integer = Math.round(number);
  return integer > 0 ? integer : null;
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(readPositiveInteger)
        .filter((number): number is number => number !== null),
    ),
  ).sort((a, b) => a - b);
}

function readRoutineSource(value: unknown, routineId: string): CustomFitnessPlanRoutineSequenceEntry["source"] {
  if (value === "custom") return "custom";
  if (value === "creator" || value === "built-in") return "creator";
  return routineId.startsWith("custom-routine") ? "custom" : "creator";
}

function buildLegacyPlanSequenceEntry(
  routineId: string,
  index: number,
): CustomFitnessPlanRoutineSequenceEntry {
  return {
    id: `legacy-${index + 1}-${routineId}`,
    routineId,
    source: readRoutineSource(undefined, routineId),
    order: index + 1,
  };
}

function readPlanRoutineSequenceEntry(
  value: unknown,
  index = 0,
): CustomFitnessPlanRoutineSequenceEntry | null {
  if (typeof value === "string") {
    const routineId = readString(value);
    return routineId ? buildLegacyPlanSequenceEntry(routineId, index) : null;
  }
  if (!isRecord(value)) return null;

  const routineId = readString(value.routineId);
  if (!routineId) return null;

  return {
    id: readString(value.id) ?? buildLegacyPlanSequenceEntry(routineId, index).id,
    routineId,
    source: readRoutineSource(value.source, routineId),
    order: readPositiveInteger(value.order) ?? index + 1,
  };
}

function readPlanRoutineSequence(value: unknown): CustomFitnessPlanRoutineSequenceEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(readPlanRoutineSequenceEntry)
    .filter((entry): entry is CustomFitnessPlanRoutineSequenceEntry => Boolean(entry))
    .sort((a, b) => a.order - b.order)
    .map((entry, index) => ({ ...entry, order: index + 1 }));
}

function readRoutineExercise(value: unknown, index = 0): CustomFitnessRoutineExercisePrescription | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  const rawExerciseId = readString(value.exerciseId);
  const exerciseId = rawExerciseId ?? name;
  const sets = readPositiveInteger(value.sets);
  if (!name || !exerciseId || !sets) return null;

  const reps = readPositiveInteger(value.reps);
  const durationSeconds = readPositiveInteger(value.durationSeconds);
  const restSeconds = readPositiveInteger(value.restSeconds);
  const rawRole = readString(value.role);
  const role: CustomFitnessRoutineExerciseRole =
    rawRole === "warmup" ||
    rawRole === "main" ||
    rawRole === "accessory" ||
    rawRole === "finisher"
      ? rawRole
      : rawRole === "primary"
        ? "main"
        : rawRole === "conditioning" || rawRole === "recovery"
          ? "finisher"
          : "accessory";
  const source =
    value.source === "custom" || (typeof exerciseId === "string" && exerciseId.startsWith("custom-exercise-"))
      ? "custom"
      : "built-in";
  const order = readPositiveInteger(value.order) ?? index + 1;

  return {
    exerciseId,
    source,
    order,
    name,
    sets,
    ...(reps ? { reps } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(restSeconds ? { restSeconds } : {}),
    role,
    ...(readOptionalString(value.instruction)
      ? { instruction: readOptionalString(value.instruction) }
      : {}),
  };
}

function readCustomExercise(value: unknown): CustomFitnessExercise | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  const movementType = readString(value.movementType);
  const primaryArea = readString(value.primaryArea);
  const equipment = readString(value.equipment);
  const guidance = readString(value.guidance);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  if (!id || !name || !movementType || !primaryArea || !equipment || !guidance || !createdAt || !updatedAt) {
    return null;
  }

  const defaultSets = readPositiveInteger(value.defaultSets);
  const defaultReps = readPositiveInteger(value.defaultReps);
  const defaultDurationSeconds = readPositiveInteger(value.defaultDurationSeconds);

  return {
    id,
    name,
    ...(readOptionalString(value.primaryMuscleGroup)
      ? { primaryMuscleGroup: readOptionalString(value.primaryMuscleGroup) }
      : {}),
    ...(readOptionalString(value.secondaryMuscleGroup)
      ? { secondaryMuscleGroup: readOptionalString(value.secondaryMuscleGroup) }
      : {}),
    ...(value.trackingType === "timed" || value.trackingType === "reps"
      ? { trackingType: value.trackingType }
      : {}),
    ...(
      value.resistanceType === "bodyweight" ||
      value.resistanceType === "weighted" ||
      value.resistanceType === "assisted" ||
      value.resistanceType === "machine" ||
      value.resistanceType === "none"
        ? { resistanceType: value.resistanceType }
        : {}),
    ...(defaultSets ? { defaultSets } : {}),
    ...(defaultReps ? { defaultReps } : {}),
    ...(defaultDurationSeconds ? { defaultDurationSeconds } : {}),
    movementType,
    primaryArea,
    equipment,
    guidance,
    notes: readOptionalString(value.notes) ?? "",
    createdAt,
    updatedAt,
  };
}

function readCustomRoutine(value: unknown): CustomFitnessRoutine | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const title = readString(value.title);
  const goal = readString(value.goal) as CustomFitnessRoutine["goal"] | null;
  const level = readString(value.level) as FitnessRoutineLevel | null;
  const durationMinutes = readPositiveInteger(value.durationMinutes);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const exercises = Array.isArray(value.exercises)
    ? value.exercises
        .map(readRoutineExercise)
        .filter((exercise): exercise is CustomFitnessRoutineExercisePrescription => Boolean(exercise))
        .sort((a, b) => a.order - b.order)
        .map((exercise, index) => ({ ...exercise, order: index + 1 }))
    : [];
  if (!id || !title || !createdAt || !updatedAt || exercises.length === 0) {
    return null;
  }

  return {
    id,
    title,
    description: readOptionalString(value.description),
    ...(goal ? { goal } : {}),
    ...(level ? { level } : {}),
    ...(durationMinutes ? { durationMinutes } : {}),
    exercises,
    createdAt,
    updatedAt,
  };
}

function readCustomPlan(value: unknown): CustomFitnessPlan | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const title = readString(value.title);
  const goal = readOptionalString(value.goal);
  const level = readString(value.level) as CustomFitnessPlan["level"] | null;
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const routineSequence = readPlanRoutineSequence(value.routineSequence);
  const allowedDaysPerWeek = readNumberArray(value.allowedDaysPerWeek);
  const recommendedDaysPerWeek = readNumberArray(value.recommendedDaysPerWeek);
  if (
    !id ||
    !title ||
    !createdAt ||
    !updatedAt ||
    routineSequence.length === 0 ||
    allowedDaysPerWeek.length === 0
  ) {
    return null;
  }

  return {
    id,
    title,
    description: readOptionalString(value.description),
    ...(goal ? { goal } : {}),
    ...(level ? { level } : {}),
    source: "custom",
    recommendedDaysPerWeek:
      recommendedDaysPerWeek.length > 0 ? recommendedDaysPerWeek : [allowedDaysPerWeek[0]],
    allowedDaysPerWeek,
    routineSequence,
    createdAt,
    updatedAt,
  };
}

export function createEmptyFitnessCustomLibrary(now: string): FitnessCustomLibrary {
  return {
    version: FITNESS_CUSTOM_LIBRARY_VERSION,
    exercises: [],
    routines: [],
    plans: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function readFitnessCustomLibrary(value: unknown): FitnessCustomLibrary | null {
  if (!isRecord(value)) return null;
  if (value.version !== FITNESS_CUSTOM_LIBRARY_VERSION) return null;
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  if (!createdAt || !updatedAt) return null;

  return {
    version: FITNESS_CUSTOM_LIBRARY_VERSION,
    exercises: Array.isArray(value.exercises)
      ? value.exercises
          .map(readCustomExercise)
          .filter((exercise): exercise is CustomFitnessExercise => Boolean(exercise))
      : [],
    routines: Array.isArray(value.routines)
      ? value.routines
          .map(readCustomRoutine)
          .filter((routine): routine is CustomFitnessRoutine => Boolean(routine))
      : [],
    plans: Array.isArray(value.plans)
      ? value.plans
          .map(readCustomPlan)
          .filter((plan): plan is CustomFitnessPlan => Boolean(plan))
      : [],
    createdAt,
    updatedAt,
  };
}

export function readFitnessCustomLibraryFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  return readFitnessCustomLibrary(metadata[FITNESS_CUSTOM_LIBRARY_METADATA_KEY]);
}

export function getFitnessCustomLibraryEntry(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  return entries.find((entry) => readFitnessCustomLibraryFromMetadata(entry.values.metadata));
}

export function getFitnessCustomLibraryFromEntries(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  const entry = getFitnessCustomLibraryEntry(entries);
  return entry ? readFitnessCustomLibraryFromMetadata(entry.values.metadata) : null;
}

export function mergeFitnessCustomLibraryMetadata(
  metadata: unknown,
  library: FitnessCustomLibrary,
): Record<string, unknown> {
  const current = isRecord(metadata) ? metadata : {};

  return {
    ...current,
    entryKind: current.entryKind ?? FITNESS_PROFILE_ENTRY_KIND,
    [FITNESS_CUSTOM_LIBRARY_METADATA_KEY]: library,
  };
}

export function buildFitnessCustomLibraryEntry({
  databaseId,
  existingEntry,
  library,
  now,
}: {
  databaseId: string;
  existingEntry?: FitnessProfileDatabaseEntry | null;
  library: FitnessCustomLibrary;
  now: string;
}): FitnessProfileDatabaseEntry {
  return {
    id: existingEntry?.id ?? buildFitnessProfileEntryId(databaseId),
    createdAt: existingEntry?.createdAt ?? library.createdAt,
    updatedAt: now,
    values: {
      ...(existingEntry?.values ?? {}),
      metadata: mergeFitnessCustomLibraryMetadata(existingEntry?.values.metadata, library),
    },
  };
}

export function upsertCustomFitnessExercise(
  library: FitnessCustomLibrary | null,
  exercise: CustomFitnessExercise,
  now: string,
) {
  const base = library ?? createEmptyFitnessCustomLibrary(now);
  const existing = base.exercises.find((item) => item.id === exercise.id);
  const nextExercise = existing
    ? { ...exercise, createdAt: existing.createdAt, updatedAt: now }
    : exercise;
  return {
    ...base,
    exercises: [
      ...base.exercises.filter((item) => item.id !== exercise.id),
      nextExercise,
    ],
    updatedAt: now,
  };
}

export function upsertCustomFitnessRoutine(
  library: FitnessCustomLibrary | null,
  routine: CustomFitnessRoutine,
  now: string,
) {
  const base = library ?? createEmptyFitnessCustomLibrary(now);
  const existing = base.routines.find((item) => item.id === routine.id);
  const nextRoutine = existing
    ? { ...routine, createdAt: existing.createdAt, updatedAt: now }
    : routine;
  return {
    ...base,
    routines: [
      ...base.routines.filter((item) => item.id !== routine.id),
      nextRoutine,
    ],
    updatedAt: now,
  };
}

export function upsertCustomFitnessPlan(
  library: FitnessCustomLibrary | null,
  plan: CustomFitnessPlan,
  now: string,
) {
  const base = library ?? createEmptyFitnessCustomLibrary(now);
  const existing = base.plans.find((item) => item.id === plan.id);
  const nextPlan = existing ? { ...plan, createdAt: existing.createdAt, updatedAt: now } : plan;
  return {
    ...base,
    plans: [
      ...base.plans.filter((item) => item.id !== plan.id),
      nextPlan,
    ],
    updatedAt: now,
  };
}

export function customFitnessRoutineToTemplate(
  routine: CustomFitnessRoutine,
  metadata?: {
    equipment?: string;
    durationMinutes?: number;
  },
): FitnessRoutineTemplate {
  return {
    id: routine.id,
    group: "custom",
    title: routine.title,
    goal: routine.goal ?? "Foundation",
    level: routine.level ?? "Beginner",
    equipment: metadata?.equipment ?? "Custom",
    durationMinutes: routine.durationMinutes ?? metadata?.durationMinutes ?? 1,
    exercises: routine.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((exercise) => ({
        name: exercise.name,
        exerciseId: exercise.exerciseId,
        source: exercise.source,
        order: exercise.order,
        sets: exercise.sets,
        ...(exercise.reps ? { reps: exercise.reps } : {}),
        ...(exercise.durationSeconds ? { durationSeconds: exercise.durationSeconds } : {}),
        ...(exercise.restSeconds ? { restSeconds: exercise.restSeconds } : {}),
        role: exercise.role,
        ...(exercise.instruction ? { instruction: exercise.instruction } : {}),
      })),
  };
}

export function customFitnessPlanToTemplate(plan: CustomFitnessPlan): FitnessPlanTemplate {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    source: "custom",
    goal: plan.goal ?? "General fitness",
    level: plan.level ?? "Beginner",
    equipment: "Custom",
    recommendedDaysPerWeek: plan.recommendedDaysPerWeek,
    allowedDaysPerWeek: plan.allowedDaysPerWeek,
    sessionLengthOptions: [30, 45, 60, 75, 90],
    routineSequence: plan.routineSequence
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.routineId),
  };
}

export function normalizeFitnessCustomName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getCustomFitnessExerciseReferences(
  library: FitnessCustomLibrary | null,
  exerciseId: string,
) {
  if (!library) return [];
  return library.routines.filter((routine) =>
    routine.exercises.some((exercise) => {
      const referencedId =
        typeof exercise.exerciseId === "string" ? exercise.exerciseId : exercise.name;
      return referencedId === exerciseId;
    }),
  );
}

export function getCustomFitnessRoutineReferences(
  library: FitnessCustomLibrary | null,
  routineId: string,
) {
  if (!library) return [];
  return library.plans.filter((plan) =>
    plan.routineSequence.some((entry) => entry.routineId === routineId),
  );
}

export function deleteCustomFitnessExercise(
  library: FitnessCustomLibrary,
  exerciseId: string,
  now: string,
) {
  const references = getCustomFitnessExerciseReferences(library, exerciseId);
  if (references.length > 0) {
    return { ok: false as const, references };
  }

  return {
    ok: true as const,
    library: {
      ...library,
      exercises: library.exercises.filter((exercise) => exercise.id !== exerciseId),
      updatedAt: now,
    },
  };
}

export function deleteCustomFitnessRoutine(
  library: FitnessCustomLibrary,
  routineId: string,
  now: string,
) {
  const references = getCustomFitnessRoutineReferences(library, routineId);
  if (references.length > 0) {
    return { ok: false as const, references };
  }

  return {
    ok: true as const,
    library: {
      ...library,
      routines: library.routines.filter((routine) => routine.id !== routineId),
      updatedAt: now,
    },
  };
}

export function deleteCustomFitnessPlan(
  library: FitnessCustomLibrary,
  planId: string,
  now: string,
) {
  return {
    ok: true as const,
    library: {
      ...library,
      plans: library.plans.filter((plan) => plan.id !== planId),
      updatedAt: now,
    },
  };
}
