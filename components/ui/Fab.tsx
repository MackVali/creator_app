"use client";

import * as React from "react";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useId,
  type HTMLAttributes,
  type RefObject,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useDragControls,
  animate,
  useReducedMotion,
  type PanInfo,
} from "framer-motion";
import {
  CircleDot,
  Check,
  Clock,
  Filter,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  Search,
  Settings2,
  Brain,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import FlameEmber, {
  type FlameEmberProps,
  type FlameLevel,
} from "@/components/FlameEmber";
import { EventModal } from "./EventModal";
import { NoteModal } from "./NoteModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { PostModal } from "./PostModal";
import { cn } from "@/lib/utils";
import { DayTimeline } from "@/components/schedule/DayTimeline";
import {
  DayType24hPreview,
  type DayType24hPreviewBlock,
} from "@/components/schedule/DayType24hPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSelectContext,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToastHelpers } from "./toast";
import { teardownFabViewportState } from "./fabViewportCleanup";
import { getSupabaseBrowser } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import { DEFAULT_MEMO_DATABASE_TARGETS } from "@/lib/skillStarterNotes";
import { getGoalsForUser, type Goal } from "@/lib/queries/goals";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getProjectsForUser, type Project } from "@/lib/queries/projects";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import { normalizeHabitType } from "@/lib/scheduler/habits";
import { enforceHabitLimit } from "@/lib/habits/enforceHabitLimit";
import { useProjectedGlobalRank } from "@/lib/hooks/useProjectedGlobalRank";
import { useLocationContexts } from "@/lib/hooks/useLocationContexts";
import {
  addCampaignToRoadmap,
  addGoalToCampaign,
  createCampaign,
  type CampaignSchedulingState,
} from "@/lib/queries/roadmaps";
import { isValidUuid } from "@/lib/location-metadata";
import {
  HABIT_RECURRENCE_OPTIONS,
  HABIT_TYPE_OPTIONS,
} from "@/components/habits/habit-form-fields";
import { SCHEDULER_PRIORITY_LABELS } from "@/lib/types/ai";
import type {
  AiIntent,
  AiIntentResponse,
  AiScope,
  AiSchedulerOp,
  AiThreadPayload,
} from "@/lib/types/ai";
import { useEntitlement } from "@/components/entitlement/EntitlementProvider";
import { PaywallModal } from "@/components/billing/PaywallModal";
import {
  LimitErrorCode,
  LimitReachedError,
  getLimitCodeFromError,
} from "@/lib/goals/persistGoalUpdate";
import { deleteGoalCascade } from "@/lib/goals/deleteGoalCascade";
import type { FabCreationRequest } from "@/components/ui/FabCreationContext";

function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = React.useState<Error | null>(null);
  if (err) {
    return (
      <div className="mt-2 rounded-md border border-red-500/50 bg-red-500/10 p-2 text-xs">
        <div className="font-semibold">Render error:</div>
        <pre className="whitespace-pre-wrap break-words">
          {String(err?.message || err)}
        </pre>
      </div>
    );
  }
  return (
    <React.Suspense
      fallback={<div className="text-xs opacity-60">Loading…</div>}
    >
      <BoundarySetter onError={setErr}>{children}</BoundarySetter>
    </React.Suspense>
  );
}

function BoundarySetter({
  onError,
  children,
}: {
  onError: (e: Error) => void;
  children: React.ReactNode;
}) {
  try {
    return <>{children}</>;
  } catch (e: unknown) {
    onError(e instanceof Error ? e : new Error(String(e)));
    return null;
  }
}

function DebugPanel({
  expanded,
  selected,
}: {
  expanded: boolean;
  selected: string | null;
}) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 rounded bg-black/50 px-2 py-1 text-[10px] leading-none">
      <span>expanded:</span> {String(expanded)}{" "}
      <span className="ml-2">selected:</span> {selected ?? "null"}
    </div>
  );
}

export interface FabProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  menuVariant?: "default" | "timeline";
  swipeUpToOpen?: boolean;
  editTarget?: FabEditTarget | null;
  onEditTargetChange?: (target: FabEditTarget) => void;
  onEditTargetConsumed?: () => void;
  onEditClose?: () => void;
  onEditSaved?: (target: FabEditTarget) => void;
  hideLauncher?: boolean;
  portalToBody?: boolean;
  openOnMount?: boolean;
  creationRequest?: FabCreationRequest | null;
}

type CreationType = "GOAL" | "PROJECT" | "TASK" | "HABIT";
type FabEditOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  boxShadow?: string;
};
type FabCreationSpawnOrigin = {
  type: CreationType;
  rect: FabEditOriginRect;
  nonce: number;
};
type FabCreationRevealGeometry = {
  x: number;
  y: number;
  radius: number;
  nonce: number;
};
type FabAiOverlayOrigin = {
  top: number;
  left: number;
  width: number;
  height: number;
  targetTop: number;
  targetLeft: number;
  targetWidth: number;
  targetHeight: number;
  borderRadius: string;
  borderColor: string;
  backgroundColor: string;
  backgroundImage: string;
  boxShadow: string;
};
type FabGoalEditRow = {
  id: string;
  name: string | null;
  priority: string | null;
  energy: string | null;
  priority_code?: string | null;
  energy_code?: string | null;
  why?: string | null;
  monument_id?: string | null;
  circle_id?: string | null;
  roadmap_id?: string | null;
  due_date?: string | null;
};
type FabGoalCampaignRow = {
  campaign_id: string | null;
  position?: number | null;
};
type FabGoalCampaignContextRow = {
  id: string;
  name: string;
  emoji: string | null;
  roadmap_id: string | null;
  primary_monument_id: string | null;
  primary_circle_id?: string | null;
  scheduling_state: CampaignSchedulingState | null;
  position: number | null;
};
type FabRoadmapContextRow = {
  id: string;
  monument_id: string | null;
  circle_id?: string | null;
};
type FabProjectEditRow = {
  id: string;
  name: string | null;
  goal_id: string | null;
  stage: string | null;
  duration_min: number | null;
  priority: string | null;
  energy: string | null;
  why: string | null;
  due_date: string | null;
};
type FabProjectScheduleInstanceRow = {
  id: string;
  duration_min: number | null;
  energy_resolved: string | null;
};
type FabLockedScheduleInstanceRow = {
  id: string;
  start_utc: string | null;
  end_utc: string | null;
};
type FabTaskEditRow = {
  id: string;
  name: string | null;
  project_id: string | null;
  priority: string | null;
  energy: string | null;
  stage: string | null;
  duration_min: number | null;
  skill_id: string | null;
  why: string | null;
};
type FabTagRelationRow = {
  tag_id: string | null;
};
type CreatorEntitySavedEventDetail = {
  entityType: CreationType;
  entityId: string;
  action: "created" | "updated" | "deleted";
  monumentId?: string | null;
  circleId?: string | null;
};
type FabGoalDeleteConfirmTarget = {
  goalName: string;
  projectCount: number | null;
};
export type FabEditTarget = {
  entityType: CreationType;
  entityId: string;
  instanceId?: string | null;
  title?: string | null;
  layoutId?: string | null;
  originRect?: FabEditOriginRect | null;
};
type TagEntityType = CreationType;
type CreationFormMode =
  | "main"
  | "projects"
  | "tags"
  | "tasks"
  | "advanced"
  | "memoForms";
type CreationModeOption = {
  id: CreationFormMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
type MemoCaptureActionDraft = {
  note: boolean;
  form: boolean;
  photo: false;
};
type MemoCaptureConfigJson =
  Database["public"]["Tables"]["habits"]["Insert"]["memo_capture_config"];
type MemoCaptureToggleAction = "note" | "form";
type MemoDatabaseTargetOption = {
  id: string;
  label: string;
};

const MEMO_DATABASE_TARGET_OPTIONS: MemoDatabaseTargetOption[] =
  DEFAULT_MEMO_DATABASE_TARGETS.map((target) => ({
    id: target.id,
    label: target.label,
  }));

type FabTag = {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  color: string | null;
};
type FabTagInsertPayload = {
  user_id: string;
  name: string;
  normalized_name: string;
};
type FabTagFilterBuilder = {
  eq: (column: string, value: string) => FabTagFilterBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};
type FabTagInsertBuilder = {
  select: (columns: string) => {
    single: () => Promise<{ data: unknown; error: unknown }>;
  };
};
type FabTagTableClient = {
  from: (table: "tags") => {
    insert: (payload: FabTagInsertPayload) => FabTagInsertBuilder;
    select: (columns: string) => FabTagFilterBuilder;
  };
};

type DraftProjectChild = {
  tempId: string;
  name: string;
  priority: string;
  energy: string;
  stage: string;
  why: string;
  durationMin: number | null;
  dueDate: string | null;
  skillIds: string[];
};

type DraftTaskChild = {
  tempId: string;
  name: string;
  priority: string;
  energy: string;
  stage: string;
  why: string;
  durationMin: number | null;
  skillId: string | null;
  dueDate: string | null;
};

type EditGoalProjectChild = {
  id: string;
  name: string;
  stage: string | null;
  priority: string | null;
  energy: string | null;
  durationMin: number | null;
  dueDate: string | null;
  skillIds: string[];
};

type EditProjectTaskChild = {
  id: string;
  name: string;
  stage: string | null;
  skillId: string | null;
  dueDate: string | null;
};

type NestedDraftPanel = "goal-project" | "project-task" | null;

type FabSearchResult = {
  id: string;
  name: string;
  type: "PROJECT" | "HABIT";
  nextScheduledAt: string | null;
  scheduleInstanceId: string | null;
  durationMinutes: number | null;
  nextDueAt: string | null;
  completedAt: string | null;
  isCompleted: boolean;
  global_rank?: number | null;
  habitType?: string | null;
  goalId?: string | null;
  goalName?: string | null;
  energy?: string | null;
  skillId?: string | null;
  skill_id?: string | null;
  skillIds?: string[] | null;
  monumentId?: string | null;
  monument_id?: string | null;
  priority?: string | null;
  priority_label?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  goalMonumentId?: string | null;
};

type DragPointerInfo = {
  clientX: number;
  clientY: number;
  pointerId?: number | null;
  pointerType?: string | null;
};
type OverlaySortMode =
  | "recent"
  | "alphabetical"
  | "priority"
  | "global_rank"
  | "scheduled";
type OverlayEventTypeFilter = "ALL" | "PROJECT" | "HABIT";
const OVERLAY_SORT_OPTIONS: { value: OverlaySortMode; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "priority", label: "Priority" },
  { value: "global_rank", label: "Global rank" },
  { value: "scheduled", label: "Scheduled order" },
];

type FabSearchCursor = {
  startUtc: string;
  sourceType: "PROJECT" | "HABIT";
  sourceId: string;
};

type GoalCampaignOption = {
  id: string;
  name: string;
  emoji: string | null;
  roadmap_id: string | null;
  primary_monument_id: string | null;
  primary_circle_id?: string | null;
  scheduling_state: CampaignSchedulingState;
  position: number | null;
};

type GoalRelationType = "MONUMENT" | "CIRCLE" | null;

type GoalCircleOption = {
  id: string;
  name: string;
  circle_type?: string | null;
  viewerRole?: string | null;
};

type GoalRelationResolution = {
  selectedMonumentId: string | null;
  selectedCircleId: string | null;
  error: string | null;
};

type GoalCampaignCreateRowProps = {
  active: boolean;
  value: string;
  emoji: string;
  error: string | null;
  loading: boolean;
  onStart: () => void;
  onChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function GoalCampaignCreateRow({
  active,
  value,
  emoji,
  error,
  loading,
  onStart,
  onChange,
  onEmojiChange,
  onSubmit,
  onCancel,
}: GoalCampaignCreateRowProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const trimmedValue = value.trim();
  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  if (!active) {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStart();
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>Create campaign</span>
      </button>
    );
  }

  return (
    <div
      className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-2"
      onClick={(event) => event.stopPropagation()}
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSubmit();
        }}
      >
        <Input
          value={emoji}
          onChange={(event) => onEmojiChange(event.target.value)}
          onKeyDown={handleFieldKeyDown}
          maxLength={8}
          aria-label="Campaign emoji"
          disabled={loading}
          className="h-9 w-11 shrink-0 rounded-sm border-white/10 bg-black/30 px-1 text-center text-lg focus:border-zinc-500 focus-visible:ring-0"
        />
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleFieldKeyDown}
          placeholder="Campaign name"
          disabled={loading}
          className="h-9 min-w-0 flex-1 rounded-sm border-white/10 bg-black/30 px-2.5 text-xs focus:border-zinc-500 focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={loading || trimmedValue.length === 0}
          className="h-9 w-9 rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
          aria-label="Create campaign"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          disabled={loading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }}
          className="h-9 w-9 rounded-lg border border-white/10 bg-transparent text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="Cancel campaign creation"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      {error ? <p className="px-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

type FabHabitRoutineCreateRowProps = {
  active: boolean;
  value: string;
  emoji: string;
  error: string | null;
  onStart: () => void;
  onChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onSubmit: () => boolean;
  onCancel: () => void;
};

function FabHabitRoutineCreateRow({
  active,
  value,
  emoji,
  error,
  onStart,
  onChange,
  onEmojiChange,
  onSubmit,
  onCancel,
}: FabHabitRoutineCreateRowProps) {
  const { setIsOpen } = useSelectContext();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const trimmedValue = value.trim();
  const stopSelectEvent = (
    event:
      | React.PointerEvent<HTMLElement>
      | React.MouseEvent<HTMLElement>
      | React.KeyboardEvent<HTMLElement>,
  ) => {
    event.stopPropagation();
  };
  const handleFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  React.useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-white/90 transition hover:bg-white/[0.06]"
        onPointerDown={stopSelectEvent}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStart();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onStart();
          }
        }}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Create routine</span>
      </button>
    );
  }

  return (
    <div
      className="w-full rounded-lg border border-white/[0.06] bg-[#070a10]/90 p-1.5"
      onPointerDown={stopSelectEvent}
      onMouseDown={stopSelectEvent}
      onClick={stopSelectEvent}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <form
        className="flex w-full min-w-0 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onSubmit()) {
            setIsOpen?.(false);
          }
        }}
      >
        <Input
          value={emoji}
          onChange={(event) => onEmojiChange(event.target.value)}
          onKeyDown={handleFieldKeyDown}
          maxLength={8}
          aria-label="Routine emoji"
          className="h-9 w-11 shrink-0 rounded-lg border-white/[0.08] bg-[#05070b] px-1 text-center text-lg focus:border-white/25 focus-visible:ring-0"
        />
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleFieldKeyDown}
          placeholder="Routine name"
          aria-label="Routine name"
          className="h-9 min-w-0 flex-1 rounded-lg border-white/[0.08] bg-[#05070b] px-2.5 text-xs focus:border-white/25 focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={trimmedValue.length === 0}
          className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.08] bg-black/30 text-white hover:bg-white/[0.08] disabled:opacity-50"
          aria-label="Use new routine"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }}
          className="h-9 w-9 shrink-0 rounded-lg border border-white/[0.08] bg-transparent text-white/75 hover:bg-white/[0.06] hover:text-white"
          aria-label="Cancel routine creation"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      {error ? (
        <p className="mt-1.5 px-1 text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}

const FAB_PAGES = ["primary", "secondary", "nexus"] as const;

const FLAME_LEVELS: FlameLevel[] = [
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "ULTRA",
  "EXTREME",
];

const FAB_ADVANCED_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.24em] text-white/50";
const FAB_ADVANCED_INPUT_CLASS =
  "h-10 rounded-lg border border-white/10 bg-black/30 px-3.5 text-xs text-white placeholder:text-white/35 focus:border-blue-400/60 focus-visible:ring-0";
const FAB_ADVANCED_SELECT_TRIGGER_CLASS =
  "h-10 rounded-sm border border-zinc-700/80 bg-zinc-950 px-3.5 text-xs text-zinc-100 shadow-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-600/30";
const FAB_CREATION_CLOSED_FIELD_CLASS =
  "rounded-md border border-white/10 bg-white/[0.05] text-white shadow-[0_0_0_1px_rgba(148,163,184,0.08)] focus:border-blue-400/60 focus:ring-0 focus-visible:ring-0";
const FAB_CREATION_SELECT_TRIGGER_CLASS =
  FAB_CREATION_CLOSED_FIELD_CLASS;
const FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS =
  "rounded-sm border-zinc-700/70 bg-zinc-950 shadow-xl shadow-black/50";
const FAB_CREATION_SELECT_CONTENT_CLASS = "bg-zinc-950";
const FAB_CREATION_SELECT_ITEM_BASE_CLASS =
  "rounded-sm text-zinc-100 hover:bg-zinc-800 hover:text-white";
const FAB_CREATION_SELECT_ITEM_SELECTED_CLASS =
  "bg-zinc-800 text-white shadow-none ring-1 ring-zinc-700/70";
const fabCreationSelectItemClass = (
  isSelected: boolean,
  className?: string,
) =>
  cn(
    FAB_CREATION_SELECT_ITEM_BASE_CLASS,
    isSelected && FAB_CREATION_SELECT_ITEM_SELECTED_CLASS,
    className,
  );
const FAB_KEYBOARD_SETTLE_MS = 280;
const FAB_KEYBOARD_MODAL_GAP = 10;
const FAB_KEYBOARD_OFFSET_MAX_RATIO = 0.55;
const FAB_MOBILE_FOCUS_KEYBOARD_TIMEOUT_MS = 700;
const FAB_SELECTION_CONFIRM_MS = 80;
const FAB_SELECTION_EXIT_MS = 140;
const FAB_CREATION_ENTER_MS = 220;
const FAB_CREATION_FOCUS_DELAY_MS =
  FAB_SELECTION_EXIT_MS + FAB_CREATION_ENTER_MS + 40;
const FAB_AI_DEFAULT_ORIGIN: FabAiOverlayOrigin = {
  top: 160,
  left: 124,
  width: 172,
  height: 172,
  targetTop: 16,
  targetLeft: 16,
  targetWidth: 320,
  targetHeight: 420,
  borderRadius: "9999px",
  borderColor: "rgba(255, 255, 255, 0.2)",
  backgroundColor: "rgba(2, 2, 5, 0.95)",
  backgroundImage: "none",
  boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
};
const GOAL_MANAGEABLE_CIRCLE_ROLES = new Set([
  "OWNER",
  "MANAGER",
  "OPERATOR",
]);

const getClampedVisualViewportKeyboardInset = () => {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const viewportHeight = viewport.height || window.innerHeight;
  const heightLoss = Math.max(0, window.innerHeight - viewportHeight);
  const maxKeyboardOffset = Math.max(
    0,
    window.innerHeight * FAB_KEYBOARD_OFFSET_MAX_RATIO,
  );
  return Math.min(heightLoss, maxKeyboardOffset);
};

const FAB_KEYBOARD_TEXT_INPUT_TYPES = new Set([
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

const isFabTextEntryElement = (
  element: Element | null,
): element is HTMLElement => {
  if (!element) return false;
  const htmlElement = element as HTMLElement;
  if (htmlElement.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return FAB_KEYBOARD_TEXT_INPUT_TYPES.has(element.type.toLowerCase());
  }
  return false;
};

const isFabKeyboardTextEntryElement = (element: HTMLElement): boolean => {
  return isFabTextEntryElement(element);
};

const getFabTextEntryTarget = (
  target: EventTarget | null,
): HTMLElement | null => {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return null;
  }

  const element = target.closest(
    'input, textarea, [contenteditable="true"]',
  );

  return isFabTextEntryElement(element) ? element : null;
};

const shouldIgnoreFabPageSwipe = (target: EventTarget | null): boolean => {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        '[contenteditable="true"]',
        "[data-radix-select-trigger]",
        "[data-radix-select-content]",
        '[data-fab-swipe-ignore="true"]',
        '[data-state="open"][data-slot="dropdown-menu-content"]',
        '[data-state="open"][data-slot="dropdown-menu-sub-content"]',
        '[data-state="open"][data-slot="popover-content"]',
        '[data-state="open"][data-slot="select-content"]',
        '[data-state="open"][role="menu"]',
        '[data-state="open"][role="listbox"]',
        '[data-state="open"][role="dialog"]',
      ].join(","),
    ),
  );
};

const HABIT_DAYLIGHT_ADVANCED_OPTIONS = [
  { value: "ALL_DAY", label: "All day" },
  { value: "DAY", label: "Daylight" },
  { value: "NIGHT", label: "After dark" },
] as const;

const HABIT_WINDOW_EDGE_ADVANCED_OPTIONS = [
  { value: "FRONT", label: "Front" },
  { value: "BACK", label: "Back" },
] as const;

const LIMIT_MODAL_FEATURES = [
  "More room for goals, projects, tasks, and habits.",
  "Bigger roadmaps for bigger life systems.",
  "The full CREATOR Pro planning and execution layer.",
];

const LIMIT_MODAL_COPY: Partial<
  Record<LimitErrorCode, { title: string; description: string }>
> = {
  GOAL_LIMIT_REACHED: {
    title: "Build beyond the free roadmap",
    description:
      "The free roadmap is full. CREATOR Pro unlocks the space to keep building without cutting the plan short.",
  },
  PROJECT_LIMIT_REACHED: {
    title: "Your execution layer is full",
    description:
      "You’ve hit the free project limit. Upgrade to keep building the work behind your bigger goals.",
  },
  PROJECTS_PER_GOAL_LIMIT_REACHED: {
    title: "This goal needs more room",
    description:
      "The free project limit for this goal is full. CREATOR Pro gives you space to break it down properly.",
  },
  TASK_LIMIT_REACHED: {
    title: "Your task layer is full",
    description:
      "You’ve hit the free task limit. Upgrade to keep adding the details that move the system forward.",
  },
  HABIT_LIMIT_REACHED: {
    title: "Your routine system is full",
    description:
      "You’ve hit the free habit limit. CREATOR Pro gives you more room to build the routines that hold everything together.",
  },
};

const normalizeFlameLevel = (value?: string | null): FlameLevel => {
  const normalized = String(value ?? "MEDIUM")
    .trim()
    .toUpperCase();
  return FLAME_LEVELS.includes(normalized as FlameLevel)
    ? (normalized as FlameLevel)
    : "MEDIUM";
};

const FAB_PRIORITY_VALUES = new Set([
  "NO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "ULTRA-CRITICAL",
]);

const normalizeFabPriority = (value?: string | null) => {
  const normalized = String(value ?? "MEDIUM")
    .trim()
    .toUpperCase();
  return FAB_PRIORITY_VALUES.has(normalized) ? normalized : "MEDIUM";
};

const formatFabPriorityLabel = (value?: string | null) =>
  value === "ULTRA-CRITICAL" ? "Ultra" : value ?? "";

const normalizeFabEnergy = (value?: string | null) => normalizeFlameLevel(value);

const pickHydratedGoalPriority = (
  priority?: string | null,
  priorityCode?: string | null,
) => {
  const normalizedPriority = String(priority ?? "").trim().toUpperCase();
  if (FAB_PRIORITY_VALUES.has(normalizedPriority)) {
    return normalizedPriority;
  }

  return normalizeFabPriority(priorityCode);
};

const pickHydratedGoalEnergy = (
  energy?: string | null,
  energyCode?: string | null,
) => {
  const normalizedEnergy = String(energy ?? "").trim().toUpperCase();
  if (FLAME_LEVELS.includes(normalizedEnergy as FlameLevel)) {
    return normalizedEnergy as FlameLevel;
  }

  return normalizeFabEnergy(energyCode);
};

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");
const FAB_DEFAULT_CAMPAIGN_EMOJI = "🎯";
const FAB_DEFAULT_ROUTINE_EMOJI = "🔁";

const normalizeTagName = (value: string) =>
  collapseWhitespace(value).toLowerCase();

const sanitizeTagDisplayName = (value: string) => collapseWhitespace(value);

const AUTO_SCOPE_CREATION_KEYWORDS = ["goal", "project", "task"];
const AUTO_SCOPE_SCHEDULE_KEYWORDS = [
  "day type",
  "time block",
  "priority",
  "reschedule",
  "move",
];

type ScopeSelection = AiScope | "auto";

const CREATION_MODE_OPTIONS: Record<CreationType, CreationModeOption[]> = {
  GOAL: [
    { id: "main", label: "Main", icon: CircleDot },
    { id: "projects", label: "Projects", icon: ListChecks },
    { id: "tags", label: "Tags", icon: Tags },
  ],
  PROJECT: [
    { id: "main", label: "Main", icon: CircleDot },
    { id: "tasks", label: "Tasks", icon: ListChecks },
    { id: "advanced", label: "Advanced", icon: Settings2 },
  ],
  TASK: [
    { id: "main", label: "Main", icon: CircleDot },
    { id: "advanced", label: "Advanced", icon: Settings2 },
  ],
  HABIT: [
    { id: "main", label: "Main", icon: CircleDot },
    { id: "memoForms", label: "Memo Forms", icon: FileText },
    { id: "advanced", label: "Advanced", icon: Settings2 },
  ],
};

const getCreationModesForType = (type: CreationType | null) =>
  type ? CREATION_MODE_OPTIONS[type] : [];

const getFabElementRect = (
  element: HTMLElement | null,
): FabEditOriginRect | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
};

const dispatchCreatorEntitySaved = (
  detail: CreatorEntitySavedEventDetail,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("creator:entity-saved", {
      detail,
    }),
  );
};

const DRAFT_PROPOSAL_TYPES: AiIntent["type"][] = [
  "DRAFT_CREATE_GOAL",
  "DRAFT_CREATE_PROJECT",
  "DRAFT_CREATE_TASK",
  "DRAFT_CREATE_HABIT",
];

const PROPOSAL_CARD_TYPES: AiIntent["type"][] = [
  ...DRAFT_PROPOSAL_TYPES,
  "DRAFT_SCHEDULER_INPUT_OPS",
];

type ProposalOverrides = {
  draft?: Record<string, string>;
  schedulerOps?: AiSchedulerOp[];
};

type AiThreadTextMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "text";
  content: string;
  ts: number;
};

type AiThreadProposalMessage = {
  id: string;
  role: "assistant";
  kind: "proposal";
  ai: AiIntentResponse;
  overrides?: ProposalOverrides;
  ts: number;
};

type LocalAiThreadMessage = AiThreadTextMessage | AiThreadProposalMessage;

const isTextThreadMessage = (
  message: LocalAiThreadMessage,
): message is AiThreadTextMessage => message.kind === "text";

const createThreadMessageId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const createLocalDraftId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const buildInitialProposalFormValues = (
  draft?: Record<string, unknown>,
  overrides?: Record<string, string>,
  intentType?: AiIntent["type"],
) => {
  const keys = new Set<string>([
    ...Object.keys(draft ?? {}),
    ...Object.keys(overrides ?? {}),
  ]);
  const values: Record<string, string> = {};
  keys.forEach((key) => {
    if (overrides && overrides[key] !== undefined) {
      values[key] = overrides[key];
      return;
    }
    const baseValue = draft ? draft[key] : undefined;
    values[key] =
      baseValue === undefined || baseValue === null ? "" : String(baseValue);
  });
  if (intentType === "DRAFT_CREATE_GOAL") {
    values.monument_id ??= "";
    values.due_date ??= "";
  }
  if (intentType === "DRAFT_CREATE_PROJECT") {
    values.goal_id ??= "";
    values.skill_ids ??= "";
    values.stage ??= "";
  }
  if (intentType === "DRAFT_CREATE_HABIT") {
    values.habit_type ||= "HABIT";
    values.duration_minutes ||= "30";
    values.recurrence ||= "daily";
    values.energy ||= "MEDIUM";
  }
  return values;
};

const DEFAULT_OVERLAY_DURATION_MINUTES = 180;
const TIMELINE_TICK_INTERVAL_MINUTES = 15;
const MIN_OVERLAY_DURATION_MS = TIMELINE_TICK_INTERVAL_MINUTES * 60 * 1000;
const MAX_OVERLAY_DURATION_MS = 24 * 60 * 60 * 1000;
const OVERLAY_DRAG_SNAP_INTERVAL_MINUTES = 5;
const OVERLAY_PLACEMENT_DEFAULT_DURATION_MINUTES = 30;

type OverlayPlacement = {
  id: string;
  type: "PROJECT" | "HABIT";
  name: string;
  start: Date;
  end: Date;
  locked: true;
  habitType?: string | null;
  goalName?: string | null;
  energy?: string | null;
  sourceId: string;
};

type FabSupabaseClient = NonNullable<ReturnType<typeof getSupabaseBrowser>>;
type ExactScheduleSourceType = "PROJECT" | "TASK";
type ParsedExactSchedule = {
  startIso: string;
  endIso: string;
  durationMin: number;
};
type ParsedHabitFixedTime = {
  fixed_start_local: string | null;
  fixed_end_local: string | null;
  fixed_timezone: string | null;
};

const createOverlayPlacementId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `overlay-place-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const roundToNearestMinutes = (date: Date, step = 5): Date => {
  const msStep = step * 60 * 1000;
  const rounded = Math.round(date.getTime() / msStep) * msStep;
  return new Date(rounded);
};

const formatTimeInputValue = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

const formatDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;

const formatDateTimeLocalInputValue = (value?: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const parseExactSchedule = (
  hasExactDate: boolean,
  dateValue: string,
  startTimeValue: string,
  endTimeValue: string,
  fallbackDateValue = "",
): { schedule: ParsedExactSchedule | null; error: string | null } => {
  const startTime = startTimeValue.trim();
  const endTime = endTimeValue.trim();
  if (!startTime && !endTime) {
    return { schedule: null, error: null };
  }
  if (!startTime || !endTime) {
    return {
      schedule: null,
      error:
        "Provide both exact start and end times, or leave both blank.",
    };
  }

  const date = hasExactDate
    ? dateValue.trim()
    : fallbackDateValue.trim() || formatDateInputValue(new Date());
  if (hasExactDate && !date) {
    return {
      schedule: null,
      error: "Provide an exact date, or turn exact date off.",
    };
  }

  const startDate = new Date(`${date}T${startTime}`);
  const endDate = new Date(`${date}T${endTime}`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      schedule: null,
      error: "Enter valid exact schedule values.",
    };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return {
      schedule: null,
      error: "Exact schedule end time must be after the start time.",
    };
  }

  return {
    schedule: {
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      durationMin: Math.max(
        1,
        Math.round((endDate.getTime() - startDate.getTime()) / 60000),
      ),
    },
    error: null,
  };
};

const normalizeLocalTimeForDb = (value: string) => {
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
    2,
    "0",
  )}:${String(second).padStart(2, "0")}`;
};

const getBrowserTimeZone = () => {
  if (typeof Intl === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const parseHabitFixedTime = (
  startTimeValue: string,
  endTimeValue: string,
): { schedule: ParsedHabitFixedTime | null; error: string | null } => {
  const rawStart = startTimeValue.trim();
  const rawEnd = endTimeValue.trim();
  if (!rawStart && !rawEnd) {
    return {
      schedule: {
        fixed_start_local: null,
        fixed_end_local: null,
        fixed_timezone: null,
      },
      error: null,
    };
  }
  if (!rawStart || !rawEnd) {
    return {
      schedule: null,
      error: "Provide both habit start and end times, or leave both blank.",
    };
  }
  const fixedStart = normalizeLocalTimeForDb(rawStart);
  const fixedEnd = normalizeLocalTimeForDb(rawEnd);
  if (!fixedStart || !fixedEnd) {
    return {
      schedule: null,
      error: "Enter valid habit start and end times.",
    };
  }
  if (fixedEnd <= fixedStart) {
    return {
      schedule: null,
      error: "Habit end time must be after the start time.",
    };
  }
  return {
    schedule: {
      fixed_start_local: fixedStart,
      fixed_end_local: fixedEnd,
      fixed_timezone: getBrowserTimeZone(),
    },
    error: null,
  };
};

const formatLocalTimeInputValue = (value?: string | null) => {
  if (!value) return "";
  const normalized = normalizeLocalTimeForDb(value);
  return normalized ? normalized.slice(0, 5) : "";
};

const getSplitExactScheduleInputValues = (
  startUtc?: string | null,
  endUtc?: string | null,
) => {
  if (!startUtc || !endUtc) {
    return {
      hasExactDate: false,
      date: "",
      startTime: "",
      endTime: "",
    };
  }

  const startDate = new Date(startUtc);
  const endDate = new Date(endUtc);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      hasExactDate: false,
      date: "",
      startTime: "",
      endTime: "",
    };
  }

  return {
    hasExactDate: true,
    date: formatDateInputValue(startDate),
    startTime: formatTimeInputValue(startDate),
    endTime: formatTimeInputValue(endDate),
  };
};

const upsertLockedScheduleInstance = async ({
  supabase,
  userId,
  sourceType,
  sourceId,
  exactSchedule,
  removeWhenBlank,
}: {
  supabase: FabSupabaseClient;
  userId: string;
  sourceType: ExactScheduleSourceType;
  sourceId: string;
  exactSchedule: ParsedExactSchedule | null;
  removeWhenBlank: boolean;
}) => {
  if (!exactSchedule) {
    if (!removeWhenBlank) return;
    const { error } = await supabase
      .from("schedule_instances")
      .delete()
      .eq("user_id", userId)
      .eq("source_type", sourceType)
      .eq("source_id", sourceId)
      .eq("locked", true);
    if (error) throw error;
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("schedule_instances")
    .select("id")
    .eq("user_id", userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("locked", true)
    .order("start_utc", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("schedule_instances")
      .update({
        start_utc: exactSchedule.startIso,
        end_utc: exactSchedule.endIso,
        duration_min: exactSchedule.durationMin,
        status: "scheduled",
        locked: true,
        window_id: null,
        day_type_time_block_id: null,
        time_block_id: null,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from("schedule_instances")
    .insert({
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      start_utc: exactSchedule.startIso,
      end_utc: exactSchedule.endIso,
      duration_min: exactSchedule.durationMin,
      status: "scheduled",
      locked: true,
      window_id: null,
      day_type_time_block_id: null,
      time_block_id: null,
      weight_snapshot: 0,
      energy_resolved: "NO",
    });
  if (insertError) throw insertError;
};

const formatDurationLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
};

const formatTimelinePlacementRange = (start: Date, end: Date) => {
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  } catch (error) {
    console.warn("Unable to format timeline placement range", error);
    const fallbackOptions: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    };
    return `${start.toLocaleTimeString(undefined, fallbackOptions)} – ${end.toLocaleTimeString(
      undefined,
      fallbackOptions,
    )}`;
  }
};

const overlayDateToMinutes = (date: Date, overlayStartTime: Date) =>
  Math.max(
    0,
    Math.round((date.getTime() - overlayStartTime.getTime()) / 60000),
  );

const overlayMinutesToDate = (minutes: number, overlayStartTime: Date) =>
  new Date(overlayStartTime.getTime() + minutes * 60000);

const snapMinutesToFive = (value: number) =>
  Math.round(value / OVERLAY_DRAG_SNAP_INTERVAL_MINUTES) *
  OVERLAY_DRAG_SNAP_INTERVAL_MINUTES;

const clampOverlayPlacementStart = (
  startMinutes: number,
  durationMinutes: number,
  totalWindowMinutes: number,
) => {
  const maxStart = Math.max(0, totalWindowMinutes - durationMinutes);
  return Math.min(maxStart, Math.max(0, startMinutes));
};

const sortOverlayPlacements = (placements: OverlayPlacement[]) =>
  [...placements].sort((a, b) => a.start.getTime() - b.start.getTime());

const isSyncOverlayPlacement = (placement: OverlayPlacement) =>
  placement.type === "HABIT" &&
  normalizeHabitType(placement.habitType) === "SYNC";

type OverlayLayoutDirection = "forward" | "backward" | "none";

type PlacementEntry = {
  id: string;
  start: number;
  duration: number;
  isSync: boolean;
  placement: OverlayPlacement;
};

type OccupiedChain = {
  start: number;
  end: number;
  obstacles: PlacementEntry[];
};

type ResolveOverlayLayoutParams = {
  placements: OverlayPlacement[];
  overlayStartTime: Date;
  overlayWindowMinutes: number;
  movingPlacementId: string;
  targetStartMinutes: number;
  rawTargetStartMinutes: number;
  durationMinutes: number;
  direction: OverlayLayoutDirection;
};

const resolveOverlayPlacementLayout = ({
  placements,
  overlayStartTime,
  overlayWindowMinutes,
  movingPlacementId,
  targetStartMinutes,
  rawTargetStartMinutes,
  durationMinutes,
  direction: _direction,
}: ResolveOverlayLayoutParams): OverlayPlacement[] => {
  const entries: PlacementEntry[] = placements.map((placement) => ({
    id: placement.id,
    start: overlayDateToMinutes(placement.start, overlayStartTime),
    duration: Math.max(1, overlayDateToMinutes(placement.end, placement.start)),
    isSync: isSyncOverlayPlacement(placement),
    placement,
  }));

  const clampStart = (entry: PlacementEntry, desired: number) => {
    const min = 0;
    const max = Math.max(0, overlayWindowMinutes - entry.duration);
    return Math.min(max, Math.max(min, desired));
  };

  const movingEntry = entries.find((entry) => entry.id === movingPlacementId);
  if (!movingEntry) {
    return placements;
  }

  movingEntry.duration = durationMinutes;

  const boundsMax = Math.max(0, overlayWindowMinutes - movingEntry.duration);
  const obstacles = entries.filter((entry) => entry.id !== movingPlacementId);
  const clampTarget = (value: number) => clampStart(movingEntry, value);
  const clampedTargetStart = clampTarget(targetStartMinutes);
  const actualMovementStart = clampedTargetStart;
  const atTopBoundary = clampedTargetStart === 0;
  const atBottomBoundary = clampedTargetStart === boundsMax;
  const pushingTop = atTopBoundary && rawTargetStartMinutes < 0;
  const pushingBottom = atBottomBoundary && rawTargetStartMinutes > boundsMax;
  const sortedObstaclesAsc = obstacles
    .slice()
    .sort((a, b) => a.start - b.start);
  const sortedObstaclesDesc = obstacles
    .slice()
    .sort((a, b) => b.start - a.start);
  const firstObstacle = sortedObstaclesAsc[0] ?? null;
  const lastObstacle = sortedObstaclesDesc[0] ?? null;
  const topGapAvailable = firstObstacle
    ? Math.max(0, firstObstacle.start)
    : overlayWindowMinutes;
  const bottomGapAvailable = lastObstacle
    ? Math.max(
        0,
        overlayWindowMinutes - (lastObstacle.start + lastObstacle.duration),
      )
    : overlayWindowMinutes;
  const shouldPushDown =
    atTopBoundary &&
    (pushingTop ||
      (firstObstacle !== null && movingEntry.duration > topGapAvailable));
  const shouldPushUp =
    atBottomBoundary &&
    (pushingBottom ||
      (lastObstacle !== null && movingEntry.duration > bottomGapAvailable));

  const clampMovingCandidate = (value: number) =>
    clampStart(movingEntry, value);
  const findNearestLegalStart = (
    desiredStart: number,
    opts?: { boundarySlotsOnly?: boolean },
  ) => {
    const gaps: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const obstacle of sortedObstaclesAsc) {
      if (obstacle.start > cursor) {
        gaps.push({ start: cursor, end: obstacle.start });
      }
      cursor = Math.max(cursor, obstacle.start + obstacle.duration);
    }
    if (overlayWindowMinutes - cursor >= movingEntry.duration) {
      gaps.push({ start: cursor, end: overlayWindowMinutes });
    }

    if (gaps.length === 0) {
      return clampMovingCandidate(desiredStart);
    }

    const candidates: {
      start: number;
      distance: number;
      directionMatch: boolean;
    }[] = [];

    const evaluateCandidate = (
      gapMin: number,
      gapMax: number,
      baseValue: number,
    ) => {
      if (gapMax < gapMin) return;
      const snapped = snapMinutesToFive(baseValue);
      const bounded = Math.min(gapMax, Math.max(gapMin, snapped));
      const clamped = clampMovingCandidate(bounded);
      const distance = Math.abs(clamped - desiredStart);
      const directionMatch =
        _direction === "forward"
          ? clamped >= desiredStart
          : _direction === "backward"
            ? clamped <= desiredStart
            : true;
      candidates.push({ start: clamped, distance, directionMatch });
    };

    for (const gap of gaps) {
      const gapMin = gap.start;
      const gapMax = gap.end - movingEntry.duration;
      if (gapMax < gapMin) continue;
      if (opts?.boundarySlotsOnly) {
        evaluateCandidate(gapMin, gapMax, gapMin);
        evaluateCandidate(gapMin, gapMax, gapMax);
      } else {
        evaluateCandidate(
          gapMin,
          gapMax,
          Math.min(gapMax, Math.max(gapMin, desiredStart)),
        );
      }
    }

    if (candidates.length === 0) {
      return clampMovingCandidate(desiredStart);
    }

    let bestCandidate = candidates[0];
    for (const candidate of candidates.slice(1)) {
      if (candidate.distance < bestCandidate.distance) {
        bestCandidate = candidate;
        continue;
      }
      if (
        candidate.distance === bestCandidate.distance &&
        Number(candidate.directionMatch) > Number(bestCandidate.directionMatch)
      ) {
        bestCandidate = candidate;
      }
    }
    return bestCandidate.start;
  };

  const pushObstaclesDownward = () => {
    const ordered = obstacles.slice().sort((a, b) => a.start - b.start);
    let prevEnd = movingEntry.start + movingEntry.duration;
    for (const obstacle of ordered) {
      const desired = Math.max(prevEnd, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
      }
      prevEnd = obstacle.start + obstacle.duration;
    }
  };

  const pushObstaclesUpward = () => {
    const ordered = obstacles.slice().sort((a, b) => b.start - a.start);
    let prevStart = movingEntry.start;
    for (const obstacle of ordered) {
      const desired = Math.min(prevStart - obstacle.duration, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
      }
      prevStart = obstacle.start;
    }
  };

  const startFitsWithoutOverlap = (start: number) => {
    const end = start + movingEntry.duration;
    return !obstacles.some(
      (obstacle) =>
        start < obstacle.start + obstacle.duration && end > obstacle.start,
    );
  };

  const buildOccupiedChains = (): OccupiedChain[] => {
    const chains: OccupiedChain[] = [];
    for (const obstacle of sortedObstaclesAsc) {
      const obstacleEnd = obstacle.start + obstacle.duration;
      const lastChain = chains[chains.length - 1];
      if (lastChain && obstacle.start <= lastChain.end) {
        lastChain.end = Math.max(lastChain.end, obstacleEnd);
        lastChain.obstacles.push(obstacle);
      } else {
        chains.push({
          start: obstacle.start,
          end: obstacleEnd,
          obstacles: [obstacle],
        });
      }
    }
    return chains;
  };

  const occupiedChains = buildOccupiedChains();

  const findChainForMovement = (start: number) => {
    for (const chain of occupiedChains) {
      if (start < chain.end && start + movingEntry.duration > chain.start) {
        return chain;
      }
    }
    return null;
  };

  const selectSeamStartForChain = (
    chain: OccupiedChain,
    pointerStart: number,
  ) => {
    const candidates = Array.from(
      new Set(
        chain.obstacles.map((obstacle) =>
          clampMovingCandidate(snapMinutesToFive(obstacle.start)),
        ),
      ),
    ).sort((a, b) => a - b);
    if (candidates.length === 0) {
      return null;
    }
    const matchesDirection = (value: number) =>
      _direction === "forward"
        ? value >= pointerStart
        : _direction === "backward"
          ? value <= pointerStart
          : true;
    let best = candidates[0];
    let bestDistance = Math.abs(best - pointerStart);
    let bestDirectionMatch = matchesDirection(best);

    for (const candidate of candidates) {
      const distance = Math.abs(candidate - pointerStart);
      const directionMatch = matchesDirection(candidate);
      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          Number(directionMatch) > Number(bestDirectionMatch))
      ) {
        best = candidate;
        bestDistance = distance;
        bestDirectionMatch = directionMatch;
      }
    }
    return best;
  };

  const tryMiddleInsertion = (targetStart: number) => {
    const insertionTargetStart = targetStart;
    const downstreamObstacles = sortedObstaclesAsc.filter(
      (obstacle) => obstacle.start + obstacle.duration > insertionTargetStart,
    );
    const obstacleStartBackup = new Map<string, number>();
    obstacles.forEach((obstacle) => {
      obstacleStartBackup.set(obstacle.id, obstacle.start);
    });
    const movingStartBackup = movingEntry.start;

    movingEntry.start = insertionTargetStart;
    let prevEnd = movingEntry.start + movingEntry.duration;
    let pushedDownstream = false;
    for (const obstacle of downstreamObstacles) {
      const desired = Math.max(prevEnd, obstacle.start);
      const clamped = clampStart(obstacle, desired);
      if (clamped !== obstacle.start) {
        obstacle.start = clamped;
        pushedDownstream = true;
      }
      prevEnd = obstacle.start + obstacle.duration;
    }

    const fitsInWindow = prevEnd <= overlayWindowMinutes;

    if (fitsInWindow) {
      return { success: true, pushedDownstream };
    }

    obstacles.forEach((obstacle) => {
      const original = obstacleStartBackup.get(obstacle.id);
      if (original !== undefined) {
        obstacle.start = original;
      }
    });
    movingEntry.start = movingStartBackup;
    return { success: false, pushedDownstream };
  };

  type PlacementLog = {
    mode: "direct-fit" | "seam-insert" | "fallback-gap";
    chosenStart: number;
    pushed: boolean;
  };
  let placementLog: PlacementLog | null = null;

  if (shouldPushDown) {
    movingEntry.start = 0;
    pushObstaclesDownward();
  } else if (shouldPushUp) {
    movingEntry.start = boundsMax;
    pushObstaclesUpward();
  } else {
    if (startFitsWithoutOverlap(actualMovementStart)) {
      movingEntry.start = actualMovementStart;
      placementLog = {
        mode: "direct-fit",
        chosenStart: movingEntry.start,
        pushed: false,
      };
    } else {
      const chain = findChainForMovement(actualMovementStart);
      if (chain) {
        const seamStart = selectSeamStartForChain(chain, actualMovementStart);
        if (seamStart !== null) {
          const insertionResult = tryMiddleInsertion(seamStart);
          if (insertionResult.success) {
            placementLog = {
              mode: "seam-insert",
              chosenStart: movingEntry.start,
              pushed: insertionResult.pushedDownstream,
            };
          }
        }
      }
      if (!placementLog) {
        movingEntry.start = findNearestLegalStart(actualMovementStart);
        placementLog = {
          mode: "fallback-gap",
          chosenStart: movingEntry.start,
          pushed: false,
        };
      }
    }
  }

  const hasOverlap = obstacles.some((obstacle) => {
    const movingEnd = movingEntry.start + movingEntry.duration;
    return (
      movingEntry.start < obstacle.start + obstacle.duration &&
      movingEnd > obstacle.start
    );
  });
  if (hasOverlap) {
    movingEntry.start = findNearestLegalStart(actualMovementStart, {
      boundarySlotsOnly: true,
    });
    placementLog = {
      mode: "fallback-gap",
      chosenStart: movingEntry.start,
      pushed: false,
    };
  }

  if (placementLog && process.env.NODE_ENV !== "production") {
    console.debug("[Fab] overlay drag resolve", movingPlacementId, {
      actualMovementStart,
      chosenStart: placementLog.chosenStart,
      mode: placementLog.mode,
      downstreamPush: placementLog.pushed,
    });
  }

  const startMap = new Map<string, number>();
  const durationMap = new Map<string, number>();
  entries.forEach((entry) => {
    const sanitized = clampStart(entry, entry.start);
    startMap.set(entry.id, sanitized);
    durationMap.set(entry.id, entry.duration);
  });

  return placements.map((placement) => {
    const startMinutes = startMap.get(placement.id);
    const duration = durationMap.get(placement.id);
    if (startMinutes === undefined || duration === undefined) {
      return placement;
    }
    return {
      ...placement,
      start: overlayMinutesToDate(startMinutes, overlayStartTime),
      end: overlayMinutesToDate(startMinutes + duration, overlayStartTime),
    };
  });
};

const OVERLAY_DRAG_AXIS_THRESHOLD_PX = 8;
const OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO = 1.35;
const OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES =
  OVERLAY_DRAG_SNAP_INTERVAL_MINUTES / 2;

type OverlayDragMode = "reorder" | "remove" | null;

type OverlayDragCandidate = {
  placementId: string;
  startMinutes: number;
  durationMinutes: number;
  baseStartMinutes: number;
};

type OverlayDragIntent = {
  axis: "vertical" | "horizontal" | null;
  startPoint: { x: number; y: number } | null;
  lastSnappedMinutes: number | null;
};

type OverlayDragMeta = {
  baseStartMinutes: number;
  durationMinutes: number;
};

const applyOverlayDragHysteresis = (
  rawMinutes: number,
  lastSnap: number | null,
) => {
  const snapped = snapMinutesToFive(rawMinutes);
  if (lastSnap === null) return snapped;
  if (snapped === lastSnap) return lastSnap;

  const direction = rawMinutes - lastSnap;
  if (direction > 0) {
    return rawMinutes >= lastSnap + OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES
      ? snapped
      : lastSnap;
  }
  if (direction < 0) {
    return rawMinutes <= lastSnap - OVERLAY_DRAG_SNAP_HYSTERESIS_MINUTES
      ? snapped
      : lastSnap;
  }
  return lastSnap;
};

const normalizeOverlayPlacements = (
  placements: OverlayPlacement[],
  overlayStartTime: Date,
  overlayEndTime: Date,
): OverlayPlacement[] => {
  if (placements.length === 0) return [];
  const windowMinutes = Math.max(
    1,
    overlayDateToMinutes(overlayEndTime, overlayStartTime),
  );
  let cursorMinutes = 0;
  return sortOverlayPlacements(placements).map((placement) => {
    const durationMinutes = Math.max(
      1,
      overlayDateToMinutes(placement.end, placement.start),
    );
    const earliestStart = Math.max(cursorMinutes, 0);
    const desiredStart = overlayDateToMinutes(
      placement.start,
      overlayStartTime,
    );
    const candidateStart = Math.max(desiredStart, earliestStart);
    const normalizedStartMinutes = clampOverlayPlacementStart(
      candidateStart,
      durationMinutes,
      windowMinutes,
    );
    const normalizedEndMinutes = normalizedStartMinutes + durationMinutes;
    cursorMinutes = Math.max(cursorMinutes, normalizedEndMinutes);
    return {
      ...placement,
      start: overlayMinutesToDate(normalizedStartMinutes, overlayStartTime),
      end: overlayMinutesToDate(normalizedEndMinutes, overlayStartTime),
    };
  });
};

const removeOverlayPlacement = (
  placements: OverlayPlacement[],
  id: string,
  overlayStartTime: Date,
  overlayEndTime: Date,
) =>
  normalizeOverlayPlacements(
    placements.filter((placement) => placement.id !== id),
    overlayStartTime,
    overlayEndTime,
  );

const getNextSequentialStartMinutes = (
  placements: OverlayPlacement[],
  overlayStartTime: Date,
  windowMinutes: number,
  durationMinutes: number,
) => {
  if (placements.length === 0) return 0;
  const sorted = sortOverlayPlacements(placements);
  const last = sorted[sorted.length - 1];
  const lastEndMinutes = overlayDateToMinutes(last.end, overlayStartTime);
  return clampOverlayPlacementStart(
    lastEndMinutes,
    durationMinutes,
    windowMinutes,
  );
};

const OVERLAY_BORDER_COLOR = "rgba(0, 0, 0, 0.95)";
const OVERLAY_PROJECT_BACKGROUND = `radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)`;
const HABIT_TYPE_BACKGROUND_MAP: Record<string, string> = {
  HABIT: `radial-gradient(circle at 0% 0%, rgba(120, 126, 138, 0.28), transparent 58%), linear-gradient(140deg, rgba(8, 8, 10, 0.96) 0%, rgba(22, 22, 26, 0.94) 42%, rgba(88, 90, 104, 0.6) 100%)`,
  CHORE: `radial-gradient(circle at 10% -25%, rgba(248, 113, 113, 0.32), transparent 58%), linear-gradient(135deg, rgba(67, 26, 26, 0.9) 0%, rgba(127, 29, 29, 0.85) 45%, rgba(220, 38, 38, 0.72) 100%)`,
  RELAXER: `radial-gradient(circle at 8% -18%, rgba(16, 185, 129, 0.32), transparent 60%), linear-gradient(138deg, rgba(4, 56, 33, 0.94) 0%, rgba(4, 120, 87, 0.88) 46%, rgba(16, 185, 129, 0.78) 100%)`,
  PRACTICE: `radial-gradient(circle at 6% -14%, rgba(54, 57, 66, 0.38), transparent 60%), linear-gradient(142deg, rgba(4, 4, 6, 0.98) 0%, rgba(18, 18, 22, 0.95) 44%, rgba(68, 72, 92, 0.72) 100%)`,
  SYNC: `radial-gradient(circle at 50% -35%, rgba(209, 213, 219, 0.14), transparent 54%), linear-gradient(135deg, rgba(31, 34, 39, 0.94) 0%, rgba(74, 80, 90, 0.84) 52%, rgba(142, 148, 160, 0.68) 100%)`,
  MEMO: `radial-gradient(circle at 8% -18%, rgba(192, 132, 252, 0.34), transparent 60%), linear-gradient(138deg, rgba(59, 7, 100, 0.94) 0%, rgba(99, 37, 141, 0.88) 46%, rgba(168, 85, 247, 0.74) 100%)`,
};

const getOverlayPlacementTheme = (
  placement: OverlayPlacement,
): OverlayPlacementTheme => {
  if (placement.type === "PROJECT") {
    return {
      background: OVERLAY_PROJECT_BACKGROUND,
      borderColor: OVERLAY_BORDER_COLOR,
    };
  }

  const habitTypeKey = normalizeHabitType(placement.habitType);
  return {
    background:
      HABIT_TYPE_BACKGROUND_MAP[habitTypeKey] ??
      HABIT_TYPE_BACKGROUND_MAP.HABIT,
    borderColor: OVERLAY_BORDER_COLOR,
  };
};

type OverlayPlacementTheme = {
  background: string;
  borderColor: string;
};

const humanizeFieldLabel = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();

function determineAutoScopeFromPrompt(prompt: string): AiScope {
  const normalized = prompt.toLowerCase();
  const mentionsCreate =
    (normalized.includes("create") ||
      normalized.includes("draft") ||
      normalized.includes("add") ||
      normalized.includes("make")) &&
    (AUTO_SCOPE_CREATION_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    ) ||
      /\b(goal|project|task|day\s*type|habit)\b/.test(normalized) ||
      normalized.includes("help me create"));

  if (mentionsCreate) {
    return "draft_creation";
  }

  if (
    AUTO_SCOPE_SCHEDULE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return "schedule_edit";
  }

  return "read_only";
}

// Keeps taps single-action on iOS by acting on pointerup and ignoring the
// synthetic click that follows; real clicks (keyboard/AT) still fire onClick.
function useTapHandler(onTap: () => void, opts?: { disabled?: boolean }) {
  const sawPointerUpRef = React.useRef(false);

  const onPointerUp = React.useCallback(
    (e: React.PointerEvent) => {
      if (opts?.disabled) return;
      // Only primary button
      // (pointerup.button may be 0 or -1 on some mobile UAs; don't over-filter)
      if (e.button != null && e.button !== 0) return;

      // Act immediately on pointerup for mouse & touch
      sawPointerUpRef.current = true;
      onTap();
      // Reset flag soon so keyboard click later still works
      setTimeout(() => {
        sawPointerUpRef.current = false;
      }, 0);
    },
    [onTap, opts?.disabled],
  );

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (opts?.disabled) return;
      // Ignore synthetic click that follows our pointerup (iOS)
      if (sawPointerUpRef.current) {
        return;
      }
      onTap(); // allow keyboard/AT-triggered clicks
    },
    [onTap, opts?.disabled],
  );

  return { onPointerUp, onClick };
}

const isTourActive = () =>
  Boolean((window as Window & { __CREATOR_TOUR_ACTIVE__?: unknown }).__CREATOR_TOUR_ACTIVE__);

function useOverhangLT(
  ref: React.RefObject<HTMLElement>,
  deps: React.DependencyList = [],
  opts?: {
    listenVisualViewport?: boolean;
    listenScroll?: boolean;
    groupWidth?: number;
    groupHeight?: number;
    overhang?: number;
    align?: "left" | "right";
  },
) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();

      const OVERHANG = opts?.overhang ?? 12; // vertical overhang only
      const BTN = 48;
      const GAP = 12;
      const GROUP_W = opts?.groupWidth ?? BTN * 2 + GAP;
      const GROUP_H = opts?.groupHeight ?? BTN;
      const SHIFT_LEFT = 0; // keep right edge flush to panel

      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0",
        ) || 0;

      // Use visualViewport for mobile keyboard compatibility, fallback to window
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;

      const align = opts?.align ?? "right";
      let left =
        align === "left"
          ? Math.round(rect.left + SHIFT_LEFT)
          : Math.round(rect.right - GROUP_W - SHIFT_LEFT);
      const minLeft = 8;
      const maxLeft = viewportWidth - GROUP_W - 8;
      left = Math.min(Math.max(left, minLeft), maxLeft);

      let top = Math.round(rect.bottom + OVERHANG - GROUP_H);
      const maxTop = viewportHeight - safeBottom - GROUP_H - 8;
      top = Math.min(top, maxTop);
      top = Math.max(top, 8);

      setPos({ left, top });
    };

    update();
    // Listen to visualViewport resize for mobile keyboard compatibility
    const listenVisualViewport = opts?.listenVisualViewport ?? true;
    const listenScroll = opts?.listenScroll ?? true;
    const visualViewport = window.visualViewport;
    if (listenVisualViewport) {
      if (visualViewport) {
        visualViewport.addEventListener("resize", update);
      } else {
        // Fallback for browsers without visualViewport support
        window.addEventListener("resize", update);
      }
    }
    if (listenScroll) {
      window.addEventListener("scroll", update, { passive: true });
    }
    return () => {
      if (listenVisualViewport) {
        if (visualViewport) {
          visualViewport.removeEventListener("resize", update);
        } else {
          window.removeEventListener("resize", update);
        }
      }
      if (listenScroll) {
        window.removeEventListener("scroll", update);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return pos;
}

const formatSchedulerPriorityLabel = (value: number) => {
  const index = Math.max(
    0,
    Math.min(value - 1, SCHEDULER_PRIORITY_LABELS.length - 1),
  );
  return formatFabPriorityLabel(SCHEDULER_PRIORITY_LABELS[index] ?? "NO");
};

const describeSchedulerOp = (op: AiSchedulerOp) => {
  switch (op.type) {
    case "SET_DAY_TYPE_ASSIGNMENT":
      return `Set day type for ${op.date} to ${op.day_type_name}`;
    case "SET_GOAL_PRIORITY_BY_NAME":
      return `Set goal "${op.goal_title}" priority to ${formatSchedulerPriorityLabel(
        op.priority,
      )} (${op.priority})`;
    case "SET_PROJECT_PRIORITY_BY_NAME":
      return `Set project "${op.project_title}" priority to ${formatSchedulerPriorityLabel(
        op.priority,
      )} (${op.priority})`;
    case "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL":
      return `Update time block "${op.block_label}" for day type "${op.day_type_name}"`;
  }
};

type DayTypePreviewBlock = {
  id: string;
  label?: string;
  startLabel?: string;
  endLabel?: string;
  startMinutes?: number;
  endMinutes?: number;
  start_local?: string;
  end_local?: string;
  opIndex: number;
  opType: AiSchedulerOp["type"];
  hasConstraints?: boolean;
};

const buildDayTypePreviewBlocks = (
  ops: AiSchedulerOp[],
): DayTypePreviewBlock[] => {
  const blocks: DayTypePreviewBlock[] = [];

  ops.forEach((op, index) => {
    if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
      blocks.push({
        id: `create-${op.day_type_name}-${op.label}-${index}`,
        label: op.label,
        startLabel: op.start_local,
        endLabel: op.end_local,
        start_local: op.start_local,
        end_local: op.end_local,
        startMinutes: parseTimeToMinutes(op.start_local) ?? undefined,
        endMinutes: parseTimeToMinutes(op.end_local) ?? undefined,
        opIndex: index,
        opType: op.type,
        hasConstraints:
          Boolean(op.constraints) && Object.keys(op.constraints).length > 0,
      });
      return;
    }

    if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
      const { start_local, end_local, constraints } = op.patch;
      if (!start_local && !end_local) return;

      blocks.push({
        id: `update-${op.day_type_name}-${op.block_label}-${index}`,
        label: op.block_label,
        startLabel: start_local,
        endLabel: end_local,
        start_local: start_local ?? undefined,
        end_local: end_local ?? undefined,
        startMinutes: start_local
          ? (parseTimeToMinutes(start_local) ?? undefined)
          : undefined,
        endMinutes: end_local
          ? (parseTimeToMinutes(end_local) ?? undefined)
          : undefined,
        opIndex: index,
        opType: op.type,
        hasConstraints:
          Boolean(constraints) && Object.keys(constraints).length > 0,
      });
    }
  });

  return blocks.sort(
    (a, b) =>
      (a.startMinutes ?? Number.MAX_SAFE_INTEGER) -
      (b.startMinutes ?? Number.MAX_SAFE_INTEGER),
  );
};

const MINUTES_PER_DAY = 24 * 60;

const formatTimeLabel = (minutes: number) => {
  if (minutes >= MINUTES_PER_DAY) {
    return "24:00";
  }
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  if (hour === 24 && minute !== 0) {
    return null;
  }
  return hour === 24 ? MINUTES_PER_DAY : hour * 60 + minute;
};

type DayTypePreviewSegment = {
  id: string;
  label: string;
  dayTypeName: string;
  blockType?: string;
  energy?: string;
  topPercent: number;
  heightPercent: number;
  startMin: number;
  endMin: number;
  timeRange: string;
};

type ProposalFormValues = Record<string, unknown>;

const cloneSchedulerOp = (op: AiSchedulerOp): AiSchedulerOp => {
  if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
    const clonedPatch = { ...op.patch };
    if (clonedPatch.constraints) {
      clonedPatch.constraints = { ...clonedPatch.constraints };
    }
    return {
      ...op,
      patch: clonedPatch,
    };
  }
  if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
    return {
      ...op,
      constraints: op.constraints ? { ...op.constraints } : undefined,
    };
  }
  return { ...op };
};

const normalizeSchedulerOps = (
  ops?: AiSchedulerOp[] | null,
): AiSchedulerOp[] => (Array.isArray(ops) ? ops : []);

export function Fab({
  className = "",
  menuVariant = "default",
  swipeUpToOpen = false,
  editTarget = null,
  onEditTargetChange,
  onEditTargetConsumed,
  onEditClose,
  onEditSaved,
  hideLauncher = false,
  portalToBody = false,
  openOnMount = false,
  creationRequest = null,
  ...wrapperProps
}: FabProps) {
  void onEditTargetConsumed;
  const [isOpen, setIsOpen] = useState(false);
  const [isDirectCreationOpen, setIsDirectCreationOpen] = useState(false);
  const openOnMountConsumedRef = useRef(false);
  const toast = useToastHelpers();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiOverlayOrigin, setAiOverlayOrigin] = useState<FabAiOverlayOrigin>(
    FAB_AI_DEFAULT_ORIGIN,
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiScope, setAiScope] = useState<AiScope>("read_only");
  const [scopeSelection, setScopeSelection] = useState<ScopeSelection>("auto");
  const [autoModeActive, setAutoModeActive] = useState(true);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);
  const scopeToggleRef = useRef<HTMLButtonElement | null>(null);
  const [, setAiLoading] = useState(false);
  const [, setAiError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<AiIntentResponse | null>(null);
  const rawQuotaPercent = aiResponse?.quota?.percent_used;
  const quotaPercentValue =
    typeof rawQuotaPercent === "number" && Number.isFinite(rawQuotaPercent)
      ? rawQuotaPercent
      : 0;
  const quotaExceeded = quotaPercentValue >= 100;
  const [, setAiShowSnapshot] = useState(false);
  const [aiThread, setAiThread] = useState<LocalAiThreadMessage[]>([]);
  const [proposalFormState, setProposalFormState] = useState<
    Record<string, ProposalFormValues>
  >({});
  const [opsPreviewOpenById, setOpsPreviewOpenById] = useState<
    Record<string, boolean>
  >({});
  const resetAiHelperState = useCallback(() => {
    setAiThread([]);
    setAiResponse(null);
    setAiError(null);
    setAiShowSnapshot(false);
    setAiPrompt("");
    setAiScope("read_only");
    setScopeSelection("auto");
    setAutoModeActive(true);
    setScopeMenuOpen(false);
    setProposalFormState({});
    setOpsPreviewOpenById({});
    setAiLoading(false);
  }, []);
  const closeAiOverlay = useCallback(() => {
    resetAiHelperState();
    setAiOpen(false);
  }, [resetAiHelperState]);
  const aiOverlayRef = useRef<HTMLDivElement | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [aiThread]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<CreationType | null>(null);
  const [pressedCreationType, setPressedCreationType] =
    useState<CreationType | null>(null);
  const [creationSpawnOrigin, setCreationSpawnOrigin] =
    useState<FabCreationSpawnOrigin | null>(null);
  const [creationRevealGeometry, setCreationRevealGeometry] =
    useState<FabCreationRevealGeometry | null>(null);
  const [pendingCreationNameFocus, setPendingCreationNameFocus] =
    useState<CreationType | null>(null);
  const [activeCreationMode, setActiveCreationMode] =
    useState<CreationFormMode>("main");
  const [editHydrating, setEditHydrating] = useState(false);
  const handledCreationRequestIdRef = useRef<number | null>(null);
  const openingCreationRequestIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editTarget) {
      return;
    }

    setSelected(editTarget.entityType);
    setPressedCreationType(null);
    setCreationSpawnOrigin(null);
    setCreationRevealGeometry(null);
    setPendingCreationNameFocus(null);
    setActiveCreationMode("main");
    setExpanded(true);
    setIsDirectCreationOpen(false);
    setIsOpen(false);
  }, [editTarget]);
  useLayoutEffect(() => {
    const shouldHydrateEditTarget =
      editTarget?.entityType === "GOAL" ||
      editTarget?.entityType === "PROJECT" ||
      editTarget?.entityType === "HABIT" ||
      editTarget?.entityType === "TASK";
    setEditHydrating(Boolean(shouldHydrateEditTarget && editTarget?.entityId));
  }, [editTarget?.entityId, editTarget?.entityType, editTarget?.instanceId]);
  const [creationMainShellHeights, setCreationMainShellHeights] = useState<
    Partial<Record<CreationType, number>>
  >({});
  const expandedCreationBodyRef = useRef<HTMLDivElement | null>(null);
  const attachedCreationControlsRef = useRef<HTMLDivElement | null>(null);
  const creationRevealWrapperRef = useRef<HTMLDivElement | null>(null);
  const goalNameInputRef = useRef<HTMLInputElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);
  const taskNameInputRef = useRef<HTMLInputElement | null>(null);
  const habitNameInputRef = useRef<HTMLInputElement | null>(null);
  const creationSelectionTimeoutRef = useRef<number | null>(null);
  const mobileCreationFocusTimeoutRef = useRef<number | null>(null);
  const mobileCreationFocusTypeRef = useRef<CreationType | null>(null);
  const fabInputBlurTimeoutRef = useRef<number | null>(null);
  const fabKeyboardSettleTimeoutRef = useRef<number | null>(null);
  const wasFabKeyboardActiveRawRef = useRef(false);
  const [availableTags, setAvailableTags] = useState<FabTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState("");
  const [tagsLoading, setTagsLoading] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const initialOverlayStart = useMemo(
    () => roundToNearestMinutes(new Date(), 5),
    [],
  );
  const [overlayStartTime, setOverlayStartTime] =
    useState<Date>(initialOverlayStart);
  const [overlayEndTime, setOverlayEndTime] = useState<Date>(
    () =>
      new Date(
        initialOverlayStart.getTime() +
          DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
      ),
  );
  const [overlayStartInputValue, setOverlayStartInputValue] = useState(
    formatTimeInputValue(initialOverlayStart),
  );
  const [overlayEndInputValue, setOverlayEndInputValue] = useState(() =>
    formatTimeInputValue(
      new Date(
        initialOverlayStart.getTime() +
          DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
      ),
    ),
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPickerOpen, setOverlayPickerOpen] = useState(false);
  const [overlayPickerSelected, setOverlayPickerSelected] =
    useState<FabSearchResult | null>(null);
  const [overlayPlacedItems, setOverlayPlacedItems] = useState<
    OverlayPlacement[]
  >([]);
  const [isSavingLiveOverlay, setIsSavingLiveOverlay] = useState(false);
  const [overlaySaveError, setOverlaySaveError] = useState<string | null>(null);
  const overlayTimelineRef = useRef<HTMLDivElement | null>(null);
  const [overlayRemovalCandidateId, setOverlayRemovalCandidateId] = useState<
    string | null
  >(null);
  const [activeOverlayDragId, setActiveOverlayDragId] = useState<string | null>(
    null,
  );
  const [overlayDragMode, setOverlayDragMode] = useState<OverlayDragMode>(null);
  const overlayDragModeRef = useRef<OverlayDragMode>(null);
  const overlayDragIntentRef = useRef<OverlayDragIntent>({
    axis: null,
    startPoint: null,
    lastSnappedMinutes: null,
  });
  const overlayDragMetaRef = useRef<OverlayDragMeta | null>(null);
  const [overlayDragCandidate, setOverlayDragCandidate] =
    useState<OverlayDragCandidate | null>(null);
  const lastResolvedOverlayLayoutRef = useRef<OverlayPlacement[] | null>(null);
  const overlayWindowMinutes = Math.max(
    overlayDateToMinutes(overlayEndTime, overlayStartTime),
    1,
  );
  const overlayDurationMinutes = Math.max(overlayWindowMinutes, 15);
  const overlayDurationLabel = formatDurationLabel(overlayDurationMinutes);
  const overlayTimelineHeightPx = 280;
  const overlayTimelineDurationForLayout = Math.max(1, overlayDurationMinutes);
  const overlayTimelinePxPerMin = Math.max(
    0.9,
    Math.min(3.2, overlayTimelineHeightPx / overlayTimelineDurationForLayout),
  );
  const overlayTimelineStartHour =
    overlayStartTime.getHours() + overlayStartTime.getMinutes() / 60;
  const overlayTimelineEndHour =
    overlayTimelineStartHour + overlayTimelineDurationForLayout / 60;
  const overlayIntervalValid =
    overlayEndTime.getTime() > overlayStartTime.getTime();
  const minutesToTimelineStyle = (minutes: number) =>
    `calc(var(--timeline-minute-unit) * ${Math.max(0, minutes)})`;
  const renderOverlayPlacements = useMemo(() => {
    if (!overlayDragCandidate) {
      return overlayPlacedItems;
    }
    const delta =
      overlayDragCandidate.startMinutes - overlayDragCandidate.baseStartMinutes;
    const direction: OverlayLayoutDirection =
      delta > 0 ? "forward" : delta < 0 ? "backward" : "none";
    return resolveOverlayPlacementLayout({
      placements: overlayPlacedItems,
      overlayStartTime,
      overlayWindowMinutes,
      movingPlacementId: overlayDragCandidate.placementId,
      durationMinutes: overlayDragCandidate.durationMinutes,
      targetStartMinutes: overlayDragCandidate.startMinutes,
      rawTargetStartMinutes: overlayDragCandidate.startMinutes,
      direction,
    });
  }, [
    overlayDragCandidate,
    overlayPlacedItems,
    overlayStartTime,
    overlayWindowMinutes,
  ]);
  useEffect(() => {
    if (overlayDragCandidate) {
      lastResolvedOverlayLayoutRef.current = renderOverlayPlacements;
    } else {
      lastResolvedOverlayLayoutRef.current = null;
    }
  }, [overlayDragCandidate, renderOverlayPlacements]);
  const overlayDragCandidatePlacement = overlayDragCandidate
    ? renderOverlayPlacements.find(
        (placement) => placement.id === overlayDragCandidate.placementId,
      )
    : null;
  const overlayDragCandidatePlacementStartMinutes =
    overlayDragCandidatePlacement !== null
      ? Math.max(
          0,
          (overlayDragCandidatePlacement.start.getTime() -
            overlayStartTime.getTime()) /
            60000,
        )
      : null;
  const setOverlayDragModeWithRef = useCallback(
    (mode: OverlayDragMode) => {
      overlayDragModeRef.current = mode;
      setOverlayDragMode(mode);
    },
    [setOverlayDragMode],
  );
  const [startInputFocused, setStartInputFocused] = useState(false);
  const [endInputFocused, setEndInputFocused] = useState(false);
  useEffect(() => {
    setOverlayStartInputValue(formatTimeInputValue(overlayStartTime));
  }, [overlayStartTime]);
  useEffect(() => {
    setOverlayEndInputValue(formatTimeInputValue(overlayEndTime));
  }, [overlayEndTime]);
  useEffect(() => {
    if (!overlayOpen) {
      setOverlayRemovalCandidateId(null);
      setActiveOverlayDragId(null);
      setOverlayDragCandidate(null);
      setOverlayDragModeWithRef(null);
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: null,
        lastSnappedMinutes: null,
      };
      overlayDragMetaRef.current = null;
    }
  }, [overlayOpen, setOverlayDragModeWithRef]);

  const resetOverlayDraft = useCallback(() => {
    const nextStart = roundToNearestMinutes(new Date(), 5);
    const nextEnd = new Date(
      nextStart.getTime() + DEFAULT_OVERLAY_DURATION_MINUTES * 60000,
    );
    setOverlayStartTime(nextStart);
    setOverlayEndTime(nextEnd);
    setOverlayStartInputValue(formatTimeInputValue(nextStart));
    setOverlayEndInputValue(formatTimeInputValue(nextEnd));
    setOverlayPlacedItems([]);
    setOverlayPickerSelected(null);
    setOverlayPickerOpen(false);
  }, []);

  useEffect(() => {
    if (!overlayOpen) {
      setOverlaySaveError(null);
    }
  }, [overlayOpen]);
  const isPointerOverTrashZone = useCallback(
    (point: { x: number; y: number } | null) => {
      if (!point) return false;
      const rect = overlayNexusDropRef.current?.getBoundingClientRect();
      if (!rect) return false;
      const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
      const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
      const viewportPoint = {
        x: point.x - scrollX,
        y: point.y - scrollY,
      };
      const margin = 12;
      return (
        viewportPoint.x >= rect.left - margin &&
        viewportPoint.x <= rect.right + margin &&
        viewportPoint.y >= rect.top - margin &&
        viewportPoint.y <= rect.bottom + margin
      );
    },
    [],
  );
  const handleOverlayDrag = useCallback(
    (placement: OverlayPlacement, info: PanInfo) => {
      const intent = overlayDragIntentRef.current;
      const meta = overlayDragMetaRef.current;
      if (!intent.startPoint || !meta) return;

      const deltaX = info.point.x - intent.startPoint.x;
      const deltaY = info.point.y - intent.startPoint.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!intent.axis) {
        if (
          absX > OVERLAY_DRAG_AXIS_THRESHOLD_PX ||
          absY > OVERLAY_DRAG_AXIS_THRESHOLD_PX
        ) {
          intent.axis = absY >= absX ? "vertical" : "horizontal";
        }
      } else {
        const shouldSwitchToHorizontal =
          absX > OVERLAY_DRAG_AXIS_THRESHOLD_PX &&
          absX > absY * OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO;
        const shouldSwitchToVertical =
          absY > OVERLAY_DRAG_AXIS_THRESHOLD_PX &&
          absY > absX * OVERLAY_DRAG_HORIZONTAL_AXIS_SWITCH_RATIO;

        if (intent.axis === "vertical" && shouldSwitchToHorizontal) {
          intent.axis = "horizontal";
        } else if (intent.axis === "horizontal" && shouldSwitchToVertical) {
          intent.axis = "vertical";
        }
      }

      const overTrashZone = isPointerOverTrashZone(info.point);
      const nextMode: OverlayDragMode = overTrashZone ? "remove" : "reorder";
      if (nextMode !== overlayDragModeRef.current) {
        setOverlayRemovalCandidateId(
          nextMode === "remove" ? placement.id : null,
        );
        setOverlayDragModeWithRef(nextMode);
      }
      if (nextMode === "remove") {
        return;
      }

      const pxPerMin = Math.max(0.01, overlayTimelinePxPerMin);
      const rawMinutes = meta.baseStartMinutes + info.offset.y / pxPerMin;
      const maxDragStart = Math.max(
        0,
        overlayWindowMinutes - meta.durationMinutes,
      );
      const boundedRawMinutes = Math.min(Math.max(rawMinutes, 0), maxDragStart);
      const hysteresisMinutes = applyOverlayDragHysteresis(
        boundedRawMinutes,
        intent.lastSnappedMinutes,
      );
      const clampedMinutes = clampOverlayPlacementStart(
        hysteresisMinutes,
        meta.durationMinutes,
        overlayWindowMinutes,
      );
      const direction: OverlayLayoutDirection =
        clampedMinutes > meta.baseStartMinutes
          ? "forward"
          : clampedMinutes < meta.baseStartMinutes
            ? "backward"
            : "none";
      const preview = resolveOverlayPlacementLayout({
        placements: overlayPlacedItems,
        overlayStartTime,
        overlayWindowMinutes,
        movingPlacementId: placement.id,
        durationMinutes: meta.durationMinutes,
        targetStartMinutes: clampedMinutes,
        rawTargetStartMinutes: rawMinutes,
        direction,
      });
      const previewPlacement = preview.find(
        (entry) => entry.id === placement.id,
      );
      const previewStartMinutes = previewPlacement
        ? overlayDateToMinutes(previewPlacement.start, overlayStartTime)
        : clampedMinutes;
      const snappedChanged = intent.lastSnappedMinutes !== previewStartMinutes;
      intent.lastSnappedMinutes = previewStartMinutes;
      if (snappedChanged) {
        setOverlayDragCandidate({
          placementId: placement.id,
          startMinutes: previewStartMinutes,
          durationMinutes: meta.durationMinutes,
          baseStartMinutes: meta.baseStartMinutes,
        });
      }
    },
    [
      overlayTimelinePxPerMin,
      overlayWindowMinutes,
      setOverlayDragModeWithRef,
      isPointerOverTrashZone,
      overlayPlacedItems,
      overlayStartTime,
    ],
  );
  const startTimeInputId = useId();
  const endTimeInputId = useId();
  const fabKeyboardOwnerId = useId();
  const fabPanelChromeOwnerId = useId();
  const PROJECT_STAGE_OPTIONS_LOCAL = [
    { value: "RESEARCH", label: "RESEARCH" },
    { value: "TEST", label: "TEST" },
    { value: "BUILD", label: "BUILD" },
    { value: "REFINE", label: "REFINE" },
    { value: "RELEASE", label: "RELEASE" },
  ];
  const PRIORITY_OPTIONS_LOCAL = [
    { value: "NO", label: "NO" },
    { value: "LOW", label: "LOW" },
    { value: "MEDIUM", label: "MEDIUM" },
    { value: "HIGH", label: "HIGH" },
    { value: "CRITICAL", label: "CRITICAL" },
    { value: "ULTRA-CRITICAL", label: "Ultra" },
  ];
  const PRIORITY_ICON_MAP: Record<string, string | null> = {
    NO: null,
    LOW: null,
    MEDIUM: "!",
    HIGH: "!!",
    CRITICAL: "!!!",
    "ULTRA-CRITICAL": "⚠️",
  };
  const ENERGY_OPTIONS_LOCAL = [
    { value: "NO", label: "No" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "ULTRA", label: "Ultra" },
    { value: "EXTREME", label: "Extreme" },
  ];
  const TASK_STAGE_OPTIONS_LOCAL = [
    { value: "PREPARE", label: "Prepare" },
    { value: "PRODUCE", label: "Produce" },
    { value: "PERFECT", label: "Perfect" },
  ];
  const defaultHabitType = HABIT_TYPE_OPTIONS[0]?.value ?? "";
  const defaultHabitRecurrence =
    HABIT_RECURRENCE_OPTIONS.find((option) => option.value === "weekly")
      ?.value ??
    HABIT_RECURRENCE_OPTIONS[0]?.value ??
    "";
  const [projectName, setProjectName] = useState("");
  const [projectStage, setProjectStage] = useState<string>("RESEARCH");
  const [projectDuration, setProjectDuration] = useState<number | "">("");
  const [projectPriority, setProjectPriority] = useState<string>("MEDIUM");
  const [projectEnergy, setProjectEnergy] = useState<string>("MEDIUM");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [monumentEmojiMap, setMonumentEmojiMap] = useState<
    Map<string, string | null>
  >(new Map());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "goal-link-pulse-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes goalLinkPulse {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 0.72; }
      }
    `;
    document.head.appendChild(style);
  }, []);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalFilterSkillId, setGoalFilterSkillId] = useState("");
  const [goalFilterMonumentId, setGoalFilterMonumentId] = useState("");
  const [goalFilterEnergy, setGoalFilterEnergy] = useState("");
  const [goalFilterPriority, setGoalFilterPriority] = useState("");
  const [goalSort, setGoalSort] = useState<"recent" | "oldest" | "weight">(
    "recent",
  );
  const [goalSearch, setGoalSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [skillFilterMonumentId, setSkillFilterMonumentId] = useState("");
  const [showSkillFilters, setShowSkillFilters] = useState(false);
  const [taskProjectSearch, setTaskProjectSearch] = useState("");
  const [taskProjectFilterStage, setTaskProjectFilterStage] = useState("");
  const [taskProjectFilterPriority, setTaskProjectFilterPriority] =
    useState("");
  const [showTaskProjectFilters, setShowTaskProjectFilters] = useState(false);
  const [taskProjects, setTaskProjects] = useState<Project[]>([]);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const tagsByNormalizedName = useMemo(() => {
    const map = new Map<string, FabTag>();
    availableTags.forEach((tag) => {
      if (tag.normalized_name) {
        map.set(tag.normalized_name, tag);
      }
    });
    return map;
  }, [availableTags]);
  const filteredGoals = useMemo(() => {
    const query = goalSearch.trim().toLowerCase();
    let list = goals;
    if (query) {
      list = list.filter((goal) =>
        (goal.name ?? "").toLowerCase().includes(query),
      );
    }
    if (goalFilterEnergy) {
      list = list.filter(
        (goal) =>
          (goal.energy_code ?? goal.energy ?? "").toLowerCase() ===
          goalFilterEnergy.toLowerCase(),
      );
    }
    if (goalFilterPriority) {
      list = list.filter(
        (goal) =>
          (goal.priority ?? "").toLowerCase() ===
          goalFilterPriority.toLowerCase(),
      );
    }
    if (goalFilterMonumentId) {
      list = list.filter((goal) => {
        if (goal.circle_id) return true;
        return (goal.monument_id ?? "") === goalFilterMonumentId;
      });
    }
    if (goalFilterSkillId) {
      const skillName =
        skills.find((s) => s.id === goalFilterSkillId)?.name?.toLowerCase() ??
        "";
      list = list.filter((goal) => {
        const skillIds = (goal as typeof goal & { skills?: string[] }).skills;
        const matchesId = Array.isArray(skillIds)
          ? skillIds.includes(goalFilterSkillId)
          : false;
        const matchesName =
          skillName.length > 0 &&
          (goal.name ?? "").toLowerCase().includes(skillName);
        return matchesId || matchesName;
      });
    }
    const sorter =
      goalSort === "recent"
        ? (a: Goal, b: Goal) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : goalSort === "oldest"
          ? (a: Goal, b: Goal) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()
          : (a: Goal, b: Goal) => (b.weight ?? 0) - (a.weight ?? 0);
    return [...list].sort(sorter);
  }, [
    goalFilterEnergy,
    goalFilterMonumentId,
    goalFilterPriority,
    goalFilterSkillId,
    goalSearch,
    goalSort,
    goals,
    skills,
  ]);
  const filteredSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    let list = skills;
    if (term) {
      list = list.filter((skill) =>
        (skill.name ?? "").toLowerCase().includes(term),
      );
    }
    if (skillFilterMonumentId) {
      list = list.filter(
        (skill) => (skill.monument_id ?? "") === skillFilterMonumentId,
      );
    }
    const categoryOrder = new Map(
      skillCategories.map((cat, index) => [cat.id, index]),
    );
    const getCategoryIndex = (catId?: string | null) =>
      catId && categoryOrder.has(catId)
        ? (categoryOrder.get(catId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => {
      const catA = getCategoryIndex(a.cat_id ?? null);
      const catB = getCategoryIndex(b.cat_id ?? null);
      if (catA !== catB) return catA - catB;
      const nameA = (a.name ?? "").toLowerCase();
      const nameB = (b.name ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [skillCategories, skillFilterMonumentId, skillSearch, skills]);
  const goalsById = useMemo(() => {
    const map = new Map<string, Goal>();
    goals.forEach((goal) => {
      if (goal.id) {
        map.set(goal.id, goal);
      }
    });
    return map;
  }, [goals]);
  const filteredTaskProjects = useMemo(() => {
    let list = taskProjects;
    if (taskProjectFilterStage) {
      const stage = taskProjectFilterStage.toLowerCase();
      list = list.filter(
        (project) => (project.stage ?? "").toLowerCase() === stage,
      );
    }
    if (taskProjectFilterPriority) {
      const priority = taskProjectFilterPriority.toLowerCase();
      list = list.filter(
        (project) => (project.priority ?? "").toLowerCase() === priority,
      );
    }
    const term = taskProjectSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((project) =>
      (project.name ?? "").toLowerCase().includes(term),
    );
  }, [
    taskProjectFilterPriority,
    taskProjectFilterStage,
    taskProjectSearch,
    taskProjects,
  ]);
  const resetSkillLookupState = useCallback(() => {
    setSkillSearch("");
    setSkillFilterMonumentId("");
    setShowSkillFilters(false);
  }, []);
  const handleSkillDropdownOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setShowSkillFilters(false);
      }
    },
    [],
  );
  useEffect(() => {
    resetSkillLookupState();
  }, [resetSkillLookupState, selected]);
  useEffect(() => {
    if (selected !== "TASK") {
      setTaskProjectSearch("");
      setTaskProjectFilterStage("");
      setTaskProjectFilterPriority("");
      setShowTaskProjectFilters(false);
      setShowTaskDurationPicker(false);
      setTaskDurationPosition(null);
    }
  }, [selected]);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const durationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const durationPickerRef = useRef<HTMLDivElement | null>(null);
  const [durationPosition, setDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showTaskDurationPicker, setShowTaskDurationPicker] = useState(false);
  const taskDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const taskDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [taskDurationPosition, setTaskDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showDraftProjectDurationPicker, setShowDraftProjectDurationPicker] =
    useState(false);
  const draftProjectDurationTriggerRef =
    useRef<HTMLButtonElement | null>(null);
  const draftProjectDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [draftProjectDurationPosition, setDraftProjectDurationPosition] =
    useState<{
      top: number;
      left: number;
      width: number;
    } | null>(null);
  const [showDraftTaskDurationPicker, setShowDraftTaskDurationPicker] =
    useState(false);
  const draftTaskDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const draftTaskDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [draftTaskDurationPosition, setDraftTaskDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [showHabitDurationPicker, setShowHabitDurationPicker] = useState(false);
  const habitDurationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const habitDurationPickerRef = useRef<HTMLDivElement | null>(null);
  const [habitDurationPosition, setHabitDurationPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const normalizedProjectDuration =
    typeof projectDuration === "number" && Number.isFinite(projectDuration)
      ? projectDuration
      : 0;
  const updateDurationPosition = useCallback(() => {
    if (!showDurationPicker) return;
    const trigger = durationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setDurationPosition({ top, left: left + window.scrollX, width });
  }, [showDurationPicker]);

  const updateTaskDurationPosition = useCallback(() => {
    if (!showTaskDurationPicker) return;
    const trigger = taskDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setTaskDurationPosition({ top, left: left + window.scrollX, width });
  }, [showTaskDurationPicker]);
  const updateDraftProjectDurationPosition = useCallback(() => {
    if (!showDraftProjectDurationPicker) return;
    const trigger = draftProjectDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setDraftProjectDurationPosition({
      top,
      left: left + window.scrollX,
      width,
    });
  }, [showDraftProjectDurationPicker]);
  const updateDraftTaskDurationPosition = useCallback(() => {
    if (!showDraftTaskDurationPicker) return;
    const trigger = draftTaskDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setDraftTaskDurationPosition({ top, left: left + window.scrollX, width });
  }, [showDraftTaskDurationPicker]);
  useEffect(() => {
    if (!showDurationPicker) return;
    updateDurationPosition();
    const handle = () => updateDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showDurationPicker, updateDurationPosition]);

  useEffect(() => {
    if (!showDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        durationPickerRef.current?.contains(target) ||
        durationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showDurationPicker]);

  useEffect(() => {
    if (!showTaskDurationPicker) return;
    updateTaskDurationPosition();
    const handle = () => updateTaskDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showTaskDurationPicker, updateTaskDurationPosition]);

  useEffect(() => {
    if (!showTaskDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        taskDurationPickerRef.current?.contains(target) ||
        taskDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowTaskDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showTaskDurationPicker]);
  useEffect(() => {
    if (!showDraftProjectDurationPicker) return;
    updateDraftProjectDurationPosition();
    const handle = () => updateDraftProjectDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showDraftProjectDurationPicker, updateDraftProjectDurationPosition]);

  useEffect(() => {
    if (!showDraftProjectDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        draftProjectDurationPickerRef.current?.contains(target) ||
        draftProjectDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowDraftProjectDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showDraftProjectDurationPicker]);

  useEffect(() => {
    if (!showDraftTaskDurationPicker) return;
    updateDraftTaskDurationPosition();
    const handle = () => updateDraftTaskDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showDraftTaskDurationPicker, updateDraftTaskDurationPosition]);

  useEffect(() => {
    if (!showDraftTaskDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        draftTaskDurationPickerRef.current?.contains(target) ||
        draftTaskDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowDraftTaskDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showDraftTaskDurationPicker]);
  const toggleDurationPicker = () => {
    setShowDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (projectDuration === "" || !Number.isFinite(projectDuration))
      ) {
        setProjectDuration(30);
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateDurationPosition());
      return next;
    });
  };

  const toggleTaskDurationPicker = () => {
    setShowTaskDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!taskDuration || !Number.isFinite(Number.parseInt(taskDuration, 10)))
      ) {
        setTaskDuration("30");
      }
      requestAnimationFrame(() => updateTaskDurationPosition());
      return next;
    });
  };

  const adjustProjectDuration = (delta: number) => {
    const next = Math.max(0, normalizedProjectDuration + delta);
    setProjectDuration(next);
  };

  const adjustTaskDuration = (delta: number) => {
    const current = Number.parseInt(taskDuration || "30", 10);
    const next = Math.max(1, current + delta);
    setTaskDuration(next.toString());
  };
  const toggleDraftProjectDurationPicker = () => {
    setShowDraftProjectDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (draftProjectDuration === "" || !Number.isFinite(draftProjectDuration))
      ) {
        setDraftProjectDuration(30);
      }
      requestAnimationFrame(() => updateDraftProjectDurationPosition());
      return next;
    });
  };

  const toggleDraftTaskDurationPicker = () => {
    setShowDraftTaskDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!draftTaskDuration ||
          !Number.isFinite(Number.parseInt(draftTaskDuration, 10)))
      ) {
        setDraftTaskDuration("30");
      }
      requestAnimationFrame(() => updateDraftTaskDurationPosition());
      return next;
    });
  };

  const adjustDraftProjectDuration = (delta: number) => {
    const next = Math.max(0, normalizedDraftProjectDuration + delta);
    setDraftProjectDuration(next);
  };

  const adjustDraftTaskDuration = (delta: number) => {
    const current = Number.parseInt(draftTaskDuration || "30", 10);
    const next = Math.max(1, current + delta);
    setDraftTaskDuration(next.toString());
  };

  const updateHabitDurationPosition = useCallback(() => {
    if (!showHabitDurationPicker) return;
    const trigger = habitDurationTriggerRef.current;
    if (
      !trigger ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedHeight = 150;
    const margin = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow =
      spaceBelow > estimatedHeight + margin || rect.top < estimatedHeight;
    const top = placeBelow
      ? rect.bottom + margin + window.scrollY
      : Math.max(margin, rect.top - estimatedHeight) + window.scrollY;
    const desiredWidth = Math.max(rect.width, 320);
    const width = Math.min(desiredWidth, viewportWidth - margin * 2);
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - width - margin;
    }
    if (left < margin) left = margin;
    setHabitDurationPosition({ top, left: left + window.scrollX, width });
  }, [showHabitDurationPicker]);

  useEffect(() => {
    if (!showHabitDurationPicker) return;
    updateHabitDurationPosition();
    const handle = () => updateHabitDurationPosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [showHabitDurationPicker, updateHabitDurationPosition]);

  useEffect(() => {
    if (!showHabitDurationPicker) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        habitDurationPickerRef.current?.contains(target) ||
        habitDurationTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowHabitDurationPicker(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showHabitDurationPicker]);

  const toggleHabitDurationPicker = () => {
    setShowHabitDurationPicker((prev) => {
      const next = !prev;
      if (
        next &&
        (!habitDuration || !Number.isFinite(Number.parseInt(habitDuration, 10)))
      ) {
        setHabitDuration("15");
      }
      // Defer position calculation to allow layout to settle.
      requestAnimationFrame(() => updateHabitDurationPosition());
      return next;
    });
  };

  const adjustHabitDuration = (delta: number) => {
    const current = Number.parseInt(habitDuration || "15", 10);
    const next = Math.max(1, current + delta);
    setHabitDuration(next.toString());
  };

  const projectDurationTapHandlers = useTapHandler(() =>
    toggleDurationPicker(),
  );
  const taskDurationTapHandlers = useTapHandler(() =>
    toggleTaskDurationPicker(),
  );
  const draftProjectDurationTapHandlers = useTapHandler(() =>
    toggleDraftProjectDurationPicker(),
  );
  const draftTaskDurationTapHandlers = useTapHandler(() =>
    toggleDraftTaskDurationPicker(),
  );
  const habitDurationTapHandlers = useTapHandler(() =>
    toggleHabitDurationPicker(),
  );
  const projectDurationMinusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(-5),
  );
  const taskDurationMinusTapHandlers = useTapHandler(() =>
    adjustTaskDuration(-5),
  );
  const draftProjectDurationMinusTapHandlers = useTapHandler(() =>
    adjustDraftProjectDuration(-5),
  );
  const draftTaskDurationMinusTapHandlers = useTapHandler(() =>
    adjustDraftTaskDuration(-5),
  );
  const projectDurationPlusTapHandlers = useTapHandler(() =>
    adjustProjectDuration(5),
  );
  const taskDurationPlusTapHandlers = useTapHandler(() =>
    adjustTaskDuration(5),
  );
  const draftProjectDurationPlusTapHandlers = useTapHandler(() =>
    adjustDraftProjectDuration(5),
  );
  const draftTaskDurationPlusTapHandlers = useTapHandler(() =>
    adjustDraftTaskDuration(5),
  );
  const habitDurationMinusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(-5),
  );
  const habitDurationPlusTapHandlers = useTapHandler(() =>
    adjustHabitDuration(5),
  );
  const [projectSkillIds, setProjectSkillIds] = useState<string[]>([]);
  const [isGoalPickerOpen, setIsGoalPickerOpen] = useState(false);
  const goalPickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const goalPickerContentRef = useRef<HTMLDivElement | null>(null);
  const [projectGoalId, setProjectGoalId] = useState<string | null>(() =>
    creationRequest?.type === "PROJECT" ? (creationRequest.goalId ?? null) : null,
  );
  const [projectDue, setProjectDue] = useState("");
  const [projectHasExactDate, setProjectHasExactDate] = useState(false);
  const [projectExactDate, setProjectExactDate] = useState("");
  const [projectExactFallbackDate, setProjectExactFallbackDate] = useState("");
  const [projectExactStartTime, setProjectExactStartTime] = useState("");
  const [projectExactEndTime, setProjectExactEndTime] = useState("");
  const [showGoalFilters, setShowGoalFilters] = useState(false);
  const projectedRankState = useProjectedGlobalRank({
    goalId: projectGoalId,
    priority: projectPriority,
    stage: projectStage,
  });
  const [projectWhy, setProjectWhy] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalMonumentId, setGoalMonumentId] = useState<string | "">("");
  const [goalPriority, setGoalPriority] = useState("MEDIUM");
  const [goalEnergy, setGoalEnergy] = useState("MEDIUM");
  const [goalWhy, setGoalWhy] = useState("");
  const [goalDue, setGoalDue] = useState<string | null>(null);
  const [goalRelationType, setGoalRelationType] =
    useState<GoalRelationType>(null);
  const [goalRelationId, setGoalRelationId] = useState("");
  const [goalCircleId, setGoalCircleId] = useState<string | "">("");
  const [goalCampaignId, setGoalCampaignId] = useState<string | null>(null);
  const [goalCampaigns, setGoalCampaigns] = useState<GoalCampaignOption[]>([]);
  const [goalCampaignsLoading, setGoalCampaignsLoading] = useState(false);
  const [isCreatingGoalCampaignInline, setIsCreatingGoalCampaignInline] =
    useState(false);
  const [goalInlineCampaignName, setGoalInlineCampaignName] = useState("");
  const [goalInlineCampaignEmoji, setGoalInlineCampaignEmoji] = useState(
    FAB_DEFAULT_CAMPAIGN_EMOJI,
  );
  const [goalCampaignCreateError, setGoalCampaignCreateError] = useState<
    string | null
  >(null);
  const [goalCampaignCreating, setGoalCampaignCreating] = useState(false);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [monumentsLoading, setMonumentsLoading] = useState(false);
  const [manageableCircles, setManageableCircles] = useState<
    GoalCircleOption[]
  >([]);
  const [manageableCirclesLoading, setManageableCirclesLoading] =
    useState(false);
  const manageableCircleById = useMemo(() => {
    const map = new Map<string, GoalCircleOption>();
    manageableCircles.forEach((circle) => {
      map.set(circle.id, circle);
    });
    return map;
  }, [manageableCircles]);
  const getCircleGoalContextLabel = useCallback(
    (goal: Goal) => {
      const circleId = goal.circle_id;
      if (!circleId) return null;
      const circle = manageableCircleById.get(circleId);
      const circleType = circle?.circle_type?.trim();
      if (circleType) {
        return `Circle · ${circleType.toUpperCase()}`;
      }
      const circleName = circle?.name?.trim();
      return circleName ? `Circle · ${circleName}` : "Circle";
    },
    [manageableCircleById],
  );
  const [goalDraftProjects, setGoalDraftProjects] = useState<
    DraftProjectChild[]
  >([]);
  const [editGoalProjects, setEditGoalProjects] = useState<
    EditGoalProjectChild[]
  >([]);
  const [taskName, setTaskName] = useState("");
  const [taskStage, setTaskStage] = useState("PREPARE");
  const [taskDuration, setTaskDuration] = useState<string>("");
  const normalizedTaskDuration = Number.parseInt(taskDuration || "30", 10);
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskEnergy, setTaskEnergy] = useState("MEDIUM");
  const [taskProjectId, setTaskProjectId] = useState<string | "">("");
  const [taskSkillId, setTaskSkillId] = useState<string | "">("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskHasExactDate, setTaskHasExactDate] = useState(false);
  const [taskExactDate, setTaskExactDate] = useState("");
  const [taskExactFallbackDate, setTaskExactFallbackDate] = useState("");
  const [taskExactStartTime, setTaskExactStartTime] = useState("");
  const [taskExactEndTime, setTaskExactEndTime] = useState("");
  const [projectDraftTasks, setProjectDraftTasks] = useState<DraftTaskChild[]>(
    [],
  );
  const [editProjectTasks, setEditProjectTasks] = useState<
    EditProjectTaskChild[]
  >([]);
  const [habitName, setHabitName] = useState("");
  const [habitType, setHabitType] = useState(defaultHabitType);
  const [habitRecurrence, setHabitRecurrence] = useState(
    defaultHabitRecurrence,
  );
  const [memoCaptureActions, setMemoCaptureActions] =
    useState<MemoCaptureActionDraft>({
      note: true,
      form: false,
      photo: false,
    });
  const [memoNoteDestinationType, setMemoNoteDestinationType] = useState<
    "skill" | "monument"
  >("skill");
  const [memoNoteSkillId, setMemoNoteSkillId] = useState<string | "">("");
  const [memoNoteMonumentId, setMemoNoteMonumentId] = useState<string | "">("");
  const [memoFormSearch, setMemoFormSearch] = useState("");
  const [selectedMemoDatabaseTargetId, setSelectedMemoDatabaseTargetId] =
    useState<string | null>(null);
  const filteredMemoDatabaseTargets = useMemo(() => {
    const normalizedSearch = memoFormSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return MEMO_DATABASE_TARGET_OPTIONS;
    }

    return MEMO_DATABASE_TARGET_OPTIONS.filter((target) =>
      target.label.toLowerCase().includes(normalizedSearch),
    );
  }, [memoFormSearch]);
  const buildMemoCaptureConfig = useCallback((): MemoCaptureConfigJson => {
    if (habitType?.toUpperCase() !== "MEMO") {
      return {};
    }

    return {
      version: 1,
      actions: {
        note: memoCaptureActions.note,
        form: memoCaptureActions.form,
        photo: memoCaptureActions.photo,
      },
      noteDestination: {
        type: memoNoteDestinationType,
        skillId: memoNoteSkillId || null,
        monumentId: memoNoteMonumentId || null,
      },
      databaseCapture: {
        targetId: selectedMemoDatabaseTargetId || null,
      },
    };
  }, [
    habitType,
    memoCaptureActions,
    memoNoteDestinationType,
    memoNoteMonumentId,
    memoNoteSkillId,
    selectedMemoDatabaseTargetId,
  ]);
  const [habitDuration, setHabitDuration] = useState<string>("15");
  const [habitEnergy, setHabitEnergy] = useState("LOW");
  const [habitGoalId, setHabitGoalId] = useState<string | "">("");
  const [habitSkillId, setHabitSkillId] = useState<string | "">("");
  const [habitWhy, setHabitWhy] = useState("");
  const [habitLocationContextId, setHabitLocationContextId] = useState("");
  const [habitDaylightPreference, setHabitDaylightPreference] =
    useState("ALL_DAY");
  const [habitWindowEdgePreference, setHabitWindowEdgePreference] =
    useState("FRONT");
  const [habitNextDueOverride, setHabitNextDueOverride] = useState("");
  const [habitFixedStartTime, setHabitFixedStartTime] = useState("");
  const [habitFixedEndTime, setHabitFixedEndTime] = useState("");
  const [habitRoutineId, setHabitRoutineId] = useState<string | "">("");
  const [habitCircleId, setHabitCircleId] = useState<string | "">("");
  const [habitRoutines, setHabitRoutines] = useState<
    { id: string; name: string; description?: string | null }[]
  >([]);
  const [habitRoutinesLoading, setHabitRoutinesLoading] = useState(false);
  const [isCreatingHabitRoutineInline, setIsCreatingHabitRoutineInline] =
    useState(false);
  const [habitInlineRoutineName, setHabitInlineRoutineName] = useState("");
  const [habitInlineRoutineEmoji, setHabitInlineRoutineEmoji] = useState(
    FAB_DEFAULT_ROUTINE_EMOJI,
  );
  const [habitRoutineCreateError, setHabitRoutineCreateError] = useState<
    string | null
  >(null);
  const [habitInlineRoutineDescription, setHabitInlineRoutineDescription] =
    useState("");
  const selectedHabitCircle = useMemo(
    () =>
      habitCircleId ? (manageableCircleById.get(habitCircleId) ?? null) : null,
    [habitCircleId, manageableCircleById],
  );
  const habitCircleTriggerLabel = habitCircleId
    ? (selectedHabitCircle?.name ?? "Selected Circle")
    : "add to CIRCLE";
  const [nestedDraftPanel, setNestedDraftPanel] =
    useState<NestedDraftPanel>(null);
  const [draftProjectName, setDraftProjectName] = useState("");
  const [draftProjectStage, setDraftProjectStage] = useState("RESEARCH");
  const [draftProjectDuration, setDraftProjectDuration] = useState<
    number | ""
  >("");
  const [draftProjectPriority, setDraftProjectPriority] =
    useState("MEDIUM");
  const [draftProjectEnergy, setDraftProjectEnergy] = useState("MEDIUM");
  const [draftProjectWhy, setDraftProjectWhy] = useState("");
  const [draftProjectSkillIds, setDraftProjectSkillIds] = useState<string[]>(
    [],
  );
  const [draftProjectDue, setDraftProjectDue] = useState("");
  const [draftTaskName, setDraftTaskName] = useState("");
  const [draftTaskStage, setDraftTaskStage] = useState("PREPARE");
  const [draftTaskDuration, setDraftTaskDuration] = useState<string>("");
  const normalizedDraftTaskDuration = Number.parseInt(
    draftTaskDuration || "30",
    10,
  );
  const [draftTaskPriority, setDraftTaskPriority] = useState("MEDIUM");
  const [draftTaskEnergy, setDraftTaskEnergy] = useState("MEDIUM");
  const [draftTaskSkillId, setDraftTaskSkillId] = useState<string | "">("");
  const [draftTaskNotes, setDraftTaskNotes] = useState("");
  const [draftTaskDue, setDraftTaskDue] = useState("");
  const resetProjectFormDraft = useCallback(() => {
    setProjectName("");
    setProjectStage("RESEARCH");
    setProjectDuration("");
    setProjectPriority("MEDIUM");
    setProjectEnergy("MEDIUM");
    setProjectWhy("");
    setProjectSkillIds([]);
    setSkillSearch("");
    setProjectGoalId(null);
    setProjectDue("");
    setProjectHasExactDate(false);
    setProjectExactDate("");
    setProjectExactFallbackDate("");
    setProjectExactStartTime("");
    setProjectExactEndTime("");
    setShowDurationPicker(false);
    setDurationPosition(null);
  }, []);
  const resetGoalFormDraft = useCallback(() => {
    setGoalName("");
    setGoalMonumentId("");
    setGoalRelationType(null);
    setGoalRelationId("");
    setGoalCircleId("");
    setGoalPriority("MEDIUM");
    setGoalEnergy("MEDIUM");
    setGoalWhy("");
    setGoalDue(null);
    setGoalCampaignId(null);
    setIsCreatingGoalCampaignInline(false);
    setGoalInlineCampaignName("");
    setGoalInlineCampaignEmoji(FAB_DEFAULT_CAMPAIGN_EMOJI);
    setGoalCampaignCreateError(null);
    setGoalCampaignCreating(false);
  }, []);
  const resetHabitFormDraft = useCallback(() => {
    setHabitName("");
    setHabitType(defaultHabitType);
    setHabitRecurrence(defaultHabitRecurrence);
    setMemoCaptureActions({
      note: true,
      form: false,
      photo: false,
    });
    setMemoNoteDestinationType("skill");
    setMemoNoteSkillId("");
    setMemoNoteMonumentId("");
    setMemoFormSearch("");
    setSelectedMemoDatabaseTargetId(null);
    setHabitDuration("15");
    setHabitEnergy("LOW");
    setHabitGoalId("");
    setHabitSkillId("");
    setHabitWhy("");
    setHabitLocationContextId("");
    setHabitDaylightPreference("ALL_DAY");
    setHabitWindowEdgePreference("FRONT");
    setHabitNextDueOverride("");
    setHabitFixedStartTime("");
    setHabitFixedEndTime("");
    setHabitRoutineId("");
    setHabitCircleId("");
    setIsCreatingHabitRoutineInline(false);
    setHabitInlineRoutineName("");
    setHabitInlineRoutineEmoji(FAB_DEFAULT_ROUTINE_EMOJI);
    setHabitRoutineCreateError(null);
    setHabitInlineRoutineDescription("");
    setShowHabitDurationPicker(false);
    setHabitDurationPosition(null);
  }, [defaultHabitRecurrence, defaultHabitType]);
  const resetHabitRoutineInlineCreation = useCallback(() => {
    setIsCreatingHabitRoutineInline(false);
    setHabitInlineRoutineName("");
    setHabitInlineRoutineEmoji(FAB_DEFAULT_ROUTINE_EMOJI);
    setHabitRoutineCreateError(null);
    setHabitInlineRoutineDescription("");
  }, []);
  const handleMemoCaptureActionToggle = useCallback(
    (action: MemoCaptureToggleAction) => {
      if (
        action === "form" &&
        !memoCaptureActions.form &&
        !selectedMemoDatabaseTargetId
      ) {
        setSelectedMemoDatabaseTargetId("nutrition");
      }
      setMemoCaptureActions((current) => {
        const next = { ...current, [action]: !current[action] };
        if (!next.note && !next.form) return current;
        return next;
      });
    },
    [memoCaptureActions.form, selectedMemoDatabaseTargetId],
  );
  const resetTaskFormDraft = useCallback(() => {
    setTaskName("");
    setTaskStage("PREPARE");
    setTaskDuration("");
    setTaskPriority("MEDIUM");
    setTaskEnergy("MEDIUM");
    setTaskProjectId("");
    setTaskSkillId("");
    setTaskNotes("");
    setTaskDue("");
    setTaskHasExactDate(false);
    setTaskExactDate("");
    setTaskExactFallbackDate("");
    setTaskExactStartTime("");
    setTaskExactEndTime("");
    setShowTaskDurationPicker(false);
    setTaskDurationPosition(null);
  }, []);
  const findSkillById = useCallback(
    (id: string | null | undefined) =>
      id ? (skills.find((s) => s.id === id) ?? null) : null,
    [skills],
  );

  const getNextFabEnergyValue = (currentValue?: string | null) => {
    if (ENERGY_OPTIONS_LOCAL.length === 0) {
      return currentValue ?? "MEDIUM";
    }
    const currentIndex = ENERGY_OPTIONS_LOCAL.findIndex(
      (option) => option.value === currentValue,
    );
    if (currentIndex === -1) {
      return ENERGY_OPTIONS_LOCAL[0]?.value ?? "MEDIUM";
    }
    return (
      ENERGY_OPTIONS_LOCAL[(currentIndex + 1) % ENERGY_OPTIONS_LOCAL.length]
        ?.value ?? "MEDIUM"
    );
  };

  const normalizedDraftProjectDuration =
    typeof draftProjectDuration === "number" &&
    Number.isFinite(draftProjectDuration)
      ? draftProjectDuration
      : 0;
  const isDraftProjectReady =
    draftProjectName.trim().length > 0 && draftProjectSkillIds.length > 0;
  const isDraftTaskReady =
    draftTaskName.trim().length > 0 && Boolean(draftTaskSkillId);

  const resetNestedProjectDraftForm = useCallback(() => {
    setDraftProjectName("");
    setDraftProjectStage("RESEARCH");
    setDraftProjectDuration("");
    setDraftProjectPriority("MEDIUM");
    setDraftProjectEnergy("MEDIUM");
    setDraftProjectWhy("");
    setDraftProjectSkillIds([]);
    setDraftProjectDue("");
    setShowDraftProjectDurationPicker(false);
    setDraftProjectDurationPosition(null);
  }, []);

  const resetNestedTaskDraftForm = useCallback(() => {
    setDraftTaskName("");
    setDraftTaskStage("PREPARE");
    setDraftTaskDuration("");
    setDraftTaskPriority("MEDIUM");
    setDraftTaskEnergy("MEDIUM");
    setDraftTaskSkillId("");
    setDraftTaskNotes("");
    setDraftTaskDue("");
    setShowDraftTaskDurationPicker(false);
    setDraftTaskDurationPosition(null);
  }, []);

  const resetNestedDraftState = useCallback(() => {
    setNestedDraftPanel(null);
    setGoalDraftProjects([]);
    setProjectDraftTasks([]);
    resetNestedProjectDraftForm();
    resetNestedTaskDraftForm();
  }, [resetNestedProjectDraftForm, resetNestedTaskDraftForm]);

  const handleAddGoalDraftProject = useCallback(() => {
    const trimmedName = draftProjectName.trim();
    if (!trimmedName || draftProjectSkillIds.length === 0) return;
    setGoalDraftProjects((current) => [
      ...current,
      {
        tempId: createLocalDraftId(),
        name: trimmedName,
        priority: draftProjectPriority,
        energy: draftProjectEnergy,
        stage: draftProjectStage,
        why: draftProjectWhy.trim(),
        durationMin: normalizedDraftProjectDuration || null,
        dueDate: draftProjectDue || null,
        skillIds: [...draftProjectSkillIds],
      },
    ]);
    resetNestedProjectDraftForm();
    setNestedDraftPanel(null);
  }, [
    draftProjectEnergy,
    draftProjectDue,
    draftProjectName,
    draftProjectPriority,
    draftProjectSkillIds,
    draftProjectStage,
    draftProjectWhy,
    normalizedDraftProjectDuration,
    resetNestedProjectDraftForm,
  ]);

  useLayoutEffect(() => {
    const entityType = editTarget?.entityType;
    const entityId = editTarget?.entityId;
    if (!entityType || !entityId) {
      return;
    }
    if (entityType === "GOAL") {
      resetGoalFormDraft();
    } else if (entityType === "PROJECT") {
      resetProjectFormDraft();
    } else if (entityType === "HABIT") {
      resetHabitFormDraft();
    } else if (entityType === "TASK") {
      resetTaskFormDraft();
    } else {
      return;
    }
    setSelectedTagIds([]);
    setTagInputValue("");
    setIsCreatingTag(false);
  }, [
    editTarget?.entityId,
    editTarget?.entityType,
    resetGoalFormDraft,
    resetHabitFormDraft,
    resetProjectFormDraft,
    resetTaskFormDraft,
  ]);

  useLayoutEffect(() => {
    if (editTarget?.entityType !== "PROJECT") {
      return;
    }

    const seededTitle =
      typeof editTarget.title === "string" ? editTarget.title.trim() : "";
    if (!seededTitle) {
      return;
    }

    setProjectName(seededTitle);
  }, [editTarget?.entityId, editTarget?.entityType, editTarget?.title]);

  useEffect(() => {
    if (editTarget?.entityType !== "GOAL" || !editTarget.entityId) {
      setEditGoalProjects([]);
    }
    if (editTarget?.entityType !== "PROJECT" || !editTarget.entityId) {
      setEditProjectTasks([]);
    }
  }, [editTarget?.entityId, editTarget?.entityType]);

  useEffect(() => {
    const entityType = editTarget?.entityType;
    const entityId = editTarget?.entityId;
    const instanceId =
      typeof editTarget?.instanceId === "string" &&
      editTarget.instanceId.trim().length > 0
        ? editTarget.instanceId
        : null;
    if (!entityType || !entityId) {
      setEditHydrating(false);
      return;
    }
    if (
      entityType !== "PROJECT" &&
      entityType !== "GOAL" &&
      entityType !== "HABIT" &&
      entityType !== "TASK"
    ) {
      setEditHydrating(false);
      return;
    }

    let cancelled = false;

    const hydrateEditTarget = async () => {
      const supabase = getSupabaseBrowser();
      const safeEditTarget = {
        entityType,
        entityId,
      };
      if (!supabase) {
        if (!cancelled) {
          setEditHydrating(false);
        }
        return;
      }

      let hydrationBranch: string | null = null;
      let hydrationSelect: string | null = null;

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          if (!cancelled) {
            setEditHydrating(false);
          }
          return;
        }

        if (entityType === "GOAL") {
          hydrationBranch = "GOAL";
          const [
            { data: goalRowData, error: goalError },
            { data: tagRowsData, error: tagError },
            { data: campaignGoalRowsData, error: campaignGoalError },
            { data: projectRowsData, error: projectRowsError },
          ] = await Promise.all([
            supabase
              .from("goals")
              .select(
                "id, name, priority, energy, priority_code, energy_code, why, monument_id, circle_id, roadmap_id, due_date",
              )
              .eq("id", entityId)
              .single(),
            supabase
              .from("event_tags")
              .select("tag_id")
              .eq("user_id", user.id)
              .eq("entity_type", "GOAL")
              .eq("entity_id", entityId),
            supabase
              .from("campaign_goals")
              .select("campaign_id")
              .eq("user_id", user.id)
              .eq("goal_id", entityId)
              .order("position", { ascending: true })
              .limit(1),
            supabase
              .from("projects")
              .select("id, name, stage, priority, energy, duration_min, due_date")
              .eq("user_id", user.id)
              .eq("goal_id", entityId)
              .order("created_at", { ascending: true }),
          ]);

          if (goalError) throw goalError;
          if (tagError) throw tagError;
          if (campaignGoalError) throw campaignGoalError;
          if (projectRowsError) throw projectRowsError;
          if (cancelled) return;

          const goalRow = goalRowData as FabGoalEditRow | null;
          const tagRows = tagRowsData as FabTagRelationRow[] | null;
          const campaignGoalRows =
            campaignGoalRowsData as FabGoalCampaignRow[] | null;
          const hydratedCampaignId =
            campaignGoalRows?.[0]?.campaign_id ?? null;
          let campaignContext: FabGoalCampaignContextRow | null = null;
          if (hydratedCampaignId) {
            const { data: campaignContextData, error: campaignContextError } =
              await supabase
                .from("campaigns")
                .select(
                  "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, scheduling_state, position",
                )
                .eq("id", hydratedCampaignId)
                .eq("user_id", user.id)
                .maybeSingle();
            if (campaignContextError) throw campaignContextError;
            campaignContext =
              campaignContextData as FabGoalCampaignContextRow | null;
          }
          const roadmapContextId =
            goalRow?.roadmap_id ?? campaignContext?.roadmap_id ?? null;
          let roadmapContext: FabRoadmapContextRow | null = null;
          if (roadmapContextId) {
            const { data: roadmapContextData, error: roadmapContextError } =
              await supabase
                .from("roadmaps")
                .select("id, monument_id, circle_id")
                .eq("id", roadmapContextId)
                .eq("user_id", user.id)
                .maybeSingle();
            if (roadmapContextError) throw roadmapContextError;
            roadmapContext = roadmapContextData as FabRoadmapContextRow | null;
          }
          if (cancelled) return;

          const selectedCampaignContext = campaignContext;
          if (selectedCampaignContext) {
            const selectedCampaignOption: GoalCampaignOption = {
              ...selectedCampaignContext,
              scheduling_state:
                selectedCampaignContext.scheduling_state ?? "ACTIVE",
            };
            setGoalCampaigns((current) =>
              current.some(
                (campaign) => campaign.id === selectedCampaignOption.id,
              )
                ? current
                : [...current, selectedCampaignOption],
            );
          }
          const projectRows = Array.isArray(projectRowsData)
            ? (projectRowsData as {
                id: string;
                name: string | null;
                stage: string | null;
                priority: string | null;
                energy: string | null;
                duration_min: number | null;
                due_date: string | null;
              }[])
            : [];
          const projectIds = projectRows
            .map((row) => row.id)
            .filter((projectId): projectId is string => Boolean(projectId));
          const skillIdsByProjectId = new Map<string, string[]>();
          if (projectIds.length > 0) {
            const { data: projectSkillRowsData, error: projectSkillRowsError } =
              await supabase
                .from("project_skills")
                .select("project_id, skill_id")
                .in("project_id", projectIds);
            if (projectSkillRowsError) throw projectSkillRowsError;
            if (cancelled) return;
            const projectSkillRows = Array.isArray(projectSkillRowsData)
              ? (projectSkillRowsData as {
                  project_id?: string | null;
                  skill_id?: string | null;
                }[])
              : [];
            for (const row of projectSkillRows) {
              const projectId =
                typeof row.project_id === "string" ? row.project_id : null;
              const skillId =
                typeof row.skill_id === "string" ? row.skill_id : null;
              if (!projectId || !skillId) continue;
              const current = skillIdsByProjectId.get(projectId) ?? [];
              current.push(skillId);
              skillIdsByProjectId.set(projectId, current);
            }
          }
          const normalizedPriority = pickHydratedGoalPriority(
            goalRow?.priority,
            goalRow?.priority_code,
          );
          const normalizedEnergy = pickHydratedGoalEnergy(
            goalRow?.energy,
            goalRow?.energy_code,
          );

          if (process.env.NODE_ENV === "development") {
            console.log("[fab goal hydration]", {
              rawPriority: goalRow?.priority,
              rawPriorityCode: goalRow?.priority_code,
              normalizedPriority,
              rawEnergy: goalRow?.energy,
              rawEnergyCode: goalRow?.energy_code,
              normalizedEnergy,
            });
          }

          setGoalName(goalRow?.name ?? "");
          setGoalPriority(normalizedPriority);
          setGoalEnergy(normalizedEnergy);
          setGoalWhy(goalRow?.why ?? "");
          const hydratedMonumentId =
            goalRow?.monument_id ||
            campaignContext?.primary_monument_id ||
            roadmapContext?.monument_id ||
            "";
          const hydratedCircleId =
            hydratedMonumentId
              ? ""
              : (goalRow?.circle_id ||
                campaignContext?.primary_circle_id ||
                roadmapContext?.circle_id ||
                "");
          setGoalMonumentId(hydratedMonumentId);
          setGoalCircleId(hydratedCircleId);
          if (hydratedMonumentId) {
            setGoalRelationType("MONUMENT");
            setGoalRelationId(hydratedMonumentId);
          } else if (hydratedCircleId) {
            setGoalRelationType("CIRCLE");
            setGoalRelationId(hydratedCircleId);
          } else {
            setGoalRelationType(null);
            setGoalRelationId("");
          }
          setGoalDue(
            typeof goalRow?.due_date === "string"
              ? goalRow.due_date.slice(0, 10)
              : null,
          );
          setEditGoalProjects(
            projectRows.map((project) => ({
              id: project.id,
              name: project.name ?? "Untitled project",
              stage: project.stage ?? null,
              priority: project.priority ?? null,
              energy: project.energy ?? null,
              durationMin:
                typeof project.duration_min === "number"
                  ? project.duration_min
                  : null,
              dueDate:
                typeof project.due_date === "string"
                  ? project.due_date.slice(0, 10)
                  : null,
              skillIds: skillIdsByProjectId.get(project.id) ?? [],
            })),
          );
          setGoalCampaignId(hydratedCampaignId);
          setSelectedTagIds(
            Array.isArray(tagRows)
              ? tagRows
                  .map((row) => row.tag_id)
                  .filter((tagId): tagId is string => Boolean(tagId))
              : [],
          );
        } else if (entityType === "PROJECT") {
          hydrationBranch = "PROJECT";
          const [
            { data: projectRow, error: projectError },
            { data: instanceRow, error: instanceError },
            { data: lockedScheduleRow, error: lockedScheduleError },
            { data: skillRows, error: skillError },
            { data: tagRows, error: tagError },
          ] = await Promise.all([
            supabase
              .from("projects")
              .select(
                "id, name, goal_id, stage, duration_min, priority, energy, why, due_date",
              )
              .eq("id", entityId)
              .eq("user_id", user.id)
              .single(),
            instanceId
              ? supabase
                  .from("schedule_instances")
                  .select("id, duration_min, energy_resolved")
                  .eq("id", instanceId)
                  .eq("user_id", user.id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
            supabase
              .from("schedule_instances")
              .select("id, start_utc, end_utc")
              .eq("user_id", user.id)
              .eq("source_type", "PROJECT")
              .eq("source_id", entityId)
              .eq("locked", true)
              .order("start_utc", { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("project_skills")
              .select("skill_id")
              .eq("project_id", entityId)
              .limit(1),
            supabase
              .from("event_tags")
              .select("tag_id")
              .eq("user_id", user.id)
              .eq("entity_type", "PROJECT")
              .eq("entity_id", entityId),
          ]);

          if (projectError) throw projectError;
          if (instanceError) throw instanceError;
          if (lockedScheduleError) throw lockedScheduleError;
          if (skillError) throw skillError;
          if (tagError) throw tagError;
          if (cancelled) return;

          const projectData = projectRow as FabProjectEditRow | null;
          const instanceData =
            instanceRow as FabProjectScheduleInstanceRow | null;
          const lockedScheduleData =
            lockedScheduleRow as FabLockedScheduleInstanceRow | null;
          const resolvedProjectEnergy =
            typeof instanceData?.energy_resolved === "string" &&
            instanceData.energy_resolved.trim().length > 0
              ? instanceData.energy_resolved
              : projectData?.energy;
          const primarySkillId =
            Array.isArray(skillRows) &&
            typeof skillRows[0]?.skill_id === "string"
              ? skillRows[0].skill_id
              : null;

          setProjectName(projectData?.name ?? "");
          setProjectGoalId(
            typeof projectData?.goal_id === "string" &&
              projectData.goal_id.trim().length > 0
              ? projectData.goal_id
              : null,
          );
          setProjectStage(projectData?.stage ?? "RESEARCH");
          setProjectDuration(
            typeof instanceData?.duration_min === "number"
              ? instanceData.duration_min
              : typeof projectData?.duration_min === "number"
                ? projectData.duration_min
                : "",
          );
          setProjectPriority(normalizeFabPriority(projectData?.priority));
          setProjectEnergy(normalizeFabEnergy(resolvedProjectEnergy));
          setProjectWhy(projectData?.why ?? "");
          setProjectDue(
            typeof projectData?.due_date === "string"
              ? projectData.due_date.slice(0, 10)
              : "",
          );
          const projectExactSchedule = getSplitExactScheduleInputValues(
            lockedScheduleData?.start_utc,
            lockedScheduleData?.end_utc,
          );
          setProjectHasExactDate(projectExactSchedule.hasExactDate);
          setProjectExactDate(projectExactSchedule.date);
          setProjectExactFallbackDate(projectExactSchedule.date);
          setProjectExactStartTime(projectExactSchedule.startTime);
          setProjectExactEndTime(projectExactSchedule.endTime);
          setProjectSkillIds(primarySkillId ? [primarySkillId] : []);
          setSelectedTagIds(
            Array.isArray(tagRows)
              ? tagRows
                  .map((row) => row.tag_id)
                  .filter((tagId): tagId is string => Boolean(tagId))
              : [],
          );

          const { data: taskRows, error: taskRowsError } = await supabase
            .from("tasks")
            .select("id, name, stage, skill_id")
            .eq("user_id", user.id)
            .eq("project_id", entityId);
          if (cancelled) return;
          if (taskRowsError) {
            console.error("Failed to load project child tasks", taskRowsError);
            setEditProjectTasks([]);
            return;
          }
          setEditProjectTasks(
            Array.isArray(taskRows)
              ? taskRows.map((task) => ({
                  id: task.id,
                  name: task.name ?? "Untitled task",
                  stage: task.stage ?? null,
                  skillId: task.skill_id ?? null,
                  dueDate: null,
                }))
              : [],
          );
        } else if (entityType === "HABIT") {
          hydrationBranch = "HABIT";
          const [
            { data: habitRow, error: habitError },
            { data: tagRows, error: tagError },
          ] = await Promise.all([
            supabase
              .from("habits")
              .select("*")
              .eq("id", entityId)
              .maybeSingle(),
            supabase
              .from("event_tags")
              .select("tag_id")
              .eq("user_id", user.id)
              .eq("entity_type", "HABIT")
              .eq("entity_id", entityId),
          ]);

          if (habitError) throw habitError;
          if (tagError) throw tagError;
          if (cancelled) return;

          if (!habitRow) {
            console.warn("FAB edit target habit not found during hydration", {
              editTarget: safeEditTarget,
              entityType,
              entityId,
              branch: "HABIT",
            });
            setSelectedTagIds(
              Array.isArray(tagRows)
                ? tagRows
                    .map((row) => row.tag_id)
                    .filter((tagId): tagId is string => Boolean(tagId))
                : [],
            );
            return;
          }

          const habitRowRecord = habitRow as Record<string, unknown>;
          const legacyHabitType =
            typeof habitRowRecord.type === "string" ? habitRowRecord.type : null;
          const normalizedHabitTypeValue =
            normalizeHabitType(
              typeof habitRowRecord.habit_type === "string"
                ? habitRowRecord.habit_type
                : legacyHabitType,
            ) || defaultHabitType;
          const durationValue =
            typeof habitRowRecord.duration_minutes === "number"
              ? habitRowRecord.duration_minutes
              : typeof habitRowRecord.duration_min === "number"
                ? habitRowRecord.duration_min
                : 15;

          setHabitName(
            typeof habitRowRecord.name === "string" ? habitRowRecord.name : "",
          );
          setHabitType(normalizedHabitTypeValue);
          setHabitRecurrence(
            typeof habitRowRecord.recurrence === "string"
              ? habitRowRecord.recurrence
              : defaultHabitRecurrence,
          );
          setHabitDuration(String(durationValue));
          setHabitEnergy(
            typeof habitRowRecord.energy === "string"
              ? habitRowRecord.energy
              : "LOW",
          );
          setHabitGoalId(
            typeof habitRowRecord.goal_id === "string"
              ? habitRowRecord.goal_id
              : "",
          );
          setHabitSkillId(
            typeof habitRowRecord.skill_id === "string"
              ? habitRowRecord.skill_id
              : "",
          );
          setHabitWhy(
            typeof habitRowRecord.description === "string"
              ? habitRowRecord.description
              : "",
          );
          setHabitLocationContextId(
            typeof habitRowRecord.location_context_id === "string"
              ? habitRowRecord.location_context_id
              : "",
          );
          setHabitDaylightPreference(
            typeof habitRowRecord.daylight_preference === "string"
              ? habitRowRecord.daylight_preference
              : "ALL_DAY",
          );
          setHabitWindowEdgePreference(
            typeof habitRowRecord.window_edge_preference === "string"
              ? habitRowRecord.window_edge_preference
              : "FRONT",
          );
          setHabitNextDueOverride(
            formatDateTimeLocalInputValue(
              typeof habitRowRecord.next_due_override === "string"
                ? habitRowRecord.next_due_override
                : null,
            ),
          );
          setHabitFixedStartTime(
            formatLocalTimeInputValue(
              typeof habitRowRecord.fixed_start_local === "string"
                ? habitRowRecord.fixed_start_local
                : null,
            ),
          );
          setHabitFixedEndTime(
            formatLocalTimeInputValue(
              typeof habitRowRecord.fixed_end_local === "string"
                ? habitRowRecord.fixed_end_local
                : null,
            ),
          );
          setHabitRoutineId(
            typeof habitRowRecord.routine_id === "string"
              ? habitRowRecord.routine_id
              : "",
          );
          setHabitCircleId(
            typeof habitRowRecord.circle_id === "string"
              ? habitRowRecord.circle_id
              : "",
          );
          setSelectedTagIds(
            Array.isArray(tagRows)
              ? tagRows
                  .map((row) => row.tag_id)
                  .filter((tagId): tagId is string => Boolean(tagId))
              : [],
          );
        } else {
          hydrationBranch = "TASK";
          const taskEditHydrationSelect =
            "id, name, project_id, priority, energy, stage, duration_min, skill_id, why";
          hydrationSelect = taskEditHydrationSelect;
          const [
            { data: taskRowData, error: taskError },
            { data: lockedScheduleRowData, error: lockedScheduleError },
            { data: tagRowsData, error: tagError },
          ] = await Promise.all([
            supabase
              .from("tasks")
              .select(taskEditHydrationSelect)
              .eq("id", entityId)
              .eq("user_id", user.id)
              .single(),
            supabase
              .from("schedule_instances")
              .select("id, start_utc, end_utc")
              .eq("user_id", user.id)
              .eq("source_type", "TASK")
              .eq("source_id", entityId)
              .eq("locked", true)
              .order("start_utc", { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from("event_tags")
              .select("tag_id")
              .eq("user_id", user.id)
              .eq("entity_type", "TASK")
              .eq("entity_id", entityId),
          ]);

          if (taskError) throw taskError;
          if (lockedScheduleError) throw lockedScheduleError;
          if (tagError) throw tagError;
          if (cancelled) return;

          const taskRow = taskRowData as FabTaskEditRow | null;
          const lockedScheduleRow =
            lockedScheduleRowData as FabLockedScheduleInstanceRow | null;
          const tagRows = tagRowsData as FabTagRelationRow[] | null;

          setTaskName(taskRow?.name ?? "");
          setTaskProjectId(taskRow?.project_id ?? "");
          setTaskPriority(normalizeFabPriority(taskRow?.priority));
          setTaskEnergy(normalizeFabEnergy(taskRow?.energy));
          setTaskStage(
            taskRow?.stage === "PREPARE" ||
              taskRow?.stage === "PRODUCE" ||
              taskRow?.stage === "PERFECT"
              ? taskRow.stage
              : "PREPARE",
          );
          setTaskDuration(
            typeof taskRow?.duration_min === "number" &&
              Number.isFinite(taskRow.duration_min) &&
              taskRow.duration_min > 0
              ? String(taskRow.duration_min)
              : "30",
          );
          setTaskSkillId(taskRow?.skill_id ?? "");
          setTaskNotes(taskRow?.why ?? "");
          const taskExactSchedule = getSplitExactScheduleInputValues(
            lockedScheduleRow?.start_utc,
            lockedScheduleRow?.end_utc,
          );
          setTaskHasExactDate(taskExactSchedule.hasExactDate);
          setTaskExactDate(taskExactSchedule.date);
          setTaskExactFallbackDate(taskExactSchedule.date);
          setTaskExactStartTime(taskExactSchedule.startTime);
          setTaskExactEndTime(taskExactSchedule.endTime);
          setSelectedTagIds(
            Array.isArray(tagRows)
              ? tagRows
                  .map((row) => row.tag_id)
                  .filter((tagId): tagId is string => Boolean(tagId))
              : [],
          );
        }
      } catch (error) {
        const supabaseError =
          error && typeof error === "object"
            ? (error as {
                message?: string;
                details?: string;
                hint?: string;
                code?: string;
              })
            : null;

        console.error("Failed to hydrate FAB edit target", {
          editTarget: safeEditTarget,
          entityType,
          entityId,
          branch: hydrationBranch,
          select: hydrationSelect,
          message:
            supabaseError?.message ??
            (typeof error === "string" ? error : null),
          details: supabaseError?.details ?? null,
          hint: supabaseError?.hint ?? null,
          code: supabaseError?.code ?? null,
        });
      } finally {
        if (!cancelled) {
          setEditHydrating(false);
        }
      }
    };

    void hydrateEditTarget();

    return () => {
      cancelled = true;
    };
  }, [
    defaultHabitRecurrence,
    defaultHabitType,
    editTarget?.entityId,
    editTarget?.entityType,
    editTarget?.instanceId,
    resetHabitFormDraft,
    resetProjectFormDraft,
    resetTaskFormDraft,
  ]);

  useEffect(() => {
    if (editTarget?.entityType !== "PROJECT") return;
    const primarySkillId = projectSkillIds[0];
    if (!primarySkillId) {
      setSkillSearch("");
      return;
    }
    const selectedSkill = findSkillById(primarySkillId);
    if (!selectedSkill?.name) return;
    setSkillSearch((current) =>
      current.trim().length === 0 || current === selectedSkill.name
        ? selectedSkill.name
        : current,
    );
  }, [editTarget?.entityType, findSkillById, projectSkillIds]);

  const handleAddProjectDraftTask = useCallback(() => {
    const trimmedName = draftTaskName.trim();
    if (!trimmedName || !draftTaskSkillId) return;
    setProjectDraftTasks((current) => [
      ...current,
      {
        tempId: createLocalDraftId(),
        name: trimmedName,
        priority: draftTaskPriority,
        energy: draftTaskEnergy,
        stage: draftTaskStage,
        why: draftTaskNotes.trim(),
        durationMin: normalizedDraftTaskDuration || null,
        skillId: draftTaskSkillId,
        dueDate: draftTaskDue || null,
      },
    ]);
    resetNestedTaskDraftForm();
    setNestedDraftPanel(null);
  }, [
    draftTaskDue,
    draftTaskEnergy,
    draftTaskName,
    draftTaskNotes,
    draftTaskPriority,
    draftTaskSkillId,
    draftTaskStage,
    normalizedDraftTaskDuration,
    resetNestedTaskDraftForm,
  ]);

  const SKILL_OPTION_TAP_MOVE_THRESHOLD_PX = 8;

  function SkillOptionRow({ skill }: { skill: Skill }) {
    const { onSelect, selectedValue } = useSelectContext();
    const pointerStateRef = React.useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      moved: boolean;
    } | null>(null);
    const suppressClickRef = React.useRef(false);
    const selected = selectedValue === skill.id;
    const label = skill.name ?? "";
    const selectSkill = () => {
      onSelect?.(skill.id, label);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const moved =
        Math.abs(event.clientX - state.startX) >
          SKILL_OPTION_TAP_MOVE_THRESHOLD_PX ||
        Math.abs(event.clientY - state.startY) >
          SKILL_OPTION_TAP_MOVE_THRESHOLD_PX;
      if (moved) {
        state.moved = true;
      }
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pointerStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      pointerStateRef.current = null;

      if (state.moved) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 250);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = true;
      selectSkill();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 250);
    };

    const handlePointerCancel = () => {
      pointerStateRef.current = null;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 250);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      selectSkill();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      selectSkill();
    };

    return (
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full cursor-pointer select-none items-center gap-2 px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600/30",
          fabCreationSelectItemClass(selected),
        )}
        style={{ touchAction: "pan-y" }}
      >
        <span className="text-lg">{skill.icon ?? "🛠️"}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-white/70" aria-hidden="true" />
        ) : null}
      </button>
    );
  }

  const renderGroupedSkillItems = useCallback(() => {
    const UNCATEGORIZED_SKILL_GROUP_ID = "__uncategorized_skill_group__";
    const UNCATEGORIZED_SKILL_GROUP_LABEL = "Uncategorized";
    const groups = new Map<
      string,
      { id: string; label: string; skills: Skill[] }
    >();

    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_SKILL_GROUP_ID;
      const categoryLabel =
        skillCategories
          .find((category) => category.id === groupId)
          ?.name?.trim() || UNCATEGORIZED_SKILL_GROUP_LABEL;
      const group = groups.get(groupId) ?? {
        id: groupId,
        label:
          groupId === UNCATEGORIZED_SKILL_GROUP_ID
            ? UNCATEGORIZED_SKILL_GROUP_LABEL
            : categoryLabel,
        skills: [],
      };
      group.skills.push(skill);
      groups.set(groupId, group);
    });

    const orderedGroups: Array<{ id: string; label: string; skills: Skill[] }> =
      [];
    const seen = new Set<string>();

    skillCategories.forEach((category) => {
      const group = groups.get(category.id);
      if (!group) return;
      orderedGroups.push({
        ...group,
        label: category.name?.trim() || group.label,
      });
      seen.add(category.id);
    });

    const uncategorizedGroup = groups.get(UNCATEGORIZED_SKILL_GROUP_ID);
    if (uncategorizedGroup) {
      orderedGroups.push(uncategorizedGroup);
      seen.add(UNCATEGORIZED_SKILL_GROUP_ID);
    }

    groups.forEach((group, groupId) => {
      if (!seen.has(groupId)) {
        orderedGroups.push(group);
      }
    });

    return orderedGroups.map((group) => (
      <div key={group.id} className="space-y-2 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
          {group.label}
        </div>
        <div className="grid gap-1">
          {group.skills.map((skill) => (
            <SkillOptionRow key={skill.id} skill={skill} />
          ))}
        </div>
      </div>
    ));
  }, [filteredSkills, skillCategories]);

  function EnergyCycleButton({
    value,
    onChange,
    ariaLabel,
    size = "md",
    className,
  }: {
    value?: string | null;
    onChange: (value: string) => void;
    ariaLabel: string;
    size?: FlameEmberProps["size"];
    className?: string;
  }) {
    const resolvedLevel = normalizeFlameLevel(value);
    return (
      <button
        type="button"
        onClick={() => onChange(getNextFabEnergyValue(resolvedLevel))}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] text-white transition hover:border-white/30 hover:bg-white/10",
          className,
        )}
        aria-label={ariaLabel}
        title={`${ariaLabel} (${resolvedLevel})`}
      >
        <FlameEmber
          level={resolvedLevel}
          size={size}
          className="pointer-events-none -translate-y-[3px]"
        />
      </button>
    );
  }

  function SkillTrigger({
    selectedId,
    onClearSelection,
  }: {
    selectedId: string | null;
    onClearSelection?: () => void;
  }) {
    const { setIsOpen } = useSelectContext();
    const selectedSkill = findSkillById(selectedId);
    const backspaceTapRef = React.useRef<{ count: number; last: number }>({
      count: 0,
      last: 0,
    });
    const handlePointerDown = (
      event: React.PointerEvent<HTMLInputElement>,
    ) => {
      event.stopPropagation();
      setIsOpen?.(true);
    };
    const handleClick = (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation();
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      setIsOpen?.(true);
      if (event.key !== "Backspace") {
        backspaceTapRef.current = { count: 0, last: 0 };
        return;
      }
      const now = Date.now();
      const { last, count } = backspaceTapRef.current;
      const isRapidBackspace = now - last < 600;
      const nextCount = isRapidBackspace ? count + 1 : 1;
      backspaceTapRef.current = { count: nextCount, last: now };
      if (skillSearch.length > 0 && nextCount >= 2) {
        event.preventDefault();
        setSkillSearch("");
        backspaceTapRef.current = { count: 0, last: now };
        return;
      }
      if (
        event.key === "Backspace" &&
        skillSearch.trim().length === 0 &&
        selectedId
      ) {
        onClearSelection?.();
        setSkillSearch("");
      }
    };
    return (
      <div
        className={cn(
          "flex h-12 w-full items-center gap-3 px-3 text-sm transition focus-within:border-blue-400/60 focus-within:ring-0 md:h-14",
          FAB_CREATION_CLOSED_FIELD_CLASS,
        )}
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-lg">
          {selectedSkill?.icon ?? "🛠️"}
        </span>
        <Input
          value={skillSearch}
          readOnly={false}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          onFocus={() => setIsOpen?.(true)}
          onChange={(e) => setSkillSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedSkill?.name ??
            (selectedId && skillsLoading ? "Loading skill…" : "Search skills…")
          }
          className="h-full flex-1 border-none bg-transparent p-0 text-base font-semibold text-white placeholder:text-white/60 focus-visible:ring-0"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setShowSkillFilters((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setShowSkillFilters((v) => !v);
            }
          }}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            showSkillFilters && "text-white",
          )}
          aria-label="Filter skills"
        >
          <Filter className="h-4 w-4" />
        </div>
      </div>
    );
  }

  const goalFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const skillFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const taskProjectFilterMenuRef = useRef<HTMLDivElement | null>(null);

  const [modalEventType, setModalEventType] = useState<
    "GOAL" | "PROJECT" | "TASK" | "HABIT" | null
  >(null);
  const [showNote, setShowNote] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const pages = FAB_PAGES;
  const pageCount = FAB_PAGES.length;
  const [activeFabPage, setActiveFabPage] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTargetPage, setDragTargetPage] = useState<number | null>(null);
  const [dragDirection, setDragDirection] = useState<1 | -1 | null>(null);
  const [, setIsAnimatingPageChange] = useState(false);
  const isDraggingRef = useRef(false);
  const dragTargetPageRef = useRef<number | null>(null);
  const dragDirectionRef = useRef<1 | -1 | null>(null);
  const pageDragAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const pendingFabSwipeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    fromNexusScroll: true;
    event: PointerEvent;
  } | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FabSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchCursor, setSearchCursor] = useState<FabSearchCursor | null>(
    null,
  );
  const [overlayFilterMonumentId, setOverlayFilterMonumentId] =
    useState<string>("");
  const [overlayFilterSkillId, setOverlayFilterSkillId] = useState<string>("");
  const [overlayFilterEventType, setOverlayFilterEventType] =
    useState<OverlayEventTypeFilter>("ALL");
  const [overlaySortMode, setOverlaySortMode] =
    useState<OverlaySortMode>("scheduled");
  const [rescheduleTarget, setRescheduleTarget] =
    useState<FabSearchResult | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSavingFab, setIsSavingFab] = useState(false);
  const [isDeletingFabEntity, setIsDeletingFabEntity] = useState(false);
  const [isPreparingGoalDelete, setIsPreparingGoalDelete] = useState(false);
  const [goalDeleteConfirmTarget, setGoalDeleteConfirmTarget] =
    useState<FabGoalDeleteConfirmTarget | null>(null);
  const [activeLimitCode, setActiveLimitCode] =
    useState<LimitErrorCode | null>(null);
  const fabSavePendingRef = useRef(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const fabRootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayNexusDropRef = useRef<HTMLButtonElement | null>(null);
  const isDraggingOverlay = Boolean(activeOverlayDragId);
  const searchAbortRef = useRef<AbortController | null>(null);
  const overlayPickerResults = useMemo(() => {
    const matchesMonument = overlayFilterMonumentId.trim().length > 0;
    const matchesSkill = overlayFilterSkillId.trim().length > 0;
    const matchesEventType = overlayFilterEventType !== "ALL";

    const resolveMonumentId = (result: FabSearchResult): string | null => {
      const explicit =
        result.monumentId ??
        result.monument_id ??
        result.goalMonumentId ??
        null;
      if (explicit) {
        return explicit;
      }
      if (result.goalId) {
        const goal = goalsById.get(result.goalId);
        if (goal?.monument_id) {
          return goal.monument_id;
        }
      }
      return null;
    };

    const resolveSkillIds = (result: FabSearchResult): string[] => {
      const values = [
        result.skillId,
        result.skill_id,
        ...(Array.isArray(result.skillIds) ? result.skillIds : []),
      ];
      return Array.from(
        new Set(
          values.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          ),
        ),
      );
    };

    const normalizePriorityValue = (value?: string | null): string | null => {
      if (!value) return null;
      return value
        .trim()
        .toUpperCase()
        .replace(/[\s_]+/g, "-");
    };

    const getPriorityIndex = (result: FabSearchResult): number => {
      const goal = result.goalId ? goalsById.get(result.goalId) : undefined;
      const candidate =
        result.priority ?? result.priority_label ?? goal?.priority ?? null;
      const normalized = normalizePriorityValue(candidate);
      if (!normalized) return -1;
      const index = SCHEDULER_PRIORITY_LABELS.findIndex(
        (label) => label === normalized,
      );
      return index >= 0 ? index : -1;
    };

    const getUpdatedTimestamp = (result: FabSearchResult): number => {
      const value =
        result.updatedAt ??
        result.updated_at ??
        result.nextScheduledAt ??
        result.completedAt ??
        null;
      if (!value) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    };

    const parseGlobalRank = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const numeric = typeof value === "number" ? value : Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const compareByName = (a: FabSearchResult, b: FabSearchResult) =>
      (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    const compareResults = (a: FabSearchResult, b: FabSearchResult) => {
      switch (overlaySortMode) {
        case "recent": {
          return getUpdatedTimestamp(b) - getUpdatedTimestamp(a);
        }
        case "alphabetical": {
          return (a.name ?? "")
            .toLowerCase()
            .localeCompare((b.name ?? "").toLowerCase());
        }
        case "priority": {
          const priorityA = getPriorityIndex(a);
          const priorityB = getPriorityIndex(b);
          if (priorityA !== priorityB) {
            return priorityB - priorityA;
          }
          return 0;
        }
        case "global_rank": {
          const rankA = parseGlobalRank(a.global_rank ?? null);
          const rankB = parseGlobalRank(b.global_rank ?? null);
          if (rankA !== null && rankB !== null) {
            return rankA - rankB;
          }
          if (rankA === null && rankB === null) {
            return 0;
          }
          return rankA === null ? 1 : -1;
        }
        case "scheduled": {
          const aHas = !!a.nextScheduledAt;
          const bHas = !!b.nextScheduledAt;
          if (aHas !== bHas) {
            return aHas ? -1 : 1;
          }
          if (a.nextScheduledAt && b.nextScheduledAt) {
            if (a.nextScheduledAt !== b.nextScheduledAt) {
              return a.nextScheduledAt < b.nextScheduledAt ? -1 : 1;
            }
          }
          return compareByName(a, b);
        }
        default:
          return 0;
      }
    };

    let filtered = searchResults;
    if (matchesMonument) {
      filtered = filtered.filter(
        (result) => resolveMonumentId(result) === overlayFilterMonumentId,
      );
    }
    if (matchesSkill) {
      filtered = filtered.filter(
        (result) => resolveSkillIds(result).includes(overlayFilterSkillId),
      );
    }
    if (matchesEventType) {
      filtered = filtered.filter(
        (result) => result.type === overlayFilterEventType,
      );
    }

    const indexed = filtered.map((result, index) => ({
      result,
      index,
    }));
    indexed.sort((a, b) => {
      const diff = compareResults(a.result, b.result);
      if (diff !== 0) return diff;
      return a.index - b.index;
    });
    return indexed.map(({ result }) => result);
  }, [
    goalsById,
    overlayFilterMonumentId,
    overlayFilterSkillId,
    overlayFilterEventType,
    overlaySortMode,
    searchResults,
  ]);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const pageX = useMotionValue(0);
  const pageDragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const { isPlus } = useEntitlement();
  const locationContextsResult = useLocationContexts();
  const locationContextOptions = useMemo(() => {
    if (Array.isArray(locationContextsResult)) {
      return locationContextsResult;
    }
    if (
      locationContextsResult &&
      typeof locationContextsResult === "object" &&
      "contexts" in locationContextsResult &&
      Array.isArray(locationContextsResult.contexts)
    ) {
      return locationContextsResult.contexts;
    }
    if (
      locationContextsResult &&
      typeof locationContextsResult === "object" &&
      "locationContexts" in locationContextsResult &&
      Array.isArray(locationContextsResult.locationContexts)
    ) {
      return locationContextsResult.locationContexts;
    }
    return [];
  }, [locationContextsResult]);
  const locationContextsLoading =
    !Array.isArray(locationContextsResult) &&
    Boolean(locationContextsResult?.loading);
  const locationContextsError =
    !Array.isArray(locationContextsResult) &&
    typeof locationContextsResult?.error === "string"
      ? locationContextsResult.error
      : null;
  const validLocationContexts = useMemo(
    () =>
      locationContextOptions.filter(
        (context): context is { id: string; label: string; value: string } =>
          Boolean(context) &&
          typeof context.id === "string" &&
          isValidUuid(context.id) &&
          typeof context.label === "string" &&
          typeof context.value === "string",
      ),
    [locationContextOptions],
  );
  const goToBilling = useCallback(() => {
    setActiveLimitCode(null);
    router.push("/settings/billing");
  }, [router]);
  const handleLimitModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setActiveLimitCode(null);
      }
    },
    [setActiveLimitCode],
  );
  const limitModalCopy = activeLimitCode
    ? LIMIT_MODAL_COPY[activeLimitCode]
    : null;
  const limitModalTitle = limitModalCopy?.title ?? "Upgrade to CREATOR Pro";
  const limitModalDescription =
    limitModalCopy?.description ?? "Upgrade to CREATOR Pro to add more.";
  const limitModalCtaLabel = isPlus ? "Manage subscription" : "Upgrade to CREATOR Pro";
  const VERTICAL_WHEEL_TRIGGER = 20;
  const DRAG_THRESHOLD_PX = 80;
  const PAGE_DRAG_AXIS_THRESHOLD_PX = 8;
  const PAGE_DRAG_HORIZONTAL_DOMINANCE = 1.25;
  const PAGE_DRAG_VERTICAL_DOMINANCE = 1.15;
  const nexusInputRef = useRef<HTMLInputElement | null>(null);
  const editableDeleteTarget =
    editTarget?.entityType === selected &&
    (selected === "GOAL" || selected === "PROJECT" || selected === "HABIT") &&
    editTarget.entityId
      ? editTarget
      : null;
  const overhangControlWidth = editableDeleteTarget ? 168 : 108;
  const overhangPos = useOverhangLT(
    panelRef,
    [expanded, selected, overhangControlWidth],
    {
      groupWidth: overhangControlWidth,
      listenVisualViewport: !expanded,
    },
  );
  const isMemoHabitCreation =
    selected === "HABIT" && habitType?.toUpperCase() === "MEMO";
  const previousHabitTypeRef = useRef<string | null>(null);
  const activeCreationModes = getCreationModesForType(selected).filter(
    (mode) => mode.id !== "memoForms" || isMemoHabitCreation,
  );
  const creationModeClusterWidth =
    activeCreationModes.length > 0 ? activeCreationModes.length * 36 + (activeCreationModes.length - 1) * 6 : 0;
  const creationModeOverhangPos = useOverhangLT(
    panelRef,
    [expanded, selected, activeCreationMode, creationModeClusterWidth],
    {
      listenVisualViewport: !expanded,
      groupWidth: creationModeClusterWidth,
      groupHeight: 34,
      overhang: 8,
      align: "left",
    },
  );
  const [stableViewportHeight, setStableViewportHeight] = useState<
    number | null
  >(null);
  const stableViewportHeightRef = useRef<number | null>(null);
  const [stableSafeBottom, setStableSafeBottom] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [visualViewportKeyboardInset, setVisualViewportKeyboardInset] =
    useState(0);
  const [mobileFabPanelHeight, setMobileFabPanelHeight] = useState<
    number | null
  >(null);
  const [isFabInputFocused, setIsFabInputFocused] = useState(false);
  const [isFabKeyboardSettling, setIsFabKeyboardSettling] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [attachedCreationControlsHeight, setAttachedCreationControlsHeight] =
    useState<number | null>(null);
  const isKeyboardVisible = useMemo(() => {
    if (!expanded) return false;
    if (stableViewportHeight && viewportHeight) {
      const shrink = stableViewportHeight - viewportHeight;
      if (shrink > 80) return true;
    }
    if (visualViewportKeyboardInset > 80) return true;
    return keyboardLift > 24;
  }, [
    expanded,
    keyboardLift,
    stableViewportHeight,
    viewportHeight,
    visualViewportKeyboardInset,
  ]);
  const clearFabBodyClassOwners = useCallback(() => {
    teardownFabViewportState({
      keyboardOwnerId: fabKeyboardOwnerId,
      panelOwnerId: fabPanelChromeOwnerId,
      blurActiveElement: false,
    });
  }, [fabKeyboardOwnerId, fabPanelChromeOwnerId]);
  const resetFabViewportState = useCallback(() => {
    if (typeof window !== "undefined") {
      if (fabInputBlurTimeoutRef.current !== null) {
        window.clearTimeout(fabInputBlurTimeoutRef.current);
        fabInputBlurTimeoutRef.current = null;
      }
      if (fabKeyboardSettleTimeoutRef.current !== null) {
        window.clearTimeout(fabKeyboardSettleTimeoutRef.current);
        fabKeyboardSettleTimeoutRef.current = null;
      }
      if (mobileCreationFocusTimeoutRef.current !== null) {
        window.clearTimeout(mobileCreationFocusTimeoutRef.current);
        mobileCreationFocusTimeoutRef.current = null;
      }
    }

    if (typeof document !== "undefined") {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        panelRef.current?.contains(activeElement)
      ) {
        activeElement.blur();
      }
    }

    mobileCreationFocusTypeRef.current = null;
    wasFabKeyboardActiveRawRef.current = false;
    setKeyboardLift(0);
    setVisualViewportKeyboardInset(0);
    setIsFabInputFocused(false);
    setIsFabKeyboardSettling(false);
    setMobileFabPanelHeight(null);
    setAttachedCreationControlsHeight(null);
    setViewportHeight(null);
    clearFabBodyClassOwners();
  }, [clearFabBodyClassOwners]);
  const closeExpandedPanel = useCallback(
    (options?: { notifyEditClose?: boolean }) => {
      if (creationSelectionTimeoutRef.current !== null) {
        window.clearTimeout(creationSelectionTimeoutRef.current);
        creationSelectionTimeoutRef.current = null;
      }
      resetFabViewportState();
      setPressedCreationType(null);
      setCreationSpawnOrigin(null);
      setCreationRevealGeometry(null);
      setExpanded(false);
      setSelected(null);
      setPendingCreationNameFocus(null);
      openingCreationRequestIdRef.current = null;
      setIsDirectCreationOpen(false);
      setIsOpen(false);
      if (options?.notifyEditClose ?? Boolean(editTarget)) {
        onEditClose?.();
      }
    },
    [editTarget, onEditClose, resetFabViewportState],
  );
  const isFabKeyboardActiveRaw =
    expanded && (isKeyboardVisible || (isMobileViewport && isFabInputFocused));
  const shouldUseDirectCreationModal =
    isDirectCreationOpen && expanded && selected !== null;
  const shouldUseAttachedFabControls =
    expanded && (isFabKeyboardActiveRaw || isFabKeyboardSettling);
  const shouldUseKeyboardConstrainedFabSizing =
    expanded && (isKeyboardVisible || isFabKeyboardSettling);
  const shouldAttachCreationControls =
    expanded &&
    (shouldUseAttachedFabControls || (isMobileViewport && selected !== null));
  const shouldSuppressMobileFabChrome =
    expanded && isMobileViewport && selected !== null;
  const shouldUseStableMobileFabPanel = shouldSuppressMobileFabChrome;
  const shouldUseScrollableFabBody =
    shouldUseKeyboardConstrainedFabSizing || shouldUseStableMobileFabPanel;
  const shouldHideOverhangButtons =
    expanded && (shouldAttachCreationControls || shouldUseDirectCreationModal);

  useEffect(() => {
    stableViewportHeightRef.current = stableViewportHeight;
  }, [stableViewportHeight]);

  useEffect(() => {
    if (fabKeyboardSettleTimeoutRef.current !== null) {
      window.clearTimeout(fabKeyboardSettleTimeoutRef.current);
      fabKeyboardSettleTimeoutRef.current = null;
    }

    if (!expanded) {
      wasFabKeyboardActiveRawRef.current = false;
      setIsFabKeyboardSettling(false);
      return;
    }

    if (isFabKeyboardActiveRaw) {
      wasFabKeyboardActiveRawRef.current = true;
      setIsFabKeyboardSettling(false);
      return;
    }

    if (!wasFabKeyboardActiveRawRef.current) {
      setIsFabKeyboardSettling(false);
      return;
    }

    setIsFabKeyboardSettling(true);
    fabKeyboardSettleTimeoutRef.current = window.setTimeout(() => {
      fabKeyboardSettleTimeoutRef.current = null;
      wasFabKeyboardActiveRawRef.current = false;
      setIsFabKeyboardSettling(false);
    }, FAB_KEYBOARD_SETTLE_MS);

    return () => {
      if (fabKeyboardSettleTimeoutRef.current !== null) {
        window.clearTimeout(fabKeyboardSettleTimeoutRef.current);
        fabKeyboardSettleTimeoutRef.current = null;
      }
    };
  }, [expanded, isFabKeyboardActiveRaw]);

  useEffect(() => {
    if (!editTarget?.entityId || !editTarget?.entityType) {
      setActiveCreationMode("main");
    }
  }, [editTarget?.entityId, editTarget?.entityType, expanded, selected]);

  useEffect(() => {
    const normalizedType = habitType?.toUpperCase() ?? null;
    const previousType = previousHabitTypeRef.current;
    previousHabitTypeRef.current = normalizedType;
    if (normalizedType === "MEMO" && previousType !== "MEMO") {
      setMemoNoteDestinationType("skill");
      setMemoNoteSkillId(habitSkillId || "");
    }
  }, [habitSkillId, habitType]);

  useEffect(() => {
    if (habitType?.toUpperCase() !== "MEMO" || memoNoteSkillId || !habitSkillId) {
      return;
    }
    setMemoNoteSkillId(habitSkillId);
  }, [habitSkillId, habitType, memoNoteSkillId]);

  useEffect(() => {
    if (activeCreationMode === "memoForms" && !isMemoHabitCreation) {
      setActiveCreationMode("main");
    }
  }, [activeCreationMode, isMemoHabitCreation]);

  useEffect(() => {
    return () => {
      if (creationSelectionTimeoutRef.current !== null) {
        window.clearTimeout(creationSelectionTimeoutRef.current);
        creationSelectionTimeoutRef.current = null;
      }
      if (mobileCreationFocusTimeoutRef.current !== null) {
        window.clearTimeout(mobileCreationFocusTimeoutRef.current);
        mobileCreationFocusTimeoutRef.current = null;
      }
    };
  }, []);

  const getCreationNameInput = useCallback((type: CreationType | null) => {
    switch (type) {
      case "GOAL":
        return goalNameInputRef.current;
      case "PROJECT":
        return projectNameInputRef.current;
      case "TASK":
        return taskNameInputRef.current;
      case "HABIT":
        return habitNameInputRef.current;
      default:
        return null;
    }
  }, []);

  const focusCreationNameInput = useCallback(
    (
      type: CreationType | null,
      opts?: { blurIfMobileKeyboardBlocked?: boolean },
    ) => {
      const input = getCreationNameInput(type);
      if (!input || input.disabled) return false;

      input.focus({ preventScroll: true });
      const didFocus = document.activeElement === input;

      if (
        didFocus &&
        opts?.blurIfMobileKeyboardBlocked &&
        typeof window !== "undefined" &&
        window.visualViewport
      ) {
        if (mobileCreationFocusTimeoutRef.current !== null) {
          window.clearTimeout(mobileCreationFocusTimeoutRef.current);
        }
        mobileCreationFocusTypeRef.current = type;
        mobileCreationFocusTimeoutRef.current = window.setTimeout(() => {
          mobileCreationFocusTimeoutRef.current = null;
          const stableHeight = stableViewportHeightRef.current;
          const viewportHeightLoss =
            stableHeight && window.visualViewport
              ? stableHeight - window.visualViewport.height
              : 0;
          if (
            mobileCreationFocusTypeRef.current !== type ||
            document.activeElement !== input ||
            getClampedVisualViewportKeyboardInset() > 80 ||
            viewportHeightLoss > 80
          ) {
            return;
          }
          input.blur();
          mobileCreationFocusTypeRef.current = null;
        }, FAB_MOBILE_FOCUS_KEYBOARD_TIMEOUT_MS);
      }

      return didFocus;
    },
    [getCreationNameInput],
  );

  useEffect(() => {
    if (
      !expanded ||
      !pendingCreationNameFocus ||
      selected !== pendingCreationNameFocus ||
      activeCreationMode !== "main" ||
      editTarget
    ) {
      return;
    }

    let cancelled = false;
    let fallbackTimeout: number | null = null;

    const animationFrame = window.requestAnimationFrame(() => {
      if (cancelled) return;
      fallbackTimeout = window.setTimeout(() => {
        if (cancelled) return;
        focusCreationNameInput(pendingCreationNameFocus);
        setPendingCreationNameFocus(null);
      }, prefersReducedMotion ? 80 : FAB_CREATION_FOCUS_DELAY_MS);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      if (fallbackTimeout !== null) {
        window.clearTimeout(fallbackTimeout);
      }
    };
  }, [
    activeCreationMode,
    expanded,
    focusCreationNameInput,
    editTarget,
    pendingCreationNameFocus,
    prefersReducedMotion,
    selected,
  ]);

  const previousSelectedRef = useRef<CreationType | null>(null);
  useEffect(() => {
    const selectedChanged = previousSelectedRef.current !== selected;
    if (!expanded || selectedChanged) {
      setSelectedTagIds([]);
      setTagInputValue("");
      setIsCreatingTag(false);
      setProjectDue("");
      setTaskDue("");
      setHabitLocationContextId("");
      setHabitDaylightPreference("ALL_DAY");
      setHabitWindowEdgePreference("FRONT");
      setHabitNextDueOverride("");
      resetNestedDraftState();
    }
    if (!expanded) {
      setAvailableTags([]);
      setTagsLoading(false);
    }
    previousSelectedRef.current = selected;
  }, [expanded, resetNestedDraftState, selected]);

  useEffect(() => {
    if (!expanded || !selected) return;
    let cancelled = false;
    const loadTags = async () => {
      try {
        setTagsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          if (!cancelled) {
            setAvailableTags([]);
            setTagsLoading(false);
          }
          return;
        }
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          if (!cancelled) {
            setAvailableTags([]);
            setTagsLoading(false);
          }
          return;
        }
        const tagsTableName: string = "tags";
        const { data, error } = await supabase
          .from(tagsTableName as keyof Database["public"]["Tables"])
          .select("id, user_id, name, normalized_name, color")
          .eq("user_id", user.id)
          .order("name", { ascending: true });
        if (error) throw error;
        if (!cancelled) {
          setAvailableTags((data ?? []) as FabTag[]);
        }
      } catch (error) {
        console.error("Failed to load tags", error);
        if (!cancelled) {
          setAvailableTags([]);
        }
      } finally {
        if (!cancelled) {
          setTagsLoading(false);
        }
      }
    };
    void loadTags();
    return () => {
      cancelled = true;
      setSelectedTagIds([]);
      setTagInputValue("");
    };
  }, [expanded, selected]);

  useEffect(() => {
    if (!expanded) return;
    const measureOnce = () => {
      if (typeof window === "undefined") return;
      const height = Math.max(
        window.innerHeight,
        window.visualViewport?.height ?? 0,
      );
      setStableViewportHeight((prev) => prev ?? height);
      setViewportHeight(
        (prev) => prev ?? window.visualViewport?.height ?? window.innerHeight,
      );
      const safeBottom =
        Number.parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue("--sat-safe-bottom")
            .trim() || "0",
        ) || 0;
      setStableSafeBottom((prev) => prev || safeBottom);
    };
    const handleResize = () => {
      if (typeof window === "undefined") return;
      const nextHeight = window.innerHeight;
      setStableViewportHeight((prev) => {
        if (prev === null) return nextHeight;
        // Ignore shrinkage (likely keyboard); allow growth (rotation/fullscreen).
        if (nextHeight > prev * 0.98) return nextHeight;
        return prev;
      });
    };
    measureOnce();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", measureOnce);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", measureOnce);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setKeyboardLift(0);
      setVisualViewportKeyboardInset(0);
      setIsFabInputFocused(false);
      return;
    }
    const updateLift = () => {
      if (typeof window === "undefined") return;
      const viewport = window.visualViewport;
      if (!viewport) {
        setKeyboardLift(0);
        return;
      }
      const viewportH = viewport.height ?? window.innerHeight;
      if (viewportH) {
        setViewportHeight(viewportH);
      }
      const keyboardInset = getClampedVisualViewportKeyboardInset();
      const lift = Math.max(0, keyboardInset - stableSafeBottom);
      setVisualViewportKeyboardInset(keyboardInset);
      setKeyboardLift(lift);
    };
    updateLift();
    const viewport = window.visualViewport;
    const viewportEvents = ["resize", "scroll", "geometrychange"];
    viewportEvents.forEach((eventName) => {
      viewport?.addEventListener(eventName, updateLift);
    });
    window.addEventListener("orientationchange", updateLift);
    return () => {
      viewportEvents.forEach((eventName) => {
        viewport?.removeEventListener(eventName, updateLift);
      });
      window.removeEventListener("orientationchange", updateLift);
    };
  }, [expanded, stableSafeBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const update = () => setIsMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!expanded) {
      if (fabInputBlurTimeoutRef.current !== null) {
        window.clearTimeout(fabInputBlurTimeoutRef.current);
        fabInputBlurTimeoutRef.current = null;
      }
      setIsFabInputFocused(false);
      return;
    }
    const isFocusedInsideFabPanel = () => {
      const activeElement = document.activeElement;
      return (
        Boolean(activeElement) &&
        Boolean(panelRef.current?.contains(activeElement)) &&
        isFabTextEntryElement(activeElement)
      );
    };
    const setFocusedWithDelay = (focused: boolean) => {
      if (fabInputBlurTimeoutRef.current !== null) {
        window.clearTimeout(fabInputBlurTimeoutRef.current);
        fabInputBlurTimeoutRef.current = null;
      }
      if (focused) {
        setIsFabInputFocused(true);
        return;
      }
      fabInputBlurTimeoutRef.current = window.setTimeout(() => {
        fabInputBlurTimeoutRef.current = null;
        setIsFabInputFocused(isFocusedInsideFabPanel());
      }, 90);
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Element | null;
      setFocusedWithDelay(
        Boolean(target) &&
          Boolean(panelRef.current?.contains(target)) &&
          isFabTextEntryElement(target),
      );
    };
    const handleFocusOut = () => {
      setFocusedWithDelay(false);
    };
    setIsFabInputFocused(isFocusedInsideFabPanel());
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      if (fabInputBlurTimeoutRef.current !== null) {
        window.clearTimeout(fabInputBlurTimeoutRef.current);
        fabInputBlurTimeoutRef.current = null;
      }
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) {
      setGoalSearch("");
      setGoalFilterEnergy("");
      setGoalFilterMonumentId("");
      setGoalFilterPriority("");
      setGoalFilterSkillId("");
      setGoalSort("recent");
      setShowGoalFilters(false);
      setSkillSearch("");
      setSkillFilterMonumentId("");
      setShowSkillFilters(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const key = "__CREATOR_FAB_KEYBOARD_ACTIVE_OWNERS__";
    const win = window as typeof window & { [key: string]: Set<string> };
    win[key] ??= new Set<string>();
    const owners = win[key];
    if (shouldUseAttachedFabControls) {
      owners.add(fabKeyboardOwnerId);
    } else {
      owners.delete(fabKeyboardOwnerId);
    }
    document.body.classList.toggle("fab-keyboard-active", owners.size > 0);
    return () => {
      owners.delete(fabKeyboardOwnerId);
      document.body.classList.toggle("fab-keyboard-active", owners.size > 0);
    };
  }, [fabKeyboardOwnerId, shouldUseAttachedFabControls]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const key = "__CREATOR_FAB_PANEL_ACTIVE_OWNERS__";
    const win = window as typeof window & { [key: string]: Set<string> };
    win[key] ??= new Set<string>();
    const owners = win[key];
    if (shouldSuppressMobileFabChrome) {
      owners.add(fabPanelChromeOwnerId);
    } else {
      owners.delete(fabPanelChromeOwnerId);
    }
    document.body.classList.toggle("fab-panel-active", owners.size > 0);
    return () => {
      owners.delete(fabPanelChromeOwnerId);
      document.body.classList.toggle("fab-panel-active", owners.size > 0);
    };
  }, [fabPanelChromeOwnerId, shouldSuppressMobileFabChrome]);

  useEffect(() => {
    if (!showGoalFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !goalFilterMenuRef.current
      ) {
        return;
      }
      if (!goalFilterMenuRef.current.contains(target)) {
        setShowGoalFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showGoalFilters]);

  const [goalPickerPosition, setGoalPickerPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!isGoalPickerOpen) {
      setGoalPickerPosition(null);
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (goalPickerTriggerRef.current?.contains(target)) return;
      if (goalPickerContentRef.current?.contains(target)) return;
      setIsGoalPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [isGoalPickerOpen]);

  useEffect(() => {
    if (!isGoalPickerOpen) return;
    const updatePosition = () => {
      const trigger = goalPickerTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth || 0;
      const viewportHeight = window.innerHeight || 0;
      const gap = 4;
      const safeMargin = 12;
      const desiredWidth = Math.max(220, rect.width);
      const width = Math.min(
        desiredWidth,
        viewportWidth - safeMargin * 2,
      );
      const rawLeft = rect.left;
      const left = Math.min(
        Math.max(rawLeft, safeMargin),
        Math.max(safeMargin, viewportWidth - width - safeMargin),
      );
      const spaceBelow = viewportHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const preferAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const availableSpace = preferAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(
        400,
        Math.max(200, availableSpace - 8),
      );
      if (preferAbove) {
        setGoalPickerPosition({
          left,
          width,
          top: Math.max(safeMargin, rect.top - maxHeight - gap),
          maxHeight,
        });
      } else {
        setGoalPickerPosition({
          left,
          width,
          top: rect.bottom + gap,
          maxHeight,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [isGoalPickerOpen]);

  useEffect(() => {
    if (!showSkillFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !skillFilterMenuRef.current
      ) {
        return;
      }
      if (!skillFilterMenuRef.current.contains(target)) {
        setShowSkillFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSkillFilters]);
  useEffect(() => {
    if (!showTaskProjectFilters) return;
    const handleClick = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !taskProjectFilterMenuRef.current
      ) {
        return;
      }
      if (!taskProjectFilterMenuRef.current.contains(target)) {
        setShowTaskProjectFilters(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showTaskProjectFilters]);

  const formatDateInput = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;

  const formatTimeInput = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;

  const fetchNextScheduledInstance = useCallback(
    async (sourceId: string, sourceType: "PROJECT" | "HABIT") => {
      const params = new URLSearchParams({ sourceId, sourceType });
      const response = await fetch(
        `/api/schedule/instances/next?${params.toString()}`,
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json().catch(() => null)) as {
        instanceId: string | null;
        startUtc: string | null;
        durationMinutes?: number | null;
      } | null;
      return payload ?? null;
    },
    [],
  );

  const buildSearchUrl = useCallback(
    (cursor: FabSearchCursor | null) => {
      const trimmed = searchQuery.trim();
      const params = new URLSearchParams();
      if (trimmed.length > 0) {
        params.set("q", trimmed);
      }
      params.set("sort", overlaySortMode);
      if (cursor) {
        params.set("cursorStartUtc", cursor.startUtc);
        params.set("cursorSourceType", cursor.sourceType);
        params.set("cursorSourceId", cursor.sourceId);
      }
      return `/api/schedule/search?${params.toString()}`;
    },
    [overlaySortMode, searchQuery],
  );

  const runSearch = useCallback(
    async ({
      cursor,
      append,
      signal,
    }: {
      cursor: FabSearchCursor | null;
      append: boolean;
      signal?: AbortSignal;
    }) => {
      const response = await fetch(buildSearchUrl(cursor), { signal });
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        results?: FabSearchResult[];
        nextCursor?: {
          startUtc?: string | null;
          sourceType?: "PROJECT" | "HABIT" | null;
          sourceId?: string | null;
        } | null;
      };
      const nextCursor =
        payload.nextCursor?.startUtc &&
        payload.nextCursor?.sourceType &&
        payload.nextCursor?.sourceId
          ? {
              startUtc: payload.nextCursor.startUtc,
              sourceType: payload.nextCursor.sourceType,
              sourceId: payload.nextCursor.sourceId,
            }
          : null;
      if (!signal?.aborted) {
        setSearchResults((prev) =>
          append
            ? [...prev, ...(payload.results ?? [])]
            : (payload.results ?? []),
        );
        setSearchCursor(nextCursor);
      }
    },
    [buildSearchUrl],
  );

  // Scheduler runs should come from explicit scheduler flows, not generic object saves.
  const notifySchedulerOfChange = useCallback(async () => {
    try {
      const timeZone =
        typeof Intl !== "undefined"
          ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? null)
          : null;
      const payload = {
        localNow: new Date().toISOString(),
        timeZone,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        mode: { type: "REGULAR" },
        writeThroughDays: 1,
      };
      await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("Failed to notify scheduler", error);
    }
  }, []);

  const resetSearchState = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchCursor(null);
    setSearchError(null);
    setIsSearching(false);
    setIsLoadingMore(false);
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  const resetFabFormState = useCallback(() => {
    setProjectName("");
    setProjectStage("RESEARCH");
    setProjectDuration("");
    setProjectPriority("MEDIUM");
    setProjectEnergy("MEDIUM");
    setProjectWhy("");
    setProjectSkillIds([]);
    setProjectGoalId(null);
    setProjectDue("");
    setProjectHasExactDate(false);
    setProjectExactDate("");
    setProjectExactFallbackDate("");
    setProjectExactStartTime("");
    setProjectExactEndTime("");

    setGoalName("");
    setGoalMonumentId("");
    setGoalRelationType(null);
    setGoalRelationId("");
    setGoalCircleId("");
    setGoalPriority("MEDIUM");
    setGoalEnergy("MEDIUM");
    setGoalWhy("");
    setGoalDue(null);
    setGoalCampaignId(null);
    setIsCreatingGoalCampaignInline(false);
    setGoalInlineCampaignName("");
    setGoalInlineCampaignEmoji(FAB_DEFAULT_CAMPAIGN_EMOJI);
    setGoalCampaignCreateError(null);
    setGoalCampaignCreating(false);

    setTaskName("");
    setTaskStage("PREPARE");
    setTaskDuration("");
    setTaskPriority("MEDIUM");
    setTaskEnergy("MEDIUM");
    setTaskProjectId("");
    setTaskSkillId("");
    setTaskNotes("");
    setTaskDue("");
    setTaskHasExactDate(false);
    setTaskExactDate("");
    setTaskExactFallbackDate("");
    setTaskExactStartTime("");
    setTaskExactEndTime("");

    setHabitName("");
    setHabitType(defaultHabitType);
    setHabitRecurrence(defaultHabitRecurrence);
    setMemoCaptureActions({
      note: true,
      form: false,
      photo: false,
    });
    setMemoNoteDestinationType("skill");
    setMemoNoteSkillId(habitSkillId || "");
    setMemoNoteMonumentId("");
    setMemoFormSearch("");
    setSelectedMemoDatabaseTargetId(null);
    setHabitDuration("15");
    setHabitEnergy("LOW");
    setHabitGoalId("");
    setHabitSkillId("");
    setHabitWhy("");
    setHabitLocationContextId("");
    setHabitDaylightPreference("ALL_DAY");
    setHabitWindowEdgePreference("FRONT");
    setHabitNextDueOverride("");
    setHabitFixedStartTime("");
    setHabitFixedEndTime("");
    setHabitRoutineId("");
    setHabitCircleId("");
    setIsCreatingHabitRoutineInline(false);
    setHabitInlineRoutineName("");
    setHabitInlineRoutineEmoji(FAB_DEFAULT_ROUTINE_EMOJI);
    setHabitRoutineCreateError(null);
    setHabitInlineRoutineDescription("");

    setSelectedTagIds([]);
    setTagInputValue("");
    setSaveError(null);
    resetNestedDraftState();
  }, [
    defaultHabitRecurrence,
    defaultHabitType,
    habitSkillId,
    resetNestedDraftState,
  ]);

  type MenuPalette = {
    base: [number, number, number];
    highlight: [number, number, number];
    lowlight: [number, number, number];
    border?: [number, number, number];
  };

  const MENU_PALETTES: readonly MenuPalette[] = [
    {
      base: [55, 65, 81],
      highlight: [90, 110, 135],
      lowlight: [25, 30, 40],
    },
    {
      base: [8, 17, 28],
      highlight: [50, 80, 120],
      lowlight: [2, 4, 10],
    },
    {
      base: [10, 12, 24],
      highlight: [86, 60, 140],
      lowlight: [4, 6, 18],
      border: [39, 39, 42],
    },
  ];

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const getMenuPalette = (pageIndex: number): MenuPalette =>
    MENU_PALETTES[pageIndex];

  const lerp = (start: number, end: number, t: number) =>
    start + (end - start) * t;

  const createPaletteBackground = (palette: MenuPalette) => {
    const [r, g, b] = palette.base;
    const [hr, hg, hb] = palette.highlight;
    const [lr, lg, lb] = palette.lowlight;
    return `radial-gradient(circle at top, rgba(${hr}, ${hg}, ${hb}, 0.65), rgba(${r}, ${g}, ${b}, 0.15) 45%), linear-gradient(160deg, rgba(${hr}, ${hg}, ${hb}, 0.95) 0%, rgba(${r}, ${g}, ${b}, 0.97) 50%, rgba(${lr}, ${lg}, ${lb}, 0.98) 100%)`;
  };

  const createPaletteBorderColor = (palette: MenuPalette) => {
    const border = palette.border ?? palette.highlight;
    const alpha = palette.border ? 0.45 : 0.35;
    return `rgba(${border[0]}, ${border[1]}, ${border[2]}, ${alpha})`;
  };

  const MENU_BOX_SHADOW =
    "0 18px 36px rgba(15, 23, 42, 0.55), 0 8px 18px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)";

  const menuConfigs = {
    default: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "SERVICE" },
        { label: "PRODUCT" },
        { label: "POST" },
        { label: "NOTE" },
      ],
      menuClassName: "left-1/2 -translate-x-1/2",
      itemAlignmentClass: "text-left",
    },
    timeline: {
      primary: [
        {
          label: "GOAL",
          eventType: "GOAL" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "PROJECT",
          eventType: "PROJECT" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "TASK",
          eventType: "TASK" as const,
          color: "hover:bg-gray-600",
        },
        {
          label: "HABIT",
          eventType: "HABIT" as const,
          color: "hover:bg-gray-600",
        },
      ],
      secondary: [
        { label: "NOTE" },
        { label: "POST" },
        { label: "SERVICE" },
        { label: "PRODUCT" },
      ],
      menuClassName: "right-0 origin-bottom-right text-left",
      itemAlignmentClass: "text-left",
    },
  } as const;

  const { primary, secondary, menuClassName, itemAlignmentClass } =
    menuConfigs[menuVariant];
  const menuContainerHeight = primary.length * 56;
  const shouldRenderTimelineOverlayButton =
    !expanded && isOpen && menuVariant === "timeline";
  const getOverlayPlacementDurationMinutes = useCallback(
    (result: FabSearchResult | null) =>
      Math.max(
        1,
        Math.min(
          overlayWindowMinutes,
          result?.durationMinutes ?? OVERLAY_PLACEMENT_DEFAULT_DURATION_MINUTES,
        ),
      ),
    [overlayWindowMinutes],
  );
  const overlayPlacementDurationMinutes = getOverlayPlacementDurationMinutes(
    overlayPickerSelected,
  );
  const handleAddFromNexusClick = () => {
    setOverlayPickerOpen(true);
    setOverlayPickerSelected(null);
    setSearchError(null);
  };

  const handleOverlayPickerResult = (result: FabSearchResult) => {
    const durationMinutes = getOverlayPlacementDurationMinutes(result);
    setOverlayPlacedItems((previous) => {
      const sequentialStartMinutes = getNextSequentialStartMinutes(
        previous,
        overlayStartTime,
        overlayWindowMinutes,
        durationMinutes,
      );
      const placementStart = overlayMinutesToDate(
        sequentialStartMinutes,
        overlayStartTime,
      );
      const placementEnd = overlayMinutesToDate(
        sequentialStartMinutes + durationMinutes,
        overlayStartTime,
      );
      return normalizeOverlayPlacements(
        [
          ...previous,
          {
            id: createOverlayPlacementId(),
            type: result.type,
            name: result.name,
            start: placementStart,
            end: placementEnd,
            locked: true,
            habitType: result.habitType ?? null,
            goalName: result.goalName ?? null,
            energy: result.energy ?? null,
            sourceId: result.id,
          },
        ],
        overlayStartTime,
        overlayEndTime,
      );
    });
    setOverlayPickerSelected(null);
    setOverlayPickerOpen(false);
  };

  const handleOverlayPickerClose = () => {
    setOverlayPickerOpen(false);
  };

  const handlePlacementCancel = () => {
    setOverlayPickerSelected(null);
  };

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayPickerSelected || overlayDurationMinutes <= 0) return;
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickRatio = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );
    const rawMinutes = clickRatio * overlayDurationMinutes;
    const snappedMinutes = snapMinutesToFive(rawMinutes);
    const placementDurationMinutes = overlayPlacementDurationMinutes;
    const clampedMinutes = clampOverlayPlacementStart(
      snappedMinutes,
      placementDurationMinutes,
      overlayWindowMinutes,
    );
    const placementStart = overlayMinutesToDate(
      clampedMinutes,
      overlayStartTime,
    );
    const placementEnd = overlayMinutesToDate(
      clampedMinutes + placementDurationMinutes,
      overlayStartTime,
    );
    setOverlayPlacedItems((previous) =>
      normalizeOverlayPlacements(
        [
          ...previous,
          {
            id: `${overlayPickerSelected.id}-${placementStart.getTime()}`,
            type: overlayPickerSelected.type,
            name: overlayPickerSelected.name,
            start: placementStart,
            end: placementEnd,
            locked: true,
            habitType: overlayPickerSelected.habitType ?? null,
            sourceId: overlayPickerSelected.id,
          },
        ],
        overlayStartTime,
        overlayEndTime,
      ),
    );
    setOverlayPickerSelected(null);
  };
  const handleLiveOverlaySave = useCallback(async () => {
    if (isSavingLiveOverlay) return;
    if (overlayEndTime.getTime() <= overlayStartTime.getTime()) {
      setOverlaySaveError("Overlay end time must be after the start time.");
      return;
    }
    setOverlaySaveError(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setOverlaySaveError("Unable to reach Supabase.");
      return;
    }
    setIsSavingLiveOverlay(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You must be signed in to save overlays.");
      const scheduleDate = `${overlayStartTime.getFullYear()}-${String(
        overlayStartTime.getMonth() + 1,
      ).padStart(
        2,
        "0",
      )}-${String(overlayStartTime.getDate()).padStart(2, "0")}`;
      const { data: overlayRow, error: overlayError } = await supabase
        .from("overlay_windows")
        .insert({
          user_id: user.id,
          schedule_date: scheduleDate,
          start_utc: overlayStartTime.toISOString(),
          end_utc: overlayEndTime.toISOString(),
          label: null,
        })
        .select("id")
        .single();
      if (overlayError) throw overlayError;
      const overlayWindowId = overlayRow?.id;
      if (!overlayWindowId) throw new Error("Overlay window id missing.");
      if (overlayPlacedItems.length > 0) {
        const savedItems: {
          placement: OverlayPlacement;
          scheduleInstanceId: string;
        }[] = [];
        for (const placement of overlayPlacedItems) {
          const startUTC = placement.start.toISOString();
          const endUTC = placement.end.toISOString();
          const durationMin = Math.max(
            1,
            Math.round(
              (placement.end.getTime() - placement.start.getTime()) / 60000,
            ),
          );
          const { data: scheduleRow, error: scheduleError } = await supabase
            .from("schedule_instances")
            .insert({
              user_id: user.id,
              source_type: placement.type,
              source_id: placement.sourceId,
              start_utc: startUTC,
              end_utc: endUTC,
              duration_min: durationMin,
              status: "scheduled",
              locked: true,
              event_name: placement.name,
              overlay_window_id: overlayWindowId,
              weight_snapshot: 0,
              energy_resolved: placement.energy ?? "NO",
            })
            .select("id")
            .single();
          if (scheduleError) throw scheduleError;
          const scheduleInstanceId = scheduleRow?.id;
          if (!scheduleInstanceId) {
            throw new Error("Schedule instance id missing.");
          }
          savedItems.push({ placement, scheduleInstanceId });
        }
        const { error: itemsError } = await supabase
          .from("overlay_window_items")
          .insert(
            savedItems.map(({ placement, scheduleInstanceId }) => ({
              overlay_window_id: overlayWindowId,
              user_id: user.id,
              source_type: placement.type,
              source_id: placement.sourceId,
              start_utc: placement.start.toISOString(),
              end_utc: placement.end.toISOString(),
              locked: true,
              event_name: placement.name,
              schedule_instance_id: scheduleInstanceId,
            })),
          );
        if (itemsError) throw itemsError;
      }
      resetOverlayDraft();
      setOverlayOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("schedule:overlay-windows-updated"),
        );
      }
    } catch (error) {
      const supabaseErrorMessage = (() => {
        if (error && typeof error === "object") {
          const payload = error as Record<string, unknown>;
          const parts: string[] = [];
          const add = (value: unknown) => {
            if (typeof value === "string" && value.trim().length > 0) {
              parts.push(value.trim());
            }
          };
          add(payload.message);
          add(payload.details);
          add(payload.hint);
          if (parts.length > 0) {
            return parts.join(" ");
          }
        }
        return null;
      })();
      const message =
        supabaseErrorMessage ??
        (error instanceof Error ? error.message : null) ??
        "Unable to save overlay.";
      console.error("Failed to save overlay window", message, error);
      setOverlaySaveError(message);
    } finally {
      setIsSavingLiveOverlay(false);
    }
  }, [
    isSavingLiveOverlay,
    overlayEndTime,
    overlayPlacedItems,
    overlayStartTime,
    resetOverlayDraft,
  ]);
  const handleOverlayDragStart = useCallback(
    (placement: OverlayPlacement, event: PointerEvent, info: PanInfo) => {
      setActiveOverlayDragId(placement.id);
      setOverlayRemovalCandidateId(null);
      setOverlayDragModeWithRef("reorder");
      const startMinutes = overlayDateToMinutes(
        placement.start,
        overlayStartTime,
      );
      const durationMinutes = Math.max(
        1,
        overlayDateToMinutes(placement.end, placement.start),
      );
      const clampedStartMinutes = clampOverlayPlacementStart(
        startMinutes,
        durationMinutes,
        overlayWindowMinutes,
      );
      overlayDragMetaRef.current = {
        baseStartMinutes: clampedStartMinutes,
        durationMinutes,
      };
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: { x: info.point.x, y: info.point.y },
        lastSnappedMinutes: clampedStartMinutes,
      };
      setOverlayDragCandidate({
        placementId: placement.id,
        startMinutes: clampedStartMinutes,
        durationMinutes,
        baseStartMinutes: clampedStartMinutes,
      });
    },
    [
      overlayStartTime,
      overlayWindowMinutes,
      overlayTimelinePxPerMin,
      setOverlayDragModeWithRef,
    ],
  );

  const handleOverlayDragEnd = useCallback(
    (placement: OverlayPlacement, info: PanInfo) => {
      const intent = overlayDragIntentRef.current;
      const currentMode = overlayDragModeRef.current;
      const candidate = overlayDragCandidate;
      const meta = overlayDragMetaRef.current;
      const overTrashZone = isPointerOverTrashZone(info.point);
      const previewResolvedLayout = lastResolvedOverlayLayoutRef.current;

      setActiveOverlayDragId(null);
      setOverlayRemovalCandidateId(null);
      setOverlayDragCandidate(null);
      setOverlayDragModeWithRef(null);
      overlayDragIntentRef.current = {
        axis: null,
        startPoint: null,
        lastSnappedMinutes: null,
      };
      overlayDragMetaRef.current = null;

      if (currentMode === "remove" && overTrashZone) {
        setOverlayPlacedItems((previous) =>
          removeOverlayPlacement(
            previous,
            placement.id,
            overlayStartTime,
            overlayEndTime,
          ),
        );
        setOverlayRemovalCandidateId(null);
        return;
      }

      const durationMinutes =
        meta?.durationMinutes ??
        Math.max(
          1,
          (placement.end.getTime() - placement.start.getTime()) / 60000,
        );
      const desiredStartMinutes =
        candidate?.startMinutes ??
        overlayDateToMinutes(placement.start, overlayStartTime);
      const clampedMinutes = clampOverlayPlacementStart(
        desiredStartMinutes,
        durationMinutes,
        overlayWindowMinutes,
      );
      const direction: OverlayLayoutDirection =
        clampedMinutes > (meta?.baseStartMinutes ?? desiredStartMinutes)
          ? "forward"
          : clampedMinutes < (meta?.baseStartMinutes ?? desiredStartMinutes)
            ? "backward"
            : "none";
      setOverlayPlacedItems((previous) => {
        const resolved =
          previewResolvedLayout ??
          resolveOverlayPlacementLayout({
            placements: previous,
            overlayStartTime,
            overlayWindowMinutes,
            movingPlacementId: placement.id,
            durationMinutes,
            targetStartMinutes: clampedMinutes,
            rawTargetStartMinutes:
              overlayDragCandidate?.startMinutes ?? desiredStartMinutes,
            direction,
          });
        return resolved;
      });
    },
    [
      overlayEndTime,
      overlayStartTime,
      overlayWindowMinutes,
      setOverlayDragModeWithRef,
      overlayDragCandidate,
      isPointerOverTrashZone,
    ],
  );
  const parseTimeValue = (value: string) => {
    const [hoursStr, minutesStr] = value.split(":");
    if (hoursStr === undefined || minutesStr === undefined) {
      return null;
    }
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return { hours, minutes };
  };
  const handleStartTimeInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setOverlayStartInputValue(event.target.value);
    const parsed = parseTimeValue(event.target.value);
    if (!parsed) return;
    const { hours, minutes } = parsed;
    const nextStart = new Date(overlayStartTime);
    nextStart.setHours(hours, minutes, 0, 0);
    const currentDurationMs = Math.max(
      MIN_OVERLAY_DURATION_MS,
      overlayEndTime.getTime() - overlayStartTime.getTime(),
    );
    const clampedDurationMs = Math.min(
      MAX_OVERLAY_DURATION_MS,
      currentDurationMs,
    );
    setOverlayStartTime(nextStart);
    setOverlayEndTime(new Date(nextStart.getTime() + clampedDurationMs));
  };
  const handleEndTimeInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setOverlayEndInputValue(event.target.value);
    const parsed = parseTimeValue(event.target.value);
    if (!parsed) return;
    const { hours, minutes } = parsed;
    const nextEnd = new Date(overlayStartTime);
    nextEnd.setHours(hours, minutes, 0, 0);
    if (nextEnd.getTime() <= overlayStartTime.getTime()) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
    const desiredDurationMs = nextEnd.getTime() - overlayStartTime.getTime();
    const clampedDurationMs = Math.min(
      MAX_OVERLAY_DURATION_MS,
      Math.max(MIN_OVERLAY_DURATION_MS, desiredDurationMs),
    );
    setOverlayEndTime(new Date(overlayStartTime.getTime() + clampedDurationMs));
  };

  const menuVariants = {
    closed: {
      opacity: 0,
      clipPath: "inset(100% 0% 0% 0%)",
      transition: { type: "tween", ease: "easeInOut", duration: 0.2 },
    },
    open: {
      opacity: 1,
      clipPath: "inset(0% 0% 0% 0%)",
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.25,
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } as const;

  const itemVariants = {
    closed: {
      opacity: 0,
      y: 10,
      transition: { type: "tween", ease: "easeIn", duration: 0.15 },
    },
    open: {
      opacity: 1,
      y: 0,
      transition: { type: "tween", ease: "easeOut", duration: 0.15 },
    },
  } as const;

  const pageVariants = {
    closed: {},
    open: {},
  } as const;

  const normalizedStageWidth = Math.max(stageWidth, 1);
  const dragProgress = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const ratio = Math.abs(latest) / (width || 1);
    return clamp01(ratio);
  });
  const incomingFromRight = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(-width, Math.min(0, latest));
    return width + clamped;
  });
  const incomingFromLeft = useTransform(pageX, (latest) => {
    const width = normalizedStageWidth;
    const clamped = Math.max(0, Math.min(width, latest));
    return -width + clamped;
  });

  const toggleSelectedTagId = useCallback((tagId: string) => {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((value) => value !== tagId)
        : [...current, tagId],
    );
  }, []);

  const handleCreateOrSelectTag = useCallback(async () => {
    const normalizedName = normalizeTagName(tagInputValue);
    if (!normalizedName || isCreatingTag) return;

    const existingTag = tagsByNormalizedName.get(normalizedName);
    if (existingTag) {
      setSelectedTagIds((current) =>
        current.includes(existingTag.id) ? current : [...current, existingTag.id],
      );
      setTagInputValue("");
      return;
    }

    const displayName = sanitizeTagDisplayName(tagInputValue);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      toast.error("Unable to add tag", "Supabase client not available.");
      return;
    }

    setIsCreatingTag(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        throw new Error("You need to be signed in to add tags.");
      }

      let resolvedTag: FabTag | null = null;
      const tagTableClient = supabase as unknown as FabTagTableClient;
      const { data, error } = await tagTableClient
        .from("tags")
        .insert({
          user_id: user.id,
          name: displayName,
          normalized_name: normalizedName,
        })
        .select("id, user_id, name, normalized_name, color")
        .single();

      if (error) {
        const { data: existingData, error: existingError } =
          await tagTableClient
            .from("tags")
            .select("id, user_id, name, normalized_name, color")
            .eq("user_id", user.id)
            .eq("normalized_name", normalizedName)
            .maybeSingle();
        if (existingError) throw existingError;
        if (!existingData) throw error;
        resolvedTag = existingData as FabTag;
      } else {
        resolvedTag = data as FabTag;
      }

      if (!resolvedTag?.id) {
        throw new Error("Tag could not be created.");
      }

      setAvailableTags((current) => {
        const next = current.some((tag) => tag.id === resolvedTag?.id)
          ? current
          : [...current, resolvedTag as FabTag];
        return [...next].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedTagIds((current) =>
        current.includes(resolvedTag.id) ? current : [...current, resolvedTag.id],
      );
      setTagInputValue("");
    } catch (error) {
      console.error("Failed to create tag", error);
      toast.error("Unable to add tag", "Try again in a moment.");
    } finally {
      setIsCreatingTag(false);
    }
  }, [isCreatingTag, tagInputValue, tagsByNormalizedName, toast]);

  const attachSelectedTagsToEntity = useCallback(
    async ({
      supabase,
      userId,
      entityType,
      entityId,
      tagIds,
    }: {
      supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
      userId: string;
      entityType: TagEntityType;
      entityId: string;
      tagIds: string[];
    }) => {
      if (!entityId || tagIds.length === 0) return;
      const { error } = await supabase.from("event_tags").insert(
        tagIds.map((tagId) => ({
          user_id: userId,
          tag_id: tagId,
          entity_type: entityType,
          entity_id: entityId,
        })),
      );
      if (error) throw error;
    },
    [],
  );

  const replaceSelectedTagsForEntity = useCallback(
    async ({
      supabase,
      userId,
      entityType,
      entityId,
      tagIds,
    }: {
      supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
      userId: string;
      entityType: TagEntityType;
      entityId: string;
      tagIds: string[];
    }) => {
      if (!entityId) return;
      const { error: deleteError } = await supabase
        .from("event_tags")
        .delete()
        .eq("user_id", userId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      if (deleteError) throw deleteError;
      if (tagIds.length === 0) return;
      await attachSelectedTagsToEntity({
        supabase,
        userId,
        entityType,
        entityId,
        tagIds,
      });
    },
    [attachSelectedTagsToEntity],
  );

  const renderTagPickerPanel = ({
    label,
    footer,
    density = "default",
    fillExpanded = true,
  }: {
    label: string;
    footer?: React.ReactNode;
    density?: "default" | "compact";
    fillExpanded?: boolean;
  }) => (
    <div
      className={cn(
        "grid rounded-2xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5",
        density === "compact" ? "gap-3 px-4 py-3.5" : "gap-4 px-4 py-4",
        expanded &&
          fillExpanded &&
          "min-h-full grid-rows-[auto_minmax(0,1fr)] content-start",
      )}
      style={fillExpanded ? secondaryCreationPanelStyle : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold leading-none text-white">
          {label}
        </h3>
        {selectedTagIds.length > 0 ? (
          <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white/70">
            {selectedTagIds.length} selected
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "grid min-h-0 content-start",
          density === "compact" ? "gap-2.5" : "gap-3",
          density === "compact"
            ? footer
              ? "grid-rows-[auto_auto_auto]"
              : "grid-rows-[auto_auto]"
            : footer
              ? "grid-rows-[minmax(0,1fr)_auto_auto]"
              : "grid-rows-[minmax(0,1fr)_auto]",
        )}
      >
        <div
          className={cn(
            "min-h-0",
            density === "compact" && "self-start",
            density === "compact"
              ? "max-h-[168px] overflow-y-auto overscroll-contain pr-1"
              : availableTags.length > 10
                ? "overflow-y-auto overscroll-contain pr-1"
                : null,
          )}
        >
          {tagsLoading ? (
            <div
              className={cn(
                "grid place-items-center",
                density === "compact" ? "min-h-[88px]" : "min-h-[140px]",
              )}
            >
              <p className="text-sm text-white/55">Loading tags…</p>
            </div>
          ) : availableTags.length > 0 ? (
            <div
              className={cn(
                "flex flex-wrap content-start",
                density === "compact" ? "gap-2" : "gap-2.5",
              )}
            >
              {availableTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleSelectedTagId(tag.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border transition-colors",
                      density === "compact"
                        ? "min-h-8 px-3 py-1 text-[13px]"
                        : "min-h-10 px-3.5 py-1.5 text-sm",
                      isSelected
                        ? "border-white/35 bg-white/16 text-white"
                        : "border-white/10 bg-black/25 text-white/72 hover:border-white/20 hover:text-white",
                    )}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-white/40"
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                    />
                    <span className="truncate">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={cn("flex items-center gap-2", density === "compact" && "self-start")}>
          <Input
            value={tagInputValue}
            onChange={(event) => setTagInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreateOrSelectTag();
              }
            }}
            placeholder="New tag"
            className={cn(
              "border-white/10 bg-black/30 text-white placeholder:text-white/35",
              density === "compact" ? "h-9 px-3 text-[13px]" : "h-10 px-3.5 text-sm",
            )}
          />
          <button
            type="button"
            onClick={() => void handleCreateOrSelectTag()}
            disabled={!normalizeTagName(tagInputValue) || isCreatingTag}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/10 font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-45",
              density === "compact" ? "h-9 px-3.5 text-[13px]" : "h-10 px-4 text-sm",
            )}
          >
            {isCreatingTag ? "Adding…" : "Add"}
          </button>
        </div>

        {footer ? (
          <div
            className={cn(
              "grid rounded-xl border border-white/8 bg-black/20",
              density === "compact" ? "gap-2.5 px-3 py-2.5" : "gap-3 px-3.5 py-3",
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderFlatAdvancedPanel = ({
    dueDateId,
    dueDateValue,
    onDueDateChange,
    hasExactDate,
    onHasExactDateChange,
    exactDateId,
    exactDateValue,
    onExactDateChange,
    exactStartTimeId,
    exactStartTimeValue,
    onExactStartTimeChange,
    exactEndTimeId,
    exactEndTimeValue,
    onExactEndTimeChange,
    tagLabel,
  }: {
    dueDateId: string;
    dueDateValue: string;
    onDueDateChange: (value: string) => void;
    hasExactDate: boolean;
    onHasExactDateChange: (value: boolean) => void;
    exactDateId: string;
    exactDateValue: string;
    onExactDateChange: (value: string) => void;
    exactStartTimeId: string;
    exactStartTimeValue: string;
    onExactStartTimeChange: (value: string) => void;
    exactEndTimeId: string;
    exactEndTimeValue: string;
    onExactEndTimeChange: (value: string) => void;
    tagLabel: string;
  }) => {
    const toggleExactDate = () => {
      const nextValue = !hasExactDate;
      onHasExactDateChange(nextValue);
      if (!nextValue) {
        onExactDateChange("");
      }
    };

    return (
      <div
        className={cn("grid gap-3 content-start", expanded && "min-h-full")}
        style={secondaryCreationPanelStyle}
      >
        {renderTagPickerPanel({
          label: tagLabel,
          density: "compact",
          fillExpanded: false,
        })}

        <section className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5">
          <p className={FAB_ADVANCED_LABEL_CLASS}>Exact schedule</p>
          <button
            type="button"
            role="switch"
            aria-checked={hasExactDate}
            aria-label="Use exact date"
            onClick={toggleExactDate}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-left text-xs text-white transition-colors hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <span>Use exact date</span>
            <span
              aria-hidden="true"
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/10 transition-colors",
                hasExactDate
                  ? "border-white/25 bg-white/70"
                  : "bg-white/10",
              )}
            >
              <span
                className={cn(
                  "inline-block h-[18px] w-[18px] rounded-full shadow transition-transform",
                  hasExactDate
                    ? "translate-x-[21px] bg-neutral-950"
                    : "translate-x-1 bg-white",
                )}
              />
            </span>
          </button>
          {hasExactDate ? (
            <div className="grid gap-1.5">
              <Label htmlFor={exactDateId} className={FAB_ADVANCED_LABEL_CLASS}>
                Date
              </Label>
              <Input
                id={exactDateId}
                type="date"
                value={exactDateValue}
                onChange={(event) => onExactDateChange(event.target.value)}
                className={FAB_ADVANCED_INPUT_CLASS}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label
                htmlFor={exactStartTimeId}
                className={FAB_ADVANCED_LABEL_CLASS}
              >
                Start time
              </Label>
              <Input
                id={exactStartTimeId}
                type="time"
                value={exactStartTimeValue}
                onChange={(event) =>
                  onExactStartTimeChange(event.target.value)
                }
                className={FAB_ADVANCED_INPUT_CLASS}
              />
            </div>
            <div className="grid gap-1.5">
              <Label
                htmlFor={exactEndTimeId}
                className={FAB_ADVANCED_LABEL_CLASS}
              >
                End time
              </Label>
              <Input
                id={exactEndTimeId}
                type="time"
                value={exactEndTimeValue}
                onChange={(event) => onExactEndTimeChange(event.target.value)}
                className={FAB_ADVANCED_INPUT_CLASS}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5">
          <div className="grid gap-1">
            <Label htmlFor={dueDateId} className={FAB_ADVANCED_LABEL_CLASS}>
              Due date
            </Label>
            <p className="text-[10px] leading-snug text-white/45">
              A deadline for priority, separate from exact schedule.
            </p>
          </div>
          <Input
            id={dueDateId}
            type="date"
            value={dueDateValue}
            onChange={(event) => onDueDateChange(event.target.value)}
            className={FAB_ADVANCED_INPUT_CLASS}
          />
        </section>
      </div>
    );
  };

  const associatedEditCardStyle: React.CSSProperties = {
    boxShadow:
      "0 20px 42px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.07)",
    outline: "1px solid rgba(0, 0, 0, 0.9)",
    outlineOffset: "-1px",
    background:
      "radial-gradient(circle at 0% 0%, rgba(92, 98, 112, 0.18), transparent 56%), linear-gradient(140deg, rgba(4, 5, 8, 0.98) 0%, rgba(12, 13, 18, 0.97) 48%, rgba(29, 31, 39, 0.86) 100%)",
  };
  const associatedEditBlankStyle: React.CSSProperties = {
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    outline: "1px solid rgba(0, 0, 0, 0.82)",
    outlineOffset: "-1px",
    background:
      "radial-gradient(circle at 0% 0%, rgba(92, 98, 112, 0.1), transparent 56%), linear-gradient(140deg, rgba(3, 4, 7, 0.78) 0%, rgba(9, 10, 14, 0.72) 48%, rgba(22, 24, 31, 0.44) 100%)",
  };
  const associatedEditCardClass =
    "relative flex h-full min-h-0 w-full items-center gap-3 overflow-hidden rounded-[var(--schedule-instance-radius,1.25rem)] border border-black/80 px-3 text-left text-white backdrop-blur-sm transition-[background,box-shadow,border-color,transform] duration-200 hover:border-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";
  const associatedEditBlankClass =
    "relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-[var(--schedule-instance-radius,1.25rem)] border border-black/75 px-3 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-white/28 backdrop-blur-sm";
  const renderAssociatedSkillBadge = (
    visualValue: string | null | undefined,
    label: string,
  ) => {
    const visual = visualValue?.trim() || label;
    const isCompactVisual = visual.length <= 3;
    return (
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[calc(var(--schedule-instance-radius,1.25rem)-0.55rem)] border border-white/10 bg-black/45 px-1.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        title={label}
        aria-hidden="true"
      >
        <span
          className={cn(
            "block max-w-full truncate leading-none text-white/74",
            isCompactVisual
              ? "text-lg"
              : "text-[8px] font-extrabold uppercase tracking-[0.08em]",
          )}
        >
          {visual}
        </span>
      </span>
    );
  };
  const renderAssociatedEnergyFlame = (energy?: string | null) => (
    <span className="flex h-10 w-8 shrink-0 items-center justify-center">
      <FlameEmber
        level={normalizeFlameLevel(energy)}
        size="sm"
        className="pointer-events-none drop-shadow-[0_0_8px_rgba(0,0,0,0.55)]"
      />
    </span>
  );

  const renderGoalProjectsPanel = () => {
    const isEditingGoal = Boolean(
      editTarget?.entityType === "GOAL" && editTarget.entityId,
    );
    const visibleEditProjects = isEditingGoal ? editGoalProjects : null;
    const visibleProjectCount = visibleEditProjects
      ? visibleEditProjects.length
      : goalDraftProjects.length;
    const goalProjectListShouldScroll = visibleProjectCount > 3;
    const goalProjectCardClass = goalProjectListShouldScroll
      ? "min-h-[72px]"
      : "h-full min-h-0";
    const projectItems = visibleEditProjects
      ? (() => {
          const editCards =
            visibleEditProjects.length > 0
              ? visibleEditProjects.map((project) => {
                  const linkedSkills = project.skillIds
                    .map((skillId) => findSkillById(skillId))
                    .filter(
                      (value): value is Skill =>
                        value !== null && typeof value.name === "string",
                    );
                  const skillNames = linkedSkills
                    .map((skill) => skill.name ?? null)
                    .filter(
                      (value): value is string =>
                        typeof value === "string" && value.trim().length > 0,
                    );
                  const skillLabel =
                    skillNames.length > 0
                      ? skillNames.join(", ")
                      : project.skillIds.length > 0
                        ? "Linked skill"
                        : "No skill";
                  const skillVisual =
                    linkedSkills.find(
                      (skill) =>
                        typeof skill.icon === "string" &&
                        skill.icon.trim().length > 0,
                    )?.icon ?? skillLabel;
                  const metaItems = [
                    project.stage,
                    formatFabPriorityLabel(project.priority),
                    project.durationMin ? `${project.durationMin}m` : null,
                    project.dueDate,
                  ].filter(
                    (value): value is string =>
                      typeof value === "string" && value.trim().length > 0,
                  );
                  return (
                    <div
                      key={project.id}
                      className={cn(
                        associatedEditCardClass,
                        goalProjectCardClass,
                      )}
                      style={associatedEditCardStyle}
                    >
                      {renderAssociatedSkillBadge(skillVisual, skillLabel)}
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate text-xs font-extrabold uppercase tracking-[0.08em] text-white">
                          {project.name}
                        </span>
                        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                          {metaItems.join(" / ")}
                        </span>
                        <span className="truncate text-[10px] text-white/62">
                          {skillLabel}
                        </span>
                      </span>
                      {renderAssociatedEnergyFlame(project.energy)}
                    </div>
                  );
                })
              : [
                  <div
                    key="goal-project-empty-edit"
                    className={associatedEditBlankClass}
                    style={associatedEditBlankStyle}
                  >
                    No projects linked yet.
                  </div>,
                ];
          const blankCount = goalProjectListShouldScroll
            ? 0
            : Math.max(0, 3 - editCards.length);
          return [
            ...editCards,
            ...Array.from({ length: blankCount }, (_, index) => (
              <div
                key={`goal-project-edit-blank-${index}`}
                aria-hidden="true"
                className={associatedEditBlankClass}
                style={associatedEditBlankStyle}
              />
            )),
          ];
        })()
      : goalDraftProjects.length > 0
        ? goalDraftProjects.map((project) => {
            const skillLabel =
              project.skillIds
                .map((skillId) => findSkillById(skillId)?.name ?? null)
                .filter(
                  (value): value is string =>
                    typeof value === "string" && value.trim().length > 0,
                )
                .join(", ") || "No skill";
            return (
              <div
                key={project.tempId}
                className={cn(
                  "relative grid gap-1.5 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm",
                  goalProjectCardClass,
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setGoalDraftProjects((current) =>
                      current.filter((item) => item.tempId !== project.tempId),
                    )
                  }
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/65 transition hover:border-white/20 hover:text-white"
                  aria-label="Remove draft project"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="pr-6 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                  {project.name}
                </div>
                <div className="flex flex-wrap gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  <span>{project.stage}</span>
                  <span>{formatFabPriorityLabel(project.priority)}</span>
                  <span>{project.energy}</span>
                  {project.durationMin ? (
                    <span>{project.durationMin}m</span>
                  ) : null}
                </div>
                <div className="truncate text-[10px] text-white/58">
                  {skillLabel}
                </div>
              </div>
            );
          })
        : Array.from({ length: 3 }, (_, index) => (
            <button
              key={`goal-project-empty-${index}`}
              type="button"
              onClick={() => {
                resetNestedProjectDraftForm();
                setNestedDraftPanel("goal-project");
              }}
              className={cn(
                "flex items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm transition hover:border-white/18 hover:bg-white/[0.08]",
                goalProjectCardClass,
              )}
              aria-label="Add draft project"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/78">
                <Plus className="h-4 w-4" />
              </span>
            </button>
          ));

    if (nestedDraftPanel === "goal-project" && !isEditingGoal) {
      return (
        <div
          className={cn(
            "grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5",
            expanded && "min-h-full content-start",
          )}
          style={secondaryCreationPanelStyle}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                resetNestedProjectDraftForm();
                setNestedDraftPanel(null);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <span>Back</span>
            </button>
            <h3 className="truncate text-sm font-semibold leading-none text-white">
              Add Project
            </h3>
            <button
              type="button"
              onClick={handleAddGoalDraftProject}
              disabled={!isDraftProjectReady}
              className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              Done
            </button>
          </div>
          <div className="grid gap-3 md:gap-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="nested-project-name" className="sr-only">
                  Project name
                </Label>
                <Input
                  id="nested-project-name"
                  value={draftProjectName}
                  onChange={(e) =>
                    setDraftProjectName(e.target.value.toUpperCase())
                  }
                  placeholder="Name your PROJECT"
                  className="h-12 rounded-md !border-white/10 bg-white/[0.05] text-lg font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0 md:h-14 md:text-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label className="sr-only">Energy</Label>
                <EnergyCycleButton
                  value={draftProjectEnergy}
                  onChange={setDraftProjectEnergy}
                  ariaLabel="Draft project energy"
                  className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="grid min-w-0 gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  PRIORITY
                </Label>
                <Select
                  value={draftProjectPriority}
                  onValueChange={setDraftProjectPriority}
                  triggerClassName={cn(
                    "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                    FAB_CREATION_SELECT_TRIGGER_CLASS,
                  )}
                  contentWrapperClassName={cn(
                    FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                    "min-w-[240px] sm:min-w-[280px]",
                  )}
                  placeholder="Priority"
                >
                  <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                    {PRIORITY_OPTIONS_LOCAL.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        label={o.label}
                        className={fabCreationSelectItemClass(
                          draftProjectPriority === o.value,
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <span>{o.label}</span>
                          <span className="w-10 text-right text-red-400">
                            {PRIORITY_ICON_MAP[o.value] ?? ""}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  STAGE
                </Label>
                <Select
                  value={draftProjectStage}
                  onValueChange={setDraftProjectStage}
                  triggerClassName={cn(
                    "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                    FAB_CREATION_SELECT_TRIGGER_CLASS,
                  )}
                  contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                  placeholder="Stage"
                >
                  <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                    {PROJECT_STAGE_OPTIONS_LOCAL.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className={fabCreationSelectItemClass(
                          draftProjectStage === o.value,
                        )}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 items-end gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  DURATION
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    {...draftProjectDurationTapHandlers}
                    ref={draftProjectDurationTriggerRef}
                    className="flex h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation md:h-14"
                    aria-haspopup="dialog"
                    aria-expanded={showDraftProjectDurationPicker}
                    aria-controls="draft-project-duration-picker"
                  >
                    <span className="flex h-9 w-9 flex-col items-center justify-center rounded-md bg-white/[0.08] md:h-11 md:w-11">
                      <Clock className="h-4 w-4 text-white/80 md:h-5 md:w-5" />
                      <span className="mt-0.5 text-[9px] font-semibold leading-none text-white/80 md:text-[10px]">
                        {normalizedDraftProjectDuration || 30}m
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {showDraftProjectDurationPicker && draftProjectDurationPosition
              ? createPortal(
                  <div
                    data-fab-overlay
                    id="draft-project-duration-picker"
                    ref={draftProjectDurationPickerRef}
                    className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                    style={{
                      position: "absolute",
                      top: draftProjectDurationPosition.top,
                      left: draftProjectDurationPosition.left,
                      width: draftProjectDurationPosition.width,
                      touchAction: "manipulation",
                    }}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        {...draftProjectDurationMinusTapHandlers}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                      >
                        -
                      </button>
                      <div className="text-lg font-semibold text-white">
                        {normalizedDraftProjectDuration || 30} min
                      </div>
                      <button
                        type="button"
                        {...draftProjectDurationPlusTapHandlers}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                      >
                        +
                      </button>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
            <div className="grid gap-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                SKILL
              </Label>
              <Select
                value={draftProjectSkillIds[0] ?? ""}
                onOpenChange={handleSkillDropdownOpenChange}
                onValueChange={(value) => {
                  setDraftProjectSkillIds(value ? [value] : []);
                  const skill = findSkillById(value);
                  setSkillSearch(skill?.name ?? "");
                  setShowSkillFilters(false);
                }}
                placeholder="Link a skill"
                triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                contentWrapperClassName={cn(
                  FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                  "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                )}
                maxHeight={150}
                openOnTriggerFocus
                trigger={
                  <SkillTrigger
                    selectedId={draftProjectSkillIds[0] ?? null}
                    onClearSelection={() => {
                      setDraftProjectSkillIds([]);
                      setSkillSearch("");
                    }}
                  />
                }
              >
                <SelectContent
                  className={cn(
                    FAB_CREATION_SELECT_CONTENT_CLASS,
                    "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                  )}
                >
                  {showSkillFilters ? (
                    <div
                      ref={skillFilterMenuRef}
                      className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                        <span className="text-sm font-semibold">
                          Filter Skills
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSkillFilters(false)}
                          className="text-xs text-white/80 underline-offset-4 hover:underline"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-3">
                            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                              Filter
                            </div>
                            <div className="space-y-2">
                              <select
                                value={skillFilterMonumentId}
                                onChange={(e) =>
                                  setSkillFilterMonumentId(e.target.value)
                                }
                                className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                              >
                                <option value="">
                                  {skillFilterMonumentId
                                    ? "Monument (clear)"
                                    : "Monument (any)"}
                                </option>
                                {monuments.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {(m.emoji ?? "✨") +
                                      " " +
                                      (m.title ?? "Monument")}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                              Quick actions
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <button
                                type="button"
                                onClick={() => setSkillSearch("")}
                                className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                              >
                                Reset search
                              </button>
                              <button
                                type="button"
                                onClick={() => setSkillFilterMonumentId("")}
                                className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                              >
                                Clear filters
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {skillsLoading ? (
                    <div className="px-3 py-2 text-sm text-white/70" role="status">
                      Loading skills…
                    </div>
                  ) : filteredSkills.length > 0 ? (
                    renderGroupedSkillItems()
                  ) : (
                    <div className="px-3 py-2 text-sm text-white/70">
                      No skills found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nested-project-why" className="text-zinc-500">
                WHY (optional)
              </Label>
              <Textarea
                id="nested-project-why"
                value={draftProjectWhy}
                onChange={(e) => setDraftProjectWhy(e.target.value)}
                placeholder="Add context…"
                className="border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5",
          expanded && "min-h-full grid-rows-[auto_minmax(0,1fr)] content-start",
        )}
        style={secondaryCreationPanelStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm font-semibold leading-none text-white">
            Goal Projects
          </h3>
          {!isEditingGoal ? (
            <button
              type="button"
              onClick={() => {
                resetNestedProjectDraftForm();
                setNestedDraftPanel("goal-project");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          ) : null}
        </div>
        <div
          className={cn(
            "h-full min-h-0 pr-1",
            goalProjectListShouldScroll &&
              "max-h-full overflow-y-auto overscroll-contain",
          )}
        >
          <div
            className={cn(
              goalProjectListShouldScroll
                ? "grid max-h-full gap-3 auto-rows-[minmax(84px,1fr)]"
                : "grid h-full grid-rows-3 gap-3",
            )}
          >
            {projectItems}
          </div>
        </div>
      </div>
    );
  };

  const renderProjectTasksPanel = () => {
    const isEditingProject = Boolean(
      editTarget?.entityType === "PROJECT" && editTarget.entityId,
    );
    const visibleEditTasks = isEditingProject ? editProjectTasks : null;
    const visibleTaskCount = visibleEditTasks
      ? visibleEditTasks.length
      : projectDraftTasks.length;
    const projectTaskListShouldScroll = visibleTaskCount > 3;
    const projectTaskCardClass = projectTaskListShouldScroll
      ? "min-h-[72px]"
      : "h-full min-h-0";
    const taskItems = visibleEditTasks
      ? (() => {
          const editCards =
            visibleEditTasks.length > 0
              ? visibleEditTasks.map((task) => {
                  const taskSkill = findSkillById(task.skillId);
                  const skillLabel = task.skillId
                    ? (taskSkill?.name ?? "Linked skill")
                    : "No skill";
                  const skillVisual =
                    typeof taskSkill?.icon === "string" &&
                    taskSkill.icon.trim().length > 0
                      ? taskSkill.icon
                      : skillLabel;
                  const metaItems = [task.stage, task.dueDate].filter(
                    (value): value is string =>
                      typeof value === "string" && value.trim().length > 0,
                  );
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={cn(
                        associatedEditCardClass,
                        projectTaskCardClass,
                      )}
                      style={associatedEditCardStyle}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        onEditTargetChange?.({
                          entityType: "TASK",
                          entityId: task.id,
                          title: task.name,
                          originRect: {
                            top: rect.top,
                            left: rect.left,
                            width: rect.width,
                            height: rect.height,
                          },
                        });
                      }}
                      aria-label={`Edit task ${task.name}`}
                    >
                      {renderAssociatedSkillBadge(skillVisual, skillLabel)}
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate text-xs font-extrabold uppercase tracking-[0.08em] text-white">
                          {task.name}
                        </span>
                        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                          {metaItems.join(" / ")}
                        </span>
                        <span className="truncate text-[10px] text-white/62">
                          {skillLabel}
                        </span>
                      </span>
                      {renderAssociatedEnergyFlame()}
                    </button>
                  );
                })
              : [
                  <div
                    key="project-task-empty-edit"
                    className={associatedEditBlankClass}
                    style={associatedEditBlankStyle}
                  >
                    No tasks linked yet.
                  </div>,
                ];
          const blankCount = projectTaskListShouldScroll
            ? 0
            : Math.max(0, 3 - editCards.length);
          return [
            ...editCards,
            ...Array.from({ length: blankCount }, (_, index) => (
              <div
                key={`project-task-edit-blank-${index}`}
                aria-hidden="true"
                className={associatedEditBlankClass}
                style={associatedEditBlankStyle}
              />
            )),
          ];
        })()
      : projectDraftTasks.length > 0
        ? projectDraftTasks.map((task) => (
            <div
              key={task.tempId}
              className={cn(
                "relative grid gap-1.5 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm",
                projectTaskCardClass,
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setProjectDraftTasks((current) =>
                    current.filter((item) => item.tempId !== task.tempId),
                  )
                }
                className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/65 transition hover:border-white/20 hover:text-white"
                aria-label="Remove draft task"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="pr-6 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                {task.name}
              </div>
              <div className="flex flex-wrap gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55">
                <span>{task.stage}</span>
                {task.skillId ? (
                  <span>{findSkillById(task.skillId)?.name ?? "Skill"}</span>
                ) : null}
              </div>
            </div>
          ))
        : Array.from({ length: 3 }, (_, index) => (
            <button
              key={`project-task-empty-${index}`}
              type="button"
              onClick={() => {
                resetNestedTaskDraftForm();
                setNestedDraftPanel("project-task");
              }}
              className={cn(
                "flex items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm transition hover:border-white/18 hover:bg-white/[0.08]",
                projectTaskCardClass,
              )}
              aria-label="Add draft task"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/78">
                <Plus className="h-4 w-4" />
              </span>
            </button>
          ));

    if (nestedDraftPanel === "project-task" && !isEditingProject) {
      return (
        <div
          className={cn(
            "grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5",
            expanded && "min-h-full content-start",
          )}
          style={secondaryCreationPanelStyle}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                resetNestedTaskDraftForm();
                setNestedDraftPanel(null);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <span>Back</span>
            </button>
            <h3 className="truncate text-sm font-semibold leading-none text-white">
              Add Task
            </h3>
            <button
              type="button"
              onClick={handleAddProjectDraftTask}
              disabled={!isDraftTaskReady}
              className="inline-flex items-center rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition disabled:cursor-not-allowed disabled:opacity-45"
            >
              Done
            </button>
          </div>
          <div className="grid gap-3 md:gap-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="nested-task-name" className="sr-only">
                  Task name
                </Label>
                <Input
                  id="nested-task-name"
                  value={draftTaskName}
                  onChange={(e) => setDraftTaskName(e.target.value.toUpperCase())}
                  placeholder="Name your TASK"
                  className="h-12 rounded-md !border-white/10 bg-white/[0.05] text-lg font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0 md:h-14 md:text-xl"
                />
              </div>
              <div className="grid gap-2">
                <Label className="sr-only">Energy</Label>
                <EnergyCycleButton
                  value={draftTaskEnergy}
                  onChange={setDraftTaskEnergy}
                  ariaLabel="Draft task energy"
                  className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div className="grid min-w-0 gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  PRIORITY
                </Label>
                <Select
                  value={draftTaskPriority}
                  onValueChange={setDraftTaskPriority}
                  triggerClassName={cn(
                    "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                    FAB_CREATION_SELECT_TRIGGER_CLASS,
                  )}
                  contentWrapperClassName={cn(
                    FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                    "min-w-[240px] sm:min-w-[280px]",
                  )}
                  placeholder="Priority"
                >
                  <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                    {PRIORITY_OPTIONS_LOCAL.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className={fabCreationSelectItemClass(
                          draftTaskPriority === o.value,
                        )}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  STAGE
                </Label>
                <Select
                  value={draftTaskStage}
                  onValueChange={setDraftTaskStage}
                  triggerClassName={cn(
                    "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                    FAB_CREATION_SELECT_TRIGGER_CLASS,
                  )}
                  contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                  placeholder="Stage"
                >
                  <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                    {TASK_STAGE_OPTIONS_LOCAL.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className={fabCreationSelectItemClass(
                          draftTaskStage === o.value,
                        )}
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid min-w-0 items-end gap-2">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  DURATION
                </Label>
                <button
                  type="button"
                  {...draftTaskDurationTapHandlers}
                  ref={draftTaskDurationTriggerRef}
                  className="flex h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation md:h-14"
                  aria-haspopup="dialog"
                  aria-expanded={showDraftTaskDurationPicker}
                  aria-controls="draft-task-duration-picker"
                >
                  <span className="flex h-9 w-9 flex-col items-center justify-center rounded-md bg-white/[0.08] md:h-11 md:w-11">
                    <Clock className="h-4 w-4 text-white/80 md:h-5 md:w-5" />
                    <span className="mt-0.5 text-[9px] font-semibold leading-none text-white/80 md:text-[10px]">
                      {Number.isFinite(normalizedDraftTaskDuration)
                        ? normalizedDraftTaskDuration
                        : 30}
                      m
                    </span>
                  </span>
                </button>
              </div>
            </div>
            {showDraftTaskDurationPicker && draftTaskDurationPosition
              ? createPortal(
                  <div
                    data-fab-overlay
                    id="draft-task-duration-picker"
                    ref={draftTaskDurationPickerRef}
                    className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                    style={{
                      position: "absolute",
                      top: draftTaskDurationPosition.top,
                      left: draftTaskDurationPosition.left,
                      width: draftTaskDurationPosition.width,
                      touchAction: "manipulation",
                    }}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        {...draftTaskDurationMinusTapHandlers}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                      >
                        -
                      </button>
                      <div className="text-lg font-semibold text-white">
                        {Number.isFinite(normalizedDraftTaskDuration)
                          ? normalizedDraftTaskDuration
                          : 30}{" "}
                        min
                      </div>
                      <button
                        type="button"
                        {...draftTaskDurationPlusTapHandlers}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                      >
                        +
                      </button>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="grid min-w-0 gap-2">
                <Label>Skill</Label>
                <Select
                  value={draftTaskSkillId ?? ""}
                  onOpenChange={handleSkillDropdownOpenChange}
                  onValueChange={(value) => {
                    setDraftTaskSkillId(value);
                    const skill = findSkillById(value);
                    setSkillSearch(skill?.name ?? "");
                    setShowSkillFilters(false);
                  }}
                  placeholder="Link a skill"
                  triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                  contentWrapperClassName={cn(
                    FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                    "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                  )}
                  maxHeight={150}
                  openOnTriggerFocus
                  trigger={
                    <SkillTrigger
                      selectedId={draftTaskSkillId || null}
                      onClearSelection={() => {
                        setDraftTaskSkillId("");
                        setSkillSearch("");
                      }}
                    />
                  }
                >
                  <SelectContent
                    className={cn(
                      FAB_CREATION_SELECT_CONTENT_CLASS,
                      "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                    )}
                  >
                    {showSkillFilters ? (
                      <div
                        ref={skillFilterMenuRef}
                        className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                      >
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                          <span className="text-sm font-semibold">
                            Filter Skills
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSkillFilters(false)}
                            className="text-xs text-white/80 underline-offset-4 hover:underline"
                          >
                            Close
                          </button>
                        </div>
                        <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-3">
                              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                Filter
                              </div>
                              <div className="space-y-2">
                                <select
                                  value={skillFilterMonumentId}
                                  onChange={(e) =>
                                    setSkillFilterMonumentId(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                >
                                  <option value="">
                                    {skillFilterMonumentId
                                      ? "Monument (clear)"
                                      : "Monument (any)"}
                                  </option>
                                  {monuments.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {(m.emoji ?? "✨") +
                                        " " +
                                        (m.title ?? "Monument")}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                Quick actions
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSkillSearch("")}
                                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                >
                                  Reset search
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSkillFilterMonumentId("")}
                                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                >
                                  Clear filters
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {skillsLoading ? (
                      <div className="px-3 py-2 text-sm text-white/70" role="status">
                        Loading skills…
                      </div>
                    ) : filteredSkills.length > 0 ? (
                      renderGroupedSkillItems()
                    ) : (
                      <div className="px-3 py-2 text-sm text-white/70">
                        No skills found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="nested-task-notes">Notes (optional)</Label>
                <Textarea
                  id="nested-task-notes"
                  value={draftTaskNotes}
                  onChange={(e) => setDraftTaskNotes(e.target.value)}
                  placeholder="Context…"
                  rows={3}
                  className="min-h-[88px] rounded-md border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none md:min-h-[96px]"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm md:px-5",
          expanded && "min-h-full grid-rows-[auto_minmax(0,1fr)] content-start",
        )}
        style={secondaryCreationPanelStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm font-semibold leading-none text-white">
            Project Tasks
          </h3>
          {!isEditingProject ? (
            <button
              type="button"
              onClick={() => {
                resetNestedTaskDraftForm();
                setNestedDraftPanel("project-task");
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:border-white/20 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          ) : null}
        </div>
        <div
          className={cn(
            "h-full min-h-0 pr-1",
            expanded && !projectTaskListShouldScroll && "min-h-0",
            projectTaskListShouldScroll &&
              "max-h-full overflow-y-auto overscroll-contain",
          )}
        >
          <div
            className={cn(
              projectTaskListShouldScroll
                ? "grid max-h-full gap-3 auto-rows-[minmax(84px,1fr)]"
                : "grid h-full grid-rows-3 gap-3",
            )}
          >
            {taskItems}
          </div>
        </div>
      </div>
    );
  };

  const renderPrimaryPage = () => (
    <div
      className={cn(
        "flex w-full flex-col",
        expanded ? "min-h-full p-0" : "",
      )}
    >
      <div className="grid w-full">
        <AnimatePresence initial={false}>
          {!expanded ? (
            <motion.div
              key="fab-add-event-selection"
              className="col-start-1 row-start-1 flex w-full flex-col px-4 py-2"
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      transition: {
                        type: "tween",
                        ease: "easeIn",
                        duration: 0.08,
                      },
                    }
              }
              transition={{
                type: "tween",
                ease: "easeOut",
                duration: prefersReducedMotion ? 0.08 : 0.12,
              }}
            >
              {primary.map((event) => {
                const isPressed = pressedCreationType === event.eventType;
                return (
                  <motion.button
                    key={event.label}
                    variants={itemVariants}
                    onClick={(clickEvent) =>
                      handleEventClick(
                        event.eventType,
                        clickEvent.currentTarget,
                      )
                    }
                    animate={{
                      backgroundColor: isPressed
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0)",
                    }}
                    whileTap={
                      prefersReducedMotion ? undefined : { y: 1, opacity: 0.9 }
                    }
                    transition={{
                      type: "tween",
                      ease: "easeOut",
                      duration: 0.1,
                    }}
                    className={cn(
                      "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 whitespace-nowrap",
                      itemAlignmentClass,
                      event.color,
                      isPressed && "text-white",
                    )}
                  >
                    <span className="text-sm opacity-80">add</span>{" "}
                    <span className="text-lg font-bold">{event.label}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key={`fab-creation-${selected ?? "none"}`}
              className="relative col-start-1 row-start-1 mt-0 bg-black/80"
              aria-label="Expanded placeholder"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0 }}
            >
            <div
              ref={expandedCreationBodyRef}
              className={cn(
                "relative grid p-4 pb-4",
                expanded && isContentSizedCreationExpanded && "content-start",
                selected === "HABIT"
                  ? "gap-3 md:gap-3.5 md:p-6 md:pb-5"
                  : "gap-4 md:p-8 md:pb-6",
              )}
              style={{
                paddingBottom: shouldUseCenteredEditModal
                  ? undefined
                  : shouldAttachCreationControls
                    ? "0.5rem"
                    : `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${keyboardLift}px)`,
                scrollPaddingBottom: shouldUseCenteredEditModal
                  ? undefined
                  : shouldAttachCreationControls
                    ? "1rem"
                    : `calc(env(safe-area-inset-bottom, 0px) + ${keyboardLift + 16}px)`,
              }}
            >
              {selected &&
              activeCreationMode === "main" &&
              editTarget?.entityType === selected &&
              editHydrating ? (
                <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                  <span className="inline-flex items-center gap-1.5 text-white/70">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                </div>
              ) : null}
              {selected === "GOAL" && activeCreationMode === "main" && (
                <>
                  <div className="grid gap-3">
                    <Select
                      value={selectedGoalRelationValue}
                      onValueChange={handleGoalRelationChange}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        goalRelationType && goalRelationId
                          ? "text-white/80 hover:text-zinc-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                      )}
                      trigger={
                        <span>{selectedGoalRelationLabel}</span>
                      }
                    >
                      <SelectContent
                        className={cn(
                          FAB_CREATION_SELECT_CONTENT_CLASS,
                          "min-w-[220px]",
                        )}
                      >
                        <SelectItem
                          value="__monuments_label"
                          disabled
                          className="cursor-default px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45 opacity-100 hover:bg-transparent hover:text-white/45"
                        >
                          MONUMENTS
                        </SelectItem>
                        {monumentsLoading ? (
                          <SelectItem
                            value="__loading"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            Loading monuments…
                          </SelectItem>
                        ) : monuments.length > 0 ? (
                          monuments.map((monument) => (
                            <SelectItem
                              key={monument.id}
                              value={`MONUMENT:${monument.id}`}
                              className={fabCreationSelectItemClass(
                                selectedGoalRelationValue ===
                                  `MONUMENT:${monument.id}`,
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {monument.emoji ?? "🏛️"}
                                </span>
                                <span>{monument.title}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem
                            value="__empty"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            No monuments yet
                          </SelectItem>
                        )}
                        <SelectItem
                          value="__circles_label"
                          disabled
                          className="cursor-default px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45 opacity-100 hover:bg-transparent hover:text-white/45"
                        >
                          CIRCLES
                        </SelectItem>
                        {manageableCirclesLoading ? (
                          <SelectItem
                            value="__circles_loading"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            Loading circles…
                          </SelectItem>
                        ) : manageableCircles.length > 0 ? (
                          manageableCircles.map((circle) => (
                            <SelectItem
                              key={circle.id}
                              value={`CIRCLE:${circle.id}`}
                              className={fabCreationSelectItemClass(
                                selectedGoalRelationValue ===
                                  `CIRCLE:${circle.id}`,
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <CircleDot
                                  className="h-4 w-4 text-zinc-300"
                                  aria-hidden="true"
                                />
                                <span>{circle.name}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem
                            value="__circles_empty"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            No managed circles yet
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="goal-name" className="sr-only">
                        Goal name
                      </Label>
                      <Input
                        id="goal-name"
                        ref={goalNameInputRef}
                        value={goalName}
                        onChange={(e) =>
                          setGoalName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your GOAL"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={goalEnergy}
                        onChange={setGoalEnergy}
                        ariaLabel="Goal energy"
                        className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={goalPriority}
                        onValueChange={setGoalPriority}
                        triggerClassName={cn(
                          "h-12 md:h-14 text-[11px] uppercase tracking-[0.12em]",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={cn(
                          FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                          "min-w-[240px] sm:min-w-[280px]",
                        )}
                        placeholder="Priority"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              className={fabCreationSelectItemClass(
                                goalPriority === o.value,
                              )}
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        CAMPAIGN
                      </Label>
                      <Select
                        value={goalCampaignId ?? ""}
                        onValueChange={(value) => {
                          resetGoalCampaignInlineCreation();
                          setGoalCampaignId(
                            value.trim().length > 0 ? value : null,
                          );
                        }}
                        triggerClassName={cn(
                          "h-12 text-left text-sm md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={cn(
                          FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                          "min-w-[260px] sm:min-w-[320px]",
                        )}
                        placeholder="No campaign"
                        disablePortal
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          <SelectItem
                            value=""
                            className={fabCreationSelectItemClass(
                              !goalCampaignId,
                            )}
                          >
                            No campaign
                          </SelectItem>
                          <GoalCampaignCreateRow
                            active={isCreatingGoalCampaignInline}
                            value={goalInlineCampaignName}
                            emoji={goalInlineCampaignEmoji}
                            error={goalCampaignCreateError}
                            loading={goalCampaignCreating}
                            onStart={() => {
                              setIsCreatingGoalCampaignInline(true);
                              setGoalInlineCampaignEmoji((current) =>
                                current.trim() || FAB_DEFAULT_CAMPAIGN_EMOJI,
                              );
                              setGoalCampaignCreateError(null);
                            }}
                            onChange={(value) => {
                              setGoalInlineCampaignName(value);
                              setGoalCampaignCreateError(null);
                            }}
                            onEmojiChange={(value) => {
                              setGoalInlineCampaignEmoji(value);
                              setGoalCampaignCreateError(null);
                            }}
                            onSubmit={() => {
                              void handleCreateGoalCampaignInline();
                            }}
                            onCancel={resetGoalCampaignInlineCreation}
                          />
                          {goalCampaignsLoading ? (
                            <SelectItem
                              value="__loading"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              Loading campaigns…
                            </SelectItem>
                          ) : goalCampaignOptions.length > 0 ? (
                            goalCampaignOptions.map((campaign) => (
                              <SelectItem
                                key={campaign.id}
                                value={campaign.id}
                                className={fabCreationSelectItemClass(
                                  goalCampaignId === campaign.id,
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="text-base">
                                    {campaign.emoji ?? FAB_DEFAULT_CAMPAIGN_EMOJI}
                                  </span>
                                  <span className="truncate">{campaign.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem
                              value="__empty"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              No campaigns yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="goal-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="goal-why"
                      value={goalWhy}
                      onChange={(e) => setGoalWhy(e.target.value)}
                      placeholder="Motivation…"
                      className="border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "PROJECT" && activeCreationMode === "main" && (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-4">
                    <div className="grid gap-2">
                      <Label className="sr-only">Goal</Label>
                      <div className="relative">
                        <button
                          ref={goalPickerTriggerRef}
                          type="button"
                          onClick={() => setIsGoalPickerOpen((v) => !v)}
                          className={cn(
                            "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                            projectGoalId
                              ? "text-white/80 hover:text-zinc-200"
                              : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                          )}
                        >
                          <span>
                            {projectGoalId
                              ? (goals.find((g) => g.id === projectGoalId)
                                  ?.name ??
                                (goalsLoading
                                  ? "Loading goal…"
                                  : "Link to existing GOAL +"))
                              : "Link to existing GOAL +"}
                          </span>
                        </button>
                        {isGoalPickerOpen &&
                          typeof window !== "undefined" &&
                          createPortal(
                            <div
                              ref={goalPickerContentRef}
                              className="fixed z-[2147483661] min-w-[220px] overflow-hidden rounded-sm border border-zinc-700/70 bg-zinc-950 shadow-xl shadow-black/50"
                              style={goalPickerPosition ?? undefined}
                            >
                              <div className="relative max-h-60 overflow-y-auto overflow-x-hidden overscroll-contain">
                                <div className="sticky top-0 z-10 bg-black/80 p-2 backdrop-blur border-b border-white/5">
                                  <div className="relative flex items-center gap-2">
                                    <Input
                                      autoFocus
                                      value={goalSearch}
                                      onChange={(e) => setGoalSearch(e.target.value)}
                                      onKeyDown={(e) => e.stopPropagation()}
                                      placeholder="Search goals…"
                                      className="h-9 text-sm border-white/10 bg-white/[0.05] text-white placeholder:text-white/60 focus:border-zinc-500 focus-visible:ring-0"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowGoalFilters((v) => !v)}
                                      className={cn(
                                        "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                        showGoalFilters &&
                                          "border-zinc-500/70 text-white",
                                      )}
                                      aria-label="Filter goals"
                                    >
                                      <Filter className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                                {showGoalFilters ? (
                                  <div
                                    ref={goalFilterMenuRef}
                                    className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                                  >
                                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                      <span className="text-sm font-semibold">
                                        Filter & Sort Goals
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setShowGoalFilters(false)}
                                        className="text-xs text-white/80 underline-offset-4 hover:underline"
                                      >
                                        Close
                                      </button>
                                    </div>
                                    <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-3">
                                          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                            Filter
                                          </div>
                                          <div className="space-y-2">
                                            <select
                                              value={goalFilterSkillId}
                                              onChange={(e) =>
                                                setGoalFilterSkillId(e.target.value)
                                              }
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                            >
                                              <option value="">
                                                {goalFilterSkillId
                                                  ? "Skill (clear)"
                                                  : "Skill (any)"}
                                              </option>
                                              {skills.map((skill) => (
                                                <option
                                                  key={skill.id}
                                                  value={skill.id}
                                                >
                                                  {skill.name}
                                                </option>
                                              ))}
                                            </select>
                                            <select
                                              value={goalFilterMonumentId}
                                              onChange={(e) =>
                                                setGoalFilterMonumentId(
                                                  e.target.value,
                                                )
                                              }
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                            >
                                              <option value="">
                                                {goalFilterMonumentId
                                                  ? "Monument (clear)"
                                                  : "Monument (any)"}
                                              </option>
                                              {monuments.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                  {(m.emoji ?? "✨") +
                                                    " " +
                                                    (m.title ?? "Monument")}
                                                </option>
                                              ))}
                                            </select>
                                            <select
                                              value={goalFilterEnergy}
                                              onChange={(e) =>
                                                setGoalFilterEnergy(e.target.value)
                                              }
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                            >
                                              <option value="">
                                                {goalFilterEnergy
                                                  ? "Energy (clear)"
                                                  : "Energy (any)"}
                                              </option>
                                              {ENERGY_OPTIONS_LOCAL.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                  {o.label}
                                                </option>
                                              ))}
                                            </select>
                                            <select
                                              value={goalFilterPriority}
                                              onChange={(e) =>
                                                setGoalFilterPriority(e.target.value)
                                              }
                                              className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                            >
                                              <option value="">
                                                {goalFilterPriority
                                                  ? "Priority (clear)"
                                                  : "Priority (any)"}
                                              </option>
                                              {PRIORITY_OPTIONS_LOCAL.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                  {o.label}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                        <div className="space-y-3">
                                          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                            Sort
                                          </div>
                                          <div className="grid grid-cols-1 gap-2">
                                            <button
                                              type="button"
                                              onClick={() => setGoalSort("recent")}
                                              className={cn(
                                                "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                                goalSort === "recent" &&
                                                  "border-zinc-500/70 bg-zinc-800 text-white",
                                              )}
                                            >
                                              Recently updated
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setGoalSort("oldest")}
                                              className={cn(
                                                "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                                goalSort === "oldest" &&
                                                  "border-zinc-500/70 bg-zinc-800 text-white",
                                              )}
                                            >
                                              Oldest updated
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setGoalSort("weight")}
                                              className={cn(
                                                "w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30",
                                                goalSort === "weight" &&
                                                  "border-zinc-500/70 bg-zinc-800 text-white",
                                              )}
                                            >
                                              Highest weight
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                                {goalsLoading ? (
                                  <div className="px-3 py-2 text-sm text-white/50 opacity-50">
                                    Loading goals…
                                  </div>
                                ) : goals.length > 0 ? (
                                  filteredGoals.length > 0 ? (
                                    filteredGoals.map((goal) => {
                                      const circleLabel =
                                        getCircleGoalContextLabel(goal);
                                      return (
                                        <div
                                          key={goal.id}
                                          role="option"
                                          aria-selected={
                                            projectGoalId === goal.id
                                          }
                                          onPointerDown={(event) => {
                                            const target = event.currentTarget;
                                            target.dataset.pointerStartX = String(event.clientX);
                                            target.dataset.pointerStartY = String(event.clientY);
                                          }}
                                          onClick={(event) => {
                                            const target = event.currentTarget;
                                            const startX = Number(target.dataset.pointerStartX ?? event.clientX);
                                            const startY = Number(target.dataset.pointerStartY ?? event.clientY);
                                            const moved =
                                              Math.abs(event.clientX - startX) > 8 ||
                                              Math.abs(event.clientY - startY) > 8;

                                            delete target.dataset.pointerStartX;
                                            delete target.dataset.pointerStartY;

                                            if (moved) return;

                                            setProjectGoalId(goal.id);
                                            setIsGoalPickerOpen(false);
                                          }}
                                          className={cn(
                                            "flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 hover:text-white",
                                            projectGoalId === goal.id &&
                                              "bg-zinc-800 text-white shadow-none ring-1 ring-zinc-700/70",
                                          )}
                                        >
                                          <div className="flex min-w-0 items-center gap-2">
                                            {goal.circle_id ? (
                                              <CircleDot
                                                className="h-4 w-4 shrink-0 text-zinc-300"
                                                aria-hidden="true"
                                              />
                                            ) : (
                                              <span className="shrink-0 text-lg">
                                                {goal.emoji ??
                                                  goal.monumentEmoji ??
                                                  monumentEmojiMap.get(
                                                    goal.monument_id ?? "",
                                                  ) ??
                                                  "✨"}
                                              </span>
                                            )}
                                            <span className="flex min-w-0 flex-col">
                                              <span className="truncate">
                                                {goal.name}
                                              </span>
                                              {circleLabel ? (
                                                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300/70">
                                                  {circleLabel}
                                                </span>
                                              ) : null}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="px-3 py-2 text-sm text-white/50 opacity-50">
                                      No goals match your search
                                    </div>
                                  )
                                ) : (
                                  <div className="px-3 py-2 text-sm text-white/50 opacity-50">
                                    No goals yet
                                  </div>
                                )}
                              </div>
                            </div>,
                            document.body,
                          )}
                      </div>
                    </div>
                    <div className="flex items-start justify-end text-right">
                      {projectedRankState.status === "incomplete" ? (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          ∞
                        </p>
                      ) : projectedRankState.status === "loading" ? (
                        <div className="flex items-center gap-2 text-[10px] text-white/70">
                          <Loader2 className="h-3 w-3 animate-spin text-white/70" />
                          <span>Calculating…</span>
                        </div>
                      ) : projectedRankState.status === "error" ? (
                        <p className="text-[10px] text-red-300">
                          Couldn&apos;t calculate rank:{" "}
                          {projectedRankState.message}
                        </p>
                      ) : (
                        <p className="text-sm font-semibold tracking-wide text-zinc-500">
                          #{projectedRankState.data.rank}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
                    <div className="grid min-w-0 gap-2">
                      <Label htmlFor="main-project-name" className="sr-only">
                        Project name
                      </Label>
                      <Input
                        id="main-project-name"
                        ref={projectNameInputRef}
                        value={projectName}
                        onChange={(e) =>
                          setProjectName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your PROJECT"
                        className="h-12 rounded-md !border-white/10 bg-white/[0.05] text-lg font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0 md:h-14 md:text-xl"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={projectEnergy}
                        onChange={setProjectEnergy}
                        ariaLabel="Project energy"
                        className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={projectPriority}
                        onValueChange={setProjectPriority}
                        triggerClassName={cn(
                          "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={cn(
                          FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                          "min-w-[240px] sm:min-w-[280px]",
                        )}
                        placeholder="Priority"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              label={o.label}
                              className={fabCreationSelectItemClass(
                                projectPriority === o.value,
                              )}
                            >
                              <div className="flex w-full items-center justify-between gap-3">
                                <span>{o.label}</span>
                                <span className="w-10 text-right text-red-400">
                                  {PRIORITY_ICON_MAP[o.value] ?? ""}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={projectStage}
                        onValueChange={setProjectStage}
                        triggerClassName={cn(
                          "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        placeholder="Stage"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {PROJECT_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              className={fabCreationSelectItemClass(
                                projectStage === o.value,
                              )}
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 items-end gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DURATION
                      </Label>
                      <div className="relative">
                        <button
                          type="button"
                          {...projectDurationTapHandlers}
                          ref={durationTriggerRef}
                          className="flex h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation md:h-14"
                          aria-haspopup="dialog"
                          aria-expanded={showDurationPicker}
                          aria-controls="project-duration-picker"
                        >
                          <span className="flex h-9 w-9 flex-col items-center justify-center rounded-md bg-white/[0.08] md:h-11 md:w-11">
                            <Clock className="h-4 w-4 text-white/80 md:h-5 md:w-5" />
                            <span className="mt-0.5 text-[9px] font-semibold leading-none text-white/80 md:text-[10px]">
                              {normalizedProjectDuration || 30}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {showDurationPicker && durationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="project-duration-picker"
                          ref={durationPickerRef}
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: durationPosition.top,
                            left: durationPosition.left,
                            width: durationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...projectDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {normalizedProjectDuration || 30} min
                            </div>
                            <button
                              type="button"
                              {...projectDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={projectSkillIds[0] ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setProjectSkillIds(value ? [value] : []);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName={cn(
                        FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                        "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                      )}
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={projectSkillIds[0] ?? null}
                          onClearSelection={() => {
                            setProjectSkillIds([]);
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent
                        className={cn(
                          FAB_CREATION_SELECT_CONTENT_CLASS,
                          "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                        )}
                      >
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSkillFilterMonumentId("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <div className="px-3 py-2 text-sm text-white/70" role="status">
                            Loading skills…
                          </div>
                        ) : filteredSkills.length > 0 ? (
                          renderGroupedSkillItems()
                        ) : (
                          <div className="px-3 py-2 text-sm text-white/70">
                            No skills found
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="main-project-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="main-project-why"
                      value={projectWhy}
                      onChange={(e) => setProjectWhy(e.target.value)}
                      placeholder="Add context…"
                      className="border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>
                </>
              )}

              {selected === "TASK" && activeCreationMode === "main" && (
                <div className="grid gap-3 md:gap-3.5">
                  <div className="grid gap-1.5">
                    <Select
                      value={taskProjectId ?? ""}
                      onValueChange={setTaskProjectId}
                      onOpenChange={(open) => {
                        if (!open) {
                          setShowTaskProjectFilters(false);
                        }
                      }}
                      hideChevron
                      triggerClassName={cn(
                        "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                        taskProjectId
                          ? "text-white/80 hover:text-zinc-200"
                          : "text-red-400/80 drop-shadow-[0_0_4px_rgba(248,113,113,0.15)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                      )}
                      trigger={
                        <span>
                          {taskProjectId
                            ? (taskProjects.find((p) => p.id === taskProjectId)
                                ?.name ?? "Link to existing PROJECT +")
                            : "Link to existing PROJECT +"}
                        </span>
                      }
                    >
                      <SelectContent
                        className={cn(
                          FAB_CREATION_SELECT_CONTENT_CLASS,
                          "relative min-w-[220px]",
                        )}
                      >
                        <div className="sticky top-0 z-10 border-b border-white/5 bg-black/80 p-2 backdrop-blur">
                          <div className="relative flex items-center gap-2">
                            <Input
                              value={taskProjectSearch}
                              onChange={(e) =>
                                setTaskProjectSearch(e.target.value)
                              }
                              placeholder="Search projects…"
                              className="h-9 border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-white/60 focus:border-zinc-500 focus-visible:ring-0"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setShowTaskProjectFilters((v) => !v)
                              }
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition hover:border-white/30 hover:text-white",
                                showTaskProjectFilters &&
                                  "border-zinc-500/70 text-white",
                              )}
                              aria-label="Filter projects"
                            >
                              <Filter className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {showTaskProjectFilters ? (
                          <div
                            ref={taskProjectFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Projects
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowTaskProjectFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={taskProjectFilterStage}
                                      onChange={(e) =>
                                        setTaskProjectFilterStage(
                                          e.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterStage
                                          ? "Stage (clear)"
                                          : "Stage (any)"}
                                      </option>
                                      {PROJECT_STAGE_OPTIONS_LOCAL.map(
                                        (stage) => (
                                          <option
                                            key={stage.value}
                                            value={stage.value}
                                          >
                                            {stage.label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                    <select
                                      value={taskProjectFilterPriority}
                                      onChange={(e) =>
                                        setTaskProjectFilterPriority(
                                          e.target.value,
                                        )
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {taskProjectFilterPriority
                                          ? "Priority (clear)"
                                          : "Priority (any)"}
                                      </option>
                                      {PRIORITY_OPTIONS_LOCAL.map((p) => (
                                        <option key={p.value} value={p.value}>
                                          {p.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setTaskProjectSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setTaskProjectFilterStage("");
                                        setTaskProjectFilterPriority("");
                                      }}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {taskProjectsLoading ? (
                          <SelectItem
                            value="__loading"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            Loading projects…
                          </SelectItem>
                        ) : filteredTaskProjects.length > 0 ? (
                          filteredTaskProjects.map((project) => (
                            <SelectItem
                              key={project.id}
                              value={project.id}
                              className={fabCreationSelectItemClass(
                                taskProjectId === project.id,
                              )}
                            >
                              {project.name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem
                            value="__empty"
                            disabled
                            className={fabCreationSelectItemClass(false)}
                          >
                            {taskProjectSearch.trim().length > 0
                              ? "No projects found"
                              : "No projects yet"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
                    <div className="grid min-w-0 gap-2">
                      <Label htmlFor="main-task-name" className="sr-only">
                        Task name
                      </Label>
                      <Input
                        id="main-task-name"
                        ref={taskNameInputRef}
                        value={taskName}
                        onChange={(e) =>
                          setTaskName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your TASK"
                        className="h-12 rounded-md !border-white/10 bg-white/[0.05] text-lg font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0 md:h-14 md:text-xl"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={taskEnergy}
                        onChange={setTaskEnergy}
                        ariaLabel="Task energy"
                        className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        PRIORITY
                      </Label>
                      <Select
                        value={taskPriority}
                        onValueChange={setTaskPriority}
                        triggerClassName={cn(
                          "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={cn(
                          FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                          "min-w-[240px] sm:min-w-[280px]",
                        )}
                        placeholder="Priority"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {PRIORITY_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              className={fabCreationSelectItemClass(
                                taskPriority === o.value,
                              )}
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        STAGE
                      </Label>
                      <Select
                        value={taskStage}
                        onValueChange={setTaskStage}
                        triggerClassName={cn(
                          "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        placeholder="Stage"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {TASK_STAGE_OPTIONS_LOCAL.map((o) => (
                            <SelectItem
                              key={o.value}
                              value={o.value}
                              className={fabCreationSelectItemClass(
                                taskStage === o.value,
                              )}
                            >
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 items-end gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DURATION
                      </Label>
                      <button
                        type="button"
                        {...taskDurationTapHandlers}
                        ref={taskDurationTriggerRef}
                        className="flex h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation md:h-14"
                        aria-haspopup="dialog"
                        aria-expanded={showTaskDurationPicker}
                        aria-controls="task-duration-picker"
                      >
                        <span className="flex h-9 w-9 flex-col items-center justify-center rounded-md bg-white/[0.08] md:h-11 md:w-11">
                          <Clock className="h-4 w-4 text-white/80 md:h-5 md:w-5" />
                          <span className="mt-0.5 text-[9px] font-semibold leading-none text-white/80 md:text-[10px]">
                            {Number.parseInt(taskDuration || "30", 10) || 30}m
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                  {showTaskDurationPicker && taskDurationPosition
                    ? createPortal(
                        <div
                          data-fab-overlay
                          id="task-duration-picker"
                          ref={taskDurationPickerRef}
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: taskDurationPosition.top,
                            left: taskDurationPosition.left,
                            width: taskDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...taskDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {Number.parseInt(taskDuration || "30", 10) || 30} min
                            </div>
                            <button
                              type="button"
                              {...taskDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="grid min-w-0 gap-2">
                      <Label>Skill</Label>
                      <Select
                        value={taskSkillId ?? ""}
                        onOpenChange={handleSkillDropdownOpenChange}
                        onValueChange={(value) => {
                          setTaskSkillId(value);
                          const skill = findSkillById(value);
                          setSkillSearch(skill?.name ?? "");
                          setShowSkillFilters(false);
                        }}
                        placeholder="Link a skill"
                        triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                        contentWrapperClassName={cn(
                          FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                          "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                        )}
                        maxHeight={150}
                        openOnTriggerFocus
                        trigger={
                          <SkillTrigger
                            selectedId={taskSkillId || null}
                            onClearSelection={() => {
                              setTaskSkillId("");
                              setSkillSearch("");
                            }}
                          />
                        }
                      >
                        <SelectContent
                          className={cn(
                            FAB_CREATION_SELECT_CONTENT_CLASS,
                            "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                          )}
                        >
                          {showSkillFilters ? (
                            <div
                              ref={skillFilterMenuRef}
                              className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                            >
                              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                <span className="text-sm font-semibold">
                                  Filter Skills
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowSkillFilters(false)}
                                  className="text-xs text-white/80 underline-offset-4 hover:underline"
                                >
                                  Close
                                </button>
                              </div>
                              <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Filter
                                    </div>
                                    <div className="space-y-2">
                                      <select
                                        value={skillFilterMonumentId}
                                        onChange={(e) =>
                                          setSkillFilterMonumentId(
                                            e.target.value,
                                          )
                                        }
                                        className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                      >
                                        <option value="">
                                          {skillFilterMonumentId
                                            ? "Monument (clear)"
                                            : "Monument (any)"}
                                        </option>
                                        {monuments.map((m) => (
                                          <option key={m.id} value={m.id}>
                                            {(m.emoji ?? "✨") +
                                              " " +
                                              (m.title ?? "Monument")}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                      Quick actions
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSkillSearch("")}
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Reset search
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSkillFilterMonumentId("")
                                        }
                                        className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                      >
                                        Clear filters
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          {skillsLoading ? (
                            <div className="px-3 py-2 text-sm text-white/70" role="status">
                              Loading skills…
                            </div>
                          ) : filteredSkills.length > 0 ? (
                            renderGroupedSkillItems()
                          ) : (
                            <div className="px-3 py-2 text-sm text-white/70">
                              No skills found
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="main-task-notes">Notes (optional)</Label>
                      <Textarea
                        id="main-task-notes"
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        placeholder="Context…"
                        rows={3}
                        className="min-h-[88px] rounded-md border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none md:min-h-[96px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selected === "HABIT" && activeCreationMode === "main" && (
                <div className="grid gap-3 md:gap-3.5">
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                      <Select
                        value={habitRoutineId ?? ""}
                        onValueChange={(value) => {
                          if (value === "__create__") {
                            setHabitRoutineId("");
                            setIsCreatingHabitRoutineInline(true);
                            setHabitInlineRoutineName("");
                            setHabitInlineRoutineEmoji(
                              FAB_DEFAULT_ROUTINE_EMOJI,
                            );
                            setHabitInlineRoutineDescription("");
                            setHabitRoutineCreateError(null);
                            return;
                          }
                          resetHabitRoutineInlineCreation();
                          setHabitRoutineId(value);
                        }}
                        minContentWidth={352}
                        hideChevron
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        triggerClassName={cn(
                          "h-auto border-0 bg-transparent p-0 text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4",
                          habitRoutineId
                            ? "text-white/80 hover:text-zinc-200"
                            : "text-zinc-600/90 drop-shadow-[0_0_4px_rgba(39,39,42,0.32)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                        )}
                        trigger={
                          <span>
                            {habitRoutineId
                              ? (habitRoutines.find(
                                  (r) => r.id === habitRoutineId,
                                )?.name ?? "Link to existing ROUTINE +")
                              : "Link to existing ROUTINE +"}
                          </span>
                        }
                      >
                        <SelectContent className="max-h-72 w-[min(calc(100vw-2rem),22rem)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-sm border border-zinc-700/70 bg-zinc-950 p-2 text-sm text-white shadow-2xl shadow-black/50">
                          <FabHabitRoutineCreateRow
                            active={isCreatingHabitRoutineInline}
                            value={habitInlineRoutineName}
                            emoji={habitInlineRoutineEmoji}
                            error={habitRoutineCreateError}
                            onStart={() => {
                              setHabitRoutineId("");
                              setIsCreatingHabitRoutineInline(true);
                              setHabitInlineRoutineEmoji((current) =>
                                current.trim() || FAB_DEFAULT_ROUTINE_EMOJI,
                              );
                              setHabitInlineRoutineDescription("");
                              setHabitRoutineCreateError(null);
                            }}
                            onChange={(value) => {
                              setHabitInlineRoutineName(value);
                              setHabitRoutineCreateError(null);
                            }}
                            onEmojiChange={(value) => {
                              setHabitInlineRoutineEmoji(value);
                              setHabitRoutineCreateError(null);
                            }}
                            onSubmit={() => {
                              const routineName =
                                habitInlineRoutineName.trim();
                              if (!routineName) {
                                setHabitRoutineCreateError(
                                  "Routine name is required.",
                                );
                                return false;
                              }
                              setHabitRoutineId("");
                              setIsCreatingHabitRoutineInline(true);
                              setHabitInlineRoutineName(routineName);
                              setHabitInlineRoutineDescription("");
                              setHabitRoutineCreateError(null);
                              return true;
                            }}
                            onCancel={() => {
                              setHabitRoutineId("");
                              resetHabitRoutineInlineCreation();
                            }}
                          />
                          {habitRoutinesLoading ? (
                            <SelectItem
                              value="__loading"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              Loading routines…
                            </SelectItem>
                          ) : habitRoutines.length > 0 ? (
                            habitRoutines.map((routine) => (
                              <SelectItem
                                key={routine.id}
                                value={routine.id}
                                className={fabCreationSelectItemClass(
                                  habitRoutineId === routine.id,
                                  "min-w-0 items-stretch",
                                )}
                              >
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-medium">
                                    {routine.name}
                                  </span>
                                  {routine.description ? (
                                    <span className="line-clamp-2 whitespace-normal break-words text-xs text-white/60">
                                      {routine.description}
                                    </span>
                                  ) : null}
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem
                              value="__empty"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              No routines yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Select
                        value={habitCircleId ?? ""}
                        onValueChange={(value) => {
                          setHabitCircleId(value === "__none__" ? "" : value);
                        }}
                        hideChevron
                        placement="below"
                        contentAlign="end"
                        minContentWidth={220}
                        maxHeight={180}
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        triggerClassName={cn(
                          "h-auto max-w-[11rem] border-0 bg-transparent p-0 text-right text-xs font-semibold shadow-none underline decoration-dotted underline-offset-4 sm:max-w-[14rem]",
                          habitCircleId
                            ? "text-white/80 hover:text-zinc-200"
                            : "text-zinc-600/90 drop-shadow-[0_0_4px_rgba(39,39,42,0.32)] animate-[goalLinkPulse_4.4s_ease-in-out_infinite]",
                        )}
                        trigger={
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            {habitCircleId ? (
                              <CircleDot
                                className="h-3.5 w-3.5 shrink-0 text-zinc-300"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className="truncate">
                              {habitCircleTriggerLabel}
                            </span>
                          </span>
                        }
                      >
                        <SelectContent
                          className={cn(
                            FAB_CREATION_SELECT_CONTENT_CLASS,
                            "w-full min-w-0 max-h-none",
                          )}
                        >
                          <SelectItem
                            value="__none__"
                            className={fabCreationSelectItemClass(
                              !habitCircleId,
                            )}
                          >
                            No Circle
                          </SelectItem>
                          {manageableCirclesLoading ? (
                            <SelectItem
                              value="__circles_loading"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              Loading circles…
                            </SelectItem>
                          ) : manageableCircles.length > 0 ? (
                            manageableCircles.map((circle) => (
                              <SelectItem
                                key={circle.id}
                                value={circle.id}
                                className={fabCreationSelectItemClass(
                                  habitCircleId === circle.id,
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <CircleDot
                                    className="h-4 w-4 text-zinc-300"
                                    aria-hidden="true"
                                  />
                                  <span>{circle.name}</span>
                                </div>
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem
                              value="__circles_empty"
                              disabled
                              className={fabCreationSelectItemClass(false)}
                            >
                              No managed circles yet
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 md:gap-4">
                    <div className="grid min-w-0 gap-2">
                      <Label htmlFor="habit-name" className="sr-only">
                        Habit name
                      </Label>
                      <Input
                        id="habit-name"
                        ref={habitNameInputRef}
                        value={habitName}
                        onChange={(e) =>
                          setHabitName(e.target.value.toUpperCase())
                        }
                        placeholder="Name your HABIT"
                        className="h-12 md:h-14 rounded-md !border-white/10 bg-white/[0.05] text-lg md:text-xl font-extrabold leading-tight placeholder:font-extrabold selection:bg-zinc-500/40 selection:text-white focus:!border-zinc-400/50 focus-visible:!border-zinc-400/50 focus-visible:ring-0"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="sr-only">Energy</Label>
                      <EnergyCycleButton
                        value={habitEnergy}
                        onChange={setHabitEnergy}
                        ariaLabel="Habit energy"
                        className="h-12 w-12 shrink-0 md:h-14 md:w-14"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        TYPE
                      </Label>
                      <Select
                        value={habitType}
                        onValueChange={setHabitType}
                        triggerClassName={cn(
                          "h-12 text-[11px] uppercase tracking-[0.12em] md:h-14",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        placeholder="Type"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {HABIT_TYPE_OPTIONS.filter(
                            (option) => option.label.toUpperCase() !== "RELAXER",
                          ).map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className={fabCreationSelectItemClass(
                                habitType === option.value,
                              )}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        RECURRENCE
                      </Label>
                      <Select
                        value={habitRecurrence}
                        onValueChange={setHabitRecurrence}
                        triggerClassName={cn(
                          "h-12 md:h-14 text-[11px] uppercase tracking-[0.12em]",
                          FAB_CREATION_SELECT_TRIGGER_CLASS,
                        )}
                        contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        placeholder="Recurrence"
                      >
                        <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                          {HABIT_RECURRENCE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className={fabCreationSelectItemClass(
                                habitRecurrence === option.value,
                              )}
                            >
                              {option.label === "NO SET CADENCE" ? "NONE" : option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-2 items-end">
                      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                        DURATION
                      </Label>
                      <div className="relative">
                        <button
                          type="button"
                          {...habitDurationTapHandlers}
                          ref={habitDurationTriggerRef}
                          className="flex h-12 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-sm text-white/80 shadow-[0_0_0_1px_rgba(148,163,184,0.08)] transition hover:border-white/20 touch-manipulation md:h-14"
                          aria-haspopup="dialog"
                          aria-expanded={showHabitDurationPicker}
                          aria-controls="habit-duration-picker"
                        >
                          <span className="flex h-9 w-9 flex-col items-center justify-center rounded-md bg-white/[0.08] md:h-11 md:w-11">
                            <Clock className="h-4 w-4 text-white/80 md:h-5 md:w-5" />
                            <span className="mt-0.5 text-[9px] font-semibold leading-none text-white/80 md:text-[10px]">
                              {Number.parseInt(habitDuration || "15", 10)}m
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500 drop-shadow-[0_0_6px_rgba(255,255,255,0.04)]">
                      SKILL
                    </Label>
                    <Select
                      value={habitSkillId ?? ""}
                      onOpenChange={handleSkillDropdownOpenChange}
                      onValueChange={(value) => {
                        setHabitSkillId(value);
                        const skill = findSkillById(value);
                        setSkillSearch(skill?.name ?? "");
                        setShowSkillFilters(false);
                      }}
                      placeholder="Link a skill"
                      triggerClassName="!h-12 md:!h-14 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                      contentWrapperClassName={cn(
                        FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                        "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                      )}
                      maxHeight={150}
                      openOnTriggerFocus
                      trigger={
                        <SkillTrigger
                          selectedId={habitSkillId ?? null}
                          onClearSelection={() => {
                            setHabitSkillId("");
                            setSkillSearch("");
                          }}
                        />
                      }
                    >
                      <SelectContent
                        className={cn(
                          FAB_CREATION_SELECT_CONTENT_CLASS,
                          "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                        )}
                      >
                        {showSkillFilters ? (
                          <div
                            ref={skillFilterMenuRef}
                            className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                          >
                            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                              <span className="text-sm font-semibold">
                                Filter Skills
                              </span>
                              <button
                                type="button"
                                onClick={() => setShowSkillFilters(false)}
                                className="text-xs text-white/80 underline-offset-4 hover:underline"
                              >
                                Close
                              </button>
                            </div>
                            <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Filter
                                  </div>
                                  <div className="space-y-2">
                                    <select
                                      value={skillFilterMonumentId}
                                      onChange={(e) =>
                                        setSkillFilterMonumentId(e.target.value)
                                      }
                                      className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                    >
                                      <option value="">
                                        {skillFilterMonumentId
                                          ? "Monument (clear)"
                                          : "Monument (any)"}
                                      </option>
                                      {monuments.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {(m.emoji ?? "✨") +
                                            " " +
                                            (m.title ?? "Monument")}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                    Quick actions
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSkillSearch("")}
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Reset search
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkillFilterMonumentId("")
                                      }
                                      className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {skillsLoading ? (
                          <div className="px-3 py-2 text-sm text-white/70" role="status">
                            Loading skills…
                          </div>
                        ) : filteredSkills.length > 0 ? (
                          renderGroupedSkillItems()
                        ) : (
                          <div className="px-3 py-2 text-sm text-white/70">
                            No skills found
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="habit-why" className="text-zinc-500">
                      WHY (optional)
                    </Label>
                    <Textarea
                      id="habit-why"
                      value={habitWhy}
                      onChange={(event) => setHabitWhy(event.target.value)}
                      placeholder="Add context…"
                      rows={2}
                      className="min-h-[68px] rounded-md border border-white/10 bg-white/[0.05] selection:bg-zinc-500/40 selection:text-white focus:border-zinc-400/50 focus-visible:border-zinc-400/50 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-none"
                    />
                  </div>

                  {showHabitDurationPicker && habitDurationPosition
                    ? createPortal(
                        <div
                          id="habit-duration-picker"
                          className="z-[2147483652] rounded-md border border-white/10 bg-black/90 p-3 shadow-xl backdrop-blur"
                          style={{
                            position: "absolute",
                            top: habitDurationPosition.top,
                            left: habitDurationPosition.left,
                            width: habitDurationPosition.width,
                            touchAction: "manipulation",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              type="button"
                              {...habitDurationMinusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              -
                            </button>
                            <div className="text-lg font-semibold text-white">
                              {habitDuration || 15} min
                            </div>
                            <button
                              type="button"
                              {...habitDurationPlusTapHandlers}
                              className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-lg font-bold text-white hover:border-white/30 touch-manipulation"
                            >
                              +
                            </button>
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              )}

              {selected === "GOAL" &&
                activeCreationMode === "projects" &&
                renderGoalProjectsPanel()}

              {selected === "GOAL" && activeCreationMode === "tags" &&
                renderTagPickerPanel({
                  label: "Goal Tags",
                  density: "compact",
                })}

              {selected === "PROJECT" &&
                activeCreationMode === "tasks" &&
                renderProjectTasksPanel()}

              {selected === "PROJECT" && activeCreationMode === "advanced" &&
                renderFlatAdvancedPanel({
                  dueDateId: "project-advanced-due-date",
                  dueDateValue: projectDue,
                  onDueDateChange: setProjectDue,
                  hasExactDate: projectHasExactDate,
                  onHasExactDateChange: setProjectHasExactDate,
                  exactDateId: "project-advanced-exact-date",
                  exactDateValue: projectExactDate,
                  onExactDateChange: setProjectExactDate,
                  exactStartTimeId: "project-advanced-exact-start-time",
                  exactStartTimeValue: projectExactStartTime,
                  onExactStartTimeChange: setProjectExactStartTime,
                  exactEndTimeId: "project-advanced-exact-end-time",
                  exactEndTimeValue: projectExactEndTime,
                  onExactEndTimeChange: setProjectExactEndTime,
                  tagLabel: "Project Tags",
                })}

              {selected === "TASK" && activeCreationMode === "advanced" &&
                renderFlatAdvancedPanel({
                  dueDateId: "task-advanced-due-date",
                  dueDateValue: taskDue,
                  onDueDateChange: setTaskDue,
                  hasExactDate: taskHasExactDate,
                  onHasExactDateChange: setTaskHasExactDate,
                  exactDateId: "task-advanced-exact-date",
                  exactDateValue: taskExactDate,
                  onExactDateChange: setTaskExactDate,
                  exactStartTimeId: "task-advanced-exact-start-time",
                  exactStartTimeValue: taskExactStartTime,
                  onExactStartTimeChange: setTaskExactStartTime,
                  exactEndTimeId: "task-advanced-exact-end-time",
                  exactEndTimeValue: taskExactEndTime,
                  onExactEndTimeChange: setTaskExactEndTime,
                  tagLabel: "Task Tags",
                })}

              {selected === "HABIT" && activeCreationMode === "memoForms" && (
                <div
                  className={cn(
                    "grid content-start gap-3 rounded-none px-0 py-2",
                    expanded && "min-h-full",
                  )}
                  style={secondaryCreationPanelStyle}
                >
                  <div className="grid gap-1">
                    <h3 className="text-sm font-semibold text-white">
                      Memo Forms
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        id: "note" as const,
                        label: "Note",
                        selected: memoCaptureActions.note,
                        disabled: false,
                      },
                      {
                        id: "form" as const,
                        label: "Form",
                        selected: memoCaptureActions.form,
                        disabled: false,
                      },
                      {
                        id: "photo" as const,
                        label: "Photo",
                        selected: memoCaptureActions.photo,
                        disabled: true,
                      },
                    ].map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        disabled={action.disabled}
                        aria-pressed={action.disabled ? undefined : action.selected}
                        onClick={() => {
                          if (action.id === "photo") return;
                          handleMemoCaptureActionToggle(action.id);
                        }}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition",
                          action.selected
                            ? "border-white/20 bg-zinc-900/70"
                            : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.04]",
                          action.disabled &&
                            "cursor-not-allowed border-white/10 bg-black/20 opacity-50 hover:border-white/10 hover:bg-black/20",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">
                            {action.label}
                          </span>
                          {action.selected ? (
                            <Check className="h-3.5 w-3.5 text-white/70" />
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                  {memoCaptureActions.note ? (
                    <div className="grid gap-1.5 rounded-md border border-white/10 bg-black/25 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-white">
                          {memoNoteDestinationType === "skill"
                            ? "Skill"
                            : "Monument"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Switch note destination to ${
                            memoNoteDestinationType === "skill"
                              ? "Monument"
                              : "Skill"
                          }`}
                          aria-pressed={memoNoteDestinationType === "monument"}
                          onClick={() =>
                            setMemoNoteDestinationType((current) =>
                              current === "skill" ? "monument" : "skill",
                            )
                          }
                          className="rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                        >
                          <span
                            className={cn(
                              "relative block h-5 w-9 rounded-full border border-white/15 bg-zinc-950 shadow-inner transition",
                              memoNoteDestinationType === "monument"
                                ? "border-white/15 bg-zinc-900"
                                : "border-white/10 bg-black",
                            )}
                            aria-hidden="true"
                          >
                            <span
                              className={cn(
                                "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-zinc-200 shadow-sm transition",
                                memoNoteDestinationType === "monument"
                                  ? "left-[17px]"
                                  : "left-0.5",
                              )}
                            />
                          </span>
                        </button>
                      </div>
                      {memoNoteDestinationType === "skill" ? (
                        <>
                          <Select
                            value={memoNoteSkillId ?? ""}
                            onOpenChange={handleSkillDropdownOpenChange}
                            onValueChange={(value) => {
                              setMemoNoteSkillId(value);
                              const skill = findSkillById(value);
                              setSkillSearch(skill?.name ?? "");
                              setShowSkillFilters(false);
                            }}
                            placeholder="Link a skill"
                            triggerClassName="!h-12 !border-none !bg-transparent !p-0 shadow-none focus-visible:ring-0"
                            contentWrapperClassName={cn(
                              FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS,
                              "w-full max-h-[150px] overflow-y-auto overscroll-contain",
                            )}
                            maxHeight={150}
                            openOnTriggerFocus
                            trigger={
                              <SkillTrigger
                                selectedId={memoNoteSkillId ?? null}
                                onClearSelection={() => {
                                  setMemoNoteSkillId("");
                                  setSkillSearch("");
                                }}
                              />
                            }
                          >
                            <SelectContent
                              className={cn(
                                FAB_CREATION_SELECT_CONTENT_CLASS,
                                "relative min-w-[220px] w-full max-h-none overflow-y-auto overscroll-contain",
                              )}
                            >
                              {showSkillFilters ? (
                                <div
                                  ref={skillFilterMenuRef}
                                  className="absolute inset-0 z-30 flex flex-col bg-black/95 backdrop-blur-md"
                                >
                                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 text-white">
                                    <span className="text-sm font-semibold">
                                      Filter Skills
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setShowSkillFilters(false)}
                                      className="text-xs text-white/80 underline-offset-4 hover:underline"
                                    >
                                      Close
                                    </button>
                                  </div>
                                  <div className="flex-1 overflow-auto px-3 py-3 text-sm text-white/85">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-3">
                                        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                          Filter
                                        </div>
                                        <div className="space-y-2">
                                          <select
                                            value={skillFilterMonumentId}
                                            onChange={(e) =>
                                              setSkillFilterMonumentId(
                                                e.target.value,
                                              )
                                            }
                                            className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 text-sm text-white"
                                          >
                                            <option value="">
                                              {skillFilterMonumentId
                                                ? "Monument (clear)"
                                                : "Monument (any)"}
                                            </option>
                                            {monuments.map((m) => (
                                              <option key={m.id} value={m.id}>
                                                {(m.emoji ?? "✨") +
                                                  " " +
                                                  (m.title ?? "Monument")}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="space-y-3">
                                        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                          Quick actions
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setSkillSearch("")}
                                            className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                          >
                                            Reset search
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setSkillFilterMonumentId("")
                                            }
                                            className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm transition hover:border-white/30"
                                          >
                                            Clear filters
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                              {skillsLoading ? (
                                <div
                                  className="px-3 py-2 text-sm text-white/70"
                                  role="status"
                                >
                                  Loading skills…
                                </div>
                              ) : filteredSkills.length > 0 ? (
                                renderGroupedSkillItems()
                              ) : (
                                <div className="px-3 py-2 text-sm text-white/70">
                                  No skills found
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                          {!memoNoteSkillId ? (
                            <p className="text-[10px] leading-snug text-white/35">
                              Choose a skill to save memo notes.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Select
                            value={memoNoteMonumentId}
                            onValueChange={setMemoNoteMonumentId}
                            placeholder="Choose a monument"
                            triggerClassName={cn(
                              "h-10 text-white",
                              FAB_CREATION_SELECT_TRIGGER_CLASS,
                            )}
                            contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                          >
                            <SelectContent
                              className={cn(
                                FAB_CREATION_SELECT_CONTENT_CLASS,
                                "min-w-[220px]",
                              )}
                            >
                              {monumentsLoading ? (
                                <SelectItem
                                  value="__loading"
                                  disabled
                                  className={fabCreationSelectItemClass(false)}
                                >
                                  Loading monuments…
                                </SelectItem>
                              ) : monuments.length > 0 ? (
                                monuments.map((monument) => (
                                  <SelectItem
                                    key={monument.id}
                                    value={monument.id}
                                    className={fabCreationSelectItemClass(
                                      memoNoteMonumentId === monument.id,
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>{monument.emoji ?? "🏛️"}</span>
                                      <span>{monument.title ?? "Monument"}</span>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <SelectItem
                                  value="__empty"
                                  disabled
                                  className={fabCreationSelectItemClass(false)}
                                >
                                  No monuments yet
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          {!memoNoteMonumentId ? (
                            <p className="text-[10px] leading-snug text-white/35">
                              Choose a monument to save memo notes.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                  {memoCaptureActions.form ? (
                    <div className="grid gap-2 rounded-md border border-white/10 bg-black/25 px-3 py-2.5">
                      <div className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5">
                        <Search className="h-3.5 w-3.5 text-white/45" />
                        <input
                          type="search"
                          value={memoFormSearch}
                          onChange={(event) =>
                            setMemoFormSearch(event.target.value)
                          }
                          placeholder="Search databases"
                          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-white outline-none placeholder:text-white/35"
                        />
                      </div>
                      {filteredMemoDatabaseTargets.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {filteredMemoDatabaseTargets.map((target) => {
                            const isSelected =
                              selectedMemoDatabaseTargetId === target.id;

                            return (
                              <button
                                key={target.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  setSelectedMemoDatabaseTargetId(target.id)
                                }
                                className={cn(
                                  "min-h-8 rounded-md border px-2.5 py-1.5 text-left text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                                  isSelected
                                    ? "border-white/25 bg-zinc-900 text-white"
                                    : "border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:bg-zinc-950 hover:text-white",
                                )}
                              >
                                {target.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="px-0.5 text-[10px] leading-snug text-white/35">
                          No databases found
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {selected === "HABIT" && activeCreationMode === "advanced" &&
                renderTagPickerPanel({
                  label: "Habit Advanced",
                  footer: (
                    <>
                      <div className="grid gap-2">
                        <p className={FAB_ADVANCED_LABEL_CLASS}>Exact time</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1.5">
                            <Label
                              htmlFor="habit-advanced-fixed-start-time"
                              className={FAB_ADVANCED_LABEL_CLASS}
                            >
                              Start time
                            </Label>
                            <Input
                              id="habit-advanced-fixed-start-time"
                              type="time"
                              value={habitFixedStartTime}
                              onChange={(event) =>
                                setHabitFixedStartTime(event.target.value)
                              }
                              className={FAB_ADVANCED_INPUT_CLASS}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label
                              htmlFor="habit-advanced-fixed-end-time"
                              className={FAB_ADVANCED_LABEL_CLASS}
                            >
                              End time
                            </Label>
                            <Input
                              id="habit-advanced-fixed-end-time"
                              type="time"
                              value={habitFixedEndTime}
                              onChange={(event) =>
                                setHabitFixedEndTime(event.target.value)
                              }
                              className={FAB_ADVANCED_INPUT_CLASS}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label
                          htmlFor="habit-advanced-location-context"
                          className={FAB_ADVANCED_LABEL_CLASS}
                        >
                          Location
                        </Label>
                        <Select
                          value={
                            habitLocationContextId ||
                            (locationContextsLoading
                              ? "__loading__"
                              : validLocationContexts.length > 0
                                ? "none"
                                : "__unavailable__")
                          }
                          onValueChange={(value) =>
                            setHabitLocationContextId(
                              value === "none" ||
                                value === "__loading__" ||
                                value === "__unavailable__"
                                ? ""
                                : value,
                            )
                          }
                          disabled={
                            locationContextsLoading ||
                            validLocationContexts.length === 0
                          }
                          contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                        >
                          <SelectTrigger
                            id="habit-advanced-location-context"
                            className={FAB_ADVANCED_SELECT_TRIGGER_CLASS}
                          >
                            <SelectValue placeholder="Anywhere" />
                          </SelectTrigger>
                          <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                            {locationContextsLoading ? (
                              <SelectItem
                                value="__loading__"
                                disabled
                                className={fabCreationSelectItemClass(false)}
                              >
                                Loading locations…
                              </SelectItem>
                            ) : validLocationContexts.length > 0 ? (
                              <>
                                <SelectItem
                                  value="none"
                                  className={fabCreationSelectItemClass(
                                    !habitLocationContextId,
                                  )}
                                >
                                  Anywhere
                                </SelectItem>
                                {validLocationContexts.map((context) => (
                                  <SelectItem
                                    key={context.id}
                                    value={context.id}
                                    className={fabCreationSelectItemClass(
                                      habitLocationContextId === context.id,
                                    )}
                                  >
                                    {context.label}
                                  </SelectItem>
                                ))}
                              </>
                            ) : (
                              <SelectItem
                                value="__unavailable__"
                                disabled
                                className={fabCreationSelectItemClass(false)}
                              >
                                Saved locations unavailable
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {locationContextsError ? (
                          <p className="text-[10px] text-white/45">
                            Using no location filter for now.
                          </p>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1.5">
                          <Label
                            htmlFor="habit-advanced-daylight"
                            className={FAB_ADVANCED_LABEL_CLASS}
                          >
                            Daylight
                          </Label>
                          <Select
                            value={habitDaylightPreference}
                            onValueChange={setHabitDaylightPreference}
                            contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                          >
                            <SelectTrigger
                              id="habit-advanced-daylight"
                              className={FAB_ADVANCED_SELECT_TRIGGER_CLASS}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                              {HABIT_DAYLIGHT_ADVANCED_OPTIONS.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  className={fabCreationSelectItemClass(
                                    habitDaylightPreference === option.value,
                                  )}
                                >
                              {option.label}
                            </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label
                            htmlFor="habit-advanced-window-edge"
                            className={FAB_ADVANCED_LABEL_CLASS}
                          >
                            Window edge
                          </Label>
                          <Select
                            value={habitWindowEdgePreference}
                            onValueChange={setHabitWindowEdgePreference}
                            contentWrapperClassName={FAB_CREATION_SELECT_CONTENT_WRAPPER_CLASS}
                          >
                            <SelectTrigger
                              id="habit-advanced-window-edge"
                              className={FAB_ADVANCED_SELECT_TRIGGER_CLASS}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className={FAB_CREATION_SELECT_CONTENT_CLASS}>
                              {HABIT_WINDOW_EDGE_ADVANCED_OPTIONS.map(
                                (option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                    className={fabCreationSelectItemClass(
                                      habitWindowEdgePreference ===
                                        option.value,
                                    )}
                                  >
                            {option.label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label
                          htmlFor="habit-advanced-next-due-override"
                          className={FAB_ADVANCED_LABEL_CLASS}
                        >
                          Next due
                        </Label>
                        <Input
                          id="habit-advanced-next-due-override"
                          type="datetime-local"
                          value={habitNextDueOverride}
                          onChange={(event) =>
                            setHabitNextDueOverride(event.target.value)
                          }
                          className={FAB_ADVANCED_INPUT_CLASS}
                        />
                      </div>
                    </>
                  ),
                })}
            </div>

            {saveError ? (
              <p className="text-xs text-red-300">{saveError}</p>
            ) : null}
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderSecondaryPage = () => (
    <div className="flex w-full flex-col px-4 py-2">
      {secondary.map((event) => (
        <motion.button
          key={event.label}
          variants={itemVariants}
          onClick={() => handleExtraClick(event.label)}
          className={cn(
            "w-full px-6 py-3 text-white font-medium transition-colors duration-200 border-b border-gray-700 last:border-b-0 hover:bg-gray-800 whitespace-nowrap",
            itemAlignmentClass,
          )}
        >
          <span className="text-sm opacity-80">add</span>{" "}
          <span className="text-lg font-bold">{event.label}</span>
        </motion.button>
      ))}
    </div>
  );

  const renderNexusPage = () => (
    <FabNexus
      query={searchQuery}
      onQueryChange={setSearchQuery}
      results={overlayPickerResults}
      isSearching={isSearching}
      isLoadingMore={isLoadingMore}
      error={searchError}
      hasMore={Boolean(searchCursor)}
      onLoadMore={handleLoadMoreResults}
      onSelectResult={handleOpenReschedule}
      inputRef={nexusInputRef}
      onManualPlaceResult={handleManualPlacement}
      filterMonumentId={overlayFilterMonumentId}
      onFilterMonumentChange={setOverlayFilterMonumentId}
      filterSkillId={overlayFilterSkillId}
      onFilterSkillChange={setOverlayFilterSkillId}
      filterEventType={overlayFilterEventType}
      onFilterEventTypeChange={setOverlayFilterEventType}
      sortMode={overlaySortMode}
      onSortModeChange={setOverlaySortMode}
      availableMonuments={monuments}
      availableSkills={skills}
      showToolbar
    />
  );

  const renderPage = (pageIndex: number) => {
    const page = pages[pageIndex];
    if (page === "primary") {
      return renderPrimaryPage();
    }
    if (page === "secondary") {
      return renderSecondaryPage();
    }
    return renderNexusPage();
  };

  const handleEventClick = (
    eventType: CreationType,
    triggerElement?: HTMLElement | null,
    options?: { skipLauncher?: boolean; originRect?: { top: number; left: number; width: number; height: number } | null },
  ) => {
    const shouldAttemptNameFocus = !editTarget;
    const shouldFocusImmediatelyForMobile =
      shouldAttemptNameFocus &&
      (isMobileViewport ||
        (typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 767px), (pointer: coarse)")
            .matches));
    // Ensure any in-progress drag state cannot leave the neighbor overlay visible.
    isDraggingRef.current = false;
    dragTargetPageRef.current = null;
    dragDirectionRef.current = null;
    pageDragAxisRef.current = null;
    setIsDragging(false);
    setDragTargetPage(null);
    setDragDirection(null);
    setIsAnimatingPageChange(false);
    pageX.set(0);

    if (options?.skipLauncher) {
      if (creationSelectionTimeoutRef.current !== null) {
        window.clearTimeout(creationSelectionTimeoutRef.current);
        creationSelectionTimeoutRef.current = null;
      }

      const updateSelection = () => {
        setIsOpen(false);
        setIsDirectCreationOpen(true);
        setPressedCreationType(null);
        setCreationSpawnOrigin(
          options.originRect
            ? {
                type: eventType,
                rect: options.originRect,
                nonce: Date.now(),
              }
            : null,
        );
        setCreationRevealGeometry(null);
        setPendingCreationNameFocus(
          shouldAttemptNameFocus && !shouldFocusImmediatelyForMobile
            ? eventType
            : null,
        );
        setExpanded(true);
        setSelected(eventType);
      };

      if (shouldFocusImmediatelyForMobile) {
        updateSelection();
        window.setTimeout(() => {
          focusCreationNameInput(eventType, {
            blurIfMobileKeyboardBlocked: true,
          });
        }, 0);
      } else {
        updateSelection();
      }
      return;
    }

    if (expanded) {
      const updateSelection = () => {
        setPressedCreationType(null);
        setCreationSpawnOrigin(
          options.originRect
            ? {
                type: eventType,
                rect: options.originRect,
                nonce: Date.now(),
              }
            : null,
        );
        setCreationRevealGeometry(null);
        setPendingCreationNameFocus(
          shouldAttemptNameFocus && !shouldFocusImmediatelyForMobile
            ? eventType
            : null,
        );
        setSelected(eventType);
      };
      if (shouldFocusImmediatelyForMobile) {
        updateSelection();
        window.setTimeout(() => {
          focusCreationNameInput(eventType, {
            blurIfMobileKeyboardBlocked: true,
          });
        }, 0);
      } else {
        updateSelection();
      }
      return;
    }

    if (creationSelectionTimeoutRef.current !== null) {
      window.clearTimeout(creationSelectionTimeoutRef.current);
      creationSelectionTimeoutRef.current = null;
    }

    const commitSelection = () => {
      creationSelectionTimeoutRef.current = null;
      setPressedCreationType(null);
      setCreationRevealGeometry(null);
      setPendingCreationNameFocus(
        shouldAttemptNameFocus && !shouldFocusImmediatelyForMobile
          ? eventType
          : null,
      );
      setExpanded(true);
      setSelected(eventType);
    };

    const triggerRect = getFabElementRect(triggerElement ?? null);
    const nextCreationSpawnOrigin =
      triggerRect && !editTarget
        ? {
            type: eventType,
            rect: triggerRect,
            nonce: Date.now(),
          }
        : null;
    if (shouldFocusImmediatelyForMobile) {
      setCreationSpawnOrigin(nextCreationSpawnOrigin);
      commitSelection();
      window.setTimeout(() => {
        focusCreationNameInput(eventType, {
          blurIfMobileKeyboardBlocked: true,
        });
      }, 0);
      return;
    }
    setCreationSpawnOrigin(nextCreationSpawnOrigin);
    setPressedCreationType(eventType);
    if (prefersReducedMotion) {
      commitSelection();
      return;
    }
    creationSelectionTimeoutRef.current = window.setTimeout(
      commitSelection,
      FAB_SELECTION_CONFIRM_MS,
    );
  };

  const handleEventClickRef = useRef(handleEventClick);
  useEffect(() => {
    handleEventClickRef.current = handleEventClick;
  });

  useEffect(() => {
    if (!creationRequest) return;
    if (handledCreationRequestIdRef.current === creationRequest.id) return;

    handledCreationRequestIdRef.current = creationRequest.id;
    openingCreationRequestIdRef.current = creationRequest.id;
    resetFabFormState();
    setProjectGoalId(creationRequest.goalId ?? null);
    if (creationRequest.type === "TASK") {
      setTaskProjectId(creationRequest.projectId ?? "");
    }
    setActiveCreationMode("main");
    handleEventClickRef.current(creationRequest.type, null, {
      skipLauncher: true,
      originRect: creationRequest.originRect ?? null,
    });
  }, [creationRequest, resetFabFormState]);

  useEffect(() => {
    if (!isOpen) return;
    openingCreationRequestIdRef.current = null;
    setIsDirectCreationOpen(false);
  }, [isOpen]);

  const handleExtraClick = (label: string) => {
    setIsOpen(false);
    if (label === "NOTE") {
      setShowNote(true);
    } else if (label === "POST") {
      setShowPost(true);
    } else if (label === "SERVICE" || label === "PRODUCT") {
      router.push(`/source?create=${label.toLowerCase()}`);
    } else {
      setComingSoon(label);
    }
  };

  const measureAiOverlayOrigin = useCallback((): FabAiOverlayOrigin => {
    if (typeof window === "undefined") {
      return FAB_AI_DEFAULT_ORIGIN;
    }

    const sourceNode =
      panelRef.current ?? menuRef.current ?? buttonRef.current ?? null;
    const sourceRect = sourceNode?.getBoundingClientRect();
    if (!sourceRect) {
      return FAB_AI_DEFAULT_ORIGIN;
    }

    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const targetWidth = Math.max(
      1,
      Math.min(720, viewportWidth * 0.92, viewportWidth - 32),
    );
    const targetHeight = Math.max(
      1,
      Math.min(viewportHeight * 0.85, viewportHeight - 32),
    );
    const targetLeft = Math.max(16, (viewportWidth - targetWidth) / 2);
    const targetTop = Math.max(16, (viewportHeight - targetHeight) / 2);
    const sourceStyle =
      sourceNode instanceof HTMLElement
        ? window.getComputedStyle(sourceNode)
        : null;

    return {
      top: sourceRect.top,
      left: sourceRect.left,
      width: sourceRect.width,
      height: sourceRect.height,
      targetTop,
      targetLeft,
      targetWidth,
      targetHeight,
      borderRadius:
        sourceStyle?.borderRadius ||
        (sourceRect.width <= 72 && sourceRect.height <= 72
          ? "9999px"
          : "12px"),
      borderColor:
        sourceStyle?.borderTopColor || FAB_AI_DEFAULT_ORIGIN.borderColor,
      backgroundColor:
        sourceStyle?.backgroundColor || FAB_AI_DEFAULT_ORIGIN.backgroundColor,
      backgroundImage:
        sourceStyle?.backgroundImage || FAB_AI_DEFAULT_ORIGIN.backgroundImage,
      boxShadow: sourceStyle?.boxShadow || FAB_AI_DEFAULT_ORIGIN.boxShadow,
    };
  }, []);

  const handleFabButtonClick = () => {
    if (!isOpen) {
      setPressedCreationType(null);
      setCreationSpawnOrigin(null);
      setCreationRevealGeometry(null);
      setIsDirectCreationOpen(false);
      setIsOpen(true);
      return;
    }
    setAiOverlayOrigin(measureAiOverlayOrigin());
    setIsOpen(false);
    setAiOpen(true);
  };

  useEffect(() => {
    if (!openOnMount || openOnMountConsumedRef.current) {
      return;
    }

    openOnMountConsumedRef.current = true;
    if (isOpen) {
      return;
    }

    setPressedCreationType(null);
    setCreationSpawnOrigin(null);
    setCreationRevealGeometry(null);
    setIsOpen(true);
  }, [isOpen, openOnMount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as Window & { __CREATOR_FAB_IS_OPEN__?: boolean }).__CREATOR_FAB_IS_OPEN__ =
      isOpen;
    if (!isOpen) return;
    window.dispatchEvent(new CustomEvent("tour:fab-opened"));
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleTourFabRequestClose = () => {
      setAiOpen(false);
      setIsOpen(false);
      const creatorWindow = window as Window & {
        __CREATOR_FAB_IS_OPEN__?: boolean;
        __CREATOR_FAB_AI_IS_OPEN__?: boolean;
      };
      creatorWindow.__CREATOR_FAB_IS_OPEN__ = false;
      creatorWindow.__CREATOR_FAB_AI_IS_OPEN__ = false;
    };
    window.addEventListener("tour:fab-request-close", handleTourFabRequestClose);
    return () => {
      window.removeEventListener("tour:fab-request-close", handleTourFabRequestClose);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as Window & { __CREATOR_FAB_AI_IS_OPEN__?: boolean }).__CREATOR_FAB_AI_IS_OPEN__ =
      aiOpen;
    if (!aiOpen) return;
    window.dispatchEvent(new CustomEvent("tour:fab-ai-opened"));
  }, [aiOpen]);

  useEffect(() => {
    if (!scopeMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        scopeMenuRef.current?.contains(target) ||
        scopeToggleRef.current?.contains(target)
      ) {
        return;
      }
      setScopeMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [scopeMenuOpen]);

  const handleRunAi = async (prompt?: string) => {
    const rawPrompt = typeof prompt === "string" ? prompt : aiPrompt;
    const trimmedPrompt = rawPrompt.trim();
    if (!trimmedPrompt) return;
    if (quotaExceeded) return;

    const isForced = typeof prompt === "string";
    const isAutoMode = isForced
      ? autoModeActive
      : autoModeActive || scopeSelection === "auto";
    const effectiveScope: AiScope = isForced
      ? aiScope
      : isAutoMode
        ? determineAutoScopeFromPrompt(trimmedPrompt)
        : (scopeSelection as AiScope);

    if (!isForced) {
      if (isAutoMode) {
        setScopeSelection("auto");
      } else {
        setScopeSelection(effectiveScope);
      }
      setAiScope(effectiveScope);
      setAutoModeActive(isAutoMode);
    }

    const userThreadMessage: AiThreadTextMessage = {
      id: createThreadMessageId(),
      role: "user",
      kind: "text",
      content: trimmedPrompt,
      ts: Date.now(),
    };
    const nextThread = [...aiThread, userThreadMessage];
    setAiThread(nextThread);
    const threadPayload: AiThreadPayload[] = nextThread
      .filter(isTextThreadMessage)
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));

    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    setAiPrompt("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          scope: effectiveScope,
          thread: threadPayload,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      console.log("ILAV payload debug:", {
        singleIntentType: payload?.intent?.type,
        intentsCount: Array.isArray(payload?.intents)
          ? payload.intents.length
          : null,
        intentTypes: Array.isArray(payload?.intents)
          ? payload.intents.map((i) => i.type)
          : null,
      });
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to fetch AI intent");
      }
      setAiResponse(payload);
      const assistantTextMessage = payload?.assistant_message
        ? {
            id: createThreadMessageId(),
            role: "assistant",
            kind: "text",
            content: payload.assistant_message,
            ts: Date.now(),
          }
        : null;
      const intents =
        Array.isArray(payload?.intents) && payload.intents.length
          ? payload.intents
          : payload?.intent
            ? [payload.intent]
            : [];
      const proposalIntents = intents.filter((intent) =>
        PROPOSAL_CARD_TYPES.includes(intent.type),
      );
      const proposalMessages =
        payload && proposalIntents.length
          ? proposalIntents.map((intent) => ({
              id: createThreadMessageId(),
              role: "assistant",
              kind: "proposal",
              ai: { ...payload, intent },
              ts: Date.now(),
            }))
          : [];

      setAiThread((prev) => {
        const updated = [...prev];
        if (assistantTextMessage) {
          updated.push(assistantTextMessage);
        }
        if (proposalMessages.length) {
          updated.push(...proposalMessages);
        }
        return updated;
      });
      if (proposalMessages.length) {
        setProposalFormState((prev) => {
          const updated = { ...prev };
          proposalMessages.forEach((proposalMessage) => {
            updated[proposalMessage.id] = buildInitialProposalFormValues(
              proposalMessage.ai.intent.draft ?? undefined,
              undefined,
              proposalMessage.ai.intent.type,
            );
          });
          return updated;
        });
      }
    } catch (error) {
      const isAbort =
        (error instanceof DOMException && error.name === "AbortError") ||
        (error as { name?: string })?.name === "AbortError";
      if (isAbort) {
        console.error("ILAV overlay timeout", error);
        setAiError("ILAV timed out. Try again (or send a shorter message).");
      } else {
        console.error("ILAV overlay error", error);
        setAiError(
          error instanceof Error ? error.message : "Unable to reach ILAV",
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setAiLoading(false);
    }
  };

  const handleProposalFieldChange = (
    messageId: string,
    field: string,
    value: string,
  ) => {
    setProposalFormState((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [field]: value,
      },
    }));
  };

  const handleSchedulerOpsOverridesChange = useCallback(
    (messageId: string, ops: AiSchedulerOp[] | undefined) => {
      setProposalFormState((prev) => {
        const updated = { ...prev };
        const entry = { ...(updated[messageId] ?? {}) };
        const opsArr = normalizeSchedulerOps(ops);
        if (opsArr.length > 0) {
          entry.schedulerOpsOverrides = opsArr.map(cloneSchedulerOp);
        } else {
          delete entry.schedulerOpsOverrides;
        }
        updated[messageId] = entry;
        return updated;
      });
    },
    [],
  );

  const getDraftValuesForMessage = (
    message: AiThreadProposalMessage,
  ): Record<string, string> => {
    const baseDraft = message.ai.intent.draft ?? {};
    const overrideDraft = message.overrides?.draft ?? {};
    const formDraft = proposalFormState[message.id] ?? {};
    const keys = new Set<string>([
      ...Object.keys(baseDraft),
      ...Object.keys(overrideDraft),
      ...Object.keys(formDraft),
    ]);
    const finalDraft: Record<string, string> = {};
    keys.forEach((key) => {
      const formValue = formDraft[key];
      if (typeof formValue === "string") {
        finalDraft[key] = formValue;
        return;
      }
      if (overrideDraft[key] !== undefined) {
        finalDraft[key] = overrideDraft[key];
        return;
      }
      const baseValue = baseDraft[key];
      finalDraft[key] =
        baseValue === undefined || baseValue === null ? "" : String(baseValue);
    });
    return finalDraft;
  };

  const getSchedulerOpsOverridesForMessage = (
    messageId: string,
  ): AiSchedulerOp[] | undefined => {
    const entry = proposalFormState[messageId];
    if (!entry) return undefined;
    const candidate = entry.schedulerOpsOverrides;
    if (!Array.isArray(candidate)) return undefined;
    return candidate as AiSchedulerOp[];
  };

  const handleSaveProposalEdits = async (message: AiThreadProposalMessage) => {
    const finalDraft = getDraftValuesForMessage(message);
    const overrideOpsCandidate = message.overrides?.schedulerOps;
    const overrideOpsFromMessage = Array.isArray(overrideOpsCandidate)
      ? overrideOpsCandidate
      : undefined;
    const overrideOps =
      getSchedulerOpsOverridesForMessage(message.id) ?? overrideOpsFromMessage;
    setAiThread((prev) =>
      prev.map((entry) => {
        if (entry.kind !== "proposal" || entry.id !== message.id) {
          return entry;
        }
        const nextOverrides = {
          ...entry.overrides,
          draft: finalDraft,
        };
        if (overrideOps && overrideOps.length > 0) {
          nextOverrides.schedulerOps = overrideOps;
        } else {
          nextOverrides.schedulerOps = undefined;
        }
        return {
          ...entry,
          overrides: nextOverrides,
        };
      }),
    );

    const intentPayload: Record<string, unknown> = {
      ...message.ai.intent,
      draft: finalDraft,
    };
    const intentOps = normalizeSchedulerOps(message.ai.intent.ops);
    const ops = overrideOps ?? intentOps;
    if (ops.length > 0) {
      intentPayload.ops = ops;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/ai/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: message.ai.scope,
          intent: intentPayload,
          idempotency_key: message.id,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message ?? payload?.error ?? "Failed to apply proposal",
        );
      }
      const appliedMessage =
        typeof payload?.message === "string"
          ? payload.message
          : "Proposal applied";
      toast.success("AI proposal applied", appliedMessage);
      setAiThread((prev) => [
        ...prev.filter((entry) => entry.id !== message.id),
        {
          id: createThreadMessageId(),
          role: "assistant",
          kind: "text",
          content: appliedMessage,
          ts: Date.now(),
        },
      ]);
      setProposalFormState((prev) => {
        const updated = { ...prev };
        delete updated[message.id];
        return updated;
      });
      router.refresh();
    } catch (error) {
      console.error("AI proposal apply error", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to apply proposal";
      setAiError(errorMessage);
      toast.error("Unable to apply proposal", errorMessage);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendEditedProposal = (message: AiThreadProposalMessage) => {
    const finalDraft = getDraftValuesForMessage(message);
    const payload: Record<string, unknown> = {
      type: message.ai.intent.type,
    };
    if (Object.keys(finalDraft).length > 0) {
      payload.draft = finalDraft;
    }
    const overrideOpsCandidate = message.overrides?.schedulerOps;
    const overrideOpsFromMessage = Array.isArray(overrideOpsCandidate)
      ? overrideOpsCandidate
      : undefined;
    const overrideOps =
      getSchedulerOpsOverridesForMessage(message.id) ?? overrideOpsFromMessage;
    const intentOps = normalizeSchedulerOps(message.ai.intent.ops);
    const ops = overrideOps ?? intentOps;
    if (ops.length > 0) {
      payload.ops = ops;
    }
    const approvedPrompt = `APPROVED_PROPOSAL_JSON: ${JSON.stringify(payload)}`;
    void handleRunAi(approvedPrompt);
  };

  const toggleOpsPreview = (messageId: string) => {
    setOpsPreviewOpenById((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const interpretWheelGesture = (deltaY: number) => {
    if (deltaY < -VERTICAL_WHEEL_TRIGGER) {
      setIsOpen(true);
      return true;
    }
    return false;
  };

  const handleFabButtonTouchStart = (
    event: React.TouchEvent<HTMLButtonElement>,
  ) => {
    if (!swipeUpToOpen) return;
    setTouchStartY(event.touches[0].clientY);
  };

  const handleFabButtonTouchEnd = (
    event: React.TouchEvent<HTMLButtonElement>,
  ) => {
    if (!swipeUpToOpen || touchStartY === null) return;
    const diffY = event.changedTouches[0].clientY - touchStartY;
    setTouchStartY(null);
    if (diffY < -40 && !isOpen) {
      setIsOpen(true);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  };

  const handleFabButtonTouchCancel = () => {
    if (!swipeUpToOpen) return;
    setTouchStartY(null);
  };

  const handleFabButtonWheel = (event: React.WheelEvent<HTMLButtonElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleOpenReschedule = (result: FabSearchResult) => {
    if (result.type === "PROJECT" && result.isCompleted) {
      return;
    }
    setRescheduleTarget(result);
    setDeleteError(null);
    setRescheduleError(
      result.scheduleInstanceId
        ? null
        : "This event has no upcoming scheduled time.",
    );
    const baseDate = result.nextScheduledAt
      ? new Date(result.nextScheduledAt)
      : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      const now = new Date();
      setRescheduleDate(formatDateInput(now));
      setRescheduleTime(formatTimeInput(now));
      return;
    }
    setRescheduleDate(formatDateInput(baseDate));
    setRescheduleTime(formatTimeInput(baseDate));
  };

  const handleManualPlacement = (
    result: FabSearchResult,
    pointer?: DragPointerInfo,
  ) => {
    if (result.type === "PROJECT" && result.isCompleted) return;
    if (!result.scheduleInstanceId) {
      toast.error(
        "Manual placement unavailable",
        "This item has no scheduled instance to move yet.",
      );
      return;
    }

    const safeDuration =
      typeof result.durationMinutes === "number" &&
      Number.isFinite(result.durationMinutes) &&
      result.durationMinutes > 0
        ? result.durationMinutes
        : 60;

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("schedule:manual-placement-requested", {
          detail: {
            result: { ...result, durationMinutes: safeDuration },
            source: "fab-nexus",
            pointer,
          },
        }),
      );
    }

    closeExpandedPanel({ notifyEditClose: false });
    setAiOpen(false);
    setOverlayOpen(false);
    setOverlayPickerOpen(false);
    setRescheduleTarget(null);
  };

  const scrollFabTextEntryIntoView = useCallback((element: HTMLElement) => {
    if (typeof window === "undefined") return;

    const scrollBody =
      panelRef.current?.querySelector<HTMLElement>("[data-fab-scroll-body]") ??
      panelRef.current;

    if (!scrollBody || !scrollBody.contains(element)) return;

    const alignInsideFabScrollBody = () => {
      if (!scrollBody.isConnected || !element.isConnected) return;

      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const bodyRect = scrollBody.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const topLimit = Math.max(bodyRect.top, 0) + 16;
      const bottomLimit = Math.min(bodyRect.bottom, viewportHeight) - 20;

      if (bottomLimit <= topLimit) return;

      if (elementRect.bottom > bottomLimit) {
        scrollBody.scrollTop += elementRect.bottom - bottomLimit;
        return;
      }

      if (elementRect.top < topLimit) {
        scrollBody.scrollTop -= topLimit - elementRect.top;
      }
    };

    window.requestAnimationFrame(alignInsideFabScrollBody);
    window.setTimeout(alignInsideFabScrollBody, 80);
    window.setTimeout(alignInsideFabScrollBody, FAB_KEYBOARD_SETTLE_MS);
  }, []);

  const focusFabTextEntryWithoutViewportScroll = useCallback(
    (element: HTMLElement) => {
      if (typeof window === "undefined") {
        element.focus();
        return;
      }

      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      element.focus({ preventScroll: true });
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
      });
      scrollFabTextEntryIntoView(element);
    },
    [scrollFabTextEntryIntoView],
  );

  const handleMenuWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!swipeUpToOpen) return;
    if (interpretWheelGesture(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleExpandedPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!expanded) return;
      const textEntry = getFabTextEntryTarget(event.target);
      if (!textEntry || !panelRef.current?.contains(textEntry)) return;

      if (event.pointerType && event.pointerType !== "mouse") {
        if (!isFabKeyboardTextEntryElement(textEntry)) {
          return;
        }
        if (document.activeElement !== textEntry) {
          event.preventDefault();
          focusFabTextEntryWithoutViewportScroll(textEntry);
        }
        return;
      }

      focusFabTextEntryWithoutViewportScroll(textEntry);
    },
    [expanded, focusFabTextEntryWithoutViewportScroll],
  );

  useEffect(() => {
    if (!expanded) return;

    const handleFocusIn = (event: FocusEvent) => {
      const textEntry = getFabTextEntryTarget(event.target);
      if (!textEntry || !panelRef.current?.contains(textEntry)) return;
      scrollFabTextEntryIntoView(textEntry);
    };

    document.addEventListener("focusin", handleFocusIn, true);
    return () => document.removeEventListener("focusin", handleFocusIn, true);
  }, [expanded, scrollFabTextEntryIntoView]);

  useEffect(() => {
    if (selected !== "PROJECT") return;
    let cancelled = false;
    const loadGoals = async () => {
      try {
        setGoalsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const manageableCircleIds = manageableCircles
          .map((circle) => circle.id)
          .filter((circleId): circleId is string => Boolean(circleId));
        const circleGoalsRequest =
          manageableCircleIds.length > 0
            ? supabase
                .from("goals")
                .select(
                  "id, name, emoji, priority, energy, priority_code, energy_code, why, created_at, active, status, monument_id, circle_id, roadmap_id, weight, weight_boost, due_date, monument:monuments(emoji)",
                )
                .eq("user_id", user.id)
                .in("circle_id", manageableCircleIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null });
        const [goalsData, circleGoalsResp, monumentsResp] = await Promise.all([
          getGoalsForUser(user.id),
          circleGoalsRequest,
          supabase
            .from("monuments")
            .select("id, emoji")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
        ]);
        if (circleGoalsResp.error) throw circleGoalsResp.error;
        if (!cancelled) {
          const map = new Map<string, string | null>();
          monumentsResp.data?.forEach((m) => {
            if (m.id) {
              map.set(m.id, m.emoji ?? null);
            }
          });
          setMonumentEmojiMap(map);
          const mergedGoals = new Map<string, Goal>();
          const manageableCircleIdSet = new Set(manageableCircleIds);
          const addGoals = (items: Goal[]) => {
            items.forEach((goal) => {
              if (!mergedGoals.has(goal.id)) {
                mergedGoals.set(goal.id, goal);
              }
            });
          };
          const circleGoals = (
            (circleGoalsResp.data ?? []) as (Goal & {
              monument?: { emoji?: string | null } | null;
            })[]
          ).map(({ monument, ...goal }) => ({
            ...goal,
            monumentEmoji: monument?.emoji ?? null,
          }));
          addGoals(
            goalsData.filter(
              (goal) =>
                !goal.circle_id || manageableCircleIdSet.has(goal.circle_id),
            ),
          );
          addGoals(circleGoals);
          setGoals(
            Array.from(mergedGoals.values()).map((goal) => ({
              ...goal,
              monumentEmoji:
                goal.monumentEmoji ??
                map.get(goal.monument_id ?? "") ??
                null,
            })),
          );
        }
      } catch (error) {
        console.error("Failed to load goals", error);
        if (!cancelled) {
          setGoals([]);
          setMonumentEmojiMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setGoalsLoading(false);
        }
      }
    };
    void loadGoals();
    return () => {
      cancelled = true;
    };
  }, [manageableCircles, selected]);

  useEffect(() => {
    const shouldLoadMonuments =
      selected === "GOAL" ||
      selected === "PROJECT" ||
      overlayOpen ||
      overlayPickerOpen ||
      FAB_PAGES[activeFabPage] === "nexus";
    if (!shouldLoadMonuments) return;
    let cancelled = false;
    const loadMonuments = async () => {
      try {
        setMonumentsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setMonumentsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setMonumentsLoading(false);
          return;
        }
        const monumentsData = await getMonumentsForUser(user.id);
        if (!cancelled) {
          setMonuments(monumentsData);
          setGoalMonumentId((current) =>
            current && monumentsData.some((m) => m.id === current)
              ? current
              : "",
          );
        }
      } catch (error) {
        console.error("Failed to load monuments", error);
        if (!cancelled) {
          setMonuments([]);
        }
      } finally {
        if (!cancelled) {
          setMonumentsLoading(false);
        }
      }
    };
    void loadMonuments();
    return () => {
      cancelled = true;
    };
  }, [activeFabPage, overlayOpen, overlayPickerOpen, selected]);

  useEffect(() => {
    if (selected !== "GOAL" && selected !== "PROJECT" && selected !== "HABIT") {
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    const loadManageableCircles = async () => {
      try {
        setManageableCirclesLoading(true);
        const response = await fetch("/api/circles", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to load Circles.");
        }
        const payload = (await response.json()) as {
          circles?: GoalCircleOption[];
        };
        const circles = (payload.circles ?? []).filter((circle) =>
          GOAL_MANAGEABLE_CIRCLE_ROLES.has(
            circle.viewerRole?.trim().toUpperCase() ?? "",
          ),
        );
        if (!cancelled) {
          setManageableCircles(circles);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load manageable circles", error);
        if (!cancelled) {
          setManageableCircles([]);
        }
      } finally {
        if (!cancelled) {
          setManageableCirclesLoading(false);
        }
      }
    };

    void loadManageableCircles();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "TASK") return;
    let cancelled = false;
    const loadProjects = async () => {
      try {
        setTaskProjectsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setTaskProjectsLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setTaskProjectsLoading(false);
          return;
        }
        const projectsData = await getProjectsForUser(user.id);
        if (!cancelled) {
          setTaskProjects(projectsData ?? []);
          setTaskProjectId((current) =>
            current && projectsData.some((p) => p.id === current)
              ? current
              : "",
          );
        }
      } catch (error) {
        console.error("Failed to load projects for tasks", error);
        if (!cancelled) {
          setTaskProjects([]);
        }
      } finally {
        if (!cancelled) {
          setTaskProjectsLoading(false);
        }
      }
    };
    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (selected !== "GOAL") return;
    let cancelled = false;
    const loadGoalCampaigns = async () => {
      try {
        setGoalCampaignsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          if (!cancelled) {
            setGoalCampaigns([]);
            setGoalCampaignsLoading(false);
          }
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setGoalCampaigns([]);
            setGoalCampaignsLoading(false);
          }
          return;
        }
        const { data, error } = await supabase
          .from("campaigns")
          .select(
            "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, scheduling_state, position",
          )
          .eq("user_id", user.id)
          .order("position", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });
        if (error) {
          throw error;
        }
        if (!cancelled) {
          const loadedCampaigns = (data ?? []) as GoalCampaignOption[];
          setGoalCampaigns((current) => {
            const loadedIds = new Set(
              loadedCampaigns.map((campaign) => campaign.id),
            );
            const hydratedCampaigns = current.filter(
              (campaign) => !loadedIds.has(campaign.id),
            );
            return [...loadedCampaigns, ...hydratedCampaigns];
          });
        }
      } catch (error) {
        console.error("Failed to load goal campaigns", error);
        if (!cancelled) {
          setGoalCampaigns([]);
        }
      } finally {
        if (!cancelled) {
          setGoalCampaignsLoading(false);
        }
      }
    };
    void loadGoalCampaigns();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const goalCampaignOptions = useMemo(() => {
    const campaigns = [...goalCampaigns];
    if (goalRelationType === "CIRCLE" && goalCircleId) {
      return campaigns
        .filter(
          (campaign) =>
            campaign.primary_circle_id === goalCircleId ||
            campaign.id === goalCampaignId,
        )
        .sort((a, b) => {
          const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
          const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
          if (aPosition !== bPosition) {
            return aPosition - bPosition;
          }
          return a.name.localeCompare(b.name);
        });
    }
    campaigns.sort((a, b) => {
      const aMatches =
        goalRelationType === "MONUMENT" &&
        a.primary_monument_id === goalMonumentId;
      const bMatches =
        goalRelationType === "MONUMENT" &&
        b.primary_monument_id === goalMonumentId;
      if (aMatches !== bMatches) {
        return aMatches ? -1 : 1;
      }
      const aPosition = a.position ?? Number.MAX_SAFE_INTEGER;
      const bPosition = b.position ?? Number.MAX_SAFE_INTEGER;
      if (aPosition !== bPosition) {
        return aPosition - bPosition;
      }
      return a.name.localeCompare(b.name);
    });
    return campaigns;
  }, [
    goalCampaignId,
    goalCampaigns,
    goalMonumentId,
    goalRelationType,
    goalCircleId,
  ]);

  useEffect(() => {
    setGoalCampaignCreateError(null);
  }, [goalMonumentId, goalCircleId]);

  const resetGoalCampaignInlineCreation = useCallback(() => {
    setIsCreatingGoalCampaignInline(false);
    setGoalInlineCampaignName("");
    setGoalInlineCampaignEmoji(FAB_DEFAULT_CAMPAIGN_EMOJI);
    setGoalCampaignCreateError(null);
    setGoalCampaignCreating(false);
  }, []);

  const selectedGoalRelationValue =
    goalRelationType && goalRelationId
      ? `${goalRelationType}:${goalRelationId}`
      : "";

  const selectedGoalRelationLabel = useMemo(() => {
    if (goalRelationType === "MONUMENT" && goalRelationId) {
      return (
        monuments.find((monument) => monument.id === goalRelationId)?.title ??
        "Link to MONUMENT / CIRCLE +"
      );
    }
    if (goalRelationType === "CIRCLE" && goalRelationId) {
      return (
        manageableCircles.find((circle) => circle.id === goalRelationId)
          ?.name ?? "Link to MONUMENT / CIRCLE +"
      );
    }
    return "Link to MONUMENT / CIRCLE +";
  }, [goalRelationId, goalRelationType, manageableCircles, monuments]);

  const handleGoalRelationChange = useCallback(
    (value: string) => {
      resetGoalCampaignInlineCreation();
      setSaveError(null);

      if (!value) {
        setGoalRelationType(null);
        setGoalRelationId("");
        setGoalMonumentId("");
        setGoalCircleId("");
        return;
      }

      const [rawType, relationId] = value.split(":");
      if (
        (rawType !== "MONUMENT" && rawType !== "CIRCLE") ||
        !relationId
      ) {
        return;
      }

      setGoalRelationType(rawType);
      setGoalRelationId(relationId);
      if (rawType === "MONUMENT") {
        setGoalMonumentId(relationId);
        setGoalCircleId("");
        return;
      }

      setGoalCircleId(relationId);
      setGoalMonumentId("");
    },
    [resetGoalCampaignInlineCreation],
  );

  const resolveSelectedGoalRelation =
    useCallback((): GoalRelationResolution => {
      if (!goalRelationType || !goalRelationId) {
        return {
          selectedMonumentId: null,
          selectedCircleId: null,
          error: "Link this goal to a Monument or Circle before saving.",
        };
      }

      if (goalRelationType === "MONUMENT") {
        if (!goalMonumentId) {
          return {
            selectedMonumentId: null,
            selectedCircleId: null,
            error: "Link this goal to a monument before saving.",
          };
        }
        if (!isValidUuid(goalMonumentId)) {
          return {
            selectedMonumentId: null,
            selectedCircleId: null,
            error: "Link this goal to a valid monument before saving.",
          };
        }
        return {
          selectedMonumentId: goalMonumentId,
          selectedCircleId: null,
          error: null,
        };
      }

      if (!goalCircleId) {
        return {
          selectedMonumentId: null,
          selectedCircleId: null,
          error: "Link this goal to a circle before saving.",
        };
      }
      if (!isValidUuid(goalCircleId)) {
        return {
          selectedMonumentId: null,
          selectedCircleId: null,
          error: "Link this goal to a valid circle before saving.",
        };
      }
      return {
        selectedMonumentId: null,
        selectedCircleId: goalCircleId,
        error: null,
      };
    }, [goalCircleId, goalMonumentId, goalRelationId, goalRelationType]);

  const handleCreateGoalCampaignInline = useCallback(async () => {
    if (goalCampaignCreating) {
      return;
    }

    const campaignName = collapseWhitespace(goalInlineCampaignName);
    const campaignEmoji =
      goalInlineCampaignEmoji.trim() || FAB_DEFAULT_CAMPAIGN_EMOJI;
    if (!campaignName) {
      setGoalCampaignCreateError("Name the campaign first.");
      return;
    }
    if (!goalRelationType || !goalRelationId) {
      setGoalCampaignCreateError(
        "Link a Monument or Circle before creating a campaign.",
      );
      return;
    }

    const selectedMonumentId =
      goalRelationType === "MONUMENT" ? goalMonumentId : null;
    const selectedCircleId =
      goalRelationType === "CIRCLE" ? goalCircleId : null;

    if (
      goalRelationType === "MONUMENT" &&
      (!selectedMonumentId || !isValidUuid(selectedMonumentId))
    ) {
      setGoalCampaignCreateError(
        "Link a valid Monument before creating a campaign.",
      );
      return;
    }
    if (
      goalRelationType === "CIRCLE" &&
      (!selectedCircleId || !isValidUuid(selectedCircleId))
    ) {
      setGoalCampaignCreateError(
        "Link a valid Circle before creating a campaign.",
      );
      return;
    }

    try {
      setGoalCampaignCreating(true);
      setGoalCampaignCreateError(null);

      const supabase = getSupabaseBrowser();
      if (!supabase) {
        throw new Error("Supabase client not available");
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        throw new Error("Sign in before creating a campaign.");
      }

      let roadmapId: string | null = null;
      if (selectedMonumentId) {
        const { data: existingRoadmap, error: roadmapError } = await supabase
          .from("roadmaps")
          .select("id")
          .eq("user_id", user.id)
          .eq("monument_id", selectedMonumentId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (roadmapError) throw roadmapError;

        roadmapId =
          typeof existingRoadmap?.id === "string" ? existingRoadmap.id : null;
        if (!roadmapId) {
          const monument = monuments.find(
            (item) => item.id === selectedMonumentId,
          );
          const { data: createdRoadmap, error: createRoadmapError } =
            await supabase
              .from("roadmaps")
              .insert({
                user_id: user.id,
                monument_id: selectedMonumentId,
                title: monument?.title
                  ? `${monument.title} Roadmap`
                  : "True Roadmap",
                emoji: monument?.emoji ?? null,
              })
              .select("id")
              .single();
          if (createRoadmapError) throw createRoadmapError;
          roadmapId =
            typeof createdRoadmap?.id === "string" ? createdRoadmap.id : null;
        }
      } else if (selectedCircleId) {
        const { data: existingRoadmap, error: roadmapError } = await supabase
          .from("roadmaps")
          .select("id")
          .eq("user_id", user.id)
          .eq("circle_id", selectedCircleId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (roadmapError) throw roadmapError;

        roadmapId =
          typeof existingRoadmap?.id === "string" ? existingRoadmap.id : null;
        if (!roadmapId) {
          const circle = manageableCircles.find(
            (item) => item.id === selectedCircleId,
          );
          const { data: createdRoadmap, error: createRoadmapError } =
            await supabase
              .from("roadmaps")
              .insert({
                user_id: user.id,
                circle_id: selectedCircleId,
                monument_id: null,
                title: circle?.name
                  ? `${circle.name} Roadmap`
                  : "Circle Roadmap",
                emoji: null,
              })
              .select("id")
              .single();
          if (createRoadmapError) throw createRoadmapError;
          roadmapId =
            typeof createdRoadmap?.id === "string" ? createdRoadmap.id : null;
        }
      }

      if (!roadmapId) {
        throw new Error(
          selectedCircleId
            ? "Unable to resolve the circle roadmap."
            : "Unable to resolve the monument roadmap.",
        );
      }

      const campaignContextFilter = selectedCircleId
        ? `roadmap_id.eq.${roadmapId},primary_circle_id.eq.${selectedCircleId}`
        : `roadmap_id.eq.${roadmapId},primary_monument_id.eq.${selectedMonumentId}`;
      const { data: contextCampaignRows, error: contextCampaignsError } =
        await supabase
          .from("campaigns")
          .select(
            "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, scheduling_state, position",
          )
          .eq("user_id", user.id)
          .or(campaignContextFilter);
      if (contextCampaignsError) throw contextCampaignsError;

      const contextCampaigns =
        (contextCampaignRows ?? []) as GoalCampaignOption[];
      const normalizedCampaignName = campaignName.toLocaleLowerCase();
      const duplicateCampaign = [...contextCampaigns, ...goalCampaigns].find(
        (campaign) => {
          const belongsToCurrentContext =
            campaign.roadmap_id === roadmapId ||
            (selectedCircleId
              ? campaign.primary_circle_id === selectedCircleId
              : campaign.primary_monument_id === selectedMonumentId);
          return (
            belongsToCurrentContext &&
            collapseWhitespace(campaign.name).toLocaleLowerCase() ===
              normalizedCampaignName
          );
        },
      );
      if (duplicateCampaign) {
        setGoalCampaigns((current) =>
          current.some((item) => item.id === duplicateCampaign.id)
            ? current
            : [...current, duplicateCampaign],
        );
        setGoalCampaignId(duplicateCampaign.id);
        resetGoalCampaignInlineCreation();
        return;
      }

      const { data: roadmapItemRows, error: roadmapItemsError } =
        await supabase
          .from("roadmap_items")
          .select("position")
          .eq("user_id", user.id)
          .eq("roadmap_id", roadmapId)
          .order("position", { ascending: false })
          .limit(1);
      if (roadmapItemsError) throw roadmapItemsError;
      const lastPosition = Number(roadmapItemRows?.[0]?.position ?? 0);
      const nextPosition =
        Number.isFinite(lastPosition) && lastPosition > 0
          ? lastPosition + 1
          : 1;

      const campaign = await createCampaign(user.id, {
        roadmapId,
        primaryMonumentId: selectedMonumentId,
        primaryCircleId: selectedCircleId,
        name: campaignName,
        emoji: campaignEmoji,
        schedulingState: "ACTIVE",
        position: nextPosition,
      });
      await addCampaignToRoadmap(user.id, {
        roadmapId,
        campaignId: campaign.id,
        position: nextPosition,
      });

      const newOption: GoalCampaignOption = {
        id: campaign.id,
        name: campaign.name,
        emoji: campaign.emoji,
        roadmap_id: roadmapId,
        primary_monument_id: campaign.primary_monument_id,
        primary_circle_id: campaign.primary_circle_id ?? null,
        scheduling_state: campaign.scheduling_state,
        position: campaign.position,
      };
      setGoalCampaigns((current) =>
        current.some((item) => item.id === newOption.id)
          ? current
          : [...current, newOption],
      );
      setGoalCampaignId(campaign.id);
      resetGoalCampaignInlineCreation();
    } catch (error) {
      console.error("Failed to create campaign from FAB", error);
      setGoalCampaignCreateError(
        error instanceof Error
          ? error.message
          : "Campaign could not be created.",
      );
    } finally {
      setGoalCampaignCreating(false);
    }
  }, [
    goalCampaignCreating,
    goalCampaigns,
    goalInlineCampaignEmoji,
    goalInlineCampaignName,
    goalCircleId,
    goalMonumentId,
    goalRelationId,
    goalRelationType,
    manageableCircles,
    monuments,
    resetGoalCampaignInlineCreation,
  ]);

  useEffect(() => {
    const shouldLoadSkills =
      selected === "GOAL" ||
      selected === "HABIT" ||
      selected === "PROJECT" ||
      selected === "TASK" ||
      overlayOpen ||
      overlayPickerOpen ||
      FAB_PAGES[activeFabPage] === "nexus";
    if (!shouldLoadSkills) return;
    let cancelled = false;
    const loadSkills = async () => {
      try {
        setSkillsLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setSkillCategories([]);
          }
          return;
        }
        const [skillsData, categoriesData] = await Promise.all([
          getSkillsForUser(user.id),
          getCatsForUser(user.id, supabase).catch((err) => {
            console.error("Failed to load skill categories", err);
            return [] as CatRow[];
          }),
        ]);
        if (!cancelled) {
          setSkills(skillsData);
          setSkillCategories(categoriesData);
        }
      } catch (error) {
        console.error("Failed to load skills", error);
        if (!cancelled) {
          setSkills([]);
          setSkillCategories([]);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    };
    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [activeFabPage, overlayOpen, overlayPickerOpen, selected]);

  useEffect(() => {
    if (selected !== "HABIT") return;
    let cancelled = false;
    const loadRoutines = async () => {
      try {
        setHabitRoutinesLoading(true);
        const supabase = getSupabaseBrowser();
        if (!supabase) {
          setHabitRoutinesLoading(false);
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setHabitRoutinesLoading(false);
          return;
        }
        const { data, error } = await supabase
          .from("habit_routines")
          .select("id, name, description")
          .eq("user_id", user.id)
          .order("name", { ascending: true });
        if (error) throw error;
        if (cancelled) return;
        const routines = data ?? [];
        setHabitRoutines(routines);
        setHabitRoutineId((current) =>
          current && routines.some((r) => r.id === current) ? current : "",
        );
      } catch (error) {
        console.error("Failed to load habit routines", error);
        if (!cancelled) {
          setHabitRoutines([]);
        }
      } finally {
        if (!cancelled) {
          setHabitRoutinesLoading(false);
        }
      }
    };
    void loadRoutines();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const getNextIndex = useCallback(
    (index: number) => (index + 1) % pageCount,
    [pageCount],
  );

  const getPrevIndex = useCallback(
    (index: number) => (index - 1 + pageCount) % pageCount,
    [pageCount],
  );

  const resetPageDragState = useCallback(() => {
    pendingFabSwipeRef.current = null;
    isDraggingRef.current = false;
    dragTargetPageRef.current = null;
    dragDirectionRef.current = null;
    pageDragAxisRef.current = null;
    setIsDragging(false);
    setDragTargetPage(null);
    setDragDirection(null);
    setIsAnimatingPageChange(false);
    pageX.set(0);
  }, [pageX]);

  const animateToPage = useCallback(
    async (
      targetPage: number,
      options?: { fromDrag?: boolean; direction?: 1 | -1 },
    ) => {
      if (targetPage === activeFabPage) {
        resetPageDragState();
        return;
      }
      const width = stageWidth > 0 ? stageWidth : 280;
      const resolvedDirection =
        options?.direction ??
        (targetPage === getNextIndex(activeFabPage) ? 1 : -1);
      dragTargetPageRef.current = null;
      dragDirectionRef.current = null;
      pageDragAxisRef.current = "horizontal";
      dragTargetPageRef.current = targetPage;
      dragDirectionRef.current = resolvedDirection;
      setDragTargetPage(targetPage);
      setDragDirection(resolvedDirection);
      setIsAnimatingPageChange(true);
      if (!options?.fromDrag) {
        pageX.set(0);
      }
      if (prefersReducedMotion) {
        setActiveFabPage(targetPage);
        resetPageDragState();
        return;
      }
      const controls = animate(
        pageX,
        resolvedDirection === 1 ? -width : width,
        {
          duration: 0.25,
          ease: "easeOut",
        },
      );
      try {
        await controls.finished;
      } catch {
        // Ignore interruptions
      }
      setActiveFabPage(targetPage);
      resetPageDragState();
      if (options?.fromDrag && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("tour:fab-swiped"));
      }
    },
    [
      activeFabPage,
      getNextIndex,
      pageX,
      prefersReducedMotion,
      resetPageDragState,
      stageWidth,
    ],
  );

  const handlePageDragStart = useCallback(() => {
    if (!isOpen) {
      resetPageDragState();
      return;
    }
    isDraggingRef.current = true;
    dragTargetPageRef.current = null;
    dragDirectionRef.current = null;
    pageDragAxisRef.current = null;
    setIsDragging(true);
    setDragTargetPage(null);
    setDragDirection(null);
    setIsAnimatingPageChange(false);
    pageX.set(0);
  }, [isOpen, pageX, resetPageDragState]);

  const handlePagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isOpen) return;
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (shouldIgnoreFabPageSwipe(event.target)) {
        return;
      }
      const target = event.target;
      const stage = stageRef.current;
      const isInsideFabSwipeStage =
        typeof Element !== "undefined" &&
        target instanceof Element &&
        Boolean(
          target.closest('[data-tour="fab-swipe"]') ||
            (stage && stage.contains(target)),
        );
      if (!isInsideFabSwipeStage) {
        return;
      }
      event.stopPropagation();
      if (
        typeof Element !== "undefined" &&
        target instanceof Element &&
        target.closest('[data-fab-nexus-scroll="true"]')
      ) {
        pendingFabSwipeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          fromNexusScroll: true,
          event: event.nativeEvent,
        };
        return;
      }
      pageDragControls.start(event);
    },
    [isOpen, pageDragControls],
  );

  const handlePagePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pending = pendingFabSwipeRef.current;
      if (!pending || pending.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - pending.startX;
      const dy = event.clientY - pending.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absY > 6 && absY > absX * 1.1) {
        pendingFabSwipeRef.current = null;
        return;
      }

      if (absX > 12 && absX > absY * 1.35) {
        if (
          typeof document !== "undefined" &&
          document.activeElement === nexusInputRef.current
        ) {
          nexusInputRef.current?.blur();
        }
        pageDragControls.start(pending.event);
        pendingFabSwipeRef.current = null;
      }
    },
    [pageDragControls],
  );

  const clearPendingFabSwipe = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pending = pendingFabSwipeRef.current;
      if (!pending || pending.pointerId === event.pointerId) {
        pendingFabSwipeRef.current = null;
      }
    },
    [],
  );

  const handlePageDrag = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDraggingRef.current) {
        return;
      }
      const absX = Math.abs(info.offset.x);
      const absY = Math.abs(info.offset.y);

      if (pageDragAxisRef.current === null) {
        if (
          absX < PAGE_DRAG_AXIS_THRESHOLD_PX &&
          absY < PAGE_DRAG_AXIS_THRESHOLD_PX
        ) {
          pageX.set(0);
          return;
        }
        if (absX >= absY * PAGE_DRAG_HORIZONTAL_DOMINANCE) {
          pageDragAxisRef.current = "horizontal";
          if (
            typeof document !== "undefined" &&
            document.activeElement === nexusInputRef.current
          ) {
            nexusInputRef.current?.blur();
          }
        } else if (absY >= absX * PAGE_DRAG_VERTICAL_DOMINANCE) {
          pageDragAxisRef.current = "vertical";
          dragTargetPageRef.current = null;
          dragDirectionRef.current = null;
          setDragTargetPage(null);
          setDragDirection(null);
          pageX.set(0);
          return;
        } else {
          pageX.set(0);
          return;
        }
      }

      if (pageDragAxisRef.current === "vertical") {
        pageX.set(0);
        return;
      }

      const limit = stageWidth > 0 ? stageWidth : DRAG_THRESHOLD_PX;
      const nextX = Math.max(-limit, Math.min(limit, info.offset.x));
      pageX.set(nextX);
      let nextTarget: number | null = null;
      let nextDirection: 1 | -1 | null = null;
      if (nextX < 0) {
        nextTarget = getNextIndex(activeFabPage);
        nextDirection = 1;
      } else if (nextX > 0) {
        nextTarget = getPrevIndex(activeFabPage);
        nextDirection = -1;
      }
      if (nextTarget !== dragTargetPageRef.current) {
        dragTargetPageRef.current = nextTarget;
        setDragTargetPage(nextTarget);
      }
      if (nextDirection !== null && nextDirection !== dragDirectionRef.current) {
        dragDirectionRef.current = nextDirection;
        setDragDirection(nextDirection);
      } else if (
        nextDirection === null &&
        dragDirectionRef.current !== null
      ) {
        dragDirectionRef.current = null;
        setDragDirection(null);
      }
    },
    [
      activeFabPage,
      getNextIndex,
      getPrevIndex,
      PAGE_DRAG_AXIS_THRESHOLD_PX,
      PAGE_DRAG_HORIZONTAL_DOMINANCE,
      PAGE_DRAG_VERTICAL_DOMINANCE,
      pageX,
      stageWidth,
    ],
  );

  const handlePageDragEnd = useCallback(
    async (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!isDraggingRef.current) {
        resetPageDragState();
        return;
      }
      const target = dragTargetPageRef.current;
      const direction = dragDirectionRef.current;
      const axis = pageDragAxisRef.current;
      setIsDragging(false);
      const width = stageWidth > 0 ? stageWidth : 0;
      const threshold = width > 0 ? width * 0.33 : 120;
      const distance = Math.abs(pageX.get());
      const shouldCommit =
        axis === "horizontal" &&
        target !== null &&
        (distance > threshold || Math.abs(info.velocity.x) > 600);
      try {
        if (shouldCommit && target !== null) {
          await animateToPage(target, {
            fromDrag: true,
            direction: direction ?? (pageX.get() < 0 ? 1 : -1),
          });
          return;
        }
        setIsAnimatingPageChange(true);
        try {
          await animate(pageX, 0, {
            duration: 0.2,
            ease: "easeOut",
          }).finished;
        } catch {
          // Ignore interruptions
        }
      } finally {
        resetPageDragState();
      }
    },
    [
      animateToPage,
      pageX,
      resetPageDragState,
      stageWidth,
    ],
  );

  const handleCloseReschedule = () => {
    if (isSavingReschedule || isDeletingEvent) return;
    setRescheduleTarget(null);
    setRescheduleError(null);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!isOpen && !isDirectCreationOpen) {
      if (
        creationRequest &&
        openingCreationRequestIdRef.current === creationRequest.id
      ) {
        return;
      }
      setActiveFabPage(0);
      resetPageDragState();
      if (
        typeof document !== "undefined" &&
        document.activeElement === nexusInputRef.current
      ) {
        nexusInputRef.current?.blur();
      }
      resetSearchState();
      resetFabFormState();
      setRescheduleTarget(null);
      setDeleteError(null);
      setIsDeletingEvent(false);
      searchAbortRef.current?.abort();
    }
  }, [
    creationRequest,
    isDirectCreationOpen,
    isOpen,
    resetPageDragState,
    resetSearchState,
    resetFabFormState,
  ]);

  useEffect(() => {
    return () => {
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const node = menuRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) {
        setMenuWidth(rect.width);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, primary.length, secondary.length]);

  useEffect(() => {
    if (!isOpen) {
      setStageWidth(0);
      return;
    }
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const updateWidth = () => setStageWidth(node.clientWidth || 0);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    const shouldSearch =
      (isOpen && pages[activeFabPage] === "nexus") || overlayPickerOpen;
    if (!shouldSearch) {
      return;
    }
    if (typeof window === "undefined") return;

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setIsLoadingMore(false);
    setSearchError(null);
    setSearchResults([]);
    setSearchCursor(null);

    const timer = window.setTimeout(async () => {
      try {
        await runSearch({
          cursor: null,
          append: false,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("FAB menu search failed", error);
        setSearchError("Unable to load results");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      setIsSearching(false);
    };
  }, [
    activeFabPage,
    isOpen,
    overlayPickerOpen,
    pages,
    runSearch,
    searchQuery,
    overlaySortMode,
  ]);

  const handleLoadMoreResults = useCallback(async () => {
    if (!searchCursor || isSearching || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setSearchError(null);
    try {
      await runSearch({ cursor: searchCursor, append: true });
    } catch (error) {
      console.error("FAB menu search pagination failed", error);
      if (searchResults.length === 0) {
        setSearchError("Unable to load results");
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    isLoadingMore,
    isSearching,
    runSearch,
    searchCursor,
    searchResults.length,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (pages[activeFabPage] === "nexus" || overlayPickerOpen) {
      const frame = requestAnimationFrame(() => {
        nexusInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    if (
      typeof document !== "undefined" &&
      document.activeElement === nexusInputRef.current
    ) {
      nexusInputRef.current?.blur();
    }
  }, [activeFabPage, isOpen, overlayPickerOpen, pages]);

  const handleRescheduleSave = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) {
      setRescheduleError("Select both date and time");
      return;
    }
    if (!rescheduleTarget.scheduleInstanceId) {
      setRescheduleError("No scheduled instance available to update.");
      return;
    }
    const parsed = new Date(`${rescheduleDate}T${rescheduleTime}`);
    if (Number.isNaN(parsed.getTime())) {
      setRescheduleError("Invalid date or time");
      return;
    }
    setIsSavingReschedule(true);
    setRescheduleError(null);
    try {
      const response = await fetch(
        `/api/schedule/instances/${rescheduleTarget.scheduleInstanceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startUtc: parsed.toISOString() }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to update schedule");
      }
      const payload = (await response.json().catch(() => null)) as {
        startUtc?: string | null;
      } | null;
      let nextStart = payload?.startUtc ?? parsed.toISOString();
      let nextInstanceId = rescheduleTarget.scheduleInstanceId;
      let nextDuration = rescheduleTarget.durationMinutes;

      if (rescheduleTarget.type === "HABIT") {
        const refreshed = await fetchNextScheduledInstance(
          rescheduleTarget.id,
          "HABIT",
        );
        if (refreshed) {
          nextStart = refreshed.startUtc ?? nextStart;
          nextInstanceId = refreshed.instanceId ?? nextInstanceId;
          if (
            typeof refreshed.durationMinutes === "number" &&
            Number.isFinite(refreshed.durationMinutes)
          ) {
            nextDuration = refreshed.durationMinutes;
          }
        }
      }

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === rescheduleTarget.id && item.type === rescheduleTarget.type
            ? {
                ...item,
                nextScheduledAt: nextStart,
                scheduleInstanceId: nextInstanceId,
                durationMinutes: nextDuration,
              }
            : item,
        ),
      );
      void notifySchedulerOfChange();
      setIsSavingReschedule(false);
      setRescheduleTarget(null);
      setDeleteError(null);
    } catch (error) {
      console.error("Failed to reschedule", error);
      setRescheduleError(
        error instanceof Error ? error.message : "Unable to update schedule",
      );
      setIsSavingReschedule(false);
    }
  }, [
    fetchNextScheduledInstance,
    isDeletingEvent,
    rescheduleDate,
    rescheduleTime,
    rescheduleTarget,
    notifySchedulerOfChange,
  ]);

  const isSaveDisabled = useMemo(() => {
    if (isSavingFab || isDeletingFabEntity || editHydrating || !selected)
      return true;
    if (selected === "GOAL") {
      if (goalName.trim().length === 0) return true;
      if (!goalRelationType || !goalRelationId) return true;
      if (!goalEnergy) return true;
      if (!goalPriority) return true;
      return false;
    }
    if (selected === "PROJECT") {
      if (projectName.trim().length === 0) return true;
      if (!projectGoalId) return true;
      if (projectSkillIds.length === 0) return true;
      return false;
    }
    if (selected === "TASK") {
      if (taskName.trim().length === 0) return true;
      if (!taskProjectId) return true;
      if (!taskSkillId) return true;
      return false;
    }
    if (selected === "HABIT") {
      if (habitName.trim().length === 0) return true;
      if (!habitEnergy) return true;
      if (!habitRecurrence) return true;
      if (!habitType) return true;
      if (!habitSkillId) return true;
      return false;
    }
    return habitName.trim().length === 0;
  }, [
    goalEnergy,
    goalRelationId,
    goalRelationType,
    goalName,
    goalPriority,
    habitEnergy,
    habitName,
    habitRecurrence,
    habitSkillId,
    habitType,
    editHydrating,
    isDeletingFabEntity,
    isSavingFab,
    projectGoalId,
    projectName,
    projectSkillIds,
    selected,
    taskName,
    taskProjectId,
    taskSkillId,
  ]);

  const handleFabSave = useCallback(async () => {
    if (
      fabSavePendingRef.current ||
      isSavingFab ||
      isDeletingFabEntity ||
      !selected
    )
      return;
    const createdType = selected;
    const activeEditTarget =
      editTarget?.entityType === selected && editTarget.entityId
        ? editTarget
        : null;
    const selectedTagIdsSnapshot = [...selectedTagIds];
    fabSavePendingRef.current = true;
    try {
      setSaveError(null);
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        setSaveError("Supabase client not available.");
        return;
      }
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        setSaveError("Unable to resolve user.");
        return;
      }
      if (!user) {
        setSaveError("You need to be signed in to save.");
        return;
      }
      const trimmedName =
        selected === "GOAL"
          ? goalName.trim()
          : selected === "PROJECT"
            ? projectName.trim()
            : selected === "TASK"
              ? taskName.trim()
              : habitName.trim();
      if (trimmedName.length === 0) {
        setSaveError("Please enter a name.");
        return;
      }
      const goalRelationResolution =
        selected === "GOAL"
          ? resolveSelectedGoalRelation()
          : {
              selectedMonumentId: null,
              selectedCircleId: null,
              error: null,
            };
      if (selected === "GOAL") {
        if (goalRelationResolution.error) {
          setSaveError(goalRelationResolution.error);
          return;
        }
        if (!goalEnergy) {
          setSaveError("Select an energy level before saving.");
          return;
        }
        if (!goalPriority) {
          setSaveError("Select a priority before saving.");
          return;
        }
      }
      if (selected === "PROJECT") {
        if (!projectGoalId) {
          setSaveError("Link this project to a goal before saving.");
          return;
        }
        if (projectSkillIds.length === 0) {
          setSaveError("Link at least one skill before saving.");
          return;
        }
      }
      if (selected === "TASK") {
        if (!taskProjectId) {
          setSaveError("Link this task to a project before saving.");
          return;
        }
        if (!taskSkillId) {
          setSaveError("Link this task to a skill before saving.");
          return;
        }
      }
      if (selected === "HABIT") {
        if (!habitEnergy) {
          setSaveError("Select an energy level before saving.");
          return;
        }
        if (!habitRecurrence) {
          setSaveError("Select a recurrence before saving.");
          return;
        }
        if (!habitType) {
          setSaveError("Select a habit type before saving.");
          return;
        }
        if (!habitSkillId) {
          setSaveError("Link this habit to a skill before saving.");
          return;
        }
      }
      let exactSchedule: ParsedExactSchedule | null = null;
      if (selected === "PROJECT") {
        const parsed = parseExactSchedule(
          projectHasExactDate,
          projectExactDate,
          projectExactStartTime,
          projectExactEndTime,
          projectExactFallbackDate,
        );
        if (parsed.error) {
          setSaveError(parsed.error);
          return;
        }
        exactSchedule = parsed.schedule;
      }
      if (selected === "TASK") {
        const parsed = parseExactSchedule(
          taskHasExactDate,
          taskExactDate,
          taskExactStartTime,
          taskExactEndTime,
          taskExactFallbackDate,
        );
        if (parsed.error) {
          setSaveError(parsed.error);
          return;
        }
        exactSchedule = parsed.schedule;
      }
      let habitFixedTime: ParsedHabitFixedTime | null = null;
      if (selected === "HABIT") {
        const parsed = parseHabitFixedTime(
          habitFixedStartTime,
          habitFixedEndTime,
        );
        if (parsed.error) {
          setSaveError(parsed.error);
          return;
        }
        habitFixedTime = parsed.schedule;
      }
      setIsSavingFab(true);
      try {
        const throwIfLimitError = (error: unknown) => {
          const limitCode = getLimitCodeFromError(error);
          if (limitCode) {
            throw new LimitReachedError(limitCode, error);
          }
          throw error;
        };
        let createdEntityId: string | null = null;
        let tagAttachmentFailed = false;
        let childDraftFailureMessage: string | null = null;

        const resolveGoalRoadmapId = async ({
          selectedMonumentId,
          selectedCircleId,
        }: {
          selectedMonumentId: string | null;
          selectedCircleId: string | null;
        }) => {
          if (selectedMonumentId) {
            const { data: existingRoadmap, error: roadmapError } =
              await supabase
                .from("roadmaps")
                .select("id")
                .eq("user_id", user.id)
                .eq("monument_id", selectedMonumentId)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            if (roadmapError) throwIfLimitError(roadmapError);

            const existingRoadmapId =
              typeof existingRoadmap?.id === "string"
                ? existingRoadmap.id
                : null;
            if (existingRoadmapId) {
              return existingRoadmapId;
            }

            const monument = monuments.find(
              (item) => item.id === selectedMonumentId,
            );
            const { data: createdRoadmap, error: createRoadmapError } =
              await supabase
                .from("roadmaps")
                .insert({
                  user_id: user.id,
                  monument_id: selectedMonumentId,
                  circle_id: null,
                  title: monument?.title
                    ? `${monument.title} Roadmap`
                    : "True Roadmap",
                  emoji: monument?.emoji ?? null,
                })
                .select("id")
                .single();
            if (createRoadmapError) throwIfLimitError(createRoadmapError);
            const createdRoadmapId =
              typeof createdRoadmap?.id === "string"
                ? createdRoadmap.id
                : null;
            if (createdRoadmapId) {
              return createdRoadmapId;
            }
          }

          if (selectedCircleId) {
            const { data: existingRoadmap, error: roadmapError } =
              await supabase
                .from("roadmaps")
                .select("id")
                .eq("user_id", user.id)
                .eq("circle_id", selectedCircleId)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            if (roadmapError) throwIfLimitError(roadmapError);

            const existingRoadmapId =
              typeof existingRoadmap?.id === "string"
                ? existingRoadmap.id
                : null;
            if (existingRoadmapId) {
              return existingRoadmapId;
            }

            const circle = manageableCircles.find(
              (item) => item.id === selectedCircleId,
            );
            const { data: createdRoadmap, error: createRoadmapError } =
              await supabase
                .from("roadmaps")
                .insert({
                  user_id: user.id,
                  circle_id: selectedCircleId,
                  monument_id: null,
                  title: circle?.name
                    ? `${circle.name} Roadmap`
                    : "Circle Roadmap",
                  emoji: null,
                })
                .select("id")
                .single();
            if (createRoadmapError) throwIfLimitError(createRoadmapError);
            const createdRoadmapId =
              typeof createdRoadmap?.id === "string"
                ? createdRoadmap.id
                : null;
            if (createdRoadmapId) {
              return createdRoadmapId;
            }
          }

          throw new Error("Unable to resolve the selected roadmap.");
        };

        const resolveCompatibleGoalCampaignId = async ({
          roadmapId,
          selectedMonumentId,
          selectedCircleId,
        }: {
          roadmapId: string;
          selectedMonumentId: string | null;
          selectedCircleId: string | null;
        }) => {
          if (!goalCampaignId) {
            return null;
          }

          let selectedCampaign =
            goalCampaigns.find((campaign) => campaign.id === goalCampaignId) ??
            null;
          if (!selectedCampaign) {
            const { data: selectedCampaignData, error: selectedCampaignError } =
              await supabase
                .from("campaigns")
                .select(
                  "id, name, emoji, roadmap_id, primary_monument_id, primary_circle_id, scheduling_state, position",
                )
                .eq("id", goalCampaignId)
                .eq("user_id", user.id)
                .maybeSingle();
            if (selectedCampaignError) {
              throwIfLimitError(selectedCampaignError);
            }
            selectedCampaign = selectedCampaignData as GoalCampaignOption | null;
          }

          if (!selectedCampaign) {
            throw new Error("Selected campaign could not be found.");
          }

          const belongsToSelectedContext = selectedCircleId
            ? selectedCampaign.primary_circle_id === selectedCircleId ||
              selectedCampaign.roadmap_id === roadmapId
            : selectedCampaign.primary_monument_id === selectedMonumentId ||
              selectedCampaign.roadmap_id === roadmapId;

          return belongsToSelectedContext ? goalCampaignId : null;
        };

        if (selected === "GOAL" && activeEditTarget?.entityType === "GOAL") {
          const { data: existingGoalData, error: existingGoalError } =
            await supabase
              .from("goals")
              .select("id, monument_id, circle_id, roadmap_id")
              .eq("id", activeEditTarget.entityId)
              .eq("user_id", user.id)
              .maybeSingle();
          if (existingGoalError) throwIfLimitError(existingGoalError);

          const existingGoal = existingGoalData as Pick<
            FabGoalEditRow,
            "id" | "monument_id" | "circle_id" | "roadmap_id"
          > | null;
          if (!existingGoal) {
            throw new Error("Goal could not be found.");
          }

          const originalRelationType = existingGoal.circle_id
            ? "CIRCLE"
            : "MONUMENT";
          const nextRelationType = goalRelationResolution.selectedCircleId
            ? "CIRCLE"
            : "MONUMENT";
          if (originalRelationType !== nextRelationType) {
            setSaveError(
              "Moving a Goal between Monument and Circle is coming next.",
            );
            return;
          }
          if (
            originalRelationType === "CIRCLE" &&
            existingGoal.circle_id !== goalRelationResolution.selectedCircleId
          ) {
            setSaveError("Moving a Goal between Circles is coming next.");
            return;
          }

          const resolvedGoalRoadmapId = await resolveGoalRoadmapId({
            selectedMonumentId: goalRelationResolution.selectedMonumentId,
            selectedCircleId: goalRelationResolution.selectedCircleId,
          });
          const effectiveGoalCampaignId =
            await resolveCompatibleGoalCampaignId({
              roadmapId: resolvedGoalRoadmapId,
              selectedMonumentId: goalRelationResolution.selectedMonumentId,
              selectedCircleId: goalRelationResolution.selectedCircleId,
            });

          const { error } = await supabase
            .from("goals")
            .update({
              name: trimmedName,
              priority: goalPriority,
              priority_code: goalPriority,
              energy: goalEnergy,
              energy_code: goalEnergy,
              why: goalWhy?.trim() || null,
              monument_id: goalRelationResolution.selectedMonumentId,
              circle_id: goalRelationResolution.selectedCircleId,
              roadmap_id: goalRelationResolution.selectedCircleId
                ? resolvedGoalRoadmapId
                : existingGoal.roadmap_id
                  ? resolvedGoalRoadmapId
                  : (existingGoal.roadmap_id ?? null),
              due_date: goalDue ?? null,
            })
            .eq("id", activeEditTarget.entityId)
            .eq("user_id", user.id);
          if (error) throwIfLimitError(error);

          const { error: rankError } = await supabase.rpc(
            "recalculate_goal_global_rank",
          );
          if (rankError) throwIfLimitError(rankError);

          const { error: campaignDeleteError } = await supabase
            .from("campaign_goals")
            .delete()
            .eq("user_id", user.id)
            .eq("goal_id", activeEditTarget.entityId);
          if (campaignDeleteError) throwIfLimitError(campaignDeleteError);

          if (effectiveGoalCampaignId) {
            const { data: campaignGoalRowsData, error: campaignGoalError } =
              await supabase
                .from("campaign_goals")
                .select("position")
                .eq("campaign_id", effectiveGoalCampaignId)
                .order("position", { ascending: false })
                .limit(1);
            if (campaignGoalError) throwIfLimitError(campaignGoalError);
            const campaignGoalRows =
              campaignGoalRowsData as FabGoalCampaignRow[] | null;
            const lastPosition = Number(campaignGoalRows?.[0]?.position ?? 0);
            const nextPosition =
              Number.isFinite(lastPosition) && lastPosition > 0
                ? lastPosition + 1
                : 1;
            await addGoalToCampaign(user.id, {
              campaignId: effectiveGoalCampaignId,
              goalId: activeEditTarget.entityId,
              position: nextPosition,
            });
          }

          try {
            await replaceSelectedTagsForEntity({
              supabase,
              userId: user.id,
              entityType: "GOAL",
              entityId: activeEditTarget.entityId,
              tagIds: selectedTagIdsSnapshot,
            });
          } catch (error) {
            tagAttachmentFailed = true;
            console.error("Failed to update tags after goal edit", error);
          }

          dispatchCreatorEntitySaved({
            entityType: "GOAL",
            entityId: activeEditTarget.entityId,
            action: "updated",
            monumentId: goalRelationResolution.selectedMonumentId,
            circleId: goalRelationResolution.selectedCircleId,
          });
          resetFabFormState();
          closeExpandedPanel({ notifyEditClose: false });
          onEditSaved?.(activeEditTarget);
          onEditClose?.();
          toast.success("Goal updated");
          if (tagAttachmentFailed) {
            toast.error(
              "Tags not updated",
              "The goal was saved, but selected tags could not be updated.",
            );
          }
          return;
        }

        if (
          selected === "PROJECT" &&
          activeEditTarget?.entityType === "PROJECT"
        ) {
          const { error } = await supabase
            .from("projects")
            .update({
              name: trimmedName,
              goal_id: projectGoalId || null,
              priority: projectPriority,
              energy: projectEnergy,
              stage: projectStage,
              why: projectWhy?.trim() || null,
              duration_min:
                typeof projectDuration === "number" &&
                Number.isFinite(projectDuration)
                  ? projectDuration
                  : normalizedProjectDuration || null,
              due_date: projectDue || null,
            })
            .eq("id", activeEditTarget.entityId)
            .eq("user_id", user.id);
          if (error) throwIfLimitError(error);

          const { error: projectSkillsDeleteError } = await supabase
            .from("project_skills")
            .delete()
            .eq("project_id", activeEditTarget.entityId);
          if (projectSkillsDeleteError)
            throwIfLimitError(projectSkillsDeleteError);

          if (projectSkillIds.length > 0) {
            const { error: projectSkillsInsertError } = await supabase
              .from("project_skills")
              .insert(
                projectSkillIds.map((skillId) => ({
                  project_id: activeEditTarget.entityId,
                  skill_id: skillId,
                })),
              );
            if (projectSkillsInsertError)
              throwIfLimitError(projectSkillsInsertError);
          }

          try {
            await replaceSelectedTagsForEntity({
              supabase,
              userId: user.id,
              entityType: "PROJECT",
              entityId: activeEditTarget.entityId,
              tagIds: selectedTagIdsSnapshot,
            });
          } catch (error) {
            tagAttachmentFailed = true;
            console.error("Failed to update tags after project edit", error);
          }

          await upsertLockedScheduleInstance({
            supabase,
            userId: user.id,
            sourceType: "PROJECT",
            sourceId: activeEditTarget.entityId,
            exactSchedule,
            removeWhenBlank: true,
          });

          dispatchCreatorEntitySaved({
            entityType: "PROJECT",
            entityId: activeEditTarget.entityId,
            action: "updated",
            monumentId: null,
          });
          resetFabFormState();
          closeExpandedPanel({ notifyEditClose: false });
          onEditSaved?.(activeEditTarget);
          onEditClose?.();
          toast.success("Project updated");
          if (tagAttachmentFailed) {
            toast.error(
              "Tags not updated",
              "The project was saved, but selected tags could not be updated.",
            );
          }
          return;
        }

        if (selected === "TASK" && activeEditTarget?.entityType === "TASK") {
          const { error } = await supabase
            .from("tasks")
            .update({
              name: trimmedName,
              project_id: taskProjectId || null,
              stage: taskStage,
              skill_id: taskSkillId || null,
              priority: taskPriority,
              energy: taskEnergy,
              duration_min: normalizedTaskDuration || 0,
              why: taskNotes.trim() || null,
            })
            .eq("id", activeEditTarget.entityId)
            .eq("user_id", user.id);
          if (error) throwIfLimitError(error);

          try {
            await replaceSelectedTagsForEntity({
              supabase,
              userId: user.id,
              entityType: "TASK",
              entityId: activeEditTarget.entityId,
              tagIds: selectedTagIdsSnapshot,
            });
          } catch (error) {
            tagAttachmentFailed = true;
            console.error("Failed to update tags after task edit", error);
          }

          await upsertLockedScheduleInstance({
            supabase,
            userId: user.id,
            sourceType: "TASK",
            sourceId: activeEditTarget.entityId,
            exactSchedule,
            removeWhenBlank: true,
          });

          dispatchCreatorEntitySaved({
            entityType: "TASK",
            entityId: activeEditTarget.entityId,
            action: "updated",
            monumentId: null,
          });
          resetFabFormState();
          closeExpandedPanel({ notifyEditClose: false });
          onEditSaved?.(activeEditTarget);
          onEditClose?.();
          toast.success("Task updated");
          if (tagAttachmentFailed) {
            toast.error(
              "Tags not updated",
              "The task was saved, but selected tags could not be updated.",
            );
          }
          return;
        }

        if (selected === "HABIT" && activeEditTarget?.entityType === "HABIT") {
          const parsedDuration = Number.parseInt(habitDuration || "0", 10);
          const duration = Number.isFinite(parsedDuration)
            ? parsedDuration
            : null;
          let routineIdToUse: string | null = habitRoutineId || null;
          if (isCreatingHabitRoutineInline) {
            const trimmedRoutineName = habitInlineRoutineName.trim();
            if (!trimmedRoutineName) {
              setSaveError("Please name the routine before saving.");
              return;
            }
            const trimmedRoutineDescription =
              habitInlineRoutineDescription.trim();
            const { data: routineData, error: routineError } = await supabase
              .from("habit_routines")
              .insert({
                user_id: user.id,
                name: trimmedRoutineName,
                description:
                  trimmedRoutineDescription.length > 0
                    ? trimmedRoutineDescription
                    : null,
              })
              .select("id")
              .single();
            if (routineError) throwIfLimitError(routineError);
            routineIdToUse = routineData?.id ?? null;
          }

          const { error } = await supabase
            .from("habits")
            .update({
              name: trimmedName,
              description: habitWhy?.trim() || null,
              type: habitType,
              habit_type: habitType,
              recurrence: habitRecurrence,
              duration_minutes: duration,
              energy: habitEnergy,
              skill_id: habitSkillId || null,
              routine_id: routineIdToUse,
              circle_id: isValidUuid(habitCircleId) ? habitCircleId : null,
              goal_id: habitGoalId || null,
              location_context_id: isValidUuid(habitLocationContextId)
                ? habitLocationContextId
                : null,
              daylight_preference:
                habitDaylightPreference === "ALL_DAY"
                  ? null
                  : habitDaylightPreference,
              window_edge_preference:
                habitWindowEdgePreference?.trim().toUpperCase() || "FRONT",
              next_due_override: habitNextDueOverride
                ? new Date(habitNextDueOverride).toISOString()
                : null,
              fixed_start_local: habitFixedTime?.fixed_start_local ?? null,
              fixed_end_local: habitFixedTime?.fixed_end_local ?? null,
              fixed_timezone: habitFixedTime?.fixed_timezone ?? null,
              memo_capture_config: buildMemoCaptureConfig(),
            })
            .eq("id", activeEditTarget.entityId)
            .eq("user_id", user.id);
          if (error) throwIfLimitError(error);

          try {
            await replaceSelectedTagsForEntity({
              supabase,
              userId: user.id,
              entityType: "HABIT",
              entityId: activeEditTarget.entityId,
              tagIds: selectedTagIdsSnapshot,
            });
          } catch (error) {
            tagAttachmentFailed = true;
            console.error("Failed to update tags after habit edit", error);
          }

          dispatchCreatorEntitySaved({
            entityType: "HABIT",
            entityId: activeEditTarget.entityId,
            action: "updated",
            monumentId: null,
          });
          resetFabFormState();
          closeExpandedPanel({ notifyEditClose: false });
          onEditSaved?.(activeEditTarget);
          onEditClose?.();
          toast.success("Habit updated");
          if (tagAttachmentFailed) {
            toast.error(
              "Tags not updated",
              "The habit was saved, but selected tags could not be updated.",
            );
          }
          return;
        }

        if (selected === "GOAL") {
          const roadmapId = await resolveGoalRoadmapId({
            selectedMonumentId: goalRelationResolution.selectedMonumentId,
            selectedCircleId: goalRelationResolution.selectedCircleId,
          });
          const effectiveGoalCampaignId =
            await resolveCompatibleGoalCampaignId({
              roadmapId,
              selectedMonumentId: goalRelationResolution.selectedMonumentId,
              selectedCircleId: goalRelationResolution.selectedCircleId,
            });
          const { data: goalData, error } = await supabase
            .from("goals")
            .insert({
              user_id: user.id,
              name: trimmedName,
              priority: goalPriority,
              energy: goalEnergy,
              why: goalWhy?.trim() || null,
              monument_id: goalRelationResolution.selectedMonumentId,
              circle_id: goalRelationResolution.selectedCircleId,
              roadmap_id: roadmapId,
              due_date: goalDue ?? null,
            })
            .select("id")
            .single();
          if (error) throwIfLimitError(error);
          createdEntityId = goalData?.id ?? null;
          if (effectiveGoalCampaignId && goalData?.id) {
            const { data: campaignGoalRows, error: campaignGoalError } =
              await supabase
                .from("campaign_goals")
                .select("position")
                .eq("campaign_id", effectiveGoalCampaignId)
                .order("position", { ascending: false })
                .limit(1);
            if (campaignGoalError) throwIfLimitError(campaignGoalError);
            const lastPosition = Number(campaignGoalRows?.[0]?.position ?? 0);
            const nextPosition =
              Number.isFinite(lastPosition) && lastPosition > 0
                ? lastPosition + 1
                : 1;
            await addGoalToCampaign(user.id, {
              campaignId: effectiveGoalCampaignId,
              goalId: goalData.id,
              position: nextPosition,
            });
          }
        } else if (selected === "PROJECT") {
          const { data: projectData, error } = await supabase
            .from("projects")
            .insert({
              user_id: user.id,
              name: trimmedName,
              goal_id: projectGoalId || null,
              priority: projectPriority,
              energy: projectEnergy,
              stage: projectStage,
              why: projectWhy?.trim() || null,
              duration_min:
                typeof projectDuration === "number" &&
                Number.isFinite(projectDuration)
                  ? projectDuration
                  : normalizedProjectDuration || null,
              due_date: projectDue || null,
            })
            .select("id")
            .single();
          if (error) throwIfLimitError(error);
          createdEntityId = projectData?.id ?? null;
          if (projectData?.id && exactSchedule) {
            await upsertLockedScheduleInstance({
              supabase,
              userId: user.id,
              sourceType: "PROJECT",
              sourceId: projectData.id,
              exactSchedule,
              removeWhenBlank: false,
            });
          }
          if (projectData?.id && projectSkillIds.length > 0) {
            const { error: projectSkillsError } = await supabase
              .from("project_skills")
              .insert(
                projectSkillIds.map((skillId) => ({
                  project_id: projectData.id,
                  skill_id: skillId,
                })),
              );
            if (projectSkillsError) throwIfLimitError(projectSkillsError);
          }
        } else if (selected === "TASK") {
          const { data: taskData, error } = await supabase
            .from("tasks")
            .insert({
              user_id: user.id,
              name: trimmedName,
              project_id: taskProjectId || null,
              stage: taskStage,
              skill_id: taskSkillId || null,
              priority: taskPriority,
              energy: taskEnergy,
              duration_min: normalizedTaskDuration || 0,
              why: taskNotes.trim() || null,
            })
            .select("id")
            .single();
          if (error) throwIfLimitError(error);
          createdEntityId = taskData?.id ?? null;
          if (taskData?.id && exactSchedule) {
            await upsertLockedScheduleInstance({
              supabase,
              userId: user.id,
              sourceType: "TASK",
              sourceId: taskData.id,
              exactSchedule,
              removeWhenBlank: false,
            });
          }
        } else if (selected === "HABIT") {
          try {
            await enforceHabitLimit({ supabase, userId: user.id });
          } catch (error) {
            throwIfLimitError(error);
          }
          const parsedDuration = Number.parseInt(habitDuration || "0", 10);
          const duration = Number.isFinite(parsedDuration)
            ? parsedDuration
            : null;
          let routineIdToUse: string | null = habitRoutineId || null;
          if (isCreatingHabitRoutineInline) {
            const trimmedRoutineName = habitInlineRoutineName.trim();
            if (!trimmedRoutineName) {
              setSaveError("Please name the routine before saving.");
              return;
            }
            const trimmedRoutineDescription =
              habitInlineRoutineDescription.trim();
            const { data: routineData, error: routineError } = await supabase
              .from("habit_routines")
              .insert({
                user_id: user.id,
                name: trimmedRoutineName,
                description:
                  trimmedRoutineDescription.length > 0
                    ? trimmedRoutineDescription
                    : null,
              })
              .select("id")
              .single();
            if (routineError) throwIfLimitError(routineError);
            routineIdToUse = routineData?.id ?? null;
          }
          const { data: habitData, error } = await supabase
            .from("habits")
            .insert({
              user_id: user.id,
              name: trimmedName,
              description: habitWhy?.trim() || null,
              type: habitType,
              habit_type: habitType,
              recurrence: habitRecurrence,
              duration_minutes: duration,
              energy: habitEnergy,
              skill_id: habitSkillId || null,
              routine_id: routineIdToUse,
              circle_id: isValidUuid(habitCircleId) ? habitCircleId : null,
              goal_id: habitGoalId || null,
              location_context_id: isValidUuid(habitLocationContextId)
                ? habitLocationContextId
                : null,
              daylight_preference:
                habitDaylightPreference === "ALL_DAY"
                  ? null
                  : habitDaylightPreference,
              window_edge_preference:
                habitWindowEdgePreference?.trim().toUpperCase() || "FRONT",
              next_due_override: habitNextDueOverride
                ? new Date(habitNextDueOverride).toISOString()
                : null,
              fixed_start_local: habitFixedTime?.fixed_start_local ?? null,
              fixed_end_local: habitFixedTime?.fixed_end_local ?? null,
              fixed_timezone: habitFixedTime?.fixed_timezone ?? null,
              memo_capture_config: buildMemoCaptureConfig(),
            })
            .select("id")
            .single();
          if (error) throwIfLimitError(error);
          createdEntityId = habitData?.id ?? null;
        }
        if (createdEntityId && selectedTagIdsSnapshot.length > 0) {
          try {
            await attachSelectedTagsToEntity({
              supabase,
              userId: user.id,
              entityType: createdType,
              entityId: createdEntityId,
              tagIds: selectedTagIdsSnapshot,
            });
          } catch (error) {
            tagAttachmentFailed = true;
            console.error("Failed to attach tags after create", error);
          }
        }
        if (selected === "GOAL" && createdEntityId && goalDraftProjects.length > 0) {
          const childErrors: string[] = [];
          for (const draftProject of goalDraftProjects) {
            try {
              const { data: childProjectData, error: childProjectError } =
                await supabase
                  .from("projects")
                  .insert({
                    user_id: user.id,
                    name: draftProject.name,
                    goal_id: createdEntityId,
                    priority: draftProject.priority,
                    energy: draftProject.energy,
                    stage: draftProject.stage,
                    why: draftProject.why || null,
                    duration_min: draftProject.durationMin,
                    due_date: draftProject.dueDate || null,
                  })
                  .select("id")
                  .single();
              if (childProjectError) {
                childErrors.push(childProjectError.message);
                console.error(
                  "Failed to insert draft project after goal create",
                  childProjectError,
                );
                continue;
              }
              if (
                childProjectData?.id &&
                Array.isArray(draftProject.skillIds) &&
                draftProject.skillIds.length > 0
              ) {
                const { error: childProjectSkillsError } = await supabase
                  .from("project_skills")
                  .insert(
                    draftProject.skillIds.map((skillId) => ({
                      project_id: childProjectData.id,
                      skill_id: skillId,
                    })),
                  );
                if (childProjectSkillsError) {
                  childErrors.push(childProjectSkillsError.message);
                  console.error(
                    "Failed to attach draft project skills after goal create",
                    childProjectSkillsError,
                  );
                }
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unable to save draft project.";
              childErrors.push(message);
              console.error(
                "Failed to persist nested project draft after goal create",
                error,
              );
            }
          }
          if (childErrors.length > 0) {
            childDraftFailureMessage =
              childErrors[0] ?? "Some draft projects could not be saved.";
          }
        }
        if (
          selected === "PROJECT" &&
          createdEntityId &&
          projectDraftTasks.length > 0
        ) {
          const childErrors: string[] = [];
          for (const draftTask of projectDraftTasks) {
            try {
              const { error: childTaskError } = await supabase.from("tasks")
                .insert({
                  user_id: user.id,
                  name: draftTask.name,
                  project_id: createdEntityId,
                  stage: draftTask.stage,
                  skill_id: draftTask.skillId || null,
                  priority: draftTask.priority,
                  energy: draftTask.energy,
                  duration_min: draftTask.durationMin || 0,
                  why: draftTask.why || null,
                });
              if (childTaskError) {
                childErrors.push(childTaskError.message);
                console.error(
                  "Failed to insert draft task after project create",
                  childTaskError,
                );
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unable to save draft task.";
              childErrors.push(message);
              console.error(
                "Failed to persist nested task draft after project create",
                error,
              );
            }
          }
          if (childErrors.length > 0) {
            childDraftFailureMessage =
              childErrors[0] ?? "Some draft tasks could not be saved.";
          }
        }
        if (createdEntityId) {
          dispatchCreatorEntitySaved({
            entityType: createdType,
            entityId: createdEntityId,
            action: "created",
            monumentId:
              createdType === "GOAL"
                ? goalRelationResolution.selectedMonumentId
                : null,
            circleId:
              createdType === "GOAL"
                ? goalRelationResolution.selectedCircleId
                : null,
          });
        }
        openingCreationRequestIdRef.current = null;
        resetFabFormState();
        closeExpandedPanel({ notifyEditClose: false });
        const successLabel =
          createdType === "GOAL"
            ? "Goal"
            : createdType === "PROJECT"
              ? "Project"
              : createdType === "TASK"
                ? "Task"
                : createdType === "HABIT"
                  ? "Habit"
                  : "Item";
        toast.success(`${successLabel} created`);
        if (tagAttachmentFailed) {
          toast.error(
            "Tags not attached",
            "The item was created, but selected tags could not be attached.",
          );
        }
        if (childDraftFailureMessage) {
          toast.error("Nested items not saved", childDraftFailureMessage);
        }
      } catch (error: unknown) {
        console.error("Failed to save item", error);
        if (
          process.env.NODE_ENV === "development" &&
          selected === "GOAL" &&
          activeEditTarget?.entityType === "GOAL"
        ) {
          console.error("[fab goal edit save] failed", error);
        }
        if (error instanceof LimitReachedError) {
          setSaveError(null);
          setActiveLimitCode(error.limitCode);
          return;
        }
        const errorMessage =
          (error as { message?: string })?.message ||
          (error as { error?: { message?: string } })?.error?.message ||
          "Unable to save right now.";
        setSaveError(errorMessage);
      } finally {
        setIsSavingFab(false);
      }
    } finally {
      fabSavePendingRef.current = false;
    }
  }, [
    habitDuration,
    habitCircleId,
    habitDaylightPreference,
    habitEnergy,
    habitFixedEndTime,
    habitFixedStartTime,
    habitGoalId,
    habitInlineRoutineDescription,
    habitInlineRoutineName,
    habitLocationContextId,
    habitRecurrence,
    habitRoutineId,
    habitSkillId,
    habitType,
    habitNextDueOverride,
    habitWindowEdgePreference,
    habitWhy,
    habitName,
    editTarget,
    isDeletingFabEntity,
    isCreatingHabitRoutineInline,
    isSavingFab,
    goalCampaignId,
    goalCampaigns,
    goalDraftProjects,
    goalDue,
    goalEnergy,
    goalName,
    goalPriority,
    goalWhy,
    manageableCircles,
    monuments,
    normalizedTaskDuration,
    normalizedProjectDuration,
    projectDuration,
    projectDue,
    projectEnergy,
    projectExactDate,
    projectExactEndTime,
    projectExactFallbackDate,
    projectExactStartTime,
    projectGoalId,
    projectHasExactDate,
    projectName,
    projectPriority,
    projectSkillIds,
    projectStage,
    projectWhy,
    projectDraftTasks,
    replaceSelectedTagsForEntity,
    resolveSelectedGoalRelation,
    selectedTagIds,
    selected,
    taskEnergy,
    taskExactDate,
    taskExactEndTime,
    taskExactFallbackDate,
    taskExactStartTime,
    taskHasExactDate,
    taskName,
    taskNotes,
    taskPriority,
    taskProjectId,
    taskSkillId,
    taskStage,
    attachSelectedTagsToEntity,
    buildMemoCaptureConfig,
    closeExpandedPanel,
    onEditClose,
    onEditSaved,
    resetFabFormState,
    toast,
  ]);

  useEffect(() => {
    setGoalDeleteConfirmTarget(null);
  }, [editTarget?.entityId, editTarget?.entityType]);

  const handleFabDeleteEntity = useCallback(
    async (options?: { confirmed?: boolean }) => {
      if (isDeletingFabEntity || !editableDeleteTarget) {
        return;
      }

      const { entityType, entityId } = editableDeleteTarget;
      const typeSegment = entityType === "HABIT" ? "habit" : "project";
      const successLabel =
        entityType === "GOAL"
          ? "Goal"
          : entityType === "HABIT"
            ? "Habit"
            : "Project";

      setSaveError(null);
      if (entityType === "GOAL" && !options?.confirmed) {
        setIsPreparingGoalDelete(true);
        try {
          const supabase = getSupabaseBrowser();
          if (!supabase) {
            throw new Error("Supabase client not available");
          }
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!user) {
            throw new Error("You must be signed in to delete this goal");
          }

          const { count, error: countError } = await supabase
            .from("projects")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("goal_id", entityId);
          if (countError) throw countError;

          const fallbackName =
            typeof editableDeleteTarget.title === "string" &&
            editableDeleteTarget.title.trim().length > 0
              ? editableDeleteTarget.title.trim()
              : "this goal";
          setGoalDeleteConfirmTarget({
            goalName: goalName.trim() || fallbackName,
            projectCount: count ?? null,
          });
        } catch (error) {
          console.error("Failed to prepare FAB goal delete", {
            entityType,
            entityId,
            error,
          });
          setSaveError(
            error instanceof Error
              ? error.message
              : "Unable to prepare goal deletion",
          );
        } finally {
          setIsPreparingGoalDelete(false);
        }
        return;
      }

      setIsDeletingFabEntity(true);
      try {
        if (entityType === "GOAL") {
          const supabase = getSupabaseBrowser();
          if (!supabase) {
            throw new Error("Supabase client not available");
          }
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!user) {
            throw new Error("You must be signed in to delete this goal");
          }
          await deleteGoalCascade({
            supabase,
            goalId: entityId,
            userId: user.id,
          });
        } else {
          const response = await fetch(
            `/api/schedule/events/${typeSegment}/${entityId}`,
            {
              method: "DELETE",
            },
          );
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(
              payload?.error ?? `Unable to delete this ${typeSegment}`,
            );
          }
        }

        dispatchCreatorEntitySaved({
          entityType,
          entityId,
          action: "deleted",
          monumentId: null,
        });
        setGoalDeleteConfirmTarget(null);
        resetFabFormState();
        closeExpandedPanel({ notifyEditClose: false });
        onEditClose?.();
        await notifySchedulerOfChange();
        toast.success(`${successLabel} deleted`);
      } catch (error) {
        console.error("Failed to delete FAB edit entity", {
          entityType,
          entityId,
          error,
        });
        setSaveError(
          error instanceof Error
            ? error.message
            : entityType === "GOAL"
              ? "Unable to delete this goal"
              : `Unable to delete this ${typeSegment}`,
        );
      } finally {
        setIsDeletingFabEntity(false);
      }
    },
    [
      editableDeleteTarget,
      goalName,
      isDeletingFabEntity,
      closeExpandedPanel,
      notifySchedulerOfChange,
      onEditClose,
      resetFabFormState,
      toast,
    ],
  );

  const overhangCancelTapHandlers = useTapHandler(() => {
    closeExpandedPanel();
  });
  const overhangSaveTapHandlers = useTapHandler(() => handleFabSave(), {
    disabled: isSaveDisabled,
  });
  const handleCancelFabGoalDelete = useCallback(() => {
    if (isDeletingFabEntity) return;
    setGoalDeleteConfirmTarget(null);
  }, [isDeletingFabEntity]);
  const handleConfirmFabGoalDelete = useCallback(() => {
    if (!goalDeleteConfirmTarget || isDeletingFabEntity) return;
    void handleFabDeleteEntity({ confirmed: true });
  }, [goalDeleteConfirmTarget, handleFabDeleteEntity, isDeletingFabEntity]);
  const overhangDeleteTapHandlers = useTapHandler(
    () => {
      void handleFabDeleteEntity();
    },
    {
      disabled:
        isDeletingFabEntity || isPreparingGoalDelete || !editableDeleteTarget,
    },
  );
  const renderFabGoalDeleteInlineConfirm = (className?: string) =>
    goalDeleteConfirmTarget ? (
      <motion.div
        role="alertdialog"
        aria-labelledby="fab-goal-delete-title"
        aria-describedby="fab-goal-delete-description"
        className={cn(
          "rounded-xl border border-white/10 bg-black px-3 py-2 text-white shadow-2xl",
          className,
        )}
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 3, scale: 0.99 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p
              id="fab-goal-delete-title"
              className="text-sm font-semibold leading-tight"
            >
              Delete this goal?
            </p>
            <p
              id="fab-goal-delete-description"
              className="mt-0.5 text-[11px] leading-4 text-white/60"
            >
              {goalDeleteConfirmTarget.projectCount !== null
                ? `Deletes ${goalDeleteConfirmTarget.projectCount} ${
                    goalDeleteConfirmTarget.projectCount === 1
                      ? "project"
                      : "projects"
                  } and related tasks.`
                : "Deletes related projects and tasks."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancelFabGoalDelete}
              disabled={isDeletingFabEntity}
              className="h-7 rounded-lg px-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
            >
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmFabGoalDelete}
              disabled={isDeletingFabEntity}
              className="h-7 rounded-lg px-2 text-xs"
            >
              {isDeletingFabEntity ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
        {saveError ? (
          <p className="mt-2 rounded-lg border border-red-500/20 bg-red-900/30 px-2 py-1.5 text-[11px] leading-4 text-red-100">
            {saveError}
          </p>
        ) : null}
      </motion.div>
    ) : null;
  const handleDeleteEvent = useCallback(async () => {
    if (isDeletingEvent) {
      return;
    }
    const target = rescheduleTarget;
    if (!target) {
      return;
    }
    setDeleteError(null);
    setIsDeletingEvent(true);
    try {
      const typeSegment = target.type === "HABIT" ? "habit" : "project";
      const response = await fetch(
        `/api/schedule/events/${typeSegment}/${target.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Unable to delete this event");
      }
      setSearchResults((prev) =>
        prev.filter(
          (item) => !(item.id === target.id && item.type === target.type),
        ),
      );
      setRescheduleTarget(null);
      setRescheduleDate("");
      setRescheduleTime("");
      setRescheduleError(null);
      setDeleteError(null);
      void notifySchedulerOfChange();
    } catch (error) {
      console.error("Failed to delete schedule event", error);
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete this event",
      );
    } finally {
      setIsDeletingEvent(false);
    }
  }, [isDeletingEvent, notifySchedulerOfChange, rescheduleTarget]);

  // Close menu when clicking outside
  useEffect(() => {
    if (rescheduleTarget) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (isTourActive()) return;
      const target = event.target as Node | null;
      if (
        !target ||
        fabRootRef.current?.contains(target) ||
        !menuRef.current ||
        !buttonRef.current
      ) {
        return;
      }

      if (
        isOpen &&
        !menuRef.current.contains(target) &&
        !buttonRef.current.contains(target) &&
        !overlayButtonRef.current?.contains(target)
      ) {
        if (expanded) return;
        if (aiOpen && aiOverlayRef.current?.contains(target)) {
          return;
        }
        setIsOpen(false);
        if (aiOpen) {
          closeAiOverlay();
        } else {
          setAiOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded, isOpen, rescheduleTarget, aiOpen, closeAiOverlay]);

  useEffect(() => {
    if (isOpen || isDirectCreationOpen) return;
    if (editTarget) return;
    if (
      creationRequest &&
      openingCreationRequestIdRef.current === creationRequest.id
    ) {
      return;
    }
    if (creationSelectionTimeoutRef.current !== null) {
      window.clearTimeout(creationSelectionTimeoutRef.current);
      creationSelectionTimeoutRef.current = null;
    }
    if (mobileCreationFocusTimeoutRef.current !== null) {
      window.clearTimeout(mobileCreationFocusTimeoutRef.current);
      mobileCreationFocusTimeoutRef.current = null;
    }
    resetFabViewportState();
    setPressedCreationType(null);
    setCreationSpawnOrigin(null);
    setCreationRevealGeometry(null);
    setExpanded(false);
    setSelected(null);
  }, [
    creationRequest,
    editTarget,
    isDirectCreationOpen,
    isOpen,
    resetFabViewportState,
  ]);

  const shouldRenderNeighbor = isDragging && dragTargetPage !== null;
  const neighborPage = shouldRenderNeighbor ? dragTargetPage : null;
  const neighborDirection =
    neighborPage !== null
      ? (dragDirection ?? (pageX.get() < 0 ? 1 : -1))
      : null;

  const restingPalette = getMenuPalette(activeFabPage);
  const staticBackgroundImage = createPaletteBackground(restingPalette);
  const staticBorderColor = createPaletteBorderColor(restingPalette);
  const targetPalette =
    isDragging && dragTargetPage !== null
      ? getMenuPalette(dragTargetPage)
      : restingPalette;
  const restingBorder = restingPalette.border ?? restingPalette.highlight;
  const targetBorder = targetPalette.border ?? targetPalette.highlight;
  const baseR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[0], targetPalette.base[0], value),
  );
  const baseG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[1], targetPalette.base[1], value),
  );
  const baseB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.base[2], targetPalette.base[2], value),
  );
  const highlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[0], targetPalette.highlight[0], value),
  );
  const highlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[1], targetPalette.highlight[1], value),
  );
  const highlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.highlight[2], targetPalette.highlight[2], value),
  );
  const lowlightR = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[0], targetPalette.lowlight[0], value),
  );
  const lowlightG = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[1], targetPalette.lowlight[1], value),
  );
  const lowlightB = useTransform(dragProgress, (value) =>
    lerp(restingPalette.lowlight[2], targetPalette.lowlight[2], value),
  );
  const borderR = useTransform(dragProgress, (value) =>
    lerp(restingBorder[0], targetBorder[0], value),
  );
  const borderG = useTransform(dragProgress, (value) =>
    lerp(restingBorder[1], targetBorder[1], value),
  );
  const borderB = useTransform(dragProgress, (value) =>
    lerp(restingBorder[2], targetBorder[2], value),
  );
  const borderAlpha = useTransform(dragProgress, (value) =>
    lerp(
      restingPalette.border ? 0.45 : 0.35,
      targetPalette.border ? 0.45 : 0.35,
      value,
    ),
  );
  // Background blends from drag motion value so color transitions stay continuous during interactive paging.
  const blendedBackgroundImage = useMotionTemplate`
    radial-gradient(circle at top, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.65), rgba(${baseR}, ${baseG}, ${baseB}, 0.15) 45%),
    linear-gradient(160deg, rgba(${highlightR}, ${highlightG}, ${highlightB}, 0.95) 0%, rgba(${baseR}, ${baseG}, ${baseB}, 0.97) 50%, rgba(${lowlightR}, ${lowlightG}, ${lowlightB}, 0.98) 100%)
  `;
  const blendedBorderColor = useMotionTemplate`
    rgba(${borderR}, ${borderG}, ${borderB}, ${borderAlpha})
  `;
  const isBlendingGradient = isDragging && dragTargetPage !== null;
  const dragConstraintLeft = -normalizedStageWidth;
  const dragConstraintRight = normalizedStageWidth;
  const effectiveViewportHeight =
    expanded && (viewportHeight || stableViewportHeight)
      ? (viewportHeight ?? stableViewportHeight)
      : null;
  const editPresentationOriginRect = editTarget?.originRect ?? null;
  const shouldUseCenteredEditModal = expanded && Boolean(editTarget);
  const isGoalCreationExpanded = expanded && selected === "GOAL";
  const isProjectCreationExpanded = expanded && selected === "PROJECT";
  const isTaskCreationExpanded = expanded && selected === "TASK";
  const isHabitCreationExpanded = expanded && selected === "HABIT";
  const isContentSizedCreationExpanded =
    isGoalCreationExpanded ||
    isProjectCreationExpanded ||
    isTaskCreationExpanded ||
    isHabitCreationExpanded;
  const goalCreationMinHeight = 240;
  const goalCenteredEditMinHeight = 320;
  const projectCreationMinHeight = 280;
  const projectCenteredEditMinHeight = 480;
  const taskCreationMinHeight = 320;
  const taskCenteredEditMinHeight = 460;
  const habitCreationMinHeight = 300;
  const selectedCreationTypeMinHeight =
    selected === "GOAL"
      ? goalCreationMinHeight
      : selected === "PROJECT"
        ? projectCreationMinHeight
        : selected === "TASK"
          ? taskCreationMinHeight
          : selected === "HABIT"
            ? habitCreationMinHeight
            : null;
  const selectedCenteredEditMinHeight =
    selected === "GOAL"
      ? goalCenteredEditMinHeight
      : selected === "PROJECT"
        ? projectCenteredEditMinHeight
        : selected === "TASK"
          ? taskCenteredEditMinHeight
          : selected === "HABIT"
            ? habitCreationMinHeight
            : null;
  const selectedExpandedMinHeight = shouldUseCenteredEditModal
    ? selectedCenteredEditMinHeight
    : selectedCreationTypeMinHeight;
  useLayoutEffect(() => {
    if (
      !expanded ||
      !selected ||
      shouldUseCenteredEditModal ||
      activeCreationMode !== "main"
    )
      return;
    const node = expandedCreationBodyRef.current;
    if (!node) return;

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setCreationMainShellHeights((current) =>
        current[selected] === nextHeight
          ? current
          : {
              ...current,
              [selected]: nextHeight,
            },
      );
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeCreationMode, expanded, selected, shouldUseCenteredEditModal]);
  const selectedCreationShellHeight =
    selected && selectedCreationTypeMinHeight !== null
      ? Math.max(
          selectedCreationTypeMinHeight,
          creationMainShellHeights[selected] ?? 0,
        )
      : null;
  useLayoutEffect(() => {
    const node = attachedCreationControlsRef.current;
    if (!expanded || !node) {
      setAttachedCreationControlsHeight(null);
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      setAttachedCreationControlsHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    };

    updateHeight();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeCreationMode, expanded, selected, shouldAttachCreationControls]);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !shouldUseStableMobileFabPanel ||
      shouldUseCenteredEditModal ||
      selectedCreationTypeMinHeight === null
    ) {
      setMobileFabPanelHeight(null);
      return;
    }

    const measuredSafeBottom =
      stableSafeBottom ||
      Number.parseFloat(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--sat-safe-bottom")
          .trim() || "0",
      ) ||
      0;
    const viewport = window.visualViewport;
    const nonKeyboardViewportHeight = Math.max(
      window.innerHeight || 0,
      viewport?.height ?? 0,
      stableViewportHeight ?? 0,
    );
    const heightCap = Math.round(
      Math.max(1, nonKeyboardViewportHeight * 0.9 - 8 - measuredSafeBottom),
    );
    const footerHeight = attachedCreationControlsHeight ?? 64;
    const contentHeight =
      selectedCreationShellHeight ?? selectedCreationTypeMinHeight;
    const desiredHeight = Math.ceil(contentHeight + footerHeight + 2);
    const nextHeight = Math.min(heightCap, desiredHeight);

    setMobileFabPanelHeight((current) =>
      current === nextHeight ? current : nextHeight,
    );
  }, [
    attachedCreationControlsHeight,
    selectedCreationShellHeight,
    selectedCreationTypeMinHeight,
    shouldUseCenteredEditModal,
    shouldUseStableMobileFabPanel,
    stableSafeBottom,
    stableViewportHeight,
  ]);
  const secondaryCreationPanelMinHeight =
    expanded && isContentSizedCreationExpanded && activeCreationMode !== "main"
      ? selectedCreationShellHeight ?? selectedCreationTypeMinHeight
      : undefined;
  const baseMinHeightExpanded = expanded
    ? selectedExpandedMinHeight !== null
      ? selectedExpandedMinHeight
      : effectiveViewportHeight
        ? Math.round(effectiveViewportHeight * 0.58)
        : "58vh"
    : undefined;
  const keyboardMaxHeightExpanded =
    expanded && shouldUseKeyboardConstrainedFabSizing
      ? effectiveViewportHeight
        ? Math.round(
            Math.max(1, effectiveViewportHeight - 16 - stableSafeBottom),
          )
        : "calc(100dvh - env(safe-area-inset-bottom, 0px) - 16px)"
      : undefined;
  const centeredModalMaxHeight =
    "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)";
  const normalMaxHeightExpanded =
    expanded && !shouldUseKeyboardConstrainedFabSizing
      ? shouldUseCenteredEditModal || shouldUseDirectCreationModal
        ? centeredModalMaxHeight
        : stableViewportHeight
        ? Math.round(stableViewportHeight * 0.9 - 8 - stableSafeBottom)
        : "calc(90vh - env(safe-area-inset-bottom, 0px) - 8px)"
      : undefined;
  const maxHeightExpanded = expanded
    ? (keyboardMaxHeightExpanded ?? normalMaxHeightExpanded)
    : undefined;
  const minHeightExpanded =
    expanded &&
    shouldUseKeyboardConstrainedFabSizing &&
    typeof baseMinHeightExpanded === "number" &&
    typeof maxHeightExpanded === "number"
      ? Math.min(baseMinHeightExpanded, maxHeightExpanded)
      : baseMinHeightExpanded;
  const fallbackMobileFabPanelHeightExpanded =
    !shouldUseCenteredEditModal && selectedCreationTypeMinHeight !== null
      ? Math.ceil(
          (selectedCreationShellHeight ?? selectedCreationTypeMinHeight) +
            (attachedCreationControlsHeight ?? 64) +
            2,
        )
      : undefined;
  const stableMobileFabPanelHeightExpanded =
    expanded && shouldUseStableMobileFabPanel
      ? (mobileFabPanelHeight ??
        (fallbackMobileFabPanelHeightExpanded !== undefined &&
        stableViewportHeight
          ? Math.min(
              fallbackMobileFabPanelHeightExpanded,
              Math.round(stableViewportHeight * 0.9 - 8 - stableSafeBottom),
            )
          : fallbackMobileFabPanelHeightExpanded))
      : undefined;
  const availableMobileFabPanelHeightExpanded =
    expanded && shouldUseStableMobileFabPanel && effectiveViewportHeight
      ? Math.round(
          Math.max(1, effectiveViewportHeight - 16 - stableSafeBottom),
        )
      : undefined;
  const currentMobileFabPanelHeightExpanded =
    stableMobileFabPanelHeightExpanded !== undefined
      ? shouldUseKeyboardConstrainedFabSizing &&
        availableMobileFabPanelHeightExpanded !== undefined
        ? Math.min(
            stableMobileFabPanelHeightExpanded,
            availableMobileFabPanelHeightExpanded,
          )
        : stableMobileFabPanelHeightExpanded
      : undefined;
  const panelMinHeightExpanded =
    currentMobileFabPanelHeightExpanded ?? minHeightExpanded;
  const panelMaxHeightExpanded =
    currentMobileFabPanelHeightExpanded ?? maxHeightExpanded;
  const panelHeightExpanded = currentMobileFabPanelHeightExpanded;
  const panelSizeTransition = "border-color 0.1s linear, transform 0.2s ease";
  const shouldUseCenteredMobileCreationPanel =
    expanded &&
    isMobileViewport &&
    isContentSizedCreationExpanded &&
    !editTarget &&
    !shouldUseCenteredEditModal &&
    !shouldUseDirectCreationModal;
  const shouldUseCenteredCreationPanel =
    shouldUseDirectCreationModal || shouldUseCenteredMobileCreationPanel;
  const shouldUseCreationSpawnReveal =
    expanded &&
    !prefersReducedMotion &&
    !editTarget &&
    !shouldUseDirectCreationModal &&
    selected !== null &&
    creationSpawnOrigin !== null &&
    creationSpawnOrigin.type === selected;
  const shouldUseFabSpawnRevealForPanel =
    shouldUseCreationSpawnReveal && !shouldUseCenteredCreationPanel;
  const isCreationRevealReady =
    shouldUseFabSpawnRevealForPanel &&
    creationSpawnOrigin !== null &&
    creationRevealGeometry?.nonce === creationSpawnOrigin.nonce;
  useLayoutEffect(() => {
    if (!shouldUseFabSpawnRevealForPanel || !creationSpawnOrigin) {
      setCreationRevealGeometry(null);
      return;
    }

    const wrapper = creationRevealWrapperRef.current;
    if (!wrapper) return;

    const updateRevealGeometry = () => {
      const modalRect = wrapper.getBoundingClientRect();
      if (modalRect.width <= 0 || modalRect.height <= 0) return;

      const originCenterX =
        creationSpawnOrigin.rect.left + creationSpawnOrigin.rect.width / 2;
      const originCenterY =
        creationSpawnOrigin.rect.top + creationSpawnOrigin.rect.height / 2;
      const x = originCenterX - modalRect.left;
      const y = originCenterY - modalRect.top;
      const radius =
        Math.ceil(
          Math.max(
            Math.hypot(x, y),
            Math.hypot(modalRect.width - x, y),
            Math.hypot(x, modalRect.height - y),
            Math.hypot(modalRect.width - x, modalRect.height - y),
          ),
        ) + 48;

      setCreationRevealGeometry((current) =>
        current &&
        current.nonce === creationSpawnOrigin.nonce &&
        current.x === x &&
        current.y === y &&
        current.radius === radius
          ? current
          : {
              x,
              y,
              radius,
              nonce: creationSpawnOrigin.nonce,
            },
      );
    };

    updateRevealGeometry();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateRevealGeometry);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [
    activeCreationMode,
    creationSpawnOrigin,
    isCreationRevealReady,
    panelHeightExpanded,
    panelMaxHeightExpanded,
    panelMinHeightExpanded,
    selected,
    shouldUseFabSpawnRevealForPanel,
  ]);
  const creationRevealOriginX = creationRevealGeometry?.x ?? 0;
  const creationRevealOriginY = creationRevealGeometry?.y ?? 0;
  const creationRevealClipStart = `circle(0px at ${creationRevealOriginX}px ${creationRevealOriginY}px)`;
  const creationRevealClipEnd =
    `circle(${creationRevealGeometry?.radius ?? 0}px at ${creationRevealOriginX}px ${creationRevealOriginY}px)`;
  const centeredEditModalAnimation = useMemo(() => {
    if (!shouldUseCenteredEditModal) {
      return null;
    }

    if (!editPresentationOriginRect) {
      return {
        initial: { opacity: 0, y: 8 },
        animate: {
          opacity: 1,
          y: 0,
          transition: {
            type: "tween" as const,
            ease: "easeOut" as const,
            duration: 0.2,
          },
        },
        exit: {
          opacity: 0,
          y: 8,
          transition: {
            type: "tween" as const,
            ease: "easeIn" as const,
            duration: 0.16,
          },
        },
      };
    }

    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : 1280;
    const viewportHeight =
      typeof window !== "undefined"
        ? window.innerHeight
        : typeof stableViewportHeight === "number"
          ? stableViewportHeight
          : 800;
    const targetMaxWidth =
      selected === "GOAL"
        ? 480
        : selected === "PROJECT"
          ? 448
          : selected === "TASK"
            ? 496
            : selected === "HABIT"
              ? 464
              : 920;
    const targetWidth = Math.max(
      320,
      Math.min(viewportWidth - 24, targetMaxWidth),
    );
    const targetHeight =
      typeof minHeightExpanded === "number" ? minHeightExpanded : 420;
    const originCenterX =
      editPresentationOriginRect.left + editPresentationOriginRect.width / 2;
    const originCenterY =
      editPresentationOriginRect.top + editPresentationOriginRect.height / 2;
    const modalCenterX = viewportWidth / 2;
    const modalCenterY = viewportHeight / 2;
    const scaleX = Math.max(
      0.2,
      Math.min(1, editPresentationOriginRect.width / targetWidth),
    );
    const scaleY = Math.max(
      0.16,
      Math.min(1, editPresentationOriginRect.height / targetHeight),
    );

    return {
      initial: {
        opacity: 0.72,
        x: originCenterX - modalCenterX,
        y: originCenterY - modalCenterY,
        scaleX,
        scaleY,
      },
      animate: {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        transition: {
          type: "spring" as const,
          stiffness: 360,
          damping: 32,
          mass: 0.9,
        },
      },
      exit: {
        opacity: 0,
        x: originCenterX - modalCenterX,
        y: originCenterY - modalCenterY,
        scaleX,
        scaleY,
        transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
      },
    };
  }, [
    editPresentationOriginRect,
    minHeightExpanded,
    selected,
    shouldUseCenteredEditModal,
    stableViewportHeight,
  ]);
  const secondaryCreationPanelStyle =
    secondaryCreationPanelMinHeight !== undefined
      ? {
          minHeight: secondaryCreationPanelMinHeight,
        }
      : undefined;
  const directCreationModalAnimation = shouldUseDirectCreationModal
    ? {
        initial: { opacity: 0, scale: 0.98, y: 10 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: {
            type: "tween" as const,
            ease: "easeOut" as const,
            duration: 0.2,
          },
        },
        exit: {
          opacity: 0,
          scale: 0.98,
          y: 10,
          transition: {
            type: "tween" as const,
            ease: "easeIn" as const,
            duration: 0.16,
          },
        },
      }
    : null;
  const shouldRenderFabPanel = isOpen || expanded || isDirectCreationOpen;
  const shouldRenderAttachedCreationControls =
    expanded &&
    (shouldUseCenteredEditModal ||
      shouldUseDirectCreationModal ||
      shouldAttachCreationControls);
  const attachedCreationPanelBottom =
    expanded && isKeyboardVisible
      ? Math.round(stableSafeBottom + FAB_KEYBOARD_MODAL_GAP)
      : Math.round(stableSafeBottom + 8);
  const centeredMobileCreationPanelTop =
    shouldUseCenteredMobileCreationPanel && stableViewportHeight
      ? Math.round(stableViewportHeight / 2)
      : undefined;
  const centeredMobileCreationPanelMaxHeight =
    "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 3rem)";
  const renderAttachedCreationControls = () => (
    <div
      ref={attachedCreationControlsRef}
      data-fab-keyboard-controls
      className="relative z-10 mt-auto flex flex-[0_0_auto] flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-4 py-3 backdrop-blur-sm sm:px-5"
    >
      <div className="flex items-center gap-2">
        {selected && activeCreationModes.length > 1
          ? activeCreationModes.map((mode) => {
              const isActive = activeCreationMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setActiveCreationMode(mode.id)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border backdrop-blur-xl transition duration-150",
                    isActive
                      ? "border-white/18 bg-[linear-gradient(180deg,rgba(34,38,43,0.96),rgba(64,68,76,0.9))] text-white shadow-[0_10px_18px_rgba(0,0,0,0.28),inset_0_2px_4px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.08)] translate-y-[1px]"
                      : "border-white/10 bg-[linear-gradient(180deg,rgba(104,110,120,0.34),rgba(54,58,66,0.3))] text-white/68 shadow-[0_10px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.14)] hover:border-white/16 hover:bg-[linear-gradient(180deg,rgba(118,124,134,0.38),rgba(60,64,72,0.34))] hover:text-white/86",
                  )}
                  aria-pressed={isActive}
                  aria-label={mode.label}
                  title={mode.label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })
          : null}
      </div>
      <AnimatePresence initial={false}>
        {renderFabGoalDeleteInlineConfirm(
          "pointer-events-auto absolute bottom-[calc(100%-0.25rem)] left-0 right-0 z-30 w-full",
        )}
      </AnimatePresence>
      <div className="flex items-center gap-3">
        {editableDeleteTarget ? (
          <Button
            type="button"
            aria-label={`Delete ${editableDeleteTarget.entityType.toLowerCase()}`}
            variant="ghost"
            size="iconSquare"
            disabled={isDeletingFabEntity || isPreparingGoalDelete}
            className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation border border-white/15 bg-black text-white hover:bg-zinc-900 disabled:opacity-50"
            {...overhangDeleteTapHandlers}
          >
            <Trash2
              className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
              aria-hidden="true"
            />
          </Button>
        ) : null}

        <Button
          type="button"
          aria-label="Discard"
          variant="cancelSquare"
          size="iconSquare"
          className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation"
          {...overhangCancelTapHandlers}
        >
          <X
            className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
            aria-hidden="true"
          />
        </Button>

        <Button
          type="button"
          aria-label="Save"
          variant="confirmSquare"
          size="iconSquare"
          disabled={isSaveDisabled}
          className={cn(
            "drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation bg-white/10 text-white transition hover:bg-white/20",
            isSaveDisabled ? "opacity-50" : "",
          )}
          {...overhangSaveTapHandlers}
        >
          <Check
            className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
            aria-hidden="true"
          />
        </Button>
      </div>
    </div>
  );

  const fabContent = (
    <div
      className={cn("relative", className)}
      ref={fabRootRef}
      {...wrapperProps}
    >
      {/* AddEvents Menu */}
      <AnimatePresence>
        {shouldRenderFabPanel && (
          <>
            {expanded
              ? createPortal(
                  <div
                    data-fab-overlay
                    className={cn(
                      "fixed inset-0 bg-black/60 backdrop-blur-sm",
                      shouldUseCenteredEditModal || shouldUseDirectCreationModal
                        ? "z-[2147483649]"
                        : "z-40",
                    )}
                    style={{ touchAction: "manipulation" }}
                    onWheel={(event) => event.preventDefault()}
                    onTouchMove={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />,
                  document.body,
                )
              : null}
            {(() => {
              const panelShell = (
                <div
                  className={cn(
                    shouldUseCenteredEditModal || shouldUseDirectCreationModal
                      ? "fixed inset-0 z-[2147483650] flex items-center justify-center px-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-4"
                      : shouldUseCenteredMobileCreationPanel
                        ? "fixed left-1/2 top-1/2 z-[2147483650] box-border -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        : "bottom-20 mb-2 z-[2147483650] flex flex-col items-stretch",
                    !shouldUseCenteredEditModal &&
                      !shouldUseCenteredCreationPanel &&
                      (expanded ? "fixed" : "absolute"),
                    !shouldUseCenteredEditModal &&
                      !shouldUseCenteredCreationPanel &&
                      menuClassName,
                  )}
                  style={
                    expanded && shouldUseCenteredMobileCreationPanel
                      ? {
                          top: centeredMobileCreationPanelTop,
                        }
                      : expanded &&
                          shouldAttachCreationControls &&
                          !shouldUseCenteredCreationPanel &&
                          !shouldUseCenteredEditModal
                        ? {
                            bottom: attachedCreationPanelBottom,
                            marginBottom: 0,
                          }
                        : undefined
                  }
                >
              <motion.div
                ref={creationRevealWrapperRef}
                key={
                  shouldUseFabSpawnRevealForPanel && creationSpawnOrigin
                    ? isCreationRevealReady
                      ? `fab-creation-spawn-${creationSpawnOrigin.nonce}`
                      : `fab-creation-spawn-measure-${creationSpawnOrigin.nonce}`
                    : "fab-panel-frame"
                }
                className={cn(
                  "relative",
                  (shouldUseCenteredEditModal ||
                    shouldUseCenteredCreationPanel) &&
                    "pointer-events-auto",
                )}
                style={{
                  borderRadius: "0.5rem",
                  transformOrigin:
                    shouldUseCenteredEditModal || shouldUseCenteredCreationPanel
                      ? "center center"
                      : `${creationRevealOriginX}px ${creationRevealOriginY}px`,
                  willChange: shouldUseFabSpawnRevealForPanel
                    ? "clip-path, opacity"
                    : undefined,
                  pointerEvents:
                    shouldUseFabSpawnRevealForPanel && !isCreationRevealReady
                      ? "none"
                      : undefined,
                }}
                initial={
                  shouldUseFabSpawnRevealForPanel
                    ? { opacity: 0, clipPath: creationRevealClipStart }
                    : false
                }
                animate={
                  shouldUseFabSpawnRevealForPanel
                    ? isCreationRevealReady
                      ? {
                          opacity: 1,
                          clipPath: creationRevealClipEnd,
                          transition: {
                            type: "tween",
                            ease: [0.16, 1, 0.3, 1],
                            duration: FAB_CREATION_ENTER_MS / 1000,
                          },
                        }
                      : { opacity: 0, clipPath: creationRevealClipStart }
                    : { opacity: 1 }
                }
                exit={
                  shouldUseFabSpawnRevealForPanel
                    ? {
                        opacity: 0,
                        transition: {
                          type: "tween",
                          ease: "easeIn",
                          duration: 0.16,
                        },
                      }
                    : undefined
                }
              >
                <motion.div
                  data-tour="fab-panel"
                  data-fab-overlay
                  ref={(node) => {
                    menuRef.current = node;
                    panelRef.current = node;
                  }}
                  layoutId={
                    shouldUseCenteredEditModal && editPresentationOriginRect
                      ? (editTarget?.layoutId ?? undefined)
                      : undefined
                  }
                  className={cn(
                    "border rounded-lg shadow-2xl",
                    expanded
                      ? "bg-[var(--surface-elevated)]"
                      : "bg-gradient-to-b from-zinc-500 via-zinc-600 to-zinc-700",
                    expanded &&
                      (shouldUseCenteredEditModal ||
                        shouldUseCenteredCreationPanel ||
                        shouldAttachCreationControls) &&
                      "flex flex-col overflow-hidden",
                    expanded
                      ? isGoalCreationExpanded
                        ? "w-[calc(100vw-1.5rem)] max-w-[30rem]"
                        : isProjectCreationExpanded
                          ? "w-[calc(100vw-2rem)] max-w-[28rem]"
                          : isTaskCreationExpanded
                            ? "w-[calc(100vw-1.5rem)] max-w-[31rem]"
                            : isHabitCreationExpanded
                              ? "w-[calc(100vw-1.5rem)] max-w-[29rem]"
                              : "w-[92vw] max-w-[920px]"
                      : "min-w-[200px]",
                  )}
                  layout={
                    !expanded &&
                    !shouldUseCenteredEditModal &&
                    !shouldUseDirectCreationModal
                  }
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchMove={(event) => {
                    if (!expanded) {
                      event.stopPropagation();
                    }
                  }}
                  onPointerDown={(event) => {
                    if (!expanded) {
                      event.stopPropagation();
                    }
                  }}
                  onPointerDownCapture={handleExpandedPointerDownCapture}
                  style={{
                    boxShadow: MENU_BOX_SHADOW,
                    borderColor: isBlendingGradient
                      ? blendedBorderColor
                      : staticBorderColor,
                    transition: panelSizeTransition,
                    transformOrigin:
                      shouldUseCenteredEditModal || shouldUseDirectCreationModal
                        ? "center center"
                        : shouldUseCenteredMobileCreationPanel
                          ? "center center"
                        : menuVariant === "timeline"
                          ? "bottom right"
                          : "bottom center",
                    minHeight: expanded
                      ? shouldUseCenteredCreationPanel
                        ? undefined
                        : panelMinHeightExpanded
                      : menuContainerHeight,
                    maxHeight: expanded
                      ? shouldUseCenteredCreationPanel
                        ? centeredMobileCreationPanelMaxHeight
                        : panelMaxHeightExpanded
                      : menuContainerHeight,
                    height: expanded
                      ? shouldUseCenteredCreationPanel
                        ? undefined
                        : panelHeightExpanded
                      : menuContainerHeight,
                    minWidth: expanded ? undefined : (menuWidth ?? undefined),
                    width: expanded ? undefined : (menuWidth ?? undefined),
                    maxWidth: expanded ? undefined : (menuWidth ?? undefined),
                    touchAction: expanded ? "manipulation" : undefined,
                    overflowY:
                      expanded &&
                      !shouldUseCenteredEditModal &&
                      !shouldUseCenteredCreationPanel &&
                      !shouldAttachCreationControls
                        ? "auto"
                        : "hidden",
                    overflowX: "hidden",
                    overscrollBehavior: expanded ? "contain" : undefined,
                  }}
                  initial={
                    shouldUseFabSpawnRevealForPanel
                      ? false
                      : (centeredEditModalAnimation?.initial ??
                        directCreationModalAnimation?.initial ?? {
                          opacity: 0,
                          y: 8,
                        })
                  }
                  animate={
                    shouldUseFabSpawnRevealForPanel
                      ? { opacity: 1, y: 0 }
                      : (centeredEditModalAnimation?.animate ??
                        directCreationModalAnimation?.animate ?? {
                          opacity: 1,
                          y: 0,
                          transition: {
                            type: "tween",
                            ease: "easeOut",
                            duration: 0.2,
                          },
                        })
                  }
                  exit={
                    shouldUseFabSpawnRevealForPanel
                      ? { opacity: 1 }
                      : (centeredEditModalAnimation?.exit ??
                        directCreationModalAnimation?.exit ?? {
                          opacity: 0,
                          y: 8,
                          transition: {
                            type: "tween",
                            ease: "easeIn",
                            duration: 0.2,
                          },
                        })
                  }
                  onWheel={handleMenuWheel}
                >
                  <div
                    data-fab-scroll-body={
                      shouldUseCenteredEditModal ||
                      shouldUseCenteredCreationPanel ||
                      shouldUseScrollableFabBody
                        ? ""
                        : undefined
                    }
                    className={cn(
                      shouldUseCenteredEditModal
                        ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        : shouldUseCenteredCreationPanel
                        ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
                        : shouldUseScrollableFabBody
                          ? "min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain"
                          : shouldRenderAttachedCreationControls
                          ? "flex-none overflow-visible"
                          : null,
                    )}
                  >
                    <motion.div
                      className={cn(
                        "relative w-full",
                        isContentSizedCreationExpanded ? "" : "h-full",
                      )}
                      style={{
                        backgroundImage: isBlendingGradient
                          ? blendedBackgroundImage
                          : staticBackgroundImage,
                        borderRadius: "inherit",
                      }}
                    >
                      <div
                        ref={stageRef}
                        data-tour="fab-swipe"
                        className={cn(
                          "relative w-full rounded-[inherit]",
                          isContentSizedCreationExpanded ? "" : "h-full",
                        )}
                        style={{ touchAction: "pan-y" }}
                      >
                        <motion.div
                          className={cn(
                            "flex",
                            isContentSizedCreationExpanded
                              ? "relative w-full"
                              : "absolute inset-0",
                          )}
                          drag="x"
                          dragListener={false}
                          dragControls={pageDragControls}
                          dragElastic={0}
                          dragMomentum={false}
                          dragConstraints={{
                            left: dragConstraintLeft,
                            right: dragConstraintRight,
                          }}
                          style={{ x: pageX }}
                          onPointerDown={
                            !expanded ? handlePagePointerDown : undefined
                          }
                          onPointerMove={
                            !expanded ? handlePagePointerMove : undefined
                          }
                          onPointerUp={
                            !expanded ? clearPendingFabSwipe : undefined
                          }
                          onPointerCancel={
                            !expanded ? clearPendingFabSwipe : undefined
                          }
                          onDragStart={handlePageDragStart}
                          onDrag={handlePageDrag}
                          onDragEnd={handlePageDragEnd}
                          dragPropagation
                        >
                          <motion.div
                            className={cn(
                              "z-10 flex",
                              isContentSizedCreationExpanded
                                ? "relative w-full"
                                : "absolute inset-0",
                            )}
                            variants={pageVariants}
                            initial="open"
                            animate="open"
                            style={{ borderRadius: "inherit" }}
                          >
                            {renderPage(activeFabPage)}
                          </motion.div>
                        </motion.div>
                        {neighborPage !== null &&
                          neighborDirection !== null &&
                          !expanded && (
                            <motion.div
                              className="pointer-events-none absolute inset-0 z-0 flex"
                              style={{
                                x:
                                  neighborDirection === 1
                                    ? incomingFromRight
                                    : incomingFromLeft,
                              }}
                            >
                              <motion.div
                                className="absolute inset-0 flex overflow-hidden"
                                variants={pageVariants}
                                initial="open"
                                animate="open"
                                style={{ borderRadius: "inherit" }}
                              >
                                {renderPage(neighborPage)}
                              </motion.div>
                            </motion.div>
                          )}
                      </div>
                    </motion.div>
                  </div>
                  {shouldRenderAttachedCreationControls ? (
                    renderAttachedCreationControls()
                  ) : null}
                </motion.div>
              </motion.div>
              {shouldRenderTimelineOverlayButton && (
                <motion.button
                  ref={overlayButtonRef}
                  type="button"
                  aria-label="Add overlay"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] px-6 py-3 text-white shadow-[0_25px_60px_rgba(0,0,0,0.85)] ring-1 ring-black/40 transition hover:ring-black/60 pointer-events-auto"
                  onPointerDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleOverlayPickerClose();
                    setOverlayOpen(true);
                  }}
                >
                  <span className="text-sm opacity-80">add</span>
                  <span className="text-lg font-bold">OVERLAY</span>
                </motion.button>
              )}
                </div>
              );

              return (shouldUseCenteredEditModal ||
                shouldUseCenteredCreationPanel) &&
                typeof document !== "undefined"
                ? createPortal(panelShell, document.body)
                : panelShell;
            })()}
            {expanded &&
            !shouldHideOverhangButtons &&
            !shouldUseCenteredEditModal &&
            selected &&
            activeCreationModes.length > 1 &&
            creationModeOverhangPos
              ? createPortal(
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 3 }}
                    transition={{
                      type: "tween",
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    className="pointer-events-auto fixed"
                    style={{
                      left: creationModeOverhangPos.left,
                      top: creationModeOverhangPos.top,
                      width: creationModeClusterWidth,
                      zIndex: 2147483651,
                      transition:
                        "top 0.18s ease, left 0.18s ease, transform 0.18s ease",
                      transform:
                        expanded && keyboardLift > 0
                          ? `translateY(${-keyboardLift}px)`
                          : undefined,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {activeCreationModes.map((mode) => {
                        const isActive = activeCreationMode === mode.id;
                        const Icon = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setActiveCreationMode(mode.id)}
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-lg border backdrop-blur-xl transition duration-150",
                              isActive
                                ? "border-white/18 bg-[linear-gradient(180deg,rgba(34,38,43,0.96),rgba(64,68,76,0.9))] text-white shadow-[0_10px_18px_rgba(0,0,0,0.28),inset_0_2px_4px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.08)] translate-y-[1px]"
                                : "border-white/10 bg-[linear-gradient(180deg,rgba(104,110,120,0.34),rgba(54,58,66,0.3))] text-white/68 shadow-[0_10px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.14)] hover:border-white/16 hover:bg-[linear-gradient(180deg,rgba(118,124,134,0.38),rgba(60,64,72,0.34))] hover:text-white/86",
                            )}
                            aria-pressed={isActive}
                            aria-label={mode.label}
                            title={mode.label}
                          >
                            <Icon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>,
                  document.body,
                )
              : null}
            {expanded && !shouldHideOverhangButtons && !shouldUseCenteredEditModal
              ? createPortal(
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 4 }}
                    transition={{
                      type: "tween",
                      duration: 0.18,
                      ease: "easeOut",
                    }}
                    className="pointer-events-auto fixed"
                    style={{
                      width: overhangControlWidth,
                      left: overhangPos?.left,
                      top: overhangPos?.top,
                      right: overhangPos ? undefined : 12,
                      bottom: overhangPos
                        ? undefined
                        : "calc(12px + env(safe-area-inset-bottom, 0px))",
                      zIndex: 2147483651,
                      transition:
                        "top 0.18s ease, left 0.18s ease, right 0.18s ease, bottom 0.18s ease, transform 0.18s ease",
                      transform:
                        expanded && keyboardLift > 0
                          ? `translateY(${-keyboardLift}px)`
                          : undefined,
                    }}
                  >
                    <AnimatePresence initial={false}>
                      {renderFabGoalDeleteInlineConfirm(
                        "absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-30 w-full",
                      )}
                    </AnimatePresence>
                    <div className="flex items-center gap-3">
                      {editableDeleteTarget ? (
                        <Button
                          type="button"
                          aria-label={`Delete ${editableDeleteTarget.entityType.toLowerCase()}`}
                          variant="ghost"
                          size="iconSquare"
                          disabled={
                            isDeletingFabEntity || isPreparingGoalDelete
                          }
                          className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation border border-white/15 bg-black text-white hover:bg-zinc-900 disabled:opacity-50"
                          {...overhangDeleteTapHandlers}
                        >
                          <Trash2
                            className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                            aria-hidden="true"
                          />
                        </Button>
                      ) : null}

                      <Button
                        type="button"
                        aria-label="Discard"
                        variant="cancelSquare"
                        size="iconSquare"
                        className="drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation"
                        {...overhangCancelTapHandlers}
                      >
                        <X
                          className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                          aria-hidden="true"
                        />
                      </Button>

                      <Button
                        type="button"
                        aria-label="Save"
                        variant="confirmSquare"
                        size="iconSquare"
                        disabled={isSaveDisabled}
                        className={cn(
                          "drop-shadow-xl shrink-0 transform-none hover:scale-100 active:translate-y-0 transition-none touch-manipulation bg-white/10 text-white transition hover:bg-white/20",
                          isSaveDisabled ? "opacity-50" : "",
                        )}
                        {...overhangSaveTapHandlers}
                      >
                        <Check
                          className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  </motion.div>,
                  document.body,
                )
              : null}
          </>
        )}
      </AnimatePresence>

      {/* FAB Button - Restored to your original styling */}
      {!hideLauncher ? (
        <motion.button
          data-tour="fab"
          ref={buttonRef}
          onClick={handleFabButtonClick}
          aria-label={isOpen ? "Open ILAV" : "Add new item"}
          className={cn(
            "relative flex h-14 w-14 items-center justify-center overflow-visible rounded-full border border-white/[0.12] text-white shadow-lg backdrop-blur-xl transition hover:scale-110 hover:border-white/[0.18]",
            isOpen ? "rotate-45" : "",
            shouldAttachCreationControls ? "pointer-events-none" : "",
          )}
          onTouchStart={handleFabButtonTouchStart}
          onTouchEnd={handleFabButtonTouchEnd}
          onTouchCancel={handleFabButtonTouchCancel}
          onWheel={handleFabButtonWheel}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          style={{
            background:
              "linear-gradient(145deg, rgba(18,18,22,0.94) 0%, rgba(8,9,12,0.88) 48%, rgba(2,3,6,0.92) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -10px 18px rgba(0,0,0,0.36), 0 18px 38px rgba(0,0,0,0.52), 0 8px 18px rgba(0,0,0,0.38)",
            filter: "none",
          }}
        >
          {isOpen ? (
            <Brain className="h-8 w-8" aria-hidden="true" />
          ) : (
            <Plus className="h-8 w-8" aria-hidden="true" />
          )}
        </motion.button>
      ) : null}

      {/* Event Creation Modal */}
      <EventModal
        isOpen={modalEventType !== null}
        onClose={() => setModalEventType(null)}
        eventType={modalEventType!}
      />
      <NoteModal isOpen={showNote} onClose={() => setShowNote(false)} />
      <PostModal isOpen={showPost} onClose={() => setShowPost(false)} />
      <ComingSoonModal
        isOpen={comingSoon !== null}
        onClose={() => setComingSoon(null)}
        label={comingSoon || ""}
      />
      {overlayOpen &&
        createPortal(
          <div className="fixed inset-0 z-[2147483662] flex items-center justify-center px-4 py-6 overflow-y-auto">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setOverlayOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-[520px] max-h-[calc(100vh-3rem)] overflow-y-auto rounded-3xl border border-black/60 bg-gradient-to-br from-[#020202] via-[#050505] to-[#0b0b0b] p-6 text-white shadow-[0_30px_80px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
                    OVERLAY
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Save overlay"
                    onClick={handleLiveOverlaySave}
                    disabled={!overlayIntervalValid || isSavingLiveOverlay}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border border-transparent bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-0 text-white transition hover:from-emerald-600 hover:via-emerald-500 hover:to-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                      (!overlayIntervalValid || isSavingLiveOverlay) &&
                        "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Close overlay draft"
                    className="rounded-full border border-black/80 bg-white/5 p-2 text-white transition hover:border-black/60"
                    onClick={() => setOverlayOpen(false)}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={startTimeInputId}
                    className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white/70"
                  >
                    Start
                  </label>
                  <input
                    id={startTimeInputId}
                    type="time"
                    aria-label="Set overlay start time"
                    className="flex-1 min-w-[96px] h-8 rounded-md border border-black bg-white/5 px-1 text-[0.65rem] font-semibold text-white outline-none transition focus:border-gray-300 focus-visible:border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-400/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                    value={overlayStartInputValue}
                    onChange={handleStartTimeInputChange}
                    onFocus={() => setStartInputFocused(true)}
                    onBlur={() => setStartInputFocused(false)}
                    style={
                      startInputFocused ? { borderColor: "#d1d5db" } : undefined
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={endTimeInputId}
                    className="text-[9px] font-semibold uppercase tracking-[0.4em] text-white/70"
                  >
                    End
                  </label>
                  <input
                    id={endTimeInputId}
                    type="time"
                    aria-label="Set overlay end time"
                    className="flex-1 min-w-[96px] h-8 rounded-md border border-black bg-white/5 px-1 text-[0.65rem] font-semibold text-white outline-none transition focus:border-gray-300 focus-visible:border-gray-300 focus-visible:ring-2 focus-visible:ring-gray-400/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                    value={overlayEndInputValue}
                    onChange={handleEndTimeInputChange}
                    onFocus={() => setEndInputFocused(true)}
                    onBlur={() => setEndInputFocused(false)}
                    style={
                      endInputFocused ? { borderColor: "#d1d5db" } : undefined
                    }
                  />
                </div>
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.4em] text-white/40">
                {overlayDurationLabel} window
              </div>

              {overlaySaveError ? (
                <p className="mt-3 text-xs text-rose-400">{overlaySaveError}</p>
              ) : null}

              {overlayPickerSelected && !overlayPickerOpen ? (
                <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-white/70">
                  <span className="truncate">
                    Placing {overlayPickerSelected.name}
                  </span>
                  <button
                    type="button"
                    className="ml-auto rounded-full border border-white/20 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/40"
                    onClick={handlePlacementCancel}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {overlayPickerOpen ? (
                <div className="mt-4 relative">
                  <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-black/60 bg-gradient-to-b from-[#0a0a0a] to-[#020202]">
                    <FabNexus
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      results={overlayPickerResults}
                      isSearching={isSearching}
                      isLoadingMore={isLoadingMore}
                      error={searchError}
                      hasMore={Boolean(searchCursor)}
                      onLoadMore={handleLoadMoreResults}
                      onSelectResult={handleOverlayPickerResult}
                      inputRef={nexusInputRef}
                      filterMonumentId={overlayFilterMonumentId}
                      onFilterMonumentChange={setOverlayFilterMonumentId}
                      filterSkillId={overlayFilterSkillId}
                      onFilterSkillChange={setOverlayFilterSkillId}
                      filterEventType={overlayFilterEventType}
                      onFilterEventTypeChange={setOverlayFilterEventType}
                      sortMode={overlaySortMode}
                      onSortModeChange={setOverlaySortMode}
                      availableMonuments={monuments}
                      availableSkills={skills}
                      showToolbar
                    />
                    <button
                      type="button"
                      aria-label="Close Nexus"
                      className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] text-white shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition hover:scale-[1.05] focus-visible:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                      onClick={handleOverlayPickerClose}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 relative">
                  <div
                    ref={overlayTimelineRef}
                    className={cn(
                      "mt-0 w-full -mx-6 pb-0 relative",
                      overlayPickerSelected
                        ? "cursor-pointer"
                        : "cursor-default",
                    )}
                    onClick={handleTimelineClick}
                  >
                    <DayTimeline
                      className="w-full !rounded-none !border-0 !shadow-none !backdrop-blur-none"
                      style={{
                        background: "transparent",
                        borderRadius: 0,
                        "--timeline-right-gutter": "0px",
                        "--timeline-grid-right": "0px",
                        "--timeline-card-right": "0px",
                      }}
                      date={overlayStartTime}
                      startHour={overlayTimelineStartHour}
                      endHour={overlayTimelineEndHour}
                      pxPerMin={overlayTimelinePxPerMin}
                    >
                      {renderOverlayPlacements.map((placement) => {
                        const startMinutes = Math.max(
                          0,
                          (placement.start.getTime() -
                            overlayStartTime.getTime()) /
                            60000,
                        );
                        const durationMinutes = Math.max(
                          1,
                          (placement.end.getTime() -
                            placement.start.getTime()) /
                            60000,
                        );
                        const normalizedStartMinutes =
                          clampOverlayPlacementStart(
                            startMinutes,
                            durationMinutes,
                            overlayWindowMinutes,
                          );
                        const placementTheme =
                          getOverlayPlacementTheme(placement);
                        const overlayIsDragging = Boolean(activeOverlayDragId);
                        const isDragging = activeOverlayDragId === placement.id;
                        const isRemovalCandidate =
                          overlayRemovalCandidateId === placement.id;
                        const removalStyle = isRemovalCandidate
                          ? {
                              borderColor: "rgba(248, 113, 113, 0.9)",
                              boxShadow:
                                "0 0 0 10px rgba(248, 113, 113, 0.25),0 18px 38px rgba(6,6,10,0.48),0 8px 16px rgba(0,0,0,0.35)",
                            }
                          : {};
                        const staticCardStyle = {
                          top: minutesToTimelineStyle(normalizedStartMinutes),
                          height: minutesToTimelineStyle(durationMinutes),
                          left: "var(--timeline-card-left)",
                          right: "var(--timeline-card-right)",
                          background: placementTheme.background,
                          borderColor: placementTheme.borderColor,
                          outline: "1px solid rgba(255, 255, 255, 0.08)",
                          outlineOffset: "-1px",
                        };
                        const baseShadow = isDragging
                          ? "0 0 42px rgba(0,0,0,0.42),0 12px 24px rgba(0,0,0,0.34)"
                          : "0 0 0 1px rgba(255,255,255,0.035),0 5px 14px rgba(0,0,0,0.22)";
                        const filterValue = isDragging
                          ? "brightness(1.09)"
                          : overlayIsDragging
                            ? "brightness(0.92)"
                            : undefined;
                        const opacityValue =
                          overlayIsDragging && !isDragging ? 0.82 : 1;
                        const zValue = isDragging
                          ? 32
                          : isRemovalCandidate
                            ? 10
                            : 2;
                        const transitionStyle = isDragging
                          ? "top 0.15s ease, filter 0.2s ease, opacity 0.2s ease"
                          : "top 0.15s ease, box-shadow 0.25s ease, filter 0.2s ease, opacity 0.2s ease";
                        const activeStyle = staticCardStyle;
                        const dragTransformStyle = isDragging
                          ? { y: 0 }
                          : undefined;

                        return (
                          <motion.div
                            key={placement.id}
                            drag="y"
                            dragDirectionLock
                            dragElastic={0}
                            dragMomentum={false}
                            dragSnapToOrigin={false}
                            dragPropagation={false}
                            dragConstraints={overlayTimelineRef}
                            onDragStart={(event, info) =>
                              handleOverlayDragStart(placement, event, info)
                            }
                            onDrag={(event, info) =>
                              handleOverlayDrag(placement, info)
                            }
                            onDragEnd={(event, info) =>
                              handleOverlayDragEnd(placement, info)
                            }
                            whileDrag={{ scale: 1.02 }}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            className={cn(
                              "absolute flex h-full flex-col justify-center overflow-hidden rounded-[var(--schedule-instance-radius)] border px-3 py-2 backdrop-blur-sm text-white select-none touch-none [user-select:none] [-webkit-user-select:none] [-webkit-touch-callout:none] pointer-events-auto cursor-grab active:cursor-grabbing transition-all duration-200 ease-out",
                              isRemovalCandidate && "ring-2 ring-red-400/70",
                            )}
                            style={{
                              ...activeStyle,
                              ...dragTransformStyle,
                              ...removalStyle,
                              zIndex: zValue,
                              boxShadow: baseShadow,
                              filter: filterValue,
                              opacity: opacityValue,
                              transition: transitionStyle,
                              willChange: "transform, opacity, filter",
                            }}
                          >
                            {(() => {
                              const goalLabel =
                                placement.goalName?.trim() || null;
                              const flameLevel =
                                placement.type === "PROJECT"
                                  ? normalizeFlameLevel(placement.energy)
                                  : null;
                              return (
                                <div className="flex w-full items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="block text-sm font-semibold leading-tight text-white break-words">
                                      {placement.name}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end justify-start gap-1 text-right self-start">
                                    {goalLabel ? (
                                      <span className="max-w-[180px] truncate text-[9px] font-semibold uppercase tracking-[0.3em] text-white/70">
                                        {goalLabel}
                                      </span>
                                    ) : null}
                                    {flameLevel ? (
                                      <FlameEmber
                                        level={flameLevel}
                                        size="sm"
                                        className="drop-shadow-[0_0_6px_rgba(0,0,0,0.45)]"
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })()}
                          </motion.div>
                        );
                      })}
                    </DayTimeline>
                    {(() => {
                      const isTrashMode = overlayDragMode === "remove";
                      const showTrashIcon = isDraggingOverlay || isTrashMode;
                      return (
                        <button
                          ref={overlayNexusDropRef}
                          type="button"
                          aria-label={
                            isTrashMode ? "Remove event" : "Open Nexus"
                          }
                          className={cn(
                            "absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border bg-gradient-to-br from-[#111111] via-[#0d0d0d] to-[#050505] shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
                            isTrashMode
                              ? "border-red-500 text-red-100 hover:border-red-400"
                              : "border-white/20 text-white hover:ring-white",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isTrashMode) {
                              handleAddFromNexusClick();
                            }
                          }}
                        >
                          {showTrashIcon ? (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          </div>,
          document.body,
        )}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence initial={false}>
              {aiOpen ? (
                <motion.div
                  key="ilav-overlay"
                  ref={aiOverlayRef}
                  className="fixed inset-0 z-[2147483655] flex items-center justify-center overflow-hidden p-4"
                  initial="closed"
                  animate="open"
                  exit="closed"
                >
                  <motion.div
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    variants={{
                      closed: {
                        opacity: 0,
                        transition: {
                          duration: prefersReducedMotion ? 0.08 : 0.18,
                          ease: [0.4, 0, 1, 1],
                        },
                      },
                      open: {
                        opacity: 1,
                        transition: {
                          duration: prefersReducedMotion ? 0.08 : 0.28,
                          delay: prefersReducedMotion ? 0 : 0.1,
                          ease: [0.16, 1, 0.3, 1],
                        },
                      },
                    }}
                  />
                  <motion.div
                    className="fixed flex flex-col overflow-hidden border bg-[#020205]/95 text-white"
                    variants={{
                      closed: prefersReducedMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            top: aiOverlayOrigin.top,
                            left: aiOverlayOrigin.left,
                            width: aiOverlayOrigin.width,
                            height: aiOverlayOrigin.height,
                            borderRadius: aiOverlayOrigin.borderRadius,
                            borderColor: aiOverlayOrigin.borderColor,
                            backgroundColor: aiOverlayOrigin.backgroundColor,
                            boxShadow: aiOverlayOrigin.boxShadow,
                          },
                      open: prefersReducedMotion
                        ? {
                            opacity: 1,
                            top: aiOverlayOrigin.targetTop,
                            left: aiOverlayOrigin.targetLeft,
                            width: aiOverlayOrigin.targetWidth,
                            height: aiOverlayOrigin.targetHeight,
                            borderRadius: "16px",
                            borderColor: "rgba(255, 255, 255, 0.2)",
                            backgroundColor: "rgba(2, 2, 5, 0.95)",
                            boxShadow:
                              "0 32px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)",
                          }
                        : {
                            opacity: 1,
                            top: aiOverlayOrigin.targetTop,
                            left: aiOverlayOrigin.targetLeft,
                            width: aiOverlayOrigin.targetWidth,
                            height: aiOverlayOrigin.targetHeight,
                            borderRadius: "16px",
                            borderColor: "rgba(255, 255, 255, 0.2)",
                            backgroundColor: "rgba(2, 2, 5, 0.95)",
                            boxShadow:
                              "0 32px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)",
                          },
                    }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0.08, ease: "easeOut" }
                        : {
                            type: "tween",
                            duration: 0.42,
                            ease: [0.16, 1, 0.3, 1],
                          }
                    }
                    style={{
                      willChange:
                        "top, left, width, height, opacity, border-radius, box-shadow",
                    }}
                  >
                    <motion.div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      initial={{ opacity: prefersReducedMotion ? 0 : 1 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: prefersReducedMotion ? 0 : 1 }}
                      transition={{
                        duration: prefersReducedMotion ? 0.08 : 0.24,
                        ease: "easeOut",
                      }}
                      style={{
                        backgroundColor: aiOverlayOrigin.backgroundColor,
                        backgroundImage: aiOverlayOrigin.backgroundImage,
                      }}
                    />
                    <motion.button
                      type="button"
                      onClick={closeAiOverlay}
                      aria-label="Close ILAV"
                      className="absolute right-4 top-4 z-10 rounded-full p-2 text-white/70 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      variants={{
                        closed: { opacity: 0 },
                        open: {
                          opacity: 1,
                          transition: {
                            duration: prefersReducedMotion ? 0.08 : 0.18,
                            delay: prefersReducedMotion ? 0 : 0.16,
                            ease: "easeOut",
                          },
                        },
                      }}
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </motion.button>
                    <motion.div
                      className="relative flex min-h-[240px] flex-1 flex-col items-start justify-start px-6 py-5 pr-16 text-left"
                      variants={{
                        closed: { opacity: 0 },
                        open: {
                          opacity: 1,
                          transition: {
                            duration: prefersReducedMotion ? 0.08 : 0.2,
                            delay: prefersReducedMotion ? 0 : 0.18,
                            ease: "easeOut",
                          },
                        },
                      }}
                    >
                      <h2 className="text-sm font-semibold leading-tight text-white">
                        Ilav - Personal Assistant
                      </h2>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
                        COMING SOON
                      </p>
                    </motion.div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
      <FabRescheduleOverlay
        open={Boolean(rescheduleTarget)}
        target={rescheduleTarget}
        dateValue={rescheduleDate}
        timeValue={rescheduleTime}
        error={rescheduleError}
        deleteError={deleteError}
        isSaving={isSavingReschedule}
        isDeleting={isDeletingEvent}
        onDateChange={setRescheduleDate}
        onTimeChange={setRescheduleTime}
        onClose={handleCloseReschedule}
        onSave={handleRescheduleSave}
        onDelete={handleDeleteEvent}
      />
      <PaywallModal
        open={Boolean(activeLimitCode)}
        onOpenChange={handleLimitModalOpenChange}
        title={limitModalTitle}
        description={limitModalDescription}
        featureList={LIMIT_MODAL_FEATURES}
        ctaLabel={limitModalCtaLabel}
        onCta={goToBilling}
        secondaryLabel="Maybe later"
        onSecondary={() => setActiveLimitCode(null)}
      />
    </div>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(fabContent, document.body);
  }

  return fabContent;
}

type ProposalTimelineCardProps = {
  message: AiThreadProposalMessage;
  formState: ProposalFormValues;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  opsOpen: boolean;
  onToggleOps: () => void;
  isSending: boolean;
  onQueueAiMessage: (prompt: string) => void;
  onSchedulerOpsOverrideChange: (
    messageId: string,
    ops: AiSchedulerOp[] | undefined,
  ) => void;
};

function ProposalTimelineCard({
  message,
  formState,
  onFieldChange,
  onSave,
  onSend,
  opsOpen,
  onToggleOps,
  isSending,
  onQueueAiMessage,
  onSchedulerOpsOverrideChange,
}: ProposalTimelineCardProps) {
  const baseDraft = message.ai.intent.draft ?? {};
  const overrideDraft = message.overrides?.draft ?? {};
  const baseKeys = Object.keys(baseDraft);
  const overrideOnlyKeys = Object.keys(overrideDraft).filter(
    (key) => !baseKeys.includes(key),
  );
  const fieldKeys = Array.from(new Set([...baseKeys, ...overrideOnlyKeys]));
  const [detailsOpen, setDetailsOpen] = useState(fieldKeys.length > 0);
  const rawOps = message.overrides?.schedulerOps ?? message.ai.intent.ops ?? [];
  const ops = normalizeSchedulerOps(rawOps);
  const assistantMessage = message.ai.assistant_message ?? "";
  const intentMessage = message.ai.intent.message ?? "";

  const getFieldValue = (key: string) => {
    if (formState[key] !== undefined) {
      return formState[key];
    }
    if (overrideDraft[key] !== undefined) {
      return overrideDraft[key];
    }
    const baseValue = baseDraft[key];
    if (baseValue === undefined || baseValue === null) return "";
    return String(baseValue);
  };

  const isGoalDraft = message.ai.intent.type === "DRAFT_CREATE_GOAL";
  const isProjectDraft = message.ai.intent.type === "DRAFT_CREATE_PROJECT";
  const isHabitDraft = message.ai.intent.type === "DRAFT_CREATE_HABIT";
  const isSchedulerDraft =
    message.ai.intent.type === "DRAFT_SCHEDULER_INPUT_OPS";

  if (isGoalDraft) {
    return (
      <GoalProposalForm
        message={message}
        fieldKeys={fieldKeys}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
      />
    );
  }

  if (isProjectDraft) {
    return (
      <ProjectProposalForm
        message={message}
        fieldKeys={fieldKeys}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
      />
    );
  }

  if (isHabitDraft) {
    return (
      <HabitProposalForm
        message={message}
        fieldKeys={fieldKeys}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
      />
    );
  }

  if (isSchedulerDraft) {
    return (
      <DayTypeProposalForm
        message={message}
        getFieldValue={getFieldValue}
        onFieldChange={onFieldChange}
        onSave={onSave}
        onSend={onSend}
        isSending={isSending}
        ops={ops}
        formState={formState}
        onQueueAiMessage={onQueueAiMessage}
        onSchedulerOpsOverrideChange={(ops) =>
          onSchedulerOpsOverrideChange(message.id, ops)
        }
      />
    );
  }

  const renderField = (key: string) => {
    const lowerKey = key.toLowerCase();
    const value = getFieldValue(key);
    const isPriorityField = lowerKey.includes("priority");
    const isEnergyField = lowerKey.includes("energy");
    const isTextareaField =
      lowerKey.includes("notes") ||
      lowerKey.includes("description") ||
      lowerKey.includes("why");
    const isDateField = lowerKey.includes("due") || lowerKey.includes("date");
    const label = humanizeFieldLabel(key);
    const handleChange = (next: string) => onFieldChange(key, next);

    return (
      <div key={key} className="space-y-1">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-white/60">
          {label}
        </Label>
        {isPriorityField ? (
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent className="bg-[#050507] border border-white/10">
              {SCHEDULER_PRIORITY_LABELS.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatFabPriorityLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isEnergyField ? (
          <Select value={value} onValueChange={handleChange}>
            <SelectTrigger className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent className="bg-[#050507] border border-white/10">
              {ENERGY_OPTIONS_LOCAL.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : isTextareaField ? (
          <Textarea
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            className="min-h-[120px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50"
            placeholder={label}
          />
        ) : (
          <Input
            type={isDateField ? "date" : "text"}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/50"
            placeholder={label}
          />
        )}
      </div>
    );
  };

  return (
    <div className="relative space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/6 via-white/3 to-black/70 p-5 text-white shadow-[0_20px_45px_rgba(0,0,0,0.55)]">
      <div className="space-y-4 pb-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[8px] uppercase tracking-[0.35em] text-white/60">
              PROPOSAL
            </p>
            <p className="mt-1 text-base font-semibold leading-tight text-white">
              {message.ai.intent.title}
            </p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.35em] text-white/70">
            {message.ai.intent.type.replaceAll("_", " ")}
          </span>
        </div>
        {assistantMessage ? (
          <p className="text-sm leading-relaxed text-white">
            {assistantMessage}
          </p>
        ) : null}
        {intentMessage ? (
          <p className="text-[11px] leading-relaxed text-white/70">
            <span className="mr-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
              Notes
            </span>
            {intentMessage}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
            Details
          </p>
          <button
            type="button"
            onClick={() => setDetailsOpen((prev) => !prev)}
            className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
          >
            {detailsOpen ? "Hide details" : "Edit details"}
          </button>
        </div>
        {detailsOpen ? (
          <div className="space-y-4">
            {fieldKeys.length > 0 ? (
              fieldKeys.map((key) => renderField(key))
            ) : (
              <p className="text-[11px] text-white/60">
                No editable fields detected.
              </p>
            )}
          </div>
        ) : null}
        {ops.length > 0 ? (
          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-[11px] text-white/80">
            <button
              type="button"
              onClick={onToggleOps}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.35em] text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <span>Ops preview</span>
              <span className="text-[10px] text-white/40">
                {ops.length} ops
              </span>
            </button>
            {opsOpen ? (
              <div className="space-y-2">
                {ops.map((op, index) => (
                  <div
                    key={`${op.type}-${index}`}
                    className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <p className="text-[11px] font-semibold leading-tight text-white">
                      {describeSchedulerOp(op) ?? op.type}
                    </p>
                    <pre className="max-h-32 overflow-auto text-[10px] whitespace-pre-wrap text-white/60">
                      {JSON.stringify(op, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="sticky bottom-0 -mx-5 mt-4 border-t border-white/10 bg-[#050507]/80 backdrop-blur px-5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={() => onSend(message)}
            disabled={isSending}
            className="w-full sm:w-auto"
          >
            {isSending ? "Sending…" : "Send edited to AI"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSave(message)}
            className="w-full sm:w-auto"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

type GoalProposalFormProps = {
  message: AiThreadProposalMessage;
  fieldKeys: string[];
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
};

function GoalProposalForm({
  message,
  fieldKeys,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
}: GoalProposalFormProps) {
  const dueDateKey = fieldKeys.includes("due_date")
    ? "due_date"
    : fieldKeys.includes("dueDate")
      ? "dueDate"
      : null;
  const hasWhyKey = fieldKeys.includes("why");
  const [manualDueValue, setManualDueValue] = useState("");
  const [manualWhyValue, setManualWhyValue] = useState("");

  const labelClassName =
    "text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60";
  const inputClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0";

  const dueValue = dueDateKey ? getFieldValue(dueDateKey) : manualDueValue;
  const handleDueChange = (value: string) => {
    if (dueDateKey) {
      onFieldChange(dueDateKey, value);
      return;
    }
    setManualDueValue(value);
  };

  const whyValue = hasWhyKey ? getFieldValue("why") : manualWhyValue;
  const handleWhyChange = (value: string) => {
    if (hasWhyKey) {
      onFieldChange("why", value);
      return;
    }
    setManualWhyValue(value);
  };

  return (
    <div className="w-full sm:mx-auto sm:max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f87171] underline decoration-dotted decoration-white/50 underline-offset-4"
              title="Link to an existing monument"
            >
              LINK TO EXISTING MONUMENT +
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label className={labelClassName}>Name</Label>
              <div className="flex gap-2">
                <Input
                  value={getFieldValue("name")}
                  onChange={(event) =>
                    onFieldChange("name", event.target.value)
                  }
                  placeholder="Name this goal"
                  className={`${inputClassName} flex-1`}
                />
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] p-2 text-[11px] text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.08)] transition hover:border-white/30 hover:bg-white/10"
                  aria-label="Goal energy"
                >
                  <FlameEmber
                    level="MEDIUM"
                    size="sm"
                    className="pointer-events-none"
                  />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 min-w-0">
                <Label className={labelClassName}>Priority</Label>
                <Select
                  value={getFieldValue("priority")}
                  onValueChange={(value) => onFieldChange("priority", value)}
                >
                  <SelectTrigger className={inputClassName}>
                    <SelectValue placeholder="Choose priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#050507] border border-white/10">
                    {SCHEDULER_PRIORITY_LABELS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {formatFabPriorityLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className={labelClassName}>Due</Label>
                <Input
                  type="datetime-local"
                  value={dueValue}
                  onChange={(event) => handleDueChange(event.target.value)}
                  className={inputClassName}
                />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label className={labelClassName}>Why?</Label>
              <Textarea
                value={whyValue}
                onChange={(event) => handleWhyChange(event.target.value)}
                placeholder="Capture the motivation or vision for this goal"
                className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save goal"
                title="Save goal"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROJECT_PROPOSAL_STAGE_OPTIONS = [
  { value: "RESEARCH", label: "Research" },
  { value: "TEST", label: "Test" },
  { value: "BUILD", label: "Build" },
  { value: "REFINE", label: "Refine" },
  { value: "RELEASE", label: "Release" },
];

const HABIT_PROPOSAL_TYPE_OPTIONS = [
  { value: "HABIT", label: "Habit" },
  { value: "CHORE", label: "Chore" },
  { value: "PRACTICE", label: "Practice" },
  { value: "SYNC", label: "Sync" },
];

const HABIT_PROPOSAL_RECURRENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const HABIT_PROPOSAL_ENERGY_OPTIONS = [
  { value: "NO", label: "No" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "ULTRA", label: "Ultra" },
  { value: "EXTREME", label: "Extreme" },
];

type ProjectProposalFormProps = {
  message: AiThreadProposalMessage;
  fieldKeys: string[];
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
};

function ProjectProposalForm({
  message,
  fieldKeys,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
}: ProjectProposalFormProps) {
  const skillFieldKey =
    fieldKeys.find((key) => key.toLowerCase().includes("skill")) ?? "skill";
  const whyFieldKey = fieldKeys.includes("why")
    ? "why"
    : fieldKeys.includes("description")
      ? "description"
      : "why";
  const labelClassName =
    "text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60";
  const baseInputClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] text-[12px] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0";
  const standardInputClassName = `${baseInputClassName} px-4`;
  const energyLevel =
    (getFieldValue("energy") as FlameEmberProps["level"]) || "MEDIUM";

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#f87171] underline decoration-dotted decoration-white/50 underline-offset-4"
              title="Link to an existing goal"
            >
              LINK TO EXISTING GOAL +
            </button>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Name</Label>
            <div className="flex gap-2">
              <Input
                value={getFieldValue("name")}
                onChange={(event) => onFieldChange("name", event.target.value)}
                placeholder="Name your PROJECT"
                className={`${standardInputClassName} flex-1`}
              />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] p-2 text-[11px] text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.08)] transition hover:border-white/30 hover:bg-white/10"
                aria-label="Project energy"
              >
                <FlameEmber
                  level={energyLevel}
                  size="sm"
                  className="pointer-events-none"
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Priority</Label>
              <Select
                value={getFieldValue("priority")}
                onValueChange={(value) => onFieldChange("priority", value)}
              >
                <SelectTrigger className={standardInputClassName}>
                  <SelectValue placeholder="Choose priority" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {SCHEDULER_PRIORITY_LABELS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatFabPriorityLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Stage</Label>
              <Select
                value={getFieldValue("stage")}
                onValueChange={(value) => onFieldChange("stage", value)}
              >
                <SelectTrigger className={standardInputClassName}>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {PROJECT_PROPOSAL_STAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Skills</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                <Search className="h-4 w-4 text-white/40" />
              </span>
              <Input
                value={getFieldValue(skillFieldKey)}
                onChange={(event) =>
                  onFieldChange(skillFieldKey, event.target.value)
                }
                placeholder="Search skills..."
                className={`${baseInputClassName} pl-10 pr-11`}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <Filter className="h-4 w-4 text-white/40" />
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className={labelClassName}>Why?</Label>
            <Textarea
              value={getFieldValue(whyFieldKey)}
              onChange={(event) =>
                onFieldChange(whyFieldKey, event.target.value)
              }
              placeholder="Capture the motivation or success criteria for this project"
              className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white placeholder:text-white/60 placeholder:text-[12px] focus:border-blue-400/60 focus-visible:ring-0"
            />
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save project"
                title="Save project"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type HabitProposalFormProps = {
  message: AiThreadProposalMessage;
  fieldKeys: string[];
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
};

function HabitProposalForm({
  message,
  fieldKeys,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
}: HabitProposalFormProps) {
  const labelClassName =
    "text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60";
  const inputClassName =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0";
  const optionalLinkKeys = fieldKeys.filter((key) =>
    ["goalId", "skillId", "locationContextId"].includes(key),
  );
  const energyLevel =
    (getFieldValue("energy") as FlameEmberProps["level"]) || "MEDIUM";

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className={labelClassName}>Name</Label>
            <div className="flex gap-2">
              <Input
                value={getFieldValue("name")}
                onChange={(event) => onFieldChange("name", event.target.value)}
                placeholder="Name this habit"
                className={`${inputClassName} flex-1`}
              />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] p-2 text-[11px] text-white shadow-[inset_0_1px_4px_rgba(255,255,255,0.08)] transition hover:border-white/30 hover:bg-white/10"
                aria-label="Habit energy"
              >
                <FlameEmber
                  level={energyLevel}
                  size="sm"
                  className="pointer-events-none"
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Type</Label>
              <Select
                value={getFieldValue("habit_type")}
                onValueChange={(value) => onFieldChange("habit_type", value)}
              >
                <SelectTrigger className={inputClassName}>
                  <SelectValue placeholder="Choose type" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {HABIT_PROPOSAL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Duration</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={getFieldValue("duration_minutes")}
                onChange={(event) =>
                  onFieldChange("duration_minutes", event.target.value)
                }
                className={inputClassName}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Recurrence</Label>
              <Select
                value={getFieldValue("recurrence")}
                onValueChange={(value) => onFieldChange("recurrence", value)}
              >
                <SelectTrigger className={inputClassName}>
                  <SelectValue placeholder="Choose recurrence" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {HABIT_PROPOSAL_RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 min-w-0">
              <Label className={labelClassName}>Energy</Label>
              <Select
                value={getFieldValue("energy")}
                onValueChange={(value) => onFieldChange("energy", value)}
              >
                <SelectTrigger className={inputClassName}>
                  <SelectValue placeholder="Choose energy" />
                </SelectTrigger>
                <SelectContent className="bg-[#050507] border border-white/10">
                  {HABIT_PROPOSAL_ENERGY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {optionalLinkKeys.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {optionalLinkKeys.map((key) => (
                <div key={key} className="space-y-1">
                  <Label className={labelClassName}>
                    {humanizeFieldLabel(key)}
                  </Label>
                  <Input
                    value={getFieldValue(key)}
                    onChange={(event) =>
                      onFieldChange(key, event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save habit"
                title="Save habit"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const DAY_TYPE_GENERATE_PROMPT =
  "Generate the full 24-hour time blocks for this day type based on my snapshot.";
const DAY_TYPE_QUESTION_PROMPT =
  "Before you generate blocks, ask me the single most important question.";

type DayTypeProposalFormProps = {
  message: AiThreadProposalMessage;
  getFieldValue: (key: string) => string;
  onFieldChange: (field: string, value: string) => void;
  onSave: (message: AiThreadProposalMessage) => void;
  onSend: (message: AiThreadProposalMessage) => void;
  isSending: boolean;
  ops: AiSchedulerOp[];
  formState: ProposalFormValues;
  onSchedulerOpsOverrideChange: (
    messageId: string,
    ops: AiSchedulerOp[] | undefined,
  ) => void;
  onQueueAiMessage: (prompt: string) => void;
};

function DayTypeProposalForm({
  message,
  getFieldValue,
  onFieldChange,
  onSave,
  onSend,
  isSending,
  ops,
  formState,
  onQueueAiMessage,
  onSchedulerOpsOverrideChange,
}: DayTypeProposalFormProps) {
  const draft = message.ai.intent.draft ?? {};
  const headerName = draft.day_type_name ?? "DAY TYPE";
  const storedOverrideValue = formState["schedulerOpsOverrides"];
  const storedOverrideOps = Array.isArray(storedOverrideValue)
    ? (storedOverrideValue as AiSchedulerOp[])
    : undefined;
  const [editedOps, setEditedOps] = useState<AiSchedulerOp[]>(() =>
    (storedOverrideOps ?? ops).map(cloneSchedulerOp),
  );

  useEffect(() => {
    const source = storedOverrideOps ?? ops;
    setEditedOps(source.map(cloneSchedulerOp));
  }, [storedOverrideOps, ops]);

  useEffect(() => {
    onSchedulerOpsOverrideChange(message.id, editedOps);
  }, [editedOps, message.id, onSchedulerOpsOverrideChange]);

  const previewBlocks = useMemo(
    () => buildDayTypePreviewBlocks(editedOps),
    [editedOps],
  );
  const previewTimelineBlocks = useMemo<DayType24hPreviewBlock[]>(() => {
    return previewBlocks
      .filter(
        (
          block,
        ): block is DayType24hPreviewBlock & {
          start_local: string;
          end_local: string;
        } => Boolean(block.start_local && block.end_local),
      )
      .map((block) => ({
        id: block.id,
        label: block.label,
        start_local: block.start_local,
        end_local: block.end_local,
        opIndex: block.opIndex,
        hasConstraints: block.hasConstraints,
      }));
  }, [previewBlocks]);
  const hasTimelineBlocks = previewTimelineBlocks.length > 0;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const selectedBlock =
    selectedBlockId === null
      ? null
      : (previewBlocks.find((block) => block.id === selectedBlockId) ?? null);
  const selectedBlockIndex =
    selectedBlock === null
      ? -1
      : previewBlocks.findIndex((block) => block.id === selectedBlock.id);
  const selectedBlockNumber =
    selectedBlockIndex >= 0 ? selectedBlockIndex + 1 : 0;

  useEffect(() => {
    if (!selectedBlockId) return;
    if (!previewBlocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [previewBlocks, selectedBlockId]);

  const dayTypeNameValue = getFieldValue("day_type_name");
  const labelClass = "text-[10px] uppercase tracking-[0.35em] text-white/60";
  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[12px] text-white placeholder:text-white/60 focus:border-blue-400/60 focus-visible:ring-0";

  const selectedOp =
    selectedBlock?.opIndex !== undefined
      ? editedOps[selectedBlock.opIndex]
      : null;
  const [constraintsInput, setConstraintsInput] = useState("");
  const [constraintsError, setConstraintsError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOp) {
      setConstraintsInput("");
      setConstraintsError(null);
      return;
    }
    const constraintSource =
      selectedOp.type === "CREATE_DAY_TYPE_TIME_BLOCK"
        ? selectedOp.constraints
        : selectedOp.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
          ? selectedOp.patch.constraints
          : undefined;
    if (constraintSource && Object.keys(constraintSource).length > 0) {
      setConstraintsInput(JSON.stringify(constraintSource, null, 2));
    } else {
      setConstraintsInput("");
    }
    setConstraintsError(null);
  }, [selectedBlock?.opIndex]);

  const updateSelectedOp = (updater: (op: AiSchedulerOp) => AiSchedulerOp) => {
    const opIndex = selectedBlock?.opIndex;
    if (opIndex === undefined) return;
    setEditedOps((prev) => {
      const next = [...prev];
      const target = next[opIndex];
      if (!target) return prev;
      next[opIndex] = updater(target);
      return next;
    });
  };

  const handleLabelChange = (value: string) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return { ...op, label: value };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        return { ...op, block_label: value };
      }
      return op;
    });
  };

  const handleTimeChange = (
    field: "start_local" | "end_local",
    value: string,
  ) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return { ...op, [field]: value };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        return {
          ...op,
          patch: {
            ...op.patch,
            [field]: value,
          },
        };
      }
      return op;
    });
  };

  const updateConstraints = (constraints?: Record<string, string>) => {
    updateSelectedOp((op) => {
      if (op.type === "CREATE_DAY_TYPE_TIME_BLOCK") {
        return {
          ...op,
          constraints: constraints ?? undefined,
        };
      }
      if (op.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL") {
        const nextPatch = { ...op.patch };
        if (constraints && Object.keys(constraints).length > 0) {
          nextPatch.constraints = constraints;
        } else {
          delete nextPatch.constraints;
        }
        return {
          ...op,
          patch: nextPatch,
        };
      }
      return op;
    });
  };

  const handleConstraintsInputChange = (value: string) => {
    setConstraintsInput(value);
    if (!value.trim()) {
      setConstraintsError(null);
      updateConstraints(undefined);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Constraints must be a JSON object");
      }
      const normalized: Record<string, string> = {};
      Object.entries(parsed).forEach(([key, val]) => {
        if (typeof val !== "string") {
          throw new Error("Constraint values must be strings");
        }
        const trimmedKey = key.trim();
        const trimmedVal = val.trim();
        if (!trimmedKey) {
          throw new Error("Constraint keys must be non-empty");
        }
        normalized[trimmedKey] = trimmedVal;
      });
      if (Object.keys(normalized).length === 0) {
        updateConstraints(undefined);
      } else {
        updateConstraints(normalized);
      }
      setConstraintsError(null);
    } catch (error) {
      setConstraintsError(
        error instanceof Error ? error.message : "Invalid JSON",
      );
    }
  };

  const selectedLabelValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.label
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? selectedOp.block_label
        : "";
  const selectedStartValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.start_local
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? (selectedOp.patch.start_local ?? selectedBlock?.start_local ?? "")
        : (selectedBlock?.start_local ?? "");
  const selectedEndValue =
    selectedOp?.type === "CREATE_DAY_TYPE_TIME_BLOCK"
      ? selectedOp.end_local
      : selectedOp?.type === "UPDATE_DAY_TYPE_TIME_BLOCK_BY_LABEL"
        ? (selectedOp.patch.end_local ?? selectedBlock?.end_local ?? "")
        : (selectedBlock?.end_local ?? "");

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 via-white/10 to-black/80 p-3 sm:p-4 text-white">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[8px] uppercase tracking-[0.35em] text-white/60">
              DAY TYPE PROPOSAL
            </p>
            <p className="text-[18px] font-bold uppercase tracking-[0.3em] text-white/90 leading-tight">
              {headerName}
            </p>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/10 bg-black/35 p-3 text-white">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                24H PREVIEW
              </p>
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                {editedOps.length} ops
              </span>
            </div>

            {previewTimelineBlocks.length > 0 ? (
              <div className="-mx-3 sm:mx-0">
                <DayType24hPreview
                  blocks={previewTimelineBlocks}
                  selectedId={selectedBlockId}
                  onSelect={(id) =>
                    setSelectedBlockId((prev) => (prev === id ? null : id))
                  }
                />
                {selectedBlock ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                        {`EDIT BLOCK ${selectedBlockNumber}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedBlockId(null)}
                        className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70 transition hover:text-white"
                        aria-label="Done editing block"
                      >
                        Done
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className={labelClass}>Label</Label>
                        <Input
                          value={selectedLabelValue}
                          onChange={(event) =>
                            handleLabelChange(event.target.value)
                          }
                          placeholder={selectedBlock.label ?? "Block label"}
                          className={inputClass}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className={labelClass}>Start</Label>
                          <Input
                            type="time"
                            value={selectedStartValue}
                            onChange={(event) =>
                              handleTimeChange(
                                "start_local",
                                event.target.value,
                              )
                            }
                            placeholder={selectedBlock.start_local}
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className={labelClass}>End</Label>
                          <Input
                            type="time"
                            value={selectedEndValue}
                            onChange={(event) =>
                              handleTimeChange("end_local", event.target.value)
                            }
                            placeholder={selectedBlock.end_local}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className={labelClass}>Constraints</Label>
                        <Textarea
                          value={constraintsInput}
                          onChange={(event) =>
                            handleConstraintsInputChange(event.target.value)
                          }
                          placeholder='{"skill":"FITNESS","energy":"HIGH"}'
                          className="min-h-[70px] w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white placeholder:text-white/40 focus:border-blue-400/60 focus-visible:ring-0"
                        />
                        {constraintsError ? (
                          <p className="text-[10px] text-rose-200">
                            {constraintsError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : hasTimelineBlocks ? (
                  <div className="mt-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60 text-center">
                    TAP A BLOCK TO EDIT
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-dashed border-white/20 bg-white/5 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/70">
                  NO TIME BLOCKS YET
                </p>
                <p className="text-[11px] text-white/70">
                  I assigned the day type, but haven’t generated the 24-hour
                  blocks.
                </p>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={() => onQueueAiMessage(DAY_TYPE_GENERATE_PROMPT)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/40 hover:bg-white/20"
                  >
                    GENERATE 24H BLOCKS
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onQueueAiMessage(DAY_TYPE_QUESTION_PROMPT)}
                    className="w-full rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-white transition hover:border-white/40"
                  >
                    ASK ME 1 QUESTION FIRST
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-white/10 pt-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/60">
                EDIT BLOCKS
              </p>
              <p className="text-[12px] text-white/70">
                Rename it or tweak the blocks below.
              </p>
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Day type name</Label>
              <Input
                value={dayTypeNameValue}
                onChange={(event) =>
                  onFieldChange("day_type_name", event.target.value)
                }
                placeholder={headerName}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-1 border-t border-white/10 pt-3">
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSend(message)}
                disabled={isSending}
                aria-label="Request refinement"
                title="Request refinement"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ef4444] text-white shadow-[0_8px_20px_rgba(239,68,68,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSave(message)}
                disabled={isSending}
                aria-label="Save day type"
                title="Save day type"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_8px_20px_rgba(16,185,129,0.35)] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type FabNexusProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: FabSearchResult[];
  isSearching: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectResult: (result: FabSearchResult) => void;
  filterMonumentId?: string;
  onFilterMonumentChange?: (value: string) => void;
  filterSkillId?: string;
  onFilterSkillChange?: (value: string) => void;
  filterEventType?: OverlayEventTypeFilter;
  onFilterEventTypeChange?: (value: OverlayEventTypeFilter) => void;
  sortMode?: OverlaySortMode;
  onSortModeChange?: (value: OverlaySortMode) => void;
  availableMonuments?: Monument[];
  availableSkills?: Skill[];
  showToolbar?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onManualPlaceResult?: (
    result: FabSearchResult,
    pointer?: DragPointerInfo,
  ) => void;
};

function FabNexus({
  query,
  onQueryChange,
  results,
  isSearching,
  isLoadingMore,
  error,
  hasMore,
  onLoadMore,
  onSelectResult,
  filterMonumentId,
  onFilterMonumentChange,
  filterSkillId,
  onFilterSkillChange,
  filterEventType,
  onFilterEventTypeChange,
  sortMode,
  onSortModeChange,
  availableMonuments,
  availableSkills,
  showToolbar = false,
  inputRef,
  onManualPlaceResult,
}: FabNexusProps) {
  const [showControls, setShowControls] = useState(false);
  const dragStateRef = useRef<{
    id: string;
    pointerId: number | null;
    startX: number;
    startY: number;
    dragging: boolean;
    result: FabSearchResult;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const RESULT_CARD_DRAG_THRESHOLD_PX = 12;
  const RESULT_CARD_PAGE_SWIPE_DOMINANCE = 1.25;
  const RESULT_CARD_VERTICAL_SCROLL_DOMINANCE = 1.15;
  const hasResults = results.length > 0;
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoadingMore) return;
    const target = event.currentTarget;
    const remaining =
      target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining < 120) {
      onLoadMore();
    }
  };

  const toolbarMonuments = availableMonuments ?? [];
  const toolbarSkills = availableSkills ?? [];
  const handleMonumentChange = onFilterMonumentChange ?? (() => {});
  const handleSkillChange = onFilterSkillChange ?? (() => {});
  const handleEventTypeChange = onFilterEventTypeChange ?? (() => {});
  const handleSortChange = onSortModeChange ?? (() => {});
  const sortValue = sortMode ?? "scheduled";
  const eventTypeValue = filterEventType ?? "ALL";
  const hasActiveFilter =
    query.trim().length > 0 ||
    Boolean(filterMonumentId) ||
    Boolean(filterSkillId) ||
    eventTypeValue !== "ALL";
  const toolbarSelectClass =
    "h-9 min-w-[120px] rounded-2xl border border-white/10 bg-black/50 px-3 text-[11px] font-semibold text-white/80 focus-visible:border-white/30 focus-visible:ring-0";
  const toolbarContentClass = "bg-black/90 text-white";

  const formatDateTime = (
    value: string | null,
    options?: Intl.DateTimeFormatOptions,
  ) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(
        undefined,
        options ?? { dateStyle: "medium", timeStyle: "short" },
      ).format(date);
    } catch {
      return date.toLocaleString();
    }
  };

  const formatDatePart = (value: string | null): string | null =>
    formatDateTime(value, { dateStyle: "medium", timeStyle: undefined });
  const formatTimePart = (value: string | null): string | null =>
    formatDateTime(value, { timeStyle: "short" });

  const suppressTransientClick = () => {
    suppressClickRef.current = true;
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 350);
    }
  };

  const getStatusText = (result: FabSearchResult): React.ReactNode => {
    if (result.type === "PROJECT" && result.isCompleted) {
      const completedLabel = formatDateTime(result.completedAt);
      return completedLabel ? `Completed ${completedLabel}` : "Completed";
    }
    if (result.nextScheduledAt) {
      const dateLabel = formatDatePart(result.nextScheduledAt);
      const timeLabel = formatTimePart(result.nextScheduledAt);
      if (dateLabel && timeLabel) {
        return (
          <>
            <span>Scheduled {dateLabel}</span>
            <span>at {timeLabel}</span>
          </>
        );
      }
      if (dateLabel) {
        return <>Scheduled {dateLabel}</>;
      }
      return "Scheduled";
    }
    if (result.type === "HABIT" && result.nextDueAt) {
      const dueLabel = formatDateTime(result.nextDueAt, {
        dateStyle: "medium",
      });
      return dueLabel ? `Due ${dueLabel}` : "Due soon";
    }
    return "No upcoming schedule";
  };

  return (
    <div
      className="flex h-[min(78vh,640px)] min-h-[min(420px,78vh)] w-full flex-col overflow-hidden text-white"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      <div className="shrink-0 px-4 pt-4">
        <div className="relative h-10">
          <span className="pointer-events-none absolute left-3 inset-y-0 flex items-center">
            <Search className="h-4 w-4 text-white/30" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="search NEXUS"
            className="h-10 w-full rounded-lg border border-white/10 bg-black/60 pl-10 pr-14 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            aria-label="Search NEXUS"
          />
          {showToolbar && (
            <button
              type="button"
              aria-label="Toggle Nexus filters"
              aria-expanded={showControls}
              onClick={() => setShowControls((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {showToolbar && showControls ? (
        <div className="shrink-0 px-4 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filterMonumentId ?? ""}
              onValueChange={handleMonumentChange}
            >
              <SelectTrigger
                aria-label="Filter by monument"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Monument" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="">All monuments</SelectItem>
                {toolbarMonuments.map((monument) => (
                  <SelectItem key={monument.id} value={monument.id}>
                    <span className="text-sm">
                      {(monument.emoji ?? "✨") +
                        " " +
                        (monument.title ?? "Monument")}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterSkillId ?? ""}
              onValueChange={handleSkillChange}
            >
              <SelectTrigger
                aria-label="Filter by skill"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Skill" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="">All skills</SelectItem>
                {toolbarSkills.map((skill) => (
                  <SelectItem key={skill.id} value={skill.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{skill.icon ?? "🛠️"}</span>
                      <span>{skill.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={eventTypeValue}
              onValueChange={(value) =>
                handleEventTypeChange(value as OverlayEventTypeFilter)
              }
            >
              <SelectTrigger
                aria-label="Filter by event type"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                <SelectItem value="ALL">All events</SelectItem>
                <SelectItem value="PROJECT">Projects</SelectItem>
                <SelectItem value="HABIT">Habits</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortValue}
              onValueChange={(value) =>
                handleSortChange(value as OverlaySortMode)
              }
            >
              <SelectTrigger
                aria-label="Sort overlay results"
                className={toolbarSelectClass}
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent className={toolbarContentClass}>
                {OVERLAY_SORT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="text-[10px] uppercase text-white/60"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
          </div>
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pr-5 pt-3"
        data-fab-nexus-scroll="true"
        style={{ touchAction: "pan-y" }}
        onScroll={handleScroll}
      >
        {isSearching && !hasResults ? (
          <div className="flex h-32 items-center justify-center text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : error && !hasResults ? (
          <div className="rounded-xl border border-red-500/20 bg-red-900/40 px-4 py-4 text-center text-sm text-red-100">
            {error}
          </div>
        ) : hasResults ? (
          <div className="flex flex-col">
            {results.map((result) => {
              const isCompletedProject =
                result.type === "PROJECT" && result.isCompleted;
              const isDisabled = isCompletedProject;
              const statusText = getStatusText(result);
              const cardClassName = cn(
                "relative flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40",
                isCompletedProject
                  ? "border-white/20 bg-white/5 text-white/90 shadow-[0_22px_42px_rgba(0,0,0,0.45)]"
                  : "border-white/5 bg-black/60 text-white/85 hover:bg-black/70",
                isDisabled && "cursor-not-allowed",
              );
              const nameTextClass = "text-white";
              const metaLabelClass =
                "text-[7px] md:text-[9px] uppercase tracking-[0.18em] text-white/70";
              const statusLabelClass =
                "text-[7px] md:text-[8px] uppercase tracking-[0.14em] text-white/60 break-words leading-tight";
              const releaseCardPointer = (event: React.PointerEvent) => {
                const target = event.currentTarget as HTMLElement;
                if (target.hasPointerCapture?.(event.pointerId)) {
                  target.releasePointerCapture(event.pointerId);
                }
              };

              const beginDrag = (
                event: React.PointerEvent,
                res: FabSearchResult,
              ) => {
                if (!onManualPlaceResult) return;
                if (!res.scheduleInstanceId) return;
                releaseCardPointer(event);
                onManualPlaceResult(res, {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  pointerId: event.pointerId ?? null,
                  pointerType: event.pointerType ?? null,
                });
                suppressTransientClick();
              };

              const handlePointerDown = (event: React.PointerEvent) => {
                if (isDisabled) return;
                if (event.pointerType === "mouse" && event.button !== 0) return;
                dragStateRef.current = {
                  id: result.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  dragging: false,
                  result,
                };
              };

              const handlePointerMove = (event: React.PointerEvent) => {
                const state = dragStateRef.current;
                if (!state || state.id !== result.id) return;
                if (
                  state.pointerId !== null &&
                  event.pointerId !== state.pointerId
                )
                  return;
                if (state.dragging) {
                  event.preventDefault();
                  return;
                }
                const dx = event.clientX - state.startX;
                const dy = event.clientY - state.startY;
                const absX = Math.abs(dx);
                const absY = Math.abs(dy);

                if (absY > 6 && absY > absX * 1.1) {
                  dragStateRef.current = null;
                  suppressTransientClick();
                  releaseCardPointer(event);
                  return;
                }

                if (
                  absX > RESULT_CARD_DRAG_THRESHOLD_PX &&
                  absX > absY * RESULT_CARD_PAGE_SWIPE_DOMINANCE
                ) {
                  dragStateRef.current = null;
                  suppressTransientClick();
                  releaseCardPointer(event);
                  return;
                }

                if (
                  absX < RESULT_CARD_DRAG_THRESHOLD_PX &&
                  absY < RESULT_CARD_DRAG_THRESHOLD_PX
                ) {
                  return;
                }

                if (absY > absX * RESULT_CARD_VERTICAL_SCROLL_DOMINANCE) {
                  dragStateRef.current = null;
                  suppressTransientClick();
                  releaseCardPointer(event);
                  return;
                }

                state.dragging = true;
                beginDrag(event, state.result);
                event.preventDefault();
              };

              const handlePointerUp = (event: React.PointerEvent) => {
                const state = dragStateRef.current;
                if (!state || state.id !== result.id) return;
                if (
                  state.pointerId !== null &&
                  event.pointerId !== state.pointerId
                )
                  return;
                const wasDragging = state.dragging;
                dragStateRef.current = null;
                releaseCardPointer(event);
                if (wasDragging) {
                  event.preventDefault();
                  return;
                }
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                if (!isDisabled) {
                  onSelectResult(result);
                }
              };

              const handlePointerCancel = () => {
                dragStateRef.current = null;
              };

              const handleClick = (event: React.MouseEvent) => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                if (!isDisabled) {
                  onSelectResult(result);
                }
              };

              return (
                <button
                  key={`${result.type}-${result.id}`}
                  type="button"
                  data-fab-nexus-result-card="true"
                  onClick={handleClick}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                  className={cardClassName}
                >
                  <div className="flex w-full flex-col gap-1 min-w-0">
                    <div className="flex w-full items-start justify-between gap-3">
                      <div className="flex flex-col gap-1 flex-[3] basis-3/4 min-w-0">
                        <span
                          className={cn(
                            "block line-clamp-2 break-words text-[12px] font-medium leading-snug tracking-wide",
                            nameTextClass,
                          )}
                        >
                          {result.name}
                        </span>
                        {result.type === "PROJECT" &&
                          result.global_rank !== null &&
                          result.global_rank !== undefined && (
                            <span className="text-gray-600 font-bold text-xs leading-none">
                              #{result.global_rank}
                            </span>
                          )}
                      </div>
                      <div className="flex items-start justify-end flex-shrink-0">
                        <span className={metaLabelClass}>
                          {result.type === "PROJECT" ? "Project" : "Habit"}
                        </span>
                      </div>
                    </div>
                    <div className="flex w-full">
                      <span className={statusLabelClass}>{statusText}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {isLoadingMore ? (
              <div className="flex items-center justify-center py-3 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-6 text-center text-sm text-white/60">
            {hasActiveFilter
              ? "No projects or habits match this search."
              : "Start typing to search every project and habit."}
          </div>
        )}
      </div>
    </div>
  );
}

type FabRescheduleOverlayProps = {
  open: boolean;
  target: FabSearchResult | null;
  dateValue: string;
  timeValue: string;
  error: string | null;
  deleteError: string | null;
  isSaving: boolean;
  isDeleting: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
};

function FabRescheduleOverlay({
  open,
  target,
  dateValue,
  timeValue,
  error,
  deleteError,
  isSaving,
  isDeleting,
  onDateChange,
  onTimeChange,
  onClose,
  onSave,
  onDelete,
}: FabRescheduleOverlayProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    setConfirmingDelete(false);
  }, [open, target?.id]);

  if (typeof document === "undefined") return null;
  const combinedErrors = [error, deleteError].filter(
    (message): message is string =>
      typeof message === "string" && message.length > 0,
  );
  const disableActions = isSaving || isDeleting;
  const deleteLabel =
    target?.type === "HABIT"
      ? "Habit"
      : target?.type === "PROJECT"
        ? "Project"
        : "Event";
  const handleDeleteClick = () => {
    if (disableActions || !target) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    void onDelete();
  };
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          data-fab-reschedule-overlay
          className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur"
          style={{ touchAction: "manipulation" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <motion.div
            className="absolute left-1/2 top-1/2 w-[90vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#050507]/95 p-5 text-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full border border-white/10 p-1 text-white/70 transition hover:text-white"
              aria-label="Close reschedule menu"
              disabled={disableActions}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40">
                Reschedule
              </p>
              <h3 className="text-lg font-semibold leading-tight">
                {target?.name ?? "Event"}
              </h3>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Due date
                </label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => onDateChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-[0.2em] text-white/55">
                  Time due
                </label>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(event) => onTimeChange(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  disabled={disableActions}
                />
              </div>
              {combinedErrors.length > 0 && (
                <div className="rounded-xl border border-red-500/20 bg-red-900/30 px-3 py-2 text-sm text-red-100">
                  {combinedErrors.map((message, index) => (
                    <p key={`${message}-${index}`}>{message}</p>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteClick}
                    onTouchEnd={(event) => {
                      event.stopPropagation();
                      handleDeleteClick();
                    }}
                    disabled={disableActions || !target}
                    className={cn(
                      "bg-red-600 text-white hover:bg-red-500 transition",
                      confirmingDelete && "border border-white/40 bg-red-700",
                    )}
                  >
                    {isDeleting
                      ? "Deleting…"
                      : confirmingDelete
                        ? `Confirm delete ${deleteLabel}`
                        : `Delete ${deleteLabel}`}
                  </Button>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        setConfirmingDelete(false);
                        onClose();
                      }}
                      className="text-white/70 hover:bg-white/10"
                      disabled={disableActions}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={onSave}
                      onTouchEnd={(event) => {
                        event.stopPropagation();
                        onSave();
                      }}
                      disabled={disableActions || !target?.scheduleInstanceId}
                      className="bg-white/90 text-black hover:bg-white"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
