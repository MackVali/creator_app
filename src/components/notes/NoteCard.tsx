"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Note } from "@/lib/types/note";

interface NoteCardProps {
  note: Note;
  skillId: string;
  childCount?: number;
}

export function NoteCard({ note, skillId, childCount = 0 }: NoteCardProps) {
  const displayTitle =
    note.title?.trim() ||
    note.content
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ||
    "Untitled";

  const hasChildren = childCount > 0;

  return (
    <Link href={`/skills/${skillId}/notes/${note.id}`}>
      <Card className="h-full rounded-3xl border border-white/70 bg-white/80 text-slate-900 shadow-[0_24px_56px_-30px_rgba(148,163,184,0.55)] backdrop-blur-xl transition hover:-translate-y-[2px] hover:border-white">
        <CardContent className="space-y-1.5 px-4 py-[0.85rem]">
          <h3
            className="whitespace-normal break-words text-[11px] font-semibold leading-snug text-slate-900 sm:text-xs"
          >
            {displayTitle}
          </h3>
          {hasChildren ? (
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
              {childCount} sub-page{childCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
