"use client";

import { FocusTimeline } from "@/components/schedule/FocusTimeline";

export default function FocusTimelinePreview() {
  const now = new Date();
  const start = now.getHours() * 60 + now.getMinutes();
  const events = [
    { id: 1, start: start + 10, end: start + 40, title: "Quick task" },
    { id: 2, start: start + 60, end: start + 90, title: "Second task" },
  ];
  return (
    <div className="p-4 text-surface-foreground">
      <FocusTimeline>
        {events.map((e) => (
          <div
            key={e.id}
            className="absolute left-16 right-2 rounded bg-primary/60 px-3 py-1 text-xs"
            style={{ top: (e.start - start) * 2, height: (e.end - e.start) * 2 }}
          >
            {e.title}
          </div>
        ))}
      </FocusTimeline>
    </div>
  );
}

