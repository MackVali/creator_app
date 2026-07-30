import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cancelFutureScheduledHabitInstancesForUpdate } from "@/lib/habits/scheduleReset";
import type {
  FitnessActivePlan,
  FitnessActivePlanWeekday,
} from "@/lib/fitness/activePlan";
import { fitnessActivePlanWeekdaysToRecurrenceDays } from "@/lib/fitness/activePlan";
import {
  FITNESS_PLAN_TEMPLATES,
  resolveFitnessPlanRoutineSequence,
  type FitnessPlanTemplate,
} from "@/lib/fitness/planTemplates";
import {
  FITNESS_SKILL_DOMAIN_KEY,
  isFitnessSkillIdentity,
  normalizeSkillIdentity,
} from "@/lib/skills/domains";
import {
  addDaysInTimeZone,
  normalizeTimeZone,
  startOfDayInTimeZone,
  weekdayInTimeZone,
} from "@/lib/scheduler/timezone";

export const FITNESS_PLAN_HABIT_TITLE = "FITNESS";
export const FITNESS_PLAN_HABIT_METADATA_KEY = "fitnessActivePlanHabit";
export const FITNESS_PLAN_SCHEDULE_METADATA_KEY = "fitnessActivePlan";
export const FITNESS_PLAN_HABIT_METADATA_VERSION = 1;

export type FitnessPlanHabitMetadata = {
  version: typeof FITNESS_PLAN_HABIT_METADATA_VERSION;
  managedBy: "fitnessActivePlan";
  planTemplateId: string;
  planTitle: string;
  weekdays: FitnessActivePlanWeekday[];
  sessionDurationMinutes: number;
  currentRoutineIndex: number;
  skillType: "fitness";
  updatedAt: string;
};

export type FitnessPlanScheduleRoutineAssignment = {
  fitnessPlanTemplateId: string;
  fitnessRoutineTemplateId: string;
  fitnessRoutineTitle: string;
  fitnessRoutineIndex: number;
  fitnessRoutineOccurrenceOffset: number;
};

export type FitnessPlanSchedulePlanSnapshot = {
  fitnessPlanTemplateId: string | null;
  linkedFitnessHabitId: string | null;
};

export type FitnessPlanScheduleCardPresentation = {
  isFitnessPlanManaged: true;
  title: typeof FITNESS_PLAN_HABIT_TITLE;
  routineTitle: string | null;
  routineAssignment: FitnessPlanScheduleRoutineAssignment | null;
  fitnessPlanTemplateId: string | null;
  linkedFitnessHabitId: string | null;
};

type Client = NonNullable<ReturnType<typeof getSupabaseBrowser>>;
type LooseQueryResult = { data: unknown; error: unknown };
type LooseQuery = PromiseLike<LooseQueryResult> & {
  eq(column: string, value: unknown): LooseQuery;
  is(column: string, value: null): LooseQuery;
  in(column: string, values: string[]): LooseQuery;
  select(columns?: string): LooseQuery;
  single(): Promise<LooseQueryResult>;
};
type LooseSupabaseClient = {
  from(table: string): {
    select(columns?: string): LooseQuery;
    update(payload: unknown): LooseQuery;
    insert(payload: unknown): LooseQuery;
  };
};

type PlanHabitRow = Pick<
  Database["public"]["Tables"]["habits"]["Row"],
  | "id"
  | "name"
  | "memo_capture_config"
  | "duration_minutes"
  | "recurrence"
  | "recurrence_days"
  | "skill_id"
>;

type FitnessSkillResolutionRow = {
  id?: string | null;
  name?: string | null;
  global_skill_id?: string | null;
  global_skill?:
    | {
        slug?: string | null;
        feature_key?: string | null;
        name?: string | null;
      }
    | Array<{
        slug?: string | null;
        feature_key?: string | null;
        name?: string | null;
      }>
    | null;
};

type EnsureFitnessActivePlanHabitParams = {
  userId: string;
  plan: FitnessPlanTemplate;
  activePlan: FitnessActivePlan;
  previousActivePlan?: FitnessActivePlan | null;
  skillId?: string | null;
  client?: Client | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asJsonRecord(value: Json | null | undefined): Record<string, Json> {
  return isRecord(value) ? (value as Record<string, Json>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRecordString(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value) return value;
  }
  return "";
}

function readRecordNumber(
  record: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const raw = record[key];
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return null;
}

function isFitnessPlanWeekday(value: unknown): value is FitnessActivePlanWeekday {
  return (
    value === "Mon" ||
    value === "Tue" ||
    value === "Wed" ||
    value === "Thu" ||
    value === "Fri" ||
    value === "Sat" ||
    value === "Sun"
  );
}

function normalizeSessionDuration(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return null;
  return Math.max(1, Math.round(duration));
}

function normalizeRoutineIndex(value: unknown) {
  const index = Number(value);
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.floor(index);
}

function getFitnessPlanTemplateById(planTemplateId: string) {
  return FITNESS_PLAN_TEMPLATES.find((plan) => plan.id === planTemplateId) ?? null;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function weekdayIndexToFitnessPlanWeekday(index: number): FitnessActivePlanWeekday | null {
  switch (index) {
    case 0:
      return "Sun";
    case 1:
      return "Mon";
    case 2:
      return "Tue";
    case 3:
      return "Wed";
    case 4:
      return "Thu";
    case 5:
      return "Fri";
    case 6:
      return "Sat";
    default:
      return null;
  }
}

function getGlobalSkillRecord(row: FitnessSkillResolutionRow) {
  const globalSkill = row.global_skill;
  if (Array.isArray(globalSkill)) return globalSkill[0] ?? null;
  return globalSkill ?? null;
}

function rowMatchesFitnessSkillByGlobalIdentity(row: FitnessSkillResolutionRow) {
  const globalSkill = getGlobalSkillRecord(row);
  return Boolean(
    globalSkill &&
      (normalizeSkillIdentity(globalSkill.feature_key) === FITNESS_SKILL_DOMAIN_KEY ||
        isFitnessSkillIdentity(globalSkill.slug) ||
        isFitnessSkillIdentity(globalSkill.name)),
  );
}

function rowMatchesFitnessSkillByAlias(row: FitnessSkillResolutionRow) {
  return isFitnessSkillIdentity(row.name);
}

function chooseAuthoritativeFitnessSkillId(
  rows: FitnessSkillResolutionRow[],
  preferredSkillId?: string | null,
) {
  const validRows = rows.filter((row) => typeof row.id === "string" && row.id.trim());
  const preferredRow = preferredSkillId
    ? validRows.find((row) => row.id === preferredSkillId)
    : null;
  if (preferredRow && rowMatchesFitnessSkillByGlobalIdentity(preferredRow)) {
    return preferredRow.id ?? null;
  }

  const globalMatch = validRows.find(rowMatchesFitnessSkillByGlobalIdentity);
  if (globalMatch?.id) return globalMatch.id;

  if (preferredRow && rowMatchesFitnessSkillByAlias(preferredRow)) {
    return preferredRow.id ?? null;
  }

  const aliasMatch = validRows.find(rowMatchesFitnessSkillByAlias);
  return aliasMatch?.id ?? null;
}

async function fetchFitnessSkillResolutionRows(
  db: LooseSupabaseClient,
  userId: string,
): Promise<FitnessSkillResolutionRow[]> {
  const joined = await db
    .from("skills")
    .select("id,name,global_skill_id,global_skill:global_skills(slug,feature_key,name)")
    .eq("user_id", userId);
  if (!joined.error) {
    return ((joined.data ?? []) as FitnessSkillResolutionRow[]) ?? [];
  }

  const fallback = await db
    .from("skills")
    .select("id,name,global_skill_id")
    .eq("user_id", userId);
  if (fallback.error) throw fallback.error;
  return ((fallback.data ?? []) as FitnessSkillResolutionRow[]) ?? [];
}

export async function resolveAuthoritativeFitnessSkillId({
  userId,
  client,
  preferredSkillId,
}: {
  userId: string;
  client: LooseSupabaseClient;
  preferredSkillId?: string | null;
}) {
  const rows = await fetchFitnessSkillResolutionRows(client, userId);
  return chooseAuthoritativeFitnessSkillId(rows, preferredSkillId);
}

export function buildFitnessPlanHabitTitle(plan?: FitnessPlanTemplate) {
  void plan;
  return FITNESS_PLAN_HABIT_TITLE;
}

export function buildFitnessPlanHabitMetadata({
  activePlan,
  now,
}: {
  activePlan: FitnessActivePlan;
  now: string;
}): FitnessPlanHabitMetadata {
  return {
    version: FITNESS_PLAN_HABIT_METADATA_VERSION,
    managedBy: "fitnessActivePlan",
    planTemplateId: activePlan.planTemplateId,
    planTitle: activePlan.planTitle,
    weekdays: activePlan.weekdays,
    sessionDurationMinutes: activePlan.sessionDurationMinutes,
    currentRoutineIndex: activePlan.currentRoutineIndex,
    skillType: "fitness",
    updatedAt: now,
  };
}

export function readFitnessPlanHabitMetadata(
  memoCaptureConfig: Json | null | undefined,
): FitnessPlanHabitMetadata | null {
  const config = asJsonRecord(memoCaptureConfig);
  const raw = config[FITNESS_PLAN_HABIT_METADATA_KEY];
  if (!isRecord(raw)) return null;
  if (raw.version !== FITNESS_PLAN_HABIT_METADATA_VERSION) return null;
  if (raw.managedBy !== "fitnessActivePlan") return null;
  const planTemplateId = readString(raw.planTemplateId);
  const planTitle = readString(raw.planTitle);
  const updatedAt = readString(raw.updatedAt);
  const duration = normalizeSessionDuration(raw.sessionDurationMinutes);
  const currentRoutineIndex = normalizeRoutineIndex(raw.currentRoutineIndex);
  const weekdays = Array.isArray(raw.weekdays)
    ? raw.weekdays.filter(isFitnessPlanWeekday)
    : [];
  if (!planTemplateId || !planTitle || !updatedAt || !duration) return null;

  return {
    version: FITNESS_PLAN_HABIT_METADATA_VERSION,
    managedBy: "fitnessActivePlan",
    planTemplateId,
    planTitle,
    weekdays,
    sessionDurationMinutes: duration,
    currentRoutineIndex,
    skillType: "fitness",
    updatedAt,
  };
}

export function resolveFitnessPlanScheduleRoutineAssignment({
  planTemplateId,
  currentRoutineIndex,
  occurrenceOffset,
}: {
  planTemplateId: string;
  currentRoutineIndex: number;
  occurrenceOffset: number;
}): FitnessPlanScheduleRoutineAssignment | null {
  const plan = getFitnessPlanTemplateById(planTemplateId);
  if (!plan) return null;
  const routines = resolveFitnessPlanRoutineSequence(plan);
  if (routines.length === 0) return null;

  const normalizedCurrentIndex = normalizeRoutineIndex(currentRoutineIndex);
  const normalizedOccurrenceOffset = normalizeRoutineIndex(occurrenceOffset);
  const routineIndex = positiveModulo(
    normalizedCurrentIndex + normalizedOccurrenceOffset,
    routines.length,
  );
  const routine = routines[routineIndex] ?? routines[0];
  if (!routine) return null;

  return {
    fitnessPlanTemplateId: plan.id,
    fitnessRoutineTemplateId: routine.id,
    fitnessRoutineTitle: routine.title,
    fitnessRoutineIndex: routineIndex,
    fitnessRoutineOccurrenceOffset: normalizedOccurrenceOffset,
  };
}

export function calculateFitnessPlanOccurrenceOffsetForDate({
  weekdays,
  occurrenceDate,
  horizonStart,
  timeZone,
}: {
  weekdays: readonly FitnessActivePlanWeekday[];
  occurrenceDate: Date;
  horizonStart: Date;
  timeZone: string;
}) {
  if (weekdays.length === 0) return null;

  const selectedWeekdays = new Set(weekdays);
  const zone = normalizeTimeZone(timeZone);
  const startDay = startOfDayInTimeZone(horizonStart, zone);
  const occurrenceDay = startOfDayInTimeZone(occurrenceDate, zone);
  if (occurrenceDay.getTime() < startDay.getTime()) return null;

  let occurrenceOffset = 0;
  for (
    let cursor = startDay;
    cursor.getTime() < occurrenceDay.getTime();
    cursor = addDaysInTimeZone(cursor, 1, zone)
  ) {
    const weekday = weekdayIndexToFitnessPlanWeekday(
      weekdayInTimeZone(cursor, zone),
    );
    if (weekday && selectedWeekdays.has(weekday)) {
      occurrenceOffset += 1;
    }
  }

  return occurrenceOffset;
}

export function resolveFitnessPlanRoutineAssignmentForDate({
  planTemplateId,
  currentRoutineIndex,
  weekdays,
  occurrenceDate,
  horizonStart,
  timeZone,
}: {
  planTemplateId: string;
  currentRoutineIndex: number;
  weekdays: readonly FitnessActivePlanWeekday[];
  occurrenceDate: Date;
  horizonStart: Date;
  timeZone: string;
}) {
  const occurrenceOffset = calculateFitnessPlanOccurrenceOffsetForDate({
    weekdays,
    occurrenceDate,
    horizonStart,
    timeZone,
  });
  if (occurrenceOffset == null) return null;

  return resolveFitnessPlanScheduleRoutineAssignment({
    planTemplateId,
    currentRoutineIndex,
    occurrenceOffset,
  });
}

export function resolveFitnessPlanDueRoutineAssignment({
  memoCaptureConfig,
  occurrenceDate,
  horizonStart,
  timeZone,
}: {
  memoCaptureConfig: Json | null | undefined;
  occurrenceDate: Date;
  horizonStart: Date;
  timeZone: string;
}) {
  const habitMetadata = readFitnessPlanHabitMetadata(memoCaptureConfig);
  if (!habitMetadata) return null;

  return resolveFitnessPlanRoutineAssignmentForDate({
    planTemplateId: habitMetadata.planTemplateId,
    currentRoutineIndex: habitMetadata.currentRoutineIndex,
    weekdays: habitMetadata.weekdays,
    occurrenceDate,
    horizonStart,
    timeZone,
  });
}

export function isFitnessPlanManagedHabit(
  habit:
    | { memoCaptureConfig?: Json | null; memo_capture_config?: Json | null }
    | null
    | undefined,
) {
  return Boolean(
    readFitnessPlanHabitMetadata(
      habit?.memoCaptureConfig ?? habit?.memo_capture_config ?? null,
    ),
  );
}

export function buildFitnessPlanHabitMemoCaptureConfig({
  current,
  activePlan,
  now,
}: {
  current: Json | null | undefined;
  activePlan: FitnessActivePlan;
  now: string;
}) {
  return {
    ...asJsonRecord(current),
    [FITNESS_PLAN_HABIT_METADATA_KEY]: buildFitnessPlanHabitMetadata({
      activePlan,
      now,
    }) as unknown as Json,
  } satisfies Record<string, Json>;
}

export function buildFitnessPlanScheduleInstanceMetadata({
  habitId,
  skillId,
  memoCaptureConfig,
  occurrenceOffset,
}: {
  habitId: string;
  skillId?: string | null;
  memoCaptureConfig: Json | null | undefined;
  occurrenceOffset?: number | null;
}) {
  const planHabit = readFitnessPlanHabitMetadata(memoCaptureConfig);
  if (!planHabit) return null;
  const routineAssignment =
    occurrenceOffset == null
      ? null
      : resolveFitnessPlanScheduleRoutineAssignment({
          planTemplateId: planHabit.planTemplateId,
          currentRoutineIndex: planHabit.currentRoutineIndex,
          occurrenceOffset,
        });

  return {
    presentationKind: "fitness-plan",
    visualKind: "fitness-plan",
    source: "fitness-active-plan",
    skillType: "fitness",
    skillIcon: "🏋️",
    skillId: skillId ?? null,
    fitnessPlanTemplateId:
      routineAssignment?.fitnessPlanTemplateId ?? planHabit.planTemplateId,
    linkedFitnessHabitId: habitId,
    fitnessRoutineTemplateId:
      routineAssignment?.fitnessRoutineTemplateId ?? null,
    fitnessRoutineTitle: routineAssignment?.fitnessRoutineTitle ?? null,
    fitnessRoutineIndex: routineAssignment?.fitnessRoutineIndex ?? null,
    fitnessRoutineOccurrenceOffset:
      routineAssignment?.fitnessRoutineOccurrenceOffset ?? null,
    [FITNESS_PLAN_SCHEDULE_METADATA_KEY]: {
      managedBy: "fitnessActivePlan",
      planTemplateId: planHabit.planTemplateId,
      planTitle: planHabit.planTitle,
      linkedFitnessHabitId: habitId,
      weekdays: planHabit.weekdays,
      sessionDurationMinutes: planHabit.sessionDurationMinutes,
      currentRoutineIndex: planHabit.currentRoutineIndex,
      fitnessPlanTemplateId:
        routineAssignment?.fitnessPlanTemplateId ?? planHabit.planTemplateId,
      fitnessRoutineTemplateId:
        routineAssignment?.fitnessRoutineTemplateId ?? null,
      fitnessRoutineTitle: routineAssignment?.fitnessRoutineTitle ?? null,
      fitnessRoutineIndex: routineAssignment?.fitnessRoutineIndex ?? null,
      fitnessRoutineOccurrenceOffset:
        routineAssignment?.fitnessRoutineOccurrenceOffset ?? null,
    },
  } satisfies Record<string, Json | undefined>;
}

export function isFitnessPlanScheduleMetadata(metadata: Json | null | undefined) {
  if (!isRecord(metadata)) return false;
  const presentationKind = readString(metadata.presentationKind);
  const visualKind = readString(metadata.visualKind);
  const source = readString(metadata.source);
  const plan = metadata[FITNESS_PLAN_SCHEDULE_METADATA_KEY];
  return (
    presentationKind === "fitness-plan" ||
    visualKind === "fitness-plan" ||
    source === "fitness-active-plan" ||
    readString(metadata.fitnessPlanTemplateId).length > 0 ||
    (isRecord(plan) && plan.managedBy === "fitnessActivePlan")
  );
}

export function readFitnessPlanSchedulePlanSnapshot(
  metadata: Json | null | undefined,
): FitnessPlanSchedulePlanSnapshot | null {
  if (!isRecord(metadata)) return null;
  if (!isFitnessPlanScheduleMetadata(metadata)) return null;

  const rawPlan = metadata[FITNESS_PLAN_SCHEDULE_METADATA_KEY];
  const planRecord = isRecord(rawPlan) ? rawPlan : {};
  const fitnessPlanTemplateId =
    readRecordString(
      planRecord,
      "fitnessPlanTemplateId",
      "fitness_plan_template_id",
      "planTemplateId",
      "plan_template_id",
    ) ||
    readRecordString(
      metadata,
      "fitnessPlanTemplateId",
      "fitness_plan_template_id",
      "planTemplateId",
      "plan_template_id",
    ) ||
    null;
  const linkedFitnessHabitId =
    readRecordString(
      planRecord,
      "linkedFitnessHabitId",
      "linked_fitness_habit_id",
    ) ||
    readRecordString(
      metadata,
      "linkedFitnessHabitId",
      "linked_fitness_habit_id",
    ) ||
    null;

  return {
    fitnessPlanTemplateId,
    linkedFitnessHabitId,
  };
}

export function readFitnessPlanScheduleRoutineAssignment(
  metadata: Json | null | undefined,
): FitnessPlanScheduleRoutineAssignment | null {
  if (!isRecord(metadata)) return null;
  const rawPlan = metadata[FITNESS_PLAN_SCHEDULE_METADATA_KEY];
  const planRecord = isRecord(rawPlan) ? rawPlan : {};
  if (!isFitnessPlanScheduleMetadata(metadata)) return null;

  const fitnessPlanTemplateId =
    readRecordString(
      planRecord,
      "fitnessPlanTemplateId",
      "fitness_plan_template_id",
      "planTemplateId",
      "plan_template_id",
    ) ||
    readRecordString(
      metadata,
      "fitnessPlanTemplateId",
      "fitness_plan_template_id",
      "planTemplateId",
      "plan_template_id",
    );
  const fitnessRoutineTemplateId =
    readRecordString(
      planRecord,
      "fitnessRoutineTemplateId",
      "fitness_routine_template_id",
    ) ||
    readRecordString(
      metadata,
      "fitnessRoutineTemplateId",
      "fitness_routine_template_id",
    );
  const fitnessRoutineTitle =
    readRecordString(
      planRecord,
      "fitnessRoutineTitle",
      "fitness_routine_title",
    ) ||
    readRecordString(metadata, "fitnessRoutineTitle", "fitness_routine_title");
  const routineIndex = readRecordNumber(
    planRecord,
    "fitnessRoutineIndex",
    "fitness_routine_index",
  ) ?? readRecordNumber(metadata, "fitnessRoutineIndex", "fitness_routine_index");
  const occurrenceOffset =
    readRecordNumber(
      planRecord,
      "fitnessRoutineOccurrenceOffset",
      "fitness_routine_occurrence_offset",
    ) ??
    readRecordNumber(
      metadata,
      "fitnessRoutineOccurrenceOffset",
      "fitness_routine_occurrence_offset",
    );
  if (
    !fitnessPlanTemplateId ||
    !fitnessRoutineTemplateId ||
    !fitnessRoutineTitle ||
    routineIndex == null ||
    occurrenceOffset == null
  ) {
    return null;
  }

  return {
    fitnessPlanTemplateId,
    fitnessRoutineTemplateId,
    fitnessRoutineTitle,
    fitnessRoutineIndex: routineIndex,
    fitnessRoutineOccurrenceOffset: occurrenceOffset,
  };
}

export function resolveFitnessPlanScheduleDisplayText({
  metadata,
  memoCaptureConfig,
  fallbackOccurrenceOffset,
}: {
  metadata?: Json | null;
  memoCaptureConfig?: Json | null;
  fallbackOccurrenceOffset?: number | null;
}) {
  const snapshottedRoutine = readFitnessPlanScheduleRoutineAssignment(metadata);
  if (snapshottedRoutine) {
    return {
      title: FITNESS_PLAN_HABIT_TITLE,
      routineTitle: snapshottedRoutine.fitnessRoutineTitle,
      routineAssignment: snapshottedRoutine,
    };
  }

  const habitMetadata = readFitnessPlanHabitMetadata(memoCaptureConfig);
  const derivedRoutine =
    habitMetadata && fallbackOccurrenceOffset != null
      ? resolveFitnessPlanScheduleRoutineAssignment({
          planTemplateId: habitMetadata.planTemplateId,
          currentRoutineIndex: habitMetadata.currentRoutineIndex,
          occurrenceOffset: fallbackOccurrenceOffset,
        })
      : null;

  return {
    title: FITNESS_PLAN_HABIT_TITLE,
    routineTitle: derivedRoutine?.fitnessRoutineTitle ?? null,
    routineAssignment: derivedRoutine,
  };
}

export function resolveFitnessPlanScheduleCardPresentation({
  metadata,
  memoCaptureConfig,
  fallbackOccurrenceOffset,
}: {
  metadata?: Json | null;
  memoCaptureConfig?: Json | null;
  fallbackOccurrenceOffset?: number | null;
}): FitnessPlanScheduleCardPresentation | null {
  const scheduleSnapshot = readFitnessPlanSchedulePlanSnapshot(metadata);
  const habitMetadata = readFitnessPlanHabitMetadata(memoCaptureConfig);
  if (!scheduleSnapshot && !habitMetadata) return null;

  const display = resolveFitnessPlanScheduleDisplayText({
    metadata,
    memoCaptureConfig,
    fallbackOccurrenceOffset,
  });

  return {
    isFitnessPlanManaged: true,
    title: FITNESS_PLAN_HABIT_TITLE,
    routineTitle: display.routineTitle ?? null,
    routineAssignment: display.routineAssignment ?? null,
    fitnessPlanTemplateId:
      scheduleSnapshot?.fitnessPlanTemplateId ?? habitMetadata?.planTemplateId ?? null,
    linkedFitnessHabitId: scheduleSnapshot?.linkedFitnessHabitId ?? null,
  };
}

export function formatFitnessPlanRoutineTitleForCompactCard(
  routineTitle: string | null | undefined,
) {
  const title = readString(routineTitle);
  if (!title) return null;
  if (/^push\s+day$/i.test(title)) return "Push";
  if (/^pull\s+day$/i.test(title)) return "Pull";
  if (/^legs\s+day$/i.test(title)) return "Legs";
  return title;
}

export function chooseFitnessPlanHabitRowForUpdate(
  rows: PlanHabitRow[],
  activePlan: FitnessActivePlan,
  previousActivePlan?: FitnessActivePlan | null,
) {
  const previousLinkedId = previousActivePlan?.linkedFitnessHabitId ?? null;
  const linkedId = activePlan.linkedFitnessHabitId ?? previousLinkedId;
  if (linkedId) {
    const linked = rows.find((row) => row.id === linkedId);
    if (linked) return linked;
  }

  const currentTemplateMatch = rows.find((row) => {
    const metadata = readFitnessPlanHabitMetadata(row.memo_capture_config);
    return metadata?.planTemplateId === activePlan.planTemplateId;
  });
  if (currentTemplateMatch) return currentTemplateMatch;

  if (previousLinkedId) {
    const previousLinked = rows.find((row) => row.id === previousLinkedId);
    if (previousLinked) return previousLinked;
  }

  return rows[0] ?? null;
}

export async function ensureFitnessActivePlanHabit({
  userId,
  plan,
  activePlan,
  previousActivePlan,
  skillId,
  client,
}: EnsureFitnessActivePlanHabitParams) {
  const supabase = client ?? (getSupabaseBrowser() as Client | null);
  if (!supabase) {
    throw new Error("Supabase client not available.");
  }
  const db = supabase as unknown as LooseSupabaseClient;
  const authoritativeSkillId = await resolveAuthoritativeFitnessSkillId({
    userId,
    client: db,
    preferredSkillId: skillId ?? null,
  });

  const { data: rows, error: readError } = await db
    .from("habits")
    .select(
      "id, name, memo_capture_config, duration_minutes, recurrence, recurrence_days, skill_id",
    )
    .eq("user_id", userId)
    .is("circle_id", null);

  if (readError) throw readError;

  const planHabitRows = ((rows ?? []) as PlanHabitRow[]).filter((row) =>
    isFitnessPlanManagedHabit({ memo_capture_config: row.memo_capture_config }),
  );
  const now = activePlan.updatedAt;
  const targetRow = chooseFitnessPlanHabitRowForUpdate(
    planHabitRows,
    activePlan,
    previousActivePlan,
  );
  const memoCaptureConfig = buildFitnessPlanHabitMemoCaptureConfig({
    current: targetRow?.memo_capture_config ?? null,
    activePlan,
    now,
  });
  const payload = {
    name: buildFitnessPlanHabitTitle(plan),
    habit_type: "HABIT",
    type: "HABIT",
    recurrence: "daily",
    recurrence_days: fitnessActivePlanWeekdaysToRecurrenceDays(
      activePlan.weekdays,
    ),
    recurrence_mode: "INTERVAL",
    duration_minutes: activePlan.sessionDurationMinutes,
    skill_id: authoritativeSkillId ?? targetRow?.skill_id ?? null,
    energy: "MEDIUM",
    memo_capture_config: memoCaptureConfig,
    updated_at: now,
  };

  let habitId: string | null = targetRow?.id ?? null;
  if (habitId) {
    const { error: updateError } = await db
      .from("habits")
      .update(payload)
      .eq("id", habitId)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    await cancelFutureScheduledHabitInstancesForUpdate({
      supabase: supabase as unknown as SupabaseClient<Database>,
      userId,
      habitId,
      now: new Date(now),
    });
  } else {
    const { data: inserted, error: insertError } = await db
      .from("habits")
      .insert({
        ...payload,
        user_id: userId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const insertedHabitId =
      isRecord(inserted) && typeof inserted.id === "string"
        ? inserted.id
        : null;
    if (!insertedHabitId) {
      throw new Error("Fitness plan habit persistence did not return an id.");
    }
    habitId = insertedHabitId;
  }

  if (!habitId) {
    throw new Error("Fitness plan habit persistence did not return an id.");
  }

  const staleRows = planHabitRows.filter((row) => row.id !== habitId);
  if (staleRows.length > 0) {
    const { error: staleUpdateError } = await db
      .from("habits")
      .update({
        recurrence: "none",
        recurrence_days: null,
        updated_at: now,
      })
      .in(
        "id",
        staleRows.map((row) => row.id),
      )
      .eq("user_id", userId);
    if (staleUpdateError) throw staleUpdateError;
    await Promise.all(
      staleRows.map((row) =>
        cancelFutureScheduledHabitInstancesForUpdate({
          supabase: supabase as unknown as SupabaseClient<Database>,
          userId,
          habitId: row.id,
          now: new Date(now),
        }),
      ),
    );
  }

  return habitId;
}
