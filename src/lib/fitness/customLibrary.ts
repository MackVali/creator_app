import type { FitnessPlanTemplate } from "@/lib/fitness/planTemplates";
import type {
  FitnessRoutineExercisePrescription,
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
  movementType: string;
  primaryArea: string;
  equipment: string;
  guidance: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomFitnessRoutine = {
  id: string;
  title: string;
  goal: FitnessRoutineTemplate["goal"];
  level: FitnessRoutineLevel;
  equipment: string;
  durationMinutes: number;
  exercises: FitnessRoutineExercisePrescription[];
  createdAt: string;
  updatedAt: string;
};

export type CustomFitnessPlan = {
  id: string;
  title: string;
  description?: string;
  goal: string;
  level: FitnessPlanTemplate["level"];
  equipment: string;
  recommendedDaysPerWeek: number[];
  allowedDaysPerWeek: number[];
  sessionLengthOptions: number[];
  routineSequence: string[];
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

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(readString)
    .filter((item): item is string => Boolean(item));
}

function readRoutineExercise(value: unknown): FitnessRoutineExercisePrescription | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  const sets = readPositiveInteger(value.sets);
  const role = readString(value.role) as FitnessRoutineExercisePrescription["role"] | null;
  if (!name || !sets || !role) return null;

  const reps = readPositiveInteger(value.reps);
  const durationSeconds = readPositiveInteger(value.durationSeconds);
  const restSeconds = readPositiveInteger(value.restSeconds);

  return {
    name,
    sets,
    ...(reps ? { reps } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(restSeconds ? { restSeconds } : {}),
    role,
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

  return {
    id,
    name,
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
  const equipment = readString(value.equipment);
  const durationMinutes = readPositiveInteger(value.durationMinutes);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const exercises = Array.isArray(value.exercises)
    ? value.exercises
        .map(readRoutineExercise)
        .filter((exercise): exercise is FitnessRoutineExercisePrescription => Boolean(exercise))
    : [];
  if (!id || !title || !goal || !level || !equipment || !durationMinutes || !createdAt || !updatedAt || exercises.length === 0) {
    return null;
  }

  return {
    id,
    title,
    goal,
    level,
    equipment,
    durationMinutes,
    exercises,
    createdAt,
    updatedAt,
  };
}

function readCustomPlan(value: unknown): CustomFitnessPlan | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const title = readString(value.title);
  const goal = readString(value.goal);
  const level = readString(value.level) as CustomFitnessPlan["level"] | null;
  const equipment = readString(value.equipment);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const routineSequence = readStringArray(value.routineSequence);
  const sessionLengthOptions = readNumberArray(value.sessionLengthOptions);
  const allowedDaysPerWeek = readNumberArray(value.allowedDaysPerWeek);
  const recommendedDaysPerWeek = readNumberArray(value.recommendedDaysPerWeek);
  if (
    !id ||
    !title ||
    !goal ||
    !level ||
    !equipment ||
    !createdAt ||
    !updatedAt ||
    routineSequence.length === 0 ||
    sessionLengthOptions.length === 0 ||
    allowedDaysPerWeek.length === 0
  ) {
    return null;
  }

  return {
    id,
    title,
    description: readOptionalString(value.description),
    goal,
    level,
    equipment,
    recommendedDaysPerWeek:
      recommendedDaysPerWeek.length > 0 ? recommendedDaysPerWeek : [allowedDaysPerWeek[0]],
    allowedDaysPerWeek,
    sessionLengthOptions,
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
  return {
    ...base,
    exercises: [
      ...base.exercises.filter((item) => item.id !== exercise.id),
      exercise,
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
  return {
    ...base,
    routines: [
      ...base.routines.filter((item) => item.id !== routine.id),
      routine,
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
  return {
    ...base,
    plans: [
      ...base.plans.filter((item) => item.id !== plan.id),
      plan,
    ],
    updatedAt: now,
  };
}

export function customFitnessRoutineToTemplate(
  routine: CustomFitnessRoutine,
): FitnessRoutineTemplate {
  return {
    id: routine.id,
    group: "custom",
    title: routine.title,
    goal: routine.goal,
    level: routine.level,
    equipment: routine.equipment,
    durationMinutes: routine.durationMinutes,
    exercises: routine.exercises,
  };
}

export function customFitnessPlanToTemplate(plan: CustomFitnessPlan): FitnessPlanTemplate {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    goal: plan.goal,
    level: plan.level,
    equipment: plan.equipment,
    recommendedDaysPerWeek: plan.recommendedDaysPerWeek,
    allowedDaysPerWeek: plan.allowedDaysPerWeek,
    sessionLengthOptions: plan.sessionLengthOptions,
    routineSequence: plan.routineSequence,
  };
}

