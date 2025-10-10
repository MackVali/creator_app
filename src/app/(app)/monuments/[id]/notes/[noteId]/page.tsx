"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  createMonumentNote,
  getMonumentNote,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import type { MonumentNote } from "@/lib/types/monument-note";

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setTitle("");
      setContent("");
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);

    (async () => {
      try {
        const note = await getMonumentNote(monumentId, noteId);
        if (!isMounted) return;

        if (note) {
          setCurrentNoteId(note.id);
          setTitle(note.title ?? "");
          setContent(note.content ?? "");
        } else {
          setCurrentNoteId(null);
          setTitle("");
          setContent("");
        }
      } catch (error) {
        console.error("Failed to load monument note", { error, monumentId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setTitle("");
        setContent("");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [monumentId, noteId]);

  const canSave = title.trim().length > 0 || content.trim().length > 0;

  const onSave = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);

    try {
      let saved: MonumentNote | null = null;

      if (currentNoteId) {
        saved = await updateMonumentNote(monumentId, currentNoteId, {
          title,
          content,
        });
      } else {
        saved = await createMonumentNote(monumentId, {
          title,
          content,
        });
      }

      if (!saved) return;

      setCurrentNoteId(saved.id);
      router.push(`/monuments/${monumentId}`);
    } catch (error) {
      console.error("Failed to save monument note", { error, monumentId, noteId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="p-4 space-y-4">
      {isLoading ? (
        <p className="text-sm text-white/60">Loading note…</p>
      ) : null}
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title"
        disabled={isLoading}
      />
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your note..."
        className="min-h-[300px]"
        disabled={isLoading}
      />
      <Button onClick={onSave} disabled={!canSave || isSaving || isLoading} aria-busy={isSaving}>
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </main>
  );
}
