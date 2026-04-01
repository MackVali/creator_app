"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

function combineNoteText(note: Pick<Note, "title" | "content"> | null) {
  if (!note) return "";
  const title = note.title?.trim() ?? "";
  const content = note.content?.trim() ?? "";

  if (!title && !content) return "";
  if (!content) return title;
  if (!title) return content;
  return `${title}\n\n${content}`;
}

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const parentFromQuery = searchParams?.get("parent");
  const normalizedParentFromQuery = parentFromQuery ? String(parentFromQuery) : null;

  const [noteText, setNoteText] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(normalizedParentFromQuery);
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [children, setChildren] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isLoadingParents, setIsLoadingParents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState("");

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setNoteText("");
      setChildren([]);
      setParentNote(null);
      setSelectedParentId(normalizedParentFromQuery);
      setLastSavedText("");
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
          const combined = combineNoteText(result.note);
          setCurrentNoteId(result.note.id);
          setNoteText(combined);
          setLastSavedText(combined);
          setSelectedParentId(result.note.parentNoteId ?? null);
          setParentNote(result.parent);
          setChildren(result.children);
        } else {
          setCurrentNoteId(null);
          setNoteText("");
          setLastSavedText("");
          setSelectedParentId(null);
          setParentNote(null);
          setChildren([]);
        }
      } catch (error) {
        console.error("Failed to load skill note", { error, skillId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setNoteText("");
        setLastSavedText("");
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

    const trimmed = noteText.trim();
    if (!trimmed || noteText === lastSavedText) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const parsed = splitNoteText(noteText);
        let saved: Note | null = null;

        if (currentNoteId) {
          saved = await updateSkillNote(
            skillId,
            currentNoteId,
            parsed,
            { parentNoteId: selectedParentId },
          );
        } else {
          saved = await createSkillNote(
            skillId,
            parsed,
            { parentNoteId: selectedParentId },
          );
        }

        if (!saved) return;

        const combined = combineNoteText(saved);
        setCurrentNoteId(saved.id);
        setLastSavedText(combined);

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
  }, [currentNoteId, isLoading, isSaving, lastSavedText, noteId, noteText, router, selectedParentId, skillId]);

  const availableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.id !== currentNoteId),
    [parentOptions, currentNoteId],
  );

  const parentSelectValue = selectedParentId ?? ROOT_PARENT_VALUE;

  const heading = useMemo(() => {
    const { title } = splitNoteText(noteText);
    return title || "New note";
  }, [noteText]);

  return (
    <main className="min-h-screen bg-[#f9f3df] px-4 py-6 text-[#1f1f1f]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-full px-3 text-sm text-[#484848] hover:bg-[#f1ead2]"
            onClick={() => router.push(`/skills/${skillId}`)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <p className="text-xs font-medium text-[#6f6652]">{isSaving ? "Saving…" : "Autosaved"}</p>
        </div>

        <section className="space-y-3 rounded-[20px] bg-[#fff8e4] p-4 shadow-[0_12px_30px_-20px_rgba(62,39,0,0.6)]">
          <Label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7f7358]">
            Parent page
          </Label>
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
            triggerClassName="h-11 rounded-[12px] border-0 bg-[#f4ecd5] px-3 text-left text-sm text-[#3e3522]"
          >
            <SelectContent className="border-0 bg-[#f4ecd5] text-[#3e3522]">
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
          {parentNote ? (
            <p className="text-xs text-[#7f7358]">
              Nested under <span className="font-semibold">{getNoteTitle(parentNote)}</span>
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-[#6f6652]">Loading note…</p>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-[#3e3522]">{heading}</h1>
              <textarea
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Title\nStart typing your note…"
                className="min-h-[60vh] w-full resize-none border-0 bg-transparent p-0 text-base leading-7 text-[#2e2b24] outline-none placeholder:text-[#9f9278]"
                aria-label="Note editor"
              />
            </>
          )}
        </section>

        {currentNoteId ? (
          <section className="space-y-3 rounded-[20px] bg-[#fff8e4] p-4 shadow-[0_12px_30px_-20px_rgba(62,39,0,0.5)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[#7f7358]">Sub-pages</h2>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-[#f1e7c8] px-3 text-[#3e3522] hover:bg-[#e8ddb9]"
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
                        className="flex items-center justify-between gap-3 rounded-xl bg-[#f4ecd5] px-3 py-2 text-sm text-[#3e3522]"
                      >
                        <span className="truncate font-medium">{childTitle}</span>
                        {subtitle ? <span className="text-xs text-[#7f7358]">{subtitle}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-xl bg-[#f4ecd5] px-3 py-4 text-center text-sm text-[#7f7358]">
                No sub-pages yet.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
