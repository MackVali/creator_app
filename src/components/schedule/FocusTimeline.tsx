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
import { toLocal, getResolvedTimeZone } from "@/lib/time/tz";

interface FocusTimelineProps {
  children?: ReactNode;
  timeZone?: string | null;
}

export function FocusTimeline({ children, timeZone }: FocusTimelineProps) {
  const resolvedZone = useMemo(
    () => timeZone ?? getResolvedTimeZone(),
    [timeZone]
  );
  const now = new Date();
  const localNow = useMemo(
    () => toLocal(now.toISOString(), resolvedZone),
    [now, resolvedZone]
  );
  const startHour = localNow.getHours() + localNow.getMinutes() / 60;
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
        date={now}
        timeZone={resolvedZone}
      >
        {enhancedChildren}
      </DayTimeline>
    </div>
  );
}
