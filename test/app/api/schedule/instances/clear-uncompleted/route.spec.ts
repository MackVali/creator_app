import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { DELETE } from "@/app/api/schedule/instances/clear-uncompleted/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);

type InstanceRow = {
  id: string;
  user_id: string;
  placement_source: "manual" | "scheduler";
  locked: boolean | null;
  status: "scheduled" | "missed" | "completed";
  start_utc: string | null;
  end_utc: string | null;
};

type QueryFilter =
  | { type: "eq" | "neq"; column: keyof InstanceRow; value: unknown }
  | { type: "preservedLockedFuture" | "clearable"; nowIso: string };

const nowIso = "2026-06-25T15:00:00.000Z";
const pastStart = "2026-06-25T13:00:00.000Z";
const pastEnd = "2026-06-25T14:00:00.000Z";
const futureStart = "2026-06-25T16:00:00.000Z";
const futureEnd = "2026-06-25T17:00:00.000Z";

function makeRow(overrides: Partial<InstanceRow>): InstanceRow {
  return {
    id: "row-1",
    user_id: "user-1",
    placement_source: "scheduler",
    locked: false,
    status: "scheduled",
    start_utc: futureStart,
    end_utc: futureEnd,
    ...overrides,
  };
}

class ScheduleQuery {
  private filters: QueryFilter[] = [];
  private options?: { count?: "exact"; head?: boolean };

  constructor(
    private rows: InstanceRow[],
    private mode: "select" | "delete"
  ) {}

  select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
    if (options) this.options = options;
    return this;
  }

  eq(column: keyof InstanceRow, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: keyof InstanceRow, value: unknown) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  or(expression: string) {
    const nowMatch = expression.match(
      /(?:end_utc\.(?:gte|lt)|start_utc\.(?:gte|lt))\.([^,)]*)/
    );
    this.filters.push({
      type: expression.includes("locked.is.false")
        ? "clearable"
        : "preservedLockedFuture",
      nowIso: nowMatch?.[1] ?? "",
    });
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private execute() {
    const matched = this.rows.filter((row) =>
      this.filters.every((filter) => matchesFilter(row, filter))
    );

    if (this.mode === "delete") {
      const matchedIds = new Set(matched.map((row) => row.id));
      for (let index = this.rows.length - 1; index >= 0; index -= 1) {
        if (matchedIds.has(this.rows[index].id)) {
          this.rows.splice(index, 1);
        }
      }
    }

    return {
      data: this.options?.head ? null : matched.map((row) => ({ id: row.id })),
      count: this.options?.count === "exact" ? matched.length : null,
      error: null,
    };
  }
}

function matchesFilter(row: InstanceRow, filter: QueryFilter) {
  if (filter.type === "eq") return row[filter.column] === filter.value;
  if (filter.type === "neq") return row[filter.column] !== filter.value;

  const nowMs = Date.parse(filter.nowIso);
  const endMs = row.end_utc ? Date.parse(row.end_utc) : null;
  const startMs = row.start_utc ? Date.parse(row.start_utc) : null;
  const hasFutureEnd = endMs !== null && endMs >= nowMs;
  const hasFutureStartFallback =
    endMs === null && startMs !== null && startMs >= nowMs;

  if (filter.type === "preservedLockedFuture") {
    return row.locked === true && (hasFutureEnd || hasFutureStartFallback);
  }

  if (row.locked !== true) return true;

  const hasPastEnd = endMs !== null && endMs < nowMs;
  const hasPastStartFallback =
    endMs === null && startMs !== null && startMs < nowMs;
  const hasNoTime = endMs === null && startMs === null;
  return hasPastEnd || hasPastStartFallback || hasNoTime;
}

function createClient(rows: InstanceRow[]) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
      })),
    },
    from: vi.fn((table: string) => {
      expect(table).toBe("schedule_instances");
      return {
        select: vi.fn(
          (columns: string, options?: { count?: "exact"; head?: boolean }) =>
            new ScheduleQuery(rows, "select").select(columns, options)
        ),
        delete: vi.fn(() => new ScheduleQuery(rows, "delete")),
      };
    }),
  };
}

describe("DELETE /api/schedule/instances/clear-uncompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears uncompleted unlocked and past Events while preserving completed and locked future Events", async () => {
    const rows = [
      makeRow({
        id: "completed-event",
        status: "completed",
        locked: false,
        start_utc: pastStart,
        end_utc: pastEnd,
      }),
      makeRow({ id: "unlocked-future-event", locked: false }),
      makeRow({
        id: "locked-future-scheduled-event",
        locked: true,
        placement_source: "scheduler",
      }),
      makeRow({
        id: "locked-future-manual-event",
        locked: true,
        placement_source: "manual",
        end_utc: null,
      }),
      makeRow({
        id: "past-uncompleted-event",
        locked: false,
        start_utc: pastStart,
        end_utc: pastEnd,
      }),
      makeRow({
        id: "locked-past-uncompleted-event",
        locked: true,
        start_utc: pastStart,
        end_utc: pastEnd,
      }),
      makeRow({
        id: "scheduler-owned-locked-future-event",
        locked: true,
        placement_source: "scheduler",
        start_utc: futureStart,
        end_utc: futureEnd,
      }),
    ];
    createSupabaseServerClientMock.mockResolvedValue(createClient(rows) as never);

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      deleted: 3,
      preservedLockedFuture: 3,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "completed-event",
      "locked-future-scheduled-event",
      "locked-future-manual-event",
      "scheduler-owned-locked-future-event",
    ]);
  });
});
