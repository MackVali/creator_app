"use client";

import { FocusTimeline } from "@/components/schedule/FocusTimeline";
import { getZonedDateTimeParts } from "@/lib/time/tz";

export default function FocusTimelinePreview() {
  const timeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (error) {
      console.warn("Failed to resolve preview timezone", error);
      return "UTC";
    }
  })();
  const nowParts = getZonedDateTimeParts(new Date(), timeZone);
  const dayKey = nowParts.dayKey;
  const start = nowParts.hour * 60 + nowParts.minute;
  const events = [
    { id: 1, start: start + 10, end: start + 40, title: "Quick task" },
    { id: 2, start: start + 60, end: start + 90, title: "Second task" },
  ];
  return (
    <div className="p-4 text-white">
      <FocusTimeline timeZone={timeZone} dayKey={dayKey}>
        {events.map((e) => (
          <div
            key={e.id}
            className="absolute left-16 right-2 rounded bg-blue-600/60 px-3 py-1 text-xs"
            style={{ top: (e.start - start) * 2, height: (e.end - e.start) * 2 }}
          >
            {e.title}
          </div>
        ))}
      </FocusTimeline>
    </div>
  );
}

