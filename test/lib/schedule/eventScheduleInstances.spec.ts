import { describe, expect, it } from "vitest";
import {
  isInteractiveEventScheduleInstance,
  isLinkedEventScheduleInstance,
} from "../../../src/lib/schedule/eventScheduleInstances";
import {
  isMyListEventBackedScheduleInstance,
  resolveScheduleXpCompletionSemantics,
} from "../../../src/lib/xp/scheduleXpSemantics";

describe("event schedule instances", () => {
  it("treats generic linked EVENT instances as interactive without My List metadata", () => {
    const instance = {
      id: "inst-event",
      source_type: "EVENT",
      source_id: "event-1",
      metadata: null,
    };

    expect(isLinkedEventScheduleInstance(instance)).toBe(true);
    expect(isInteractiveEventScheduleInstance(instance)).toBe(true);
    expect(isMyListEventBackedScheduleInstance(instance)).toBe(false);
  });

  it("does not give generic EVENT instances My List Task XP semantics", () => {
    expect(
      resolveScheduleXpCompletionSemantics({
        id: "inst-event",
        source_type: "EVENT",
        source_id: "event-1",
        event_name: "Interview",
        metadata: null,
      })
    ).toBeNull();
  });

  it("preserves My List-backed EVENT Task XP semantics", () => {
    expect(
      resolveScheduleXpCompletionSemantics({
        id: "inst-my-list-event",
        source_type: "EVENT",
        source_id: "event-2",
        event_name: "My List item",
        metadata: {
          source: "my-list",
          rowType: "manual",
          rowId: "todo-1",
        },
      })?.completionSourceType
    ).toBe("TASK");
  });
});
