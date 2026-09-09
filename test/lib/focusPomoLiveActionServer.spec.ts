import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Json } from "@/types/supabase";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  ensureCompletionEvent: vi.fn(),
  completionProductivityDayKey: vi.fn(() => "2026-06-22"),
  isCompletionSchemaMissing: vi.fn(() => false),
  refreshHabitStreak: vi.fn(),
  setGoalNoteTodoCompleted: vi.fn(),
  createFocusPomoLiveActionToken: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/completions/completionEvents", () => ({
  ensureCompletionEvent: mocks.ensureCompletionEvent,
  completionProductivityDayKey: mocks.completionProductivityDayKey,
  isCompletionSchemaMissing: mocks.isCompletionSchemaMissing,
}));

vi.mock("@/lib/streaks", () => ({
  refreshHabitStreak: mocks.refreshHabitStreak,
}));

vi.mock("@/lib/notes/noteTodos", () => ({
  setGoalNoteTodoCompleted: mocks.setGoalNoteTodoCompleted,
}));

vi.mock("@/lib/focus/focusPomoLiveActionTokens", () => ({
  createFocusPomoLiveActionToken: mocks.createFocusPomoLiveActionToken,
}));

import {
  buildFocusPomoRunSyncState,
  performFocusPomoLiveAction,
  upsertFocusPomoRun,
  type FocusPomoRunQueueItem,
} from "../../src/lib/focus/focusPomoLiveActionServer";

const queue: FocusPomoRunQueueItem[] = [
  {
    itemKey: "A",
    sourceType: "TASK",
    sourceId: "task-a",
    itemId: "task-a",
    title: "A",
    durationMinutes: 25,
  },
  {
    itemKey: "B",
    sourceType: "TASK",
    sourceId: "task-b",
    itemId: "task-b",
    title: "B",
    durationMinutes: 25,
  },
  {
    itemKey: "C",
    sourceType: "TASK",
    sourceId: "task-c",
    itemId: "task-c",
    title: "C",
    durationMinutes: 25,
  },
  {
    itemKey: "D",
    sourceType: "TASK",
    sourceId: "task-d",
    itemId: "task-d",
    title: "D",
    durationMinutes: 25,
  },
];

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-row",
    user_id: "user-1",
    session_id: "session-1",
    active_item_key: "C",
    queue_items: queue as unknown as Json,
    mode: "pomo",
    current_index: 2,
    started_at: "2026-06-22T15:00:00.000Z",
    ends_at: "2026-06-22T15:25:00.000Z",
    status: "running",
    used_action_ids: [],
    last_action_at: null,
    updated_at: "2026-06-22T15:00:00.000Z",
    ...overrides,
  } as unknown as Parameters<typeof buildFocusPomoRunSyncState>[0];
}

function createUpsertClient() {
  const upsert = vi.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve({ error: null });
  });
  return {
    upsert,
    client: {
      from: vi.fn(() => ({ upsert })),
    },
  };
}

function createLiveActionClient(row = runRow()) {
  const taskUpdates: Array<{ table: string; payload: unknown; filters: unknown[] }> = [];
  const runUpdates: unknown[] = [];

  const createFilterChain = (
    response: { data?: unknown; error: { message?: string } | null }
  ) => {
    const filters: unknown[] = [];
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value });
        return chain;
      }),
      then: (
        onFulfilled?: (value: typeof response) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(response).then(onFulfilled, onRejected),
      filters,
    };
    return chain;
  };

  const selectRunChain = {
    select: vi.fn(() => selectRunChain),
    eq: vi.fn(() => selectRunChain),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "focus_pomo_runs") {
        return {
          select: selectRunChain.select,
          update: vi.fn((payload: unknown) => {
            runUpdates.push(payload);
            return createFilterChain({ error: null });
          }),
        };
      }

      return {
        update: vi.fn((payload: unknown) => {
          const chain = createFilterChain({ error: null });
          taskUpdates.push({ table, payload, filters: chain.filters });
          return chain;
        }),
      };
    }),
  };

  return { client, taskUpdates, runUpdates };
}

describe("FocusPomo run start cursor semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureCompletionEvent.mockResolvedValue(undefined);
    mocks.createFocusPomoLiveActionToken.mockImplementation(
      ({ action }: { action: string }) => ({
        actionId: `${action}-id`,
        token: `${action}-token`,
        expiresAt: "2026-06-22T16:00:00.000Z",
      })
    );
  });

  it("serializes a manually selected later item as current without completing prior items", () => {
    const state = buildFocusPomoRunSyncState(runRow());

    expect(state.currentIndex).toBe(2);
    expect(state.activeItemKey).toBe("C");
    expect(state.queueItems.map((item) => item.itemKey)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(state.queueItems.map((item) => item.action ?? null)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(state.actionHistory).toEqual([]);
  });

  it("defaults to the first pending queue item when no manual currentIndex is provided", async () => {
    const { client, upsert } = createUpsertClient();

    await upsertFocusPomoRun(client as never, {
      userId: "user-1",
      sessionId: "session-1",
      activeItemKey: "A",
      queueItems: queue,
      mode: "pomo",
      startedAt: "2026-06-22T15:00:00.000Z",
      endsAt: "2026-06-22T15:25:00.000Z",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_index: 0,
        active_item_key: "A",
        queue_items: expect.arrayContaining([
          expect.objectContaining({ itemKey: "A", action: null }),
          expect.objectContaining({ itemKey: "B", action: null }),
        ]),
      }),
      { onConflict: "user_id,session_id" }
    );
  });

  it("preserves the full queue when starting at a manually selected later item", async () => {
    const { client, upsert } = createUpsertClient();

    await upsertFocusPomoRun(client as never, {
      userId: "user-1",
      sessionId: "session-1",
      activeItemKey: "C",
      queueItems: queue,
      mode: "pomo",
      currentIndex: 2,
      startedAt: "2026-06-22T15:00:00.000Z",
      endsAt: "2026-06-22T15:25:00.000Z",
    });

    const payload = upsert.mock.calls[0][0] as {
      current_index: number;
      active_item_key: string;
      queue_items: Array<{ itemKey: string; action: string | null }>;
    };

    expect(payload.current_index).toBe(2);
    expect(payload.active_item_key).toBe("C");
    expect(payload.queue_items.map((item) => item.itemKey)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(payload.queue_items.map((item) => item.action)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("completes the selected later item and advances forward without touching prior items", async () => {
    const { client, runUpdates, taskUpdates } = createLiveActionClient();
    mocks.createAdminClient.mockReturnValue(client);

    const result = await performFocusPomoLiveAction({
      userId: "user-1",
      sessionId: "session-1",
      itemKey: "C",
      sourceType: "TASK",
      itemId: "task-c",
      sourceId: "task-c",
      scheduleInstanceId: null,
      action: "complete",
      actionId: "action-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.next.itemKey).toBe("D");
    expect(result.next.status).toBe("running");
    expect(taskUpdates).toHaveLength(1);
    expect(taskUpdates[0]).toEqual(
      expect.objectContaining({
        table: "tasks",
        payload: expect.objectContaining({ completed_at: expect.any(String) }),
      })
    );
    expect(taskUpdates[0]?.filters).toContainEqual({
      column: "id",
      value: "task-c",
    });
    expect(taskUpdates[0]?.filters).not.toContainEqual({
      column: "id",
      value: "task-a",
    });
    expect(taskUpdates[0]?.filters).not.toContainEqual({
      column: "id",
      value: "task-b",
    });

    const runUpdate = runUpdates[0] as {
      current_index: number;
      active_item_key: string;
      queue_items: Array<{ itemKey: string; action: string | null }>;
    };
    expect(runUpdate.current_index).toBe(3);
    expect(runUpdate.active_item_key).toBe("D");
    expect(runUpdate.queue_items.map((item) => item.itemKey)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(runUpdate.queue_items.map((item) => item.action)).toEqual([
      null,
      null,
      "completed",
      null,
    ]);
    expect(mocks.ensureCompletionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ sourceId: "task-c" }),
      })
    );
  });
});
