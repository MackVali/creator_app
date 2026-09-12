"use client";

import type {
  RelatedRoutineCardHabit,
  RelatedRoutineCardRoutine,
} from "@/components/habits/RelatedRoutineCard";
import type { Goal, Project } from "@/app/(app)/goals/types";
import {
  buildMatrixInferredMealEvents,
  findActualScheduledMealTimeBlock,
  type MatrixInferredMealEventData,
  type MatrixMealTimeBlockWindow,
  type MatrixNutritionMealCompletionRow,
  type MatrixScheduledMealEventData,
} from "@/app/(app)/schedule/matrix/matrixInferredMealEvents";
import { compareMatrixTimeBlockStarts } from "@/app/(app)/schedule/matrix/matrixTimeBlockOrder";
import {
  isFitnessPlanManagedHabit,
  isFitnessPlanScheduleMetadata,
  resolveFitnessPlanScheduleCardPresentation,
  type FitnessPlanScheduleRoutineAssignment,
} from "@/lib/fitness/planHabit";
import { resolveCreatorDay, type CreatorDay } from "@/lib/creatorDay";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { evaluateHabitDueOnDate } from "@/lib/scheduler/habitRecurrence";
import type { HabitScheduleItem } from "@/lib/scheduler/habits";
import { addDaysInTimeZone, startOfDayInTimeZone } from "@/lib/scheduler/timezone";
import { resolveScheduleEventSkillContext } from "@/lib/schedule/eventSkillContext";
import {
  getMatrixRoutineProgress,
  isMatrixScheduledRoutineHabitCompleted,
} from "@/lib/schedule/matrixRoutineProgress";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

export type MatrixSupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowser>>;
export type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
export type ProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "name"
  | "goal_id"
  | "stage"
  | "completed_at"
  | "duration_min"
  | "created_at"
  | "due_date"
  | "priority"
  | "energy"
> & {
  tasks?: {
    id: string;
    project_id: string | null;
    stage: string;
    name: string;
    skill_id: string | null;
    priority: string | null;
  }[];
  project_skills?: {
    skill_id: string | null;
  }[];
};
export type GoalRow = Pick<
  Database["public"]["Tables"]["goals"]["Row"],
  "id" | "name" | "monument_id"
>;
export type SkillRow = Pick<
  Database["public"]["Tables"]["skills"]["Row"],
  "id" | "name" | "monument_id" | "icon"
>;
export type HabitRow = Pick<
  Database["public"]["Tables"]["habits"]["Row"],
  | "id"
  | "name"
  | "created_at"
  | "updated_at"
  | "last_completed_at"
  | "current_streak_days"
  | "longest_streak_days"
  | "habit_type"
  | "duration_minutes"
  | "energy"
  | "recurrence"
  | "recurrence_days"
  | "recurrence_mode"
  | "anchor_type"
  | "anchor_value"
  | "anchor_start_date"
  | "skill_id"
  | "goal_id"
  | "completion_target"
  | "location_context_id"
  | "daylight_preference"
  | "window_edge_preference"
  | "next_due_override"
  | "memo_capture_config"
  | "routine_id"
  | "routine_position"
>;
export type RoutineRow = Pick<
  Database["public"]["Tables"]["habit_routines"]["Row"],
  "id" | "name" | "description" | "icon"
>;
export type HabitCompletionDayRow = Pick<
  Database["public"]["Tables"]["habit_completion_days"]["Row"],
  "habit_id"
>;
export type TimeBlockRow = Pick<
  Database["public"]["Tables"]["time_blocks"]["Row"],
  "id" | "label" | "start_local" | "end_local"
>;
export type DayTypeTimeBlockRow = {
  id: string;
  time_block_id: string | null;
  energy: string | null;
};

export type MatrixHabitDueStatus = {
  isDue: boolean;
  isOverdue: boolean;
  isCompletedToday?: boolean;
  dueStart?: Date | null;
  label: "DUE" | "OVERDUE" | "DUE TODAY" | "COMPLETE";
};
type MatrixHabitDueEvaluation = ReturnType<typeof evaluateHabitDueOnDate>;

export type MatrixHabit = HabitRow & {
  monumentId: string | null;
  skillIds: string[];
  skillIcon: string | null;
  glyph: string;
  dueStatus?: MatrixHabitDueStatus;
  fitnessPlanRoutineAssignment?: FitnessPlanScheduleRoutineAssignment | null;
};
export type MatrixRoutineHabit = RelatedRoutineCardHabit & {
  sourceHabit: MatrixHabit;
  sourceInstance?: ScheduleInstance;
  durationMinutes: number | null;
};
export type MatrixRoutine = Omit<RelatedRoutineCardRoutine, "habits"> & {
  habits: MatrixRoutineHabit[];
  completed: boolean;
  monumentId: string | null;
  skillIds: string[];
  glyph: string;
  dueHabitCount: number;
  totalDueDurationMinutes: number | null;
  sortRank: number;
};
export type MatrixEvent = {
  instance: ScheduleInstance;
  title: string;
  subtitle?: string | null;
  monumentId: string | null;
  skillIds: string[];
  skillResolverSource: string | null;
  glyph: string;
  goal: Goal | null;
  habit: MatrixHabit | null;
  routine: MatrixRoutine | null;
  inferredMeal: MatrixInferredMealEventData | null;
  scheduledMeal: MatrixScheduledMealEventData | null;
};

export type LoadMatrixScheduledEventsResult = {
  creatorDay: CreatorDay;
  displayDate: Date;
  instances: ScheduleInstance[];
  scheduledEvents: MatrixEvent[];
  allHabits: HabitRow[];
  scheduledHabits: HabitRow[];
  projects: ProjectRow[];
  goals: GoalRow[];
  skills: SkillRow[];
  routines: RoutineRow[];
  timeBlocks: TimeBlockRow[];
  dayTypeTimeBlocks: DayTypeTimeBlockRow[];
  matrixWindowsForDate: MatrixMealTimeBlockWindow[];
  nutritionMeals: MatrixNutritionMealCompletionRow[];
  monuments: Monument[];
  completedHabitIdsForCreatorDay: Set<string>;
  scheduledHabitIds: Set<string>;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveMatrixCreatorDay(timeZone: string, instant = new Date()) {
  return resolveCreatorDay({ instant, profileTimezone: timeZone });
}

export function getMatrixCreatorDayDisplayDate(creatorDay: CreatorDay) {
  return new Date(creatorDay.startsAt);
}

export function normalizeMatrixSourceId(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toScheduleHabit(habit: HabitRow): HabitScheduleItem {
  return {
    id: habit.id,
    name: habit.name,
    memoCaptureConfig: habit.memo_capture_config ?? null,
    durationMinutes: habit.duration_minutes,
    createdAt: habit.created_at,
    updatedAt: habit.updated_at,
    lastCompletedAt: habit.last_completed_at,
    currentStreakDays: habit.current_streak_days,
    longestStreakDays: habit.longest_streak_days,
    habitType: habit.habit_type,
    windowId: null,
    energy: habit.energy,
    recurrence: habit.recurrence,
    recurrenceDays: habit.recurrence_days,
    recurrenceMode: habit.recurrence_mode,
    anchorType: habit.anchor_type,
    anchorValue: habit.anchor_value,
    anchorStartDate: habit.anchor_start_date,
    skillId: habit.skill_id,
    goalId: habit.goal_id,
    completionTarget: habit.completion_target,
    locationContextId: habit.location_context_id,
    locationContextValue: null,
    locationContextName: null,
    daylightPreference: habit.daylight_preference,
    windowEdgePreference: habit.window_edge_preference,
    nextDueOverride: habit.next_due_override,
    window: null,
  };
}

function getRecurrenceCode(value: HabitRow["recurrence"]): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function isDailyMatrixRecurrence(habit: HabitRow): boolean {
  const recurrence = getRecurrenceCode(habit.recurrence);
  return (
    recurrence === "" ||
    recurrence === "daily" ||
    recurrence === "none" ||
    recurrence === "everyday"
  );
}

function getMatrixOverdueFallbackStart(
  habit: HabitRow,
  date: Date,
  timeZone: string,
): Date | null {
  if (!isDailyMatrixRecurrence(habit)) return null;

  const lastCompletedAt = parseOptionalDate(habit.last_completed_at);
  if (lastCompletedAt) {
    return addDaysInTimeZone(
      startOfDayInTimeZone(lastCompletedAt, timeZone),
      1,
      timeZone,
    );
  }

  const nextDueOverride = parseOptionalDate(habit.next_due_override);
  if (nextDueOverride && nextDueOverride.getTime() <= date.getTime()) {
    return startOfDayInTimeZone(nextDueOverride, timeZone);
  }

  const anchorStartDate = parseOptionalDate(habit.anchor_start_date);
  if (anchorStartDate) return startOfDayInTimeZone(anchorStartDate, timeZone);

  const createdAt = parseOptionalDate(habit.created_at);
  if (createdAt) return startOfDayInTimeZone(createdAt, timeZone);

  const updatedAt = parseOptionalDate(habit.updated_at);
  if (updatedAt) return startOfDayInTimeZone(updatedAt, timeZone);

  return null;
}

function getMatrixHabitOverdueStart({
  habit,
  evaluation,
  date,
  timeZone,
}: {
  habit: HabitRow;
  evaluation: MatrixHabitDueEvaluation;
  date: Date;
  timeZone: string;
}): Date | null {
  if (!evaluation.isDue) return null;

  const dueStart = evaluation.dueStart ?? null;
  const dayStart = startOfDayInTimeZone(date, timeZone);
  const dueStartDay = dueStart
    ? startOfDayInTimeZone(dueStart, timeZone)
    : null;
  const shouldUseFallback =
    dueStartDay?.getTime() === dayStart.getTime() &&
    (evaluation.debugTag === "DUE_DAILY" ||
      evaluation.debugTag === "DUE_NO_ANCHOR");

  if (!shouldUseFallback) return dueStart;

  return getMatrixOverdueFallbackStart(habit, date, timeZone) ?? dueStart;
}

export function getMatrixHabitDueStatus(
  habit: HabitRow,
  date: Date,
  timeZone: string,
): MatrixHabitDueStatus {
  const todayEvaluation = evaluateHabitDueOnDate({
    habit: toScheduleHabit(habit),
    date,
    timeZone,
    nextDueOverride: parseOptionalDate(habit.next_due_override),
  });
  const overdueStart = getMatrixHabitOverdueStart({
    habit,
    evaluation: todayEvaluation,
    date,
    timeZone,
  });
  const overdueStartMs = overdueStart?.getTime();
  const isOverdue =
    todayEvaluation.isDue &&
    typeof overdueStartMs === "number" &&
    date.getTime() - overdueStartMs >= MS_PER_DAY * 7;

  return {
    isDue: todayEvaluation.isDue,
    isOverdue,
    dueStart: overdueStart,
    label: isOverdue
      ? "OVERDUE"
      : habit.duration_minutes
        ? "DUE"
        : "DUE TODAY",
  };
}

export function getMatrixHabitDisplayStatus(
  habit: HabitRow,
  date: Date,
  timeZone: string,
  completedHabitIds: ReadonlySet<string>,
): MatrixHabitDueStatus {
  if (completedHabitIds.has(habit.id)) {
    return {
      isDue: true,
      isOverdue: false,
      isCompletedToday: true,
      label: "COMPLETE",
    };
  }

  return getMatrixHabitDueStatus(habit, date, timeZone);
}

export function isMatrixEventCompleted(event: MatrixEvent): boolean {
  if (event.routine) return event.routine.completed;
  return event.instance.status?.trim().toLowerCase() === "completed";
}

export function getMatrixEventStartTime(event: MatrixEvent): number {
  const startUtc = event.instance.start_utc;
  if (!startUtc) return Number.POSITIVE_INFINITY;
  const startTime = new Date(startUtc).getTime();
  return Number.isNaN(startTime) ? Number.POSITIVE_INFINITY : startTime;
}

export function getMatrixEventEndTime(event: MatrixEvent): number {
  const endUtc = event.instance.end_utc;
  if (!endUtc) return Number.POSITIVE_INFINITY;
  const endTime = new Date(endUtc).getTime();
  return Number.isNaN(endTime) ? Number.POSITIVE_INFINITY : endTime;
}

export function getHabitFallbackGlyph(habitType?: string | null) {
  return habitType?.trim().toUpperCase() === "CHORE" ? "◆" : "✦";
}

export function normalizeRelatedHabitType(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || "HABIT";
  return normalized === "ASYNC" ? "SYNC" : normalized;
}

export function getMatrixHabitTypeRank(habitType: string | null | undefined): number {
  switch (normalizeRelatedHabitType(habitType)) {
    case "CHORE":
      return 0;
    case "HABIT":
      return 1;
    case "SYNC":
      return 3;
    case "PRACTICE":
      return 4;
    default:
      return 5;
  }
}

export function getMatrixEventTypeRank(event: MatrixEvent): number {
  if (event.routine) return event.routine.sortRank;
  if (event.habit) return getMatrixHabitTypeRank(event.habit.habit_type);
  if (event.goal) return 2;
  return 5;
}

function normalizePriorityCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "CRITICAL", "ULTRA-CRITICAL"].includes(
    upper,
  )
    ? upper
    : "NO";
}

function normalizeEnergyCode(value?: string | null): string {
  const upper = typeof value === "string" ? value.toUpperCase() : "NO";
  return ["NO", "LOW", "MEDIUM", "HIGH", "ULTRA", "EXTREME"].includes(upper)
    ? upper
    : "NO";
}

function mapPriority(priority: string | null | undefined): Goal["priority"] {
  const normalized = priority?.trim().toUpperCase();
  switch (normalized) {
    case "NO":
      return "No";
    case "ULTRA-CRITICAL":
      return "Ultra";
    case "CRITICAL":
      return "Critical";
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return "Low";
  }
}

function mapEnergy(energy: string | null | undefined): Goal["energy"] {
  const normalized = energy?.trim().toUpperCase();
  switch (normalized) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "ULTRA":
      return "Ultra";
    case "EXTREME":
      return "Extreme";
    default:
      return "No";
  }
}

function resolveHabitMonumentId({
  habit,
  goals,
  skillIdToMonumentId,
}: {
  habit: HabitRow | null | undefined;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
}) {
  if (!habit) return null;

  const goal = habit.goal_id ? goals.get(habit.goal_id) : null;
  if (goal?.monument_id) return goal.monument_id;

  return habit.skill_id
    ? (skillIdToMonumentId.get(habit.skill_id) ?? null)
    : null;
}

function getExplicitProjectSkillIds(project: ProjectRow): string[] {
  return (project.project_skills ?? [])
    .map((record) => record.skill_id)
    .filter((skillId): skillId is string => Boolean(skillId));
}

function getProjectSkillIds(project: ProjectRow): string[] {
  const projectSkillIds = getExplicitProjectSkillIds(project);
  const taskSkillIds = (project.tasks ?? [])
    .map((task) => task.skill_id)
    .filter((skillId): skillId is string => Boolean(skillId));

  return Array.from(new Set([...projectSkillIds, ...taskSkillIds]));
}

function buildProjectGoal({
  project,
  goal,
  skillIdToIcon,
  monumentIdToEmoji,
}: {
  project: ProjectRow;
  goal: GoalRow | null;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
}): Goal {
  const tasks = (project.tasks ?? []).map((task) => ({
    id: task.id,
    name: task.name,
    stage: task.stage,
    skillId: task.skill_id ?? null,
    skillIcon: task.skill_id ? (skillIdToIcon.get(task.skill_id) ?? null) : null,
    priorityCode: task.priority ?? null,
    isNew: false,
  }));
  const projectSkillIds = getExplicitProjectSkillIds(project);
  const taskSkillIds = tasks
    .map((task) => task.skillId)
    .filter((skillId): skillId is string => Boolean(skillId));
  const projectEmoji =
    projectSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    taskSkillIds
      .map((skillId) => skillIdToIcon.get(skillId) ?? null)
      .find((icon): icon is string => Boolean(icon)) ??
    null;
  const completedAt =
    typeof project.completed_at === "string" &&
    project.completed_at.trim().length > 0
      ? project.completed_at
      : null;
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.stage === "PERFECT").length;
  const progress = completedAt
    ? 100
    : totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
  const energyCode = normalizeEnergyCode(project.energy);
  const priorityCode = normalizePriorityCode(project.priority);
  const stage = project.stage ?? "BUILD";
  const mappedProject: Project = {
    id: project.id,
    name: project.name,
    status: completedAt ? "Done" : "In-Progress",
    progress,
    energy: mapEnergy(energyCode),
    energyCode,
    dueDate: project.due_date ?? undefined,
    durationMinutes:
      typeof project.duration_min === "number" &&
      Number.isFinite(project.duration_min)
        ? project.duration_min
        : null,
    skillIds: projectSkillIds,
    emoji: projectEmoji,
    stage,
    priorityCode,
    isNew: false,
    tasks,
  };
  const createdAt = project.created_at ?? new Date().toISOString();
  const monumentId = goal?.monument_id ?? null;

  return {
    id: project.id,
    parentGoalId: goal?.id ?? project.goal_id ?? null,
    title: project.name,
    emoji: projectEmoji ?? undefined,
    priority: mapPriority(priorityCode),
    energy: mapEnergy(energyCode),
    progress,
    status: completedAt ? "COMPLETED" : "ACTIVE",
    active: !completedAt,
    createdAt,
    updatedAt: createdAt,
    dueDate: project.due_date ?? undefined,
    projects: [mappedProject],
    monumentId,
    monumentEmoji: monumentId ? (monumentIdToEmoji.get(monumentId) ?? null) : null,
    priorityCode,
    energyCode,
    skills: Array.from(new Set([...projectSkillIds, ...taskSkillIds])),
    weightBoost: 0,
  };
}

function buildLegacyMatrixFitnessOccurrenceOffsets(
  instances: readonly ScheduleInstance[],
  habits: Map<string, HabitRow>,
) {
  const grouped = new Map<string, Array<{ id: string; start: Date }>>();
  for (const instance of instances) {
    if (instance.source_type !== "HABIT") continue;
    if (instance.status !== "scheduled" && instance.status !== "completed") {
      continue;
    }
    if (!instance.id) continue;
    const habit = habits.get(instance.source_id);
    if (
      !habit ||
      !(
        isFitnessPlanScheduleMetadata(instance.metadata) ||
        isFitnessPlanManagedHabit(habit)
      )
    ) {
      continue;
    }
    const start = new Date(instance.start_utc ?? "");
    if (Number.isNaN(start.getTime())) continue;
    const group = grouped.get(habit.id) ?? [];
    group.push({ id: instance.id, start });
    grouped.set(habit.id, group);
  }

  const offsets = new Map<string, number>();
  for (const group of grouped.values()) {
    group
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .forEach((item, index) => offsets.set(item.id, index));
  }
  return offsets;
}

export function buildMatrixEvents({
  instances,
  projects,
  habits,
  goals,
  skillIdToMonumentId,
  skillIdToIcon,
  monumentIdToEmoji,
  mealWindows,
  dateKey,
  date,
  timeZone,
  completedHabitIds,
}: {
  instances: ScheduleInstance[];
  projects: Map<string, ProjectRow>;
  habits: Map<string, HabitRow>;
  goals: Map<string, GoalRow>;
  skillIdToMonumentId: Map<string, string>;
  skillIdToIcon: Map<string, string>;
  monumentIdToEmoji: Map<string, string>;
  mealWindows: MatrixMealTimeBlockWindow[];
  dateKey: string;
  date: Date;
  timeZone: string;
  completedHabitIds: ReadonlySet<string>;
}): MatrixEvent[] {
  const legacyFitnessOccurrenceOffsets = buildLegacyMatrixFitnessOccurrenceOffsets(
    instances,
    habits,
  );

  return instances.flatMap((instance) => {
    if (instance.source_type === "EVENT") {
      const mealWindow = findActualScheduledMealTimeBlock(instance, mealWindows);
      const skillContext = resolveScheduleEventSkillContext(instance.metadata);
      const skillIds = skillContext.skillIds;
      const firstSkillId = skillIds[0] ?? null;
      const monumentId = firstSkillId
        ? (skillIdToMonumentId.get(firstSkillId) ?? null)
        : null;
      const glyph = firstSkillId
        ? (skillIdToIcon.get(firstSkillId) ??
          (monumentId ? (monumentIdToEmoji.get(monumentId) ?? null) : null) ??
          "◇")
        : "◇";
      return [
        {
          instance,
          title: instance.event_name ?? "Untitled event",
          monumentId,
          skillIds,
          skillResolverSource: skillContext.source,
          glyph,
          goal: null,
          habit: null,
          routine: null,
          inferredMeal: null,
          scheduledMeal: mealWindow
            ? {
                scheduleInstanceId: instance.id,
                eventId: instance.source_id ?? null,
                title: instance.event_name ?? mealWindow.label ?? "Meal",
                timeBlockId:
                  instance.time_block_id ??
                  mealWindow.timeBlockId ??
                  mealWindow.time_block_id ??
                  mealWindow.sourceWindowId ??
                  mealWindow.id ??
                  null,
                dayTypeTimeBlockId:
                  instance.day_type_time_block_id ??
                  mealWindow.dayTypeTimeBlockId ??
                  mealWindow.day_type_time_block_id ??
                  null,
                windowId: instance.window_id ?? mealWindow.window_id ?? null,
                dateKey,
                startUtc: instance.start_utc ?? "",
                endUtc: instance.end_utc ?? "",
                startLocal: mealWindow.start_local ?? null,
                endLocal: mealWindow.end_local ?? null,
              }
            : null,
        },
      ];
    }

    if (instance.source_type === "PROJECT") {
      const project = projects.get(instance.source_id);
      const goal = project?.goal_id ? goals.get(project.goal_id) : null;
      const monumentId = goal?.monument_id ?? null;
      const projectGoal = project
        ? buildProjectGoal({
            project,
            goal: goal ?? null,
            skillIdToIcon,
            monumentIdToEmoji,
          })
        : null;
      return [
        {
          instance,
          title: instance.event_name ?? project?.name ?? "Untitled project",
          monumentId,
          skillIds: project ? getProjectSkillIds(project) : [],
          skillResolverSource: null,
          glyph: monumentId ? (monumentIdToEmoji.get(monumentId) ?? "◇") : "◇",
          goal: projectGoal,
          habit: null,
          routine: null,
          inferredMeal: null,
          scheduledMeal: null,
        },
      ];
    }

    if (instance.source_type !== "HABIT") return [];

    const habit = habits.get(instance.source_id);
    const habitSkillIcon =
      habit?.skill_id ? skillIdToIcon.get(habit.skill_id) : null;
    const dueStatus = habit
      ? getMatrixHabitDisplayStatus(habit, date, timeZone, completedHabitIds)
      : undefined;
    const fitnessCard = habit
      ? resolveFitnessPlanScheduleCardPresentation({
          metadata: instance.metadata,
          memoCaptureConfig: habit.memo_capture_config ?? null,
          fallbackOccurrenceOffset: instance.id
            ? (legacyFitnessOccurrenceOffsets.get(instance.id) ?? null)
            : null,
        })
      : null;
    const monumentId = resolveHabitMonumentId({
      habit,
      goals,
      skillIdToMonumentId,
    });
    const event: MatrixEvent = {
      instance,
      title:
        fitnessCard?.title ??
        instance.event_name ??
        habit?.name ??
        "Untitled habit",
      subtitle: fitnessCard?.routineTitle ?? null,
      monumentId,
      skillIds: habit?.skill_id ? [habit.skill_id] : [],
      skillResolverSource: habit?.skill_id ? "habit.skill_id" : null,
      glyph: habitSkillIcon ?? getHabitFallbackGlyph(habit?.habit_type),
      goal: null,
      habit: habit
        ? {
            ...habit,
            monumentId,
            skillIds: habit.skill_id ? [habit.skill_id] : [],
            skillIcon: habitSkillIcon ?? null,
            glyph: habitSkillIcon ?? getHabitFallbackGlyph(habit.habit_type),
            dueStatus,
          }
        : null,
      routine: null,
      inferredMeal: null,
      scheduledMeal: null,
    };
    return [event];
  });
}

export function buildMatrixInferredMealMatrixEvents({
  inferredMeals,
  userId,
}: {
  inferredMeals: MatrixInferredMealEventData[];
  userId: string;
}): MatrixEvent[] {
  const nowIso = new Date().toISOString();

  return inferredMeals.map((inferredMeal) => {
    const instance: ScheduleInstance = {
      id: inferredMeal.syntheticEventId,
      user_id: userId,
      source_id: inferredMeal.syntheticEventId,
      source_type: "EVENT",
      start_utc: inferredMeal.startUtc,
      end_utc: inferredMeal.endUtc,
      duration_min: inferredMeal.durationMinutes,
      status: inferredMeal.completed ? "completed" : "scheduled",
      weight_snapshot: 0,
      energy_resolved: "NO",
      event_name: inferredMeal.title,
      time_block_id: inferredMeal.timeBlockId,
      day_type_time_block_id: inferredMeal.dayTypeTimeBlockId,
      window_id: inferredMeal.windowId,
      overlay_window_id: null,
      practice_context_monument_id: null,
      metadata: {
        matrixInferredMeal: {
          source: "matrix-inferred-meal",
          syntheticEventId: inferredMeal.syntheticEventId,
          dateKey: inferredMeal.dateKey,
          timeBlockId: inferredMeal.timeBlockId,
          dayTypeTimeBlockId: inferredMeal.dayTypeTimeBlockId,
          startUtc: inferredMeal.startUtc,
          endUtc: inferredMeal.endUtc,
          startLocal: inferredMeal.startLocal,
          endLocal: inferredMeal.endLocal,
        },
      },
      completed_at: inferredMeal.completedAt,
      canceled_reason: null,
      locked: true,
      missed_reason: null,
      notes: null,
      placement_source: "manual",
      project_name: null,
      scheduled_at: nowIso,
      updated_at: nowIso,
    };

    return {
      instance,
      title: inferredMeal.title,
      monumentId: null,
      skillIds: [],
      skillResolverSource: null,
      glyph: "🍽️",
      goal: null,
      habit: null,
      routine: null,
      inferredMeal,
      scheduledMeal: null,
    };
  });
}

function getMatrixScheduledHabitLabel(
  status: ScheduleInstance["status"] | null | undefined,
) {
  if (status === "completed") return "COMPLETE";
  if (status && status !== "scheduled") return status.replaceAll("_", " ");
  return "SCHEDULED";
}

function isMatrixScheduledRoutineCompleted(habits: readonly MatrixRoutineHabit[]) {
  return getMatrixRoutineProgress(habits).isComplete;
}

export function buildMatrixScheduledEvents({
  events,
  routines,
}: {
  events: MatrixEvent[];
  routines: Map<string, RoutineRow>;
}): MatrixEvent[] {
  const scheduledEvents: MatrixEvent[] = [];
  const routineEventGroups = new Map<string, MatrixEvent[]>();

  for (const event of events) {
    const routineId = event.habit?.routine_id?.trim();
    if (!routineId) {
      scheduledEvents.push(event);
      continue;
    }

    const group = routineEventGroups.get(routineId);
    if (group) group.push(event);
    else routineEventGroups.set(routineId, [event]);
  }

  for (const [routineId, routineEvents] of routineEventGroups) {
    if (routineEvents.length === 0) continue;

    const routine = routines.get(routineId);
    const sortedEvents = [...routineEvents].sort((a, b) => {
      const firstPosition =
        typeof a.habit?.routine_position === "number" &&
        Number.isFinite(a.habit.routine_position)
          ? a.habit.routine_position
          : Number.POSITIVE_INFINITY;
      const secondPosition =
        typeof b.habit?.routine_position === "number" &&
        Number.isFinite(b.habit.routine_position)
          ? b.habit.routine_position
          : Number.POSITIVE_INFINITY;
      if (firstPosition !== secondPosition) return firstPosition - secondPosition;

      const firstStartTime = getMatrixEventStartTime(a);
      const secondStartTime = getMatrixEventStartTime(b);
      if (firstStartTime !== secondStartTime) return firstStartTime - secondStartTime;

      return a.title.localeCompare(b.title);
    });
    const representativeEvent = sortedEvents[0];
    if (!representativeEvent) continue;

    const matrixRoutineHabits: MatrixRoutineHabit[] = sortedEvents.flatMap(
      (event, index) => {
        const habit = event.habit;
        if (!habit) return [];

        return [
          {
            id: habit.id,
            name: habit.name,
            dueLabel: getMatrixScheduledHabitLabel(event.instance.status),
            skillIcon: habit.skillIcon,
            completed: isMatrixScheduledRoutineHabitCompleted({
              sourceInstance: event.instance,
            }),
            routinePosition: habit.routine_position ?? index + 1,
            currentStreakDays: habit.current_streak_days,
            habitType: habit.habit_type,
            recurrence: habit.recurrence,
            durationMinutes:
              event.instance.duration_min ?? habit.duration_minutes,
            energy: habit.energy,
            goalId: habit.goal_id,
            skillId: habit.skill_id,
            routineId: habit.routine_id,
            locationContextId: habit.location_context_id,
            daylightPreference: habit.daylight_preference,
            windowEdgePreference: habit.window_edge_preference,
            nextDueOverride: habit.next_due_override,
            sourceHabit: habit,
            sourceInstance: event.instance,
          },
        ];
      },
    );
    if (matrixRoutineHabits.length === 0) continue;

    const routineSkillIds = Array.from(
      new Set(sortedEvents.flatMap((event) => event.skillIds)),
    );
    const routineMonumentId =
      sortedEvents.find((event) => event.monumentId)?.monumentId ?? null;
    const totalDuration = matrixRoutineHabits.reduce((sum, habit) => {
      const duration = habit.durationMinutes;
      return typeof duration === "number" && Number.isFinite(duration)
        ? sum + duration
        : sum;
    }, 0);
    const routineName = routine?.name?.trim() || "Routine";
    const routineIcon = routine?.icon?.trim() || "🔁";
    const routineItem: MatrixRoutine = {
      id: routineId,
      name: routineName,
      description: routine?.description ?? null,
      icon: routineIcon,
      habits: matrixRoutineHabits,
      completed: isMatrixScheduledRoutineCompleted(matrixRoutineHabits),
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      glyph: routineIcon,
      dueHabitCount: matrixRoutineHabits.length,
      totalDueDurationMinutes: totalDuration > 0 ? totalDuration : null,
      sortRank: Math.min(
        ...matrixRoutineHabits.map((habit) =>
          getMatrixHabitTypeRank(habit.sourceHabit.habit_type),
        ),
      ),
    };

    scheduledEvents.push({
      ...representativeEvent,
      title: routineName,
      monumentId: routineMonumentId,
      skillIds: routineSkillIds,
      glyph: routineIcon,
      goal: null,
      habit: null,
      routine: routineItem,
      inferredMeal: null,
      scheduledMeal: null,
    });
  }

  return scheduledEvents;
}

export function sortMatrixScheduledItems(
  items: MatrixEvent[],
  heldCompletedItemIds?: ReadonlySet<string>,
): MatrixEvent[] {
  return [...items].sort((a, b) => {
    const aCompleted =
      isMatrixEventCompleted(a) && !heldCompletedItemIds?.has(a.instance.id);
    const bCompleted =
      isMatrixEventCompleted(b) && !heldCompletedItemIds?.has(b.instance.id);
    const completionDifference = Number(aCompleted) - Number(bCompleted);
    if (completionDifference !== 0) return completionDifference;

    const rankDifference = getMatrixEventTypeRank(a) - getMatrixEventTypeRank(b);
    if (rankDifference !== 0) return rankDifference;

    const aStartTime = getMatrixEventStartTime(a);
    const bStartTime = getMatrixEventStartTime(b);
    if (aStartTime !== bStartTime) return aStartTime - bStartTime;

    return a.title.localeCompare(b.title);
  });
}

async function fetchMatrixWindowsForCreatorDay({
  creatorDay,
  timeZone,
}: {
  creatorDay: CreatorDay;
  timeZone: string;
}) {
  const params = new URLSearchParams();
  params.set("dayKey", creatorDay.creatorDayDate);
  params.set("timeZone", timeZone);
  params.set("mode", "creator-day");
  const response = await fetch(`/api/windows/for-date?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Matrix Time Blocks (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as {
    windows?: MatrixMealTimeBlockWindow[];
  } | null;
  return payload?.windows ?? [];
}

async function fetchMatrixNutritionMeals({
  dayStart,
  dayEnd,
}: {
  dayStart: Date;
  dayEnd: Date;
}) {
  const params = new URLSearchParams();
  params.set("start", dayStart.toISOString());
  params.set("end", dayEnd.toISOString());
  params.set("limit", "100");
  const response = await fetch(`/api/nutrition/meals?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Matrix Nutrition meals (${response.status})`);
  }
  const payload = (await response.json().catch(() => null)) as {
    meals?: MatrixNutritionMealCompletionRow[];
  } | null;
  return payload?.meals ?? [];
}

export async function loadMatrixScheduledEventsForCreatorDay({
  supabase,
  userId,
  timeZone,
  creatorDay,
}: {
  supabase: MatrixSupabaseClient;
  userId: string;
  timeZone: string;
  creatorDay: CreatorDay;
}): Promise<LoadMatrixScheduledEventsResult> {
  const displayDate = getMatrixCreatorDayDisplayDate(creatorDay);
  const dayStart = new Date(creatorDay.startsAt);
  const dayEnd = new Date(creatorDay.endsAt);
  const dayKey = creatorDay.creatorDayDate;

  const { data: instanceData, error: instanceError } = await supabase
    .from("schedule_instances")
    .select(
      "id, source_id, source_type, start_utc, end_utc, status, completed_at, weight_snapshot, event_name, time_block_id, day_type_time_block_id, window_id, energy_resolved, metadata",
    )
    .eq("user_id", userId)
    .in("source_type", ["PROJECT", "HABIT", "EVENT"])
    .in("status", ["scheduled", "in_progress", "completed"])
    .lt("start_utc", dayEnd.toISOString())
    .gt("end_utc", dayStart.toISOString())
    .order("start_utc", { ascending: true });

  if (instanceError) throw instanceError;

  const instances = (instanceData ?? []) as ScheduleInstance[];
  const matrixWindowsPromise = fetchMatrixWindowsForCreatorDay({
    creatorDay,
    timeZone,
  }).catch((error) => {
    console.error("Failed to load Matrix Time Blocks", error);
    return [] as MatrixMealTimeBlockWindow[];
  });
  const nutritionMealsPromise = fetchMatrixNutritionMeals({
    dayStart,
    dayEnd,
  }).catch((error) => {
    console.error("Failed to load Matrix Nutrition meals", error);
    return [] as MatrixNutritionMealCompletionRow[];
  });

  const projectIds = instances
    .filter((item) => item.source_type === "PROJECT")
    .map((item) => item.source_id);
  const scheduledHabitIds = new Set(
    instances
      .filter((item) => item.source_type === "HABIT")
      .map((item) => normalizeMatrixSourceId(item.source_id))
      .filter(Boolean),
  );
  const timeBlockIds = Array.from(
    new Set(
      instances
        .map((item) => item.time_block_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const dayTypeTimeBlockIds = Array.from(
    new Set(
      instances
        .map((item) => item.day_type_time_block_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const monumentsPromise = getMonumentsForUser(userId).catch((error) => {
    console.error("Failed to load Matrix monuments", error);
    return [] as Monument[];
  });

  const [
    habitResult,
    allHabitsResult,
    goalResult,
    skillResult,
    timeBlockResult,
    dayTypeTimeBlockByIdResult,
    dayTypeTimeBlockByBlockResult,
    monuments,
    matrixWindowsForDate,
    nutritionMeals,
  ] = await Promise.all([
    scheduledHabitIds.size
      ? supabase
          .from("habits")
          .select(
            "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, memo_capture_config, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override, routine_id, routine_position",
          )
          .eq("user_id", userId)
          .is("circle_id", null)
          .in("id", Array.from(scheduledHabitIds))
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("habits")
      .select(
        "id, name, created_at, updated_at, last_completed_at, current_streak_days, longest_streak_days, habit_type, memo_capture_config, duration_minutes, energy, recurrence, recurrence_days, recurrence_mode, anchor_type, anchor_value, anchor_start_date, skill_id, goal_id, completion_target, location_context_id, daylight_preference, window_edge_preference, next_due_override, routine_id, routine_position",
      )
      .eq("user_id", userId)
      .is("circle_id", null),
    supabase.from("goals").select("id, name, monument_id").eq("user_id", userId),
    supabase.from("skills").select("id, name, monument_id, icon").eq("user_id", userId),
    timeBlockIds.length
      ? supabase
          .from("time_blocks")
          .select("id, label, start_local, end_local")
          .eq("user_id", userId)
          .in("id", timeBlockIds)
      : Promise.resolve({ data: [], error: null }),
    dayTypeTimeBlockIds.length
      ? supabase
          .from("day_type_time_blocks")
          .select("id, time_block_id, energy")
          .eq("user_id", userId)
          .in("id", dayTypeTimeBlockIds)
      : Promise.resolve({ data: [], error: null }),
    timeBlockIds.length
      ? supabase
          .from("day_type_time_blocks")
          .select("id, time_block_id, energy")
          .eq("user_id", userId)
          .in("time_block_id", timeBlockIds)
      : Promise.resolve({ data: [], error: null }),
    monumentsPromise,
    matrixWindowsPromise,
    nutritionMealsPromise,
  ]);

  if (habitResult.error) throw habitResult.error;
  if (allHabitsResult.error) throw allHabitsResult.error;
  if (goalResult.error) throw goalResult.error;
  if (skillResult.error) throw skillResult.error;
  if (timeBlockResult.error) throw timeBlockResult.error;
  if (dayTypeTimeBlockByIdResult.error) throw dayTypeTimeBlockByIdResult.error;
  if (dayTypeTimeBlockByBlockResult.error) {
    throw dayTypeTimeBlockByBlockResult.error;
  }

  const allHabits = (allHabitsResult.data ?? []) as HabitRow[];
  const routineIds = Array.from(
    new Set(
      allHabits
        .map((habit) => habit.routine_id)
        .filter((routineId): routineId is string => Boolean(routineId?.trim())),
    ),
  );
  const routineResult = routineIds.length
    ? await supabase
        .from("habit_routines")
        .select("id, name, description, icon")
        .eq("user_id", userId)
        .in("id", routineIds)
    : { data: [], error: null };

  if (routineResult.error) throw routineResult.error;

  const allProjectIds = Array.from(new Set(projectIds));
  const projectResult = allProjectIds.length
    ? await supabase
        .from("projects")
        .select(
          `
            id, name, goal_id, stage, completed_at, duration_min, created_at, due_date,
            priority,
            energy,
            tasks (
              id, project_id, stage, name, skill_id, priority
            ),
            project_skills (
              skill_id
            )
          `,
        )
        .eq("user_id", userId)
        .in("id", allProjectIds)
    : { data: [], error: null };

  if (projectResult.error) throw projectResult.error;

  const allHabitIds = Array.from(
    new Set(allHabits.map((habit) => habit.id).filter((id): id is string => Boolean(id))),
  );
  const habitCompletionResult = allHabitIds.length
    ? await supabase
        .from("habit_completion_days")
        .select("habit_id")
        .eq("user_id", userId)
        .eq("completion_day", creatorDay.creatorDayDate)
        .in("habit_id", allHabitIds)
    : { data: [], error: null };

  if (habitCompletionResult.error) throw habitCompletionResult.error;

  const completedHabitIdsForCreatorDay = new Set(
    ((habitCompletionResult.data ?? []) as HabitCompletionDayRow[])
      .map((row) => row.habit_id)
      .filter((id): id is string => Boolean(id)),
  );
  const skillIdToMonumentId = new Map<string, string>();
  const skillIdToIcon = new Map<string, string>();
  const skills = (skillResult.data ?? []) as SkillRow[];
  for (const skill of skills) {
    if (skill.id && skill.monument_id) {
      skillIdToMonumentId.set(skill.id, skill.monument_id);
    }
    if (skill.id && skill.icon) {
      skillIdToIcon.set(skill.id, skill.icon);
    }
  }
  const monumentIdToEmoji = new Map(
    monuments
      .filter((monument) => monument.emoji)
      .map((monument) => [monument.id, monument.emoji as string]),
  );
  const projects = (projectResult.data ?? []) as ProjectRow[];
  const goals = (goalResult.data ?? []) as GoalRow[];
  const routines = (routineResult.data ?? []) as RoutineRow[];
  const scheduledHabits = (habitResult.data ?? []) as HabitRow[];
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const habitMap = new Map(scheduledHabits.map((habit) => [habit.id, habit]));
  const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
  const routineMap = new Map(routines.map((routine) => [routine.id, routine]));

  const rawEvents = buildMatrixEvents({
    instances,
    projects: projectMap,
    habits: habitMap,
    goals: goalMap,
    skillIdToMonumentId,
    skillIdToIcon,
    monumentIdToEmoji,
    mealWindows: matrixWindowsForDate,
    dateKey: dayKey,
    date: displayDate,
    timeZone,
    completedHabitIds: completedHabitIdsForCreatorDay,
  });
  const events = buildMatrixScheduledEvents({
    events: rawEvents,
    routines: routineMap,
  });
  const inferredMealEvents = buildMatrixInferredMealMatrixEvents({
    inferredMeals: buildMatrixInferredMealEvents({
      windows: matrixWindowsForDate,
      instances,
      meals: nutritionMeals,
      dateKey: dayKey,
    }),
    userId,
  });
  const scheduledEvents = sortMatrixScheduledItems([
    ...events,
    ...inferredMealEvents,
  ]);

  return {
    creatorDay,
    displayDate,
    instances,
    scheduledEvents,
    allHabits,
    scheduledHabits,
    projects,
    goals,
    skills,
    routines,
    timeBlocks: (timeBlockResult.data ?? []) as TimeBlockRow[],
    dayTypeTimeBlocks: [
      ...((dayTypeTimeBlockByIdResult.data ?? []) as DayTypeTimeBlockRow[]),
      ...((dayTypeTimeBlockByBlockResult.data ?? []) as DayTypeTimeBlockRow[]),
    ],
    matrixWindowsForDate,
    nutritionMeals,
    monuments,
    completedHabitIdsForCreatorDay,
    scheduledHabitIds,
  };
}

export function compareMatrixEventStartTime(a: MatrixEvent, b: MatrixEvent) {
  const startDiff = getMatrixEventStartTime(a) - getMatrixEventStartTime(b);
  if (startDiff !== 0) return startDiff;
  return a.title.localeCompare(b.title);
}

export function compareMatrixEventWindowOrder(a: MatrixEvent, b: MatrixEvent) {
  return compareMatrixTimeBlockStarts(a.instance, b.instance);
}
