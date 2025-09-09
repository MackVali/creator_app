"use client";

import { useEffect, useMemo, useState } from "react";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekViewProps {
  date?: Date;
}

export function WeekView({ date = new Date() }: WeekViewProps) {
  const start = useMemo(() => {
    const s = new Date(date);
    const day = s.getDay();
    s.setDate(s.getDate() - day);
    return s;
  }, [date]);
  const end = useMemo(() => {
    const e = new Date(start);
    e.setDate(start.getDate() + 6);
    return e;
  }, [start]);
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [start]);

  const startHour = 0;
  const endHour = 24;
  const pxPerMin = 2;
  const totalMinutes = (endHour - startHour) * 60;
  const timelineHeight = totalMinutes * pxPerMin;
  const hourHeight = 60 * pxPerMin;

  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    const today = new Date();
    if (today < start || today > end) {
      setNowMinutes(null);
      return;
    }
    function update() {
      const d = new Date();
      const minutes = d.getHours() * 60 + d.getMinutes();
      setNowMinutes(minutes - startHour * 60);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [start, end]);

  const showNowLine =
    nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= totalMinutes;
  const nowTop = (nowMinutes ?? 0) * pxPerMin;

  const hours: number[] = [];
  for (let h = Math.ceil(startHour); h < endHour; h++) {
    hours.push(h);
  }

  return (
    <div className="text-xs text-gray-300">
      <div className="mb-2 text-center text-sm text-gray-200">
        {formatRange(start, end)}
      </div>
      <div className="grid grid-cols-7 text-center mb-2">
        {days.map((d) => (
          <div key={d.toISOString()}>
            <div className="font-medium">{dayNames[d.getDay()]}</div>
            <div>{d.getDate()}</div>
          </div>
        ))}
      </div>
      <div
        className="relative w-full pl-16 bg-black overflow-hidden"
        style={{ height: timelineHeight }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 1px, transparent 1px, transparent ${hourHeight}px)` }}
        />
        {hours.map((h) => {
          const top = (h - startHour) * 60 * pxPerMin;
          return (
            <div
              key={h}
              className="absolute left-0 w-16 pr-2 text-right text-xs text-zinc-500"
              style={{ top }}
            >
              {formatHour(h)}
            </div>
          );
        })}

        <div className="absolute left-16 right-0 top-0 h-full grid grid-cols-7">
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className="border-l border-zinc-800/40 first:border-l-0"
            />
          ))}
        </div>

        {showNowLine && (
          <div className="now-line absolute left-0 right-0" style={{ top: nowTop }} />
        )}
      </div>
    </div>
  );
}

function formatRange(start: Date, end: Date) {
  const startStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const yearStr = end.getFullYear();
  return `${startStr} – ${endStr}, ${yearStr}`;
}

function formatHour(h: number) {
  const normalized = h % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${hour12} ${suffix}`;
}
