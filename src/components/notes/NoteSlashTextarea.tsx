"use client";

import {
  ChevronRight,
  FilePlus2,
  ListChecks,
  Minus,
  Table2,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type SlashCommandId = "text" | "checklist" | "subpage" | "database" | "divider";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  description: string;
  icon: LucideIcon;
  replacement: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    description: "Clean writing line",
    icon: Type,
    replacement: "",
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "Track a task",
    icon: ListChecks,
    replacement: "- [ ] ",
  },
  {
    id: "subpage",
    label: "Subpage",
    description: "Placeholder page",
    icon: FilePlus2,
    replacement: "[Subpage: Untitled]",
  },
  {
    id: "database",
    label: "Database",
    description: "Placeholder table",
    icon: Table2,
    replacement: "[Database: Untitled Database]",
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections",
    icon: Minus,
    replacement: "---",
  },
];

const NOTE_SLASH_MENU_OPEN_CLASS = "note-slash-menu-open";
const NOTE_DIVIDER_MARKER = "---";
const NOTE_SUBPAGE_TITLE_FALLBACK = "Untitled";
const NOTE_SUBPAGE_MARKER_REGEX =
  /^\[Subpage:\s*([^\]]+?)\](?:\(creator-subpage:([^)]+)\))?$/;

export const NOTE_DIVIDER_LINE_CLASS =
  "h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(16,185,129,0.16),rgba(255,255,255,0.07),transparent)]";

export type NoteSubpageMarker = {
  title: string;
  subpageId: string | null;
};

export function isStandaloneNoteDividerLine(line: string) {
  return line.trim() === NOTE_DIVIDER_MARKER;
}

export function parseStandaloneNoteSubpageMarker(line: string): NoteSubpageMarker | null {
  const match = line.trim().match(NOTE_SUBPAGE_MARKER_REGEX);
  if (!match) return null;

  return {
    title: match[1]?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK,
    subpageId: match[2]?.trim() || null,
  };
}

let openSlashMenuCount = 0;

type NoteSlashTextareaProps = {
  value: string;
  onValueChange: (value: string) => void;
  onCreateSubpage?: () => Promise<{ id: string; title: string; href?: string } | null>;
  onOpenSubpage?: (subpageId: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
};

export function NoteSlashTextarea({
  value,
  onValueChange,
  onCreateSubpage,
  onOpenSubpage,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: NoteSlashTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const renderLayerRef = useRef<HTMLDivElement | null>(null);
  const suppressNextSubpageClickRef = useRef(false);
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const isMenuOpen = triggerIndex !== null;

  useEffect(() => {
    if (!isMenuOpen) return;

    const roots = [document.documentElement, document.body];
    openSlashMenuCount += 1;
    roots.forEach((root) => root.classList.add(NOTE_SLASH_MENU_OPEN_CLASS));

    return () => {
      openSlashMenuCount = Math.max(0, openSlashMenuCount - 1);

      if (openSlashMenuCount === 0) {
        roots.forEach((root) => root.classList.remove(NOTE_SLASH_MENU_OPEN_CLASS));
      }
    };
  }, [isMenuOpen]);

  useLayoutEffect(() => {
    if (pendingSelection === null) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(pendingSelection, pendingSelection);
    setPendingSelection(null);
  }, [pendingSelection, value]);

  useEffect(() => {
    if (triggerIndex === null) return;

    if (value[triggerIndex] !== "/") {
      setTriggerIndex(null);
    }
  }, [triggerIndex, value]);

  function closeMenu() {
    setTriggerIndex(null);
    setSelectedCommandIndex(0);
  }

  function syncSlashTrigger(nextValue: string, caretPosition: number) {
    if (nextValue[caretPosition - 1] === "/") {
      setTriggerIndex(caretPosition - 1);
      setSelectedCommandIndex(0);
      return;
    }

    if (triggerIndex !== null) {
      const slashWasDeleted = nextValue[triggerIndex] !== "/";
      const caretMovedBeforeTrigger = caretPosition <= triggerIndex;

      if (slashWasDeleted || caretMovedBeforeTrigger) {
        closeMenu();
      }
    }
  }

  function buildStandaloneLineInsertion(
    marker: string,
    beforeSlash: string,
    afterCommand: string,
  ) {
    const currentLineStart = beforeSlash.lastIndexOf("\n") + 1;
    const currentLinePrefix = beforeSlash.slice(currentLineStart);
    const beforeWithoutBlankPrefix =
      currentLinePrefix.trim().length === 0 ? beforeSlash.slice(0, currentLineStart) : beforeSlash;
    const normalizedBefore = beforeWithoutBlankPrefix.replace(/\n{2,}$/, "\n");
    const afterWithoutInlineWhitespace = afterCommand.replace(/^[\t ]*(?=\n|$)/, "");
    const normalizedAfter = afterWithoutInlineWhitespace.replace(/^\n{2,}/, "\n");
    const prefix = normalizedBefore.length > 0 && !normalizedBefore.endsWith("\n") ? "\n" : "";
    const suffix = normalizedAfter.startsWith("\n") ? "" : "\n";
    const insertion = `${prefix}${marker}${suffix}`;
    const nextValue = normalizedBefore + insertion + normalizedAfter;
    const caretPosition = normalizedBefore.length + insertion.length;

    return { caretPosition, nextValue };
  }

  function buildSubpageMarker(subpage: { id?: string | null; title?: string | null }) {
    const title = subpage.title?.trim() || NOTE_SUBPAGE_TITLE_FALLBACK;
    const id = subpage.id?.trim();
    return id ? `[Subpage: ${title}](creator-subpage:${id})` : `[Subpage: ${title}]`;
  }

  function openSubpage(subpageId: string | null) {
    if (!subpageId) return;
    onOpenSubpage?.(subpageId);
  }

  function renderLine(line: string, index: number) {
    if (isStandaloneNoteDividerLine(line)) {
      return (
        <div key={index} className="flex min-h-[1lh] items-center py-0" aria-hidden="true">
          <div className={NOTE_DIVIDER_LINE_CLASS} />
        </div>
      );
    }

    const subpageMarker = parseStandaloneNoteSubpageMarker(line);
    if (subpageMarker) {
      const canOpenSubpage = Boolean(subpageMarker.subpageId && onOpenSubpage);

      return (
        <div key={index} className="flex min-h-[1lh] items-center py-0">
          <button
            type="button"
            disabled={!canOpenSubpage}
            aria-label={
              canOpenSubpage ? `Open subpage ${subpageMarker.title}` : `Subpage ${subpageMarker.title}`
            }
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              suppressNextSubpageClickRef.current = true;
              openSubpage(subpageMarker.subpageId);
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              if (suppressNextSubpageClickRef.current) {
                suppressNextSubpageClickRef.current = false;
                return;
              }

              openSubpage(subpageMarker.subpageId);
            }}
            className={`flex h-7 w-full max-w-[24rem] items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.045] px-2 text-left text-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition ${
              canOpenSubpage
                ? "pointer-events-auto cursor-pointer hover:border-emerald-300/20 hover:bg-white/[0.075] active:scale-[0.995]"
                : "pointer-events-none cursor-default"
            }`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/25 text-white/55">
              <FilePlus2 className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-4">
                {subpageMarker.title}
              </span>
              <span className="block truncate text-[10px] font-medium leading-3 text-white/32">
                Subpage
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
          </button>
        </div>
      );
    }

    return (
      <div key={index} className="min-h-[1lh] whitespace-pre-wrap break-words" aria-hidden="true">
        {line.length > 0 ? line : "\u00a0"}
      </div>
    );
  }

  async function applyCommand(command: SlashCommand) {
    if (triggerIndex === null) return;

    const textarea = textareaRef.current;
    const selectionEnd = textarea?.selectionEnd ?? triggerIndex + 1;
    const replacementEnd = Math.max(selectionEnd, triggerIndex + 1);
    const before = value.slice(0, triggerIndex);
    const after = value.slice(replacementEnd);
    let replacement = command.replacement;

    if (command.id === "subpage" && onCreateSubpage) {
      try {
        const subpage = await onCreateSubpage();
        replacement = subpage ? buildSubpageMarker(subpage) : command.replacement;
      } catch (error) {
        console.error("Failed to create subpage note", { error });
      }
    }

    const { caretPosition, nextValue } = ["divider", "subpage"].includes(command.id)
      ? buildStandaloneLineInsertion(replacement, before, after)
      : {
          caretPosition: triggerIndex + replacement.length,
          nextValue: before + replacement + after,
        };

    onValueChange(nextValue);
    setPendingSelection(caretPosition);
    closeMenu();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isMenuOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedCommandIndex((current) => (current + 1) % SLASH_COMMANDS.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedCommandIndex(
        (current) => (current - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void applyCommand(SLASH_COMMANDS[selectedCommandIndex]);
    }
  }

  return (
    <div className="relative">
      {/* Textarea owns editing; this mirror gives standalone markers visual weight and click targets. */}
      <div
        ref={renderLayerRef}
        className={`${className ?? ""} pointer-events-none absolute inset-0 z-20 overflow-hidden whitespace-pre-wrap break-words`}
      >
        {value.split("\n").map(renderLine)}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onValueChange(nextValue);
          syncSlashTrigger(nextValue, event.target.selectionStart ?? nextValue.length);
        }}
        onKeyDown={handleKeyDown}
        onSelect={(event) => {
          syncSlashTrigger(value, event.currentTarget.selectionStart ?? value.length);
        }}
        onScroll={(event) => {
          if (!renderLayerRef.current) return;

          renderLayerRef.current.scrollTop = event.currentTarget.scrollTop;
          renderLayerRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onBlur={closeMenu}
        placeholder={placeholder}
        className={`${className ?? ""} relative z-10 caret-white selection:bg-emerald-300/25 selection:text-white`}
        style={value.length > 0 ? { color: "transparent" } : undefined}
        aria-label={ariaLabel}
        aria-controls={isMenuOpen ? "note-slash-command-menu" : undefined}
      />

      {isMenuOpen ? (
        <div
          id="note-slash-command-menu"
          role="listbox"
          aria-label="Slash commands"
          className="note-slash-command-menu fixed inset-x-4 z-[60] overflow-y-auto overscroll-contain rounded-[22px] border border-white/10 bg-[#090909]/95 p-1.5 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl md:absolute md:left-0 md:right-auto md:w-80 md:overflow-hidden"
        >
          {SLASH_COMMANDS.map((command, index) => {
            const Icon = command.icon;
            const isSelected = index === selectedCommandIndex;

            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onPointerDown={(event) => {
                  event.preventDefault();
                  void applyCommand(command);
                }}
                onMouseEnter={() => setSelectedCommandIndex(index)}
                className={`flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                  isSelected
                    ? "bg-emerald-400/15 text-emerald-100"
                    : "text-white/82 hover:bg-white/8"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border ${
                    isSelected
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                      : "border-white/10 bg-white/[0.04] text-white/45"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5">{command.label}</span>
                  <span className="block truncate text-xs leading-4 text-white/42">
                    {command.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
