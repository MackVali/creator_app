"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Note } from "@/lib/types/note";

interface NoteCardProps {
  note: Note;
  skillId: string;
}

export function NoteCard({ note, skillId }: NoteCardProps) {
  return (
    <Link href={`/skills/${skillId}/notes/${note.id}`}>
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
