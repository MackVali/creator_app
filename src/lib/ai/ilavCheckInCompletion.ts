import type { SupabaseClient } from "@supabase/supabase-js";

import { updateInstanceStatus, type ScheduleInstance } from "@/lib/scheduler/instanceRepo";
import {
  recordMatrixScheduledHabitCompletion,
  type MatrixScheduledHabitCompletionInstance,
} from "@/lib/schedule/matrixScheduledHabitCompletion";
import {
  buildRelatedHabitDueOccurrenceIdentity,
  persistRelatedHabitCompletion,
  type RelatedHabitCompletionHabit,
} from "@/lib/schedule/relatedHabitCompletion";
import {
  buildScheduleXpOccurrenceStem,
  resolveScheduleXpCompletionSemantics,
} from "@/lib/xp/scheduleXpSemantics";
import type { Database } from "@/types/supabase";

type Client = SupabaseClient<Database>;
type FetchLike = typeof fetch;

export type IlavCompleteCheckInItemRequest =
  | {
      itemType: "due_habit";
      habitId: string;
      timeZone: string;
      completedAt?: string;
    }
  | {
      itemType: "scheduled_instance";
      scheduleInstanceId: string;
      timeZone: string;
      completedAt?: string;
    };

export type IlavCompleteCheckInItemResult = {
  completedAt: string;
  itemType: IlavCompleteCheckInItemRequest["itemType"];
  scheduleInstanceId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  xpStatus: "inserted" | "deduped" | "skipped" | "blocked";
};

type HabitLookupRow = {
  id: string;
  name: string | null;
  skill_id: string | null;
  routine_id?: string | null;
  routine_position?: number | null;
};

type TaskLookupRow = {
  id: string;
  skill_id: string | null;
};

function normalizeCompletedAt(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function postJson(fetchFn: FetchLike, url: string, body: unknown) {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${url} failed with status ${response.status}`);
  }
  return response;
}

async function loadScheduleInstance(
  client: Client,
  userId: string,
  scheduleInstanceId: string
) {
  const { data, error } = await client
    .from("schedule_instances")
    .select("*")
    .eq("user_id", userId)
    .eq("id", scheduleInstanceId)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduleInstance | null;
}

async function loadHabit(client: Client, userId: string, habitId: string) {
  const { data, error } = await client
    .from("habits")
    .select("id, name, skill_id, routine_id, routine_position")
    .eq("user_id", userId)
    .eq("id", habitId)
    .maybeSingle();
  if (error) throw error;
  return data as HabitLookupRow | null;
}

async function loadTaskSkillId(client: Client, userId: string, taskId: string) {
  const { data, error } = await client
    .from("tasks")
    .select("id, skill_id")
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  return ((data as TaskLookupRow | null)?.skill_id ?? null)?.trim() || null;
}

async function resolveScheduledSkillIds(params: {
  client: Client;
  userId: string;
  instance: ScheduleInstance;
}) {
  const sourceId = params.instance.source_id?.trim();
  if (!sourceId) return [];
  if (params.instance.source_type === "HABIT") {
    const habit = await loadHabit(params.client, params.userId, sourceId);
    return habit?.skill_id ? [habit.skill_id] : [];
  }
  if (params.instance.source_type === "TASK") {
    const skillId = await loadTaskSkillId(params.client, params.userId, sourceId);
    return skillId ? [skillId] : [];
  }
  return [];
}

function scheduledDurationMin(instance: ScheduleInstance) {
  const duration = instance.duration_min;
  return typeof duration === "number" && Number.isFinite(duration)
    ? Math.max(0, Math.round(duration))
    : null;
}

function buildScheduledHabitCompletionInstance(
  instance: ScheduleInstance
): MatrixScheduledHabitCompletionInstance {
  return {
    id: instance.id,
    source_type: instance.source_type,
    source_id: instance.source_id,
    status: instance.status,
    duration_min: instance.duration_min,
  };
}

async function completeScheduledInstance(params: {
  client: Client;
  userId: string;
  scheduleInstanceId: string;
  timeZone: string;
  completedAt: string;
  fetchFn: FetchLike;
}): Promise<IlavCompleteCheckInItemResult> {
  const instance = await loadScheduleInstance(
    params.client,
    params.userId,
    params.scheduleInstanceId
  );
  if (!instance) throw new Error("Scheduled item not found.");
  if (instance.status === "completed" || instance.completed_at) {
    return {
      completedAt: instance.completed_at ?? params.completedAt,
      itemType: "scheduled_instance",
      scheduleInstanceId: instance.id,
      sourceType: instance.source_type ?? null,
      sourceId: instance.source_id ?? null,
      xpStatus: "skipped",
    };
  }

  const semantics = resolveScheduleXpCompletionSemantics(instance);
  if (!semantics) throw new Error("Scheduled item has no completion semantics.");
  const skillIds = await resolveScheduledSkillIds({
    client: params.client,
    userId: params.userId,
    instance,
  });
  if (skillIds.length === 0) {
    throw new Error(`${semantics.completionSourceType} has no skill context.`);
  }

  const occurrenceStem = buildScheduleXpOccurrenceStem(instance.id, semantics.xpKind);
  await postJson(params.fetchFn, "/api/xp/reverse", {
    occurrenceStem,
    legacyOccurrenceStems: semantics.legacyOccurrenceStems,
    scheduleInstanceId: instance.id,
  });

  const statusResult = await updateInstanceStatus(
    instance.id,
    "completed",
    { completedAtUTC: params.completedAt },
    params.client
  );
  if (statusResult.error) throw statusResult.error;

  try {
    if (instance.source_type === "HABIT") {
      const habitCompletion = await recordMatrixScheduledHabitCompletion({
        instance: buildScheduledHabitCompletionInstance(instance),
        nextStatus: "completed",
        completedAt: params.completedAt,
        timeZone: params.timeZone,
        fetchFn: params.fetchFn,
      });
      if (!habitCompletion.ok) throw new Error(habitCompletion.reason);
    }

    const durationMin = scheduledDurationMin(instance);
    const xpResponse = await postJson(params.fetchFn, "/api/xp/award", {
      scheduleInstanceId: instance.id,
      kind: semantics.xpKind,
      skillIds,
      awardKeyBase: occurrenceStem,
      reversible: {
        occurrenceStem,
        legacyOccurrenceStems: semantics.legacyOccurrenceStems,
      },
      source: "matrix",
      completion: {
        action: "complete",
        sourceType: semantics.completionSourceType,
        sourceId: semantics.completionSourceId,
        completedAt: params.completedAt,
        scheduleInstanceId: instance.id,
        wasScheduled: true,
        durationMin,
        timeZone: params.timeZone,
      },
    });
    const xpPayload = (await xpResponse.json().catch(() => null)) as {
      inserted?: number;
      deduped?: boolean;
      skipped?: boolean;
    } | null;

    return {
      completedAt: params.completedAt,
      itemType: "scheduled_instance",
      scheduleInstanceId: instance.id,
      sourceType: instance.source_type ?? null,
      sourceId: instance.source_id ?? null,
      xpStatus:
        (xpPayload?.inserted ?? 0) > 0
          ? "inserted"
          : xpPayload?.deduped
            ? "deduped"
            : xpPayload?.skipped
              ? "blocked"
              : "skipped",
    };
  } catch (error) {
    await updateInstanceStatus(
      instance.id,
      instance.status,
      instance.status === "completed" && instance.completed_at
        ? { completedAtUTC: instance.completed_at }
        : undefined,
      params.client
    ).catch(() => null);
    throw error;
  }
}

async function completeDueHabit(params: {
  client: Client;
  userId: string;
  habitId: string;
  timeZone: string;
  completedAt: string;
  fetchFn: FetchLike;
}): Promise<IlavCompleteCheckInItemResult> {
  const habit = await loadHabit(params.client, params.userId, params.habitId);
  if (!habit) throw new Error("Habit not found.");
  if (!habit.skill_id) throw new Error("Habit has no skill context.");

  const result = await persistRelatedHabitCompletion({
    client: params.client,
    userId: params.userId,
    habit: {
      id: habit.id,
      name: habit.name ?? "Habit",
      skillId: habit.skill_id,
      routineId: habit.routine_id ?? null,
      routinePosition: habit.routine_position ?? null,
    } satisfies RelatedHabitCompletionHabit,
    wasCompleted: false,
    completedAt: params.completedAt,
    timeZone: params.timeZone,
    fetchFn: params.fetchFn,
    instant: new Date(params.completedAt),
  });

  return {
    completedAt: result.completedAt,
    itemType: "due_habit",
    scheduleInstanceId: result.scheduleInstanceId,
    sourceType: "HABIT",
    sourceId: habit.id,
    xpStatus: result.xpStatus === "reversed" ? "skipped" : result.xpStatus,
  };
}

export async function completeIlavCheckInItem(params: {
  client: Client;
  userId: string;
  request: IlavCompleteCheckInItemRequest;
  fetchFn?: FetchLike;
}): Promise<IlavCompleteCheckInItemResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const completedAt = normalizeCompletedAt(params.request.completedAt);
  if (params.request.itemType === "due_habit") {
    return completeDueHabit({
      client: params.client,
      userId: params.userId,
      habitId: params.request.habitId,
      timeZone: params.request.timeZone,
      completedAt,
      fetchFn,
    });
  }

  return completeScheduledInstance({
    client: params.client,
    userId: params.userId,
    scheduleInstanceId: params.request.scheduleInstanceId,
    timeZone: params.request.timeZone,
    completedAt,
    fetchFn,
  });
}

export function buildIlavDueHabitOccurrenceIdentity(params: {
  habitId: string;
  creatorDayDate: string;
}) {
  return buildRelatedHabitDueOccurrenceIdentity({
    habitId: params.habitId,
    creatorDayDate: params.creatorDayDate,
    cardId: params.habitId,
  });
}
