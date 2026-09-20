import { beforeEach, describe, expect, it, vi } from "vitest";

const updateInstanceStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scheduler/instanceRepo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scheduler/instanceRepo")>(
    "@/lib/scheduler/instanceRepo"
  );
  return {
    ...actual,
    updateInstanceStatus: updateInstanceStatusMock,
  };
});

import { completeIlavCheckInItem } from "@/lib/ai/ilavCheckInCompletion";

type Row = Record<string, unknown>;
type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "lt" | "gt"; column: string; value: string };

function applyFilters(rows: Row[], filters: Filter[]) {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.type === "eq") return row[filter.column] === filter.value;
      if (filter.type === "in") return filter.values.includes(row[filter.column]);
      const left = Date.parse(String(row[filter.column]));
      const right = Date.parse(filter.value);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      return filter.type === "lt" ? left < right : left > right;
    })
  );
}

function createClient(tables: Record<string, Row[]>) {
  return {
    from: vi.fn((table: string) => {
      const filters: Filter[] = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ type: "eq", column, value });
          return query;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          filters.push({ type: "in", column, values });
          return query;
        }),
        lt: vi.fn((column: string, value: string) => {
          filters.push({ type: "lt", column, value });
          return query;
        }),
        gt: vi.fn((column: string, value: string) => {
          filters.push({ type: "gt", column, value });
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data: applyFilters(tables[table] ?? [], filters)[0] ?? null,
          error: null,
        })),
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          return Promise.resolve({
            data: applyFilters(tables[table] ?? [], filters),
            error: null,
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    }),
  };
}

function createFetch(responses: Array<Row & { ok?: boolean; status?: number }>) {
  return vi.fn(async () => {
    const response = responses.shift() ?? { ok: true, status: 200 };
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: vi.fn(async () => String(response.text ?? "")),
      json: vi.fn(async () => response.json ?? {}),
    };
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const scheduledHabit = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  source_type: "HABIT",
  source_id: "22222222-2222-4222-8222-222222222222",
  event_name: "Clean",
  start_utc: "2026-09-18T13:30:00.000Z",
  end_utc: "2026-09-18T13:45:00.000Z",
  status: "missed",
  completed_at: null,
  duration_min: 15,
  metadata: null,
};

const habit = {
  id: "22222222-2222-4222-8222-222222222222",
  user_id: "user-1",
  name: "Clean",
  skill_id: "33333333-3333-4333-8333-333333333333",
  routine_id: null,
  routine_position: null,
};

const scheduledProject = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: "user-1",
  source_type: "PROJECT",
  source_id: "55555555-5555-4555-8555-555555555555",
  event_name: "Ilav Chat",
  start_utc: "2026-09-18T18:30:00.000Z",
  end_utc: "2026-09-18T19:30:00.000Z",
  status: "missed",
  completed_at: null,
  duration_min: 60,
  metadata: null,
};


describe("ILAV check-in completion", () => {
  beforeEach(() => {
    updateInstanceStatusMock.mockReset();
    updateInstanceStatusMock.mockResolvedValue({ data: {}, error: null });
  });

  it("completes a Due habit through the authoritative Habit completion path", async () => {
    const client = createClient({
      habits: [habit],
      schedule_instances: [],
    });
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { success: true } },
      { json: { inserted: 1, surge: { displayXp: 1 } } },
    ]);

    await completeIlavCheckInItem({
      client: client as never,
      userId: "user-1",
      request: {
        itemType: "due_habit",
        habitId: habit.id,
        timeZone: "America/Chicago",
        completedAt: "2026-09-18T15:00:00.000Z",
      },
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "/api/habits/completion",
      expect.objectContaining({
        body: expect.stringContaining(`"habitId":"${habit.id}"`),
      })
    );
  });

  it("completes a scheduled Project even when it has no Skill context", async () => {
    const client = createClient({
      schedule_instances: [scheduledProject],
      project_skills: [],
      tasks: [],
    });
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { inserted: 1, surge: null } },
    ]);

    const result = await completeIlavCheckInItem({
      client: client as never,
      userId: "user-1",
      request: {
        itemType: "scheduled_instance",
        scheduleInstanceId: scheduledProject.id,
        timeZone: "America/Chicago",
        completedAt: "2026-09-18T20:00:00.000Z",
      },
      fetchFn,
    });

    expect(updateInstanceStatusMock).toHaveBeenCalledWith(
      scheduledProject.id,
      "completed",
      { completedAtUTC: "2026-09-18T20:00:00.000Z" },
      client
    );

    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      "/api/xp/reverse",
      "/api/xp/award",
    ]);

    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toMatchObject({
      scheduleInstanceId: scheduledProject.id,
      kind: "project",
      completion: {
        sourceType: "PROJECT",
        sourceId: scheduledProject.source_id,
        wasScheduled: true,
      },
    });

    expect(result.sourceType).toBe("PROJECT");
    expect(result.sourceId).toBe(scheduledProject.source_id);
  });

  it("completes a missed scheduled Habit with Matrix scheduled-Habit semantics", async () => {
    const client = createClient({
      habits: [habit],
      schedule_instances: [scheduledHabit],
    });
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { success: true } },
      { json: { inserted: 1, surge: { displayXp: 1 } } },
    ]);

    await completeIlavCheckInItem({
      client: client as never,
      userId: "user-1",
      request: {
        itemType: "scheduled_instance",
        scheduleInstanceId: scheduledHabit.id,
        timeZone: "America/Chicago",
        completedAt: "2026-09-18T15:00:00.000Z",
      },
      fetchFn,
    });

    expect(updateInstanceStatusMock).toHaveBeenCalledWith(
      scheduledHabit.id,
      "completed",
      { completedAtUTC: "2026-09-18T15:00:00.000Z" },
      client
    );
    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      "/api/xp/reverse",
      "/api/habits/completion",
      "/api/xp/award",
    ]);
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toMatchObject({
      habitId: habit.id,
      scheduleInstanceId: scheduledHabit.id,
      durationMin: 15,
      action: "complete",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toMatchObject({
      scheduleInstanceId: scheduledHabit.id,
      source: "matrix",
      completion: {
        sourceType: "HABIT",
        sourceId: habit.id,
        wasScheduled: true,
      },
    });
  });
});
