"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";

export const GEM_PURPLE = "#9966CC";

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  date?: Date;
  children?: ReactNode;
}

export function DayTimeline({
  startHour = 0,
  endHour = 24,
  pxPerMin = 2,
  date = new Date(),
  children,
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
        className="relative w-full pl-16 bg-black overflow-hidden"
        style={{ height: `${timelineHeight}px` }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-10"
          style={{
            background:
              "linear-gradient(90deg, rgba(63,63,70,1) 25%, rgba(39,39,42,1) 50%, rgba(63,63,70,1) 75%)",
            backgroundSize: "200% 100%",
            animation: "wave 8s linear infinite",
          }}
        />
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
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                top: nowTop - 10,
                height: 20,
                background: `linear-gradient(to bottom, rgba(153, 102, 204, 0) 0%, rgba(153, 102, 204, 0.4) 50%, rgba(153, 102, 204, 0) 100%)`,
              }}
            />
            <div
              className="absolute left-0 right-0"
              style={{
                top: nowTop,
                height: 2,
                backgroundColor: GEM_PURPLE,
                boxShadow: `0 0 8px ${GEM_PURPLE}`,
              }}
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
      <style jsx global>{`
        @keyframes wave {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 200% 0%;
          }
        }
      `}</style>
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
