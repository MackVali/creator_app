"use client";

import { DayTimeline } from "@/components/schedule/DayTimeline";
import { getZonedDateTimeParts } from "@/lib/time/tz";

export default function DayTimelinePreview() {
  const startHour = 8;
  const timeZone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (error) {
      console.warn("Failed to resolve preview timezone", error);
      return "UTC";
    }
  })();
  const dayKey = getZonedDateTimeParts(new Date(), timeZone).dayKey;
  const events = [
    { id: 1, start: 9 * 60, end: 10 * 60 + 30, title: "Morning sync" },
    { id: 2, start: 13 * 60, end: 14 * 60, title: "Lunch" },
    { id: 3, start: 15 * 60 + 15, end: 16 * 60, title: "Deep work" },
  ];
  return (
    <div className="p-4 text-white">
      <DayTimeline
        startHour={startHour}
        endHour={20}
        timeZone={timeZone}
        dayKey={dayKey}
      >
        {events.map((e) => (
          <div
            key={e.id}
            className="absolute left-16 right-2 rounded bg-blue-600/60 px-3 py-1 text-xs"
            style={{
              top: (e.start - startHour * 60) * 2,
              height: (e.end - e.start) * 2,
            }}
          >
            {e.title}
          </div>
        ))}
      </DayTimeline>
    </div>
  );
}

