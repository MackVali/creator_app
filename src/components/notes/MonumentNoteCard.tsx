"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import type { MonumentNote } from "@/lib/types/monument-note";

export const monumentNoteTileOuterClass =
  "group relative block h-full rounded-[20px] border border-black/60 bg-gradient-to-b from-[#1b1b1f] via-[#0f0f12] to-[#040404] p-2 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.95),0_18px_38px_-30px_rgba(0,0,0,0.85)] transition-transform duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 before:pointer-events-none before:absolute before:inset-[2px] before:rounded-[17px] before:bg-gradient-to-b before:from-white/8 before:via-transparent before:to-black/30 before:opacity-60 before:mix-blend-screen after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[18px] after:border after:border-white/5";

export const monumentNoteTileInnerClass =
  "relative flex h-full min-h-[5rem] overflow-hidden rounded-[14px] border border-[#0d0d0f]/20 bg-gradient-to-b from-white via-white to-[#f5f5f8] px-3 py-3 text-slate-900 shadow-[0_18px_28px_rgba(15,23,42,0.18),inset_0_2px_6px_rgba(255,255,255,0.8)] transition-[border-color,transform] duration-200 before:pointer-events-none before:absolute before:-inset-[1px] before:rounded-[14px] before:bg-gradient-to-r before:from-white/55 before:via-transparent before:to-transparent before:opacity-60 group-hover:border-[#0d0d0f]/60 group-hover:before:opacity-90";

interface MonumentNoteCardProps {
  note: MonumentNote;
  monumentId: string;
}

export function MonumentNoteCard({ note, monumentId }: MonumentNoteCardProps) {
  const titleLine =
    note.title?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open this note to add a title.";

  return (
    <Link
      href={`/monuments/${monumentId}/notes/${note.id}`}
      className={monumentNoteTileOuterClass}
    >
      <div
        className={cn(
          monumentNoteTileInnerClass,
          "items-center justify-center bg-white text-center"
        )}
      >
        <p className="line-clamp-3 text-sm font-semibold leading-tight tracking-tight text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)] transition group-hover:text-slate-950">
          {titleLine}
        </p>
      </div>
    </Link>
  );
}
