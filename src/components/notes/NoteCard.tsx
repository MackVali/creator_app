"use client";

import Link from "next/link";
import { Dumbbell, NotebookPen } from "lucide-react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import type { Note } from "@/lib/types/note";
import type { NoteCardDensity } from "./NotesHeaderControls";

export const skillNoteTileOuterClass =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.12),transparent_56%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(18,18,21,0.96)_48%,rgba(42,42,48,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 sm:p-4";

export const skillNoteTileInnerClass =
  "relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center text-center";

interface NoteCardProps {
  note: Note;
  skillId: string;
  childCount?: number;
  density?: NoteCardDensity;
}

type StarterNoteCardIconKey = "stomach" | "dumbbell";

function getStarterNoteCardIconKey(note: Note): StarterNoteCardIconKey | null {
  const metadata = note.metadata;
  if (!metadata || metadata.lockedSystemNote !== true) {
    return null;
  }

  if (metadata.iconKey === "stomach" || metadata.iconKey === "dumbbell") {
    return metadata.iconKey;
  }

  if (metadata.systemNoteKey === "health-starter") return "stomach";
  if (metadata.systemNoteKey === "fitness-starter") return "dumbbell";

  return null;
}

function NoteCardIcon({
  iconKey,
  density,
}: {
  iconKey: StarterNoteCardIconKey | null;
  density: NoteCardDensity;
}) {
  const iconClassName = cn(
    "h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4",
    density === "small" ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : ""
  );

  if (iconKey === "stomach") {
    return (
      <Icon
        icon="game-icons:stomach"
        className={iconClassName}
        aria-hidden="true"
      />
    );
  }

  if (iconKey === "dumbbell") {
    return (
      <Dumbbell
        className={iconClassName}
        aria-hidden="true"
      />
    );
  }

  return (
    <NotebookPen
      className={iconClassName}
      aria-hidden="true"
    />
  );
}

export function NoteCard({
  note,
  skillId,
  childCount = 0,
  density = "large",
}: NoteCardProps) {
  const noteTitle = note.title?.trim();
  const displayTitle =
    noteTitle && noteTitle.length > 0
      ? noteTitle
      : note.content
          ?.split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line.length > 0) ?? "Open this note to add a title.";

  const hasChildren = childCount > 0;
  const starterNoteIconKey = getStarterNoteCardIconKey(note);
  const isSmall = density === "small";

  return (
    <Link
      href={`/skills/${skillId}/notes/${note.id}`}
      className={cn(
        skillNoteTileOuterClass,
        isSmall ? "aspect-square min-h-[70px] rounded-xl p-2 sm:min-h-[78px] sm:p-2.5" : ""
      )}
    >
      <div
        className={cn(
          skillNoteTileInnerClass,
          "w-full min-w-0"
        )}
      >
        <div
          className={cn(
            "flex w-full min-w-0 flex-col items-center justify-center gap-1.5",
            isSmall ? "gap-1" : ""
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10",
              isSmall ? "h-7 w-7 rounded-md sm:h-8 sm:w-8" : ""
            )}
          >
            <NoteCardIcon iconKey={starterNoteIconKey} density={density} />
          </div>
          <div className="flex w-full min-w-0 items-center justify-center">
            <span
              className={cn(
                "line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-tight text-white whitespace-normal sm:text-[10px]",
                isSmall ? "line-clamp-2 text-[8px] sm:text-[9px]" : ""
              )}
              style={{ hyphens: "auto" }}
            >
              {displayTitle}
            </span>
          </div>
          {hasChildren ? (
            <span
              className={cn(
                "max-w-full rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-semibold leading-none text-white/42 sm:text-[9px]",
                isSmall ? "px-1 py-0 text-[7px] sm:text-[8px]" : ""
              )}
            >
              {childCount} sub-page{childCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
