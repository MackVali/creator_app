import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { describe, expect, it } from "vitest";

import {
  ScheduleInstanceEditSheet,
  type ScheduleEditOrigin,
} from "../../src/components/schedule/ScheduleInstanceEditSheet";
import type { ScheduleInstance } from "../../src/lib/scheduler/instanceRepo";

const baseInstance: ScheduleInstance = {
  id: "instance-1",
  created_at: new Date("2024-01-01T00:00:00.000Z").toISOString(),
  updated_at: new Date("2024-01-01T00:00:00.000Z").toISOString(),
  user_id: "user-123",
  source_type: "TASK",
  source_id: "task-123",
  window_id: null,
  start_utc: new Date("2024-01-01T12:00:00.000Z").toISOString(),
  end_utc: new Date("2024-01-01T13:00:00.000Z").toISOString(),
  duration_min: 60,
  status: "scheduled",
  weight_snapshot: 1,
  energy_resolved: "NO",
  completed_at: null,
};

const layoutId = `schedule-instance-${baseInstance.id}`;

const originSnapshot: ScheduleEditOrigin = {
  x: 0,
  y: 0,
  width: 220,
  height: 120,
  borderRadius: "16px",
  backgroundColor: "rgb(30, 41, 59)",
  backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.1), rgba(0,0,0,0.1))",
  boxShadow: "0 16px 30px rgba(15,23,42,0.35)",
};

function MorphHarness({ open }: { open: boolean }) {
  return (
    <LayoutGroup id="morph-test">
      <AnimatePresence initial={false}>
        {!open ? (
          <motion.div
            key="card"
            data-schedule-instance-id={baseInstance.id}
            layoutId={layoutId}
            layout="position"
            exit={{ opacity: 0 }}
          >
            Timeline Card
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ScheduleInstanceEditSheet
        open={open}
        instance={baseInstance}
        eventTitle="Mock Task"
        eventTypeLabel="Task"
        timeZoneLabel="UTC"
        onClose={() => {}}
        onSubmit={() => {}}
        origin={originSnapshot}
        layoutId={layoutId}
      />
    </LayoutGroup>
  );
}

describe("Schedule instance morph lifecycle", () => {
  it("only removes the timeline card while the edit sheet is active", () => {
    const closedMarkup = renderToStaticMarkup(<MorphHarness open={false} />);
    expect(closedMarkup).toContain(`data-schedule-instance-id="${baseInstance.id}"`);

    const openMarkup = renderToStaticMarkup(<MorphHarness open />);
    expect(openMarkup).not.toContain(`data-schedule-instance-id="${baseInstance.id}"`);

    const reopenedMarkup = renderToStaticMarkup(<MorphHarness open={false} />);
    expect(reopenedMarkup).toContain(`data-schedule-instance-id="${baseInstance.id}"`);
  });
});
