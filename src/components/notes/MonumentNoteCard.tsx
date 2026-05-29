"use client";

import Link from "next/link";
import { Bookmark, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MonumentNote } from "@/lib/types/monument-note";

export const monumentNoteTileOuterClass =
  "group relative block h-full overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#050608] p-[1px] shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),0_8px_18px_-16px_rgba(0,0,0,0.9)] transition-all duration-200 hover:-translate-y-px hover:border-white/[0.11] hover:shadow-[0_22px_42px_-32px_rgba(0,0,0,0.98),0_10px_20px_-18px_rgba(0,0,0,0.92)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

export const monumentNoteTileInnerClass =
  "relative flex h-full min-h-[4.75rem] overflow-hidden rounded-[21px] border border-white/[0.08] bg-[#0B0C0F] px-3 py-2.5 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),inset_0_-18px_28px_rgba(0,0,0,0.24)] transition-[border-color,background-color] duration-200 before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[19px] before:border before:border-white/[0.035] before:content-[''] after:pointer-events-none after:absolute after:inset-x-4 after:top-0 after:h-px after:bg-white/[0.08] after:content-[''] group-hover:border-white/[0.12] group-hover:bg-[#101114]";

interface MonumentNoteCardProps {
  note: MonumentNote;
  monumentId: string;
  onToggleBookmark?: (noteId: string) => void;
}

export function MonumentNoteCard({ note, monumentId, onToggleBookmark }: MonumentNoteCardProps) {
  const titleLine =
    note.title?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open this note to add a title.";

  const preview =
    note.content?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open note";
  const dateLabel = note.updatedAt
    ? new Date(note.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  const icon = note.icon?.trim() || "📝";
  return (
    <Link
      href={`/monuments/${monumentId}/notes/${note.id}`}
      className={monumentNoteTileOuterClass}
    >
      <div className={cn(monumentNoteTileInnerClass, "items-center gap-2.5 sm:gap-3")}>
        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.09] bg-[#07080A] text-sm text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_8px_16px_-14px_rgba(0,0,0,0.9)]">
          {icon.length <= 2 ? icon : <FileText className="h-4 w-4" />}
        </div>
        <div className="relative z-10 min-w-0 flex-1 pr-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-white/90">
            {titleLine}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-white/55 sm:line-clamp-2">
            {preview}
          </p>
        </div>
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          <span className="hidden text-[10px] font-medium text-white/40 sm:inline">
            {dateLabel}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onToggleBookmark?.(note.id);
            }}
            className="rounded-full p-1 text-white/45 transition hover:bg-white/[0.06] hover:text-white/70"
            aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
          >
            <Bookmark
              className={cn(
                "h-3.5 w-3.5",
                note.isBookmarked ? "fill-white/75 text-white/75" : "text-current"
              )}
            />
          </button>
        </div>
      </div>
    </Link>
  );
}
