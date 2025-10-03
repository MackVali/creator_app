"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  date?: Date;
  children?: ReactNode;
  className?: string;
}

export function DayTimeline({
  startHour = 0,
  endHour = 24,
  pxPerMin = 2,
  date = new Date(),
  children,
  className,
}: DayTimelineProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const timelineHeight = totalMinutes * pxPerMin;
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!isSameDay(date, new Date())) {
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
  }, [startHour, date]);

  const showNowLine =
    nowMinutes !== null && nowMinutes >= 0 && nowMinutes <= totalMinutes;
  const nowTop = (nowMinutes ?? 0) * pxPerMin;

  const hours: number[] = [];
  for (let h = Math.ceil(startHour); h < endHour; h++) {
    hours.push(h);
  }

  return (
    <>
      <div
        className={cn(
          "relative w-full overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(39,39,42,0.35)_0%,_rgba(12,12,18,0.9)_52%,_rgba(6,8,20,0.98)_100%)] pl-16",
          className
        )}
        style={{ height: timelineHeight }}
      >
        {hours.map(h => {
          const top = (h - startHour) * 60 * pxPerMin;
          return (
            <Fragment key={h}>
              <div
                className="pointer-events-none absolute left-16 right-0 border-t border-white/10"
                style={{ top }}
              />
              <div
                className="absolute left-0 w-16 pr-2 text-right text-[11px] font-medium uppercase tracking-[0.18em] text-white/35"
                style={{ top }}
              >
                {formatHour(h)}
              </div>
            </Fragment>
          );
        })}

        {children}

        {showNowLine && (
          <>
            <div
              className="now-line absolute left-0 right-0"
              style={{ top: nowTop }}
            />
            <div
              className="absolute flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/80 shadow-[0_6px_18px_rgba(8,10,24,0.45)]"
              style={{ top: nowTop - 8, left: 4 }}
            >
              <Clock className="h-3 w-3" />
              <span>Now</span>
            </div>
            <div
              className="absolute right-0 pr-3 text-[11px] font-semibold text-white/80"
              style={{ top: nowTop - 8 }}
            >
              {formatTime(nowMinutes! + startHour * 60)}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function formatHour(h: number) {
  const normalized = h % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${hour12} ${suffix}`;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteStr = minutes.toString().padStart(2, "0");
  return `${hour12}:${minuteStr}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
