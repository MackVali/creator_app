"use client";

import { useEffect, useState } from "react";

export const GEM_PURPLE = "#9966CC";

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
}

export function DayTimeline({
  startHour = 5,
  endHour = 24,
  pxPerMin = 2,
}: DayTimelineProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const timelineHeight = totalMinutes * pxPerMin;
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      const d = new Date();
      const minutes = d.getHours() * 60 + d.getMinutes();
      setNowMinutes(minutes - startHour * 60);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [startHour]);

  const showNowLine =
    nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= totalMinutes;
  const nowTop = (nowMinutes ?? 0) * pxPerMin;

  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) {
    hours.push(h);
  }

  return (
    <div
      className="relative w-full pl-16"
      style={{ height: `${timelineHeight}px` }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent ${5 * pxPerMin}px),
            repeating-linear-gradient(to bottom, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 2px, transparent 2px, transparent ${60 * pxPerMin}px)
          `,
        }}
      />

      {hours.map((h) => {
        const top = (h - startHour) * 60 * pxPerMin;
        return (
          <div
            key={h}
            className="absolute left-0 w-16 pr-2 text-right text-xs text-gray-400"
            style={{ top }}
          >
            {formatHour(h)}
          </div>
        );
      })}

      {showNowLine && (
        <div
          className="absolute left-0 right-0"
          style={{
            top: nowTop,
            borderTop: `2px solid ${GEM_PURPLE}`,
            boxShadow: `0 0 6px ${GEM_PURPLE}`,
          }}
        />
      )}
    </div>
  );
}

function formatHour(h: number) {
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12} ${suffix}`;
}
