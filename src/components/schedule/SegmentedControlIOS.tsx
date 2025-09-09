"use client";

import { useRef } from "react";
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div role="tablist" className="flex rounded-md bg-zinc-900 p-1">
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
            "flex-1 rounded-md px-2 py-1 text-xs",
            value === i ? "bg-zinc-800 text-white" : "text-zinc-400"
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
