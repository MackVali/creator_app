import { describe, it, expect, vi } from "vitest";
import {
  createInstance,
  rescheduleInstance,
} from "../../../src/lib/scheduler/instanceRepo";
import { createSupabaseMock } from "../../utils/supabaseMock";

describe("instanceRepo day-type guard", () => {
  const windowId = "window-fake-time-block";
  const dayTypeTimeBlockId = "day-type-time-block";
  const timeBlockId = "time-block-value";
  const startUTC = "2025-02-02T05:00:00Z";
  const endUTC = "2025-02-02T06:00:00Z";
  const durationMin = 60;

  it("clears window_id for day-type createInstance calls", async () => {
    const { client } = createSupabaseMock();
    const { insert: insertSpy } =
      client.from("schedule_instances") as {
        insert: ReturnType<typeof vi.fn>;
      };

    await createInstance(
      {
        userId: "user-1",
        sourceId: "source-1",
        sourceType: "PROJECT",
        windowId,
        dayTypeTimeBlockId,
        timeBlockId,
        startUTC,
        endUTC,
        durationMin,
        energyResolved: "LOW",
      },
      client
    );

    const insertPayload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(insertPayload.window_id).toBeNull();
    expect(insertPayload.day_type_time_block_id).toBe(dayTypeTimeBlockId);
    expect(insertPayload.time_block_id).toBe(timeBlockId);
  });

  it("clears window_id for day-type rescheduleInstance calls", async () => {
    const { client } = createSupabaseMock();
    const { update: updateSpy } =
      client.from("schedule_instances") as {
        update: ReturnType<typeof vi.fn>;
      };

    await rescheduleInstance(
      "instance-1",
      {
        windowId,
        dayTypeTimeBlockId,
        timeBlockId,
        startUTC,
        endUTC,
        durationMin,
        energyResolved: "LOW",
        weightSnapshot: 0,
      },
      client
    );

    const updatePayload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.window_id).toBeNull();
    expect(updatePayload.day_type_time_block_id).toBe(dayTypeTimeBlockId);
    expect(updatePayload.time_block_id).toBe(timeBlockId);
  });
});
