"use client";

import { useState } from "react";
import { Info, Zap } from "lucide-react";
import type { Insight } from "@/lib/analytics/types";

interface InsightChipProps extends Insight {
  onAction?: () => void;
}

export function InsightChip({ text, action, why, onAction }: InsightChipProps) {
  const [showPopover, setShowPopover] = useState(false);

  const handleAction = () => {
    onAction?.();
    // In a real implementation, this would trigger the action
    console.log("Action triggered:", action);
  };

  return (
    <div className="relative inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-sm text-zinc-200">
      <span className="flex-1">{text}</span>

      <button
        onClick={() => setShowPopover(!showPopover)}
        className="flex items-center justify-center rounded-full p-1 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600"
        aria-label="More info"
      >
        <Info className="h-3 w-3" />
      </button>

      <button
        onClick={handleAction}
        className="flex items-center gap-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-600"
        aria-label="Do it"
      >
        <Zap className="h-3 w-3" />
        Do it
      </button>

      {showPopover && why && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300 shadow-lg">
          <div className="font-medium text-zinc-100">Why this insight?</div>
          <div className="mt-1">{why}</div>
          <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-zinc-700 bg-zinc-900" />
        </div>
      )}
    </div>
  );
}
