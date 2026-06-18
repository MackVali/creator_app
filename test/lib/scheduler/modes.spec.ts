import { describe, expect, it } from "vitest";
import {
  isConfiguredMode,
  normalizeSchedulerModePayload,
  schedulerModeLabel,
} from "../../../src/lib/scheduler/modes";

describe("scheduler mode payloads", () => {
  it("normalizes a configured OVERLAY mode", () => {
    const mode = normalizeSchedulerModePayload({
      type: "overlay",
      overlayWindowId: " overlay-window-1 ",
    });

    expect(mode).toEqual({
      type: "OVERLAY",
      overlayWindowId: "overlay-window-1",
    });
    expect(isConfiguredMode(mode)).toBe(true);
    expect(schedulerModeLabel(mode)).toBe("Overlay");
  });

  it("falls back to REGULAR when OVERLAY has no overlayWindowId", () => {
    expect(
      normalizeSchedulerModePayload({
        type: "OVERLAY",
        overlayWindowId: " ",
      })
    ).toEqual({ type: "REGULAR" });
  });
});
