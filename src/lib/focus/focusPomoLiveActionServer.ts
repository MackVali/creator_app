import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureCompletionEvent,
  completionProductivityDayKey,
  isCompletionSchemaMissing,
} from "@/lib/completions/completionEvents";
import { refreshHabitStreak } from "@/lib/streaks";
import type { Database, Json } from "@/types/supabase";
import {
  createFocusPomoLiveActionToken,
  type FocusPomoLiveAction,
} from "@/lib/focus/focusPomoLiveActionTokens";

export type FocusPomoRunMode = "pomo" | "stopwatch";
export type FocusPomoRunStatus = "running" | "completed" | "canceled";

export type FocusPomoRunQueueItem = {
  itemKey: string;
  sourceType: "HABIT" | "PROJECT" | "TASK" | string;
  sourceId: string;
  itemId?: string | null;
  scheduleInstanceId?: string | null;
  title: string;
  skillIcon?: string | null;
  durationMinutes?: number | null;
  action?: "completed" | "skipped" | null;
  actionAt?: string | null;
};

export type FocusPomoRunSyncState = {
  sessionId: string;
  currentIndex: number;
  activeItemKey: string | null;
  queueItems: FocusPomoRunQueueItem[];
  status: FocusPomoRunStatus;
  mode: FocusPomoRunMode;
  startedAt: string | null;
  endsAt: string | null;
  lastActionAt: string | null;
  updatedAt: string;
  actionHistory: Array<
    FocusPomoRunQueueItem & {
      index: number;
      action: "completed" | "skipped";
      actionAt: string | null;
    }
  >;
};

export type FocusPomoScheduleStatusUpdate = {
  id: string;
  status: "completed" | "scheduled" | "canceled";
  completed_at?: string | null;
  canceled_reason?: string | null;
};

export type FocusPomoLiveActivityNextState = {
  shouldEnd: boolean;
  sessionId: string;
  title: string;
  itemKey: string | null;
  itemType: string | null;
  sourceType: string | null;
  itemId: string | null;
  sourceId: string | null;
  scheduleInstanceId: string | null;
  skillIcon: string | null;
  mode: FocusPomoRunMode;
  startedAt: string | null;
  endsAt: string | null;
  status: "running" | "completed" | "canceled" | "failed";
  plannedDurationSeconds: number;
  completeActionId: string | null;
  completeActionToken: string | null;
  skipActionId: string | null;
  skipActionToken: string | null;
};

type Client = SupabaseClient<Database>;
type FocusPomoRunRow = Database["public"]["Tables"]["focus_pomo_runs"]["Row"];

const DEFAULT_POMO_DURATION_MINUTES = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function readRunAction(value: unknown): "completed" | "skipped" | null {
  if (value === "completed" || value === "complete") return "completed";
  if (value === "skipped" || value === "skip") return "skipped";
  return null;
}

function normalizeRunQueueItem(value: unknown): FocusPomoRunQueueItem | null {
  if (!isRecord(value)) return null;

  const itemKey = readString(value.itemKey ?? value.id);
  const sourceType = readString(value.sourceType);
  const sourceId = readString(value.sourceId ?? value.itemId);
  const title = readString(value.title);
  if (!itemKey || !sourceType || !sourceId || !title) return null;

  const durationMinutes = readNumber(value.durationMinutes);

  return {
    itemKey,
    sourceType,
    sourceId,
    itemId: readString(value.itemId) ?? sourceId,
    scheduleInstanceId: readString(value.scheduleInstanceId),
    title,
    skillIcon: readString(value.skillIcon),
    durationMinutes:
      durationMinutes !== null && durationMinutes >= 0
        ? Math.round(durationMinutes)
        : null,
    action: readRunAction(value.action),
    actionAt: readString(value.actionAt),
  };
}

export function readRunQueueItems(value: Json | unknown): FocusPomoRunQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeRunQueueItem)
    .filter((item): item is FocusPomoRunQueueItem => item !== null);
}

function queueItemsToJson(items: FocusPomoRunQueueItem[]): Json {
  return items.map((item) => ({
    itemKey: item.itemKey,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    itemId: item.itemId ?? item.sourceId,
    scheduleInstanceId: item.scheduleInstanceId ?? null,
    title: item.title,
    skillIcon: item.skillIcon ?? null,
    durationMinutes: item.durationMinutes ?? null,
    action: item.action ?? null,
    actionAt: item.actionAt ?? null,
  })) as Json;
}

export function buildFocusPomoRunSyncState(
  run: FocusPomoRunRow
): FocusPomoRunSyncState {
  const queueItems = readRunQueueItems(run.queue_items);
  const completedItemCount = Math.min(run.current_index, queueItems.length);

  return {
    sessionId: run.session_id,
    currentIndex: run.current_index,
    activeItemKey: run.active_item_key,
    queueItems,
    status: run.status,
    mode: run.mode,
    startedAt: run.started_at,
    endsAt: run.ends_at,
    lastActionAt: run.last_action_at,
    updatedAt: run.updated_at,
    actionHistory: queueItems
      .slice(0, completedItemCount)
      .map((item, index) => {
        const action = item.action ?? "completed";
        return {
          ...item,
          index,
          action,
          actionAt: item.actionAt ?? run.last_action_at,
        };
      }),
  };
}

function plannedDurationSeconds(item: FocusPomoRunQueueItem | null) {
  const minutes = item?.durationMinutes;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0) {
    return Math.round(minutes * 60);
  }

  return DEFAULT_POMO_DURATION_MINUTES * 60;
}

function endsAtForItem(
  mode: FocusPomoRunMode,
  startedAt: Date,
  item: FocusPomoRunQueueItem | null
) {
  if (mode !== "pomo") return null;
  return new Date(startedAt.getTime() + plannedDurationSeconds(item) * 1000);
}

export async function applyFocusPomoScheduleStatusUpdates(
  supabase: Client,
  userId: string,
  updates: FocusPomoScheduleStatusUpdate[]
) {
  const errors: { id: string; message: string }[] = [];

  for (const update of updates) {
    const { data, error, status } = await supabase
      .from("schedule_instances")
      .update({
        status: update.status,
        completed_at:
          update.status === "completed"
            ? update.completed_at ?? new Date().toISOString()
            : null,
        canceled_reason:
          update.status === "canceled" ? update.canceled_reason ?? null : null,
      })
      .eq("id", update.id)
      .eq("user_id", userId)
      .select("id, user_id, source_type, source_id, status, completed_at")
      .maybeSingle();

    if (error || status >= 400) {
      errors.push({
        id: update.id,
        message: error?.message ?? `status ${status ?? 500}`,
      });
      continue;
    }

    if (!data) {
      errors.push({ id: update.id, message: "Schedule instance not found." });
      continue;
    }

    if (data.source_type === "TASK" && data.source_id) {
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ completed_at: data.completed_at } as never)
        .eq("id", data.source_id)
        .eq("user_id", userId);
      if (taskError) {
        errors.push({
          id: update.id,
          message: `task sync: ${taskError.message}`,
        });
      }
    }

    if (data.source_type === "PROJECT" && data.source_id) {
      const { error: projectError } = await supabase
        .from("projects")
        .update({
          completed_at: data.status === "completed" ? data.completed_at : null,
          updated_at: new Date().toISOString(),
          stage: data.status === "completed" ? "RELEASE" : "BUILD",
        } as never)
        .eq("id", data.source_id)
        .eq("user_id", userId);
      if (projectError) {
        errors.push({
          id: update.id,
          message: `project sync: ${projectError.message}`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function createFocusPomoLiveActivityActionTokens(input: {
  userId: string;
  sessionId: string;
  itemKey: string;
  itemType?: string | null;
  sourceType?: string | null;
  itemId?: string | null;
  sourceId?: string | null;
  scheduleInstanceId?: string | null;
}) {
  const complete = createFocusPomoLiveActionToken({
    ...input,
    action: "complete",
  });
  const skip = createFocusPomoLiveActionToken({
    ...input,
    action: "skip",
  });

  return {
    completeActionId: complete.actionId,
    completeActionToken: complete.token,
    skipActionId: skip.actionId,
    skipActionToken: skip.token,
    expiresAt:
      complete.expiresAt < skip.expiresAt ? complete.expiresAt : skip.expiresAt,
  };
}

function buildNextState(input: {
  userId: string;
  sessionId: string;
  mode: FocusPomoRunMode;
  nextItem: FocusPomoRunQueueItem | null;
  startedAt: Date | null;
  endsAt: Date | null;
  status: "running" | "completed" | "canceled";
}): FocusPomoLiveActivityNextState {
  if (!input.nextItem || input.status !== "running") {
    return {
      shouldEnd: true,
      sessionId: input.sessionId,
      title: "Focus Pomo",
      itemKey: null,
      itemType: null,
      sourceType: null,
      itemId: null,
      sourceId: null,
      scheduleInstanceId: null,
      skillIcon: null,
      mode: input.mode,
      startedAt: null,
      endsAt: null,
      status: input.status === "canceled" ? "canceled" : "completed",
      plannedDurationSeconds: 0,
      completeActionId: null,
      completeActionToken: null,
      skipActionId: null,
      skipActionToken: null,
    };
  }

  const tokens = createFocusPomoLiveActivityActionTokens({
    userId: input.userId,
    sessionId: input.sessionId,
    itemKey: input.nextItem.itemKey,
    itemType: input.nextItem.sourceType.toLowerCase(),
    sourceType: input.nextItem.sourceType,
    itemId: input.nextItem.itemId ?? input.nextItem.sourceId,
    sourceId: input.nextItem.sourceId,
    scheduleInstanceId: input.nextItem.scheduleInstanceId ?? null,
  });

  return {
    shouldEnd: false,
    sessionId: input.sessionId,
    title: input.nextItem.title,
    itemKey: input.nextItem.itemKey,
    itemType: input.nextItem.sourceType.toLowerCase(),
    sourceType: input.nextItem.sourceType,
    itemId: input.nextItem.itemId ?? input.nextItem.sourceId,
    sourceId: input.nextItem.sourceId,
    scheduleInstanceId: input.nextItem.scheduleInstanceId ?? null,
    skillIcon: input.nextItem.skillIcon ?? null,
    mode: input.mode,
    startedAt: input.startedAt?.toISOString() ?? null,
    endsAt: input.endsAt?.toISOString() ?? null,
    status: "running",
    plannedDurationSeconds: plannedDurationSeconds(input.nextItem),
    completeActionId: tokens.completeActionId,
    completeActionToken: tokens.completeActionToken,
    skipActionId: tokens.skipActionId,
    skipActionToken: tokens.skipActionToken,
  };
}

export async function upsertFocusPomoRun(
  supabase: Client,
  input: {
    userId: string;
    sessionId: string;
    activeItemKey: string;
    queueItems: FocusPomoRunQueueItem[];
    mode: FocusPomoRunMode;
    currentIndex?: number;
    startedAt: string;
    endsAt?: string | null;
    status?: FocusPomoRunStatus;
  }
) {
  const queueItems = input.queueItems.filter(
    (item) => item.itemKey && item.sourceId && item.sourceType
  );
  const currentIndex =
    typeof input.currentIndex === "number" && input.currentIndex >= 0
      ? Math.min(input.currentIndex, Math.max(queueItems.length - 1, 0))
      : Math.max(
          0,
          queueItems.findIndex((item) => item.itemKey === input.activeItemKey)
        );
  const activeItem = queueItems[currentIndex] ?? queueItems[0] ?? null;

  const { error } = await supabase.from("focus_pomo_runs").upsert(
    {
      user_id: input.userId,
      session_id: input.sessionId,
      active_item_key: activeItem?.itemKey ?? input.activeItemKey,
      queue_items: queueItemsToJson(queueItems),
      mode: input.mode,
      current_index: currentIndex,
      started_at: input.startedAt,
      ends_at: input.endsAt ?? null,
      status: input.status ?? "running",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,session_id" }
  );

  if (error) {
    throw new Error(error.message ?? "Failed to persist Focus Pomo run.");
  }
}

export async function clearFocusPomoRun(
  supabase: Client,
  input: {
    userId: string;
    sessionId: string;
    status: Extract<FocusPomoRunStatus, "completed" | "canceled">;
  }
) {
  const { error } = await supabase
    .from("focus_pomo_runs")
    .update({
      status: input.status,
      active_item_key: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId)
    .eq("session_id", input.sessionId);

  if (error) {
    throw new Error(error.message ?? "Failed to clear Focus Pomo run.");
  }
}

async function completeRunItem(input: {
  supabase: Client;
  userId: string;
  item: FocusPomoRunQueueItem;
  completedAt: string;
}) {
  const { supabase, userId, item, completedAt } = input;
  const sourceType = item.sourceType.toUpperCase();
  const durationMin =
    typeof item.durationMinutes === "number" && item.durationMinutes >= 0
      ? item.durationMinutes
      : null;
  const timeZone = "UTC";
  const productivityDayKey = completionProductivityDayKey(
    new Date(completedAt),
    timeZone
  );

  if (item.scheduleInstanceId) {
    const result = await applyFocusPomoScheduleStatusUpdates(supabase, userId, [
      {
        id: item.scheduleInstanceId,
        status: "completed",
        completed_at: completedAt,
      },
    ]);
    if (!result.ok) {
      throw new Error(
        result.errors[0]?.message ?? "Failed to complete schedule instance."
      );
    }
  }

  if (sourceType === "PROJECT") {
    const { error } = await supabase
      .from("projects")
      .update({
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
        stage: "RELEASE",
      } as never)
      .eq("id", item.sourceId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message ?? "Failed to complete project.");
  } else if (sourceType === "HABIT") {
    const { error } = await supabase.from("habit_completion_days").upsert(
      {
        habit_id: item.sourceId,
        user_id: userId,
        completion_day: productivityDayKey,
        completed_at: completedAt,
      },
      { onConflict: "habit_id,completion_day" }
    );
    if (error) throw new Error(error.message ?? "Failed to complete habit.");

    const { error: overrideError } = await supabase
      .from("habits")
      .update({ next_due_override: null })
      .eq("id", item.sourceId)
      .eq("user_id", userId);
    if (overrideError) {
      console.error("Failed to clear habit due override after Focus Pomo", overrideError);
    }

    await refreshHabitStreak(supabase, item.sourceId, userId);
  } else if (sourceType === "TASK") {
    const { error } = await supabase
      .from("tasks")
      .update({ completed_at: completedAt } as never)
      .eq("id", item.sourceId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message ?? "Failed to complete task.");
  }

  try {
    await ensureCompletionEvent({
      client: supabase,
      userId,
      input: {
        action: "complete",
        sourceType:
          sourceType === "PROJECT" || sourceType === "TASK" || sourceType === "HABIT"
            ? sourceType
            : "HABIT",
        sourceId: item.sourceId,
        completedAt,
        scheduleInstanceId: item.scheduleInstanceId ?? undefined,
        wasScheduled: Boolean(item.scheduleInstanceId),
        durationMin,
        timeZone,
        productivityDayKey,
      },
    });
  } catch (error) {
    if (!isCompletionSchemaMissing(error)) {
      console.error("Failed to record Focus Pomo completion event", error);
    }
  }
}

async function skipRunItem(input: {
  supabase: Client;
  userId: string;
  item: FocusPomoRunQueueItem;
}) {
  if (!input.item.scheduleInstanceId) return;

  const result = await applyFocusPomoScheduleStatusUpdates(input.supabase, input.userId, [
    {
      id: input.item.scheduleInstanceId,
      status: "canceled",
      canceled_reason: "focus_pomo_live_activity_skip",
    },
  ]);
  if (!result.ok) {
    throw new Error(result.errors[0]?.message ?? "Failed to skip schedule instance.");
  }
}

function validateCurrentItem(input: {
  run: FocusPomoRunRow;
  item: FocusPomoRunQueueItem | null;
  itemKey: string;
  sourceType: string | null;
  sourceId: string | null;
  itemId: string | null;
  scheduleInstanceId: string | null;
}) {
  if (input.run.status !== "running") return "run_not_running";
  if (!input.item) return "missing_current_item";
  if (input.item.itemKey !== input.itemKey) return "item_key_mismatch";
  if (input.sourceType && input.item.sourceType !== input.sourceType) {
    return "source_type_mismatch";
  }
  if (input.sourceId && input.item.sourceId !== input.sourceId) {
    return "source_id_mismatch";
  }
  if (input.itemId && (input.item.itemId ?? input.item.sourceId) !== input.itemId) {
    return "item_id_mismatch";
  }
  if (
    input.scheduleInstanceId &&
    (input.item.scheduleInstanceId ?? null) !== input.scheduleInstanceId
  ) {
    return "schedule_instance_mismatch";
  }
  return null;
}

export async function performFocusPomoLiveAction(input: {
  userId: string;
  sessionId: string;
  itemKey: string;
  sourceType: string | null;
  itemId: string | null;
  sourceId: string | null;
  scheduleInstanceId: string | null;
  action: FocusPomoLiveAction;
  actionId: string;
}) {
  const supabase = createAdminClient() as Client | null;
  if (!supabase) {
    throw new Error("Supabase admin client unavailable.");
  }

  const { data: run, error } = await supabase
    .from("focus_pomo_runs")
    .select("*")
    .eq("user_id", input.userId)
    .eq("session_id", input.sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message ?? "Failed to load Focus Pomo run.");
  if (!run) {
    return { ok: false as const, status: 404, error: "Focus Pomo run not found." };
  }

  if (run.used_action_ids.includes(input.actionId)) {
    return {
      ok: true as const,
      next: buildNextState({
        userId: input.userId,
        sessionId: input.sessionId,
        mode: run.mode,
        nextItem: readRunQueueItems(run.queue_items)[run.current_index] ?? null,
        startedAt: run.started_at ? new Date(run.started_at) : null,
        endsAt: run.ends_at ? new Date(run.ends_at) : null,
        status: run.status,
      }),
    };
  }

  const queueItems = readRunQueueItems(run.queue_items);
  const currentItem = queueItems[run.current_index] ?? null;
  const mismatch = validateCurrentItem({
    run,
    item: currentItem,
    itemKey: input.itemKey,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    itemId: input.itemId,
    scheduleInstanceId: input.scheduleInstanceId,
  });
  if (mismatch) {
    return { ok: false as const, status: 409, error: mismatch };
  }

  const actionAt = new Date().toISOString();
  try {
    if (input.action === "complete") {
      await completeRunItem({
        supabase,
        userId: input.userId,
        item: currentItem,
        completedAt: actionAt,
      });
    } else {
      await skipRunItem({ supabase, userId: input.userId, item: currentItem });
    }
  } catch (mutationError) {
    return {
      ok: false as const,
      status: 409,
      error:
        mutationError instanceof Error
          ? mutationError.message
          : `Unable to ${input.action} Focus Pomo item.`,
    };
  }

  const nextIndex = run.current_index + 1;
  const nextQueueItems = queueItems.map((item, index) =>
    index === run.current_index
      ? {
          ...item,
          action: input.action === "complete" ? "completed" : "skipped",
          actionAt,
        }
      : item
  );
  const nextItem = nextQueueItems[nextIndex] ?? null;
  const nextStatus: FocusPomoRunStatus = nextItem ? "running" : "completed";
  const nextStartedAt = nextItem ? new Date() : null;
  const nextEndsAt = nextStartedAt
    ? endsAtForItem(run.mode, nextStartedAt, nextItem)
    : null;
  const usedActionIds = [...run.used_action_ids, input.actionId].slice(-48);

  const { error: updateError } = await supabase
    .from("focus_pomo_runs")
    .update({
      active_item_key: nextItem?.itemKey ?? null,
      current_index: nextIndex,
      queue_items: queueItemsToJson(nextQueueItems),
      started_at: nextStartedAt?.toISOString() ?? null,
      ends_at: nextEndsAt?.toISOString() ?? null,
      status: nextStatus,
      used_action_ids: usedActionIds,
      last_action_at: actionAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("user_id", input.userId);

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to advance Focus Pomo run.");
  }

  return {
    ok: true as const,
    next: buildNextState({
      userId: input.userId,
      sessionId: input.sessionId,
      mode: run.mode,
      nextItem,
      startedAt: nextStartedAt,
      endsAt: nextEndsAt,
      status: nextStatus,
    }),
  };
}
