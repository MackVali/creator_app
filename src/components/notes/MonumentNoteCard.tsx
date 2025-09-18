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
    <Link
      href={`/monuments/${monumentId}/notes/${note.id}`}
      className="block h-full"
      aria-label={`Open note ${note.title || "Untitled"}`}
    >
      <Card className="h-full overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,#080808_0%,#141414_55%,#1d1d1d_100%)] transition-all hover:-translate-y-0.5 hover:border-white/20 hover:brightness-110">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <h3 className="text-base font-semibold text-slate-100 line-clamp-2">
            {note.title || "Untitled"}
          </h3>
          <span className="text-xs font-medium text-slate-500">Open note →</span>
        </CardContent>
      </Card>
    </Link>
  );
}
