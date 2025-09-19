"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/utils";
import { DayTimeline } from "./DayTimeline";
import { getZonedDateTimeParts } from "@/lib/time/tz";

interface FocusTimelineProps {
  timeZone: string;
  dayKey?: string | null;
  children?: ReactNode;
}

export function FocusTimeline({ timeZone, dayKey, children }: FocusTimelineProps) {
  const nowParts = getZonedDateTimeParts(new Date(), timeZone);
  const nowMinutes =
    nowParts.hour * 60 +
    nowParts.minute +
    nowParts.second / 60 +
    nowParts.millisecond / 60000;
  const focusWindowMinutes = 3 * 60;
  const isCurrentDay = !dayKey || nowParts.dayKey === dayKey;
  const rawStartMinutes = isCurrentDay ? nowMinutes : 9 * 60;
  const clampedStartMinutes = Math.min(
    Math.max(rawStartMinutes, 0),
    24 * 60 - focusWindowMinutes
  );
  const startHour = clampedStartMinutes / 60;
  const endHour = (clampedStartMinutes + focusWindowMinutes) / 60;

  const enhancedChildren = Children.map(children, child => {
    if (!isValidElement(child)) return child;
    const props = child.props as { className?: string; style?: CSSProperties };
    return cloneElement(
      child as React.ReactElement<{ className?: string; style?: CSSProperties }>,
      {
        className: cn(props.className, "px-3 py-2"),
        style: { ...props.style, boxShadow: "var(--elev-overlay)" },
      }
    );
  });

  return (
    <div className="-ml-4 -mr-2 sm:mx-0">
      <DayTimeline
        startHour={startHour}
        endHour={endHour}
        timeZone={timeZone}
        dayKey={dayKey}
      >
        {enhancedChildren}
      </DayTimeline>
    </div>
  );
}
