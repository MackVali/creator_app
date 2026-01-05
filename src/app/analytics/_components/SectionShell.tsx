"use client";

import { useState, ReactNode, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

interface SectionShellProps {
  id: string;
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  summary: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  onOpenDrilldown?: () => void;
}

export function SectionShell({
  id,
  title,
  subtitle,
  defaultExpanded = false,
  summary,
  actions,
  children,
  onOpenDrilldown,
}: SectionShellProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950/80 to-black/60 p-6 shadow-[0_30px_80px_rgba(7,10,16,0.55)]"
      id={id}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={toggleExpanded}
            className="mt-1 flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-1 text-zinc-400 hover:text-white transition-colors"
            aria-expanded={isExpanded}
            aria-controls={`${id}-content`}
            aria-label={`${
              isExpanded ? "Collapse" : "Expand"
            } ${title} section`}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {summary}
          <div className="flex items-center gap-2">
            {actions}
            {onOpenDrilldown && (
              <button
                onClick={onOpenDrilldown}
                className="flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 hover:text-white transition-colors"
                aria-label={`Open details for ${title}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        id={`${id}-content`}
        className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? "mt-6 max-h-screen opacity-100" : "max-h-0 opacity-0"
        }`}
        style={{
          ...(typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? { transition: "none" }
            : {}),
        }}
      >
        {children}
      </div>
    </section>
  );
}
