export const FITNESS_PROFILE_METADATA_KEY = "fitnessProfile";
export const FITNESS_PROFILE_ENTRY_KIND = "fitnessProfile";
export const FITNESS_PROFILE_VERSION = 1;

export const FITNESS_PROFILE_PRIMARY_GOALS = [
  "Build muscle",
  "Get stronger",
  "Improve conditioning",
  "Athletic performance",
  "Move and feel better",
  "General fitness",
] as const;

export const FITNESS_PROFILE_EXPERIENCE_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
] as const;

export const FITNESS_PROFILE_EQUIPMENT_OPTIONS = [
  "Bodyweight",
  "Dumbbells",
  "Home gym",
  "Full gym",
] as const;

export const FITNESS_PROFILE_SESSION_DURATIONS = [30, 45, 60, 75] as const;
export const FITNESS_PROFILE_WEIGHT_UNITS = ["lb", "kg"] as const;
export const FITNESS_PROFILE_ANATOMY_DISPLAYS = ["male", "female", "neutral"] as const;

export type FitnessProfilePrimaryGoal = (typeof FITNESS_PROFILE_PRIMARY_GOALS)[number];
export type FitnessProfileExperienceLevel = (typeof FITNESS_PROFILE_EXPERIENCE_LEVELS)[number];
export type FitnessProfileEquipment = (typeof FITNESS_PROFILE_EQUIPMENT_OPTIONS)[number];
export type FitnessProfileSessionDuration =
  (typeof FITNESS_PROFILE_SESSION_DURATIONS)[number];
export type FitnessProfileWeightUnit = (typeof FITNESS_PROFILE_WEIGHT_UNITS)[number];
export type FitnessProfileAnatomyDisplay =
  (typeof FITNESS_PROFILE_ANATOMY_DISPLAYS)[number];

export type FitnessProfile = {
  version: typeof FITNESS_PROFILE_VERSION;
  primaryGoal: FitnessProfilePrimaryGoal;
  experienceLevel: FitnessProfileExperienceLevel;
  equipment: FitnessProfileEquipment;
  trainingDaysPerWeek: number;
  sessionDurationMinutes: FitnessProfileSessionDuration;
  preferredWeightUnit: FitnessProfileWeightUnit;
  anatomyDisplay: FitnessProfileAnatomyDisplay;
  createdAt: string;
  updatedAt: string;
};

export type FitnessProfileDraft = Partial<
  Pick<
    FitnessProfile,
    | "primaryGoal"
    | "experienceLevel"
    | "equipment"
    | "trainingDaysPerWeek"
    | "sessionDurationMinutes"
    | "preferredWeightUnit"
    | "anatomyDisplay"
  >
>;

export type FitnessProfileDatabaseEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function includesValue<T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value);
}

export function buildFitnessProfileEntryId(databaseId: string) {
  return `creator-fitness-profile-${databaseId || "default"}`;
}

export function isFitnessProfileEntry(entry: FitnessProfileDatabaseEntry) {
  const metadata = isRecord(entry.values.metadata) ? entry.values.metadata : {};
  return metadata.entryKind === FITNESS_PROFILE_ENTRY_KIND;
}

export function readFitnessProfile(value: unknown): FitnessProfile | null {
  if (!isRecord(value)) return null;
  if (value.version !== FITNESS_PROFILE_VERSION) return null;
  if (!includesValue(FITNESS_PROFILE_PRIMARY_GOALS, value.primaryGoal)) return null;
  if (!includesValue(FITNESS_PROFILE_EXPERIENCE_LEVELS, value.experienceLevel)) return null;
  if (!includesValue(FITNESS_PROFILE_EQUIPMENT_OPTIONS, value.equipment)) return null;
  if (!includesValue(FITNESS_PROFILE_SESSION_DURATIONS, value.sessionDurationMinutes)) {
    return null;
  }
  if (!includesValue(FITNESS_PROFILE_WEIGHT_UNITS, value.preferredWeightUnit)) return null;
  if (!includesValue(FITNESS_PROFILE_ANATOMY_DISPLAYS, value.anatomyDisplay)) return null;
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) return null;
  if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return null;

  const trainingDaysPerWeek = Number(value.trainingDaysPerWeek);
  if (
    !Number.isInteger(trainingDaysPerWeek) ||
    trainingDaysPerWeek < 1 ||
    trainingDaysPerWeek > 7
  ) {
    return null;
  }

  return {
    version: FITNESS_PROFILE_VERSION,
    primaryGoal: value.primaryGoal,
    experienceLevel: value.experienceLevel,
    equipment: value.equipment,
    trainingDaysPerWeek,
    sessionDurationMinutes: value.sessionDurationMinutes,
    preferredWeightUnit: value.preferredWeightUnit,
    anatomyDisplay: value.anatomyDisplay,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function readFitnessProfileFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  return readFitnessProfile(metadata[FITNESS_PROFILE_METADATA_KEY]);
}

export function getFitnessProfileEntry(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  return entries.find((entry) => readFitnessProfileFromMetadata(entry.values.metadata));
}

export function getFitnessProfileFromEntries(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  const entry = getFitnessProfileEntry(entries);
  return entry ? readFitnessProfileFromMetadata(entry.values.metadata) : null;
}

export function isFitnessProfileDraftComplete(
  draft: FitnessProfileDraft,
): draft is Omit<FitnessProfile, "version" | "createdAt" | "updatedAt"> {
  return Boolean(
    draft.primaryGoal &&
      draft.experienceLevel &&
      draft.equipment &&
      draft.trainingDaysPerWeek &&
      draft.sessionDurationMinutes &&
      draft.preferredWeightUnit &&
      draft.anatomyDisplay &&
      readFitnessProfile({
        version: FITNESS_PROFILE_VERSION,
        primaryGoal: draft.primaryGoal,
        experienceLevel: draft.experienceLevel,
        equipment: draft.equipment,
        trainingDaysPerWeek: draft.trainingDaysPerWeek,
        sessionDurationMinutes: draft.sessionDurationMinutes,
        preferredWeightUnit: draft.preferredWeightUnit,
        anatomyDisplay: draft.anatomyDisplay,
        createdAt: "draft-created",
        updatedAt: "draft-updated",
      }),
  );
}

export function buildFitnessProfileFromDraft(
  draft: FitnessProfileDraft,
  options: { existingProfile?: FitnessProfile | null; now: string },
): FitnessProfile | null {
  if (!isFitnessProfileDraftComplete(draft)) return null;

  return {
    version: FITNESS_PROFILE_VERSION,
    primaryGoal: draft.primaryGoal,
    experienceLevel: draft.experienceLevel,
    equipment: draft.equipment,
    trainingDaysPerWeek: draft.trainingDaysPerWeek,
    sessionDurationMinutes: draft.sessionDurationMinutes,
    preferredWeightUnit: draft.preferredWeightUnit,
    anatomyDisplay: draft.anatomyDisplay,
    createdAt: options.existingProfile?.createdAt ?? options.now,
    updatedAt: options.now,
  };
}

export function mergeFitnessProfileMetadata(
  metadata: unknown,
  profile: FitnessProfile,
): Record<string, unknown> {
  const current = isRecord(metadata) ? metadata : {};

  return {
    ...current,
    entryKind: FITNESS_PROFILE_ENTRY_KIND,
    [FITNESS_PROFILE_METADATA_KEY]: profile,
  };
}

export function buildFitnessProfileEntry({
  databaseId,
  existingEntry,
  profile,
  now,
}: {
  databaseId: string;
  existingEntry?: FitnessProfileDatabaseEntry | null;
  profile: FitnessProfile;
  now: string;
}): FitnessProfileDatabaseEntry {
  return {
    id: existingEntry?.id ?? buildFitnessProfileEntryId(databaseId),
    createdAt: existingEntry?.createdAt ?? profile.createdAt,
    updatedAt: now,
    values: {
      ...(existingEntry?.values ?? {}),
      metadata: mergeFitnessProfileMetadata(existingEntry?.values.metadata, profile),
    },
  };
}

export function formatFitnessProfileSessionDuration(minutes: FitnessProfileSessionDuration) {
  return minutes === 75 ? "75+ min" : `${minutes} min`;
}
