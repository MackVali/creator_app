"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getNote, upsertNote } from "@/lib/monumentNotesStore";
import type { MonumentNote } from "@/lib/types/monument-note";

export default function MonumentNotePage() {
  const params = useParams();
  const router = useRouter();
  const monumentId = params.id as string;
  const noteId = params.noteId as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (noteId === "new") return;
    getNote(monumentId, noteId).then((note) => {
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setPinned(note.pinned ?? false);
        setTags(note.tags?.join(",") ?? "");
      }
    });
  }, [monumentId, noteId]);

  const onSave = async () => {
    const id = noteId === "new" ? crypto.randomUUID() : noteId;
    const tagArray = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const newNote: MonumentNote = {
      id,
      monumentId,
      title,
      content,
      pinned,
      tags: tagArray,
      updatedAt: new Date().toISOString(),
    };
    await upsertNote(monumentId, newNote);
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
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={pinned ? "secondary" : "outline"}
          onClick={() => setPinned((p) => !p)}
        >
          {pinned ? "Unpin" : "Pin"}
        </Button>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (comma separated)"
        />
      </div>
      <Button onClick={onSave}>Save</Button>
    </main>
  );
}
