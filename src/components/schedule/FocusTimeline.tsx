"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  type ReactNode,
  type CSSProperties,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Fab } from "@/components/ui/Fab";
import { cn } from "@/lib/utils";
import { DayTimeline } from "./DayTimeline";

interface FocusTimelineProps {
  children?: ReactNode;
}

export function FocusTimelineFab() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return createPortal(
    <Fab
      data-testid="focus-timeline-fab"
      className="fixed bottom-6 right-6 z-[2147483647] sm:bottom-8 sm:right-8"
      menuVariant="timeline"
      swipeUpToOpen={false}
    />,
    document.body
  );
}

export function FocusTimeline({ children }: FocusTimelineProps) {
  const now = new Date();
  const startHour = now.getHours() + now.getMinutes() / 60;
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
    <div className="relative -ml-4 -mr-2 sm:mx-0">
      <DayTimeline startHour={startHour} endHour={endHour} date={now}>
        {enhancedChildren}
      </DayTimeline>
      <FocusTimelineFab />
    </div>
  );
}
