"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface SegmentedControlIOSProps {
  /** labels for each segment */
  segments: string[];
  /** index of the active segment */
  value: number;
  /** callback when a segment is selected */
  onChange?: (index: number) => void;
}

export function SegmentedControlIOS({
  segments,
  value,
  onChange,
}: SegmentedControlIOSProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorRect, setIndicatorRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const segmentsKey = segments.join("|");

  useLayoutEffect(() => {
    const updateRect = () => {
      const container = containerRef.current;
      const activeButton = refs.current[value];

      if (!container || !activeButton) {
        setIndicatorRect(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      setIndicatorRect({
        left: buttonRect.left - containerRect.left,
        top: buttonRect.top - containerRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
      });
    };

    updateRect();
    window.addEventListener("resize", updateRect);

    return () => {
      window.removeEventListener("resize", updateRect);
    };
  }, [value, segmentsKey]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className="relative flex overflow-hidden rounded-md bg-zinc-900 p-1"
    >
      {indicatorRect ? (
        <motion.div
          aria-hidden
          className="absolute rounded-md bg-zinc-800 pointer-events-none"
          initial={false}
          animate={{
            x: indicatorRect.left,
            y: indicatorRect.top,
            width: indicatorRect.width,
            height: indicatorRect.height,
          }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 360, damping: 32 }
          }
          style={{
            left: 0,
            top: 0,
            zIndex: 0,
            width: indicatorRect.width,
            height: indicatorRect.height,
          }}
        />
      ) : null}
      {segments.map((label, i) => (
        <button
          key={label}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={value === i}
          className={cn(
            "relative z-10 flex-1 rounded-md px-2 py-1 text-xs transition-colors",
            value === i ? "text-white" : "text-zinc-400"
          )}
          onClick={() => onChange?.(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default SegmentedControlIOS;
