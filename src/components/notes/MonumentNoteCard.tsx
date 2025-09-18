"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { MonumentNote } from "@/lib/types/monument-note";

interface MonumentNoteCardProps {
  note: MonumentNote;
  monumentId: string;
}

export function MonumentNoteCard({ note, monumentId }: MonumentNoteCardProps) {
  return (
    <Link href={`/monuments/${monumentId}/notes/${note.id}`}>
      <Card className="h-full rounded-2xl border border-white/10 bg-white/5 transition hover:border-white/20 hover:bg-white/10">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-white/60">Note</p>
            <h3 className="text-base font-medium text-white line-clamp-2">
              {note.title || "Untitled"}
            </h3>
          </div>
          <p className="flex-1 text-sm text-white/70 line-clamp-3">
            {note.content || "Open this note to add more detail."}
          </p>
          <span className="text-xs font-medium text-white/60">Open note →</span>
        </CardContent>
      </Card>
    </Link>
  );
}
