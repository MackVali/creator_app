"use client";

import { useEffect, useRef, useState } from "react";

const ICON_PRESETS = ["📝", "💡", "🎯", "📚", "⚡", "✨", "🔥", "🌿"];
const DEFAULT_NOTE_ICON = "📝";

type NoteEditorHeaderProps = {
  icon?: string | null;
  title: string;
  onIconChange: (icon: string) => void;
  onTitleChange: (title: string) => void;
};

export function NoteEditorHeader({
  icon,
  title,
  onIconChange,
  onTitleChange,
}: NoteEditorHeaderProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const displayIcon = icon?.trim() || DEFAULT_NOTE_ICON;

  useEffect(() => {
    if (!isPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isPickerOpen]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsPickerOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-white/[0.11] bg-white/[0.055] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-18px_rgba(0,0,0,0.95)] outline-none backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-emerald-300/45 focus-visible:ring-2 focus-visible:ring-emerald-300/20"
            aria-label="Change note icon"
            aria-expanded={isPickerOpen}
          >
            <span aria-hidden="true">{displayIcon}</span>
          </button>

          {isPickerOpen ? (
            <div className="absolute left-0 top-12 z-50 w-56 rounded-[18px] border border-white/[0.1] bg-[#090909]/95 p-2 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              <div className="grid grid-cols-4 gap-1.5">
                {ICON_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      onIconChange(preset);
                      setIsPickerOpen(false);
                    }}
                    className={`flex h-9 items-center justify-center rounded-[11px] border text-lg transition ${
                      displayIcon === preset
                        ? "border-emerald-300/35 bg-emerald-300/12"
                        : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]"
                    }`}
                    aria-label={`Use ${preset} icon`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                value={icon ?? ""}
                onChange={(event) => onIconChange(event.target.value.slice(0, 4))}
                maxLength={4}
                className="mt-2 h-9 w-full rounded-[11px] border border-white/[0.09] bg-black/35 px-3 text-center text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                placeholder="Emoji"
                aria-label="Custom note icon"
              />
            </div>
          ) : null}
        </div>

        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[1.55rem] font-semibold leading-10 tracking-normal text-white outline-none placeholder:text-white/28 focus-visible:ring-0 sm:text-[1.7rem]"
          placeholder="Untitled"
          aria-label="Note title"
        />
      </div>

      <div
        className="h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(16,185,129,0.16),rgba(255,255,255,0.07),transparent)]"
        aria-hidden="true"
      />
    </div>
  );
}
