"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types/note";

export const skillNoteTileOuterClass =
  "group relative block h-full overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#050608]/85 p-[1px] shadow-[0_18px_36px_-28px_rgba(0,0,0,0.95),0_6px_18px_-14px_rgba(0,0,0,0.88)] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-[#080a0f]/90 hover:shadow-[0_22px_44px_-30px_rgba(0,0,0,0.98)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60";

export const skillNoteTileInnerClass =
  "relative flex h-full overflow-hidden rounded-[21px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(18,20,25,0.92),rgba(7,8,11,0.96))] px-3 py-2.5 text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color] duration-200 before:pointer-events-none before:absolute before:inset-[1px] before:rounded-[19px] before:border before:border-white/[0.04] before:content-[''] group-hover:border-white/[0.14]";

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
      className={skillNoteTileOuterClass}
    >
      <div
        className={cn(
          skillNoteTileInnerClass,
          "min-h-[4.5rem] items-center justify-center px-2.5 py-2 text-center"
        )}
      >
        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-[#f2f4f8] transition group-hover:text-white">
            {displayTitle}
          </p>
          {hasChildren ? (
            <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/50">
              {childCount} sub-page{childCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
