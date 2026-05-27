"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteSlashTextarea } from "@/components/notes/NoteSlashTextarea";
import { Button } from "@/components/ui/button";
import {
  createMonumentNote,
  getMonumentNote,
  getMonumentNotes,
  updateMonumentNote,
} from "@/lib/monumentNotesStorage";
import type { MonumentNote } from "@/lib/types/monument-note";

const DEFAULT_NOTE_ICON = "📝";

function getMetadataIcon(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.icon === "string" && metadata.icon.trim()
    ? metadata.icon
    : DEFAULT_NOTE_ICON;
}

function getNoteTitle(note: MonumentNote | null): string {
  if (!note) return "Untitled";
  return (
    note.title?.trim() ||
    note.content
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ||
    "Untitled"
  );
}

function formatTimestamp(note: MonumentNote): string {
  const source = note.updatedAt ?? note.createdAt;
  if (!source) return "";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function createSaveSnapshot({
  title,
  content,
  icon,
  bookmarked,
}: {
  title: string;
  content: string;
  icon: string;
  bookmarked: boolean;
}) {
  return JSON.stringify({ title, content, icon, bookmarked });
}

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [noteIcon, setNoteIcon] = useState(DEFAULT_NOTE_ICON);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [children, setChildren] = useState<MonumentNote[]>([]);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteIcon(DEFAULT_NOTE_ICON);
      setIsBookmarked(false);
      setNoteMetadata(null);
      setChildren([]);
      setLastSavedSnapshot(
        createSaveSnapshot({
          title: "",
          content: "",
          icon: DEFAULT_NOTE_ICON,
          bookmarked: false,
        }),
      );
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
          const childNotes = await getMonumentNotes(monumentId, { parentNoteId: noteId });
          if (!isMounted) return;

          const savedIcon = getMetadataIcon(note.metadata);
          setCurrentNoteId(note.id);
          setNoteTitle(note.title ?? "");
          setNoteContent(note.content ?? "");
          setNoteIcon(savedIcon);
          setIsBookmarked(note.metadata?.bookmarked === true);
          setNoteMetadata(note.metadata ?? null);
          setChildren(childNotes);
          setLastSavedSnapshot(
            createSaveSnapshot({
              title: note.title ?? "",
              content: note.content ?? "",
              icon: savedIcon,
              bookmarked: note.metadata?.bookmarked === true,
            }),
          );
        } else {
          setCurrentNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteIcon(DEFAULT_NOTE_ICON);
          setIsBookmarked(false);
          setNoteMetadata(null);
          setChildren([]);
          setLastSavedSnapshot("");
        }
      } catch (error) {
        console.error("Failed to load monument note", { error, monumentId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteTitle("");
        setNoteContent("");
        setNoteIcon(DEFAULT_NOTE_ICON);
        setIsBookmarked(false);
        setNoteMetadata(null);
        setChildren([]);
        setLastSavedSnapshot("");
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

    const hasDraft = noteTitle.trim().length > 0 || noteContent.trim().length > 0;
    if (!currentNoteId && !hasDraft) {
      return;
    }

    const nextSnapshot = createSaveSnapshot({
      title: noteTitle,
      content: noteContent,
      icon: noteIcon,
      bookmarked: isBookmarked,
    });

    if (nextSnapshot === lastSavedSnapshot) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const metadata = { ...(noteMetadata ?? {}), icon: noteIcon, bookmarked: isBookmarked };
        const payload = {
          title: noteTitle.trim() || "Untitled",
          content: noteContent,
          metadata,
        };
        let saved: MonumentNote | null = null;

        if (currentNoteId) {
          saved = await updateMonumentNote(monumentId, currentNoteId, payload);
        } else {
          saved = await createMonumentNote(monumentId, payload);
        }

        if (!saved) return;

        setCurrentNoteId(saved.id);
        setNoteMetadata(saved.metadata ?? metadata);
        setLastSavedSnapshot(nextSnapshot);

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
  }, [
    currentNoteId,
    isBookmarked,
    isLoading,
    isSaving,
    lastSavedSnapshot,
    monumentId,
    noteContent,
    noteIcon,
    noteId,
    noteMetadata,
    noteTitle,
    router,
  ]);

  async function handleCreateSubpage() {
    if (!currentNoteId) {
      return null;
    }

    const created = await createMonumentNote(
      monumentId,
      {
        title: "Untitled",
        content: "",
        metadata: { icon: DEFAULT_NOTE_ICON },
      },
      {
        parentNoteId: currentNoteId,
        siblingOrder: children.length,
      },
    );

    if (!created) {
      return null;
    }

    setChildren((current) => [...current, created]);
    return {
      id: created.id,
      title: getNoteTitle(created),
      href: `/monuments/${monumentId}/notes/${created.id}`,
    };
  }

  function handleOpenSubpage(subpageId: string) {
    router.push(`/monuments/${monumentId}/notes/${subpageId}`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-5 text-white sm:py-6">
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

        <section className="rounded-[22px] border border-white/[0.07] bg-[#050505]/92 p-4 shadow-[0_18px_42px_-30px_rgba(0,0,0,0.95)] sm:p-5">
          {isLoading ? (
            <p className="text-sm text-white/60">Loading note…</p>
          ) : (
            <div className="space-y-4">
              <NoteEditorHeader
                icon={noteIcon}
                title={noteTitle}
                onIconChange={setNoteIcon}
                onTitleChange={setNoteTitle}
              />

              <NoteSlashTextarea
                value={noteContent}
                onValueChange={setNoteContent}
                onCreateSubpage={handleCreateSubpage}
                onOpenSubpage={handleOpenSubpage}
                placeholder="Start typing, or press / for commands…"
                className="min-h-[70vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28"
                aria-label="Note editor"
              />
            </div>
          )}
        </section>

        {currentNoteId ? (
          <section className="space-y-3 rounded-[20px] border border-white/10 bg-[#0a0a0a] p-4 shadow-[0_12px_30px_-20px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-white/55">Sub-pages</h2>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-white/10 px-3 text-white hover:bg-white/20"
                onClick={async () => {
                  const created = await handleCreateSubpage();
                  if (created) {
                    router.push(`/monuments/${monumentId}/notes/${created.id}`);
                  }
                }}
              >
                Add sub-page
              </Button>
            </div>
            {children.length > 0 ? (
              <ul className="space-y-2">
                {children.map((child) => {
                  const childTitle = getNoteTitle(child);
                  const subtitle = formatTimestamp(child);
                  return (
                    <li key={child.id}>
                      <Link
                        href={`/monuments/${monumentId}/notes/${child.id}`}
                        className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.045] px-2.5 py-2 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-emerald-300/20 hover:bg-white/[0.075]"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/25 text-white/55">
                          <FilePlus2 className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium leading-4">{childTitle}</span>
                          <span className="block truncate text-[11px] font-medium leading-4 text-white/38">
                            {subtitle || "Subpage"}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl bg-[#141414] px-3 py-4 text-center text-sm text-white/55">
                No sub-pages yet.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
