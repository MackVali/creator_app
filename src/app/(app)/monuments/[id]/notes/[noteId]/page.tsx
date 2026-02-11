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

  const fieldClass =
    "bg-transparent text-white placeholder:text-white/60 border border-white/20 rounded-[16px] px-4 py-3 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

  return (
    <main className="min-h-screen bg-[#010101] text-white px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {title.trim() || "Untitled note"}
          </h1>
        </header>

        <section className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-white/70">Loading note…</p>
          ) : (
            <>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title your insight"
                disabled={isLoading}
                className={fieldClass + " text-2xl font-semibold tracking-tight"}
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Document what you observed, why it matters, and what comes next..."
                className={`${fieldClass} min-h-[440px] tracking-tight leading-6 text-base`}
                disabled={isLoading}
              />
            </>
          )}
          <div className="flex justify-end pt-4">
            <Button
              onClick={onSave}
              disabled={!canSave || isSaving || isLoading}
              aria-busy={isSaving}
              className="h-12 rounded-[18px] border border-white/20 bg-white/10 px-6 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/40 hover:bg-white/20"
            >
              {isSaving ? "Saving…" : currentNoteId ? "Update note" : "Save note"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
