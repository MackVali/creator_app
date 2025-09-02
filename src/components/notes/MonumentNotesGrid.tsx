"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MonumentNote } from "@/lib/types/monument-note";
import {
  getMonumentNotes,
  saveMonumentNotes,
} from "@/lib/monumentNotesStorage";
import { MonumentNoteCard } from "./MonumentNoteCard";

interface MonumentNotesGridProps {
  monumentId: string;
}

export function MonumentNotesGrid({ monumentId }: MonumentNotesGridProps) {
  const [notes, setNotes] = useState<MonumentNote[]>([]);

  useEffect(() => {
    setNotes(getMonumentNotes(monumentId));
  }, [monumentId]);

  useEffect(() => {
    saveMonumentNotes(monumentId, notes);
  }, [monumentId, notes]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {notes.map((note) => (
        <MonumentNoteCard
          key={note.id}
          note={note}
          monumentId={monumentId}
        />
      ))}
      <Link href={`/monuments/${monumentId}/notes/new`}>
        <Card className="flex items-center justify-center h-full border-dashed hover:bg-gray-800 transition-colors">
          <CardContent className="p-4 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-400" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
