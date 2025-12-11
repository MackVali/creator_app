"use client";

import {
  Fragment,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Clock } from "lucide-react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { cn } from "@/lib/utils";

export const TIMELINE_LABEL_COLUMN_FALLBACK = "clamp(3.5rem, 16vw, 5rem)";
export const TIMELINE_RIGHT_GUTTER_FALLBACK = "clamp(0.75rem, 5vw, 1.5rem)";
export const TIMELINE_GRID_LEFT_FALLBACK = `var(--timeline-label-column, ${TIMELINE_LABEL_COLUMN_FALLBACK})`;
export const TIMELINE_GRID_RIGHT_FALLBACK = `var(--timeline-right-gutter, ${TIMELINE_RIGHT_GUTTER_FALLBACK})`;
export const TIMELINE_CARD_LEFT_FALLBACK = `var(--timeline-grid-left, ${TIMELINE_GRID_LEFT_FALLBACK})`;
export const TIMELINE_CARD_RIGHT_FALLBACK = `max(calc(var(--timeline-right-gutter, ${TIMELINE_RIGHT_GUTTER_FALLBACK}) - 1rem), 0px)`;
const NOW_LINE_LAYER_Z_INDEX = 50000;

interface DayTimelineProps {
  startHour?: number;
  endHour?: number;
  pxPerMin?: number;
  date?: Date;
  children?: ReactNode;
  className?: string;
  zoomPxPerMin?: MotionValue<number>;
  style?: Record<string, string | number | MotionValue>;
}

export function DayTimeline({
  startHour = 0,
  endHour = 24,
  pxPerMin = 2,
  date = new Date(),
  children,
  className,
  zoomPxPerMin,
  style: externalStyle,
}: DayTimelineProps) {
  const totalMinutes = (endHour - startHour) * 60;
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);

  const fallbackZoom = useMotionValue(pxPerMin);
  useEffect(() => {
    fallbackZoom.set(pxPerMin);
  }, [fallbackZoom, pxPerMin]);
  const zoomMotion = zoomPxPerMin ?? fallbackZoom;

  const minuteUnit = useMotionTemplate`${zoomMotion}px`;
  const heightExpression = useMotionTemplate`calc(${totalMinutes} * ${zoomMotion}px)`;

  const quarterIntensity = useTransform(zoomMotion, value =>
    interpolateRange(value, 1.2, 1.55)
  );
  const quarterLabelIntensity = useTransform(zoomMotion, value =>
    interpolateRange(value, 1.45, 1.85)
  );
  const fiveMinuteIntensity = useTransform(zoomMotion, value =>
    interpolateRange(value, 2.2, 2.55)
  );
  const halfHourBoost = useTransform(zoomMotion, value =>
    interpolateRange(value, 1.65, 2)
  );

  const timelineVariables: Record<string, string | MotionValue> = {
    "--timeline-minute-unit": minuteUnit,
    "--quarter-intensity": quarterIntensity,
    "--quarter-label-intensity": quarterLabelIntensity,
    "--five-minute-intensity": fiveMinuteIntensity,
    "--half-hour-boost": halfHourBoost,
    "--timeline-label-column": TIMELINE_LABEL_COLUMN_FALLBACK,
    "--timeline-right-gutter": TIMELINE_RIGHT_GUTTER_FALLBACK,
    "--timeline-grid-left": TIMELINE_GRID_LEFT_FALLBACK,
    "--timeline-grid-right": TIMELINE_GRID_RIGHT_FALLBACK,
    "--timeline-card-left": TIMELINE_CARD_LEFT_FALLBACK,
    "--timeline-card-right": TIMELINE_CARD_RIGHT_FALLBACK,
  };

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
  const nowTop = minutesToStyle(nowMinutes ?? 0);

  const hours: number[] = [];
  for (let h = Math.ceil(startHour); h < endHour; h++) {
    hours.push(h);
  }

  const backgroundGradient = [
    "radial-gradient(140% 140% at 0% 0%, rgba(24, 24, 27, 0.65), rgba(24, 24, 27, 0) 60%)",
    "radial-gradient(120% 120% at 100% 100%, rgba(39, 39, 42, 0.5), rgba(39, 39, 42, 0) 62%)",
    "linear-gradient(180deg, rgba(10, 10, 10, 0.95), rgba(24, 24, 27, 0.85))",
  ].join(", ");

  const combinedStyle: Record<string, string | number | MotionValue> = {
    ...timelineVariables,
    paddingLeft: 0,
    paddingRight: `var(--timeline-right-gutter, ${TIMELINE_RIGHT_GUTTER_FALLBACK})`,
    height: heightExpression,
    background: backgroundGradient,
    ...externalStyle,
  };

  return (
    <motion.div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-[28px] border border-white/10",
        "shadow-[0_22px_48px_rgba(15,23,42,0.4)] backdrop-blur",
        className
      )}
      style={combinedStyle}
    >
      <motion.div
        className="timeline-content relative"
        style={{
          height: heightExpression,
        }}
      >
      {hours.map(h => {
        const minutesFromStart = (h - startHour) * 60;
        const top = minutesToStyle(minutesFromStart);
        return (
          <Fragment key={h}>
            <div
              className="pointer-events-none absolute border-t border-white/10"
              style={{
                top,
                left: `var(--timeline-grid-left, ${TIMELINE_GRID_LEFT_FALLBACK})`,
                right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
              }}
            />
            <div
              className="pointer-events-none absolute left-0 -translate-y-1/2 pr-4 text-right text-[11px] font-semibold uppercase tracking-[0.24em] text-white/50"
              style={{
                top,
                width: `var(--timeline-label-column, ${TIMELINE_LABEL_COLUMN_FALLBACK})`,
              }}
            >
              {formatHour(h)}
            </div>

            {[15, 30, 45].map(minute => {
              const minutesUntilHourEnd = (Math.min(endHour, h + 1) - h) * 60;
              if (minute >= minutesUntilHourEnd) return null;
              const minuteTop = minutesToStyle((h - startHour) * 60 + minute);
              const isHalfHour = minute === 30;
              const baseOpacity = isHalfHour ? 0.7 : 0.45;
              const labelBaseOpacity = isHalfHour ? 0.7 : 0.45;
              const markerOpacity = isHalfHour
                ? `calc(${baseOpacity} * var(--quarter-intensity) + 0.35 * var(--half-hour-boost))`
                : `calc(${baseOpacity} * var(--quarter-intensity))`;
              const labelOpacity = isHalfHour
                ? `calc(${labelBaseOpacity} * var(--quarter-label-intensity) + 0.35 * var(--half-hour-boost))`
                : `calc(${labelBaseOpacity} * var(--quarter-label-intensity))`;
              return (
                <Fragment key={`quarter-${h}-${minute}`}>
                  <div
                    className="pointer-events-none absolute border-t border-white/10"
                    style={{
                      top: minuteTop,
                      left: `var(--timeline-grid-left, ${TIMELINE_GRID_LEFT_FALLBACK})`,
                      right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
                      opacity: markerOpacity,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute -translate-y-1/2 text-[10px] font-medium tracking-[0.08em] text-white"
                    style={{
                      top: minuteTop,
                      right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
                      opacity: labelOpacity,
                    }}
                  >
                    {formatTime(h * 60 + minute)}
                  </div>
                </Fragment>
              );
            })}

            {Array.from({ length: 11 }, (_, index) => (index + 1) * 5)
              .filter(minute => minute % 15 !== 0)
              .map(minute => {
                const minutesUntilHourEnd = (Math.min(endHour, h + 1) - h) * 60;
                if (minute >= minutesUntilHourEnd) return null;
                const minuteTop = minutesToStyle((h - startHour) * 60 + minute);
                const fiveMinuteOpacity = `calc(0.25 * var(--five-minute-intensity))`;
                return (
                  <div
                    key={`fivemin-${h}-${minute}`}
                    className="pointer-events-none absolute border-t border-white/10"
                    style={{
                      top: minuteTop,
                      left: `var(--timeline-grid-left, ${TIMELINE_GRID_LEFT_FALLBACK})`,
                      right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
                      opacity: fiveMinuteOpacity,
                    }}
                  />
                );
              })}
          </Fragment>
        );
      })}

      {children}

      {showNowLine && (
        <>
            <div
              className="now-line pointer-events-none absolute mix-blend-screen"
              style={{
                top: nowTop,
                left: `var(--timeline-grid-left, ${TIMELINE_GRID_LEFT_FALLBACK})`,
                right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
                zIndex: NOW_LINE_LAYER_Z_INDEX,
              }}
            />
            <div
              className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-1 rounded-full bg-white/85 px-2 py-[3px] text-[11px] font-semibold text-slate-800 shadow-sm"
              style={{
                top: nowTop,
                left: `var(--timeline-card-left, ${TIMELINE_CARD_LEFT_FALLBACK})`,
                zIndex: NOW_LINE_LAYER_Z_INDEX,
              }}
            >
              <Clock className="h-3 w-3 text-slate-700" />
              <span>Now</span>
            </div>
            <div
              className="pointer-events-none absolute -translate-y-1/2 text-[11px] font-medium tracking-[0.08em] text-white/80"
              style={{
                top: nowTop,
                right: `var(--timeline-grid-right, ${TIMELINE_GRID_RIGHT_FALLBACK})`,
                zIndex: NOW_LINE_LAYER_Z_INDEX,
              }}
            >
              {formatTime((nowMinutes ?? 0) + startHour * 60)}
            </div>
        </>
      )}
      </motion.div>
    </motion.div>
  );
}

function interpolateRange(value: number, start: number, end: number) {
  if (!Number.isFinite(value)) return 0;
  if (Number.isNaN(start) || Number.isNaN(end) || start === end) {
    return value >= end ? 1 : 0;
  }
  const raw = (value - start) / (end - start);
  const clamped = Math.min(Math.max(raw, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function minutesToStyle(minutes: number) {
  if (!Number.isFinite(minutes)) return "0px";
  const safe = Math.max(0, minutes);
  return `calc(var(--timeline-minute-unit) * ${safe})`;
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
