"use client";

import Link from "next/link";
import { Filter, Plus, Search } from "lucide-react";

interface NotesHeaderControlsProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  addHref?: string;
}

export function NotesHeaderControls({
  searchQuery,
  onSearchChange,
  addHref,
}: NotesHeaderControlsProps) {
  return (
    <header className="flex min-w-0 items-center justify-between gap-2.5">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/60">
        Notes
      </p>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <label
          className="flex h-[1.875rem] min-w-0 w-full max-w-[9.75rem] items-center gap-1 rounded-full border border-white/10 bg-white/[0.035] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition focus-within:border-white/20 focus-within:bg-white/[0.055]"
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

        {addHref ? (
          <Link
            href={addHref}
            aria-label="Add note"
            className="inline-flex h-7 w-7 items-center justify-center text-white/55 transition hover:text-white focus-visible:outline-none active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        ) : null}
      </div>
    </header>
  );
}
