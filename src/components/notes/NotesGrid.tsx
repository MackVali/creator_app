"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteCard } from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { fetchSkillNotes } from "@/lib/notesStorage";

interface NotesGridProps {
  skillId: string;
}

export function NotesGrid({ skillId }: NotesGridProps) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let active = true;

    const loadNotes = async () => {
      const data = await fetchSkillNotes(skillId);
      if (!active) return;
      setNotes(data);
    };

    loadNotes();

    return () => {
      active = false;
    };
  }, [skillId]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} skillId={skillId} />
      ))}
      <Link href={`/skills/${skillId}/notes/new`}>
        <Card className="flex items-center justify-center h-full border-dashed hover:bg-gray-800 transition-colors">
          <CardContent className="p-4 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-400" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
