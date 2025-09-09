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

interface FocusTimelineProps {
  children?: ReactNode;
}

export function FocusTimeline({ children }: FocusTimelineProps) {
  const now = new Date();
  const startHour = now.getHours() + now.getMinutes() / 60;
  const endHour = startHour + 3;

  const enhancedChildren = Children.map(children, child => {
    if (!isValidElement(child)) return child;
    const existingStyle = child.props.style as CSSProperties | undefined;
    return cloneElement(child, {
      className: cn(child.props.className, "px-3 py-2"),
      style: { ...existingStyle, boxShadow: "var(--elev-overlay)" },
    });
  });

  return (
    <div className="-ml-4 -mr-2 sm:mx-0">
      <DayTimeline startHour={startHour} endHour={endHour} date={now}>
        {enhancedChildren}
      </DayTimeline>
    </div>
  );
}
