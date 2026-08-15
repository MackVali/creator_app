import type { FitnessPlanTemplate } from "@/lib/fitness/planTemplates";
import type {
  FitnessActivePlanExerciseOverride,
  FitnessEquipmentProfile,
} from "@/lib/fitness/equipmentAlternatives";
import {
  FITNESS_EQUIPMENT_PROFILE_OPTIONS,
  getFitnessPlanEquipmentProfileFromTemplateEquipment,
} from "@/lib/fitness/equipmentAlternatives";
import {
  FITNESS_PROFILE_ENTRY_KIND,
  type FitnessProfile,
  type FitnessProfileDatabaseEntry,
} from "@/lib/fitness/profile";

export const FITNESS_ACTIVE_PLAN_METADATA_KEY = "fitnessActivePlan";
export const FITNESS_ACTIVE_PLAN_VERSION = 1;
export const FITNESS_ACTIVE_PLAN_SESSION_DURATION_OPTIONS = [
  30,
  45,
  60,
  75,
  90,
] as const;

export const FITNESS_ACTIVE_PLAN_WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

export type FitnessActivePlanWeekday = (typeof FITNESS_ACTIVE_PLAN_WEEKDAYS)[number];

export type FitnessActivePlan = {
  version: typeof FITNESS_ACTIVE_PLAN_VERSION;
  planTemplateId: string;
  planTitle: string;
  source: "creator" | "custom";
  status: "active" | "paused";
  targetDaysPerWeek: number;
  weekdays: FitnessActivePlanWeekday[];
  sessionDurationMinutes: number;
  equipmentProfile: FitnessEquipmentProfile;
  exerciseOverrides?: FitnessActivePlanExerciseOverride[];
  routineSequenceSnapshot?: FitnessActivePlanRoutineSnapshot[];
  linkedFitnessHabitId?: string;
  startedAt: string;
  currentRoutineIndex: number;
  completedWorkoutCount: number;
  checkInAfterCompletedWorkouts: number;
  createdAt: string;
  updatedAt: string;
};

export type FitnessActivePlanRoutineSnapshot = {
  fitnessRoutineTemplateId: string;
  fitnessRoutineTitle: string;
};

export type FitnessPlanMatchLabel =
  | "Best match"
  | "Good match"
  | "Schedule mismatch"
  | "Equipment mismatch";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function includesValue<T extends readonly unknown[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return values.includes(value);
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function normalizeGoal(value: string) {
  const normalized = normalizeLabel(value);
  if (normalized === "get stronger") return "strength";
  if (normalized === "athletic performance") return "athleticism";
  if (normalized === "improve conditioning") return "athleticism";
  if (normalized === "move and feel better") return "mobility";
  return normalized;
}

function normalizeEquipment(value: string) {
  const normalized = normalizeLabel(value);
  if (normalized === "full gym") return "full gym";
  if (normalized === "home gym") return "mixed";
  return normalized;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readEquipmentProfile(value: unknown): FitnessEquipmentProfile | null {
  return includesValue(FITNESS_EQUIPMENT_PROFILE_OPTIONS, value) ? value : null;
}

function readExerciseOverrides(value: unknown): FitnessActivePlanExerciseOverride[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const overrides: FitnessActivePlanExerciseOverride[] = [];
  const seen = new Set<string>();
  for (const override of value) {
    if (!isRecord(override)) return null;
    const routineTemplateId = readOptionalString(override.routineTemplateId);
    const originalExerciseId = readOptionalString(override.originalExerciseId);
    const replacementExerciseId = readOptionalString(override.replacementExerciseId);
    if (!routineTemplateId || !originalExerciseId || !replacementExerciseId) return null;
    const key = `${routineTemplateId}::${originalExerciseId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    overrides.push({ routineTemplateId, originalExerciseId, replacementExerciseId });
  }

  return overrides;
}

function readRoutineSequenceSnapshot(
  value: unknown,
): FitnessActivePlanRoutineSnapshot[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const snapshots: FitnessActivePlanRoutineSnapshot[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const fitnessRoutineTemplateId = readOptionalString(item.fitnessRoutineTemplateId);
    const fitnessRoutineTitle = readOptionalString(item.fitnessRoutineTitle);
    if (!fitnessRoutineTemplateId || !fitnessRoutineTitle) return null;
    if (seen.has(fitnessRoutineTemplateId)) continue;
    seen.add(fitnessRoutineTemplateId);
    snapshots.push({ fitnessRoutineTemplateId, fitnessRoutineTitle });
  }

  return snapshots;
}

function normalizeSessionDurationMinutes(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 60;
  const rounded = Math.round(duration);
  return Math.min(180, Math.max(1, rounded));
}

export function getFitnessPlanDefaultSessionDurationMinutes(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  const target = getFitnessPlanTargetSessionMinutes(plan, profile);
  const options = FITNESS_ACTIVE_PLAN_SESSION_DURATION_OPTIONS;
  return options.reduce((closest, option) => {
    const closestDistance = Math.abs(closest - target);
    const optionDistance = Math.abs(option - target);
    return optionDistance < closestDistance ? option : closest;
  }, options[0]);
}

export function fitnessActivePlanWeekdayToRecurrenceDay(
  weekday: FitnessActivePlanWeekday,
) {
  switch (weekday) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    case "Sun":
      return 0;
  }
}

export function fitnessActivePlanWeekdaysToRecurrenceDays(
  weekdays: readonly FitnessActivePlanWeekday[],
) {
  return weekdays.map(fitnessActivePlanWeekdayToRecurrenceDay);
}

export function formatFitnessActivePlanSchedule(activePlan: FitnessActivePlan) {
  const weekdayLabel =
    activePlan.weekdays.length > 0
      ? activePlan.weekdays.join(" · ")
      : "Schedule not set";
  return `${weekdayLabel} · ${activePlan.sessionDurationMinutes} min`;
}

export function getFitnessPlanTargetDaysPerWeek(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  const allowedDaysPerWeek = plan.allowedDaysPerWeek ?? plan.daysPerWeekOptions ?? [];
  const recommendedDaysPerWeek = plan.recommendedDaysPerWeek ?? allowedDaysPerWeek;
  if (profile && allowedDaysPerWeek.includes(profile.trainingDaysPerWeek)) {
    return profile.trainingDaysPerWeek;
  }

  return recommendedDaysPerWeek[0] ?? allowedDaysPerWeek[0] ?? 1;
}

export function getFitnessPlanDefaultEquipmentProfile(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  return profile?.equipment ?? getFitnessPlanEquipmentProfileFromTemplateEquipment(plan.equipment);
}

export function getFitnessPlanTargetSessionMinutes(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  if (profile && plan.sessionLengthOptions.includes(profile.sessionDurationMinutes)) {
    return profile.sessionDurationMinutes;
  }

  return plan.sessionLengthOptions[0] ?? 30;
}

export function getFitnessPlanMatchLabel(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
): FitnessPlanMatchLabel | null {
  if (!profile) return null;

  const equipmentMatches =
    normalizeEquipment(plan.equipment) === "mixed" ||
    normalizeEquipment(plan.equipment) === normalizeEquipment(profile.equipment) ||
    (normalizeEquipment(profile.equipment) === "full gym" &&
      normalizeEquipment(plan.equipment) !== "bodyweight");
  if (!equipmentMatches) return "Equipment mismatch";

  const scheduleMatches = (plan.allowedDaysPerWeek ?? plan.daysPerWeekOptions ?? []).includes(
    profile.trainingDaysPerWeek,
  );
  if (!scheduleMatches) return "Schedule mismatch";

  const goalMatches = normalizeGoal(plan.goal) === normalizeGoal(profile.primaryGoal);
  const levelMatches = normalizeLabel(plan.level) === normalizeLabel(profile.experienceLevel);
  const durationMatches = plan.sessionLengthOptions.includes(profile.sessionDurationMinutes);
  const score = [goalMatches, levelMatches, durationMatches].filter(Boolean).length;

  if (score === 3) return "Best match";
  if (score >= 2) return "Good match";

  return null;
}

export function getFitnessPlanFitReasons(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  if (!profile) return [];

  const reasons: string[] = [];
  if (normalizeGoal(plan.goal) === normalizeGoal(profile.primaryGoal)) {
    reasons.push(`Matches your ${profile.primaryGoal.toLowerCase()} goal.`);
  }
  if (normalizeLabel(plan.level) === normalizeLabel(profile.experienceLevel)) {
    reasons.push(`Built for ${profile.experienceLevel.toLowerCase()} training.`);
  }
  if ((plan.allowedDaysPerWeek ?? plan.daysPerWeekOptions ?? []).includes(profile.trainingDaysPerWeek)) {
    reasons.push(`Supports ${profile.trainingDaysPerWeek} training days per week.`);
  } else {
    reasons.push(
      `Template frequency differs from your ${profile.trainingDaysPerWeek}-day preference.`,
    );
  }
  if (plan.sessionLengthOptions.includes(profile.sessionDurationMinutes)) {
    reasons.push(`Fits your ${profile.sessionDurationMinutes}-minute session preference.`);
  }
  if (normalizeEquipment(plan.equipment) === normalizeEquipment(profile.equipment)) {
    reasons.push(`Uses your ${profile.equipment.toLowerCase()} equipment profile.`);
  }

  return reasons.slice(0, 3);
}

export function readFitnessActivePlan(value: unknown): FitnessActivePlan | null {
  if (!isRecord(value)) return null;
  if (value.version !== FITNESS_ACTIVE_PLAN_VERSION) return null;
  if (value.source !== "creator" && value.source !== "custom") return null;
  if (value.status !== "active" && value.status !== "paused") return null;
  if (typeof value.planTemplateId !== "string" || !value.planTemplateId.trim()) return null;
  if (typeof value.planTitle !== "string" || !value.planTitle.trim()) return null;
  if (typeof value.startedAt !== "string" || !value.startedAt.trim()) return null;
  if (typeof value.createdAt !== "string" || !value.createdAt.trim()) return null;
  if (typeof value.updatedAt !== "string" || !value.updatedAt.trim()) return null;

  const targetDaysPerWeek = Number(value.targetDaysPerWeek);
  const currentRoutineIndex = Number(value.currentRoutineIndex);
  const completedWorkoutCount = Number(value.completedWorkoutCount);
  const checkInAfterCompletedWorkouts = Number(value.checkInAfterCompletedWorkouts);
  if (
    !Number.isInteger(targetDaysPerWeek) ||
    targetDaysPerWeek < 1 ||
    targetDaysPerWeek > 7 ||
    !Number.isInteger(currentRoutineIndex) ||
    currentRoutineIndex < 0 ||
    !Number.isInteger(completedWorkoutCount) ||
    completedWorkoutCount < 0 ||
    !Number.isInteger(checkInAfterCompletedWorkouts) ||
    checkInAfterCompletedWorkouts < 1 ||
    !Array.isArray(value.weekdays) ||
    !value.weekdays.every((weekday) => includesValue(FITNESS_ACTIVE_PLAN_WEEKDAYS, weekday))
  ) {
    return null;
  }

  const weekdays = value.weekdays as FitnessActivePlanWeekday[];
  const scheduleMode =
    typeof value.scheduleMode === "string" ? value.scheduleMode : null;
  if (scheduleMode === "flexible" && weekdays.length > 0) return null;
  if (scheduleMode === "weekly" && weekdays.length !== targetDaysPerWeek) return null;
  if (!scheduleMode && weekdays.length !== targetDaysPerWeek) return null;

  const linkedFitnessHabitId = readOptionalString(value.linkedFitnessHabitId);
  const equipmentProfile = readEquipmentProfile(value.equipmentProfile) ?? "Full gym";
  const exerciseOverrides = readExerciseOverrides(value.exerciseOverrides);
  if (!exerciseOverrides) return null;
  const routineSequenceSnapshot = readRoutineSequenceSnapshot(
    value.routineSequenceSnapshot,
  );
  if (!routineSequenceSnapshot) return null;

  return {
    version: FITNESS_ACTIVE_PLAN_VERSION,
    planTemplateId: value.planTemplateId,
    planTitle: value.planTitle,
    source: value.source === "custom" ? "custom" : "creator",
    status: value.status,
    targetDaysPerWeek,
    weekdays,
    sessionDurationMinutes: normalizeSessionDurationMinutes(
      value.sessionDurationMinutes,
    ),
    equipmentProfile,
    ...(exerciseOverrides.length > 0 ? { exerciseOverrides } : {}),
    ...(routineSequenceSnapshot.length > 0 ? { routineSequenceSnapshot } : {}),
    ...(linkedFitnessHabitId ? { linkedFitnessHabitId } : {}),
    startedAt: value.startedAt,
    currentRoutineIndex,
    completedWorkoutCount,
    checkInAfterCompletedWorkouts,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function readFitnessActivePlanFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  return readFitnessActivePlan(metadata[FITNESS_ACTIVE_PLAN_METADATA_KEY]);
}

export function getFitnessActivePlanEntry(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  return entries.find((entry) => readFitnessActivePlanFromMetadata(entry.values.metadata));
}

export function getFitnessActivePlanFromEntries(
  entries: readonly FitnessProfileDatabaseEntry[],
) {
  const entry = getFitnessActivePlanEntry(entries);
  return entry ? readFitnessActivePlanFromMetadata(entry.values.metadata) : null;
}

export function buildFitnessActivePlan({
  plan,
  targetDaysPerWeek,
  weekdays,
  sessionDurationMinutes,
  equipmentProfile,
  exerciseOverrides,
  routineSequenceSnapshot,
  now,
  existingActivePlan,
  linkedFitnessHabitId,
}: {
  plan: FitnessPlanTemplate;
  targetDaysPerWeek: number;
  weekdays: FitnessActivePlanWeekday[];
  sessionDurationMinutes: number;
  equipmentProfile: FitnessEquipmentProfile;
  exerciseOverrides?: FitnessActivePlanExerciseOverride[];
  routineSequenceSnapshot?: FitnessActivePlanRoutineSnapshot[];
  now: string;
  existingActivePlan?: FitnessActivePlan | null;
  linkedFitnessHabitId?: string | null;
}): FitnessActivePlan {
  const preserveProgress =
    existingActivePlan?.planTemplateId === plan.id ? existingActivePlan : null;
  const resolvedLinkedFitnessHabitId =
    linkedFitnessHabitId ??
    preserveProgress?.linkedFitnessHabitId ??
    undefined;
  return {
    version: FITNESS_ACTIVE_PLAN_VERSION,
    planTemplateId: plan.id,
    planTitle: plan.title,
    source: plan.source === "custom" || plan.id.startsWith("custom-plan") ? "custom" : "creator",
    status: "active",
    targetDaysPerWeek,
    weekdays,
    sessionDurationMinutes: normalizeSessionDurationMinutes(
      sessionDurationMinutes,
    ),
    equipmentProfile,
    ...(exerciseOverrides && exerciseOverrides.length > 0
      ? { exerciseOverrides }
      : {}),
    ...(routineSequenceSnapshot && routineSequenceSnapshot.length > 0
      ? { routineSequenceSnapshot }
      : {}),
    ...(resolvedLinkedFitnessHabitId
      ? { linkedFitnessHabitId: resolvedLinkedFitnessHabitId }
      : {}),
    startedAt: preserveProgress?.startedAt ?? now,
    currentRoutineIndex: preserveProgress
      ? plan.source === "custom" || plan.id.startsWith("custom-plan")
        ? preserveProgress.currentRoutineIndex %
          Math.max(1, routineSequenceSnapshot?.length ?? plan.routineSequence.length)
        : preserveProgress.currentRoutineIndex
      : 0,
    completedWorkoutCount: preserveProgress?.completedWorkoutCount ?? 0,
    checkInAfterCompletedWorkouts: targetDaysPerWeek * 4,
    createdAt: preserveProgress?.createdAt ?? now,
    updatedAt: now,
  };
}

export function mergeFitnessActivePlanMetadata(
  metadata: unknown,
  activePlan: FitnessActivePlan,
): Record<string, unknown> {
  const current = isRecord(metadata) ? metadata : {};

  return {
    ...current,
    entryKind: current.entryKind ?? FITNESS_PROFILE_ENTRY_KIND,
    [FITNESS_ACTIVE_PLAN_METADATA_KEY]: activePlan,
  };
}

export function buildFitnessActivePlanEntry({
  databaseId,
  existingEntry,
  activePlan,
  now,
}: {
  databaseId: string;
  existingEntry?: FitnessProfileDatabaseEntry | null;
  activePlan: FitnessActivePlan;
  now: string;
}): FitnessProfileDatabaseEntry {
  return {
    id: existingEntry?.id ?? `creator-fitness-profile-${databaseId || "default"}`,
    createdAt: existingEntry?.createdAt ?? activePlan.createdAt,
    updatedAt: now,
    values: {
      ...(existingEntry?.values ?? {}),
      metadata: mergeFitnessActivePlanMetadata(existingEntry?.values.metadata, activePlan),
    },
  };
}
