"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { NoteCard } from "./NoteCard";
import type { Note } from "@/lib/types/note";
import { getNotes } from "@/lib/notesStorage";

interface NotesGridProps {
  skillId: string;
}

export function NotesGrid({ skillId }: NotesGridProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);

    (async () => {
      try {
        const fetchedNotes = await getNotes(skillId);
        if (!isMounted) return;
        setNotes(fetchedNotes);
      } catch (error) {
        console.error("Failed to fetch skill notes", { error, skillId });
        if (!isMounted) return;
        setNotes([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [skillId]);

  const hasNotes = notes.length > 0;
  const showEmptyState = !isLoading && !hasNotes;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="border border-white/10 bg-white/5 text-white/70">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-white/80">Loading notes…</p>
            <p className="mt-1 text-xs text-white/60">
              We’re pulling your notes from Supabase.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} skillId={skillId} />
        ))}

        {showEmptyState ? (
          <Card className="flex h-full flex-col justify-center border-dashed border-white/10 bg-white/5 text-white/60">
            <CardContent className="p-4 text-center text-sm">
              No notes yet. Start capturing insights with the button below.
            </CardContent>
          </Card>
        ) : null}

        <Link href={`/skills/${skillId}/notes/new`}>
          <Card className="flex h-full items-center justify-center border-dashed border-white/20 bg-transparent text-white/80 transition-colors hover:bg-white/10">
            <CardContent className="flex items-center justify-center p-4">
              <Plus className="h-5 w-5" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
