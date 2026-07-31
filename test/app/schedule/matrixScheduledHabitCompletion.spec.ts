import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  buildMatrixScheduledHabitCompletionRequest,
  recordMatrixScheduledHabitCompletion,
  type MatrixScheduledHabitCompletionInstance,
} from "@/lib/schedule/matrixScheduledHabitCompletion";

const matrixContent = readFileSync(
  "src/app/(app)/schedule/matrix/MatrixContent.tsx",
  "utf8"
);

const makeInstance = (
  overrides: Partial<MatrixScheduledHabitCompletionInstance> = {}
): MatrixScheduledHabitCompletionInstance => ({
  id: "11111111-1111-4111-8111-111111111111",
  source_type: "HABIT",
  source_id: "22222222-2222-4222-8222-222222222222",
  status: "scheduled",
  duration_min: 25,
  ...overrides,
});

const callbackBlock = (name: string) => {
  const start = matrixContent.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = matrixContent.indexOf("\n  const ", start + 1);
  return matrixContent.slice(start, next === -1 ? undefined : next);
};

describe("Matrix scheduled Habit completion bridge", () => {
  it("builds the authoritative Habit completion request from source metadata", () => {
    const request = buildMatrixScheduledHabitCompletionRequest({
      instance: makeInstance({ duration_min: 24.6 }),
      nextStatus: "completed",
      completedAt: "2024-01-08T15:30:12.000Z",
      timeZone: "America/Chicago",
    });

    expect(request).toEqual({
      habitId: "22222222-2222-4222-8222-222222222222",
      completedAt: "2024-01-08T15:30:12.000Z",
      timeZone: "America/Chicago",
      action: "complete",
      scheduleInstanceId: "11111111-1111-4111-8111-111111111111",
      durationMin: 25,
    });
  });

  it("skips non-Habit, undo, and already-completed scheduled Event operations", async () => {
    const fetchFn = vi.fn();

    expect(
      buildMatrixScheduledHabitCompletionRequest({
        instance: makeInstance({ source_type: "PROJECT" }),
        nextStatus: "completed",
        completedAt: "2024-01-08T15:30:12.000Z",
        timeZone: "America/Chicago",
      })
    ).toBeNull();
    expect(
      buildMatrixScheduledHabitCompletionRequest({
        instance: makeInstance(),
        nextStatus: "scheduled",
        completedAt: null,
        timeZone: "America/Chicago",
      })
    ).toBeNull();
    expect(
      buildMatrixScheduledHabitCompletionRequest({
        instance: makeInstance({ status: "completed" }),
        nextStatus: "completed",
        completedAt: "2024-01-08T15:30:12.000Z",
        timeZone: "America/Chicago",
      })
    ).toBeNull();

    const outcome = await recordMatrixScheduledHabitCompletion({
      instance: makeInstance({ source_type: "TASK" }),
      nextStatus: "completed",
      completedAt: "2024-01-08T15:30:12.000Z",
      timeZone: "America/Chicago",
      fetchFn,
    });

    expect(outcome).toEqual({ ok: true, status: "skipped" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("posts to /api/habits/completion and reports persistence failure", async () => {
    const successFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn(),
    });

    await expect(
      recordMatrixScheduledHabitCompletion({
        instance: makeInstance(),
        nextStatus: "completed",
        completedAt: "2024-01-08T15:30:12.000Z",
        timeZone: "America/Chicago",
        fetchFn: successFetch,
      })
    ).resolves.toEqual({ ok: true, status: "recorded" });

    expect(successFetch).toHaveBeenCalledWith(
      "/api/habits/completion",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitId: "22222222-2222-4222-8222-222222222222",
          completedAt: "2024-01-08T15:30:12.000Z",
          timeZone: "America/Chicago",
          action: "complete",
          scheduleInstanceId: "11111111-1111-4111-8111-111111111111",
          durationMin: 25,
        }),
      })
    );

    const failureFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("set_habit_completion_day failed"),
    });

    await expect(
      recordMatrixScheduledHabitCompletion({
        instance: makeInstance(),
        nextStatus: "completed",
        completedAt: "2024-01-08T15:30:12.000Z",
        timeZone: "America/Chicago",
        fetchFn: failureFetch,
      })
    ).resolves.toEqual({
      ok: false,
      status: "failed",
      responseStatus: 500,
      reason: "set_habit_completion_day failed",
    });
  });

  it("keeps Matrix scheduled Habit ordering: local optimistic state, status, Habit completion, XP", () => {
    const block = callbackBlock("commitScheduledEventCompletion");
    const optimisticState = block.indexOf(
      "scheduledCompletionOverridesRef.current.set("
    );
    const statusPersistence = block.indexOf(
      "const result = await updateInstanceStatus("
    );
    const habitCompletion = block.indexOf(
      "await recordMatrixScheduledHabitCompletion"
    );
    const xpAward = block.indexOf(
      "const xpResult = await dispatchMatrixScheduledXpReward"
    );

    expect(optimisticState).toBeGreaterThanOrEqual(0);
    expect(statusPersistence).toBeGreaterThan(optimisticState);
    expect(habitCompletion).toBeGreaterThan(statusPersistence);
    expect(xpAward).toBeGreaterThan(habitCompletion);

    const failureBranch = block.slice(habitCompletion, xpAward);
    expect(failureBranch).toContain("if (!habitCompletionResult.ok)");
    expect(failureBranch).toContain("previousStatus");
    expect(failureBranch).toContain("rollbackScheduledCompletionState();");
    expect(failureBranch).toContain("return false;");
  });
});
