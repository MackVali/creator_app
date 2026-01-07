import { describe, expect, it } from "vitest";

import {
  applyStatusTargets,
  runStatusMutation,
  type StatusTarget,
} from "../../../src/app/(app)/schedule/statusMutations";
import type { ScheduleInstance } from "../../../src/lib/scheduler/instanceRepo";

const baseInstance = (overrides: Partial<ScheduleInstance>): ScheduleInstance =>
  ({
    id: "inst-default",
    user_id: "user-1",
    source_id: "habit-1",
    source_type: "HABIT",
    status: "scheduled",
    start_utc: new Date().toISOString(),
    end_utc: new Date(Date.now() + 30 * 60000).toISOString(),
    duration_min: 30,
    completed_at: null,
    energy_resolved: "NO",
    weight_snapshot: 1,
    window_id: null,
    locked: false,
    practice_context_monument_id: null,
    energy_snapshot: null,
    event_name: null,
    missed_reason: null,
    sync_group_id: null,
    ...overrides,
  }) as ScheduleInstance;

describe("statusMutations", () => {
  it("applies optimistic completion for past-day habit instances", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const instance = baseInstance({
      id: "inst-habit",
      source_type: "HABIT",
      status: "scheduled",
      start_utc: yesterday.toISOString(),
      end_utc: new Date(yesterday.getTime() + 30 * 60000).toISOString(),
    });
    const targets: StatusTarget[] = [
      {
        id: instance.id,
        status: "completed",
        completedAt: yesterday.toISOString(),
      },
    ];
    const updated = applyStatusTargets([instance], targets);
    expect(updated[0]?.status).toBe("completed");
    expect(updated[0]?.completed_at).toBe(targets[0]?.completedAt);
  });

  it("applies and rolls back sync pair completion when mutation fails", async () => {
    const i1 = baseInstance({ id: "inst-sync-1" });
    const i2 = baseInstance({ id: "inst-sync-2" });
    const targets: StatusTarget[] = [
      { id: i1.id, status: "completed", completedAt: "2024-01-01T12:00:00.000Z" },
      { id: i2.id, status: "completed", completedAt: "2024-01-01T12:00:00.000Z" },
    ];

    const success = await runStatusMutation({
      instances: [i1, i2],
      targets,
      mutate: async () => ({ ok: true }),
    });
    expect(success.instances.map((i) => i.status)).toEqual([
      "completed",
      "completed",
    ]);

    const failure = await runStatusMutation({
      instances: [i1, i2],
      targets,
      mutate: async () => ({ ok: false }),
    });
    expect(failure.instances.map((i) => i.status)).toEqual([
      "scheduled",
      "scheduled",
    ]);
  });
});
