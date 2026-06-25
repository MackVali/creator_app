import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/scheduler/reschedule", () => ({
  scheduleBacklog: vi.fn(),
}));

import { POST } from "@/app/api/schedule/instances/recycle-manual/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { scheduleBacklog } from "@/lib/scheduler/reschedule";

const createSupabaseServerClientMock = vi.mocked(createSupabaseServerClient);
const scheduleBacklogMock = vi.mocked(scheduleBacklog);

type InstanceRow = {
  id: string;
  user_id: string;
  source_type: "PROJECT" | "HABIT" | "TASK";
  source_id: string;
  placement_source: "manual" | "scheduler";
  locked: boolean;
  status: "scheduled" | "missed" | "completed";
  completed_at: string | null;
  start_utc: string | null;
  end_utc: string | null;
  window_id: string | null;
  day_type_time_block_id: string | null;
  time_block_id: string | null;
  overlay_window_id: string | null;
  canceled_reason: string | null;
  updated_at?: string | null;
};

const staleStart = "2026-06-24T08:00:00.000Z";
const staleEnd = "2026-06-24T09:00:00.000Z";
const futureStart = "2099-06-24T08:00:00.000Z";
const futureEnd = "2099-06-24T09:00:00.000Z";

function makeRow(overrides: Partial<InstanceRow>): InstanceRow {
  return {
    id: "row-1",
    user_id: "user-1",
    source_type: "PROJECT",
    source_id: "project-1",
    placement_source: "manual",
    locked: true,
    status: "scheduled",
    completed_at: null,
    start_utc: staleStart,
    end_utc: staleEnd,
    window_id: "window-old",
    day_type_time_block_id: "day-block-old",
    time_block_id: "time-block-old",
    overlay_window_id: "overlay-old",
    canceled_reason: null,
    ...overrides,
  };
}

type QueryFilter = {
  type: "eq" | "in" | "is" | "stale";
  column?: keyof InstanceRow;
  value?: unknown;
  values?: unknown[];
  nowIso?: string;
};

class ScheduleQuery {
  private filters: QueryFilter[] = [];

  constructor(
    private rows: InstanceRow[],
    private mode: "select" | "update",
    private payload: Partial<InstanceRow> | null = null,
    private options?: { count?: "exact"; head?: boolean }
  ) {}

  select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
    if (options) this.options = options;
    return this;
  }

  eq(column: keyof InstanceRow, value: unknown) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  in(column: keyof InstanceRow, values: unknown[]) {
    this.filters.push({ type: "in", column, values });
    return this;
  }

  is(column: keyof InstanceRow, value: unknown) {
    this.filters.push({ type: "is", column, value });
    return this;
  }

  or(expression: string) {
    const match = expression.match(/start_utc\.lt\.([^)]*)/);
    this.filters.push({ type: "stale", nowIso: match?.[1] ?? "" });
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

    if (this.mode === "update" && this.payload) {
      for (const row of matched) {
        Object.assign(row, this.payload);
      }
    }

    return {
      data: this.options?.head ? null : matched.map((row) => ({ ...row })),
      count: this.options?.count === "exact" ? matched.length : null,
      error: null,
    };
  }
}

function matchesFilter(row: InstanceRow, filter: QueryFilter) {
  if (filter.type === "stale") {
    const nowMs = Date.parse(filter.nowIso ?? "");
    const endMs = row.end_utc ? Date.parse(row.end_utc) : null;
    const startMs = row.start_utc ? Date.parse(row.start_utc) : null;
    return (
      (typeof endMs === "number" && Number.isFinite(endMs) && endMs < nowMs) ||
      (endMs === null &&
        typeof startMs === "number" &&
        Number.isFinite(startMs) &&
        startMs < nowMs)
    );
  }

  const value = row[filter.column as keyof InstanceRow];
  if (filter.type === "eq") return value === filter.value;
  if (filter.type === "is") return value === filter.value;
  if (filter.type === "in") return filter.values?.includes(value) ?? false;
  return false;
}

function createClient(rows: InstanceRow[]) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            user_metadata: { timezone: "America/New_York" },
          },
        },
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { timezone: "America/Chicago" },
                error: null,
              })),
            })),
          })),
        };
      }

      expect(table).toBe("schedule_instances");
      return {
        select: vi.fn(
          (columns: string, options?: { count?: "exact"; head?: boolean }) =>
            new ScheduleQuery(rows, "select", null, options).select(
              columns,
              options
            )
        ),
        update: vi.fn((payload: Partial<InstanceRow>) =>
          new ScheduleQuery(rows, "update", payload)
        ),
      };
    }),
  };
}

describe("POST /api/schedule/instances/recycle-manual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scheduleBacklogMock.mockResolvedValue({
      placed: [],
      failures: [],
      error: null,
      timeline: [],
      debug: [],
      hasPastInstanceSkipped: false,
    });
  });

  it("releases only stale manual PROJECT/HABIT rows and calls targeted scheduling", async () => {
    const rows = [
      makeRow({ id: "manual-project", source_id: "project-1" }),
      makeRow({
        id: "manual-habit",
        source_type: "HABIT",
        source_id: "habit-1",
      }),
      makeRow({
        id: "completed-manual",
        status: "completed",
        completed_at: "2026-06-24T09:05:00.000Z",
      }),
      makeRow({
        id: "scheduler-locked",
        placement_source: "scheduler",
        locked: true,
      }),
      makeRow({
        id: "scheduler-unlocked",
        placement_source: "scheduler",
        locked: false,
      }),
      makeRow({
        id: "future-manual",
        start_utc: futureStart,
        end_utc: futureEnd,
      }),
      makeRow({ id: "manual-task", source_type: "TASK", source_id: "task-1" }),
    ];
    createSupabaseServerClientMock.mockResolvedValue(createClient(rows) as never);
    scheduleBacklogMock.mockResolvedValue({
      placed: [
        makeRow({
          id: "placed-project",
          source_id: "project-1",
          placement_source: "scheduler",
          locked: false,
          start_utc: futureStart,
          end_utc: futureEnd,
        }),
        makeRow({
          id: "placed-habit",
          source_type: "HABIT",
          source_id: "habit-1",
          placement_source: "scheduler",
          locked: false,
          start_utc: futureStart,
          end_utc: futureEnd,
        }),
      ],
      failures: [],
      error: null,
      timeline: [],
      debug: [],
      hasPastInstanceSkipped: false,
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      recycled: 2,
      placed: 2,
      failed: 0,
      skipped: 1,
      skippedByReason: { TASK_UNSUPPORTED_V1: 1 },
    });
    expect(scheduleBacklogMock).toHaveBeenCalledWith(
      "user-1",
      expect.any(Date),
      expect.any(Object),
      expect.objectContaining({
        timeZone: "America/Chicago",
        targetSourceIds: {
          PROJECT: ["project-1"],
          HABIT: ["habit-1"],
        },
      })
    );

    expect(rows.find((row) => row.id === "manual-project")).toMatchObject({
      locked: false,
      placement_source: "scheduler",
      status: "missed",
      start_utc: null,
      end_utc: null,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
      overlay_window_id: null,
    });
    expect(rows.find((row) => row.id === "manual-habit")).toMatchObject({
      locked: false,
      placement_source: "scheduler",
      status: "missed",
      start_utc: null,
      end_utc: null,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
      overlay_window_id: null,
    });
    expect(rows.find((row) => row.id === "completed-manual")?.status).toBe(
      "completed"
    );
    expect(rows.find((row) => row.id === "scheduler-locked")?.locked).toBe(true);
    expect(rows.find((row) => row.id === "scheduler-unlocked")?.locked).toBe(
      false
    );
    expect(rows.find((row) => row.id === "future-manual")?.start_utc).toBe(
      futureStart
    );
    expect(rows.find((row) => row.id === "manual-task")?.locked).toBe(true);
  });

  it("reports TASK-only matches as skipped without running the scheduler", async () => {
    const rows = [
      makeRow({ id: "manual-task", source_type: "TASK", source_id: "task-1" }),
    ];
    createSupabaseServerClientMock.mockResolvedValue(createClient(rows) as never);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      recycled: 0,
      placed: 0,
      failed: 0,
      skipped: 1,
      skippedByReason: { TASK_UNSUPPORTED_V1: 1 },
    });
    expect(scheduleBacklogMock).not.toHaveBeenCalled();
    expect(rows[0].locked).toBe(true);
  });

  it("counts targeted scheduler failures", async () => {
    const rows = [
      makeRow({
        id: "manual-habit",
        source_type: "HABIT",
        source_id: "habit-1",
      }),
    ];
    createSupabaseServerClientMock.mockResolvedValue(createClient(rows) as never);
    scheduleBacklogMock.mockResolvedValue({
      placed: [],
      failures: [{ itemId: "habit-1", reason: "NO_FIT" }],
      error: null,
      timeline: [],
      debug: [],
      hasPastInstanceSkipped: false,
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      recycled: 1,
      placed: 0,
      failed: 1,
      skipped: 0,
    });
  });
});
