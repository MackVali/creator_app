"use client";

import { Bold, Highlighter, Italic, MoreHorizontal, Palette, Underline } from "lucide-react";
import { type MouseEvent, type PointerEvent, useRef } from "react";
import type { NoteTextFormatCommand } from "@/components/notes/NoteSlashTextarea";

type NoteTextActionBarProps = {
  onFormat: (command: NoteTextFormatCommand) => void;
};

const TEXT_ACTIONS: Array<{
  command: NoteTextFormatCommand;
  label: string;
  icon: typeof Bold;
}> = [
  { command: "bold", label: "Bold", icon: Bold },
  { command: "italic", label: "Italic", icon: Italic },
  { command: "underline", label: "Underline", icon: Underline },
];

const PLACEHOLDER_ACTIONS = [
  // TODO: enable inline color/highlight once note serialization supports it safely.
  { label: "Color", icon: Palette },
  { label: "Highlight", icon: Highlighter },
  { label: "More", icon: MoreHorizontal },
];

export function NoteTextActionBar({ onFormat }: NoteTextActionBarProps) {
  const pointerHandledRef = useRef(false);

  function handlePointerFormat(
    command: NoteTextFormatCommand,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    pointerHandledRef.current = true;
    onFormat(command);
    window.setTimeout(() => {
      pointerHandledRef.current = false;
    }, 0);
  }

  function handleClickFormat(command: NoteTextFormatCommand) {
    if (pointerHandledRef.current) return;
    onFormat(command);
  }

  function handleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div
      data-note-text-action-bar
      className="fixed inset-x-0 z-40 px-3 transition-opacity duration-150"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto max-w-4xl overflow-hidden rounded-full border border-white/[0.08] bg-[#070707]/94 shadow-[0_18px_44px_-26px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl">
        <div className="flex h-11 items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TEXT_ACTIONS.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.command}
                type="button"
                onPointerDown={(event) => handlePointerFormat(action.command, event)}
                onMouseDown={handleMouseDown}
                onClick={() => handleClickFormat(action.command)}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.045] px-2.5 text-xs font-semibold text-white/78 outline-none transition hover:border-white/[0.14] hover:bg-white/[0.075] hover:text-white focus-visible:ring-1 focus-visible:ring-white/24 active:bg-white/[0.11]"
                aria-label={`Format selected note text as ${action.label}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{action.label}</span>
              </button>
            );
          })}

          <div className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.08]" aria-hidden="true" />

          {PLACEHOLDER_ACTIONS.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.label}
                type="button"
                disabled
                title={`${action.label} formatting is not enabled yet`}
                className="flex h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full border border-white/[0.045] bg-white/[0.02] px-2.5 text-xs font-semibold text-white/30 outline-none"
                aria-label={`${action.label} formatting is not enabled yet`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        :global(body.note-slash-menu-open [data-note-text-action-bar]) {
          opacity: 0.22;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
