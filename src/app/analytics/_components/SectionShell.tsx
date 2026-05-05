"use client";

import { useState, type ReactNode } from "react";
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
      className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.3)] sm:p-5"
      id={id}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            onClick={toggleExpanded}
            className="mt-0.5 flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-1 text-zinc-400 transition-colors hover:text-white"
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
            <h2 className="text-base font-semibold text-white sm:text-lg">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:justify-end">
          <div className="flex flex-wrap items-center gap-2">{summary}</div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {actions}
            {onOpenDrilldown && (
              <button
                onClick={onOpenDrilldown}
                className="flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-400 transition-colors hover:text-white"
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
          isExpanded ? "mt-4 max-h-screen opacity-100 sm:mt-5" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
