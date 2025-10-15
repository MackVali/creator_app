"use client";

import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { MonumentNote } from "@/lib/types/monument-note";

interface MonumentNoteCardProps {
  note: MonumentNote;
  monumentId: string;
}

export function MonumentNoteCard({ note, monumentId }: MonumentNoteCardProps) {
  const primaryLine =
    note.content?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    note.title?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open this note to add more detail.";

  return (
    <Link href={`/monuments/${monumentId}/notes/${note.id}`}>
      <Card className="group relative h-full overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-white/25 via-white/15 to-white/10 text-white/90 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl transition hover:-translate-y-[2px] hover:border-white/40 hover:text-white">
        <CardContent className="p-3">
          <p className="text-[11px] font-medium leading-relaxed text-white/80 transition group-hover:text-white line-clamp-2">
            {primaryLine}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
