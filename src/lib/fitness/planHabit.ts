import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { getSupabaseBrowser } from "@/lib/supabase";
import { cancelFutureScheduledHabitInstancesForUpdate } from "@/lib/habits/scheduleReset";
import type {
  FitnessActivePlan,
  FitnessActivePlanWeekday,
} from "@/lib/fitness/activePlan";
import { fitnessActivePlanWeekdaysToRecurrenceDays } from "@/lib/fitness/activePlan";
import type { FitnessPlanTemplate } from "@/lib/fitness/planTemplates";

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
  skillType: "fitness";
  updatedAt: string;
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

export function buildFitnessPlanHabitTitle(plan: FitnessPlanTemplate) {
  return `Fitness - ${plan.title}`;
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
    skillType: "fitness",
    updatedAt,
  };
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
}: {
  habitId: string;
  skillId?: string | null;
  memoCaptureConfig: Json | null | undefined;
}) {
  const planHabit = readFitnessPlanHabitMetadata(memoCaptureConfig);
  if (!planHabit) return null;

  return {
    presentationKind: "fitness-plan",
    visualKind: "fitness-plan",
    source: "fitness-active-plan",
    skillType: "fitness",
    skillIcon: "🏋️",
    skillId: skillId ?? null,
    [FITNESS_PLAN_SCHEDULE_METADATA_KEY]: {
      managedBy: "fitnessActivePlan",
      planTemplateId: planHabit.planTemplateId,
      planTitle: planHabit.planTitle,
      linkedFitnessHabitId: habitId,
      weekdays: planHabit.weekdays,
      sessionDurationMinutes: planHabit.sessionDurationMinutes,
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
    (isRecord(plan) && plan.managedBy === "fitnessActivePlan")
  );
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
    skill_id: skillId ?? targetRow?.skill_id ?? null,
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
