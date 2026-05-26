"use client";

import Link from "next/link";
import { Bookmark, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MonumentNote } from "@/lib/types/monument-note";

export const monumentNoteTileOuterClass =
  "group relative block h-full overflow-hidden rounded-[23px] border border-[#08090c] bg-gradient-to-b from-[#1a1b1f] via-[#111216] to-[#07080b] p-[3px] shadow-[0_20px_38px_-28px_rgba(0,0,0,0.95),0_7px_14px_rgba(0,0,0,0.52)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_50px_-28px_rgba(0,0,0,0.98),0_10px_18px_rgba(0,0,0,0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[20px] after:border after:border-white/5";

export const monumentNoteTileInnerClass =
  "relative flex h-full min-h-[4.75rem] overflow-hidden rounded-[20px] border border-white/12 bg-[linear-gradient(120deg,#5f636c_0%,#484d56_42%,#3c414a_76%,#343943_100%)] px-3 py-2.5 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-10px_18px_rgba(19,22,28,0.32)] transition-[border-color,transform] duration-200 before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[17px] before:border before:border-white/10 before:opacity-80 before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_36%)] after:opacity-65 group-hover:border-white/20";

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
        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(22,24,30,0.45))] text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_14px_-10px_rgba(0,0,0,0.8)]">
          {icon.length <= 2 ? icon : <FileText className="h-4 w-4" />}
        </div>
        <div className="relative z-10 min-w-0 flex-1 pr-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-[#f2f4f8]">
            {titleLine}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[#d5d9e1] sm:line-clamp-2">
            {preview}
          </p>
        </div>
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          <span className="hidden text-[10px] font-medium text-[#c4c9d3] sm:inline">
            {dateLabel}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onToggleBookmark?.(note.id);
            }}
            className="rounded-full p-1 hover:bg-white/12"
            aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
          >
            <Bookmark
              className={cn(
                "h-3.5 w-3.5",
                note.isBookmarked ? "fill-[#eef1f8] text-[#eef1f8]" : "text-[#c5cad4]"
              )}
            />
          </button>
        </div>
      </div>
    </Link>
  );
}
