import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/supabase";
import {
  createFocusPomoLiveActionToken,
  type FocusPomoLiveAction,
} from "@/lib/focus/focusPomoLiveActionTokens";

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
  scheduleInstanceId: string | null;
  mode: "pomo" | "stopwatch";
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

type ScheduleInstanceRow = Pick<
  Database["public"]["Tables"]["schedule_instances"]["Row"],
  | "id"
  | "user_id"
  | "source_type"
  | "source_id"
  | "status"
  | "completed_at"
  | "start_utc"
  | "end_utc"
  | "duration_min"
  | "event_name"
  | "project_name"
  | "metadata"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readUsedActionIds(metadata: Json | null) {
  if (!isRecord(metadata)) return new Set<string>();
  const values = metadata.focusPomoLiveActionIds;
  if (!Array.isArray(values)) return new Set<string>();

  return new Set(
    values.filter((value): value is string => typeof value === "string")
  );
}

function appendUsedActionId(metadata: Json | null, actionId: string): Json {
  const base = isRecord(metadata) ? metadata : {};
  const nextIds = Array.from(readUsedActionIds(metadata));
  if (!nextIds.includes(actionId)) {
    nextIds.push(actionId);
  }

  return {
    ...base,
    focusPomoLiveActionIds: nextIds.slice(-24),
  } as Json;
}

function titleForInstance(instance: ScheduleInstanceRow) {
  return (
    instance.event_name?.trim() ||
    instance.project_name?.trim() ||
    "Focus Pomo"
  );
}

function modeForInstance(instance: ScheduleInstanceRow): "pomo" | "stopwatch" {
  return instance.start_utc && instance.end_utc ? "pomo" : "stopwatch";
}

function plannedDurationSeconds(instance: ScheduleInstanceRow) {
  if (typeof instance.duration_min === "number" && Number.isFinite(instance.duration_min)) {
    return Math.max(0, Math.round(instance.duration_min * 60));
  }

  const startMs = instance.start_utc ? new Date(instance.start_utc).getTime() : NaN;
  const endMs = instance.end_utc ? new Date(instance.end_utc).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return Math.round((endMs - startMs) / 1000);
  }

  return 0;
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
      .select(
        "id, user_id, source_type, source_id, status, completed_at, start_utc, end_utc, duration_min"
      )
      .maybeSingle();

    if (error || status >= 400) {
      errors.push({
        id: update.id,
        message: error?.message ?? `status ${status ?? 500}`,
      });
      continue;
    }

    if (!data) {
      console.log(
        "[WRITE] id=%s matched=0 filter={id:%s,user_id:%s}",
        update.id,
        update.id,
        userId
      );
      continue;
    }

    console.log(
      "[WRITE] id=%s matched=1 status=%s completed_at=%s src=%s start=%s end=%s duration=%s user=%s",
      data.id,
      data.status,
      data.completed_at,
      data.source_type,
      data.start_utc,
      data.end_utc,
      data.duration_min,
      data.user_id
    );

    if (data.source_type === "TASK" && data.source_id) {
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ completed_at: data.completed_at })
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
        })
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
  scheduleInstanceId: string;
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
    expiresAt: complete.expiresAt < skip.expiresAt ? complete.expiresAt : skip.expiresAt,
  };
}

async function loadNextInstance(
  supabase: Client,
  userId: string,
  current: ScheduleInstanceRow
) {
  let query = supabase
    .from("schedule_instances")
    .select(
      "id,user_id,source_type,source_id,status,completed_at,start_utc,end_utc,duration_min,event_name,project_name,metadata"
    )
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .neq("id", current.id)
    .order("start_utc", { ascending: true })
    .limit(1);

  if (current.start_utc) {
    query = query.gte("start_utc", current.start_utc);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load next Focus Pomo item.");
  }

  return data as ScheduleInstanceRow | null;
}

function buildNextState(input: {
  userId: string;
  sessionId: string;
  nextInstance: ScheduleInstanceRow | null;
}): FocusPomoLiveActivityNextState {
  if (!input.nextInstance) {
    return {
      shouldEnd: true,
      sessionId: input.sessionId,
      title: "Focus Pomo",
      scheduleInstanceId: null,
      mode: "pomo",
      startedAt: null,
      endsAt: null,
      status: "completed",
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
    scheduleInstanceId: input.nextInstance.id,
  });

  return {
    shouldEnd: false,
    sessionId: input.sessionId,
    title: titleForInstance(input.nextInstance),
    scheduleInstanceId: input.nextInstance.id,
    mode: modeForInstance(input.nextInstance),
    startedAt: new Date().toISOString(),
    endsAt: input.nextInstance.end_utc,
    status: "running",
    plannedDurationSeconds: plannedDurationSeconds(input.nextInstance),
    completeActionId: tokens.completeActionId,
    completeActionToken: tokens.completeActionToken,
    skipActionId: tokens.skipActionId,
    skipActionToken: tokens.skipActionToken,
  };
}

export async function performFocusPomoLiveAction(input: {
  userId: string;
  sessionId: string;
  scheduleInstanceId: string;
  action: FocusPomoLiveAction;
  actionId: string;
}) {
  const supabase = createAdminClient() as Client | null;
  if (!supabase) {
    throw new Error("Supabase admin client unavailable.");
  }

  const { data: instance, error: instanceError } = await supabase
    .from("schedule_instances")
    .select(
      "id,user_id,source_type,source_id,status,completed_at,start_utc,end_utc,duration_min,event_name,project_name,metadata"
    )
    .eq("id", input.scheduleInstanceId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (instanceError) {
    throw new Error(instanceError.message ?? "Failed to load schedule instance.");
  }
  if (!instance) {
    return { ok: false as const, status: 404, error: "Schedule instance not found." };
  }

  const current = instance as ScheduleInstanceRow;
  if (readUsedActionIds(current.metadata).has(input.actionId)) {
    return { ok: false as const, status: 409, error: "Action already used." };
  }

  const metadata = appendUsedActionId(current.metadata, input.actionId);
  const { error: metadataError } = await supabase
    .from("schedule_instances")
    .update({ metadata })
    .eq("id", input.scheduleInstanceId)
    .eq("user_id", input.userId);

  if (metadataError) {
    throw new Error(metadataError.message ?? "Failed to consume action id.");
  }

  const result = await applyFocusPomoScheduleStatusUpdates(supabase, input.userId, [
    input.action === "complete"
      ? {
          id: input.scheduleInstanceId,
          status: "completed",
          completed_at: new Date().toISOString(),
        }
      : {
          id: input.scheduleInstanceId,
          status: "canceled",
          canceled_reason: "focus_pomo_live_activity_skip",
        },
  ]);

  if (!result.ok) {
    return {
      ok: false as const,
      status: 409,
      error:
        result.errors[0]?.message ??
        `Unable to ${input.action} schedule instance.`,
    };
  }

  const nextInstance = await loadNextInstance(supabase, input.userId, current);

  return {
    ok: true as const,
    next: buildNextState({
      userId: input.userId,
      sessionId: input.sessionId,
      nextInstance,
    }),
  };
}
