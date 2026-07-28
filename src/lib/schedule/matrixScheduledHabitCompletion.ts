import type { Database } from "@/types/supabase";

type ScheduleInstance =
  Database["public"]["Tables"]["schedule_instances"]["Row"];

export type MatrixScheduledHabitCompletionInstance = Pick<
  ScheduleInstance,
  "id" | "source_type" | "source_id" | "status" | "duration_min"
>;

export type MatrixScheduledHabitCompletionRequest = {
  habitId: string;
  completedAt: string;
  timeZone: string;
  action: "complete";
  scheduleInstanceId: string;
  durationMin?: number;
};

export type MatrixScheduledHabitCompletionOutcome =
  | { ok: true; status: "recorded" | "skipped" }
  | { ok: false; status: "failed"; reason: string; responseStatus?: number };

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

const normalizeDurationMin = (value: number | null): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
};

export function buildMatrixScheduledHabitCompletionRequest(params: {
  instance: MatrixScheduledHabitCompletionInstance | null | undefined;
  nextStatus: ScheduleInstance["status"];
  completedAt: string | null | undefined;
  timeZone: string;
}): MatrixScheduledHabitCompletionRequest | null {
  const { instance, nextStatus, completedAt, timeZone } = params;
  if (!instance || nextStatus !== "completed") return null;
  if (instance.status === "completed") return null;
  if (instance.source_type !== "HABIT") return null;

  const habitId = instance.source_id?.trim();
  if (!habitId || !completedAt) return null;

  const completedAtDate = new Date(completedAt);
  const completedAtISO = Number.isNaN(completedAtDate.getTime())
    ? new Date().toISOString()
    : completedAtDate.toISOString();
  const durationMin = normalizeDurationMin(instance.duration_min);

  return {
    habitId,
    completedAt: completedAtISO,
    timeZone,
    action: "complete",
    scheduleInstanceId: instance.id,
    ...(typeof durationMin === "number" ? { durationMin } : {}),
  };
}

export async function recordMatrixScheduledHabitCompletion(params: {
  instance: MatrixScheduledHabitCompletionInstance | null | undefined;
  nextStatus: ScheduleInstance["status"];
  completedAt: string | null | undefined;
  timeZone: string;
  fetchFn?: FetchLike;
}): Promise<MatrixScheduledHabitCompletionOutcome> {
  const request = buildMatrixScheduledHabitCompletionRequest(params);
  if (!request) return { ok: true, status: "skipped" };

  const fetchImpl = params.fetchFn ?? fetch;
  try {
    const response = await fetchImpl("/api/habits/completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      return {
        ok: false,
        status: "failed",
        responseStatus: response.status,
        reason:
          responseText ||
          `Habit completion failed with status ${response.status}`,
      };
    }

    return { ok: true, status: "recorded" };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason:
        error instanceof Error
          ? error.message
          : "Habit completion request failed",
    };
  }
}
