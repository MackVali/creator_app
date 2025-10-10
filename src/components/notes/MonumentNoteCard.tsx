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
      <Card className="group h-full rounded-2xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] text-white shadow-[0_18px_60px_-36px_rgba(0,0,0,0.7)] transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_26px_70px_-40px_rgba(0,0,0,0.78)]">
        <CardContent className="flex h-full flex-col gap-2 p-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/50">Note</p>
            <h3 className="text-xs font-semibold text-white line-clamp-2">
              {note.title || "Untitled"}
            </h3>
          </div>
          <p className="flex-1 text-[11px] leading-relaxed text-white/70 line-clamp-4">
            {note.content || "Open this note to add more detail."}
          </p>
          <span className="text-[11px] font-medium text-white/70 transition group-hover:text-white">
            Open note →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
