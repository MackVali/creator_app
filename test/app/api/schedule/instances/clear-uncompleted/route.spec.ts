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
  completed_at: string | null;
  start_utc: string | null;
  end_utc: string | null;
};

type QueryFilter =
  | { type: "eq" | "neq"; column: keyof InstanceRow; value: unknown }
  | { type: "is"; column: keyof InstanceRow; value: unknown }
  | { type: "or"; expression: string };

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
    completed_at: null,
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

  is(column: keyof InstanceRow, value: unknown) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  or(expression: string) {
    this.filters.push({ type: "or", expression });
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
  if (filter.type === "is") return row[filter.column] === filter.value;

  if (filter.expression === "locked.is.false,locked.is.null") {
    return row.locked === false || row.locked === null;
  }

  if (filter.expression === "status.eq.completed,completed_at.not.is.null") {
    return row.status === "completed" || row.completed_at !== null;
  }

  throw new Error(`Unsupported OR expression: ${filter.expression}`);
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

  it("clears uncompleted non-locked Events while preserving completed and locked Events", async () => {
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
        id: "unlocked-missed-event",
        locked: false,
        status: "missed",
        start_utc: pastStart,
        end_utc: pastEnd,
      }),
      makeRow({
        id: "locked-missed-event",
        locked: true,
        status: "missed",
        start_utc: pastStart,
        end_utc: pastEnd,
      }),
      makeRow({
        id: "nullable-locked-uncompleted-event",
        locked: null,
      }),
      makeRow({
        id: "completed-at-event",
        locked: false,
        status: "scheduled",
        completed_at: "2026-06-25T13:45:00.000Z",
      }),
    ];
    createSupabaseServerClientMock.mockResolvedValue(createClient(rows) as never);

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      deleted: 3,
      cleared: 3,
      preservedLocked: 3,
      preservedCompleted: 2,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "completed-event",
      "locked-future-scheduled-event",
      "locked-future-manual-event",
      "locked-missed-event",
      "completed-at-event",
    ]);
  });
});
