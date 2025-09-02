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
      <Card className="h-full hover:bg-gray-800 transition-colors">
        <CardContent className="p-4">
          <h3 className="text-lg font-medium text-white truncate">
            {note.title || "Untitled"}
          </h3>
        </CardContent>
      </Card>
    </Link>
  );
}
