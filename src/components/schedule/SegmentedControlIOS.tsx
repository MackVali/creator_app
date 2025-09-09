"use client";

import { useRef, KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SegmentedControlIOSProps {
  segments: string[];
  value: number;
  onChange(index: number): void;
  className?: string;
}

export function SegmentedControlIOS({
  segments,
  value,
  onChange,
  className,
}: SegmentedControlIOSProps) {
  const prefersReducedMotion = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (value + 1) % segments.length;
      onChange(next);
      refs.current[next]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (value - 1 + segments.length) % segments.length;
      onChange(prev);
      refs.current[prev]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex h-11 items-center rounded-full bg-white/10 p-0.5", // container styles
        className
      )}
    >
      {segments.map((label, i) => (
        <button
          key={label}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="tab"
          aria-selected={value === i}
          tabIndex={value === i ? 0 : -1}
          className="relative flex-1 h-full min-w-11 rounded-full text-sm font-medium outline-none"
          onClick={() => onChange(i)}
        >
          {value === i && (
            <motion.div
              layoutId="thumb"
              className="absolute inset-0 rounded-full bg-white"
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 500, damping: 30 }
              }
            />
          )}
          <span className="relative z-10 block px-3 text-center leading-[44px] select-none">
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default SegmentedControlIOS;

