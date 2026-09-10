import { CREATOR_XP_SURGE_DISPLAY_XP_BY_SOURCE_TYPE } from "@/components/xp/CreatorXpSurgeHud";
import { resolveCreatorDay, type CreatorDay } from "@/lib/creatorDay";
import { updateInstanceStatus } from "@/lib/scheduler/instanceRepo";
import type { CreatorXpBurstSourceOrigin } from "@/lib/effects/creatorXpBurstBus";
import type { dispatchCreatorXpRewardVisual } from "@/lib/effects/creatorXpRewardVisual";
import type { Database } from "@/types/supabase";

type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];
type Client = {
  from: (table: string) => unknown;
};
type InstanceStatusClient = Parameters<typeof updateInstanceStatus>[3];
type ScheduleInstanceQuery = {
  select: (columns?: string) => {
    eq: (column: string, value: unknown) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          in: (column: string, values: readonly string[]) => {
            lt: (column: string, value: string) => {
              gt: (
                column: string,
                value: string
              ) => Promise<{
                data: unknown[] | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    };
  };
};
type RelatedHabitScheduleOccurrence = Pick<
  ScheduleInstance,
  "id" | "source_type" | "source_id" | "status" | "duration_min" | "completed_at" | "start_utc"
>;

export type RelatedHabitCompletionHabit = {
  id: string;
  name: string;
  skillId: string | null;
  routineId?: string | null;
  routinePosition?: number | null;
};

export type RelatedHabitCompletionVisual = {
  surge: Parameters<typeof dispatchCreatorXpRewardVisual>[0]["surge"];
  completedAt: string;
  sourceRect?: DOMRect | null;
  sourceOrigin?: CreatorXpBurstSourceOrigin;
  amount: number;
  kind: "schedule_instance_complete" | "xp_reward";
  burstId: string;
  scheduleInstanceId?: string | null;
  topOffsetPx?: number;
};

export type RelatedHabitCompletionResult = {
  completedAt: string;
  creatorDay: CreatorDay;
  scheduleInstanceId: string | null;
  xpStatus: "inserted" | "deduped" | "skipped" | "reversed";
  visual: RelatedHabitCompletionVisual | null;
};

type FetchLike = typeof fetch;

const RELATED_HABIT_XP_AMOUNT =
  CREATOR_XP_SURGE_DISPLAY_XP_BY_SOURCE_TYPE.HABIT;
const ACTIVE_RELATED_HABIT_INSTANCE_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
] as const;

export function resolveRelatedHabitCreatorDay(params: {
  timeZone: string;
  instant?: Date;
}) {
  return resolveCreatorDay({
    instant: params.instant,
    profileTimezone: params.timeZone,
  });
}

export function buildRelatedHabitDueOccurrenceIdentity(params: {
  habitId: string;
  creatorDayDate: string;
  cardId?: string | null;
  routineId?: string | null;
  routineChildId?: string | null;
  routinePosition?: number | null;
}) {
  const routineId = params.routineId?.trim() || null;
  if (routineId) {
    const routineChildId = params.routineChildId?.trim() || params.habitId;
    const positionPart =
      typeof params.routinePosition === "number" &&
      Number.isFinite(params.routinePosition)
        ? `:pos:${params.routinePosition}`
        : "";
    const awardKeyBase = `matrix_due:routine:${routineId}:habit:${params.habitId}:day:${params.creatorDayDate}:child:${routineChildId}${positionPart}`;
    return {
      awardKeyBase,
      legacyAwardKeyBase: `habit:${params.habitId}:${params.creatorDayDate}`,
      completionKey: awardKeyBase,
    };
  }

  const cardId = params.cardId?.trim() || params.habitId;
  const awardKeyBase = `matrix_due:habit:${params.habitId}:day:${params.creatorDayDate}:card:${cardId}`;
  return {
    awardKeyBase,
    legacyAwardKeyBase: `habit:${params.habitId}:${params.creatorDayDate}`,
    completionKey: awardKeyBase,
  };
}

export function buildRelatedHabitScheduledOccurrenceStem(
  scheduleInstanceId: string
) {
  return `sched:${scheduleInstanceId}:habit`;
}

function normalizeDurationMin(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function chooseCurrentCreatorDayHabitOccurrence(
  rows: RelatedHabitScheduleOccurrence[]
) {
  const sorted = [...rows].sort((left, right) => {
    const leftTime = Date.parse(left.start_utc ?? "");
    const rightTime = Date.parse(right.start_utc ?? "");
    const leftValue = Number.isFinite(leftTime) ? leftTime : 0;
    const rightValue = Number.isFinite(rightTime) ? rightTime : 0;
    return leftValue - rightValue || left.id.localeCompare(right.id);
  });
  return (
    sorted.find((row) => row.status !== "completed") ??
    sorted.find((row) => row.status === "completed") ??
    null
  );
}

export async function findCurrentCreatorDayHabitOccurrence(params: {
  client: Client;
  userId: string;
  habitId: string;
  creatorDay: CreatorDay;
}) {
  const query = params.client.from("schedule_instances") as ScheduleInstanceQuery;
  const { data, error } = await query
    .select("id, source_type, source_id, status, duration_min, completed_at, start_utc")
    .eq("user_id", params.userId)
    .eq("source_type", "HABIT")
    .eq("source_id", params.habitId)
    .in("status", [...ACTIVE_RELATED_HABIT_INSTANCE_STATUSES])
    .lt("start_utc", params.creatorDay.endsAt)
    .gt("end_utc", params.creatorDay.startsAt);

  if (error) throw error;
  return chooseCurrentCreatorDayHabitOccurrence(
    (data ?? []) as RelatedHabitScheduleOccurrence[]
  );
}

async function postJson(fetchFn: FetchLike, url: string, body: unknown) {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(responseText || `${url} failed with status ${response.status}`);
  }
  return response;
}

async function reverseRelatedHabitXp(params: {
  fetchFn: FetchLike;
  occurrenceStem: string;
  legacyOccurrenceStems?: string[];
  scheduleInstanceId?: string | null;
}) {
  await postJson(params.fetchFn, "/api/xp/reverse", {
    occurrenceStem: params.occurrenceStem,
    legacyOccurrenceStems: params.legacyOccurrenceStems ?? [],
    ...(params.scheduleInstanceId
      ? { scheduleInstanceId: params.scheduleInstanceId }
      : {}),
  });
}

async function awardRelatedHabitXp(params: {
  fetchFn: FetchLike;
  habit: RelatedHabitCompletionHabit;
  completedAt: string;
  timeZone: string;
  creatorDay: CreatorDay;
  occurrence: RelatedHabitScheduleOccurrence | null;
  monumentIds?: string[];
  areaIds?: string[];
}) {
  const skillIds = params.habit.skillId ? [params.habit.skillId] : [];
  if (skillIds.length === 0) {
    throw new Error("Habit has no skill context");
  }

  const scheduledOccurrenceStem = params.occurrence
    ? buildRelatedHabitScheduledOccurrenceStem(params.occurrence.id)
    : null;
  const dueOccurrence = buildRelatedHabitDueOccurrenceIdentity({
    habitId: params.habit.id,
    creatorDayDate: params.creatorDay.creatorDayDate,
    cardId: params.habit.id,
    routineId: params.habit.routineId,
    routineChildId: params.habit.id,
    routinePosition: params.habit.routinePosition,
  });
  const awardKeyBase = scheduledOccurrenceStem ?? dueOccurrence.awardKeyBase;
  const durationMin = normalizeDurationMin(params.occurrence?.duration_min ?? null);

  const body: Record<string, unknown> = {
    kind: "habit",
    amount: RELATED_HABIT_XP_AMOUNT,
    skillIds,
    awardKeyBase,
    reversible: {
      occurrenceStem: awardKeyBase,
      legacyOccurrenceStems: scheduledOccurrenceStem
        ? []
        : [dueOccurrence.legacyAwardKeyBase],
    },
    source: "related-habit",
    completion: {
      action: "complete",
      sourceType: "HABIT",
      sourceId: params.habit.id,
      completedAt: params.completedAt,
      wasScheduled: Boolean(params.occurrence),
      durationMin,
      timeZone: params.timeZone,
      productivityDayKey: params.creatorDay.creatorDayDate,
      completionKey: scheduledOccurrenceStem ?? dueOccurrence.completionKey,
      ...(params.occurrence
        ? { scheduleInstanceId: params.occurrence.id }
        : {}),
    },
    ...(params.occurrence ? { scheduleInstanceId: params.occurrence.id } : {}),
  };
  if (params.monumentIds?.length) body.monumentIds = params.monumentIds;
  if (params.areaIds?.length) body.areaIds = params.areaIds;

  const response = await postJson(params.fetchFn, "/api/xp/award", body);
  const result = (await response.json().catch(() => null)) as {
    inserted?: number;
    deduped?: boolean;
    skipped?: boolean;
    reason?: string;
    awardKeyBase?: string;
    surge?: RelatedHabitCompletionVisual["surge"];
  } | null;

  if (!result || (result.inserted ?? 0) <= 0) {
    if (result?.deduped) return { status: "deduped" as const, visual: null };
    if (result?.skipped) return { status: "skipped" as const, visual: null };
    throw new Error(result?.reason ?? "XP award inserted no rows");
  }
  if (!result.surge) {
    throw new Error("XP award returned no surge payload");
  }

  return {
    status: "inserted" as const,
    visual: {
      surge: result.surge,
      completedAt: params.completedAt,
      amount: RELATED_HABIT_XP_AMOUNT,
      kind: params.occurrence ? "schedule_instance_complete" : "xp_reward",
      burstId: params.occurrence
        ? `related-habit:${params.occurrence.id}:${params.completedAt}`
        : `related-habit:${dueOccurrence.awardKeyBase}:${params.completedAt}`,
      scheduleInstanceId: params.occurrence?.id ?? null,
      topOffsetPx: 72,
    } satisfies RelatedHabitCompletionVisual,
  };
}

export async function persistRelatedHabitCompletion(params: {
  client: Client;
  userId: string;
  habit: RelatedHabitCompletionHabit;
  wasCompleted: boolean;
  completedAt?: string;
  timeZone: string;
  monumentIds?: string[];
  areaIds?: string[];
  fetchFn?: FetchLike;
  instant?: Date;
}): Promise<RelatedHabitCompletionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const completedAt = params.completedAt ?? new Date().toISOString();
  const creatorDay = resolveRelatedHabitCreatorDay({
    timeZone: params.timeZone,
    instant: params.instant ?? new Date(completedAt),
  });
  const occurrence = await findCurrentCreatorDayHabitOccurrence({
    client: params.client,
    userId: params.userId,
    habitId: params.habit.id,
    creatorDay,
  });
  const action = params.wasCompleted ? "undo" : "complete";
  const previousOccurrenceStatus = occurrence?.status ?? null;
  const previousOccurrenceCompletedAt = occurrence?.completed_at ?? null;
  const scheduledOccurrenceStem = occurrence
    ? buildRelatedHabitScheduledOccurrenceStem(occurrence.id)
    : null;
  const dueOccurrence = buildRelatedHabitDueOccurrenceIdentity({
    habitId: params.habit.id,
    creatorDayDate: creatorDay.creatorDayDate,
    cardId: params.habit.id,
    routineId: params.habit.routineId,
    routineChildId: params.habit.id,
    routinePosition: params.habit.routinePosition,
  });

  if (action === "complete") {
    if (scheduledOccurrenceStem) {
      await reverseRelatedHabitXp({
        fetchFn,
        occurrenceStem: scheduledOccurrenceStem,
        scheduleInstanceId: occurrence?.id ?? null,
      });
    } else {
      await reverseRelatedHabitXp({
        fetchFn,
        occurrenceStem: dueOccurrence.awardKeyBase,
        legacyOccurrenceStems: [dueOccurrence.legacyAwardKeyBase],
      });
    }

    if (occurrence && occurrence.status !== "completed") {
      const statusResult = await updateInstanceStatus(
        occurrence.id,
        "completed",
        { completedAtUTC: completedAt },
        params.client as unknown as InstanceStatusClient
      );
      if (statusResult.error) throw statusResult.error;
    }

    try {
      await postJson(fetchFn, "/api/habits/completion", {
        habitId: params.habit.id,
        completedAt,
        timeZone: params.timeZone,
        action,
        ...(occurrence ? { scheduleInstanceId: occurrence.id } : {}),
        ...(occurrence && typeof occurrence.duration_min === "number"
          ? { durationMin: normalizeDurationMin(occurrence.duration_min) }
          : {}),
      });

      const xpResult = await awardRelatedHabitXp({
        fetchFn,
        habit: params.habit,
        completedAt,
        timeZone: params.timeZone,
        creatorDay,
        occurrence,
        monumentIds: params.monumentIds,
        areaIds: params.areaIds,
      });

      return {
        completedAt,
        creatorDay,
        scheduleInstanceId: occurrence?.id ?? null,
        xpStatus: xpResult.status,
        visual: xpResult.visual,
      };
    } catch (error) {
      const rollbackStem = scheduledOccurrenceStem ?? dueOccurrence.awardKeyBase;
      await reverseRelatedHabitXp({
        fetchFn,
        occurrenceStem: rollbackStem,
        legacyOccurrenceStems: scheduledOccurrenceStem
          ? []
          : [dueOccurrence.legacyAwardKeyBase],
        scheduleInstanceId: occurrence?.id ?? null,
      }).catch(() => null);
      if (occurrence && previousOccurrenceStatus !== "completed") {
        await updateInstanceStatus(
          occurrence.id,
          "scheduled",
          undefined,
          params.client as unknown as InstanceStatusClient
        ).catch(() => null);
      }
      await postJson(fetchFn, "/api/habits/completion", {
        habitId: params.habit.id,
        completedAt,
        timeZone: params.timeZone,
        action: "undo",
        ...(occurrence ? { scheduleInstanceId: occurrence.id } : {}),
      }).catch(() => null);
      throw error;
    }
  }

  if (occurrence?.status === "completed") {
    const statusResult = await updateInstanceStatus(
      occurrence.id,
      "scheduled",
      undefined,
      params.client as unknown as InstanceStatusClient
    );
    if (statusResult.error) throw statusResult.error;
  }

  try {
    await postJson(fetchFn, "/api/habits/completion", {
      habitId: params.habit.id,
      completedAt,
      timeZone: params.timeZone,
      action,
      ...(occurrence ? { scheduleInstanceId: occurrence.id } : {}),
    });

    if (scheduledOccurrenceStem) {
      await reverseRelatedHabitXp({
        fetchFn,
        occurrenceStem: scheduledOccurrenceStem,
        scheduleInstanceId: occurrence?.id ?? null,
      });
    } else {
      await reverseRelatedHabitXp({
        fetchFn,
        occurrenceStem: dueOccurrence.awardKeyBase,
        legacyOccurrenceStems: [dueOccurrence.legacyAwardKeyBase],
      });
    }
  } catch (error) {
    await postJson(fetchFn, "/api/habits/completion", {
      habitId: params.habit.id,
      completedAt,
      timeZone: params.timeZone,
      action: "complete",
      ...(occurrence ? { scheduleInstanceId: occurrence.id } : {}),
      ...(occurrence && typeof occurrence.duration_min === "number"
        ? { durationMin: normalizeDurationMin(occurrence.duration_min) }
        : {}),
    }).catch(() => null);
    if (occurrence?.status === "completed") {
      await updateInstanceStatus(
        occurrence.id,
        "completed",
        {
          completedAtUTC: previousOccurrenceCompletedAt ?? completedAt,
        },
        params.client as unknown as InstanceStatusClient
      ).catch(() => null);
    }
    throw error;
  }

  return {
    completedAt,
    creatorDay,
    scheduleInstanceId: occurrence?.id ?? null,
    xpStatus: "reversed",
    visual: null,
  };
}
