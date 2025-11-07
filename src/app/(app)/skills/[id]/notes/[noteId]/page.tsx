"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { NotebookPen, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const noteId = params.noteId as string;
  const parentFromQuery = searchParams?.get("parent");
  const normalizedParentFromQuery = parentFromQuery ? String(parentFromQuery) : null;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    normalizedParentFromQuery,
  );
  const [parentNote, setParentNote] = useState<Note | null>(null);
  const [parentOptions, setParentOptions] = useState<Note[]>([]);
  const [children, setChildren] = useState<Note[]>([]);
  const [parentTemplateOverrides, setParentTemplateOverrides] =
    useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(noteId !== "new");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (noteId === "new") {
      setCurrentNoteId(null);
      setTitle("");
      setContent("");
      setChildren([]);
      setParentNote(null);
      setParentTemplateOverrides(null);
      setSelectedParentId(normalizedParentFromQuery);
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
          setCurrentNoteId(result.note.id);
          setTitle(result.note.title ?? "");
          setContent(result.note.content ?? "");
          setSelectedParentId(result.note.parentNoteId ?? null);
          setParentNote(result.parent);
          setParentTemplateOverrides(result.parentTemplateOverrides);
          setChildren(result.children);
        } else {
          setCurrentNoteId(null);
          setTitle("");
          setContent("");
          setSelectedParentId(null);
          setParentNote(null);
          setParentTemplateOverrides(null);
          setChildren([]);
        }
      } catch (error) {
        console.error("Failed to load skill note", { error, skillId, noteId });
        if (!isMounted) return;
        setCurrentNoteId(null);
        setTitle("");
        setContent("");
        setSelectedParentId(null);
        setParentNote(null);
        setParentTemplateOverrides(null);
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
      setParentTemplateOverrides(null);
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
        setParentTemplateOverrides(fetchedParent?.childTemplateOverrides ?? null);
      } catch (error) {
        console.error("Failed to load parent note", {
          error,
          skillId,
          parentId: selectedParentId,
        });
        if (!isActive) return;
        setParentNote(null);
        setParentTemplateOverrides(null);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [selectedParentId, skillId, parentNote?.id]);

  const availableParentOptions = useMemo(
    () => parentOptions.filter((option) => option.id !== currentNoteId),
    [parentOptions, currentNoteId],
  );

  const parentSelectValue = selectedParentId ?? ROOT_PARENT_VALUE;
  const canSave = title.trim().length > 0 || content.trim().length > 0;
  const inheritedFieldCount = parentTemplateOverrides
    ? Object.keys(parentTemplateOverrides).length
    : 0;

  const onSave = async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);

    try {
      let saved: Note | null = null;

      if (currentNoteId) {
        saved = await updateSkillNote(
          skillId,
          currentNoteId,
          {
            title,
            content,
          },
          {
            parentNoteId: selectedParentId,
          },
        );
      } else {
        saved = await createSkillNote(
          skillId,
          {
            title,
            content,
          },
          {
            parentNoteId: selectedParentId,
          },
        );
      }

      if (!saved) return;

      setCurrentNoteId(saved.id);
      router.push(`/skills/${skillId}`);
    } catch (error) {
      console.error("Failed to save skill note", { error, skillId, noteId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b1b] py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(180,83,9,0.1),_transparent_60%)]"
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4">
        <div className="space-y-4">
          <nav className="flex flex-wrap items-center gap-1 text-xs font-medium text-white/60">
            <Link
              href={`/skills/${skillId}`}
              className="rounded-full bg-white/5 px-3 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              Skill notes
            </Link>
            {parentNote ? (
              <>
                <span className="text-white/30">/</span>
                <Link
                  href={`/skills/${skillId}/notes/${parentNote.id}`}
                  className="rounded-full bg-white/[0.04] px-3 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {getNoteTitle(parentNote)}
                </Link>
              </>
            ) : null}
            <span className="text-white/30">/</span>
            <span className="rounded-full border border-white/10 px-3 py-1 text-white">
              {noteId === "new" ? "New note" : title.trim() || "Untitled"}
            </span>
          </nav>
          {inheritedFieldCount > 0 ? (
            <p className="text-xs text-white/60">
              Parent defaults active ({inheritedFieldCount} field
              {inheritedFieldCount === 1 ? "" : "s"} applied).
            </p>
          ) : null}
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_-40px_rgba(148,163,184,0.8)]">
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-sky-500/20 blur-3xl" aria-hidden />
          <div className="absolute -bottom-16 -left-10 h-52 w-52 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-col gap-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/70 via-indigo-500/60 to-purple-500/50 text-white shadow-lg shadow-sky-500/30">
                  <NotebookPen className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    {noteId === "new" ? "Create" : "Update"} a skill note
                  </p>
                  <h1 className="text-2xl font-semibold text-white sm:text-3xl">
                    {title.trim() || "Give this note a memorable headline"}
                  </h1>
                </div>
              </div>
              <Button
                onClick={onSave}
                disabled={!canSave || isSaving || isLoading}
                aria-busy={isSaving}
                className="h-11 px-6 text-sm font-semibold shadow-[0_12px_40px_-20px_rgba(56,189,248,0.9)]"
              >
                {isSaving ? "Saving…" : currentNoteId ? "Save changes" : "Publish note"}
              </Button>
            </header>

            {isLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                <Sparkles className="h-4 w-4 animate-spin text-sky-300" />
                Loading note…
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
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
                      triggerClassName="h-12 rounded-2xl border border-white/10 bg-white/5 text-left text-sm text-white shadow-inner shadow-white/5 transition focus:ring-2 focus:ring-sky-400/60"
                    >
                      <SelectContent className="border border-white/10 bg-[#0f172a] text-white">
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
                    <p className="text-xs text-white/50">
                      Sub-notes can only nest one level deep.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Name the idea, ritual, or breakthrough you’re capturing"
                    disabled={isLoading}
                    className="h-14 rounded-2xl border-white/10 bg-[#0b1327] text-lg font-medium text-white placeholder:text-white/40"
                  />
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Expand on what changed, what you learned, or what you want to explore next..."
                    className="min-h-[320px] resize-none rounded-2xl border-white/10 bg-[#0b1327] text-base leading-relaxed text-white placeholder:text-white/40"
                    disabled={isLoading}
                  />
                  <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
                    <div className="flex items-center gap-2 text-white">
                      <Sparkles className="h-4 w-4 text-sky-300" />
                      <span className="font-medium">Make it vivid</span>
                    </div>
                    <p>
                      Capture outcomes, experiments, and follow-up ideas. The more context you leave your future self, the
                      easier it’ll be to build on the momentum.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {currentNoteId ? (
          <section className="relative rounded-3xl border border-white/10 bg-white/[0.02] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">
                  Sub-pages
                </h2>
                <p className="text-sm text-white/60">
                  Stitch related notes together to keep this skill evolving.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20"
                onClick={() => router.push(`/skills/${skillId}/notes/new?parent=${currentNoteId}`)}
              >
                Add sub-page
              </Button>
            </div>
            <div className="mt-5 space-y-3">
              {children.length > 0 ? (
                <ul className="space-y-2">
                  {children.map((child) => {
                    const childTitle = getNoteTitle(child);
                    const subtitle = formatTimestamp(child);
                    return (
                      <li key={child.id}>
                        <Link
                          href={`/skills/${skillId}/notes/${child.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0b1327] px-4 py-3 text-sm text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                        >
                          <span className="truncate font-medium">{childTitle}</span>
                          {subtitle ? (
                            <span className="text-xs text-white/50">{subtitle}</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-white/60">
                  No sub-pages yet. Add one to keep related details together.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
