"use client";

import { Filter, Grid2x2, Grid3x3, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type NoteCardDensity = "large" | "small";

interface NotesHeaderControlsProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  density?: NoteCardDensity;
  onDensityToggle?: () => void;
}

export function NotesHeaderControls({
  searchQuery,
  onSearchChange,
  density,
  onDensityToggle,
}: NotesHeaderControlsProps) {
  const isSmallDensity = density === "small";
  const showDensityToggle = Boolean(density && onDensityToggle);

  return (
    <header className="flex min-w-0 items-center justify-between gap-2.5">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/60">
        Notes
      </p>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <label
          className={cn(
            "flex h-[1.875rem] min-w-0 w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition focus-within:border-white/20 focus-within:bg-white/[0.055]",
            showDensityToggle ? "max-w-[8.25rem] sm:max-w-[9.75rem]" : "max-w-[9.75rem]"
          )}
        >
          <Search className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="sr-only">Search notes</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-white/85 outline-none placeholder:text-slate-500"
          />
        </label>
        <button
          type="button"
          className="flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-white/20 hover:bg-white/[0.065]"
          aria-label="Filter notes"
        >
          <Filter className="h-3 w-3 text-slate-400" />
        </button>
        {showDensityToggle ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.035] text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
              isSmallDensity
                ? "text-zinc-300 shadow-[0_0_16px_-8px_rgba(255,255,255,0.72)]"
                : ""
            )}
            aria-label={isSmallDensity ? "Use large cards" : "Use small cards"}
            aria-pressed={isSmallDensity}
            onClick={onDensityToggle}
          >
            {isSmallDensity ? (
              <Grid2x2 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            ) : (
              <Grid3x3 className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
            )}
          </button>
        ) : null}
      </div>
    </header>
  );
}
