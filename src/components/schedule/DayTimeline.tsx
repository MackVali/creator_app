"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import {
  getZonedDateTimeParts,
  zonedTimeToUtc,
  type ZonedDateTimeParts,
} from "@/lib/time/tz";

const MINUTES_IN_DAY = 24 * 60;

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  timeZone: string;
  dayKey?: string | null;
  children?: ReactNode;
}

export function DayTimeline({
  startHour = 0,
  endHour = 24,
  pxPerMin = 2,
  timeZone,
  dayKey,
  children,
}: DayTimelineProps) {
  const totalMinutes = Math.max(0, (endHour - startHour) * 60);
  const visibleMinutes = Math.min(totalMinutes, MINUTES_IN_DAY);
  const timelineHeight = totalMinutes * pxPerMin;
  const [nowInfo, setNowInfo] = useState<{
    minutesFromStart: number;
    parts: ZonedDateTimeParts;
  } | null>(null);

  const baseUtcDate = useMemo(() => {
    const parsed = parseDayKey(dayKey);
    if (parsed) {
      return zonedTimeToUtc(parsed, timeZone);
    }
    const today = getZonedDateTimeParts(new Date(), timeZone);
    return zonedTimeToUtc(
      { year: today.year, month: today.month, day: today.day },
      timeZone
    );
  }, [dayKey, timeZone]);

  useEffect(() => {
    if (!dayKey || visibleMinutes <= 0) {
      setNowInfo(null);
      return;
    }

    function update() {
      const nowParts = getZonedDateTimeParts(new Date(), timeZone);
      if (nowParts.dayKey !== dayKey) {
        setNowInfo(null);
        return;
      }
      const minutes =
        nowParts.hour * 60 +
        nowParts.minute +
        nowParts.second / 60 +
        nowParts.millisecond / 60000;
      const minutesFromStart = minutes - startHour * 60;
      if (minutesFromStart < 0 || minutesFromStart > visibleMinutes) {
        setNowInfo(null);
        return;
      }
      setNowInfo({ minutesFromStart, parts: nowParts });
    }

    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [dayKey, timeZone, startHour, visibleMinutes]);

  const hourMarkers = useMemo(() => {
    const markers: Array<{ hour: number; top: number; label: string }> = [];
    const baseTime = baseUtcDate.getTime();
    for (let hour = Math.ceil(startHour); hour < endHour; hour++) {
      const absoluteMinutes = hour * 60;
      if (absoluteMinutes < 0 || absoluteMinutes > MINUTES_IN_DAY) continue;
      const top = (hour - startHour) * 60 * pxPerMin;
      const date = new Date(baseTime + hour * 60 * 60_000);
      const parts = getZonedDateTimeParts(date, timeZone);
      markers.push({ hour, top, label: formatHourLabel(parts) });
    }
    return markers;
  }, [baseUtcDate, startHour, endHour, pxPerMin, timeZone]);

  const showNowLine = nowInfo !== null;
  const nowTop = (nowInfo?.minutesFromStart ?? 0) * pxPerMin;
  const nowLabel = nowInfo ? formatClockLabel(nowInfo.parts) : "";

  return (
    <>
      <div
        className="relative w-full pl-16 bg-black overflow-hidden"
        style={{ height: `${timelineHeight}px` }}
      >
        {hourMarkers.map(({ hour, top, label }) => (
          <Fragment key={hour}>
            <div
              className="pointer-events-none absolute left-16 right-0 border-t border-zinc-800"
              style={{ top }}
            />
            <div
              className="absolute left-0 w-16 pr-2 text-right text-xs text-zinc-500"
              style={{ top }}
            >
              {label}
            </div>
          </Fragment>
        ))}

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
              {nowLabel}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function parseDayKey(key: string | null | undefined) {
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return { year: y, month: m, day: d };
}

function formatHourLabel(parts: ZonedDateTimeParts) {
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${hour12} ${suffix}`;
}

function formatClockLabel(parts: ZonedDateTimeParts) {
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const minuteStr = parts.minute.toString().padStart(2, "0");
  return `${hour12}:${minuteStr}`;
}
