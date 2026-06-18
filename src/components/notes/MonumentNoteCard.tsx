"use client";

import Link from "next/link";
import {
  Bookmark,
  BookText,
  BookOpenText,
  Bot,
  Brain,
  Brush,
  CalendarCheck,
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

import { cn } from "@/lib/utils";
import type { MonumentNote } from "@/lib/types/monument-note";
import type { NoteCardDensity } from "./NotesHeaderControls";

export const monumentNoteTileOuterClass =
  "goal-card group relative flex aspect-[5/6] min-h-[96px] w-full flex-col rounded-2xl border border-zinc-300/20 bg-[radial-gradient(circle_at_0%_0%,rgba(255,255,255,0.12),transparent_56%),linear-gradient(140deg,rgba(8,8,10,0.98)_0%,rgba(18,18,21,0.96)_48%,rgba(42,42,48,0.72)_100%)] p-3 text-white shadow-[0_18px_38px_-30px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(255,255,255,0.06)] transition duration-200 select-none hover:-translate-y-px hover:border-zinc-100/30 sm:p-4";

const lucideNoteIcons: Record<string, LucideIcon> = {
  bookopentext: BookOpenText,
  booktext: BookText,
  bookmark: Bookmark,
  bot: Bot,
  brain: Brain,
  brush: Brush,
  calendarcheck: CalendarCheck,
  checksquare: CheckSquare,
  circlealert: CircleAlert,
  circlehelp: CircleHelp,
  clipboardcheck: ClipboardCheck,
  clock: Clock,
  code2: Code2,
  compass: Compass,
  cpu: Cpu,
  crosshair: Crosshair,
  database: Database,
  dumbbell: Dumbbell,
  eye: Eye,
  file: File,
  fileplus2: FilePlus2,
  files: Files,
  filetext: FileText,
  flame: Flame,
  gem: Gem,
  headphones: Headphones,
  keyround: KeyRound,
  leaf: Leaf,
  library: Library,
  lightbulb: Lightbulb,
  listchecks: ListChecks,
  listtodo: ListTodo,
  lock: Lock,
  map: Map,
  messagesquaretext: MessageSquareText,
  messagessquare: MessagesSquare,
  mic: Mic,
  microscope: Microscope,
  mountain: Mountain,
  music: Music,
  newspaper: Newspaper,
  notebookpen: NotebookPen,
  palette: Palette,
  pentool: PenTool,
  pencil: Pencil,
  quote: Quote,
  route: Route,
  scrolltext: ScrollText,
  search: Search,
  shield: Shield,
  shirt: Shirt,
  sparkles: Sparkles,
  sprout: Sprout,
  star: Star,
  stickynote: StickyNote,
  target: Target,
  telescope: Telescope,
  terminal: Terminal,
  timer: Timer,
  trianglealert: TriangleAlert,
  wandsparkles: WandSparkles,
  zap: Zap,
};

interface MonumentNoteCardProps {
  note: MonumentNote;
  monumentId: string;
  onToggleBookmark?: (noteId: string) => void;
  density?: NoteCardDensity;
}

function getMonumentNoteIcon(
  iconValue?: string | null
): { kind: "lucide"; Icon: LucideIcon } | { kind: "emoji"; emoji: string } {
  const value = iconValue?.trim();
  const icon = value?.toLowerCase();

  if (!icon) return { kind: "lucide", Icon: NotebookPen };

  if (icon.startsWith("lucide:")) {
    return {
      kind: "lucide",
      Icon: lucideNoteIcons[icon.slice("lucide:".length)] ?? NotebookPen,
    };
  }

  if (/\p{Extended_Pictographic}/u.test(value ?? "")) {
    return { kind: "emoji", emoji: value ?? "" };
  }

  switch (icon) {
    case "idea":
      return { kind: "lucide", Icon: Lightbulb };
    case "brain":
    case "thought":
    case "insight":
      return { kind: "lucide", Icon: Brain };
    case "journal":
    case "book":
      return { kind: "lucide", Icon: BookOpenText };
    case "log":
    case "scroll":
      return { kind: "lucide", Icon: ScrollText };
    case "message":
    case "chat":
      return { kind: "lucide", Icon: MessageSquareText };
    case "task":
    case "todo":
    case "check":
      return { kind: "lucide", Icon: ListTodo };
    case "target":
    case "goal":
      return { kind: "lucide", Icon: Target };
    case "spark":
    case "sparkles":
    case "magic":
      return { kind: "lucide", Icon: Sparkles };
    case "file":
      return { kind: "lucide", Icon: FileText };
    case "note":
    default:
      return { kind: "lucide", Icon: NotebookPen };
  }
}

export function MonumentNoteCard({
  note,
  monumentId,
  onToggleBookmark,
  density = "large",
}: MonumentNoteCardProps) {
  const titleLine =
    note.title?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Open this note to add a title.";

  const noteIcon = getMonumentNoteIcon(note.icon);
  const NoteIcon = noteIcon.kind === "lucide" ? noteIcon.Icon : null;
  const isSmall = density === "small";

  return (
    <Link
      href={`/monuments/${monumentId}/notes/${note.id}`}
      className={cn(
        monumentNoteTileOuterClass,
        isSmall ? "aspect-square min-h-[70px] rounded-xl p-2 sm:min-h-[78px] sm:p-2.5" : ""
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          onToggleBookmark?.(note.id);
        }}
        className={cn(
          "absolute right-2 top-2 z-[3] rounded-full p-1 text-white/38 transition hover:bg-white/[0.08] hover:text-white/75",
          isSmall ? "right-1.5 top-1.5 p-0.5" : ""
        )}
        aria-label={note.isBookmarked ? "Unbookmark note" : "Bookmark note"}
      >
        <Bookmark
          className={cn(
            "h-3 w-3",
            isSmall ? "h-2.5 w-2.5" : "",
            note.isBookmarked ? "fill-white/75 text-white/75" : "text-current"
          )}
        />
      </button>
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div
          className={cn(
            "flex w-full min-w-0 flex-col items-center justify-center gap-1.5",
            isSmall ? "gap-1" : ""
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[10px] font-semibold leading-none text-white shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10 sm:text-xs",
              isSmall ? "h-7 w-7 rounded-md text-[9px] sm:h-8 sm:w-8 sm:text-[10px]" : ""
            )}
          >
            {NoteIcon ? (
              <NoteIcon
                className={cn(
                  "h-3.5 w-3.5 text-zinc-500 sm:h-4 sm:w-4",
                  isSmall ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : ""
                )}
                aria-hidden="true"
              />
            ) : (
              <span aria-hidden="true">{noteIcon.emoji}</span>
            )}
          </div>
          <div className="flex w-full min-w-0 items-center justify-center">
            <span
              className={cn(
                "line-clamp-3 w-full min-w-0 break-words px-0.5 text-center text-[9px] font-semibold leading-tight text-white whitespace-normal sm:text-[10px]",
                isSmall ? "line-clamp-2 text-[8px] sm:text-[9px]" : ""
              )}
              style={{ hyphens: "auto" }}
            >
              {titleLine}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
