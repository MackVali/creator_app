"use client";

import Link from "next/link";
import { Bookmark, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MonumentNote } from "@/lib/types/monument-note";

export const monumentNoteTileOuterClass =
  "group relative block h-full rounded-[20px] border border-black/60 bg-gradient-to-b from-[#1b1b1f] via-[#0f0f12] to-[#040404] p-2 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95),0_18px_38px_-30px_rgba(0,0,0,0.85)] transition-transform duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 before:pointer-events-none before:absolute before:inset-[2px] before:rounded-[17px] before:bg-gradient-to-b before:from-white/8 before:via-transparent before:to-black/30 before:opacity-60 before:mix-blend-screen after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[18px] after:border after:border-white/5";

export const monumentNoteTileInnerClass =
  "relative flex h-full min-h-[4.5rem] overflow-hidden rounded-[14px] border border-white/10 bg-gradient-to-r from-[#272a2f] via-[#1f2227] to-[#17191e] px-3 py-2.5 text-slate-50 shadow-[0_14px_24px_-20px_rgba(0,0,0,0.9),inset_0_1px_5px_rgba(255,255,255,0.08)] transition-[border-color,transform] duration-200 before:pointer-events-none before:absolute before:-inset-[1px] before:rounded-[14px] before:bg-gradient-to-r before:from-white/10 before:via-transparent before:to-transparent before:opacity-50 group-hover:border-white/20 group-hover:before:opacity-70";

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
      <div className={cn(monumentNoteTileInnerClass, "items-center gap-3")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-sm text-white">
          {icon.length <= 2 ? icon : <FileText className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{titleLine}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-300">{preview}</p>
        </div>
        <div className="flex items-center gap-2 pl-2">
          <span className="text-[11px] text-slate-400">{dateLabel}</span>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onToggleBookmark?.(note.id);
            }}
            className="rounded-full p-1 hover:bg-white/10"
            aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
          >
            <Bookmark
              className={cn(
                "h-4 w-4",
                note.isBookmarked ? "fill-white text-white" : "text-slate-400"
              )}
            />
          </button>
        </div>
      </div>
    </Link>
  );
}
