"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createMonumentNote,
  getMonumentNote,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import type { MonumentNote } from "@/lib/types/monument-note";

function splitNoteText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const firstLineIndex = lines.findIndex((line) => line.trim().length > 0);

  if (firstLineIndex === -1) {
    return { title: "", content: "" };
  }

  const title = lines[firstLineIndex].trim();
  const content = lines.slice(firstLineIndex + 1).join("\n").trim();
  return { title, content };
}

function combineNoteText(note: Pick<MonumentNote, "title" | "content"> | null) {
  if (!note) return "";
  const title = note.title?.trim() ?? "";
  const content = note.content?.trim() ?? "";

  if (!title && !content) return "";
  if (!content) return title;
  if (!title) return content;
  return `${title}\n\n${content}`;
}

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [noteText, setNoteText] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState("");
  const [noteIcon, setNoteIcon] = useState("📝");
  const [isBookmarked, setIsBookmarked] = useState(false);
  const presetIcons = ["📝", "💡", "🔥", "🎯", "📚", "⚡"];

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteText("");
      setLastSavedText("");
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
          const combined = combineNoteText(note);
          setCurrentNoteId(note.id);
          setNoteText(combined);
          setLastSavedText(combined);
          const savedIcon =
            typeof note.metadata?.icon === "string" ? String(note.metadata.icon) : "📝";
          setNoteIcon(savedIcon);
          setIsBookmarked(note.metadata?.bookmarked === true);
        } else {
          setCurrentNoteId(null);
          setNoteText("");
          setLastSavedText("");
        }
      } catch (error) {
        console.error("Failed to load monument note", { error, monumentId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteText("");
        setLastSavedText("");
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

  useEffect(() => {
    if (isLoading || isSaving) return;

    const trimmed = noteText.trim();
    if (!trimmed || noteText === lastSavedText) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const parsed = splitNoteText(noteText);
        const metadata = { icon: noteIcon, bookmarked: isBookmarked };
        let saved: MonumentNote | null = null;

        if (currentNoteId) {
          saved = await updateMonumentNote(monumentId, currentNoteId, {
            ...parsed,
            metadata,
          });
        } else {
          saved = await createMonumentNote(monumentId, { ...parsed, metadata });
        }

        if (!saved) return;

        const combined = combineNoteText(saved);
        setCurrentNoteId(saved.id);
        setLastSavedText(combined);

        if (noteId === "new") {
          router.replace(`/monuments/${monumentId}/notes/${saved.id}`);
        }
      } catch (error) {
        console.error("Failed to autosave monument note", { error, monumentId, noteId });
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [currentNoteId, isBookmarked, isLoading, isSaving, lastSavedText, monumentId, noteIcon, noteId, noteText, router]);

  const heading = useMemo(() => {
    const { title } = splitNoteText(noteText);
    return title || "New note";
  }, [noteText]);

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-6 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-full px-3 text-sm text-white/80 hover:bg-white/10"
            onClick={() => router.push(`/monuments/${monumentId}`)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <p className="text-xs font-medium text-white/60">{isSaving ? "Saving…" : "Autosaved"}</p>
        </div>

        <section className="rounded-[20px] bg-[#0a0a0a] p-4 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.9)] border border-white/10">
          {isLoading ? (
            <p className="text-sm text-white/60">Loading note…</p>
          ) : (
            <>
              <h1 className="mb-2 text-lg font-semibold text-white">{heading}</h1>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {presetIcons.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNoteIcon(icon)}
                    className={`rounded-lg border px-2 py-1 text-sm ${noteIcon === icon ? "border-white/70 bg-white/15" : "border-white/20 bg-white/5"}`}
                  >
                    {icon}
                  </button>
                ))}
                <input
                  value={noteIcon}
                  onChange={(event) => setNoteIcon(event.target.value)}
                  maxLength={4}
                  className="h-8 w-14 rounded-lg border border-white/20 bg-white/5 px-2 text-center text-sm outline-none"
                  aria-label="Custom note icon"
                />
              </div>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Title\nStart typing your note…"
                className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/35"
                aria-label="Note editor"
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
