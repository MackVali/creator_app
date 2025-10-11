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

  const showQuarterHourMarkers = pxPerMin >= 1.4;
  const showQuarterHourLabels = pxPerMin >= 1.8;
  const showFiveMinuteMarkers = pxPerMin >= 2.4;

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

  const backgroundGradient = [
    "radial-gradient(140% 140% at 0% 0%, rgba(24, 24, 27, 0.65), rgba(24, 24, 27, 0) 60%)",
    "radial-gradient(120% 120% at 100% 100%, rgba(39, 39, 42, 0.5), rgba(39, 39, 42, 0) 62%)",
    "linear-gradient(180deg, rgba(10, 10, 10, 0.95), rgba(24, 24, 27, 0.85))",
  ].join(", ");

  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-[28px] border border-white/10 pl-20 pr-6",
        "shadow-[0_22px_48px_rgba(15,23,42,0.4)] backdrop-blur",
        className
      )}
      style={{ height: timelineHeight, background: backgroundGradient }}
    >
      {hours.map(h => {
        const top = (h - startHour) * 60 * pxPerMin;
        return (
          <Fragment key={h}>
            <div
              className="pointer-events-none absolute left-20 right-6 border-t border-white/10"
              style={{ top }}
            />
            <div
              className="pointer-events-none absolute left-0 w-20 -translate-y-1/2 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50"
              style={{ top }}
            >
              {formatHour(h)}
            </div>

            {showQuarterHourMarkers && [15, 30, 45].map(minute => {
              const minutesUntilHourEnd = (Math.min(endHour, h + 1) - h) * 60;
              if (minute >= minutesUntilHourEnd) return null;
              const minuteTop = ((h - startHour) * 60 + minute) * pxPerMin;
              const isHalfHour = minute === 30;
              return (
                <Fragment key={`quarter-${h}-${minute}`}>
                  <div
                    className={cn(
                      "pointer-events-none absolute left-20 right-6 border-t border-white/10",
                      isHalfHour ? "opacity-60" : "opacity-45"
                    )}
                    style={{ top: minuteTop }}
                  />
                  {showQuarterHourLabels && (
                    <div
                      className={cn(
                        "pointer-events-none absolute right-6 -translate-y-1/2 text-[10px] font-medium tracking-[0.08em]",
                        isHalfHour ? "text-white/60" : "text-white/45"
                      )}
                      style={{ top: minuteTop }}
                    >
                      {formatTime(h * 60 + minute)}
                    </div>
                  )}
                </Fragment>
              );
            })}

            {showFiveMinuteMarkers &&
              Array.from({ length: 11 }, (_, index) => (index + 1) * 5)
                .filter(minute => minute % 15 !== 0)
                .map(minute => {
                  const minutesUntilHourEnd = (Math.min(endHour, h + 1) - h) * 60;
                  if (minute >= minutesUntilHourEnd) return null;
                  const minuteTop = ((h - startHour) * 60 + minute) * pxPerMin;
                  return (
                    <div
                      key={`fivemin-${h}-${minute}`}
                      className="pointer-events-none absolute left-20 right-6 border-t border-white/10 opacity-25"
                      style={{ top: minuteTop }}
                    />
                  );
                })}
          </Fragment>
        );
      })}

      {children}

      {showNowLine && (
        <>
          <div className="now-line absolute left-20 right-6" style={{ top: nowTop }} />
          <div
            className="absolute left-6 flex -translate-y-1/2 items-center gap-1 rounded-full bg-white/85 px-2 py-[3px] text-[11px] font-semibold text-slate-800 shadow-sm"
            style={{ top: nowTop }}
          >
            <Clock className="h-3 w-3 text-slate-700" />
            <span>Now</span>
          </div>
          <div
            className="absolute right-6 -translate-y-1/2 text-[11px] font-medium tracking-[0.08em] text-white/80"
            style={{ top: nowTop }}
          >
            {formatTime((nowMinutes ?? 0) + startHour * 60)}
          </div>
        </>
      )}
    </div>
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
