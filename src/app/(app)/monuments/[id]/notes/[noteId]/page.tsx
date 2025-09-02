"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  getMonumentNotes,
  saveMonumentNotes,
} from "@/lib/monumentNotesStorage";
import type { MonumentNote } from "@/lib/types/monument-note";

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    const notes = getMonumentNotes(monumentId);
    const note = notes.find((n) => n.id === noteId);
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
  }, [monumentId, noteId]);

  const onSave = () => {
    const notes = getMonumentNotes(monumentId);
    const existingIndex = notes.findIndex((n) => n.id === noteId);
    const newId = existingIndex >= 0 ? noteId : Date.now().toString();
    const newNote: MonumentNote = {
      id: newId,
      monumentId,
      title,
      content,
    };
    if (existingIndex >= 0) {
      notes[existingIndex] = newNote;
    } else {
      notes.push(newNote);
    }
    saveMonumentNotes(monumentId, notes);
    router.push(`/monuments/${monumentId}`);
  };

  return (
    <main className="p-4 space-y-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your note..."
        className="min-h-[300px]"
      />
      <Button onClick={onSave}>Save</Button>
    </main>
  );
}
