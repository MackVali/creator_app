"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { DateTime } from "luxon";

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  date?: Date;
  timeZone: string;
  children?: ReactNode;
}

export function DayTimeline({
  startHour = 0,
  endHour = 24,
  pxPerMin = 2,
  date = new Date(),
  timeZone,
  children,
}: DayTimelineProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const timelineHeight = totalMinutes * pxPerMin;
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  useEffect(() => {
    function update() {
      const zonedNow = DateTime.now().setZone(timeZone);
      const targetDay = DateTime.fromObject(
        {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
        },
        { zone: timeZone }
      );

      if (!zonedNow.isValid || !targetDay.isValid) {
        setNowMinutes(null);
        return;
      }

      if (!zonedNow.hasSame(targetDay, "day")) {
        setNowMinutes(null);
        return;
      }

      const minutes = zonedNow.hour * 60 + zonedNow.minute;
      setNowMinutes(minutes - startHour * 60);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [startHour, date, timeZone]);

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
        className="relative w-full pl-16 bg-black overflow-hidden"
        style={{ height: `${timelineHeight}px` }}
      >
        {hours.map(h => {
          const top = (h - startHour) * 60 * pxPerMin
          return (
            <Fragment key={h}>
              <div
                className="pointer-events-none absolute left-16 right-0 border-t border-zinc-800"
                style={{ top }}
              />
              <div
                className="absolute left-0 w-16 pr-2 text-right text-xs text-zinc-500"
                style={{ top }}
              >
                {formatHour(h)}
              </div>
            </Fragment>
          )
        })}

        {children}

        {showNowLine && (
          <>
            <div
              className="now-line absolute left-0 right-0"
              style={{ top: nowTop }}
            />
            <div
              className="absolute flex items-center gap-1 text-xs text-white"
              style={{ top: nowTop - 8, left: 4 }}
            >
              <Clock className="h-3 w-3" />
              <span>Now</span>
            </div>
            <div
              className="absolute right-0 text-xs text-white pr-2"
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
