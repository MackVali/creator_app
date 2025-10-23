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
      <Card className="h-full transition-colors hover:bg-gray-800">
        <CardContent className="space-y-2 p-4">
          <h3 className="truncate text-lg font-medium text-white">{displayTitle}</h3>
          {hasChildren ? (
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">
              {childCount} sub-page{childCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
