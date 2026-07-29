import type { FitnessPlanTemplate } from "@/lib/fitness/planTemplates";
import {
  FITNESS_PROFILE_ENTRY_KIND,
  type FitnessProfile,
  type FitnessProfileDatabaseEntry,
} from "@/lib/fitness/profile";

export const FITNESS_ACTIVE_PLAN_METADATA_KEY = "fitnessActivePlan";
export const FITNESS_ACTIVE_PLAN_VERSION = 1;

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
export type FitnessActivePlanScheduleMode = "flexible" | "weekly";

export type FitnessActivePlan = {
  version: typeof FITNESS_ACTIVE_PLAN_VERSION;
  planTemplateId: string;
  planTitle: string;
  source: "creator";
  status: "active" | "paused";
  scheduleMode: FitnessActivePlanScheduleMode;
  targetDaysPerWeek: number;
  weekdays: FitnessActivePlanWeekday[];
  startedAt: string;
  currentRoutineIndex: number;
  completedWorkoutCount: number;
  checkInAfterCompletedWorkouts: number;
  createdAt: string;
  updatedAt: string;
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

export function getFitnessPlanTargetDaysPerWeek(
  plan: FitnessPlanTemplate,
  profile?: FitnessProfile | null,
) {
  if (profile && plan.daysPerWeekOptions.includes(profile.trainingDaysPerWeek)) {
    return profile.trainingDaysPerWeek;
  }

  return plan.daysPerWeekOptions[0] ?? 1;
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

  const scheduleMatches = plan.daysPerWeekOptions.includes(profile.trainingDaysPerWeek);
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
  if (plan.daysPerWeekOptions.includes(profile.trainingDaysPerWeek)) {
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
  if (value.source !== "creator") return null;
  if (value.status !== "active" && value.status !== "paused") return null;
  if (value.scheduleMode !== "flexible" && value.scheduleMode !== "weekly") return null;
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
  if (value.scheduleMode === "flexible" && weekdays.length > 0) return null;
  if (value.scheduleMode === "weekly" && weekdays.length !== targetDaysPerWeek) return null;

  return {
    version: FITNESS_ACTIVE_PLAN_VERSION,
    planTemplateId: value.planTemplateId,
    planTitle: value.planTitle,
    source: "creator",
    status: value.status,
    scheduleMode: value.scheduleMode,
    targetDaysPerWeek,
    weekdays,
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
  scheduleMode,
  targetDaysPerWeek,
  weekdays,
  now,
}: {
  plan: FitnessPlanTemplate;
  scheduleMode: FitnessActivePlanScheduleMode;
  targetDaysPerWeek: number;
  weekdays: FitnessActivePlanWeekday[];
  now: string;
}): FitnessActivePlan {
  return {
    version: FITNESS_ACTIVE_PLAN_VERSION,
    planTemplateId: plan.id,
    planTitle: plan.title,
    source: "creator",
    status: "active",
    scheduleMode,
    targetDaysPerWeek,
    weekdays: scheduleMode === "flexible" ? [] : weekdays,
    startedAt: now,
    currentRoutineIndex: 0,
    completedWorkoutCount: 0,
    checkInAfterCompletedWorkouts: targetDaysPerWeek * 4,
    createdAt: now,
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
