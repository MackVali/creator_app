import { beforeEach, describe, expect, it, vi } from "vitest";

const updateInstanceStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scheduler/instanceRepo", () => ({
  updateInstanceStatus: updateInstanceStatusMock,
}));

import {
  buildRelatedHabitDueOccurrenceIdentity,
  findCurrentCreatorDayHabitOccurrence,
  persistRelatedHabitCompletion,
  resolveRelatedHabitCreatorDay,
} from "@/lib/schedule/relatedHabitCompletion";

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

function projectRows(rows: Row[], columns: string | null) {
  if (!columns || columns === "*") return rows;
  const names = columns.split(",").map((column) => column.trim());
  return rows.map((row) =>
    Object.fromEntries(names.map((name) => [name, row[name]]))
  );
}

function createClient(rows: Row[]) {
  const queryLog: Filter[][] = [];
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe("schedule_instances");
      const filters: Filter[] = [];
      let selectedColumns: string | null = null;
      const query = {
        select(columns = "*") {
          selectedColumns = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ type: "eq", column, value });
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push({ type: "in", column, values });
          return query;
        },
        lt(column: string, value: string) {
          filters.push({ type: "lt", column, value });
          return query;
        },
        gt(column: string, value: string) {
          filters.push({ type: "gt", column, value });
          return query;
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          queryLog.push([...filters]);
          return Promise.resolve({
            data: projectRows(applyFilters(rows, filters), selectedColumns),
            error: null,
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    }),
  };

  return { client: client as never, queryLog };
}

function createFetch(
  responses: Array<{ ok?: boolean; status?: number; text?: string; json?: Row }>
) {
  return vi.fn(async () => {
    const response = responses.shift() ?? { ok: true, status: 200, json: {} };
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: vi.fn(async () => response.text ?? ""),
      json: vi.fn(async () => response.json ?? {}),
    };
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const habit = {
  id: "habit-1",
  name: "Practice",
  skillId: "skill-1",
  routineId: null,
};

const creatorDay = resolveRelatedHabitCreatorDay({
  timeZone: "America/Chicago",
  instant: new Date("2026-09-09T10:00:00.000Z"),
});

describe("related Habit completion lifecycle", () => {
  beforeEach(() => {
    updateInstanceStatusMock.mockReset();
    updateInstanceStatusMock.mockResolvedValue({ data: {}, error: null });
  });

  it("completes an unscheduled Habit through real completion and XP award", async () => {
    const { client } = createClient([]);
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { success: true } },
      {
        json: {
          inserted: 1,
          awardKeyBase:
            "matrix_due:habit:habit-1:day:2026-09-09:card:habit-1",
          surge: { sourceType: "HABIT", title: "Practice", displayXp: 1 },
        },
      },
    ]);

    const result = await persistRelatedHabitCompletion({
      client,
      userId: "user-1",
      habit,
      wasCompleted: false,
      completedAt: "2026-09-09T14:00:00.000Z",
      timeZone: "America/Chicago",
      monumentIds: ["monument-1"],
      fetchFn,
    });

    expect(result.scheduleInstanceId).toBeNull();
    expect(result.xpStatus).toBe("inserted");
    expect(result.visual?.surge).toMatchObject({ displayXp: 1 });
    expect(updateInstanceStatusMock).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      "/api/xp/award",
      expect.objectContaining({
        body: expect.stringContaining(
          "matrix_due:habit:habit-1:day:2026-09-09:card:habit-1"
        ),
      })
    );
  });

  it("completes the current Creator-day scheduled occurrence before awarding XP", async () => {
    const { client } = createClient([
      {
        id: "later",
        user_id: "user-1",
        source_type: "HABIT",
        source_id: "habit-1",
        status: "scheduled",
        start_utc: "2026-09-09T18:00:00.000Z",
        end_utc: "2026-09-09T18:30:00.000Z",
        duration_min: 30,
        completed_at: null,
      },
      {
        id: "earlier",
        user_id: "user-1",
        source_type: "HABIT",
        source_id: "habit-1",
        status: "scheduled",
        start_utc: "2026-09-09T13:00:00.000Z",
        end_utc: "2026-09-09T13:30:00.000Z",
        duration_min: 25,
        completed_at: null,
      },
    ]);
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { success: true } },
      {
        json: {
          inserted: 1,
          awardKeyBase: "sched:earlier:habit",
          surge: { sourceType: "HABIT", title: "Practice", displayXp: 1 },
        },
      },
    ]);

    const result = await persistRelatedHabitCompletion({
      client,
      userId: "user-1",
      habit,
      wasCompleted: false,
      completedAt: "2026-09-09T14:00:00.000Z",
      timeZone: "America/Chicago",
      fetchFn,
    });

    expect(result.scheduleInstanceId).toBe("earlier");
    expect(updateInstanceStatusMock).toHaveBeenCalledWith(
      "earlier",
      "completed",
      { completedAtUTC: "2026-09-09T14:00:00.000Z" },
      client
    );
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toMatchObject({
      scheduleInstanceId: "earlier",
      awardKeyBase: "sched:earlier:habit",
      completion: {
        scheduleInstanceId: "earlier",
        wasScheduled: true,
        durationMin: 25,
      },
    });
  });

  it("treats a duplicate XP award as a successful dedupe without a visual", async () => {
    const { client } = createClient([]);
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { json: { success: true } },
      { json: { inserted: 0, deduped: true, activePositiveCount: 1 } },
    ]);

    const result = await persistRelatedHabitCompletion({
      client,
      userId: "user-1",
      habit,
      wasCompleted: false,
      completedAt: "2026-09-09T14:00:00.000Z",
      timeZone: "America/Chicago",
      fetchFn,
    });

    expect(result.xpStatus).toBe("deduped");
    expect(result.visual).toBeNull();
  });

  it("rolls back a scheduled optimistic completion when persistence fails", async () => {
    const { client } = createClient([
      {
        id: "instance-1",
        user_id: "user-1",
        source_type: "HABIT",
        source_id: "habit-1",
        status: "scheduled",
        start_utc: "2026-09-09T13:00:00.000Z",
        end_utc: "2026-09-09T13:30:00.000Z",
        duration_min: 25,
        completed_at: null,
      },
    ]);
    const fetchFn = createFetch([
      { json: { reversed: 0 } },
      { ok: false, status: 500, text: "completion failed" },
    ]);

    await expect(
      persistRelatedHabitCompletion({
        client,
        userId: "user-1",
        habit,
        wasCompleted: false,
        completedAt: "2026-09-09T14:00:00.000Z",
        timeZone: "America/Chicago",
        fetchFn,
      })
    ).rejects.toThrow("completion failed");

    expect(updateInstanceStatusMock).toHaveBeenNthCalledWith(
      2,
      "instance-1",
      "scheduled",
      undefined,
      client
    );
  });

  it("undoes habit completion, scheduled occurrence, and XP together", async () => {
    const { client } = createClient([
      {
        id: "instance-1",
        user_id: "user-1",
        source_type: "HABIT",
        source_id: "habit-1",
        status: "completed",
        start_utc: "2026-09-09T13:00:00.000Z",
        end_utc: "2026-09-09T13:30:00.000Z",
        duration_min: 25,
        completed_at: "2026-09-09T13:20:00.000Z",
      },
    ]);
    const fetchFn = createFetch([
      { json: { success: true } },
      { json: { reversed: 1 } },
    ]);

    const result = await persistRelatedHabitCompletion({
      client,
      userId: "user-1",
      habit,
      wasCompleted: true,
      completedAt: "2026-09-09T14:00:00.000Z",
      timeZone: "America/Chicago",
      fetchFn,
    });

    expect(result.xpStatus).toBe("reversed");
    expect(updateInstanceStatusMock).toHaveBeenCalledWith(
      "instance-1",
      "scheduled",
      undefined,
      client
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "/api/xp/reverse",
      expect.objectContaining({
        body: JSON.stringify({
          occurrenceStem: "sched:instance-1:habit",
          legacyOccurrenceStems: [],
          scheduleInstanceId: "instance-1",
        }),
      })
    );
  });

  it("uses Creator-day overlap boundaries instead of local midnight", async () => {
    const earlyMorningDay = resolveRelatedHabitCreatorDay({
      timeZone: "America/Chicago",
      instant: new Date("2026-09-10T08:30:00.000Z"),
    });
    expect(earlyMorningDay.creatorDayDate).toBe("2026-09-09");

    const { client, queryLog } = createClient([
      {
        id: "inside",
        user_id: "user-1",
        source_type: "HABIT",
        source_id: "habit-1",
        status: "scheduled",
        start_utc: "2026-09-10T08:00:00.000Z",
        end_utc: "2026-09-10T08:45:00.000Z",
        duration_min: 45,
        completed_at: null,
      },
    ]);

    await expect(
      findCurrentCreatorDayHabitOccurrence({
        client,
        userId: "user-1",
        habitId: "habit-1",
        creatorDay: earlyMorningDay,
      })
    ).resolves.toMatchObject({ id: "inside" });

    expect(queryLog[0]).toEqual(
      expect.arrayContaining([
        { type: "lt", column: "start_utc", value: earlyMorningDay.endsAt },
        { type: "gt", column: "end_utc", value: earlyMorningDay.startsAt },
      ])
    );
  });

  it("builds Matrix-compatible due Habit occurrence keys", () => {
    expect(
      buildRelatedHabitDueOccurrenceIdentity({
        habitId: "habit-1",
        creatorDayDate: creatorDay.creatorDayDate,
        cardId: "habit-1",
      })
    ).toEqual({
      awardKeyBase: "matrix_due:habit:habit-1:day:2026-09-09:card:habit-1",
      legacyAwardKeyBase: "habit:habit-1:2026-09-09",
      completionKey: "matrix_due:habit:habit-1:day:2026-09-09:card:habit-1",
    });

    expect(
      buildRelatedHabitDueOccurrenceIdentity({
        habitId: "habit-1",
        creatorDayDate: creatorDay.creatorDayDate,
        routineId: "routine-1",
        routineChildId: "habit-1",
        routinePosition: 2,
      }).awardKeyBase
    ).toBe(
      "matrix_due:routine:routine-1:habit:habit-1:day:2026-09-09:child:habit-1:pos:2"
    );
  });
});
