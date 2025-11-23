"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types/note";
import {
  monumentNoteTileInnerClass,
  monumentNoteTileOuterClass,
} from "./MonumentNoteCard";

interface NoteCardProps {
  note: Note;
  skillId: string;
  childCount?: number;
}

export function NoteCard({ note, skillId, childCount = 0 }: NoteCardProps) {
  const noteTitle = note.title?.trim();
  const displayTitle =
    noteTitle && noteTitle.length > 0
      ? noteTitle
      : note.content
          ?.split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? "Open this note to add a title.";

  const hasChildren = childCount > 0;

  return (
    <Link
      href={`/skills/${skillId}/notes/${note.id}`}
      className={monumentNoteTileOuterClass}
    >
      <div
        className={cn(
          monumentNoteTileInnerClass,
          "items-center justify-center bg-white text-center"
        )}
      >
        <div className="flex flex-col items-center text-center">
          <p className="line-clamp-3 text-sm font-semibold leading-tight tracking-tight text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)] transition group-hover:text-slate-950">
            {displayTitle}
          </p>
          {hasChildren ? (
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              {childCount} sub-page{childCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
