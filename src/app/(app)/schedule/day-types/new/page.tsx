"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type UIEvent,
} from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ChevronUp, ChevronDown, MoreVertical, Pencil, Trash2, Wand2, MapPin, Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";
import { ENERGY } from "@/lib/scheduler/config";
import { useLocationContexts, type LocationContextOption } from "@/lib/hooks/useLocationContexts";
import { normalizeLocationValue, resolveLocationContextId } from "@/lib/location-metadata";
import type { SchedulerModeType } from "@/lib/scheduler/modes";
import { HABIT_TYPE_OPTIONS } from "@/components/habits/habit-form-fields";
import { getSkillsForUser, type Skill } from "@/lib/queries/skills";
import { getMonumentsForUser, type Monument } from "@/lib/queries/monuments";
import { getCatsForUser } from "@/lib/data/cats";
import type { CatRow } from "@/lib/types/cat";
import { Input } from "@/components/ui/input";
import {
  DayType24hPreview,
  type BlockType,
  blockToSegments,
} from "@/components/schedule/DayType24hPreview";

type DayType = {
  id: string;
  name: string;
  is_default: boolean;
  days: number[];
  scheduler_mode?: SchedulerModeType | null;
};

type TimeBlock = {
  id: string;
  label?: string | null;
  start_local: string;
  end_local: string;
  day_type_id?: string | null;
};

type TimeBlockListMode = "selected-day-type" | "all-blocks";
type TimeBlockEditScope = "only-day-type" | "everywhere";
type TimeBlockEditContext =
  | { mode: "selected-day-type"; dayTypeId: string; sourceBlockId: string }
  | { mode: "all-blocks"; sourceBlockId: string };

type DayTypeBlockLink = {
  id?: string;
  day_type_id: string;
  time_block_id: string;
  energy?: FlameLevel | null;
  block_type?: BlockType | null;
  allow_all_habit_types?: boolean | null;
  allow_all_skills?: boolean | null;
  allow_all_monuments?: boolean | null;
};

type TimeBlockOverlapConflict = {
  dayKey: string;
  dayType: DayType;
  overlappingBlock: TimeBlock;
};

const getDayTypeBlockStateKey = (dayTypeId: string | null | undefined, blockId: string | null | undefined) =>
  dayTypeId && blockId ? `${dayTypeId}:${blockId}` : "";

const getBlockIdFromStateKey = (stateKey: string) => {
  if (!stateKey) return "";
  const idx = stateKey.indexOf(":");
  return idx >= 0 ? stateKey.slice(idx + 1) : stateKey;
};

const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";
const UNCATEGORIZED_CATEGORY_LABEL = "Uncategorized";

type SkillGroup = {
  id: string;
  label: string;
  skills: Skill[];
};

const BLOCK_TYPES: BlockType[] = ["FOCUS", "BREAK", "PRACTICE"];
const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  FOCUS: "Focus",
  BREAK: "Break",
  PRACTICE: "Practice",
};
const DEFAULT_WEEKDAY_LINK_ENERGY: FlameLevel = "MEDIUM";
const OVERLAP_CREATE_ERROR_PREFIX = "This Time Block overlaps another block";
const DAYS_OF_WEEK = [
  { key: "sun", label: "S", index: 0 },
  { key: "mon", label: "M", index: 1 },
  { key: "tue", label: "T", index: 2 },
  { key: "wed", label: "W", index: 3 },
  { key: "thu", label: "T", index: 4 },
  { key: "fri", label: "F", index: 5 },
  { key: "sat", label: "S", index: 6 },
];
const DEFAULT_DAY_PREVIEW = { key: "mon", shortLabel: "Mon", fullLabel: "Monday", index: 1 };
const DAY_PREVIEWS = [
  DEFAULT_DAY_PREVIEW,
  { key: "tue", shortLabel: "Tue", fullLabel: "Tuesday", index: 2 },
  { key: "wed", shortLabel: "Wed", fullLabel: "Wednesday", index: 3 },
  { key: "thu", shortLabel: "Thu", fullLabel: "Thursday", index: 4 },
  { key: "fri", shortLabel: "Fri", fullLabel: "Friday", index: 5 },
  { key: "sat", shortLabel: "Sat", fullLabel: "Saturday", index: 6 },
  { key: "sun", shortLabel: "Sun", fullLabel: "Sunday", index: 0 },
];
const DAY_PREVIEW_SWIPE_THRESHOLD_PX = 48;

const SHOW_INTERNAL_DAY_TYPE_CONTROLS = false;

const DAY_KEY_TO_INDEX: Record<string, number> = Object.fromEntries(
  DAYS_OF_WEEK.map((day) => [day.key, day.index])
);
const DAY_INDEX_TO_KEY = DAYS_OF_WEEK.reduce<Record<number, string>>((acc, day) => {
  acc[day.index] = day.key;
  return acc;
}, {});
const DAY_INDEX_TO_LABEL = DAYS_OF_WEEK.reduce<Record<number, string>>((acc, day) => {
  acc[day.index] = day.label;
  return acc;
}, {});
const DAY_KEY_TO_FULL_LABEL = DAY_PREVIEWS.reduce<Record<string, string>>((acc, day) => {
  acc[day.key] = day.fullLabel;
  return acc;
}, {});
const DAY_PREVIEW_KEY_TO_POSITION = DAY_PREVIEWS.reduce<Record<string, number>>((acc, day, index) => {
  acc[day.key] = index;
  return acc;
}, {});

const SCHEDULER_MODE_OPTIONS: Array<{ value: SchedulerModeType; label: string; description: string }> = [
  { value: "REGULAR", label: "REGULAR", description: "Balance focus and flexibility." },
  { value: "RUSH", label: "RUSH", description: "Tighten durations to move faster." },
  { value: "MONUMENTAL", label: "MONUMENTAL", description: "Prioritize big milestone work." },
  { value: "SKILLED", label: "SKILLED", description: "Concentrate on skill-building work." },
  { value: "REST", label: "REST", description: "Keep the day light and recovery-friendly." },
];

type CoverageStatus =
  | { ok: true }
  | { ok: false; reason: string };

type TimeInputProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  helper?: string;
  ariaLabel?: string;
  dataTour?: string;
};

function parseTimeToMinutes(value: string): number | null {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Math.min(Math.max(Number(match[1]), 0), 24);
  const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
  const seconds = Math.min(Math.max(Number(match[3] ?? 0), 0), 59);
  const clampedHours = hours === 24 && (minutes > 0 || seconds > 0) ? 23 : hours;
  const total = clampedHours * 60 + minutes + (seconds >= 30 ? 1 : 0);
  return Math.min(total, 1439);
}

function minutesToLabel(total: number): string {
  const clamped = Math.min(Math.max(Math.floor(total), 0), 1439);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeTimeLabel(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return String(value ?? "").trim();
  return minutesToLabel(minutes);
}

function normalizeLabel(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function normalizeSchedulerMode(value?: string | null): SchedulerModeType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "RUSH") return "RUSH";
  if (normalized === "MONUMENTAL") return "MONUMENTAL";
  if (normalized === "SKILLED") return "SKILLED";
  if (normalized === "REST") return "REST";
  return "REGULAR";
}

function normalizeDayIndexes(value?: number[] | null): number[] {
  return (value ?? [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function normalizeDayTypeRow(dayType: DayType): DayType {
  return {
    ...dayType,
    scheduler_mode: normalizeSchedulerMode(dayType.scheduler_mode as string | null),
    days: normalizeDayIndexes(dayType.days),
  };
}

function isDefaultWeekdayDayType(dayType: DayType | null | undefined): boolean {
  if (!dayType?.is_default) return false;
  return new Set(normalizeDayIndexes(dayType.days)).size === 1;
}

function getAverageDayTypeName(dayKey: string): string {
  return `AVERAGE ${(DAY_KEY_TO_FULL_LABEL[dayKey] ?? dayKey).toUpperCase()}`;
}

function normalizeHabitTypeValue(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

function sortTimeBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const score = (block: TimeBlock) => parseTimeToMinutes(block.start_local) ?? 0;
  return [...blocks].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return (a.label ?? "").localeCompare(b.label ?? "");
  });
}

function findDayTypeForWeekday(dayKey: string, dayTypes: DayType[]): DayType | null {
  const dayIndex = DAY_KEY_TO_INDEX[dayKey];
  if (typeof dayIndex !== "number") return null;
  return (
    dayTypes.find((dt) => dt.is_default && dt.days.includes(dayIndex)) ??
    dayTypes.find((dt) => dt.days.includes(dayIndex)) ??
    null
  );
}

function getDayPreviewKeyByOffset(dayKey: string, offset: number): string {
  const currentPosition = DAY_PREVIEW_KEY_TO_POSITION[dayKey] ?? 0;
  const nextPosition =
    (currentPosition + offset + DAY_PREVIEWS.length) % DAY_PREVIEWS.length;
  return DAY_PREVIEWS[nextPosition]?.key ?? DEFAULT_DAY_PREVIEW.key;
}

function timeBlocksOverlap(
  proposed: Pick<TimeBlock, "start_local" | "end_local">,
  existing: Pick<TimeBlock, "start_local" | "end_local">
): boolean {
  const proposedSegments = blockToSegments(proposed);
  const existingSegments = blockToSegments(existing);
  return proposedSegments.some((proposedSegment) =>
    existingSegments.some(
      (existingSegment) =>
        proposedSegment.startMin < existingSegment.endMin &&
        proposedSegment.endMin > existingSegment.startMin
    )
  );
}

function nudgeTime(value: string, deltaMinutes: number): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const wrapped = (minutes + deltaMinutes + 1440) % 1440;
  return minutesToLabel(wrapped);
}

async function resolveLocationIdsForBlocks({
  supabase,
  userId,
  dayTypeId,
  blockIds,
  blockLocations,
  selectableLocations,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
  userId: string;
  dayTypeId: string | null | undefined;
  blockIds: string[];
  blockLocations: Map<string, LocationContextOption | null>;
  selectableLocations: LocationContextOption[];
}) {
  const cache = new Map<string, string | null>();
  const resolved = new Map<string, string | null>();

  const normalizeId = (candidate?: string | null) =>
    candidate && candidate !== "__any__" ? candidate : null;

  for (const blockId of blockIds) {
    const stateKey = getDayTypeBlockStateKey(dayTypeId, blockId);
    const option = stateKey ? blockLocations.get(stateKey) : null;
    const normalized = normalizeLocationValue(option?.value ?? option?.label ?? null);
    if (!normalized) {
      resolved.set(blockId, null);
      continue;
    }

    const directId = normalizeId(option?.id);
    if (directId) {
      resolved.set(blockId, directId);
      cache.set(normalized, directId);
      continue;
    }

    const matchedOption =
      selectableLocations.find((opt) => normalizeLocationValue(opt.value) === normalized) ??
      selectableLocations.find((opt) => normalizeId(opt.id) === normalizeId(option?.id));

    const matchedId = normalizeId(matchedOption?.id);
    if (matchedId) {
      resolved.set(blockId, matchedId);
      cache.set(normalized, matchedId);
      continue;
    }

    if (cache.has(normalized)) {
      resolved.set(blockId, cache.get(normalized) ?? null);
      continue;
    }

    const resolvedId = await resolveLocationContextId(supabase, userId, normalized);
    cache.set(normalized, resolvedId);
    resolved.set(blockId, resolvedId);
  }

  return resolved;
}

function TimeInput({ label, value, onChange, helper, ariaLabel, dataTour }: TimeInputProps) {
  return (
    <label className="group relative flex flex-col gap-0.5 text-xs text-white/70">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}
      </span>
      <div className="flex items-stretch gap-1.5">
        <input
          type="time"
          step={1800}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? label}
          data-tour={dataTour}
          className="min-h-9 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 transition group-hover:border-white/20 group-focus-within:border-white/25 focus:outline-none"
        />
        <div className="flex flex-col overflow-hidden rounded-lg border border-white/12 bg-white/5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]">
          <button
            type="button"
            onClick={() => onChange(nudgeTime(value, 30))}
            className="flex h-[18px] items-center justify-center px-2 text-white/85 transition hover:bg-white/10 active:translate-y-[0.5px]"
            aria-label={`Increase ${label} by 30 minutes`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <div className="h-px bg-white/10" />
          <button
            type="button"
            onClick={() => onChange(nudgeTime(value, -30))}
            className="flex h-[18px] items-center justify-center px-2 text-white/70 transition hover:bg-white/10 active:translate-y-[0.5px]"
            aria-label={`Decrease ${label} by 30 minutes`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {helper ? <span className="text-[9px] leading-tight text-white/35">{helper}</span> : null}
    </label>
  );
}

const DEFAULT_FORM = {
  label: "",
  start_local: "08:00",
  end_local: "17:00",
};

export default function NewDayTypePage() {
  const supabase = getSupabaseBrowser();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [dayTypes, setDayTypes] = useState<DayType[]>([]);
  const [dayTypeBlockMap, setDayTypeBlockMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedDays, setSelectedDays] = useState<Set<string>>(() => new Set());
  const [days, setDays] = useState<Set<string>>(() => new Set([DEFAULT_DAY_PREVIEW.key]));
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<string | null>(null);
  const [focusedDayKey, setFocusedDayKey] = useState(DEFAULT_DAY_PREVIEW.key);
  const dayPreviewScrollerRef = useRef<HTMLDivElement | null>(null);
  const dayPreviewScrollFrameRef = useRef<number | null>(null);
  const dayPreviewScrollSyncTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const dayPreviewPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dayPreviewPointerDraggingRef = useRef(false);
  const dayPreviewSuppressClickRef = useRef(false);
  const [isCreatingDayType, setIsCreatingDayType] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createState, setCreateState] = useState(DEFAULT_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [dayTypeCreateError, setDayTypeCreateError] = useState<string | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);
  const [dayTypeName, setDayTypeName] = useState("Default day");
  const [hasDefaultDayType, setHasDefaultDayType] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [schedulerMode, setSchedulerMode] = useState<SchedulerModeType>("REGULAR");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingBlockContext, setEditingBlockContext] = useState<TimeBlockEditContext | null>(null);
  const [editScope, setEditScope] = useState<TimeBlockEditScope>("everywhere");
  const [timeBlockListMode, setTimeBlockListMode] = useState<TimeBlockListMode>("selected-day-type");
  const [attachConflictBlockId, setAttachConflictBlockId] = useState<string | null>(null);
  const [constraintsTarget, setConstraintsTarget] = useState<TimeBlock | null>(null);
  const [tourEnergyHighlightId, setTourEnergyHighlightId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [blockEnergy, setBlockEnergy] = useState<Map<string, FlameLevel>>(() => new Map());
  const [blockLocation, setBlockLocation] = useState<Map<string, LocationContextOption | null>>(
    () => new Map()
  );
  const [blockType, setBlockType] = useState<Map<string, BlockType>>(() => new Map());
  const [blockAllowAllHabitTypes, setBlockAllowAllHabitTypes] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [blockAllowAllSkills, setBlockAllowAllSkills] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [blockAllowAllMonuments, setBlockAllowAllMonuments] = useState<Map<string, boolean>>(
    () => new Map()
  );
  const [blockAllowedHabitTypes, setBlockAllowedHabitTypes] = useState<Map<string, Set<string>>>(
    () => new Map()
  );
  const [blockAllowedSkillIds, setBlockAllowedSkillIds] = useState<Map<string, Set<string>>>(
    () => new Map()
  );
  const [blockAllowedMonumentIds, setBlockAllowedMonumentIds] = useState<Map<string, Set<string>>>(
    () => new Map()
  );
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [monuments, setMonuments] = useState<Monument[]>([]);
  const [monumentsLoading, setMonumentsLoading] = useState(false);
  const [skillCategories, setSkillCategories] = useState<CatRow[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [monumentSearch, setMonumentSearch] = useState("");

  const filteredSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    return skills
      .filter((skill) => (skill.name ?? "").toLowerCase().includes(term))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [skills, skillSearch]);

  const categoryLookup = useMemo(() => {
    const lookup = new Map<string, CatRow>();
    skillCategories.forEach((category) => {
      lookup.set(category.id, category);
    });
    return lookup;
  }, [skillCategories]);

  const skillGroups = useMemo(() => {
    const grouped = new Map<string, Skill[]>();
    filteredSkills.forEach((skill) => {
      const groupId = skill.cat_id ?? UNCATEGORIZED_CATEGORY_ID;
      const existing = grouped.get(groupId);
      if (existing) {
        existing.push(skill);
      } else {
        grouped.set(groupId, [skill]);
      }
    });

    const groups: SkillGroup[] = [];
    skillCategories.forEach((category) => {
      const list = grouped.get(category.id);
      if (!list?.length) return;
      groups.push({
        id: category.id,
        label: category.name ?? UNCATEGORIZED_CATEGORY_LABEL,
        skills: list,
      });
      grouped.delete(category.id);
    });

    const uncategorized = grouped.get(UNCATEGORIZED_CATEGORY_ID);
    if (uncategorized?.length) {
      groups.push({
        id: UNCATEGORIZED_CATEGORY_ID,
        label: UNCATEGORIZED_CATEGORY_LABEL,
        skills: uncategorized,
      });
      grouped.delete(UNCATEGORIZED_CATEGORY_ID);
    }

    grouped.forEach((list, groupId) => {
      groups.push({
        id: groupId,
        label: categoryLookup.get(groupId)?.name ?? UNCATEGORIZED_CATEGORY_LABEL,
        skills: list,
      });
    });

    return groups;
  }, [filteredSkills, skillCategories, categoryLookup]);

  const FLAME_LEVELS = ENERGY.LIST as FlameLevel[];
  const isEditingBlock = Boolean(editingBlockId);
  const hasBlocks = timeBlocks.length > 0;
  const { options: locationOptions, loading: loadingLocations } = useLocationContexts();
  const selectableLocations = useMemo(() => locationOptions ?? [], [locationOptions]);
  const findWorkBlock = useCallback(() => {
    return timeBlocks.find((block) => normalizeLabel(block.label) === "WORK") ?? null;
  }, [timeBlocks]);

  const startCreateBlock = useCallback(() => {
    const defaultDayKey =
      typeof DAY_KEY_TO_INDEX[focusedDayKey] === "number"
        ? focusedDayKey
        : DEFAULT_DAY_PREVIEW.key;
    setIsCreatingDayType(false);
    setIsEditingExisting(false);
    setSaveMessage(null);
    setDayTypeCreateError(null);
    setEditingBlockId(null);
    setEditingBlockContext(null);
    setEditScope("everywhere");
    setConstraintsTarget(null);
    setCreateState(DEFAULT_FORM);
    setCreateError(null);
    setConfirmingDeleteId(null);
    setDays(new Set([defaultDayKey]));
    setShowCreateForm(true);
  }, [focusedDayKey]);

  const removeCompositeStateEntriesForBlock = (blockId: string) => {
    const suffix = `:${blockId}`;
    const matchesBlock = (key: string) => key === blockId || key.endsWith(suffix);
    const prune = <T,>(setter: (updater: (prev: Map<string, T>) => Map<string, T>) => void) => {
      setter((prev) => {
        const next = new Map(prev);
        Array.from(next.keys()).forEach((key) => {
          if (matchesBlock(key)) {
            next.delete(key);
          }
        });
        return next;
      });
    };

    prune(setBlockEnergy);
    prune(setBlockLocation);
    prune(setBlockType);
    prune(setBlockAllowAllHabitTypes);
    prune(setBlockAllowAllSkills);
    prune(setBlockAllowAllMonuments);
    prune(setBlockAllowedHabitTypes);
    prune(setBlockAllowedSkillIds);
    prune(setBlockAllowedMonumentIds);
  };

  const removeCompositeStateEntryForDayTypeBlock = (dayTypeId: string, blockId: string) => {
    const stateKey = getDayTypeBlockStateKey(dayTypeId, blockId);
    if (!stateKey) return;
    const prune = <T,>(setter: (updater: (prev: Map<string, T>) => Map<string, T>) => void) => {
      setter((prev) => {
        if (!prev.has(stateKey)) return prev;
        const next = new Map(prev);
        next.delete(stateKey);
        return next;
      });
    };

    prune(setBlockEnergy);
    prune(setBlockLocation);
    prune(setBlockType);
    prune(setBlockAllowAllHabitTypes);
    prune(setBlockAllowAllSkills);
    prune(setBlockAllowAllMonuments);
    prune(setBlockAllowedHabitTypes);
    prune(setBlockAllowedSkillIds);
    prune(setBlockAllowedMonumentIds);
  };

  const rekeyDayTypeBlockState = (
    fromDayTypeId: string | null | undefined,
    toDayTypeId: string,
    blockIds: string[]
  ) => {
    if (!fromDayTypeId || fromDayTypeId === toDayTypeId || blockIds.length === 0) return;
    const statePairs = blockIds
      .map((blockId) => {
        const fromKey = getDayTypeBlockStateKey(fromDayTypeId, blockId);
        const toKey = getDayTypeBlockStateKey(toDayTypeId, blockId);
        if (!fromKey || !toKey) return null;
        return { fromKey, toKey };
      })
      .filter((entry): entry is { fromKey: string; toKey: string } => Boolean(entry));

    if (statePairs.length === 0) return;

    const moveEntries = <T,>(
      setter: (updater: (prev: Map<string, T>) => Map<string, T>) => void,
      cloneFn?: (value: T) => T
    ) => {
      setter((prev) => {
        const next = new Map(prev);
        statePairs.forEach(({ fromKey, toKey }) => {
          const value = prev.get(fromKey);
          next.delete(fromKey);
          if (value === undefined) return;
          next.set(toKey, cloneFn ? cloneFn(value) : value);
        });
        return next;
      });
    };

    moveEntries(setBlockEnergy);
    moveEntries(setBlockLocation, (value) =>
      value ? { ...value } : (value as LocationContextOption | null)
    );
    moveEntries(setBlockType);
    moveEntries(setBlockAllowAllHabitTypes);
    moveEntries(setBlockAllowAllSkills);
    moveEntries(setBlockAllowAllMonuments);
    moveEntries(setBlockAllowedHabitTypes, (value) => new Set(value));
    moveEntries(setBlockAllowedSkillIds, (value) => new Set(value));
    moveEntries(setBlockAllowedMonumentIds, (value) => new Set(value));
  };

  const moveDayTypeBlockStateKey = (
    dayTypeId: string | null | undefined,
    fromBlockId: string,
    toBlockId: string
  ) => {
    const fromKey = getDayTypeBlockStateKey(dayTypeId, fromBlockId);
    const toKey = getDayTypeBlockStateKey(dayTypeId, toBlockId);
    if (!fromKey || !toKey || fromKey === toKey) return;

    const moveEntry = <T,>(
      setter: (updater: (prev: Map<string, T>) => Map<string, T>) => void,
      cloneFn?: (value: T) => T
    ) => {
      setter((prev) => {
        const next = new Map(prev);
        const value = prev.get(fromKey);
        next.delete(fromKey);
        if (value !== undefined) {
          next.set(toKey, cloneFn ? cloneFn(value) : value);
        }
        return next;
      });
    };

    moveEntry(setBlockEnergy);
    moveEntry(setBlockLocation, (value) =>
      value ? { ...value } : (value as LocationContextOption | null)
    );
    moveEntry(setBlockType);
    moveEntry(setBlockAllowAllHabitTypes);
    moveEntry(setBlockAllowAllSkills);
    moveEntry(setBlockAllowAllMonuments);
    moveEntry(setBlockAllowedHabitTypes, (value) => new Set(value));
    moveEntry(setBlockAllowedSkillIds, (value) => new Set(value));
    moveEntry(setBlockAllowedMonumentIds, (value) => new Set(value));
  };

  const ensureDayTypeBlockSettings = (
    blockId: string,
    dayTypeId: string | null | undefined = selectedDayTypeId,
    defaultEnergy: FlameLevel = "NO"
  ) => {
    const stateKey = getDayTypeBlockStateKey(dayTypeId, blockId);
    if (!stateKey) return;
    setBlockEnergy((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, defaultEnergy);
      return next;
    });
    setBlockLocation((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, null);
      return next;
    });
    setBlockType((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, "FOCUS");
      return next;
    });
    setBlockAllowAllHabitTypes((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, true);
      return next;
    });
    setBlockAllowAllSkills((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, true);
      return next;
    });
    setBlockAllowAllMonuments((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, true);
      return next;
    });
    setBlockAllowedHabitTypes((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, new Set());
      return next;
    });
    setBlockAllowedSkillIds((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, new Set());
      return next;
    });
    setBlockAllowedMonumentIds((prev) => {
      if (prev.has(stateKey)) return prev;
      const next = new Map(prev);
      next.set(stateKey, new Set());
      return next;
    });
  };

  const emitTimeBlockSavedEvent = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tour:time-block-saved"));
  };

  const emitTimeBlockCreateOpenedEvent = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tour:time-block-create-opened"));
  }, []);

  const emitConstraintsSavedEvent = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tour:constraints-saved"));
  }, []);

  const emitConstraintsOpenedEvent = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("tour:constraints-opened"));
  }, []);

  const prevConstraintsTargetRef = useRef<typeof constraintsTarget>(null);

  useEffect(() => {
    if (prevConstraintsTargetRef.current && constraintsTarget === null) {
      emitConstraintsSavedEvent();
      setTourEnergyHighlightId(prevConstraintsTargetRef.current.id ?? null);
    }
    prevConstraintsTargetRef.current = constraintsTarget;
  }, [constraintsTarget, emitConstraintsSavedEvent]);

  const syncEnergyMap = useCallback((blocks: TimeBlock[]) => {
    const blockIdSet = new Set(blocks.map((block) => block.id));
    const pruneMap = <T,>(setter: (updater: (prev: Map<string, T>) => Map<string, T>) => void) => {
      setter((prev) => {
        const next = new Map(prev);
        Array.from(next.keys()).forEach((key) => {
          const blockId = getBlockIdFromStateKey(key);
          if (blockId && !blockIdSet.has(blockId)) {
            next.delete(key);
          }
        });
        return next;
      });
    };

    pruneMap(setBlockEnergy);
    pruneMap(setBlockLocation);
    pruneMap(setBlockType);
    pruneMap(setBlockAllowAllHabitTypes);
    pruneMap(setBlockAllowAllSkills);
    pruneMap(setBlockAllowAllMonuments);
    pruneMap(setBlockAllowedHabitTypes);
    pruneMap(setBlockAllowedSkillIds);
    pruneMap(setBlockAllowedMonumentIds);
  }, []);

  const getNextEnergyLevel = (current: FlameLevel): FlameLevel => {
    const idx = FLAME_LEVELS.indexOf(current);
    const nextIdx = idx >= 0 ? (idx + 1) % FLAME_LEVELS.length : 0;
    return FLAME_LEVELS[nextIdx] ?? "NO";
  };

  const setEnergyForBlockDayTypes = (
    blockId: string,
    dayTypeIds: string[],
    energy: FlameLevel
  ) => {
    const stateKeys = Array.from(new Set(dayTypeIds))
      .map((dayTypeId) => getDayTypeBlockStateKey(dayTypeId, blockId))
      .filter((stateKey): stateKey is string => Boolean(stateKey));
    if (stateKeys.length === 0) return;
    setBlockEnergy((prev) => {
      const next = new Map(prev);
      stateKeys.forEach((stateKey) => next.set(stateKey, energy));
      return next;
    });
  };

  const getEnergyUpdateDayTypeIds = useCallback(
    (blockId: string, visibleDayTypeId: string | null | undefined) => {
      if (!visibleDayTypeId) return [];
      const visibleDayType = dayTypes.find((dayType) => dayType.id === visibleDayTypeId);
      if (!isDefaultWeekdayDayType(visibleDayType)) {
        return [visibleDayTypeId];
      }

      const linkedDefaultWeekdayIds = dayTypes
        .filter(isDefaultWeekdayDayType)
        .filter((dayType) => dayTypeBlockMap.get(dayType.id)?.has(blockId) ?? false)
        .map((dayType) => dayType.id);

      return linkedDefaultWeekdayIds.length > 0 ? linkedDefaultWeekdayIds : [visibleDayTypeId];
    },
    [dayTypeBlockMap, dayTypes]
  );

  const persistBlockEnergy = async (
    blockId: string,
    dayTypeIds: string[],
    energy: FlameLevel
  ) => {
    const uniqueDayTypeIds = Array.from(new Set(dayTypeIds)).filter(Boolean);
    if (!supabase || uniqueDayTypeIds.length === 0) return 0;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;
    const { count, error } = await supabase
      .from("day_type_time_blocks")
      .update({ energy }, { count: "exact" })
      .eq("user_id", user.id)
      .eq("time_block_id", blockId)
      .in("day_type_id", uniqueDayTypeIds);
    if (error) throw error;
    return count ?? 0;
  };

  const updateLocationForBlock = (
    blockId: string,
    option: LocationContextOption | null,
    dayTypeId: string | null | undefined = selectedDayTypeId
  ) => {
    const stateKey = getDayTypeBlockStateKey(dayTypeId, blockId);
    if (!stateKey) return;
    setBlockLocation((prev) => {
      const next = new Map(prev);
      next.set(stateKey, option);
      return next;
    });
  };

  const syncResolvedLocations = useCallback(
    (dayTypeId: string | null | undefined, blockIds: string[], resolved: Map<string, string | null>) => {
      if (!dayTypeId) return;
      setBlockLocation((prev) => {
        const next = new Map(prev);
        blockIds.forEach((id) => {
          const resolvedId = resolved.get(id);
          if (!resolvedId) return;
          const stateKey = getDayTypeBlockStateKey(dayTypeId, id);
          if (!stateKey) return;
          const current = prev.get(stateKey);
          const value = normalizeLocationValue(current?.value ?? current?.label ?? null) ?? "";
          const label = current?.label ?? current?.value ?? value;
          next.set(stateKey, {
            id: resolvedId,
            value: value || resolvedId,
            label: label || resolvedId,
          });
        });
        return next;
      });
    },
    []
  );

  const makeId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const resolveOrCreateWeekdayDayTypes = async ({
    userId,
    dayKeys,
  }: {
    userId: string;
    dayKeys: string[];
  }) => {
    const validDayKeys = Array.from(new Set(dayKeys)).filter(
      (dayKey) => typeof DAY_KEY_TO_INDEX[dayKey] === "number"
    );
    if (validDayKeys.length === 0) {
      return [] as Array<{ dayKey: string; dayType: DayType }>;
    }

    if (!supabase) {
      const working = [...dayTypes];
      const resolved: Array<{ dayKey: string; dayType: DayType }> = [];
      validDayKeys.forEach((dayKey) => {
        const dayIndex = DAY_KEY_TO_INDEX[dayKey];
        const existing =
          working.find((dt) => dt.is_default && dt.days.includes(dayIndex)) ??
          working.find((dt) => dt.days.includes(dayIndex));
        if (existing) {
          resolved.push({ dayKey, dayType: existing });
          return;
        }
        const created: DayType = {
          id: makeId(),
          name: getAverageDayTypeName(dayKey),
          is_default: true,
          days: [dayIndex],
          scheduler_mode: "REGULAR",
        };
        working.push(created);
        resolved.push({ dayKey, dayType: created });
      });
      return resolved;
    }

    const { data: existingRows, error: fetchError } = await supabase
      .from("day_types")
      .select("id,name,is_default,days,scheduler_mode")
      .eq("user_id", userId)
      .eq("is_temporary", false)
      .order("created_at", { ascending: true });
    if (fetchError) throw fetchError;

    const working = ((existingRows as DayType[] | null) ?? []).map(normalizeDayTypeRow);
    const resolved: Array<{ dayKey: string; dayType: DayType }> = [];

    for (const dayKey of validDayKeys) {
      const dayIndex = DAY_KEY_TO_INDEX[dayKey];
      const existing =
        working.find((dt) => dt.is_default && dt.days.includes(dayIndex)) ??
        working.find((dt) => dt.days.includes(dayIndex));
      if (existing) {
        resolved.push({ dayKey, dayType: existing });
        continue;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("day_types")
        .insert({
          user_id: userId,
          name: getAverageDayTypeName(dayKey),
          is_default: true,
          days: [dayIndex],
          scheduler_mode: "REGULAR",
        })
        .select("id,name,is_default,days,scheduler_mode")
        .single();
      if (insertError) throw insertError;

      const created = normalizeDayTypeRow(inserted as DayType);
      working.push(created);
      resolved.push({ dayKey, dayType: created });
    }

    return resolved;
  };

  const loadBlocks = useCallback(async () => {
    setError(null);
    try {
      if (!supabase) {
        setTimeBlocks([]);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setTimeBlocks([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("time_blocks")
        .select("id,label,start_local,end_local,day_type_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (fetchError) throw fetchError;
      const normalized = (data ?? []).map((block) => ({
        ...block,
        label: normalizeLabel(block.label),
        start_local: normalizeTimeLabel(block.start_local),
        end_local: normalizeTimeLabel(block.end_local),
        day_type_id: block.day_type_id ?? null,
      })) as TimeBlock[];
      setTimeBlocks(sortTimeBlocks(normalized));
      syncEnergyMap(normalized);
    } catch (err) {
      console.error(err);
      setError("Unable to load time blocks right now.");
      setTimeBlocks([]);
    }
  }, [supabase, syncEnergyMap]);

  const loadDayTypes = useCallback(async () => {
    try {
      if (!supabase) {
        setDayTypes([]);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setDayTypes([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("day_types")
        .select("id,name,is_default,days,scheduler_mode")
        .eq("user_id", user.id)
        .eq("is_temporary", false)
        .order("created_at", { ascending: true });
      if (fetchError) throw fetchError;
      const normalized = (data as DayType[] | null)?.map(normalizeDayTypeRow);
      setDayTypes(normalized ?? []);
      setHasDefaultDayType(Boolean((normalized ?? []).find((dt) => dt.is_default && dt.days.length > 0)));
    } catch (err) {
      console.error(err);
      setDayTypes([]);
    }
  }, [supabase]);

  const loadDayTypeBlockLinks = useCallback(async () => {
    try {
      if (!supabase) {
        setDayTypeBlockMap(new Map());
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setDayTypeBlockMap(new Map());
        return;
      }
      const { data, error: fetchError } = await supabase
        .from("day_type_time_blocks")
        .select(
          "id,day_type_id,time_block_id,energy,block_type,location_context_id,allow_all_habit_types,allow_all_skills,allow_all_monuments,location_context:location_contexts(value,label)"
        )
        .eq("user_id", user.id);
      if (fetchError) throw fetchError;
      const next = new Map<string, Set<string>>();
      const energyMap = new Map<string, FlameLevel>();
      const locationMap = new Map<string, LocationContextOption | null>();
      const typeMap = new Map<string, BlockType>();
      const allowHabitMap = new Map<string, boolean>();
      const allowSkillMap = new Map<string, boolean>();
      const allowMonumentMap = new Map<string, boolean>();
      const allowedHabitMap = new Map<string, Set<string>>();
      const allowedSkillMap = new Map<string, Set<string>>();
      const allowedMonumentMap = new Map<string, Set<string>>();
      const dttbToStateInfo = new Map<string, { blockId: string; stateKey: string }>();
      (data as DayTypeBlockLink[] | null)?.forEach((row) => {
        if (!row.day_type_id || !row.time_block_id) return;
        const stateKey = getDayTypeBlockStateKey(row.day_type_id, row.time_block_id);
        if (!stateKey) return;
        if (row.id) {
          dttbToStateInfo.set(row.id, {
            blockId: row.time_block_id,
            stateKey,
          });
        }
        const existing = next.get(row.day_type_id) ?? new Set<string>();
        existing.add(row.time_block_id);
        next.set(row.day_type_id, existing);
        const level = (row.energy as FlameLevel | undefined) ?? "NO";
        energyMap.set(stateKey, level);
        const type = (row.block_type as BlockType | undefined) ?? "FOCUS";
        typeMap.set(stateKey, type);
        allowHabitMap.set(stateKey, row.allow_all_habit_types !== false);
        allowSkillMap.set(stateKey, row.allow_all_skills !== false);
        allowMonumentMap.set(stateKey, row.allow_all_monuments !== false);
        if (row.location_context_id) {
          const locationContext = (
            row as {
              location_context?: { value?: string | null; label?: string | null };
            }
          )?.location_context;
          const value =
            typeof locationContext?.value === "string"
              ? locationContext.value.trim().toUpperCase()
              : null;
          const label =
            typeof locationContext?.label === "string" ? locationContext.label.trim() : value;
          locationMap.set(stateKey, {
            id: row.location_context_id,
            value: value ?? row.location_context_id,
            label: label ?? row.location_context_id,
          });
        } else {
          locationMap.set(stateKey, null);
        }
      });
      const dttbIds = Array.from(dttbToStateInfo.keys());
      if (dttbIds.length > 0) {
        const [habitWhitelist, skillWhitelist, monumentWhitelist] = await Promise.all([
          supabase
            .from("day_type_time_block_allowed_habit_types")
            .select("day_type_time_block_id, habit_type")
            .in("day_type_time_block_id", dttbIds),
          supabase
            .from("day_type_time_block_allowed_skills")
            .select("day_type_time_block_id, skill_id")
            .in("day_type_time_block_id", dttbIds),
          supabase
            .from("day_type_time_block_allowed_monuments")
            .select("day_type_time_block_id, monument_id")
            .in("day_type_time_block_id", dttbIds),
        ]);
        if (habitWhitelist.error) throw habitWhitelist.error;
        if (skillWhitelist.error) throw skillWhitelist.error;
        if (monumentWhitelist.error) throw monumentWhitelist.error;

        (habitWhitelist.data ?? []).forEach((row) => {
          const info = row.day_type_time_block_id
            ? dttbToStateInfo.get(row.day_type_time_block_id)
            : null;
          const stateKey = info?.stateKey;
          const normalized = normalizeHabitTypeValue(
            (row as { habit_type?: string | null })?.habit_type ?? null
          );
          if (!stateKey || !normalized) return;
          const existing = allowedHabitMap.get(stateKey) ?? new Set<string>();
          existing.add(normalized);
          allowedHabitMap.set(stateKey, existing);
        });
        (skillWhitelist.data ?? []).forEach((row) => {
          const info = row.day_type_time_block_id
            ? dttbToStateInfo.get(row.day_type_time_block_id)
            : null;
          const stateKey = info?.stateKey;
          const skillId = (row as { skill_id?: string | null })?.skill_id?.trim();
          if (!stateKey || !skillId) return;
          const existing = allowedSkillMap.get(stateKey) ?? new Set<string>();
          existing.add(skillId);
          allowedSkillMap.set(stateKey, existing);
        });
        (monumentWhitelist.data ?? []).forEach((row) => {
          const info = row.day_type_time_block_id
            ? dttbToStateInfo.get(row.day_type_time_block_id)
            : null;
          const stateKey = info?.stateKey;
          const monumentId = (row as { monument_id?: string | null })?.monument_id?.trim();
          if (!stateKey || !monumentId) return;
          const existing = allowedMonumentMap.get(stateKey) ?? new Set<string>();
          existing.add(monumentId);
          allowedMonumentMap.set(stateKey, existing);
        });
      }
      setBlockEnergy((prev) => {
        const merged = new Map(prev);
        energyMap.forEach((level, id) => merged.set(id, level));
        return merged;
      });
      setBlockLocation((prev) => {
        const merged = new Map(prev);
        locationMap.forEach((option, id) => merged.set(id, option));
        return merged;
      });
      setBlockType((prev) => {
        const merged = new Map(prev);
        typeMap.forEach((type, id) => merged.set(id, type));
        return merged;
      });
      setBlockAllowAllHabitTypes((prev) => {
        const merged = new Map(prev);
        allowHabitMap.forEach((value, id) => merged.set(id, value));
        return merged;
      });
      setBlockAllowAllSkills((prev) => {
        const merged = new Map(prev);
        allowSkillMap.forEach((value, id) => merged.set(id, value));
        return merged;
      });
      setBlockAllowAllMonuments((prev) => {
        const merged = new Map(prev);
        allowMonumentMap.forEach((value, id) => merged.set(id, value));
        return merged;
      });
      setBlockAllowedHabitTypes((prev) => {
        const merged = new Map(prev);
        allowedHabitMap.forEach((value, id) => merged.set(id, new Set(value)));
        return merged;
      });
      setBlockAllowedSkillIds((prev) => {
        const merged = new Map(prev);
        allowedSkillMap.forEach((value, id) => merged.set(id, new Set(value)));
        return merged;
      });
      setBlockAllowedMonumentIds((prev) => {
        const merged = new Map(prev);
        allowedMonumentMap.forEach((value, id) => merged.set(id, new Set(value)));
        return merged;
      });
      setDayTypeBlockMap(next);
    } catch (err) {
      console.error(err);
      setDayTypeBlockMap(new Map());
    }
  }, [supabase]);

  const loadConstraintOptions = useCallback(async () => {
    try {
      if (!supabase) {
        setSkills([]);
        setMonuments([]);
        setSkillCategories([]);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setSkills([]);
        setMonuments([]);
        setSkillCategories([]);
        return;
      }
      setSkillsLoading(true);
      setMonumentsLoading(true);
      const [skillsData, monumentsData, categoriesData] = await Promise.all([
        getSkillsForUser(user.id).catch((error) => {
          console.warn("Unable to load skills", error);
          return [];
        }),
        getMonumentsForUser(user.id).catch((error) => {
          console.warn("Unable to load monuments", error);
          return [];
        }),
        getCatsForUser(user.id, supabase).catch((error) => {
          console.warn("Unable to load skill categories", error);
          return [];
        }),
      ]);
      setSkills(skillsData ?? []);
      setMonuments(monumentsData ?? []);
      setSkillCategories(categoriesData ?? []);
    } catch (err) {
      console.error(err);
      setSkills([]);
      setMonuments([]);
      setSkillCategories([]);
    } finally {
      setSkillsLoading(false);
      setMonumentsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadBlocks();
    void loadDayTypes();
    void loadDayTypeBlockLinks();
    void loadConstraintOptions();
  }, [loadBlocks, loadDayTypes, loadDayTypeBlockLinks, loadConstraintOptions]);

  const dayOwnership = useMemo(() => {
    const map = new Map<string, string>();
    dayTypes
      .filter((dt) => dt.is_default && dt.days.length > 0)
      .forEach((dt) => {
        dt.days.forEach((dayIndex) => {
          const key = DAY_INDEX_TO_KEY[dayIndex];
          if (key) {
            map.set(key, dt.id);
          }
        });
      });
    return map;
  }, [dayTypes]);

  const loadDayTypeSelection = useCallback(
    (dayType: DayType) => {
      setIsCreatingDayType(false);
      setSaveMessage(null);
      setIsEditingExisting(false);
      setEditingBlockId(null);
      setEditingBlockContext(null);
      setEditScope("everywhere");
      setConstraintsTarget(null);
      setMenuOpenId(null);
      setCreateError(null);
      setCreateState(DEFAULT_FORM);
      setSelectedDayTypeId(dayType.id);
      setTimeBlockListMode("selected-day-type");
      setDayTypeName(dayType.name);
      setIsDefault(dayType.is_default);
      setSchedulerMode(dayType.scheduler_mode ?? "REGULAR");
      const mapped = dayTypeBlockMap.get(dayType.id);
      setSelectedIds(new Set(mapped ?? []));
      const defaults = dayType.days
        .map((n) => DAY_INDEX_TO_KEY[n])
        .filter((d): d is string => Boolean(d));
      setSelectedDays(new Set(defaults));
    },
    [dayTypeBlockMap]
  );

  const resetVisibleDaySelection = useCallback((dayKey: string) => {
    setSelectedDayTypeId(null);
    setSelectedIds(new Set());
    setDayTypeName("");
    setIsDefault(true);
    setSchedulerMode("REGULAR");
    setSelectedDays(new Set([dayKey]));
    setIsCreatingDayType(false);
    setIsEditingExisting(false);
    setEditingBlockId(null);
    setEditingBlockContext(null);
    setEditScope("everywhere");
    setConstraintsTarget(null);
    setMenuOpenId(null);
    setCreateError(null);
    setCreateState(DEFAULT_FORM);
  }, []);

  useEffect(() => {
    if (isCreatingDayType) return;
    if (dayTypes.length === 0) {
      setSelectedDayTypeId(null);
      setTimeBlockListMode("all-blocks");
      setDayTypeName("");
      setIsDefault(true);
      setSchedulerMode("REGULAR");
      setIsCreatingDayType(false);
      setIsEditingExisting(false);
      setSelectedDays(new Set());
      setEditingBlockId(null);
      setConstraintsTarget(null);
      setCreateError(null);
      setCreateState(DEFAULT_FORM);
      return;
    }

    const focusedDayType = findDayTypeForWeekday(focusedDayKey, dayTypes);
    if (!focusedDayType) {
      resetVisibleDaySelection(focusedDayKey);
      return;
    }

    if (selectedDayTypeId !== focusedDayType.id) {
      loadDayTypeSelection(focusedDayType);
    }
  }, [
    dayTypes,
    focusedDayKey,
    isCreatingDayType,
    loadDayTypeSelection,
    resetVisibleDaySelection,
    selectedDayTypeId,
  ]);

  useEffect(() => {
    if (isCreatingDayType) return;
    if (!selectedDayTypeId) return;
    const current = dayTypes.find((dt) => dt.id === selectedDayTypeId);
    if (current) {
      setDayTypeName(current.name);
      setIsDefault(current.is_default);
      setSchedulerMode(current.scheduler_mode ?? "REGULAR");
      const defaults = current.days.map((n) => DAY_INDEX_TO_KEY[n]).filter((d): d is string => Boolean(d));
      setSelectedDays(new Set(defaults));
    }
  }, [dayTypes, isCreatingDayType, selectedDayTypeId]);

  useEffect(() => {
    if (isCreatingDayType || !selectedDayTypeId) return;
    const matching = dayTypeBlockMap.get(selectedDayTypeId);
    setSelectedIds(new Set(matching ?? []));
  }, [dayTypeBlockMap, isCreatingDayType, selectedDayTypeId]);

  useEffect(() => {
    if (!selectedDayTypeId) {
      setTimeBlockListMode("all-blocks");
    }
  }, [selectedDayTypeId]);

  useEffect(() => {
    setAttachConflictBlockId(null);
  }, [focusedDayKey, selectedDayTypeId]);

  const startCreateDayType = useCallback(() => {
    setIsCreatingDayType(true);
    setSelectedDayTypeId(makeId());
    setSelectedIds(new Set());
    setDayTypeName("");
    setSchedulerMode("REGULAR");
    setIsDefault(true);
    setSelectedDays(new Set([focusedDayKey]));
    setSaveMessage(null);
    setDayTypeCreateError(null);
    setIsEditingExisting(false);
    setShowCreateForm(false);
    setCreateError(null);
    setCreateState(DEFAULT_FORM);
    setEditingBlockId(null);
    setEditingBlockContext(null);
    setEditScope("everywhere");
    setConstraintsTarget(null);
    setConfirmingDeleteId(null);
    setMenuOpenId(null);
  }, [focusedDayKey]);

  const availableDayKeys = useMemo(
    () =>
      DAYS_OF_WEEK.filter((day) => {
        const owner = dayOwnership.get(day.key);
        return !owner || owner === selectedDayTypeId;
      }).map((day) => day.key),
    [dayOwnership, selectedDayTypeId]
  );

  const conflictingSelectedDays = useMemo(
    () =>
      new Set(
        Array.from(selectedDays).filter((dayKey) => {
          const owner = dayOwnership.get(dayKey);
          return owner && owner !== selectedDayTypeId;
        })
      ),
    [dayOwnership, selectedDayTypeId, selectedDays]
  );

  const resetBlockForm = () => {
    setCreateState(DEFAULT_FORM);
    setCreateError(null);
    setShowCreateForm(false);
    setEditingBlockId(null);
    setEditingBlockContext(null);
    setEditScope("everywhere");
    setConfirmingDeleteId(null);
    setMenuOpenId(null);
  };

  const getCreateOverlapConflicts = useCallback(
    (
      proposed: Pick<TimeBlock, "start_local" | "end_local">,
      selectedDayKeys: string[]
    ): TimeBlockOverlapConflict[] => {
      return selectedDayKeys.flatMap((dayKey) => {
        const dayType = findDayTypeForWeekday(dayKey, dayTypes);
        if (!dayType) return [];
        const blockIds = dayTypeBlockMap.get(dayType.id);
        if (!blockIds?.size) return [];

        const overlappingBlock = timeBlocks.find(
          (block) => blockIds.has(block.id) && timeBlocksOverlap(proposed, block)
        );
        return overlappingBlock ? [{ dayKey, dayType, overlappingBlock }] : [];
      });
    },
    [dayTypeBlockMap, dayTypes, timeBlocks]
  );

  const resetDayTypeCreateForm = useCallback(() => {
    setIsCreatingDayType(false);
    setIsEditingExisting(false);
    setSelectedDayTypeId(null);
    setSelectedIds(new Set());
    setDayTypeName("");
    setIsDefault(true);
    setSchedulerMode("REGULAR");
    setSelectedDays(new Set());
    setSaveMessage(null);
    setDayTypeCreateError(null);
    setEditingBlockId(null);
    setEditingBlockContext(null);
    setEditScope("everywhere");
    setConstraintsTarget(null);
    setConfirmingDeleteId(null);
    setMenuOpenId(null);
  }, []);

  const handleSubmitDayType = useCallback(async () => {
    setDayTypeCreateError(null);
    setSaveMessage(null);

    const name = normalizeLabel(dayTypeName);
    if (!name) {
      setDayTypeCreateError("Name this Day Type.");
      return;
    }

    const selectedDayKeys = Array.from(selectedDays).filter(
      (dayKey) => typeof DAY_KEY_TO_INDEX[dayKey] === "number"
    );
    const selectedDayIndexes = selectedDayKeys
      .map((dayKey) => DAY_KEY_TO_INDEX[dayKey])
      .filter((dayIndex): dayIndex is number => typeof dayIndex === "number");
    const selectedDayIndexSet = new Set(selectedDayIndexes);
    const shouldAssignWeekdays = selectedDayIndexes.length > 0;

    setSaving(true);
    try {
      const locallyCreated: DayType = {
        id: makeId(),
        name,
        is_default: shouldAssignWeekdays,
        days: selectedDayIndexes,
        scheduler_mode: "REGULAR",
      };
      let created = locallyCreated;

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setDayTypeCreateError("You must be signed in to create a Day Type.");
          return;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("day_types")
          .insert({
            user_id: user.id,
            name,
            is_default: shouldAssignWeekdays,
            days: selectedDayIndexes,
            scheduler_mode: "REGULAR",
          })
          .select("id,name,is_default,days,scheduler_mode")
          .single();
        if (insertError) throw insertError;

        created = normalizeDayTypeRow(inserted as DayType);

        if (shouldAssignWeekdays) {
          const conflictingDefaults = dayTypes.filter(
            (dayType) =>
              dayType.id !== created.id &&
              dayType.is_default &&
              dayType.days.some((dayIndex) => selectedDayIndexSet.has(dayIndex))
          );

          for (const dayType of conflictingDefaults) {
            const remainingDays = dayType.days.filter(
              (dayIndex) => !selectedDayIndexSet.has(dayIndex)
            );
            const { error: updateError } = await supabase
              .from("day_types")
              .update({
                days: remainingDays,
                is_default: remainingDays.length > 0,
              })
              .eq("id", dayType.id)
              .eq("user_id", user.id);
            if (updateError) throw updateError;
          }
        }
      }

      const nextDayTypes = [
        ...dayTypes.map((dayType) => {
          if (!shouldAssignWeekdays || dayType.id === created.id || !dayType.is_default) {
            return dayType;
          }
          const daysForType = dayType.days.filter(
            (dayIndex) => !selectedDayIndexSet.has(dayIndex)
          );
          return {
            ...dayType,
            days: daysForType,
            is_default: daysForType.length > 0,
          };
        }),
        created,
      ];
      setDayTypes(nextDayTypes);
      setHasDefaultDayType(
        nextDayTypes.some((dayType) => dayType.is_default && dayType.days.length > 0)
      );
      setDayTypeBlockMap((prev) => {
        const next = new Map(prev);
        next.set(created.id, new Set());
        return next;
      });

      if (selectedDayKeys[0]) {
        setFocusedDayKey(selectedDayKeys[0]);
      }
      setSelectedDayTypeId(created.id);
      setSelectedIds(new Set());
      setDayTypeName(created.name);
      setIsDefault(created.is_default);
      setSchedulerMode(created.scheduler_mode ?? "REGULAR");
      setSelectedDays(
        new Set(
          created.days
            .map((dayIndex) => DAY_INDEX_TO_KEY[dayIndex])
            .filter((dayKey): dayKey is string => Boolean(dayKey))
        )
      );
      setTimeBlockListMode("selected-day-type");
      setIsCreatingDayType(false);
      setIsEditingExisting(false);
      setShowCreateForm(false);
      setCreateError(null);
      setCreateState(DEFAULT_FORM);
      setEditingBlockId(null);
      setEditingBlockContext(null);
      setEditScope("everywhere");
      setConstraintsTarget(null);
      setConfirmingDeleteId(null);
      setMenuOpenId(null);
      setSaveMessage(`Created Day Type: ${created.name}`);
    } catch (err) {
      console.error(err);
      setDayTypeCreateError("Unable to create Day Type right now.");
    } finally {
      setSaving(false);
    }
  }, [dayTypeName, dayTypes, selectedDays, supabase]);

  const handleSubmitBlock = async () => {
    setCreateError(null);
    const start = parseTimeToMinutes(createState.start_local);
    const end = parseTimeToMinutes(createState.end_local);
    if (start === null || end === null) {
      setCreateError("Please enter start and end times as HH:MM.");
      return;
    }
    const label = normalizeLabel(createState.label);
    if (!label) {
      setCreateError("Please name this time block.");
      return;
    }
    const selectedDayKeys = Array.from(days).filter(
      (dayKey) => typeof DAY_KEY_TO_INDEX[dayKey] === "number"
    );
    if (!isEditingBlock && selectedDayKeys.length === 0) {
      setCreateError("Pick at least one day for this block.");
      return;
    }
    if (!isEditingBlock) {
      const normalizedProposed = {
        start_local: normalizeTimeLabel(createState.start_local),
        end_local: normalizeTimeLabel(createState.end_local),
      };
      const overlapConflicts = getCreateOverlapConflicts(normalizedProposed, selectedDayKeys);
      if (overlapConflicts.length > 0) {
        return;
      }
    }
    setSavingBlock(true);
    try {
      if (isEditingBlock && editingBlockId) {
        const optimisticUpdated: TimeBlock = {
          id: editingBlockId,
          label,
          start_local: normalizeTimeLabel(createState.start_local),
          end_local: normalizeTimeLabel(createState.end_local),
          day_type_id: timeBlocks.find((block) => block.id === editingBlockId)?.day_type_id ?? null,
        };

        const shouldUpdateOnlyDayType =
          editingBlockContext?.mode === "selected-day-type" && editScope === "only-day-type";
        const selectedEditDayTypeId =
          editingBlockContext?.mode === "selected-day-type" ? editingBlockContext.dayTypeId : null;

        if (!supabase) {
          if (shouldUpdateOnlyDayType && selectedEditDayTypeId) {
            const cloned: TimeBlock = {
              ...optimisticUpdated,
              id: makeId(),
              day_type_id: null,
            };
            setTimeBlocks((prev) => sortTimeBlocks([...prev, cloned]));
            setDayTypeBlockMap((prev) => {
              const next = new Map(prev);
              const ids = new Set(next.get(selectedEditDayTypeId) ?? []);
              ids.delete(editingBlockId);
              ids.add(cloned.id);
              next.set(selectedEditDayTypeId, ids);
              return next;
            });
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(editingBlockId);
              next.add(cloned.id);
              return next;
            });
            moveDayTypeBlockStateKey(selectedEditDayTypeId, editingBlockId, cloned.id);
          } else {
            setTimeBlocks((prev) =>
              sortTimeBlocks(
                prev.map((block) => (block.id === editingBlockId ? optimisticUpdated : block))
              )
            );
            setBlockEnergy((prev) => {
              const next = new Map(prev);
              if (!next.has(editingBlockId)) {
                next.set(editingBlockId, "NO");
              }
              return next;
            });
          }
          resetBlockForm();
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCreateError("You must be signed in to update a time block.");
          return;
        }

        if (shouldUpdateOnlyDayType && selectedEditDayTypeId) {
          const { data: insertedData, error: insertError } = await supabase
            .from("time_blocks")
            .insert({
              user_id: user.id,
              label,
              start_local: optimisticUpdated.start_local,
              end_local: optimisticUpdated.end_local,
            })
            .select("id,label,start_local,end_local,day_type_id")
            .single();
          if (insertError) throw insertError;

          const insertedRaw = (insertedData as TimeBlock) ?? {
            ...optimisticUpdated,
            id: makeId(),
            day_type_id: null,
          };
          const inserted = {
            ...insertedRaw,
            label: normalizeLabel(insertedRaw.label) ?? "TIME BLOCK",
            start_local: normalizeTimeLabel(insertedRaw.start_local),
            end_local: normalizeTimeLabel(insertedRaw.end_local),
            day_type_id: insertedRaw.day_type_id ?? null,
          };

          const { data: relinked, error: relinkError } = await supabase
            .from("day_type_time_blocks")
            .update({ time_block_id: inserted.id })
            .eq("user_id", user.id)
            .eq("day_type_id", selectedEditDayTypeId)
            .eq("time_block_id", editingBlockId)
            .select("id")
            .maybeSingle();

          if (relinkError || !relinked) {
            await supabase
              .from("time_blocks")
              .delete()
              .eq("id", inserted.id)
              .eq("user_id", user.id);
            if (relinkError) throw relinkError;
            throw new Error("No selected Day Type link found for this time block.");
          }

          setTimeBlocks((prev) => sortTimeBlocks([...prev, inserted]));
          setDayTypeBlockMap((prev) => {
            const next = new Map(prev);
            const ids = new Set(next.get(selectedEditDayTypeId) ?? []);
            ids.delete(editingBlockId);
            ids.add(inserted.id);
            next.set(selectedEditDayTypeId, ids);
            return next;
          });
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(editingBlockId);
            next.add(inserted.id);
            return next;
          });
          moveDayTypeBlockStateKey(selectedEditDayTypeId, editingBlockId, inserted.id);
        } else {
          const { data, error: updateError } = await supabase
            .from("time_blocks")
            .update({
              label,
              start_local: optimisticUpdated.start_local,
              end_local: optimisticUpdated.end_local,
            })
            .eq("id", editingBlockId)
            .eq("user_id", user.id)
            .select("id,label,start_local,end_local,day_type_id")
            .single();

          if (updateError) throw updateError;

          const updatedRaw = (data as TimeBlock) ?? optimisticUpdated;
          const updated = {
            ...updatedRaw,
            label: normalizeLabel(updatedRaw.label) ?? "TIME BLOCK",
            start_local: normalizeTimeLabel(updatedRaw.start_local),
            end_local: normalizeTimeLabel(updatedRaw.end_local),
            day_type_id: updatedRaw.day_type_id ?? optimisticUpdated.day_type_id ?? null,
          };

          setTimeBlocks((prev) =>
            sortTimeBlocks(prev.map((block) => (block.id === editingBlockId ? updated : block)))
          );
        }
        resetBlockForm();
        emitTimeBlockSavedEvent();
        return;
      }

      const optimistic: TimeBlock = {
        id: makeId(),
        label,
        start_local: normalizeTimeLabel(createState.start_local),
        end_local: normalizeTimeLabel(createState.end_local),
      };

      if (!supabase) {
        const resolved = await resolveOrCreateWeekdayDayTypes({
          userId: "local",
          dayKeys: selectedDayKeys,
        });
        const uniqueDayTypes = Array.from(
          new Map(resolved.map((entry) => [entry.dayType.id, entry.dayType])).values()
        );
        const focusedResolved =
          resolved.find((entry) => entry.dayKey === focusedDayKey) ?? resolved[0] ?? null;
        setTimeBlocks((prev) => sortTimeBlocks([...prev, optimistic]));
        setSelectedIds((prev) => new Set(prev).add(optimistic.id));
        setDayTypes((prev) => {
          const next = new Map(prev.map((dayType) => [dayType.id, dayType]));
          uniqueDayTypes.forEach((dayType) => next.set(dayType.id, dayType));
          return Array.from(next.values());
        });
        setHasDefaultDayType((prev) =>
          prev || uniqueDayTypes.some((dt) => dt.is_default && dt.days.length > 0)
        );
        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          uniqueDayTypes.forEach((dayType) => {
            const blockIds = new Set(next.get(dayType.id) ?? []);
            blockIds.add(optimistic.id);
            next.set(dayType.id, blockIds);
          });
          return next;
        });
        uniqueDayTypes.forEach((dayType) =>
          ensureDayTypeBlockSettings(optimistic.id, dayType.id, DEFAULT_WEEKDAY_LINK_ENERGY)
        );
        if (focusedResolved) {
          if (focusedResolved.dayKey !== focusedDayKey) {
            setFocusedDayKey(focusedResolved.dayKey);
          }
          setSelectedDayTypeId(focusedResolved.dayType.id);
          setDayTypeName(focusedResolved.dayType.name);
          setIsDefault(focusedResolved.dayType.is_default);
          setSchedulerMode(focusedResolved.dayType.scheduler_mode ?? "REGULAR");
          setSelectedDays(
            new Set(
              focusedResolved.dayType.days
                .map((dayIndex) => DAY_INDEX_TO_KEY[dayIndex])
                .filter((dayKey): dayKey is string => Boolean(dayKey))
            )
          );
          setIsCreatingDayType(false);
        }
        setConstraintsTarget(optimistic);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCreateError("You must be signed in to create a time block.");
          return;
        }
        const payload = {
          user_id: user.id,
          label,
          start_local: optimistic.start_local,
          end_local: optimistic.end_local,
        };
        const { data, error: insertError } = await supabase
          .from("time_blocks")
          .insert(payload)
          .select("id,label,start_local,end_local,day_type_id")
          .single();
        if (insertError) throw insertError;
        const insertedRaw = (data as TimeBlock) ?? optimistic;
        const inserted = {
          ...insertedRaw,
          label: normalizeLabel(insertedRaw.label) ?? "TIME BLOCK",
          start_local: normalizeTimeLabel(insertedRaw.start_local),
          end_local: normalizeTimeLabel(insertedRaw.end_local),
          day_type_id: insertedRaw.day_type_id ?? null,
        };
        const resolved = await resolveOrCreateWeekdayDayTypes({
          userId: user.id,
          dayKeys: selectedDayKeys,
        });
        const uniqueDayTypes = Array.from(
          new Map(resolved.map((entry) => [entry.dayType.id, entry.dayType])).values()
        );
        const dayTypeIds = uniqueDayTypes.map((dayType) => dayType.id);
        if (dayTypeIds.length > 0) {
          const { data: existingLinks, error: existingLinksError } = await supabase
            .from("day_type_time_blocks")
            .select("day_type_id,time_block_id")
            .eq("user_id", user.id)
            .eq("time_block_id", inserted.id)
            .in("day_type_id", dayTypeIds);
          if (existingLinksError) throw existingLinksError;

          const alreadyLinked = new Set(
            (existingLinks ?? [])
              .map((row) => (row as { day_type_id?: string | null }).day_type_id)
              .filter((id): id is string => Boolean(id))
          );
          const linkPayload = uniqueDayTypes
            .filter((dayType) => !alreadyLinked.has(dayType.id))
            .map((dayType) => ({
              user_id: user.id,
              day_type_id: dayType.id,
              time_block_id: inserted.id,
              energy: DEFAULT_WEEKDAY_LINK_ENERGY,
              block_type: "FOCUS",
              location_context_id: null,
              allow_all_habit_types: true,
              allow_all_skills: true,
              allow_all_monuments: true,
            }));

          if (linkPayload.length > 0) {
            const { error: linkError } = await supabase
              .from("day_type_time_blocks")
              .insert(linkPayload);
            if (linkError) throw linkError;
          }
        }

        setTimeBlocks((prev) => sortTimeBlocks([...prev, inserted]));
        setSelectedIds((prev) => new Set(prev).add(inserted.id));
        setDayTypes((prev) => {
          const next = new Map(prev.map((dayType) => [dayType.id, dayType]));
          uniqueDayTypes.forEach((dayType) => next.set(dayType.id, dayType));
          return Array.from(next.values());
        });
        setHasDefaultDayType((prev) =>
          prev || uniqueDayTypes.some((dt) => dt.is_default && dt.days.length > 0)
        );
        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          uniqueDayTypes.forEach((dayType) => {
            const blockIds = new Set(next.get(dayType.id) ?? []);
            blockIds.add(inserted.id);
            next.set(dayType.id, blockIds);
          });
          return next;
        });
        uniqueDayTypes.forEach((dayType) =>
          ensureDayTypeBlockSettings(inserted.id, dayType.id, DEFAULT_WEEKDAY_LINK_ENERGY)
        );
        const focusedResolved =
          resolved.find((entry) => entry.dayKey === focusedDayKey) ?? resolved[0] ?? null;
        if (focusedResolved) {
          if (focusedResolved.dayKey !== focusedDayKey) {
            setFocusedDayKey(focusedResolved.dayKey);
          }
          setSelectedDayTypeId(focusedResolved.dayType.id);
          setDayTypeName(focusedResolved.dayType.name);
          setIsDefault(focusedResolved.dayType.is_default);
          setSchedulerMode(focusedResolved.dayType.scheduler_mode ?? "REGULAR");
          setSelectedDays(
            new Set(
              focusedResolved.dayType.days
                .map((dayIndex) => DAY_INDEX_TO_KEY[dayIndex])
                .filter((dayKey): dayKey is string => Boolean(dayKey))
            )
          );
          setIsCreatingDayType(false);
        }
        setConstraintsTarget(inserted);
      }

      resetBlockForm();
      setMenuOpenId(null);
      emitTimeBlockSavedEvent();
    } catch (err) {
      console.error(err);
      setCreateError("Unable to save time block. Try again.");
    } finally {
      setSavingBlock(false);
    }
  };

  const beginEditBlock = (
    block: TimeBlock,
    context: TimeBlockEditContext = { mode: "all-blocks", sourceBlockId: block.id },
    options?: { openConstraints?: boolean }
  ) => {
    setEditingBlockId(block.id);
    setEditingBlockContext(context);
    setEditScope(context.mode === "selected-day-type" ? "only-day-type" : "everywhere");
    setCreateState({
      label: block.label ?? "",
      start_local: block.start_local,
      end_local: block.end_local,
    });
    setCreateError(null);
    setConfirmingDeleteId(null);
    setConstraintsTarget(options?.openConstraints ? block : null);
    setShowCreateForm(true);
  };

  const handleDeleteBlock = async (id: string) => {
    setDeletingId(id);
    setCreateError(null);
    try {
      if (!supabase) {
        setTimeBlocks((prev) => prev.filter((block) => block.id !== id));
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCreateError("You must be signed in to delete a time block.");
          return;
        }
        const { error: deleteError } = await supabase
          .from("time_blocks")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
        if (deleteError) throw deleteError;
        setTimeBlocks((prev) => prev.filter((block) => block.id !== id));
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          next.forEach((set, key) => {
            if (set.has(id)) {
              const updated = new Set(set);
              updated.delete(id);
              next.set(key, updated);
            }
          });
          return next;
        });
      removeCompositeStateEntriesForBlock(id);
      setConstraintsTarget((prev) => (prev?.id === id ? null : prev));
      setConfirmingDeleteId((prev) => (prev === id ? null : prev));
      if (editingBlockId === id) {
        resetBlockForm();
      }
    } catch (err) {
      console.error(err);
      setCreateError("Unable to delete time block right now.");
    } finally {
      setDeletingId(null);
      setMenuOpenId((prev) => (prev === id ? null : prev));
    }
  };

  const handleRemoveBlockFromDayType = async (blockId: string, dayTypeId: string) => {
    setCreateError(null);
    setSaveMessage(null);
    setAttachConflictBlockId(null);
    const unlinkLocally = () => {
      setDayTypeBlockMap((prev) => {
        const next = new Map(prev);
        const ids = new Set(next.get(dayTypeId) ?? []);
        ids.delete(blockId);
        next.set(dayTypeId, ids);
        return next;
      });
      if (selectedDayTypeId === dayTypeId) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(blockId);
          return next;
        });
      }
    };
    const relinkLocally = () => {
      setDayTypeBlockMap((prev) => {
        const next = new Map(prev);
        const ids = new Set(next.get(dayTypeId) ?? []);
        ids.add(blockId);
        next.set(dayTypeId, ids);
        return next;
      });
      if (selectedDayTypeId === dayTypeId) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.add(blockId);
          return next;
        });
      }
    };

    unlinkLocally();

    try {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          relinkLocally();
          setCreateError("You must be signed in to update a Day Type.");
          return;
        }

        const { error: deleteError } = await supabase
          .from("day_type_time_blocks")
          .delete()
          .eq("user_id", user.id)
          .eq("day_type_id", dayTypeId)
          .eq("time_block_id", blockId);
        if (deleteError) throw deleteError;
      }

      removeCompositeStateEntryForDayTypeBlock(dayTypeId, blockId);
      setConstraintsTarget((prev) => (prev?.id === blockId ? null : prev));
      setConfirmingDeleteId((prev) => (prev === blockId ? null : prev));
      setMenuOpenId((prev) => (prev === blockId ? null : prev));
      if (editingBlockId === blockId && editingBlockContext?.mode === "selected-day-type") {
        resetBlockForm();
      }
    } catch (err) {
      console.error(err);
      relinkLocally();
      setCreateError("Unable to remove this block from the selected Day Type.");
    }
  };

  const handleToggleBlockForSelectedDayType = async (block: TimeBlock, nextChecked: boolean) => {
    setCreateError(null);
    setSaveMessage(null);

    if (!selectedDayTypeId) return;

    const dayTypeId = selectedDayTypeId;
    const currentBlockIds = dayTypeBlockMap.get(dayTypeId) ?? new Set<string>();
    const alreadyLinked = currentBlockIds.has(block.id);

    if (!nextChecked) {
      if (!alreadyLinked) return;
      await handleRemoveBlockFromDayType(block.id, dayTypeId);
      return;
    }

    setAttachConflictBlockId(null);
    if (alreadyLinked) return;

    const hasOverlap = timeBlocks.some(
      (existing) =>
        currentBlockIds.has(existing.id) &&
        existing.id !== block.id &&
        timeBlocksOverlap(block, existing)
    );
    if (hasOverlap) {
      setAttachConflictBlockId(block.id);
      return;
    }

    const linkLocally = () => {
      setDayTypeBlockMap((prev) => {
        const next = new Map(prev);
        const ids = new Set(next.get(dayTypeId) ?? []);
        ids.add(block.id);
        next.set(dayTypeId, ids);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(block.id);
        return next;
      });
      ensureDayTypeBlockSettings(block.id, dayTypeId, DEFAULT_WEEKDAY_LINK_ENERGY);
    };
    const unlinkLocally = () => {
      setDayTypeBlockMap((prev) => {
        const next = new Map(prev);
        const ids = new Set(next.get(dayTypeId) ?? []);
        ids.delete(block.id);
        next.set(dayTypeId, ids);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(block.id);
        return next;
      });
      removeCompositeStateEntryForDayTypeBlock(dayTypeId, block.id);
    };

    linkLocally();

    try {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          unlinkLocally();
          setCreateError("You must be signed in to update a Day Type.");
          return;
        }

        const stateKey = getDayTypeBlockStateKey(dayTypeId, block.id);
        const { error: upsertError } = await supabase
          .from("day_type_time_blocks")
          .upsert(
            {
              user_id: user.id,
              day_type_id: dayTypeId,
              time_block_id: block.id,
              energy: stateKey ? blockEnergy.get(stateKey) ?? DEFAULT_WEEKDAY_LINK_ENERGY : DEFAULT_WEEKDAY_LINK_ENERGY,
              block_type: stateKey ? blockType.get(stateKey) ?? "FOCUS" : "FOCUS",
              location_context_id: null,
              allow_all_habit_types: stateKey ? blockAllowAllHabitTypes.get(stateKey) ?? true : true,
              allow_all_skills: stateKey ? blockAllowAllSkills.get(stateKey) ?? true : true,
              allow_all_monuments: stateKey ? blockAllowAllMonuments.get(stateKey) ?? true : true,
            },
            { onConflict: "day_type_id,time_block_id" }
          );
        if (upsertError) throw upsertError;
      }
    } catch (err) {
      console.error(err);
      unlinkLocally();
      setCreateError("Unable to add this block to the selected Day Type.");
    }
  };

  const handleConstraintsClick = useCallback(
    (block: TimeBlock) => {
      setConstraintsTarget(block);
      setConfirmingDeleteId(null);
      setMenuOpenId(null);
      emitConstraintsOpenedEvent();
    },
    [emitConstraintsOpenedEvent]
  );

  const openTimeBlockCard = (block: TimeBlock, dayTypeId: string | null | undefined) => {
    const selectedContext =
      timeBlockListMode === "selected-day-type" && dayTypeId
        ? ({
            mode: "selected-day-type",
            dayTypeId,
            sourceBlockId: block.id,
          } as TimeBlockEditContext)
        : ({
            mode: "all-blocks",
            sourceBlockId: block.id,
          } as TimeBlockEditContext);

    if (selectedContext.mode === "selected-day-type") {
      ensureDayTypeBlockSettings(block.id, selectedContext.dayTypeId);
    }

    setConfirmingDeleteId(null);
    beginEditBlock(block, selectedContext, { openConstraints: true });
    setMenuOpenId(null);
    emitConstraintsOpenedEvent();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const focusWorkConstraints = () => {
      const workBlock = findWorkBlock();
      if (!workBlock) return;
      handleConstraintsClick(workBlock);
      window.dispatchEvent(new CustomEvent("tour:work-constraints-focused"));
    };
    window.addEventListener("tour:focus-work-constraints", focusWorkConstraints);
    return () => {
      window.removeEventListener("tour:focus-work-constraints", focusWorkConstraints);
    };
  }, [findWorkBlock, handleConstraintsClick]);

  const selectedBlocks = useMemo(
    () => {
      if (!selectedDayTypeId) return [];
      const blockIds = dayTypeBlockMap.get(selectedDayTypeId);
      if (!blockIds?.size) return [];
      return timeBlocks.filter((block) => blockIds.has(block.id));
    },
    [dayTypeBlockMap, selectedDayTypeId, timeBlocks]
  );

  const selectedDayType = useMemo(
    () => dayTypes.find((dayType) => dayType.id === selectedDayTypeId) ?? null,
    [dayTypes, selectedDayTypeId]
  );

  const getSelectedDayTypeBlockIds = useCallback(() => {
    if (!selectedDayTypeId) return new Set<string>();
    return new Set(dayTypeBlockMap.get(selectedDayTypeId) ?? []);
  }, [dayTypeBlockMap, selectedDayTypeId]);

  const selectedDayTypeBlockIds = useMemo(
    () => getSelectedDayTypeBlockIds(),
    [getSelectedDayTypeBlockIds]
  );

  const visibleWindowBlocks = useMemo(
    () =>
      timeBlockListMode === "all-blocks"
        ? timeBlocks
        : timeBlocks.filter((block) => selectedDayTypeBlockIds.has(block.id)),
    [selectedDayTypeBlockIds, timeBlockListMode, timeBlocks]
  );

  const hasVisibleWindowBlocks = visibleWindowBlocks.length > 0;

  const selectedCreateDayKeys = useMemo(
    () =>
      Array.from(days).filter((dayKey) => typeof DAY_KEY_TO_INDEX[dayKey] === "number"),
    [days]
  );

  const proposedCreateBlock = useMemo<TimeBlock | null>(() => {
    if (!showCreateForm || isCreatingDayType || isEditingBlock) return null;
    const start = parseTimeToMinutes(createState.start_local);
    const end = parseTimeToMinutes(createState.end_local);
    if (start === null || end === null) return null;
    return {
      id: "__proposed-time-block__",
      label: normalizeLabel(createState.label) ?? "TIME BLOCK",
      start_local: normalizeTimeLabel(createState.start_local),
      end_local: normalizeTimeLabel(createState.end_local),
      day_type_id: null,
    };
  }, [
    createState.end_local,
    createState.label,
    createState.start_local,
    isCreatingDayType,
    isEditingBlock,
    showCreateForm,
  ]);

  const createOverlapConflicts = useMemo(
    () =>
      proposedCreateBlock
        ? getCreateOverlapConflicts(proposedCreateBlock, selectedCreateDayKeys)
        : [],
    [getCreateOverlapConflicts, proposedCreateBlock, selectedCreateDayKeys]
  );
  const hasCreateOverlapConflict = createOverlapConflicts.length > 0;

  const proposedAttachConflictBlock = useMemo(
    () => timeBlocks.find((block) => block.id === attachConflictBlockId) ?? null,
    [attachConflictBlockId, timeBlocks]
  );

  useEffect(() => {
    if (hasCreateOverlapConflict) return;
    setCreateError((prev) =>
      prev?.startsWith(OVERLAP_CREATE_ERROR_PREFIX) ? null : prev
    );
  }, [hasCreateOverlapConflict]);

  const handleFocusWeekday = useCallback(
    (dayKey: string) => {
      setFocusedDayKey(dayKey);
      setSaveMessage(null);
      if (isCreatingDayType) {
        setSelectedDays((prev) => {
          if (!isDefault || prev.has(dayKey) || prev.size > 0) return prev;
          return new Set([dayKey]);
        });
        return;
      }

      const dayType = findDayTypeForWeekday(dayKey, dayTypes);
      if (dayType) {
        loadDayTypeSelection(dayType);
      } else {
        resetVisibleDaySelection(dayKey);
      }
    },
    [
      dayTypes,
      isCreatingDayType,
      isDefault,
      loadDayTypeSelection,
      resetVisibleDaySelection,
    ]
  );

  const handleDayPreviewScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (dayPreviewPointerDraggingRef.current || dayPreviewSuppressClickRef.current) {
        return;
      }

      const scroller = event.currentTarget;
      if (dayPreviewScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dayPreviewScrollFrameRef.current);
      }

      dayPreviewScrollFrameRef.current = window.requestAnimationFrame(() => {
        const scrollerRect = scroller.getBoundingClientRect();
        const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;
        let closestDayKey = focusedDayKey;
        let closestDistance = Number.POSITIVE_INFINITY;

        scroller.querySelectorAll<HTMLElement>("[data-day-preview-key]").forEach((preview) => {
          const previewRect = preview.getBoundingClientRect();
          const previewCenter = previewRect.left + previewRect.width / 2;
          const distance = Math.abs(previewCenter - scrollerCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestDayKey = preview.dataset.dayPreviewKey ?? focusedDayKey;
          }
        });

        dayPreviewScrollFrameRef.current = null;
        if (closestDayKey !== focusedDayKey) {
          handleFocusWeekday(closestDayKey);
        }
      });
    },
    [focusedDayKey, handleFocusWeekday]
  );

  const scrollFocusedDayPreviewIntoView = useCallback(() => {
    const scroller = dayPreviewScrollerRef.current;
    if (!scroller) return;
    const preview = scroller.querySelector<HTMLElement>(
      `[data-day-preview-key="${focusedDayKey}"]`
    );
    if (!preview) return;

    const nextScrollLeft =
      preview.offsetLeft - (scroller.clientWidth - preview.offsetWidth) / 2;
    dayPreviewSuppressClickRef.current = true;
    scroller.scrollTo({
      left: Math.max(0, nextScrollLeft),
      behavior: "auto",
    });

    if (dayPreviewScrollSyncTimeoutRef.current !== null) {
      window.clearTimeout(dayPreviewScrollSyncTimeoutRef.current);
    }
    dayPreviewScrollSyncTimeoutRef.current = window.setTimeout(() => {
      dayPreviewSuppressClickRef.current = false;
      dayPreviewScrollSyncTimeoutRef.current = null;
    }, 260);
  }, [focusedDayKey]);

  useEffect(() => {
    scrollFocusedDayPreviewIntoView();
  }, [scrollFocusedDayPreviewIntoView]);

  const handleDayPreviewPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dayPreviewPointerStartRef.current = { x: event.clientX, y: event.clientY };
    dayPreviewPointerDraggingRef.current = true;
  }, []);

  const clearDayPreviewPointer = useCallback(() => {
    dayPreviewPointerStartRef.current = null;
    dayPreviewPointerDraggingRef.current = false;
  }, []);

  const handleDayPreviewPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const start = dayPreviewPointerStartRef.current;
      clearDayPreviewPointer();
      if (!start) return;

      const deltaX = start.x - event.clientX;
      const deltaY = start.y - event.clientY;
      if (
        Math.abs(deltaX) < DAY_PREVIEW_SWIPE_THRESHOLD_PX ||
        Math.abs(deltaX) < Math.abs(deltaY)
      ) {
        return;
      }

      dayPreviewSuppressClickRef.current = true;
      if (dayPreviewScrollSyncTimeoutRef.current !== null) {
        window.clearTimeout(dayPreviewScrollSyncTimeoutRef.current);
      }
      dayPreviewScrollSyncTimeoutRef.current = window.setTimeout(() => {
        dayPreviewSuppressClickRef.current = false;
        dayPreviewScrollSyncTimeoutRef.current = null;
      }, 260);
      handleFocusWeekday(getDayPreviewKeyByOffset(focusedDayKey, deltaX > 0 ? 1 : -1));
    },
    [clearDayPreviewPointer, focusedDayKey, handleFocusWeekday]
  );

  useEffect(() => {
    return () => {
      if (dayPreviewScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dayPreviewScrollFrameRef.current);
      }
      if (dayPreviewScrollSyncTimeoutRef.current !== null) {
        window.clearTimeout(dayPreviewScrollSyncTimeoutRef.current);
      }
    };
  }, []);

  const startCreateWindowBlock = useCallback(() => {
    setIsCreatingDayType(false);
    setIsEditingExisting(false);
    setDayTypeCreateError(null);
    setSaveMessage(null);
    startCreateBlock();
    emitTimeBlockCreateOpenedEvent();
  }, [emitTimeBlockCreateOpenedEvent, startCreateBlock]);

  const dayPreviewItems = useMemo(
    () =>
      DAY_PREVIEWS.map((day) => {
        const ownerId = dayOwnership.get(day.key) ?? null;
        const assignedDayType = findDayTypeForWeekday(day.key, dayTypes);
        const patternName = assignedDayType?.name.trim() || null;
        const isFocused = day.key === focusedDayKey;
        const sourceDayTypeId = isFocused ? selectedDayTypeId : assignedDayType?.id ?? ownerId;
        const sourceBlocks = isFocused
          ? selectedBlocks
          : timeBlocks.filter((block) => {
              const ids = sourceDayTypeId ? dayTypeBlockMap.get(sourceDayTypeId) : null;
              return ids?.has(block.id) ?? false;
            });
        const blocks = sourceBlocks
          .map((block) => {
            const stateKey = getDayTypeBlockStateKey(sourceDayTypeId, block.id);
            const allowAllSkills = stateKey ? blockAllowAllSkills.get(stateKey) ?? true : true;
            const allowAllMonuments = stateKey ? blockAllowAllMonuments.get(stateKey) ?? true : true;
            const allowedHabitTypes = stateKey ? blockAllowedHabitTypes.get(stateKey) : undefined;
            const allowsChores = allowedHabitTypes?.has("CHORE") ?? false;
            const blockTypeValue = stateKey ? blockType.get(stateKey) ?? "FOCUS" : "FOCUS";

            return {
              id: block.id,
              label: block.label,
              start_local: block.start_local,
              end_local: block.end_local,
              blockType: blockTypeValue,
              hasConstraints: !allowAllSkills || !allowAllMonuments || allowsChores,
            };
          })
          .filter((entry) => entry.start_local && entry.end_local);
        const includesProposedBlock = Boolean(
          proposedCreateBlock && selectedCreateDayKeys.includes(day.key)
        );
        const includesAttachConflictBlock = Boolean(
          proposedAttachConflictBlock && isFocused && sourceDayTypeId === selectedDayTypeId
        );
        const previewBlocks = [...blocks];
        if (includesProposedBlock) {
          previewBlocks.push({
            id: proposedCreateBlock?.id,
            label: proposedCreateBlock?.label,
            start_local: proposedCreateBlock?.start_local ?? "",
            end_local: proposedCreateBlock?.end_local ?? "",
            blockType: "FOCUS" as const,
            hasConstraints: false,
          });
        }
        if (includesAttachConflictBlock) {
          previewBlocks.push({
            id: proposedAttachConflictBlock?.id,
            label: proposedAttachConflictBlock?.label,
            start_local: proposedAttachConflictBlock?.start_local ?? "",
            end_local: proposedAttachConflictBlock?.end_local ?? "",
            blockType: "FOCUS" as const,
            hasConstraints: false,
          });
        }
        const hasCreateConflict = createOverlapConflicts.some(
          (conflict) => conflict.dayKey === day.key
        );

        return {
          ...day,
          blocks: previewBlocks,
          blockCount: previewBlocks.length,
          active: isFocused,
          patternName,
          hasCreateConflict,
        };
      }),
    [
      blockAllowAllMonuments,
      blockAllowAllSkills,
      blockAllowedHabitTypes,
      blockType,
      createOverlapConflicts,
      dayOwnership,
      dayTypes,
      dayTypeBlockMap,
      focusedDayKey,
      proposedCreateBlock,
      proposedAttachConflictBlock,
      selectedBlocks,
      selectedCreateDayKeys,
      selectedDayTypeId,
      timeBlocks,
    ]
  );

  const coverageStatus: CoverageStatus = useMemo(() => {
    const segments = selectedBlocks
      .flatMap((block) => blockToSegments(block))
      .map(({ startMin, endMin }) => ({ start: startMin, end: endMin }))
      .sort((a, b) => a.start - b.start);

    if (segments.length === 0) {
      return { ok: false, reason: "Add scheduling windows before saving." };
    }

    let cursor = 0;
    for (const seg of segments) {
      if (seg.start > cursor) {
        return { ok: false, reason: `Gap starts at ${minutesToLabel(cursor)}.` };
      }
      if (seg.start < cursor) {
        return { ok: false, reason: `Overlap near ${minutesToLabel(seg.start)}.` };
      }
      cursor = seg.end;
    }
    if (cursor < 1440) {
      return { ok: false, reason: `Ends at ${minutesToLabel(cursor)}. Current save rules still need the preset gap closed.` };
    }
    return { ok: true };
  }, [selectedBlocks]);

  const coverageStatusCopy = coverageStatus.ok
    ? "Preset is ready to save with the current backend rules."
    : "Current save rules still need a continuous preset. CREATOR will only schedule inside the windows you create.";

  const meetsDefaultDayRequirement = !isDefault || (selectedDays.size > 0 && conflictingSelectedDays.size === 0);

  const canSaveDayType =
    Boolean(dayTypeName.trim()) && coverageStatus.ok && meetsDefaultDayRequirement;

  const handleSaveDayType = useCallback(async () => {
    if (!canSaveDayType) return;
    console.info("[DAY_TYPE_SAVE_START]", {
      isCreatingDayType,
      isEditingExisting,
      selectedDayTypeId,
      dayTypeName,
      isDefault,
      selectedIds: Array.from(selectedIds),
    });
    const energyById = new Map<string, string>(blockEnergy);
    setSaving(true);
    setSaveMessage(null);
    try {
      if (!supabase) {
        setSaveMessage("Unable to save: Supabase not initialized.");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveMessage("You must be signed in to save a preset.");
        return;
      }

      const name = dayTypeName.trim();

      const insertWhitelists = async (
        links: Array<{ id?: string | null; time_block_id?: string | null }>,
        dayTypeId: string | null | undefined
      ) => {
        const linkMap = new Map<string, string>();
        links.forEach((row) => {
          const linkId = (row.id ?? "").trim();
          const blockId = (row.time_block_id ?? "").trim();
          if (linkId && blockId) {
            linkMap.set(blockId, linkId);
          }
        });

        if (linkMap.size === 0) return;
        if (!dayTypeId) return;

        const habitRows: Array<{
          user_id: string;
          day_type_time_block_id: string;
          habit_type: string;
        }> = [];
        const skillRows: Array<{
          user_id: string;
          day_type_time_block_id: string;
          skill_id: string;
        }> = [];
        const monumentRows: Array<{
          user_id: string;
          day_type_time_block_id: string;
          monument_id: string;
        }> = [];

        linkMap.forEach((linkId, blockId) => {
          const stateKey = getDayTypeBlockStateKey(dayTypeId, blockId);
          if (!stateKey) return;
          const allowHabits = blockAllowAllHabitTypes.get(stateKey) ?? true;
          const allowSkills = blockAllowAllSkills.get(stateKey) ?? true;
          const allowMonuments = blockAllowAllMonuments.get(stateKey) ?? true;

          if (!allowHabits) {
            const allowed = blockAllowedHabitTypes.get(stateKey) ?? new Set<string>();
            allowed.forEach((habitType) => {
              const normalized = normalizeHabitTypeValue(habitType);
              if (normalized) {
                habitRows.push({
                  user_id: user.id,
                  day_type_time_block_id: linkId,
                  habit_type: normalized,
                });
              }
            });
          }

          if (!allowSkills) {
            const allowed = blockAllowedSkillIds.get(stateKey) ?? new Set<string>();
            allowed.forEach((skillId) => {
              const normalized = skillId.trim();
              if (normalized) {
                skillRows.push({
                  user_id: user.id,
                  day_type_time_block_id: linkId,
                  skill_id: normalized,
                });
              }
            });
          }

          if (!allowMonuments) {
            const allowed = blockAllowedMonumentIds.get(stateKey) ?? new Set<string>();
            allowed.forEach((monumentId) => {
              const normalized = monumentId.trim();
              if (normalized) {
                monumentRows.push({
                  user_id: user.id,
                  day_type_time_block_id: linkId,
                  monument_id: normalized,
                });
              }
            });
          }
        });

        if (habitRows.length > 0) {
          const { error } = await supabase
            .from("day_type_time_block_allowed_habit_types")
            .insert(habitRows);
          if (error) throw error;
        }
        if (skillRows.length > 0) {
          const { error } = await supabase
            .from("day_type_time_block_allowed_skills")
            .insert(skillRows);
          if (error) throw error;
        }
        if (monumentRows.length > 0) {
          const { error } = await supabase
            .from("day_type_time_block_allowed_monuments")
            .insert(monumentRows);
          if (error) throw error;
        }
      };

      if (isEditingExisting && selectedDayTypeId) {
        console.info("[DAY_TYPE_SAVE_BRANCH]", {
          mode: "update-existing",
          selectedDayTypeId,
          dayTypeName: name,
        });
        const { data: updated, error: updateError } = await supabase
          .from("day_types")
          .update({
            name,
            is_default: isDefault,
            days:
              isDefault && selectedDays.size > 0
                ? Array.from(selectedDays)
                    .map((key) => DAY_KEY_TO_INDEX[key])
                    .filter((idx): idx is number => typeof idx === "number")
                : [],
            scheduler_mode: schedulerMode,
          })
          .eq("id", selectedDayTypeId)
          .select("id,is_default,days,scheduler_mode")
          .single();

        if (updateError) throw updateError;

        const { data: existingLinks, error: fetchError } = await supabase
          .from("day_type_time_blocks")
          .select("id,time_block_id")
          .eq("day_type_id", selectedDayTypeId);
        if (fetchError) throw fetchError;

        const existingEntries = (existingLinks ?? []).filter(
          (link): link is { id?: string | null; time_block_id: string } =>
            Boolean(link.time_block_id)
        );
        const existingMap = new Map(existingEntries.map((link) => [link.time_block_id, link.id ?? null]));
        const existingIds = new Set(existingMap.keys());
        const currentIds = new Set(selectedIds);
        const isMismatch =
          existingIds.size !== currentIds.size ||
          Array.from(existingIds).some((id) => !currentIds.has(id));

        if (isMismatch) {
          setSaveMessage("Save blocked: state not fully loaded. Please refresh and try again.");
          setSaving(false);
          return;
        }

        const blockIds = Array.from(selectedIds);
        const missingConstraintState = blockIds.some((id) => {
          const stateKey = getDayTypeBlockStateKey(selectedDayTypeId, id);
          return (
            !stateKey ||
            !blockAllowAllHabitTypes.has(stateKey) ||
            !blockAllowAllSkills.has(stateKey) ||
            !blockAllowAllMonuments.has(stateKey)
          );
        });

        if (missingConstraintState) {
          setSaveMessage(
            "Save blocked: constraint state not fully loaded. Please interact with all blocks or refresh."
          );
          setSaving(false);
          return;
        }

        const toDelete = Array.from(existingIds).filter((id) => !currentIds.has(id));
        const toInsert = Array.from(currentIds).filter((id) => !existingIds.has(id));
        const toKeep = Array.from(currentIds).filter((id) => existingIds.has(id));
        const keptLinks = (existingLinks ?? [])
          .filter(
            (row): row is { id: string; time_block_id: string } =>
              Boolean(row.id) && Boolean(row.time_block_id) && toKeep.includes(row.time_block_id)
          )
          .map((row) => ({ id: row.id, time_block_id: row.time_block_id }));
        const keptLinkIds = keptLinks.map((link) => link.id);
        void toKeep;

        if (toDelete.length > 0) {
          const { error: deleteLinksError } = await supabase
            .from("day_type_time_blocks")
            .delete()
            .in("time_block_id", toDelete)
            .eq("day_type_id", selectedDayTypeId);
          if (deleteLinksError) throw deleteLinksError;
        }

        const resolvedLocations = await resolveLocationIdsForBlocks({
          supabase,
          userId: user.id,
          dayTypeId: selectedDayTypeId,
          blockIds,
          blockLocations: blockLocation,
          selectableLocations,
        });

        if (blockIds.length > 0) {
          if (toInsert.length > 0) {
            const payload = toInsert.map((id) => {
              const stateKey = getDayTypeBlockStateKey(selectedDayTypeId, id);
              const energy = stateKey ? energyById.get(stateKey) ?? "NO" : "NO";
              return {
                user_id: user.id,
                day_type_id: selectedDayTypeId,
                time_block_id: id,
                energy,
                block_type: stateKey ? blockType.get(stateKey) ?? "FOCUS" : "FOCUS",
                location_context_id: resolvedLocations.get(id) ?? null,
                allow_all_habit_types: stateKey ? blockAllowAllHabitTypes.get(stateKey) ?? true : true,
                allow_all_skills: stateKey ? blockAllowAllSkills.get(stateKey) ?? true : true,
                allow_all_monuments: stateKey
                  ? blockAllowAllMonuments.get(stateKey) ?? true
                  : true,
              };
            });

            const { data: linksInserted, error: linkError } = await supabase
              .from("day_type_time_blocks")
              .insert(payload)
              .select("id,time_block_id");
            if (linkError) throw linkError;

            if (linksInserted) {
              await insertWhitelists(
                linksInserted as { id?: string | null; time_block_id?: string | null }[],
                selectedDayTypeId
              );
            }
          }

          if (toKeep.length > 0) {
            const updates = toKeep.map((id) => {
              const stateKey = getDayTypeBlockStateKey(selectedDayTypeId, id);
              return {
                time_block_id: id,
                user_id: user.id,
                day_type_id: selectedDayTypeId,
                energy: stateKey ? energyById.get(stateKey) ?? "NO" : "NO",
                block_type: stateKey ? blockType.get(stateKey) ?? "FOCUS" : "FOCUS",
                location_context_id: resolvedLocations.get(id) ?? null,
                allow_all_habit_types: stateKey
                  ? blockAllowAllHabitTypes.get(stateKey) ?? true
                  : true,
                allow_all_skills: stateKey ? blockAllowAllSkills.get(stateKey) ?? true : true,
                allow_all_monuments: stateKey
                  ? blockAllowAllMonuments.get(stateKey) ?? true
                  : true,
              };
            });

            for (const row of updates) {
              const { error } = await supabase
                .from("day_type_time_blocks")
                .update({
                  energy: row.energy,
                  block_type: row.block_type,
                  location_context_id: row.location_context_id,
                  allow_all_habit_types: row.allow_all_habit_types,
                  allow_all_skills: row.allow_all_skills,
                  allow_all_monuments: row.allow_all_monuments,
                })
                .eq("day_type_id", selectedDayTypeId)
                .eq("time_block_id", row.time_block_id);
              if (error) throw error;
            }
          }

          if (keptLinkIds.length > 0) {
            const whitelistTables = [
              "day_type_time_block_allowed_habit_types",
              "day_type_time_block_allowed_skills",
              "day_type_time_block_allowed_monuments",
            ];

            for (const table of whitelistTables) {
              const { error } = await supabase
                .from(table)
                .delete()
                .in("day_type_time_block_id", keptLinkIds);
              if (error) throw error;
            }

            await insertWhitelists(keptLinks, selectedDayTypeId);
          }

          syncResolvedLocations(selectedDayTypeId, blockIds, resolvedLocations);
        }

        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          next.set(selectedDayTypeId, new Set(blockIds));
          return next;
        });

        const updatedDays =
          updated?.days
            ?.map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) ??
          (isDefault
            ? Array.from(selectedDays)
                .map((k) => DAY_KEY_TO_INDEX[k])
                .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
            : []);
        let nextDayTypes: DayType[] = [];
        setDayTypes((prev) => {
          nextDayTypes = prev.map((dt) =>
            dt.id === selectedDayTypeId
              ? {
                  ...dt,
                  name,
                  is_default: updated?.is_default ?? dt.is_default,
                  days: updatedDays,
                  scheduler_mode: normalizeSchedulerMode(
                    (updated?.scheduler_mode as string | null) ?? schedulerMode
                  ),
                }
              : dt
          );
          return nextDayTypes;
        });
        setHasDefaultDayType(
          nextDayTypes.some((dt) => dt.is_default && dt.days.length > 0)
        );
        setEditingBlockId(null);
        setEditingBlockContext(null);
        setEditScope("everywhere");
        setConstraintsTarget(null);
        setMenuOpenId(null);
        setCreateError(null);
        setCreateState(DEFAULT_FORM);
        setIsCreatingDayType(false);
        setIsEditingExisting(false);
        setShowCreateForm(false);
        setSaveMessage(`Updated advanced preset: ${selectedDayTypeId}`);
      } else {
        console.info("[DAY_TYPE_SAVE_BRANCH]", {
          mode: "create-new",
          selectedDayTypeId,
          dayTypeName: name,
        });
        const { data: inserted, error: insertError } = await supabase
          .from("day_types")
          .insert({
            user_id: user.id,
            name,
            is_default: isDefault,
            days:
              isDefault && selectedDays.size > 0
                ? Array.from(selectedDays)
                    .map((key) => DAY_KEY_TO_INDEX[key])
                    .filter((idx): idx is number => typeof idx === "number")
                : [],
            scheduler_mode: schedulerMode,
          })
          .select("id,is_default,days,scheduler_mode")
          .single();

        if (insertError) throw insertError;

        const blockIds = Array.from(selectedIds);
        const resolvedLocations = await resolveLocationIdsForBlocks({
          supabase,
          userId: user.id,
          dayTypeId: selectedDayTypeId,
          blockIds,
          blockLocations: blockLocation,
          selectableLocations,
        });
        if (blockIds.length > 0) {
          const payload = blockIds.map((id) => {
            const stateKey = getDayTypeBlockStateKey(selectedDayTypeId, id);
            const energy = stateKey ? energyById.get(stateKey) ?? "NO" : "NO";
            return {
              user_id: user.id,
              day_type_id: inserted.id,
              time_block_id: id,
              energy,
              block_type: stateKey ? (blockType.get(stateKey) ?? "FOCUS") : "FOCUS",
              location_context_id: resolvedLocations.get(id) ?? null,
              allow_all_habit_types: stateKey ? (blockAllowAllHabitTypes.get(stateKey) ?? true) : true,
              allow_all_skills: stateKey ? (blockAllowAllSkills.get(stateKey) ?? true) : true,
              allow_all_monuments: stateKey ? (blockAllowAllMonuments.get(stateKey) ?? true) : true,
            };
          });

          const { data: linksInserted, error: linkError } = await supabase
            .from("day_type_time_blocks")
            .insert(payload)
            .select("id,time_block_id");
          if (linkError) throw linkError;

          rekeyDayTypeBlockState(selectedDayTypeId, inserted.id, blockIds);
          if (linksInserted) {
            await insertWhitelists(
              linksInserted as { id?: string | null; time_block_id?: string | null }[],
              inserted.id
            );
          }
          syncResolvedLocations(inserted.id, blockIds, resolvedLocations);
        }

        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, new Set(blockIds));
          return next;
        });

        const insertedDays =
          inserted.days?.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) ??
          (isDefault
            ? Array.from(selectedDays)
                .map((k) => DAY_KEY_TO_INDEX[k])
                .filter((n): n is number => typeof n === "number" && n >= 0 && n <= 6)
            : []);
        let nextDayTypes: DayType[] = [];
        setDayTypes((prev) => {
          nextDayTypes = [
            ...prev,
            {
              id: inserted.id,
              name,
              is_default: inserted.is_default,
              days: insertedDays,
              scheduler_mode: normalizeSchedulerMode(inserted.scheduler_mode as string | null),
            },
          ];
          return nextDayTypes;
        });
        setHasDefaultDayType(nextDayTypes.some((dt) => dt.is_default && dt.days.length > 0));
        setSelectedDayTypeId(inserted.id);
        setSchedulerMode(normalizeSchedulerMode(inserted.scheduler_mode as string | null));
        setEditingBlockId(null);
        setEditingBlockContext(null);
        setEditScope("everywhere");
        setConstraintsTarget(null);
        setMenuOpenId(null);
        setCreateError(null);
        setCreateState(DEFAULT_FORM);
        setIsCreatingDayType(false);
        setIsEditingExisting(false);
        setShowCreateForm(false);

        setSaveMessage(`Created advanced preset: ${inserted.id}`);
      }
    } catch (err) {
      console.error(err);
      setSaveMessage("Unable to save preset right now.");
    } finally {
      setSaving(false);
    }
  }, [
    blockEnergy,
    blockLocation,
    blockType,
    blockAllowAllHabitTypes,
    blockAllowAllSkills,
    blockAllowAllMonuments,
    blockAllowedHabitTypes,
    blockAllowedSkillIds,
    blockAllowedMonumentIds,
    canSaveDayType,
    dayTypeName,
    isCreatingDayType,
    isDefault,
    isEditingExisting,
    selectedDayTypeId,
    selectedDays,
    selectedIds,
    schedulerMode,
    selectableLocations,
    supabase,
    syncResolvedLocations,
  ]);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#050507] text-white">
        <div className="safe-page-y mx-auto max-w-4xl space-y-6 px-3 sm:px-4">
          <div className="flex items-center justify-between">
            <Link
              href="/schedule"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/65 bg-black/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/72 shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition hover:border-white/16 hover:bg-black/25 hover:text-white/88"
            >
              ← Back to schedule
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold uppercase tracking-[0.2em] sm:text-3xl sm:tracking-[0.22em]">
              TIME BLOCKS
            </h1>
            <p className="text-xs text-white/55 sm:text-sm">
              CREATOR only schedules inside the blocks you create.
            </p>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                  Day previews
                </h2>
              </div>
              <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-white/40">
                Swipe
              </span>
            </div>
            <div
              ref={dayPreviewScrollerRef}
              className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4"
              onScroll={handleDayPreviewScroll}
              onPointerDown={handleDayPreviewPointerDown}
              onPointerUp={handleDayPreviewPointerUp}
              onPointerCancel={clearDayPreviewPointer}
            >
              {dayPreviewItems.map((day) => (
                <article
                  key={day.key}
                  data-day-preview-key={day.key}
                  role="button"
                  tabIndex={0}
                  aria-current={day.active ? "date" : undefined}
                  onClick={() => {
                    if (dayPreviewSuppressClickRef.current) return;
                    handleFocusWeekday(day.key);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    handleFocusWeekday(day.key);
                  }}
                  className={cn(
                    "min-w-[86%] snap-center rounded-2xl border bg-gradient-to-b from-[#141820] to-[#0d0f14] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.42)] sm:min-w-[21rem]",
                    day.hasCreateConflict
                      ? "border-red-400/45"
                      : day.active
                        ? "border-black/70"
                        : "border-black/45"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">
                        {day.fullLabel}
                      </h3>
                      <p className="mt-1 text-xs text-white/50">
                        {day.blockCount === 0
                          ? "No scheduling windows"
                          : `${day.blockCount} ${day.blockCount === 1 ? "window" : "windows"}`}
                      </p>
                    </div>
                    {day.patternName ? (
                      <div className="max-w-[48%] text-right text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-white/48">
                        {day.patternName}
                      </div>
                    ) : null}
                  </div>
                  <DayType24hPreview blocks={day.blocks} />
                </article>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            {!isEditingBlock ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={startCreateWindowBlock}
                  data-tour="day-type-add-block"
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:border-white/30 focus-visible:bg-white/10 focus-visible:outline-none sm:px-3",
                    showCreateForm && !isCreatingDayType
                      ? "border-white/20 bg-white/10 text-white/90"
                      : "border-white/15 bg-white/5 text-white/80"
                  )}
                >
                  <Plus className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />
                  <span>add TIME BLOCK</span>
                </button>
                <button
                  type="button"
                  onClick={startCreateDayType}
                  data-tour="day-type-create"
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:border-white/30 focus-visible:bg-white/10 focus-visible:outline-none sm:px-3",
                    isCreatingDayType
                      ? "border-white/20 bg-white/10 text-white/90"
                      : "border-white/15 bg-black/25 text-white/80"
                  )}
                >
                  <Plus className="h-3.5 w-3.5 text-white/60" aria-hidden="true" />
                  <span>add DAY TYPE</span>
                </button>
              </div>
            ) : null}

            {showCreateForm && !isCreatingDayType ? (
              <div
                className="rounded-2xl border border-black/80 bg-gradient-to-b from-[#171920] to-[#101218] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_48px_rgba(0,0,0,0.52)] sm:p-5"
                data-tour="time-block-create-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                      {isEditingBlock ? "Edit time block" : "New time block"}
                    </div>
	                    {isEditingBlock ? (
	                      <div className="text-xs text-white/60">
	                        {editingBlockContext?.mode === "selected-day-type"
	                          ? `Editing ${selectedDayType?.name ?? "selected Day Type"}`
	                          : "Editing the master block"}
	                      </div>
	                    ) : null}
	                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetBlockForm}
                      className="rounded-full border border-black/65 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white/72 shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition hover:border-white/16 hover:bg-black/25 hover:text-white/88 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitBlock}
                      disabled={savingBlock}
                      data-tour="selected-time-block-save"
                      className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-[0_8px_18px_rgba(0,0,0,0.34)] transition hover:border-white/22 hover:bg-white/14 hover:text-white disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {savingBlock
                        ? isEditingBlock
                          ? "Updating…"
                          : "Creating…"
                        : isEditingBlock
                          ? "Update block"
                          : "Add block"}
                    </button>
	                  </div>
	                </div>
	                {isEditingBlock && editingBlockContext?.mode === "selected-day-type" ? (
	                  <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2.5">
	                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
	                      Update scope
	                    </div>
	                    <div className="grid grid-cols-2 gap-1 rounded-full border border-black/55 bg-black/35 p-1">
	                      {[
	                        { value: "only-day-type", label: "Only this Day Type" },
	                        { value: "everywhere", label: "Update everywhere" },
	                      ].map((option) => {
	                        const active = editScope === option.value;
	                        return (
	                          <button
	                            key={option.value}
	                            type="button"
	                            onClick={() => setEditScope(option.value as TimeBlockEditScope)}
	                            className={cn(
	                              "min-h-8 rounded-full px-2 text-[11px] font-semibold transition",
	                              active
	                                ? "bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
	                                : "text-white/55 hover:bg-white/7 hover:text-white/80"
	                            )}
	                          >
	                            {option.label}
	                          </button>
	                        );
	                      })}
	                    </div>
	                    <p className="mt-2 text-[11px] leading-snug text-white/48">
	                      Only this Day Type saves a separate linked block for this preset. Update everywhere edits the master block and every Day Type using it.
	                    </p>
	                  </div>
	                ) : null}
	                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_1fr_1fr]">
                  <label className="group relative col-span-2 flex flex-col gap-1 text-sm text-white/70 sm:col-span-1">
                    <input
                      type="text"
                      value={createState.label}
                      onChange={(e) =>
                        setCreateState((prev) => ({
                          ...prev,
                          label: e.target.value.toUpperCase(),
                        }))
                      }
                      data-tour="selected-time-block-name"
                      data-tour-valid-name={String(Boolean(createState.label.trim()))}
                      placeholder="Focus block"
                      className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 transition group-hover:border-white/20 group-focus-within:border-white/25 focus:outline-none"
                    />
                  </label>
                  <div
                    className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2"
                    data-tour="selected-time-block-time-range"
                    data-tour-valid-time={String(Boolean(createState.start_local && createState.end_local))}
                  >
                    <TimeInput
                      label="Start time"
                      ariaLabel="Start time"
                      value={createState.start_local}
                      onChange={(next) => setCreateState((prev) => ({ ...prev, start_local: next }))}
                      dataTour="selected-time-block-start"
                      helper="HH:MM - we'll handle overnight."
                    />
                    <TimeInput
                      label="End time"
                      ariaLabel="End time"
                      value={createState.end_local}
                      onChange={(next) => setCreateState((prev) => ({ ...prev, end_local: next }))}
                      dataTour="selected-time-block-end"
                      helper="Ends before start? We wrap past midnight."
                    />
                  </div>
                </div>
                {!isEditingBlock ? (
                  <div
                    className="mt-3 flex flex-col gap-2"
                    data-tour="selected-time-block-days"
                    data-tour-valid-days={String(days.size > 0)}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                      Days
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {DAY_PREVIEWS.map((day) => {
                        const active = days.has(day.key);
                        return (
                          <button
                            key={day.key}
                            type="button"
                            onClick={() =>
                              setDays((prev) => {
                                const next = new Set(prev);
                                if (next.has(day.key)) {
                                  next.delete(day.key);
                                } else {
                                  next.add(day.key);
                                }
                                return next;
                              })
                            }
                            aria-pressed={active}
                            className={cn(
                              "h-7 min-w-0 rounded-full border px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition",
                              active
                                ? "border-black/45 bg-white/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                                : "border-black/45 bg-black/35 text-white/48 hover:border-white/16 hover:bg-black/20 hover:text-white/75"
                            )}
                          >
                            {day.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {createError && !createError.startsWith(OVERLAP_CREATE_ERROR_PREFIX) ? (
                  <div className="mt-3 text-sm text-red-100/90">{createError}</div>
                ) : null}
              </div>
            ) : null}

            {isCreatingDayType && !showCreateForm ? (
              <div
                className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#171920] to-[#101218] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_48px_rgba(0,0,0,0.52)] sm:p-5"
                data-tour="day-type-create-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                      New day type
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetDayTypeCreateForm}
                      className="rounded-full border border-black/65 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white/72 shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition hover:border-white/16 hover:bg-black/25 hover:text-white/88 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitDayType}
                      disabled={saving}
                      data-tour="day-type-save"
                      className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 shadow-[0_8px_18px_rgba(0,0,0,0.34)] transition hover:border-white/22 hover:bg-white/14 hover:text-white disabled:opacity-60 sm:px-4 sm:py-2 sm:text-sm"
                    >
                      {saving ? "Creating…" : "Add day type"}
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="group relative flex flex-col gap-1 text-sm text-white/70">
                    <input
                      type="text"
                      value={dayTypeName}
                      onChange={(e) => setDayTypeName(e.target.value.toUpperCase())}
                      data-tour="day-type-name"
                      placeholder="WORKDAY"
                      className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white placeholder:text-white/35 transition group-hover:border-white/20 group-focus-within:border-white/25 focus:outline-none"
                    />
                  </label>
                  <p className="mt-2 text-[11px] leading-snug text-white/48">
                    Choose the weekdays that should use this Day Type.
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-2" data-tour="day-type-days">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                    Days
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {DAY_PREVIEWS.map((day) => {
                      const active = selectedDays.has(day.key);
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => {
                            setFocusedDayKey(day.key);
                            setSelectedDays((prev) => {
                              const next = new Set(prev);
                              if (next.has(day.key)) {
                                next.delete(day.key);
                              } else {
                                next.add(day.key);
                              }
                              return next;
                            });
                          }}
                          aria-pressed={active}
                          className={cn(
                            "h-7 min-w-0 rounded-full border px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition",
                            active
                              ? "border-black/45 bg-white/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                              : "border-black/45 bg-black/35 text-white/48 hover:border-white/16 hover:bg-black/20 hover:text-white/75"
                          )}
                        >
                          {day.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {dayTypeCreateError ? (
                  <div className="mt-3 text-sm text-white/70">{dayTypeCreateError}</div>
                ) : null}
              </div>
            ) : null}
          </section>

          {SHOW_INTERNAL_DAY_TYPE_CONTROLS ? (
          <section className="space-y-3">
            {isCreatingDayType ? (
              <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#15161a] to-[#0e0f12] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_44px_rgba(0,0,0,0.45)] sm:p-4">
	                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                <div className="flex flex-wrap items-center gap-2 sm:flex-1">
	                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
	                    ADVANCED DAY PRESET
	                  </span>
	                  <span className="text-xs text-white/55 sm:text-sm">Group windows into a reusable preset for existing scheduling systems.</span>
	                </div>
                  <button
                    type="button"
                    onClick={() => {
                      const previousDayTypeId = selectedDayTypeId;
                      setIsCreatingDayType(false);
                      setSelectedDayTypeId(null);
                      setShowCreateForm(false);
                      setSaveMessage(null);
	                      setIsEditingExisting(false);
	                      setEditingBlockId(null);
	                      setEditingBlockContext(null);
	                      setEditScope("everywhere");
	                      setConstraintsTarget(null);
                      setMenuOpenId(null);
                      setCreateError(null);
                      setCreateState(DEFAULT_FORM);
                      if (previousDayTypeId) {
                        const current = dayTypes.find((dt) => dt.id === previousDayTypeId);
                        if (current) {
                          setDayTypeName(current.name);
                          setIsDefault(current.is_default);
                          setSchedulerMode(current.scheduler_mode ?? "REGULAR");
                        } else {
                          setSchedulerMode("REGULAR");
                        }
                      } else {
                        setSchedulerMode("REGULAR");
                      }
                    }}
                  className="rounded-full border border-white/20 bg-gradient-to-b from-white/16 to-white/7 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_8px_18px_rgba(0,0,0,0.35)] transition hover:border-white/35 hover:from-white/22 hover:to-white/10"
                >
                  Close creation
                </button>
                </div>
                <input
                  type="text"
                  value={dayTypeName}
                  onChange={(e) => setDayTypeName(e.target.value.toUpperCase())}
                  placeholder="Default day"
                  disabled={!isCreatingDayType}
                  data-tour="day-type-name"
                  className="mt-2.5 w-full rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none sm:px-3 sm:py-2 sm:text-sm"
                />
	                <div className="mt-2 text-xs sm:text-sm" data-tour="day-type-coverage">
	                  {coverageStatus.ok ? (
	                    <span className="text-white/75">{coverageStatusCopy}</span>
	                  ) : (
	                    <span
	                      className="text-white/60"
	                    >
	                      {coverageStatusCopy}
	                    </span>
	                  )}
	                </div>
                <div className="mt-3 grid grid-cols-2 items-start gap-3 sm:items-center">
                  <div className="flex flex-col gap-2">
                    <label
                      className={cn(
                        "flex items-center gap-2 text-xs text-white/80 sm:text-sm",
                        !isCreatingDayType || (!isDefault && availableDayKeys.length === 0) ? "opacity-60" : ""
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isDefault}
                        disabled={
                          !isCreatingDayType ||
                          (!isDefault && availableDayKeys.length === 0)
                        }
                        onChange={(e) => {
                          const next = e.target.checked;
                          setIsDefault(next);
                          if (next) {
                            setSelectedDays((prev) => {
                              if (prev.size > 0) return prev;
                              return new Set(availableDayKeys);
                            });
                          } else {
                            setSelectedDays(new Set());
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-white/30 bg-black/40 text-white focus:ring-white sm:h-4 sm:w-4"
                      />
                      <span className="text-xs uppercase tracking-[0.14em]">Set as default</span>
                    </label>
                    {isDefault ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {DAYS_OF_WEEK.map((day) => {
                          const active = selectedDays.has(day.key);
                          const ownedByOther = dayOwnership.get(day.key);
                          const conflict = ownedByOther && ownedByOther !== selectedDayTypeId;
                          return (
                            <button
                              key={day.key}
                              type="button"
                              onClick={() => {
                                setFocusedDayKey(day.key);
                                setSelectedDays((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(day.key)) {
                                    next.delete(day.key);
                                  } else {
                                    next.add(day.key);
                                  }
                                  return next;
                                });
                              }}
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold transition",
                                conflict && active
                                  ? "border-white/35 bg-white/15 text-white"
                                  : active
                                    ? "border-white/50 bg-black text-white"
                                    : conflict
                                      ? "border-white/12 bg-black text-white/35"
                                      : "border-white/15 bg-black text-white/60 hover:border-white/25"
                              )}
                              aria-pressed={active}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : availableDayKeys.length === 0 && hasDefaultDayType ? (
                      <span className="text-xs text-white/50">All days are already assigned to defaults.</span>
                    ) : null}
                    {isDefault && selectedDays.size === 0 ? (
                      <span className="text-xs text-white/60">Pick at least one day for this default.</span>
                    ) : null}
	                    {isDefault && conflictingSelectedDays.size > 0 ? (
	                      <span className="text-xs text-white/60">
	                        Remove conflicting days — they are used by another default preset.
	                      </span>
	                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="w-full max-w-[260px] sm:w-[260px]">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/65">
	                        <span>Scheduler mode</span>
	                        <span className="text-[9px] text-white/40">advanced</span>
                      </div>
                      <Select
                        value={schedulerMode}
                        onValueChange={(next) => setSchedulerMode(normalizeSchedulerMode(next))}
                        disabled={!isCreatingDayType}
                      >
                        <SelectTrigger className="mt-1 h-9 w-full rounded-xl border border-white/15 bg-gradient-to-b from-[#1a1b20] to-[#111217] px-2.5 text-left text-xs font-semibold text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_18px_rgba(0,0,0,0.28)] hover:border-white/30 focus:ring-0 sm:h-11 sm:px-3 sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/15 bg-[#0f1014]/98 p-0 text-white shadow-[0_20px_50px_rgba(0,0,0,0.58)]">
                          {SCHEDULER_MODE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              label={option.label}
                              className="text-xs text-white focus:bg-white/10 focus:text-white sm:text-sm"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold">{option.label}</span>
                                <span className="text-[10px] text-white/55 sm:text-[11px]">{option.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
	                      <p className="mt-1 text-[10px] text-white/50 sm:text-[11px]">
	                        Applied automatically whenever this preset is used.
	                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveDayType}
                      disabled={!isCreatingDayType || !canSaveDayType || saving}
                      data-tour="day-type-save"
                      className={cn(
                        "w-full max-w-[220px] rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_10px_24px_rgba(0,0,0,0.4)] transition sm:w-auto sm:px-4 sm:py-2 sm:text-sm",
                        isCreatingDayType
                          ? "bg-gradient-to-b from-white/20 to-white/10 hover:border-white/35 hover:from-white/28 hover:to-white/14"
                          : "bg-gradient-to-b from-white/12 to-white/5 opacity-60",
                        "disabled:opacity-50"
                      )}
                    >
	                      {saving ? "Saving…" : isDefault ? "Save default preset" : "Save preset"}
                    </button>
                    {saveMessage ? (
                      <span className="text-xs text-white/60">{saveMessage}</span>
                    ) : null}
                  </div>
              </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#14161b] to-[#0f1014] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_16px_34px_rgba(0,0,0,0.4)] sm:px-4 sm:py-3">
                <div className="flex items-center justify-between">
	                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
	                    ADVANCED DAY PRESETS
	                  </div>
                  <button
                    type="button"
                    onClick={startCreateDayType}
                    data-tour="day-type-create"
                    className="rounded-full border border-white/20 bg-gradient-to-b from-white/16 to-white/7 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_18px_rgba(0,0,0,0.35)] transition hover:border-white/35 hover:from-white/22 hover:to-white/11"
                  >
	                    Create preset
                  </button>
                </div>
              </div>
            )}

            {dayTypes.length > 0 ? (
              <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#14161b] to-[#0f1014] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_16px_34px_rgba(0,0,0,0.42)] sm:px-4 sm:py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
	                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">
	                    Saved presets
                  </div>
                  {!isCreatingDayType && selectedDayTypeId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingDayType(true);
                        setIsEditingExisting(true);
                        setSaveMessage(null);
                        const current = dayTypes.find((dt) => dt.id === selectedDayTypeId);
	                        if (current) {
	                          setDayTypeName(current.name);
	                          setIsDefault(current.is_default);
	                          setSchedulerMode(current.scheduler_mode ?? "REGULAR");
	                          const firstDayKey = current.days
	                            .map((n) => DAY_INDEX_TO_KEY[n])
	                            .find((dayKey): dayKey is string => Boolean(dayKey));
	                          if (firstDayKey) {
	                            setFocusedDayKey(firstDayKey);
	                          }
	                        }
                        const mapped = dayTypeBlockMap.get(selectedDayTypeId);
                        setSelectedIds(new Set(mapped ?? []));
                        const defaults = current?.days
                          .map((n) => DAY_INDEX_TO_KEY[n])
                          .filter((d): d is string => Boolean(d));
                        setSelectedDays(new Set(defaults ?? []));
                      }}
                      className="text-[11px] uppercase tracking-[0.14em] text-white/80 underline-offset-4 hover:underline"
                    >
	                      Edit preset
                    </button>
                  ) : (
                    <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                      Tap to load
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {dayTypes.map((dt) => {
                    const active = !isCreatingDayType && selectedDayTypeId === dt.id;
                    return (
                      <button
                        key={dt.id}
                        type="button"
	                        onClick={() => {
	                          const defaults = dt.days
	                            .map((n) => DAY_INDEX_TO_KEY[n])
	                            .filter((d): d is string => Boolean(d));
	                          if (defaults[0]) {
	                            setFocusedDayKey(defaults[0]);
	                          }
	                          loadDayTypeSelection(dt);
	                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition sm:px-3 sm:py-1.5 sm:text-sm",
                          active
                            ? "border-white/35 bg-gradient-to-b from-white/20 to-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_24px_rgba(0,0,0,0.35)]"
                            : "border-white/12 bg-gradient-to-b from-white/10 to-white/4 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.26)] hover:border-white/24 hover:from-white/14 hover:to-white/6"
                        )}
                      >
                        <span className="max-w-[12rem] truncate text-left">{dt.name}</span>
                        {dt.is_default && dt.days.length > 0 ? (
                          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
                            {[...dt.days]
                              .sort((a, b) => a - b)
                              .map((dayIndex) => DAY_INDEX_TO_LABEL[dayIndex])
                              .filter(Boolean)
                              .map((label, idx) => (
                                <span key={`${label}-${idx}`}>{label}</span>
                              ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
          ) : null}

		          <section className="space-y-3 sm:space-y-4">
	            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	              <div>
	                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
	                  Time blocks
	                </h2>
	                <p className="mt-1 text-[11px] text-white/45">
	                  {timeBlockListMode === "selected-day-type"
	                    ? selectedDayType
	                      ? `${selectedDayType.name} blocks`
	                      : "No Day Type selected"
	                    : "All saved blocks"}
	                </p>
	              </div>
	              <div className="grid grid-cols-2 gap-1 rounded-full border border-black/55 bg-black/35 p-1">
	                {[
	                  { value: "selected-day-type", label: "Selected Day Type" },
	                  { value: "all-blocks", label: "All Blocks" },
	                ].map((option) => {
	                  const active = timeBlockListMode === option.value;
	                  const disabled = option.value === "selected-day-type" && !selectedDayTypeId;
	                  return (
	                    <button
	                      key={option.value}
	                      type="button"
	                      disabled={disabled}
	                      onClick={() => {
                          setAttachConflictBlockId(null);
                          setTimeBlockListMode(option.value as TimeBlockListMode);
                        }}
	                      className={cn(
	                        "h-8 rounded-full px-3 text-[11px] font-semibold transition",
	                        active
	                          ? "bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
	                          : "text-white/55 hover:bg-white/7 hover:text-white/80",
	                        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-white/55"
	                      )}
	                    >
	                      {option.label}
	                    </button>
	                  );
	                })}
	              </div>
	            </div>

            {error ? (
              <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-white/10 to-white/5 px-4 py-3 text-sm text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_rgba(0,0,0,0.35)]">
                {error}
              </div>
            ) : null}

		            {!hasVisibleWindowBlocks ? (
		              <div className="rounded-2xl border border-white/12 bg-gradient-to-b from-[#17191f] to-[#101116] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.45)] sm:p-6">
		                <div className="space-y-3 text-center">
		                  <h3 className="text-base font-semibold text-white sm:text-lg">
		                    {timeBlockListMode === "selected-day-type"
		                      ? "No blocks linked to this Day Type"
		                      : "No Time Blocks yet"}
		                  </h3>
		                  <p className="text-xs text-white/60 sm:text-sm">
		                    {timeBlockListMode === "selected-day-type"
		                      ? "Use All Blocks to edit saved blocks or create a new block for this day."
		                      : "Add time blocks to let CREATOR schedule inside them."}
		                  </p>
		                  {timeBlockListMode === "selected-day-type" && hasBlocks ? (
		                    <button
		                      type="button"
		                      onClick={() => setTimeBlockListMode("all-blocks")}
		                      className="rounded-full border border-white/14 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:border-white/24 hover:bg-white/12 hover:text-white"
		                    >
		                      View All Blocks
		                    </button>
		                  ) : null}
		                </div>
		              </div>
		            ) : null}

		            {hasVisibleWindowBlocks ? (
	              <div className="grid gap-3 sm:grid-cols-2">
	                {visibleWindowBlocks.map((block) => {
                  const selectedDayTypeHasBlock = selectedDayTypeId
                    ? dayTypeBlockMap.get(selectedDayTypeId)?.has(block.id) ?? false
                    : false;
	                  const selected =
                    timeBlockListMode === "all-blocks"
                      ? selectedDayTypeHasBlock
                      : selectedDayTypeBlockIds.has(block.id);
	                  const isConstraintsTargetBlock = constraintsTarget?.id === block.id;
	                  const isConfirmingDelete = confirmingDeleteId === block.id;
	                  const tourHighlightBlock = isConstraintsTargetBlock || editingBlockId === block.id;
                  const label = normalizeLabel(block.label) ?? "TIME BLOCK";
                  const focusedOwnerId = dayOwnership.get(focusedDayKey) ?? null;
                  const focusedDayTypeHasBlock = focusedOwnerId
                    ? dayTypeBlockMap.get(focusedOwnerId)?.has(block.id) ?? false
                    : false;
	                  const visibleDayTypeId = isCreatingDayType
	                    ? selectedDayTypeId
	                    : selectedDayTypeHasBlock
	                      ? selectedDayTypeId
	                      : focusedDayTypeHasBlock
	                        ? focusedOwnerId
	                        : selectedDayTypeId ?? focusedOwnerId;
                  const cardEditContext: TimeBlockEditContext =
                    timeBlockListMode === "selected-day-type" && visibleDayTypeId
                      ? {
	                          mode: "selected-day-type",
	                          dayTypeId: visibleDayTypeId,
	                          sourceBlockId: block.id,
	                        }
	                      : { mode: "all-blocks", sourceBlockId: block.id };
	                  const stateKey = getDayTypeBlockStateKey(visibleDayTypeId, block.id);
                  const energyLevel = stateKey ? blockEnergy.get(stateKey) ?? "NO" : "NO";
                  const locationOption = stateKey ? blockLocation.get(stateKey) : null;
                  const allowAllHabits = stateKey ? blockAllowAllHabitTypes.get(stateKey) ?? true : true;
                  const allowAllSkills = stateKey ? blockAllowAllSkills.get(stateKey) ?? true : true;
                  const allowAllMonuments =
                    stateKey ? blockAllowAllMonuments.get(stateKey) ?? true : true;
                  const allowedHabitTypes = stateKey
                    ? blockAllowedHabitTypes.get(stateKey) ?? new Set<string>()
                    : new Set<string>();
                  const allowedSkillIds = stateKey
                    ? blockAllowedSkillIds.get(stateKey) ?? new Set<string>()
                    : new Set<string>();
                  const allowedMonumentIds = stateKey
                    ? blockAllowedMonumentIds.get(stateKey) ?? new Set<string>()
                    : new Set<string>();
                  const filteredSkills = skills
                    .filter((skill) =>
                      (skill.name ?? "").toLowerCase().includes(skillSearch.toLowerCase())
                    )
                    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
                  const filteredMonuments = monuments
                    .filter((monument) =>
                      (monument.title ?? "").toLowerCase().includes(monumentSearch.toLowerCase())
                    )
                    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
                  return (
	                    <div
	                      key={block.id}
	                      role="button"
	                      tabIndex={0}
	                      data-tour={tourHighlightBlock ? "selected-time-block" : undefined}
	                      onClick={() =>
	                        openTimeBlockCard(
	                          block,
	                          cardEditContext.mode === "selected-day-type" ? cardEditContext.dayTypeId : null
	                        )
	                      }
	                      onKeyDown={(event) => {
	                        if (event.key === "Enter" || event.key === " ") {
	                          event.preventDefault();
	                          openTimeBlockCard(
	                            block,
	                            cardEditContext.mode === "selected-day-type" ? cardEditContext.dayTypeId : null
	                          );
	                        }
	                      }}
	                      className={cn(
	                        "flex w-full cursor-pointer flex-col gap-3 rounded-2xl border px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.34)] transition focus:outline-none focus:ring-1 focus:ring-black/70",
                        "border-black/55 bg-[#101219] hover:border-black/75 hover:bg-[#13151c]",
                        selected && "border-black/85 bg-[#18191d]",
                        isConstraintsTargetBlock && "border-black bg-[#17191d]"
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
		                        <DropdownMenu
		                          open={menuOpenId === block.id}
		                          onOpenChange={(open) => setMenuOpenId(open ? block.id : null)}
		                        >
                          <DropdownMenuTrigger asChild>
	                            <button
	                              type="button"
	                              onClick={(event) => event.stopPropagation()}
	                              onKeyDown={(event) => event.stopPropagation()}
	                              data-tour={isConstraintsTargetBlock ? "selected-time-block-menu" : undefined}
                              className="rounded-md px-1.5 py-1 text-white/60 transition hover:text-white focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0"
                              aria-label={`Open actions for ${label}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            sideOffset={8}
                            className="w-52 border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <DropdownMenuItem
	                              className="flex items-center gap-2 focus:bg-white/10 focus:text-white"
	                              onSelect={(event) => {
	                                event.preventDefault();
	                                beginEditBlock(block, cardEditContext);
	                                setMenuOpenId(null);
	                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit block
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2 focus:bg-white/10 focus:text-white"
	                              data-tour={isConstraintsTargetBlock ? "selected-time-block-constraints" : undefined}
	                              onSelect={(event) => {
	                                event.preventDefault();
	                                beginEditBlock(block, cardEditContext, { openConstraints: true });
	                                emitConstraintsOpenedEvent();
	                                setMenuOpenId(null);
	                              }}
                            >
                              <Wand2 className="h-4 w-4" />
                              Add constraints
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem
	                              className="flex items-center gap-2 text-rose-200 focus:bg-rose-500/15 focus:text-rose-50"
	                              onSelect={(event) => {
	                                event.preventDefault();
	                                setConfirmingDeleteId(block.id);
	                                setConstraintsTarget(null);
	                                setMenuOpenId(null);
	                              }}
	                            >
	                              <Trash2 className="h-4 w-4" />
	                              Delete
	                            </DropdownMenuItem>
                          </DropdownMenuContent>
		                        </DropdownMenu>
	                        <div
		                          className="flex flex-1 items-center justify-between text-left focus:outline-none"
	                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="truncate text-sm font-semibold text-white/90">{label}</div>
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="shrink-0 text-xs uppercase tracking-[0.18em] text-white/50">
                                {block.start_local} → {block.end_local}
                              </div>
                              <div className="flex min-w-0 items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-white/45">
                                <MapPin className="h-3 w-3 shrink-0 text-white/55" />
                                <span className="truncate">
                                  {(locationOption?.label || locationOption?.value || "Anywhere").toString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
	                              type="button"
	                              disabled={!visibleDayTypeId}
	                              onClick={async (event) => {
	                                event.preventDefault();
	                                event.stopPropagation();
	                                if (!visibleDayTypeId) return;
	                                const nextEnergyLevel = getNextEnergyLevel(energyLevel);
	                                const dayTypeIdsToUpdate = isCreatingDayType
	                                  ? [visibleDayTypeId]
	                                  : getEnergyUpdateDayTypeIds(block.id, visibleDayTypeId);
	                                setEnergyForBlockDayTypes(block.id, dayTypeIdsToUpdate, nextEnergyLevel);
	                                if (!isCreatingDayType) {
	                                  try {
	                                    await persistBlockEnergy(block.id, dayTypeIdsToUpdate, nextEnergyLevel);
	                                  } catch (err) {
	                                    console.error(err);
	                                    setSaveMessage("Unable to update block energy right now.");
	                                  }
	                                }
	                              }}
	                              className="rounded-md bg-white/5 px-1 py-0.5 text-white/70 transition hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/30 disabled:cursor-default disabled:opacity-70"
                              aria-label={`Cycle energy for ${label}`}
                              data-tour={tourEnergyHighlightId === block.id ? "selected-time-block-energy" : undefined}
                            >
                              <FlameEmber level={energyLevel} size="sm" />
                            </button>
                            <button
                              type="button"
                              disabled={!selectedDayTypeId}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void handleToggleBlockForSelectedDayType(block, !selected);
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  void handleToggleBlockForSelectedDayType(block, !selected);
                                }
                              }}
                              className={cn(
                                "ml-1 flex h-7 w-7 items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition focus:outline-none focus:ring-1 focus:ring-white/35 disabled:cursor-not-allowed disabled:opacity-45",
                                selected
                                  ? "border-white/25 bg-white/12 text-white/75 hover:border-white/35 hover:bg-white/16 hover:text-white/85"
                                  : "border-white/15 bg-black/25 text-white/45 hover:border-white/25 hover:bg-white/8 hover:text-white/70"
                              )}
                              role="checkbox"
                              aria-checked={selected}
                              aria-label={
                                selected
                                  ? `Remove ${label} from selected day type`
                                  : `Add ${label} to selected day type`
                              }
                            >
                              {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                            </button>
                          </div>
	                        </div>
	                      </div>
	                      {isConfirmingDelete ? (
	                        <div
	                          className="rounded-xl border border-black/75 bg-black/35 p-3 shadow-[0_8px_18px_rgba(0,0,0,0.28)]"
	                          onClick={(event) => event.stopPropagation()}
	                          onKeyDown={(event) => event.stopPropagation()}
	                        >
	                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                            <div className="min-w-0">
	                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/78">
	                                Delete {label}?
	                              </div>
	                              <div className="mt-1 text-[11px] leading-snug text-white/48">
	                                This removes it from every saved scheduling window.
	                              </div>
	                            </div>
	                            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
	                              <button
	                                type="button"
	                                onClick={() => setConfirmingDeleteId(null)}
	                                className="rounded-full border border-black/70 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-black hover:bg-black/20 hover:text-white/90"
	                              >
	                                Cancel
	                              </button>
	                              <button
	                                type="button"
	                                disabled={deletingId === block.id}
	                                onClick={() => void handleDeleteBlock(block.id)}
	                                className="rounded-full border border-black/70 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:border-black hover:bg-rose-500/16 hover:text-rose-50 disabled:opacity-55"
	                              >
	                                {deletingId === block.id ? "Deleting..." : "Delete"}
	                              </button>
	                            </div>
	                          </div>
	                        </div>
	                      ) : null}
	                      {constraintsTarget?.id === block.id ? (
	                        <div
	                          className="rounded-2xl border border-black/60 bg-[#0d0f14] px-4 py-3 text-sm text-white/85 shadow-[0_10px_24px_rgba(0,0,0,0.34)]"
	                          data-tour={isConstraintsTargetBlock ? "selected-time-block-constraints-panel" : undefined}
	                          onClick={(event) => event.stopPropagation()}
	                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-4">
                              <div className="text-[11px] uppercase tracking-[0.16em] text-white/55">
                                Constraints
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/60">
                                    <span>Block type</span>
                                  </div>
                                  <Select
                                    value={
                                      (stateKey ? blockType.get(stateKey) ?? "FOCUS" : "FOCUS") as BlockType
                                    }
                                    onValueChange={(value) => {
                                      if (!stateKey) return;
                                      setBlockType((prev) => {
                                        const next = new Map(prev);
                                        next.set(stateKey, value as BlockType);
                                        return next;
                                      });
                                      if (isConstraintsTargetBlock && value === "BREAK") {
                                        window.dispatchEvent(
                                          new CustomEvent("tour:block-type-break-selected")
                                        );
                                      }
                                    }}
                                  >
                                    <SelectTrigger
                                      className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none"
                                      dataTour={isConstraintsTargetBlock ? "selected-time-block-type" : undefined}
                                    >
                                      <SelectValue placeholder="Block type" />
                                    </SelectTrigger>
                                    <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                                      {BLOCK_TYPES.map((type) => (
                                        <SelectItem
                                          key={type}
                                          value={type}
                                          dataTour={
                                            isConstraintsTargetBlock && type === "BREAK"
                                              ? "selected-time-block-type-break"
                                              : undefined
                                          }
                                          label={BLOCK_TYPE_LABEL[type]}
                                        >
                                          {BLOCK_TYPE_LABEL[type]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div
                                  className="space-y-1"
                                  data-tour={isConstraintsTargetBlock ? "selected-time-block-location-section" : undefined}
                                >
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/60">
                                    <MapPin className="h-4 w-4 text-white/70" />
                                    <span>Location context</span>
                                  </div>
                                  <Select
                                    value={(stateKey ? blockLocation.get(stateKey)?.id : "ANY") as string}
                                    onValueChange={(value) => {
                                      const dispatchWorkLocationSelected = (candidate?: string | null) => {
                                        const normalized = normalizeLocationValue(candidate ?? value);
                                        if (isConstraintsTargetBlock && normalized === "WORK") {
                                          window.dispatchEvent(new CustomEvent("tour:location-work-selected"));
                                        }
                                      };

                                      if (value === "ANY") {
                                        updateLocationForBlock(block.id, null, selectedDayTypeId);
                                        dispatchWorkLocationSelected(null);
                                        return;
                                      }

                                      const match =
                                        selectableLocations.find((opt) => opt.id === value) ??
                                        selectableLocations.find(
                                          (opt) => normalizeLocationValue(opt.value) === normalizeLocationValue(value)
                                        );

                                      if (match) {
                                        updateLocationForBlock(block.id, match, selectedDayTypeId);
                                        dispatchWorkLocationSelected(match.value ?? match.label ?? value);
                                      } else {
                                        const normalized = normalizeLocationValue(value) ?? value;
                                        updateLocationForBlock(
                                          block.id,
                                          {
                                            id: value,
                                            value: normalized,
                                            label: match?.label ?? value,
                                          },
                                          selectedDayTypeId
                                        );
                                        dispatchWorkLocationSelected(normalized);
                                      }
                                    }}
                                    disabled={loadingLocations}
                                  >
                                    <SelectTrigger
                                      className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none"
                                      dataTour={isConstraintsTargetBlock ? "selected-time-block-location" : undefined}
                                    >
                                      <SelectValue placeholder="Anywhere" />
                                    </SelectTrigger>
                                    <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                                      <SelectItem value="ANY" label="Anywhere">
                                        Anywhere
                                      </SelectItem>
                                      {selectableLocations
                                        .filter((opt) => opt.value !== "ANY")
                                        .map((opt) => {
                                          const label = opt.label || opt.value || "";
                                          const normalized = normalizeLabel(label) ?? normalizeLabel(opt.value);
                                          const isWorkLocation = normalized === "WORK";
                                          return (
                                            <SelectItem
                                              key={opt.id}
                                              value={opt.id}
                                              dataTour={
                                                isWorkLocation ? "selected-time-block-location-work" : undefined
                                              }
                                              label={opt.label ?? opt.value ?? ""}
                                            >
                                              {opt.label}
                                            </SelectItem>
                                          );
                                        })}
                                    </SelectContent>
                                  </Select>
                                  <div className="text-xs text-white/55">
                                    Match this block only when you&apos;re at the selected location. Default is Anywhere.
                                  </div>
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/60">
                                    <span>Habits</span>
                                    <label className="flex items-center gap-2 text-xs text-white/70">
                                      <input
                                        type="checkbox"
                                        checked={allowAllHabits}
                                        onChange={(event) =>
                                          setBlockAllowAllHabitTypes((prev) => {
                                            if (!stateKey) return prev;
                                            const next = new Map(prev);
                                            next.set(stateKey, event.target.checked);
                                            return next;
                                          })
                                        }
                                        className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:ring-white"
                                      />
                                      <span>Allow all habit types</span>
                                    </label>
                                  </div>
                                  {!allowAllHabits ? (
                                    <>
                                      <div className="grid grid-cols-2 gap-2">
                                        {HABIT_TYPE_OPTIONS.map((option) => {
                                          const selectedHabit = allowedHabitTypes.has(option.value);
                                          return (
                                            <button
                                              key={option.value}
                                              type="button"
                                              onClick={() =>
                                            setBlockAllowedHabitTypes((prev) => {
                                              if (!stateKey) return prev;
                                              const next = new Map(prev);
                                              const set = new Set(next.get(stateKey) ?? []);
                                              if (set.has(option.value)) {
                                                set.delete(option.value);
                                              } else {
                                                set.add(option.value);
                                              }
                                              next.set(stateKey, set);
                                              return next;
                                            })
                                              }
                                              className={cn(
                                                "flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition",
                                                selectedHabit
                                                  ? "border-white/40 bg-white/15 text-white"
                                                  : "border-white/10 bg-black/20 text-white/70 hover:border-white/20"
                                              )}
                                            >
                                              <span className="truncate">{option.label}</span>
                                              {selectedHabit ? <Check className="h-4 w-4" /> : null}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {allowedHabitTypes.size === 0 ? (
                                        <div className="text-xs text-white/60">
                                          Nothing allowed in this block for habits.
                                        </div>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/60">
                                    <span>Skills</span>
                                    <label className="flex items-center gap-2 text-xs text-white/70">
                                      <input
                                        type="checkbox"
                                        checked={allowAllSkills}
                                        onChange={(event) =>
                                          setBlockAllowAllSkills((prev) => {
                                            if (!stateKey) return prev;
                                            const next = new Map(prev);
                                            next.set(stateKey, event.target.checked);
                                            return next;
                                          })
                                        }
                                        className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:ring-white"
                                      />
                                      <span>Allow all skills</span>
                                    </label>
                                  </div>
                                  {!allowAllSkills ? (
                                    <>
                                      <Input
                                        value={skillSearch}
                                        onChange={(event) => setSkillSearch(event.target.value)}
                                        placeholder="Search skills..."
                                        className="h-10 rounded-lg border border-white/10 bg-black/25 text-sm text-white placeholder:text-white/40"
                                      />
                                      <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                                        {skillsLoading ? (
                                          <p className="px-2 py-1 text-xs text-white/60">Loading skills…</p>
                                        ) : filteredSkills.length === 0 ? (
                                          <p className="px-2 py-1 text-xs text-white/60">No skills found.</p>
                                        ) : (
                                          <div className="space-y-3">
                                            {skillGroups.map((group) => {
                                              const groupSkillIds = group.skills.map((skill) => skill.id);
                                              const selectedCount = groupSkillIds.filter((id) =>
                                                allowedSkillIds.has(id)
                                              ).length;
                                              const allSelected =
                                                selectedCount === groupSkillIds.length && groupSkillIds.length > 0;
                                              const someSelected =
                                                selectedCount > 0 && selectedCount < groupSkillIds.length;
                                              const toggleGroup = () =>
                                                setBlockAllowedSkillIds((prev) => {
                                                  if (!stateKey) return prev;
                                                  const next = new Map(prev);
                                                  const set = new Set(next.get(stateKey) ?? []);
                                                  if (allSelected) {
                                                    groupSkillIds.forEach((id) => set.delete(id));
                                                  } else {
                                                    groupSkillIds.forEach((id) => set.add(id));
                                                  }
                                                  next.set(stateKey, set);
                                                  return next;
                                                });
                                              const skillButtons = group.skills.map((skill) => {
                                                const selectedSkill = allowedSkillIds.has(skill.id);
                                                return (
                                                  <button
                                                    key={skill.id}
                                                    type="button"
                                                      onClick={() =>
                                                        setBlockAllowedSkillIds((prev) => {
                                                          if (!stateKey) return prev;
                                                          const next = new Map(prev);
                                                          const set = new Set(next.get(stateKey) ?? []);
                                                          if (set.has(skill.id)) {
                                                            set.delete(skill.id);
                                                          } else {
                                                            set.add(skill.id);
                                                          }
                                                          next.set(stateKey, set);
                                                          return next;
                                                        })
                                                      }
                                                    className={cn(
                                                      "flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition",
                                                      selectedSkill
                                                        ? "bg-white/15 text-white"
                                                        : "text-white/75 hover:bg-white/10"
                                                    )}
                                                  >
                                                    <span className="flex items-center gap-2 truncate">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm">
                                                        {(skill.icon ?? "🎯").trim() || "🎯"}
                                                      </span>
                                                      <span className="truncate">{skill.name}</span>
                                                    </span>
                                                    {selectedSkill ? <Check className="h-4 w-4" /> : null}
                                                  </button>
                                                );
                                              });
                                              return (
                                                <div key={group.id} className="space-y-1">
                                                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/50">
                                                    <span className="text-[10px] uppercase tracking-[0.18em]">
                                                      {group.label}
                                                    </span>
                                                    <label className="relative flex h-3.5 w-3.5 items-center justify-center">
                                                      <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        ref={(el) => {
                                                          if (!el) return;
                                                          el.indeterminate = someSelected;
                                                          if (someSelected) {
                                                            el.setAttribute("aria-checked", "mixed");
                                                          } else {
                                                            el.setAttribute(
                                                              "aria-checked",
                                                              allSelected ? "true" : "false"
                                                            );
                                                          }
                                                        }}
                                                        onChange={toggleGroup}
                                                        className="peer absolute inset-0 h-full w-full opacity-0"
                                                      />
                                                      <span className="pointer-events-none absolute inset-0 h-full w-full rounded border border-slate-600 bg-slate-900 transition peer-checked:bg-slate-400 peer-checked:border-slate-400 peer-[aria-checked=mixed]:bg-slate-600"></span>
                                                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-950 opacity-0 peer-checked:opacity-100">
                                                        ✓
                                                      </span>
                                                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-200 opacity-0 peer-[aria-checked=mixed]:opacity-100">
                                                        —
                                                      </span>
                                                    </label>
                                                  </div>
                                                  <div className="grid gap-1">{skillButtons}</div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      {allowedSkillIds.size === 0 ? (
                                        <div className="text-xs text-white/60">
                                          No skills allowed yet
                                        </div>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/60">
                                <span>Monuments</span>
                                <label className="flex items-center gap-2 text-xs text-white/70">
                                    <input
                                      type="checkbox"
                                      checked={allowAllMonuments}
                                      onChange={(event) =>
                                        setBlockAllowAllMonuments((prev) => {
                                          if (!stateKey) return prev;
                                          const next = new Map(prev);
                                          next.set(stateKey, event.target.checked);
                                          return next;
                                        })
                                      }
                                      className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:ring-white"
                                    />
                                    <span>Allow all monuments</span>
                                  </label>
                                </div>
                                {!allowAllMonuments ? (
                                  <>
                                    <Input
                                      value={monumentSearch}
                                      onChange={(event) => setMonumentSearch(event.target.value)}
                                      placeholder="Search monuments..."
                                      className="h-10 rounded-lg border border-white/10 bg-black/25 text-sm text-white placeholder:text-white/40"
                                    />
                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2">
                                      {monumentsLoading ? (
                                        <p className="px-2 py-1 text-xs text-white/60">Loading monuments…</p>
                                      ) : filteredMonuments.length === 0 ? (
                                        <p className="px-2 py-1 text-xs text-white/60">No monuments found.</p>
                                      ) : (
                                        <div className="grid gap-1">
                                          {filteredMonuments.map((monument) => {
                                            const selectedMonument = allowedMonumentIds.has(monument.id);
                                            return (
                                              <button
                                                key={monument.id}
                                                type="button"
                                                onClick={() =>
                                                setBlockAllowedMonumentIds((prev) => {
                                                    if (!stateKey) return prev;
                                                    const next = new Map(prev);
                                                    const set = new Set(next.get(stateKey) ?? []);
                                                    if (set.has(monument.id)) {
                                                      set.delete(monument.id);
                                                    } else {
                                                      set.add(monument.id);
                                                    }
                                                    next.set(stateKey, set);
                                                    return next;
                                                  })
                                                }
                                                className={cn(
                                                  "flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition",
                                                  selectedMonument
                                                    ? "bg-white/15 text-white"
                                                    : "text-white/75 hover:bg-white/10"
                                                )}
                                              >
                                                <span className="flex items-center gap-2 truncate">
                                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm">
                                                    {(monument.emoji ?? "🗿").trim() || "🗿"}
                                                  </span>
                                                  <span className="truncate">{monument.title}</span>
                                                </span>
                                                {selectedMonument ? <Check className="h-4 w-4" /> : null}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    {allowedMonumentIds.size === 0 ? (
                                      <div className="text-xs text-white/60">
                                        Nothing allowed in this block for monuments.
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              data-tour="constraints-save"
	                              onClick={() => {
	                                setConstraintsTarget(null);
	                              }}
	                              className="rounded-full border border-black/70 bg-black/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/78 shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition hover:border-black hover:bg-black/25 hover:text-white/90"
	                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
              );
            })}
          </div>
        ) : null}
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
