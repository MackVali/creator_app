import { describe, expect, it, vi } from "vitest";
import { resetUnlockedScheduledProjectInstances } from "../../../src/lib/scheduler/runSchedulerForUser";

vi.mock("../../../src/lib/scheduler/reschedule", () => ({
  markMissedAndQueue: vi.fn(),
  scheduleBacklog: vi.fn(),
}));

type TestQueryChain = {
  filters?: Record<string, unknown>;
  eq?: ReturnType<typeof vi.fn>;
  in?: ReturnType<typeof vi.fn>;
  then?: Promise<unknown>["then"];
};

describe("resetUnlockedScheduledProjectInstances", () => {
  it("does not reset locked overlay-backed project instances", async () => {
    const rows = [
      {
        id: "inst-unlocked-project",
        user_id: "user-1",
        source_type: "PROJECT",
        status: "scheduled",
        locked: false,
        overlay_window_id: null,
      },
      {
        id: "inst-locked-overlay-project",
        user_id: "user-1",
        source_type: "PROJECT",
        status: "scheduled",
        locked: true,
        overlay_window_id: "overlay-active",
      },
    ];
    const updatedIds: string[] = [];
    const updatePayloads: Record<string, unknown>[] = [];

    const selectChain: TestQueryChain = {
      filters: {},
    };
    selectChain.eq = vi.fn((column: string, value: unknown) => {
      selectChain.filters = {
        ...(selectChain.filters ?? {}),
        [column]: value,
      };
      return selectChain;
    });
    selectChain.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => {
      const filtered = rows.filter((row) =>
        Object.entries(selectChain.filters ?? {}).every(
          ([column, value]) => row[column as keyof typeof row] === value
        )
      );
      return Promise.resolve({
        data: filtered.map((row) => ({ id: row.id })),
        error: null,
      }).then(onFulfilled, onRejected);
    };

    const update = vi.fn((payload: Record<string, unknown>) => {
      const updateChain: TestQueryChain = {};
      updateChain.in = vi.fn((column: string, values: string[]) => {
        if (column === "id") {
          updatedIds.push(...values);
          updatePayloads.push(payload);
        }
        return updateChain;
      });
      updateChain.then = (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve({ error: null }).then(onFulfilled, onRejected);
      return updateChain;
    });

    const client = {
      from: vi.fn((table: string) => {
        expect(table).toBe("schedule_instances");
        return {
          select: vi.fn(() => selectChain),
          update,
        };
      }),
    };

    const result = await resetUnlockedScheduledProjectInstances(
      "user-1",
      new Date("2026-02-02T12:00:00.000Z"),
      client as unknown as Parameters<
        typeof resetUnlockedScheduledProjectInstances
      >[2]
    );

    expect(result).toEqual({ count: 1, error: null });
    expect(updatedIds).toEqual(["inst-unlocked-project"]);
    expect(updatedIds).not.toContain("inst-locked-overlay-project");
    expect(updatePayloads[0]).toMatchObject({
      status: "unscheduled",
      start_utc: null,
      end_utc: null,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
    });
  });
});
