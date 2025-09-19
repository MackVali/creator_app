"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useMemo,
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
  const nowParts = useMemo(() => getZonedDateTimeParts(new Date(), timeZone), [timeZone]);
  const nowHours =
    nowParts.hour +
    nowParts.minute / 60 +
    nowParts.second / 3600 +
    nowParts.millisecond / 3_600_000;
  const startHour = dayKey && nowParts.dayKey === dayKey ? nowHours : 9;
  const endHour = startHour + 3;

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
