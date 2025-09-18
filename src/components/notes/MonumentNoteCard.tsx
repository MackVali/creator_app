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
      <Card className="group h-full rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] text-white shadow-[0_24px_70px_-40px_rgba(0,0,0,0.7)] transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_32px_90px_-45px_rgba(0,0,0,0.78)]">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Note</p>
            <h3 className="text-sm font-semibold text-white line-clamp-2">
              {note.title || "Untitled"}
            </h3>
          </div>
          <p className="flex-1 text-xs text-white/70 line-clamp-3">
            {note.content || "Open this note to add more detail."}
          </p>
          <span className="text-xs font-medium text-white/70 transition group-hover:text-white">
            Open note →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
