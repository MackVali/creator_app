"use client";

import { Bold, Highlighter, Italic, Palette, Strikethrough, Underline } from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  normalizeNoteColorValue,
  type NoteHighlightColor,
  type NoteSimpleTextFormat,
  type NoteTextColor,
  type NoteTextFormatAction,
} from "@/components/notes/NoteSlashTextarea";

type NoteTextActionBarProps = {
  onFormat: (action: NoteTextFormatAction) => void;
};

const TEXT_ACTIONS: Array<{
  format: NoteSimpleTextFormat;
  label: string;
  icon: typeof Bold;
}> = [
  { format: "bold", label: "Bold", icon: Bold },
  { format: "italic", label: "Italic", icon: Italic },
  { format: "underline", label: "Underline", icon: Underline },
  { format: "strikethrough", label: "Strikethrough", icon: Strikethrough },
];

const HIGHLIGHT_ACTIONS: Array<{
  color: NoteHighlightColor | "clear";
  label: string;
  className: string;
  indicatorClassName?: string;
}> = [
  { color: "yellow", label: "Yellow highlight", className: "bg-yellow-200/70" },
  { color: "amber", label: "Amber highlight", className: "bg-amber-300/65" },
  { color: "orange", label: "Orange highlight", className: "bg-orange-300/65" },
  { color: "red", label: "Red highlight", className: "bg-red-300/60" },
  { color: "pink", label: "Pink highlight", className: "bg-pink-300/60" },
  { color: "purple", label: "Purple highlight", className: "bg-violet-300/60" },
  { color: "blue", label: "Blue highlight", className: "bg-sky-300/60" },
  { color: "cyan", label: "Cyan highlight", className: "bg-cyan-300/60" },
  { color: "green", label: "Green highlight", className: "bg-emerald-300/60" },
  { color: "mint", label: "Mint highlight", className: "bg-teal-200/60" },
  { color: "gray", label: "Gray highlight", className: "bg-zinc-300/55" },
  {
    color: "clear",
    label: "Clear highlight",
    className: "bg-transparent",
    indicatorClassName:
      "border-white/25 bg-[linear-gradient(135deg,transparent_44%,rgb(248_113_113)_45%,rgb(248_113_113)_55%,transparent_56%)]",
  },
];

const COLOR_ACTIONS: Array<{
  color: NoteTextColor;
  label: string;
  className: string;
  indicatorClassName?: string;
}> = [
  { color: "default", label: "Default text color", className: "bg-white" },
  { color: "gray", label: "Gray text color", className: "bg-zinc-300" },
  { color: "red", label: "Red text color", className: "bg-red-300" },
  { color: "orange", label: "Orange text color", className: "bg-orange-300" },
  { color: "yellow", label: "Yellow text color", className: "bg-yellow-200" },
  { color: "green", label: "Green text color", className: "bg-emerald-300" },
  { color: "mint", label: "Mint text color", className: "bg-teal-200" },
  { color: "cyan", label: "Cyan text color", className: "bg-cyan-200" },
  { color: "blue", label: "Blue text color", className: "bg-sky-300" },
  { color: "purple", label: "Purple text color", className: "bg-violet-300" },
  { color: "pink", label: "Pink text color", className: "bg-pink-300" },
];

export function NoteTextActionBar({ onFormat }: NoteTextActionBarProps) {
  const pointerHandledRef = useRef(false);
  const highlightColorInputRef = useRef<HTMLInputElement | null>(null);
  const textColorInputRef = useRef<HTMLInputElement | null>(null);
  const customColorInputTimerRef = useRef<number | null>(null);
  const [openPalette, setOpenPalette] = useState<"highlight" | "color" | null>(null);

  function handlePointerAction(
    action: NoteTextFormatAction,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    pointerHandledRef.current = true;
    onFormat(action);
  }

  function handleClickAction(action: NoteTextFormatAction) {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    onFormat(action);
  }

  function handlePointerPalette(
    palette: "highlight" | "color",
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    pointerHandledRef.current = true;
    setOpenPalette((currentPalette) => (currentPalette === palette ? null : palette));
  }

  function handleClickPalette(palette: "highlight" | "color") {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    setOpenPalette((currentPalette) => (currentPalette === palette ? null : palette));
  }

  function handlePointerSwatch(
    action: NoteTextFormatAction,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    pointerHandledRef.current = true;
    onFormat(action);
    setOpenPalette(null);
  }

  function handleClickSwatch(action: NoteTextFormatAction) {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }
    onFormat(action);
    setOpenPalette(null);
  }

  function handleMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function clearCustomColorInputTimer() {
    if (customColorInputTimerRef.current === null) return;

    window.clearTimeout(customColorInputTimerRef.current);
    customColorInputTimerRef.current = null;
  }

  function applyCustomColor(palette: "highlight" | "color", rawColor: string) {
    const color = normalizeNoteColorValue(rawColor);
    if (!color) return;

    const action: NoteTextFormatAction =
      palette === "highlight" ? { type: "highlight", color } : { type: "color", color };

    clearCustomColorInputTimer();
    onFormat(action);
    setOpenPalette(null);
  }

  function scheduleCustomColorInput(palette: "highlight" | "color", rawColor: string) {
    clearCustomColorInputTimer();
    customColorInputTimerRef.current = window.setTimeout(() => {
      customColorInputTimerRef.current = null;
      applyCustomColor(palette, rawColor);
    }, 180);
  }

  function handlePointerCustomColor(
    palette: "highlight" | "color",
    event: PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    pointerHandledRef.current = true;
    const input =
      palette === "highlight" ? highlightColorInputRef.current : textColorInputRef.current;
    input?.click();
  }

  function handleClickCustomColor(palette: "highlight" | "color") {
    if (pointerHandledRef.current) {
      pointerHandledRef.current = false;
      return;
    }

    const input =
      palette === "highlight" ? highlightColorInputRef.current : textColorInputRef.current;
    input?.click();
  }

  function handleCustomColorInput(
    palette: "highlight" | "color",
    event: FormEvent<HTMLInputElement>,
  ) {
    scheduleCustomColorInput(palette, event.currentTarget.value);
  }

  function handleCustomColorChange(
    palette: "highlight" | "color",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    applyCustomColor(palette, event.currentTarget.value);
  }

  useEffect(() => {
    if (!openPalette) return;

    function closePaletteFromOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-note-text-action-bar]")) {
        return;
      }

      setOpenPalette(null);
    }

    document.addEventListener("pointerdown", closePaletteFromOutsidePointer, true);

    return () => {
      document.removeEventListener("pointerdown", closePaletteFromOutsidePointer, true);
    };
  }, [openPalette]);

  useEffect(() => {
    return () => {
      clearCustomColorInputTimer();
    };
  }, []);

  return (
    <div
      data-note-text-action-bar
      data-note-palette-open={openPalette ? "true" : undefined}
      className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-40 px-4 transition-opacity duration-150"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-1.5">
        {openPalette ? (
          <div className="grid grid-flow-col grid-rows-2 gap-1.5 rounded-xl border border-white/[0.1] bg-zinc-950/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur">
            {(openPalette === "highlight" ? HIGHLIGHT_ACTIONS : COLOR_ACTIONS).map((action) => {
              const formatAction: NoteTextFormatAction =
                openPalette === "highlight"
                  ? action.color === "clear"
                    ? { type: "clearHighlight" }
                    : { type: "highlight", color: action.color as NoteHighlightColor }
                  : { type: "color", color: action.color as NoteTextColor };

              return (
                <button
                  key={action.color}
                  type="button"
                  onPointerDown={(event) => handlePointerSwatch(formatAction, event)}
                  onMouseDown={handleMouseDown}
                  onClick={() => handleClickSwatch(formatAction)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent bg-white/[0.03] outline-none transition hover:border-white/15 hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-white/25 active:scale-95 active:bg-white/[0.1]"
                  aria-label={action.label}
                  title={action.label}
                >
                  <span
                    className={`h-5 w-5 rounded-full border ${action.indicatorClassName ?? `border-white/20 ${action.className}`}`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}

            <button
              type="button"
              onPointerDown={(event) => handlePointerCustomColor(openPalette, event)}
              onMouseDown={handleMouseDown}
              onClick={() => handleClickCustomColor(openPalette)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent bg-white/[0.03] outline-none transition hover:border-white/15 hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-white/25 active:scale-95 active:bg-white/[0.1]"
              aria-label={
                openPalette === "highlight" ? "Custom highlight color" : "Custom text color"
              }
              title={
                openPalette === "highlight" ? "Custom highlight color" : "Custom text color"
              }
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-[conic-gradient(from_90deg,#ff4f91,#fbbf24,#34d399,#38bdf8,#a78bfa,#ff4f91)] shadow-[inset_0_0_0_2px_rgba(0,0,0,0.45)]"
                aria-hidden="true"
              />
            </button>
            <input
              ref={openPalette === "highlight" ? highlightColorInputRef : textColorInputRef}
              type="color"
              defaultValue="#ff4f91"
              className="sr-only"
              aria-label={
                openPalette === "highlight"
                  ? "Choose custom highlight color"
                  : "Choose custom text color"
              }
              onInput={(event) =>
                handleCustomColorInput(openPalette, event)
              }
              onChange={(event) => handleCustomColorChange(openPalette, event)}
            />
          </div>
        ) : null}

        <div className="flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-black px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TEXT_ACTIONS.map((action) => {
            const Icon = action.icon;
            const formatAction: NoteTextFormatAction = {
              type: "format",
              format: action.format,
            };

            return (
              <button
                key={action.format}
                type="button"
                onPointerDown={(event) => handlePointerAction(formatAction, event)}
                onMouseDown={handleMouseDown}
                onClick={() => handleClickAction(formatAction)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-black text-white/70 outline-none transition hover:bg-white/[0.05] hover:text-white focus-visible:ring-1 focus-visible:ring-white/20 active:bg-white/[0.08]"
                aria-label={`Format selected note text as ${action.label}`}
                title={action.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <button
            type="button"
            onPointerDown={(event) => handlePointerPalette("highlight", event)}
            onMouseDown={handleMouseDown}
            onClick={() => handleClickPalette("highlight")}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border outline-none transition hover:bg-white/[0.05] hover:text-white focus-visible:ring-1 focus-visible:ring-white/20 active:bg-white/[0.08] ${
              openPalette === "highlight"
                ? "border-white/15 bg-white/[0.08] text-white"
                : "border-transparent bg-black text-white/70"
            }`}
            aria-label="Open highlight palette"
            title="Highlight"
            aria-pressed={openPalette === "highlight"}
          >
            <Highlighter className="h-4 w-4" />
            <span
              className="absolute bottom-1 h-0.5 w-4 rounded-full bg-yellow-200/70"
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onPointerDown={(event) => handlePointerPalette("color", event)}
            onMouseDown={handleMouseDown}
            onClick={() => handleClickPalette("color")}
            className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border outline-none transition hover:bg-white/[0.05] hover:text-white focus-visible:ring-1 focus-visible:ring-white/20 active:bg-white/[0.08] ${
              openPalette === "color"
                ? "border-white/15 bg-white/[0.08] text-white"
                : "border-transparent bg-black text-white/70"
            }`}
            aria-label="Open text color palette"
            title="Color"
            aria-pressed={openPalette === "color"}
          >
            <Palette className="h-4 w-4" />
            <span
              className="absolute bottom-1 h-0.5 w-4 rounded-full bg-white"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <style jsx>{`
        :global(
          body:not(:has([data-note-editable-segment-id]:focus))
            [data-note-text-action-bar]:not([data-note-palette-open="true"])
        ) {
          opacity: 0;
          pointer-events: none;
        }

        :global(body.note-slash-menu-open [data-note-text-action-bar]) {
          opacity: 0.22;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
