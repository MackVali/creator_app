"use client";

import { Pin, PinOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MonumentNote } from "@/lib/types/monument-note";

interface MonumentNoteCardProps {
  note: MonumentNote;
  onTogglePin?: (id: string) => void;
}

export function MonumentNoteCard({ note, onTogglePin }: MonumentNoteCardProps) {
  return (
    <Card className="relative hover:bg-gray-800 transition-colors">
      <button
        className="absolute right-2 top-2 text-muted-foreground hover:text-white"
        onClick={() => onTogglePin?.(note.id)}
      >
        {note.pinned ? (
          <Pin className="w-4 h-4" />
        ) : (
          <PinOff className="w-4 h-4" />
        )}
      </button>
      <CardContent className="p-4 space-y-2">
        <h3 className="text-lg font-medium text-white truncate">
          {note.title || "Untitled"}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {note.content}
        </p>
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-gray-700 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {new Date(note.updatedAt).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
