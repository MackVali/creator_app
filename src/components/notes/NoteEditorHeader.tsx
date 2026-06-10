"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookText,
  BookOpenText,
  Bookmark,
  Bot,
  Brain,
  Brush,
  CalendarCheck,
  ChevronLeft,
  CheckSquare,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Code2,
  Compass,
  Cpu,
  Crosshair,
  Database,
  Dumbbell,
  Eye,
  File,
  FilePlus2,
  Files,
  FileText,
  Flame,
  Gem,
  Headphones,
  KeyRound,
  Library,
  Leaf,
  Lightbulb,
  ListChecks,
  ListTodo,
  Lock,
  Map,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Microscope,
  Mountain,
  Music,
  Newspaper,
  NotebookPen,
  Palette,
  PenTool,
  Pencil,
  Quote,
  Route,
  Search,
  ScrollText,
  Shield,
  Shirt,
  Sparkles,
  Sprout,
  Star,
  StickyNote,
  Target,
  Telescope,
  Terminal,
  Timer,
  TriangleAlert,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";

const DEFAULT_NOTE_ICON = "lucide:NotebookPen";

type NoteIconPreset = {
  value: `lucide:${string}`;
  label: string;
  icon: LucideIcon;
  keywords: string[];
};

const LUCIDE_ICON_PRESETS: NoteIconPreset[] = [
  {
    value: "lucide:NotebookPen",
    label: "Note",
    icon: NotebookPen,
    keywords: ["notebook", "writing", "notes", "journal", "draft"],
  },
  { value: "lucide:FileText", label: "Document", icon: FileText, keywords: ["file", "text", "paper", "doc"] },
  { value: "lucide:File", label: "File", icon: File, keywords: ["document", "page", "blank"] },
  { value: "lucide:Files", label: "Files", icon: Files, keywords: ["documents", "pages", "collection"] },
  { value: "lucide:FilePlus2", label: "New File", icon: FilePlus2, keywords: ["add", "create", "document"] },
  {
    value: "lucide:BookOpenText",
    label: "Journal",
    icon: BookOpenText,
    keywords: ["book", "open", "study", "reading", "notes"],
  },
  { value: "lucide:BookText", label: "Book", icon: BookText, keywords: ["reading", "reference", "chapter"] },
  { value: "lucide:ScrollText", label: "Log", icon: ScrollText, keywords: ["scroll", "record", "history"] },
  { value: "lucide:StickyNote", label: "Sticky", icon: StickyNote, keywords: ["memo", "reminder", "post", "quick"] },
  { value: "lucide:Newspaper", label: "Article", icon: Newspaper, keywords: ["news", "brief", "publication"] },
  { value: "lucide:Library", label: "Library", icon: Library, keywords: ["books", "archive", "reference"] },
  { value: "lucide:Lightbulb", label: "Idea", icon: Lightbulb, keywords: ["thought", "inspiration", "concept"] },
  { value: "lucide:Brain", label: "Insight", icon: Brain, keywords: ["brain", "thought", "mind", "idea", "reflection"] },
  { value: "lucide:Eye", label: "Observation", icon: Eye, keywords: ["see", "view", "watch", "notice"] },
  { value: "lucide:Telescope", label: "Research", icon: Telescope, keywords: ["explore", "discover", "future"] },
  { value: "lucide:Microscope", label: "Analysis", icon: Microscope, keywords: ["science", "detail", "study"] },
  { value: "lucide:Search", label: "Search", icon: Search, keywords: ["find", "lookup", "investigate"] },
  {
    value: "lucide:MessageSquareText",
    label: "Message",
    icon: MessageSquareText,
    keywords: ["chat", "comment", "conversation"],
  },
  { value: "lucide:MessagesSquare", label: "Discussion", icon: MessagesSquare, keywords: ["chat", "meeting", "thread"] },
  { value: "lucide:Quote", label: "Quote", icon: Quote, keywords: ["citation", "excerpt", "reference"] },
  { value: "lucide:PenTool", label: "Draft", icon: PenTool, keywords: ["pen", "write", "compose", "design"] },
  { value: "lucide:Pencil", label: "Edit", icon: Pencil, keywords: ["write", "sketch", "revise"] },
  { value: "lucide:Brush", label: "Creative", icon: Brush, keywords: ["paint", "art", "style"] },
  { value: "lucide:Palette", label: "Design", icon: Palette, keywords: ["color", "art", "creative"] },
  { value: "lucide:Sparkles", label: "Spark", icon: Sparkles, keywords: ["magic", "shine", "fresh"] },
  { value: "lucide:WandSparkles", label: "Magic", icon: WandSparkles, keywords: ["wand", "generate", "polish"] },
  { value: "lucide:Gem", label: "Gem", icon: Gem, keywords: ["valuable", "premium", "favorite"] },
  { value: "lucide:Target", label: "Target", icon: Target, keywords: ["goal", "focus", "objective"] },
  { value: "lucide:Crosshair", label: "Focus", icon: Crosshair, keywords: ["aim", "precision", "target"] },
  { value: "lucide:Route", label: "Plan", icon: Route, keywords: ["path", "roadmap", "steps"] },
  { value: "lucide:Map", label: "Map", icon: Map, keywords: ["location", "plan", "travel"] },
  { value: "lucide:Compass", label: "Direction", icon: Compass, keywords: ["navigate", "north", "guide"] },
  { value: "lucide:ListTodo", label: "Todo", icon: ListTodo, keywords: ["task", "checklist", "plan"] },
  { value: "lucide:ListChecks", label: "Checklist", icon: ListChecks, keywords: ["tasks", "done", "complete"] },
  { value: "lucide:CheckSquare", label: "Complete", icon: CheckSquare, keywords: ["check", "done", "success"] },
  { value: "lucide:ClipboardCheck", label: "Review", icon: ClipboardCheck, keywords: ["approve", "audit", "done"] },
  { value: "lucide:CalendarCheck", label: "Schedule", icon: CalendarCheck, keywords: ["date", "event", "calendar"] },
  { value: "lucide:Clock", label: "Time", icon: Clock, keywords: ["hour", "deadline", "history"] },
  { value: "lucide:Timer", label: "Timer", icon: Timer, keywords: ["countdown", "sprint", "duration"] },
  { value: "lucide:Flame", label: "Fire", icon: Flame, keywords: ["hot", "streak", "energy"] },
  { value: "lucide:Zap", label: "Energy", icon: Zap, keywords: ["bolt", "power", "fast"] },
  { value: "lucide:Leaf", label: "Nature", icon: Leaf, keywords: ["growth", "green", "calm"] },
  { value: "lucide:Sprout", label: "Growth", icon: Sprout, keywords: ["plant", "seed", "new"] },
  { value: "lucide:Mountain", label: "Challenge", icon: Mountain, keywords: ["peak", "goal", "climb"] },
  { value: "lucide:Dumbbell", label: "Training", icon: Dumbbell, keywords: ["fitness", "workout", "strength"] },
  { value: "lucide:Music", label: "Music", icon: Music, keywords: ["song", "audio", "sound"] },
  { value: "lucide:Headphones", label: "Listen", icon: Headphones, keywords: ["audio", "podcast", "focus"] },
  { value: "lucide:Mic", label: "Voice", icon: Mic, keywords: ["record", "audio", "speech"] },
  { value: "lucide:Shirt", label: "Style", icon: Shirt, keywords: ["clothes", "outfit", "fashion"] },
  { value: "lucide:Code2", label: "Code", icon: Code2, keywords: ["programming", "developer", "software"] },
  { value: "lucide:Terminal", label: "Terminal", icon: Terminal, keywords: ["command", "shell", "code"] },
  { value: "lucide:Database", label: "Data", icon: Database, keywords: ["storage", "sql", "records"] },
  { value: "lucide:Cpu", label: "System", icon: Cpu, keywords: ["chip", "hardware", "compute"] },
  { value: "lucide:Bot", label: "AI", icon: Bot, keywords: ["assistant", "robot", "automation"] },
  { value: "lucide:Shield", label: "Secure", icon: Shield, keywords: ["protection", "safety", "defense"] },
  { value: "lucide:Lock", label: "Private", icon: Lock, keywords: ["security", "locked", "secret"] },
  { value: "lucide:KeyRound", label: "Access", icon: KeyRound, keywords: ["key", "password", "unlock"] },
  { value: "lucide:CircleAlert", label: "Alert", icon: CircleAlert, keywords: ["warning", "important", "notice"] },
  { value: "lucide:TriangleAlert", label: "Warning", icon: TriangleAlert, keywords: ["risk", "caution", "issue"] },
  { value: "lucide:CircleHelp", label: "Question", icon: CircleHelp, keywords: ["help", "unknown", "support"] },
  { value: "lucide:Star", label: "Star", icon: Star, keywords: ["favorite", "priority", "highlight"] },
  { value: "lucide:Bookmark", label: "Bookmark", icon: Bookmark, keywords: ["saved", "mark", "favorite"] },
];

const iconButtonBaseClass =
  "flex h-9 w-full items-center justify-center rounded-[11px] border transition";
const iconButtonSelectedClass = "border-emerald-300/35 bg-emerald-300/12 text-emerald-100";
const iconButtonIdleClass = "border-white/[0.08] bg-white/[0.04] text-white/78 hover:bg-white/[0.08]";

function resolveNoteIcon(
  iconValue?: string | null,
): { kind: "lucide"; Icon: LucideIcon } | { kind: "emoji"; emoji: string } {
  const value = iconValue?.trim() || DEFAULT_NOTE_ICON;
  const lucidePreset = LUCIDE_ICON_PRESETS.find((preset) => preset.value === value);

  if (lucidePreset) return { kind: "lucide", Icon: lucidePreset.icon };
  if (value.startsWith("lucide:")) return { kind: "lucide", Icon: NotebookPen };

  return { kind: "emoji", emoji: value };
}

type NoteEditorHeaderProps = {
  icon?: string | null;
  title: string;
  onIconChange: (icon: string) => void;
  onTitleChange: (title: string) => void;
  onBack?: () => void;
  autosaveLabel?: string;
};

export function NoteEditorHeader({
  icon,
  title,
  onIconChange,
  onTitleChange,
  onBack,
  autosaveLabel,
}: NoteEditorHeaderProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const currentIconValue = icon?.trim() || DEFAULT_NOTE_ICON;
  const normalizedIconSearch = iconSearch.trim().toLowerCase();
  const filteredLucideIcons = normalizedIconSearch
    ? LUCIDE_ICON_PRESETS.filter((preset) =>
        [preset.label, preset.value.replace("lucide:", ""), ...preset.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalizedIconSearch),
      )
    : LUCIDE_ICON_PRESETS;
  const resolvedIcon = resolveNoteIcon(icon);
  const TriggerIcon = resolvedIcon.kind === "lucide" ? resolvedIcon.Icon : null;
  const customEmojiValue = currentIconValue.startsWith("lucide:") ? "" : currentIconValue;

  useEffect(() => {
    if (!isPickerOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsPickerOpen(false);
        setIconSearch("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isPickerOpen]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 sm:gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 outline-none transition hover:bg-white/[0.06] hover:text-white/82 focus-visible:ring-2 focus-visible:ring-emerald-300/20"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        <div ref={pickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setIsPickerOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-white/[0.11] bg-white/[0.055] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-18px_rgba(0,0,0,0.95)] outline-none backdrop-blur-xl transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:border-emerald-300/45 focus-visible:ring-2 focus-visible:ring-emerald-300/20"
            aria-label="Change note icon"
            aria-expanded={isPickerOpen}
          >
            {TriggerIcon ? (
              <TriggerIcon className="h-5 w-5 text-white/85" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{resolvedIcon.emoji}</span>
            )}
          </button>

          {isPickerOpen ? (
            <div className="absolute left-0 top-12 z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-[18px] border border-white/[0.1] bg-[#090909]/95 p-2 shadow-[0_24px_70px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-white/35">
                  Custom emoji
                </div>
                <input
                  value={customEmojiValue}
                  onChange={(event) => onIconChange(event.target.value.slice(0, 4))}
                  maxLength={4}
                  className="h-8 w-20 rounded-[10px] border border-white/[0.09] bg-black/35 px-2 text-center text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                  placeholder="Paste"
                  aria-label="Custom note icon"
                />
              </div>

              <input
                value={iconSearch}
                onChange={(event) => setIconSearch(event.target.value)}
                className="h-8 w-full rounded-[10px] border border-white/[0.09] bg-black/35 px-3 text-[0.78rem] text-white outline-none placeholder:text-white/30 focus:border-emerald-300/35 focus:ring-2 focus:ring-emerald-300/10"
                placeholder="Search icons"
                aria-label="Search icons"
              />

              <div className="mt-3 px-1 pb-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-white/35">
                SVG icons
              </div>
              <div className="max-h-64 overflow-y-auto pr-1">
                {filteredLucideIcons.length > 0 ? (
                  <div className="grid grid-cols-5 gap-1.5">
                    {filteredLucideIcons.map((preset) => {
                      const PresetIcon = preset.icon;

                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            onIconChange(preset.value);
                            setIsPickerOpen(false);
                            setIconSearch("");
                          }}
                          className={`${iconButtonBaseClass} ${
                            currentIconValue === preset.value ? iconButtonSelectedClass : iconButtonIdleClass
                          }`}
                          title={preset.label}
                          aria-label={`Use ${preset.label} icon`}
                        >
                          <PresetIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[11px] border border-white/[0.08] bg-white/[0.035] px-3 py-4 text-center text-[0.75rem] text-white/40">
                    No icons found
                  </div>
                )}
              </div>
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

        {autosaveLabel ? (
          <p className="shrink-0 text-[10px] font-medium leading-none text-white/35 sm:text-[11px]">
            {autosaveLabel}
          </p>
        ) : null}
      </div>

      <div
        className="h-px w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),rgba(16,185,129,0.16),rgba(255,255,255,0.07),transparent)]"
        aria-hidden="true"
      />
    </div>
  );
}
