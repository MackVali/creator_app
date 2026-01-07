import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  resolveHabitCompletionStatus,
  type HabitCompletionStatus,
} from "../../../src/app/(app)/schedule/habitCompletion";

function HabitCardStub({
  instanceStatusById,
  completionStatus,
}: {
  instanceStatusById: Record<string, string | null>;
  completionStatus: HabitCompletionStatus;
}) {
  const isHabitCompleted = resolveHabitCompletionStatus({
    placement: { habitId: "habit-1", instanceId: "inst-1" },
    dayViewDateKey: "2024-01-01",
    instanceStatusById,
    getHabitCompletionStatus: () => completionStatus,
  });
  const className = [
    "habit-card",
    isHabitCompleted ? "habit-card--completed" : "habit-card--scheduled",
  ].join(" ");
  return React.createElement("div", { className }, "Habit");
}

describe("resolveHabitCompletionStatus", () => {
  it("prefers optimistic instance status for class toggles", () => {
    const html = renderToStaticMarkup(
      React.createElement(HabitCardStub, {
        instanceStatusById: { "inst-1": "completed" },
        completionStatus: "scheduled",
      })
    );
    expect(html).toContain("habit-card--completed");
    expect(html).not.toContain("habit-card--scheduled");
  });
});
