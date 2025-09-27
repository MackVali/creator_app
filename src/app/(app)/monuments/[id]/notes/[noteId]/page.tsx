"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  fetchMonumentNote,
  upsertMonumentNote,
} from "@/lib/monumentNotesStorage";

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (noteId === "new") return;

    let active = true;

    const loadNote = async () => {
      const note = await fetchMonumentNote(monumentId, noteId);
      if (!active || !note) return;
      setTitle(note.title);
      setContent(note.content);
    };

    loadNote();

    return () => {
      active = false;
    };
  }, [monumentId, noteId]);

  const onSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const saved = await upsertMonumentNote({
      id: noteId === "new" ? undefined : noteId,
      monumentId,
      title,
      content,
    });

    setIsSaving(false);

    if (saved) {
      router.push(`/monuments/${monumentId}`);
    }
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
      <Button onClick={onSave} disabled={isSaving}>
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </main>
  );
}
