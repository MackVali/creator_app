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
      <Card className="group relative h-full overflow-hidden rounded-2xl border border-white/70 bg-white/75 text-slate-900 shadow-[0_22px_48px_-28px_rgba(148,163,184,0.55)] backdrop-blur-xl transition hover:-translate-y-[3px] hover:border-white">
        <CardContent className="p-3">
          <p className="line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-800 transition group-hover:text-slate-900">
            {primaryLine}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
