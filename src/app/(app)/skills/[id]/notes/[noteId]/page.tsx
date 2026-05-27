"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FilePlus2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { NoteEditorHeader } from "@/components/notes/NoteEditorHeader";
import { NoteSlashTextarea } from "@/components/notes/NoteSlashTextarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import {
  createSkillNote,
  getNote,
  getNoteWithChildren,
  getNotes,
  updateSkillNote,
} from "@/lib/notesStorage";
import type { Note } from "@/lib/types/note";

const ROOT_PARENT_VALUE = "__root__";
const DEFAULT_NOTE_ICON = "📝";

function getNoteTitle(note: Note | null): string {
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

function formatTimestamp(note: Note): string {
  const source = note.updatedAt ?? note.createdAt;
  if (!source) return "";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getMetadataIcon(metadata: Record<string, unknown> | null | undefined) {
  return typeof metadata?.icon === "string" && metadata.icon.trim()
    ? metadata.icon
    : DEFAULT_NOTE_ICON;
}

function createSaveSnapshot({
  title,
  content,
  icon,
  parentNoteId,
}: {
  title: string;
  content: string;
  icon: string;
  parentNoteId: string | null;
}) {
  return JSON.stringify({
    title,
    content,
    icon,
    parentNoteId,
  });
}

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const parentFromQuery = searchParams?.get("parent");
  const normalizedParentFromQuery = parentFromQuery ? String(parentFromQuery) : null;

  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteIcon, setNoteIcon] = useState(DEFAULT_NOTE_ICON);
  const [noteMetadata, setNoteMetadata] = useState<Record<string, unknown> | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(normalizedParentFromQuery);
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [children, setChildren] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteIcon(DEFAULT_NOTE_ICON);
      setNoteMetadata(null);
      setChildren([]);
      setParentNote(null);
      setSelectedParentId(normalizedParentFromQuery);
      setLastSavedSnapshot(
        createSaveSnapshot({
          title: "",
          content: "",
          icon: DEFAULT_NOTE_ICON,
          parentNoteId: normalizedParentFromQuery,
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
        const result = await getNoteWithChildren(skillId, noteId);
        if (!isMounted) return;

        if (result) {
          const icon = getMetadataIcon(result.note.metadata);
          setCurrentNoteId(result.note.id);
          setNoteTitle(result.note.title ?? "");
          setNoteContent(result.note.content ?? "");
          setNoteIcon(icon);
          setNoteMetadata(result.note.metadata ?? null);
          setSelectedParentId(result.note.parentNoteId ?? null);
          setParentNote(result.parent);
          setChildren(result.children);
          setLastSavedSnapshot(
            createSaveSnapshot({
              title: result.note.title ?? "",
              content: result.note.content ?? "",
              icon,
              parentNoteId: result.note.parentNoteId ?? null,
            }),
          );
        } else {
          setCurrentNoteId(null);
          setNoteTitle("");
          setNoteContent("");
          setNoteIcon(DEFAULT_NOTE_ICON);
          setNoteMetadata(null);
          setLastSavedSnapshot("");
          setSelectedParentId(null);
          setParentNote(null);
          setChildren([]);
        }
      } catch (error) {
        console.error("Failed to load skill note", { error, skillId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteTitle("");
        setNoteContent("");
        setNoteIcon(DEFAULT_NOTE_ICON);
        setNoteMetadata(null);
        setLastSavedSnapshot("");
        setSelectedParentId(null);
        setParentNote(null);
        setChildren([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [skillId, noteId, normalizedParentFromQuery]);

  useEffect(() => {
    let isActive = true;
    setIsLoadingParents(true);

    (async () => {
      try {
        const options = await getNotes(skillId, { parentNoteId: null });
        if (!isActive) return;
        setParentOptions(options);
      } catch (error) {
        console.error("Failed to load parent options", { error, skillId });
        if (!isActive) return;
        setParentOptions([]);
      } finally {
        if (isActive) {
          setIsLoadingParents(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [skillId]);

  useEffect(() => {
    if (!selectedParentId) {
      setParentNote(null);
      return;
    }

    if (parentNote?.id === selectedParentId) {
      return;
    }

    let isActive = true;

    (async () => {
      try {
        const fetchedParent = await getNote(skillId, selectedParentId);
        if (!isActive) return;
        setParentNote(fetchedParent);
      } catch (error) {
        console.error("Failed to load parent note", {
          error,
          skillId,
          parentId: selectedParentId,
        });
        if (!isActive) return;
        setParentNote(null);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedParentId, skillId, parentNote?.id]);

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
      parentNoteId: selectedParentId,
    });

    if (nextSnapshot === lastSavedSnapshot) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const metadata = { ...(noteMetadata ?? {}), icon: noteIcon };
        const payload = {
          title: noteTitle.trim() || "Untitled",
          content: noteContent,
        };
        let saved: Note | null = null;

        if (currentNoteId) {
          saved = await updateSkillNote(
            skillId,
            currentNoteId,
            payload,
            { metadata, parentNoteId: selectedParentId },
          );
        } else {
          saved = await createSkillNote(
            skillId,
            payload,
            { metadata, parentNoteId: selectedParentId },
          );
        }

        if (!saved) return;

        setCurrentNoteId(saved.id);
        setNoteMetadata(saved.metadata ?? metadata);
        setLastSavedSnapshot(nextSnapshot);

        if (noteId === "new") {
          router.replace(`/skills/${skillId}/notes/${saved.id}`);
        }
      } catch (error) {
        console.error("Failed to autosave skill note", { error, skillId, noteId });
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [
    currentNoteId,
    isLoading,
    isSaving,
    lastSavedSnapshot,
    noteContent,
    noteIcon,
    noteId,
    noteMetadata,
    noteTitle,
    router,
    selectedParentId,
    skillId,
  ]);

  const availableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.id !== currentNoteId),
    [parentOptions, currentNoteId],
  );

  const parentSelectValue = selectedParentId ?? ROOT_PARENT_VALUE;

  async function handleCreateSubpage() {
    if (!currentNoteId) {
      return null;
    }

    const created = await createSkillNote(
      skillId,
      {
        title: "Untitled",
        content: "",
      },
      {
        metadata: { icon: DEFAULT_NOTE_ICON },
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
      href: `/skills/${skillId}/notes/${created.id}`,
    };
  }

  function handleOpenSubpage(subpageId: string) {
    router.push(`/skills/${skillId}/notes/${subpageId}`);
  }

  return (
    <main className="min-h-screen bg-[#020202] px-4 py-5 text-white sm:py-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-full px-3 text-sm text-white/80 hover:bg-white/10"
            onClick={() => router.push(`/skills/${skillId}`)}
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
              <div className="flex justify-end">
                <Select
                  value={parentSelectValue}
                  onValueChange={(value) => {
                    if (value === ROOT_PARENT_VALUE) {
                      setSelectedParentId(null);
                    } else {
                      setSelectedParentId(value);
                    }
                  }}
                  placeholder="Top-level page"
                  triggerClassName="h-8 max-w-full rounded-full border border-white/[0.08] bg-white/[0.045] px-3 text-left text-xs text-white/70 shadow-none hover:bg-white/[0.07]"
                >
                  <SelectContent className="border-white/[0.08] bg-[#101010] text-white">
                    <SelectItem value={ROOT_PARENT_VALUE}>
                      {isLoadingParents ? "Loading…" : "Top-level page"}
                    </SelectItem>
                    {availableParentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {getNoteTitle(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                className="min-h-[62vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-white outline-none placeholder:text-white/28"
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
                onClick={() => router.push(`/skills/${skillId}/notes/new?parent=${currentNoteId}`)}
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
                        href={`/skills/${skillId}/notes/${child.id}`}
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
