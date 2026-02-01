"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ChevronUp, ChevronDown, MoreVertical, Pencil, Trash2, Wand2, MapPin, Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";

type TimeBlock = {
  id: string;
  label?: string | null;
  start_local: string;
  end_local: string;
  day_type_id?: string | null;
};

type PreviewSegment = {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  title: string;
  blockType: BlockType;
  overlapped: boolean;
};

type DayType = {
  id: string;
  name: string;
  is_default: boolean;
  days: number[];
  scheduler_mode?: SchedulerModeType | null;
};

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

type BlockType = "FOCUS" | "BREAK" | "PRACTICE";
const BLOCK_TYPES: BlockType[] = ["FOCUS", "BREAK", "PRACTICE"];
const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  FOCUS: "Focus",
  BREAK: "Break",
  PRACTICE: "Practice",
};

const HOURS = Array.from({ length: 25 }, (_, idx) => idx);
const DAYS_OF_WEEK = [
  { key: "sun", label: "S", index: 0 },
  { key: "mon", label: "M", index: 1 },
  { key: "tue", label: "T", index: 2 },
  { key: "wed", label: "W", index: 3 },
  { key: "thu", label: "T", index: 4 },
  { key: "fri", label: "F", index: 5 },
  { key: "sat", label: "S", index: 6 },
];

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

const SCHEDULER_MODE_OPTIONS: Array<{ value: SchedulerModeType; label: string; description: string }> = [
  { value: "REGULAR", label: "Regular", description: "Balance focus and flexibility." },
  { value: "RUSH", label: "Rush", description: "Tighten durations to move faster." },
  { value: "MONUMENTAL", label: "Monumental", description: "Prioritize big milestone work." },
  { value: "SKILLED", label: "Skilled", description: "Concentrate on skill-building work." },
  { value: "REST", label: "Rest", description: "Keep the day light and recovery-friendly." },
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
};

function formatHourLabel(hour: number): string {
  const safe = Math.min(Math.max(Math.floor(hour), 0), 24);
  const suffix = safe < 12 || safe === 24 ? "am" : "pm";
  const base = safe % 12 === 0 ? 12 : safe % 12;
  return `${base}${suffix}`;
}

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

function nudgeTime(value: string, deltaMinutes: number): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const wrapped = (minutes + deltaMinutes + 1440) % 1440;
  return minutesToLabel(wrapped);
}

async function resolveLocationIdsForBlocks({
  supabase,
  userId,
  blockIds,
  blockLocations,
  selectableLocations,
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
  userId: string;
  blockIds: string[];
  blockLocations: Map<string, LocationContextOption | null>;
  selectableLocations: LocationContextOption[];
}) {
  const cache = new Map<string, string | null>();
  const resolved = new Map<string, string | null>();

  const normalizeId = (candidate?: string | null) =>
    candidate && candidate !== "__any__" ? candidate : null;

  for (const blockId of blockIds) {
    const option = blockLocations.get(blockId);
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

function TimeInput({ label, value, onChange, helper, ariaLabel }: TimeInputProps) {
  return (
    <label className="group relative flex flex-col gap-1 text-sm text-white/70">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
        {label}
      </span>
      <div className="flex items-stretch gap-2">
        <input
          type="time"
          step={1800}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel ?? label}
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/35 transition group-hover:border-white/20 group-focus-within:border-white/25 focus:outline-none"
        />
        <div className="flex flex-col overflow-hidden rounded-lg border border-white/12 bg-white/5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]">
          <button
            type="button"
            onClick={() => onChange(nudgeTime(value, 30))}
            className="flex h-8 items-center justify-center px-2 text-white/85 transition hover:bg-white/10 active:translate-y-[0.5px]"
            aria-label={`Increase ${label} by 30 minutes`}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <div className="h-px bg-white/10" />
          <button
            type="button"
            onClick={() => onChange(nudgeTime(value, -30))}
            className="flex h-8 items-center justify-center px-2 text-white/70 transition hover:bg-white/10 active:translate-y-[0.5px]"
            aria-label={`Decrease ${label} by 30 minutes`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>
      {helper ? <span className="text-[11px] text-white/35">{helper}</span> : null}
    </label>
  );
}

function blockToSegments(block: TimeBlock): PreviewSegment[] {
  const start = parseTimeToMinutes(block.start_local);
  const end = parseTimeToMinutes(block.end_local);
  if (start === null || end === null) return [];
  if (start === end) return [];
  const label = normalizeLabel(block.label) ?? "TIME BLOCK";
  const title = `${label} ${block.start_local} → ${block.end_local}`;
  if (end > start) {
    return [
      {
        id: block.id,
        startMin: start,
        endMin: end,
        label,
        title,
        overlapped: false,
      },
    ];
  }
  return [
    {
      id: `${block.id}-a`,
      startMin: start,
      endMin: 1440,
      label,
      title,
      overlapped: false,
    },
    {
      id: `${block.id}-b`,
      startMin: 0,
      endMin: end,
      label,
      title,
      overlapped: false,
    },
  ];
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
  const [selectedDayTypeId, setSelectedDayTypeId] = useState<string | null>(null);
  const [isCreatingDayType, setIsCreatingDayType] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createState, setCreateState] = useState(DEFAULT_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingBlock, setSavingBlock] = useState(false);
  const [dayTypeName, setDayTypeName] = useState("Default day");
  const [hasDefaultDayType, setHasDefaultDayType] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [schedulerMode, setSchedulerMode] = useState<SchedulerModeType>("REGULAR");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [constraintsTarget, setConstraintsTarget] = useState<TimeBlock | null>(null);
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
  const [skillSearch, setSkillSearch] = useState("");
  const [monumentSearch, setMonumentSearch] = useState("");

  const FLAME_LEVELS = ENERGY.LIST as FlameLevel[];
  const isEditingBlock = Boolean(editingBlockId);
  const hasBlocks = timeBlocks.length > 0;
  const { options: locationOptions, loading: loadingLocations } = useLocationContexts();
  const selectableLocations = useMemo(() => locationOptions ?? [], [locationOptions]);

  const startCreateBlock = useCallback(() => {
    setEditingBlockId(null);
    setConstraintsTarget(null);
    setCreateState(DEFAULT_FORM);
    setCreateError(null);
    setShowCreateForm(true);
  }, []);

  const syncEnergyMap = useCallback((blocks: TimeBlock[]) => {
    setBlockEnergy((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, "NO");
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockLocation((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, null);
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockType((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, "FOCUS");
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowAllHabitTypes((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, true);
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowAllSkills((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, true);
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowAllMonuments((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, true);
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowedHabitTypes((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, new Set());
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowedSkillIds((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, new Set());
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
    setBlockAllowedMonumentIds((prev) => {
      const next = new Map(prev);
      blocks.forEach((block) => {
        if (!next.has(block.id)) {
          next.set(block.id, new Set());
        }
      });
      Array.from(next.keys()).forEach((id) => {
        if (!blocks.find((block) => block.id === id)) {
          next.delete(id);
        }
      });
      return next;
    });
  }, []);

  const cycleEnergy = (id: string) => {
    setBlockEnergy((prev) => {
      const current = prev.get(id) ?? "NO";
      const idx = FLAME_LEVELS.indexOf(current);
      const nextLevel = FLAME_LEVELS[(idx + 1) % FLAME_LEVELS.length];
      return new Map(prev).set(id, nextLevel);
    });
  };

  const updateLocationForBlock = (blockId: string, option: LocationContextOption | null) => {
    setBlockLocation((prev) => {
      const next = new Map(prev);
      next.set(blockId, option);
      return next;
    });
  };

  const syncResolvedLocations = useCallback(
    (blockIds: string[], resolved: Map<string, string | null>) => {
      setBlockLocation((prev) => {
        const next = new Map(prev);
        blockIds.forEach((id) => {
          const resolvedId = resolved.get(id);
          if (resolvedId) {
            const current = prev.get(id);
            const value = normalizeLocationValue(current?.value ?? current?.label ?? null) ?? "";
            const label = current?.label ?? current?.value ?? value;
            next.set(id, {
              id: resolvedId,
              value: value || resolvedId,
              label: label || resolvedId,
            });
          }
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
      const normalized = (data as DayType[] | null)?.map((dt) => ({
        ...dt,
        scheduler_mode: normalizeSchedulerMode((dt as DayType)?.scheduler_mode as string | null),
        days: (dt.days ?? [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) as number[],
      }));
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
      const dttbToBlockId = new Map<string, string>();
      const allowedHabitMap = new Map<string, Set<string>>();
      const allowedSkillMap = new Map<string, Set<string>>();
      const allowedMonumentMap = new Map<string, Set<string>>();
      (data as DayTypeBlockLink[] | null)?.forEach((row) => {
        if (row.id && row.time_block_id) {
          dttbToBlockId.set(row.id, row.time_block_id);
        }
        const existing = next.get(row.day_type_id) ?? new Set<string>();
        existing.add(row.time_block_id);
        next.set(row.day_type_id, existing);
        const level = (row.energy as FlameLevel | undefined) ?? "NO";
        energyMap.set(row.time_block_id, level);
        const type = (row.block_type as BlockType | undefined) ?? "FOCUS";
        typeMap.set(row.time_block_id, type);
        allowHabitMap.set(row.time_block_id, row.allow_all_habit_types !== false);
        allowSkillMap.set(row.time_block_id, row.allow_all_skills !== false);
        allowMonumentMap.set(row.time_block_id, row.allow_all_monuments !== false);
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
          locationMap.set(row.time_block_id, {
            id: row.location_context_id,
            value: value ?? row.location_context_id,
            label: label ?? row.location_context_id,
          });
        } else {
          locationMap.set(row.time_block_id, null);
        }
      });
      const dttbIds = Array.from(dttbToBlockId.keys());
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
          const blockId = row.day_type_time_block_id
            ? dttbToBlockId.get(row.day_type_time_block_id)
            : null;
          const normalized = normalizeHabitTypeValue(
            (row as { habit_type?: string | null })?.habit_type ?? null
          );
          if (!blockId || !normalized) return;
          const existing = allowedHabitMap.get(blockId) ?? new Set<string>();
          existing.add(normalized);
          allowedHabitMap.set(blockId, existing);
        });
        (skillWhitelist.data ?? []).forEach((row) => {
          const blockId = row.day_type_time_block_id
            ? dttbToBlockId.get(row.day_type_time_block_id)
            : null;
          const skillId = (row as { skill_id?: string | null })?.skill_id?.trim();
          if (!blockId || !skillId) return;
          const existing = allowedSkillMap.get(blockId) ?? new Set<string>();
          existing.add(skillId);
          allowedSkillMap.set(blockId, existing);
        });
        (monumentWhitelist.data ?? []).forEach((row) => {
          const blockId = row.day_type_time_block_id
            ? dttbToBlockId.get(row.day_type_time_block_id)
            : null;
          const monumentId = (row as { monument_id?: string | null })?.monument_id?.trim();
          if (!blockId || !monumentId) return;
          const existing = allowedMonumentMap.get(blockId) ?? new Set<string>();
          existing.add(monumentId);
          allowedMonumentMap.set(blockId, existing);
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
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setSkills([]);
        setMonuments([]);
        return;
      }
      setSkillsLoading(true);
      setMonumentsLoading(true);
      const [skillsData, monumentsData] = await Promise.all([
        getSkillsForUser(user.id).catch((error) => {
          console.warn("Unable to load skills", error);
          return [];
        }),
        getMonumentsForUser(user.id).catch((error) => {
          console.warn("Unable to load monuments", error);
          return [];
        }),
      ]);
      setSkills(skillsData ?? []);
      setMonuments(monumentsData ?? []);
    } catch (err) {
      console.error(err);
      setSkills([]);
      setMonuments([]);
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

  useEffect(() => {
    if (!hasBlocks && isCreatingDayType) {
      startCreateBlock();
    }
  }, [hasBlocks, isCreatingDayType, startCreateBlock]);

  useEffect(() => {
    if (isCreatingDayType) return;
    if (!selectedDayTypeId && dayTypes.length > 0) {
      const defaultType = dayTypes.find((dt) => dt.is_default) ?? dayTypes[0];
      setSelectedDayTypeId(defaultType.id);
      setDayTypeName(defaultType.name);
      setIsDefault(defaultType.is_default);
      setSchedulerMode(defaultType.scheduler_mode ?? "REGULAR");
      const defaults = defaultType.days.map((n) => DAY_INDEX_TO_KEY[n]).filter((d): d is string => Boolean(d));
      setSelectedDays(new Set(defaults));
      return;
    }
    if (dayTypes.length === 0) {
      setSelectedDayTypeId(null);
      setDayTypeName("");
      setIsDefault(true);
      setSchedulerMode("REGULAR");
      setShowCreateForm(false);
      setIsCreatingDayType(false);
      setIsEditingExisting(false);
      setSelectedDays(new Set());
      setEditingBlockId(null);
      setConstraintsTarget(null);
      setCreateError(null);
      setCreateState(DEFAULT_FORM);
    }
  }, [dayTypes, isCreatingDayType, selectedDayTypeId]);

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const resetBlockForm = () => {
    setCreateState(DEFAULT_FORM);
    setCreateError(null);
    setShowCreateForm(false);
    setEditingBlockId(null);
    setMenuOpenId(null);
  };

  const handleSubmitBlock = async () => {
    setCreateError(null);
    const start = parseTimeToMinutes(createState.start_local);
    const end = parseTimeToMinutes(createState.end_local);
    if (start === null || end === null) {
      setCreateError("Please enter start and end times as HH:MM.");
      return;
    }
    setSavingBlock(true);
    try {
      if (isEditingBlock && editingBlockId) {
        const optimisticUpdated: TimeBlock = {
          id: editingBlockId,
          label: normalizeLabel(createState.label) ?? "TIME BLOCK",
          start_local: normalizeTimeLabel(createState.start_local),
          end_local: normalizeTimeLabel(createState.end_local),
          day_type_id: timeBlocks.find((block) => block.id === editingBlockId)?.day_type_id ?? null,
        };

        if (!supabase) {
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

        const { data, error: updateError } = await supabase
          .from("time_blocks")
          .update({
            label: normalizeLabel(createState.label),
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
        resetBlockForm();
        return;
      }

      const optimistic: TimeBlock = {
        id: makeId(),
        label: normalizeLabel(createState.label) ?? "TIME BLOCK",
        start_local: normalizeTimeLabel(createState.start_local),
        end_local: normalizeTimeLabel(createState.end_local),
      };

      if (!supabase) {
        setTimeBlocks((prev) => sortTimeBlocks([...prev, optimistic]));
        setSelectedIds((prev) => new Set(prev).add(optimistic.id));
        setBlockEnergy((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, "NO");
          return next;
        });
        setBlockType((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, "FOCUS");
          return next;
        });
        setBlockAllowAllHabitTypes((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, true);
          return next;
        });
        setBlockAllowAllSkills((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, true);
          return next;
        });
        setBlockAllowAllMonuments((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, true);
          return next;
        });
        setBlockAllowedHabitTypes((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, new Set());
          return next;
        });
        setBlockAllowedSkillIds((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, new Set());
          return next;
        });
        setBlockAllowedMonumentIds((prev) => {
          const next = new Map(prev);
          next.set(optimistic.id, new Set());
          return next;
        });
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
          label: normalizeLabel(createState.label),
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
        setTimeBlocks((prev) => sortTimeBlocks([...prev, inserted]));
        setSelectedIds((prev) => new Set(prev).add(inserted.id));
        setBlockEnergy((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? "NO");
          return next;
        });
        setBlockType((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? "FOCUS");
          return next;
        });
        setBlockAllowAllHabitTypes((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? true);
          return next;
        });
        setBlockAllowAllSkills((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? true);
          return next;
        });
        setBlockAllowAllMonuments((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? true);
          return next;
        });
        setBlockAllowedHabitTypes((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? new Set());
          return next;
        });
        setBlockAllowedSkillIds((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? new Set());
          return next;
        });
        setBlockAllowedMonumentIds((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, prev.get(inserted.id) ?? new Set());
          return next;
        });
      }

      resetBlockForm();
      setConstraintsTarget(null);
      setMenuOpenId(null);
    } catch (err) {
      console.error(err);
      setCreateError("Unable to save time block. Try again.");
    } finally {
      setSavingBlock(false);
    }
  };

  const beginEditBlock = (block: TimeBlock) => {
    setEditingBlockId(block.id);
    setCreateState({
      label: block.label ?? "",
      start_local: block.start_local,
      end_local: block.end_local,
    });
    setCreateError(null);
    setConstraintsTarget(null);
    setShowCreateForm(true);
  };

  const handleDeleteBlock = async (id: string) => {
    const target = timeBlocks.find((block) => block.id === id);
    const label = normalizeLabel(target?.label) ?? "time block";
    const confirmed = window.confirm(
      `Delete ${label}? This will remove it from every day type.`
    );
    if (!confirmed) return;
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
      setBlockEnergy((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockLocation((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockType((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowAllHabitTypes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowAllSkills((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowAllMonuments((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowedHabitTypes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowedSkillIds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBlockAllowedMonumentIds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setConstraintsTarget((prev) => (prev?.id === id ? null : prev));
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

  const handleConstraintsClick = (block: TimeBlock) => {
    setConstraintsTarget(block);
    setMenuOpenId(null);
  };

  const selectedBlocks = useMemo(
    () => timeBlocks.filter((block) => selectedIds.has(block.id)),
    [selectedIds, timeBlocks]
  );

  const previewSegments = useMemo(() => {
    const segments = selectedBlocks.flatMap((block) =>
      blockToSegments(block).map((segment) => ({
        ...segment,
        blockType: blockType.get(block.id) ?? "FOCUS",
      }))
    );
    const sorted = [...segments].sort((a, b) => a.startMin - b.startMin);
    const overlaps = new Set<string>();
    let last = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
      const current = sorted[i];
      if (current.startMin < last.endMin) {
        overlaps.add(current.id);
        overlaps.add(last.id);
        if (current.endMin > last.endMin) {
          last = current;
        }
      } else {
        last = current;
      }
    }
    return segments.map((segment) => ({
      ...segment,
      overlapped: overlaps.has(segment.id),
    }));
  }, [blockType, selectedBlocks]);

  const coverageStatus: CoverageStatus = useMemo(() => {
    const segments = selectedBlocks
      .flatMap((block) => blockToSegments(block))
      .map(({ startMin, endMin }) => ({ start: startMin, end: endMin }))
      .sort((a, b) => a.start - b.start);

    if (segments.length === 0) {
      return { ok: false, reason: "Add time blocks to cover the full 24 hours." };
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
      return { ok: false, reason: `Ends at ${minutesToLabel(cursor)} — fill to 24h.` };
    }
    return { ok: true };
  }, [selectedBlocks]);

  const meetsDefaultDayRequirement = !isDefault || (selectedDays.size > 0 && conflictingSelectedDays.size === 0);

  const canSaveDayType =
    Boolean(dayTypeName.trim()) && coverageStatus.ok && meetsDefaultDayRequirement;

  const handleSaveDayType = useCallback(async () => {
    if (!canSaveDayType) return;
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
        setSaveMessage("You must be signed in to save a day type.");
        return;
      }

      const name = dayTypeName.trim();

      const insertWhitelists = async (
        links: Array<{ id?: string | null; time_block_id?: string | null }>
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
          const allowHabits = blockAllowAllHabitTypes.get(blockId) ?? true;
          const allowSkills = blockAllowAllSkills.get(blockId) ?? true;
          const allowMonuments = blockAllowAllMonuments.get(blockId) ?? true;

          if (!allowHabits) {
            const allowed = blockAllowedHabitTypes.get(blockId) ?? new Set<string>();
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
            const allowed = blockAllowedSkillIds.get(blockId) ?? new Set<string>();
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
            const allowed = blockAllowedMonumentIds.get(blockId) ?? new Set<string>();
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

        const { error: deleteLinksError } = await supabase
          .from("day_type_time_blocks")
          .delete()
          .eq("day_type_id", selectedDayTypeId);
        if (deleteLinksError) throw deleteLinksError;

        const blockIds = Array.from(selectedIds);
        const resolvedLocations = await resolveLocationIdsForBlocks({
          supabase,
          userId: user.id,
          blockIds,
          blockLocations: blockLocation,
          selectableLocations,
        });
        if (blockIds.length > 0) {
          const payload = blockIds.map((id) => {
            const energy = energyById.get(id) ?? "NO";
            return {
              user_id: user.id,
              day_type_id: selectedDayTypeId,
              time_block_id: id,
              energy,
              block_type: blockType.get(id) ?? "FOCUS",
              location_context_id: resolvedLocations.get(id) ?? null,
              allow_all_habit_types: blockAllowAllHabitTypes.get(id) ?? true,
              allow_all_skills: blockAllowAllSkills.get(id) ?? true,
              allow_all_monuments: blockAllowAllMonuments.get(id) ?? true,
            };
          });

          const { data: linksInserted, error: linkError } = await supabase
            .from("day_type_time_blocks")
            .insert(payload)
            .select("id,time_block_id");
          if (linkError) throw linkError;

          if (linksInserted) {
            await insertWhitelists(linksInserted as { id?: string | null; time_block_id?: string | null }[]);
          }
          syncResolvedLocations(blockIds, resolvedLocations);
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
        setConstraintsTarget(null);
        setMenuOpenId(null);
        setCreateError(null);
        setCreateState(DEFAULT_FORM);
        setIsCreatingDayType(false);
        setIsEditingExisting(false);
        setShowCreateForm(false);
        setSaveMessage("Day type updated.");
      } else {
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
          blockIds,
          blockLocations: blockLocation,
          selectableLocations,
        });
        if (blockIds.length > 0) {
          const payload = blockIds.map((id) => {
            const energy = energyById.get(id) ?? "NO";
            return {
              user_id: user.id,
              day_type_id: inserted.id,
              time_block_id: id,
              energy,
              block_type: blockType.get(id) ?? "FOCUS",
              location_context_id: resolvedLocations.get(id) ?? null,
              allow_all_habit_types: blockAllowAllHabitTypes.get(id) ?? true,
              allow_all_skills: blockAllowAllSkills.get(id) ?? true,
              allow_all_monuments: blockAllowAllMonuments.get(id) ?? true,
            };
          });

          const { data: linksInserted, error: linkError } = await supabase
            .from("day_type_time_blocks")
            .insert(payload)
            .select("id,time_block_id");
          if (linkError) throw linkError;

        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, new Set(blockIds));
          return next;
        });

          if (linksInserted) {
            await insertWhitelists(linksInserted as { id?: string | null; time_block_id?: string | null }[]);
          }
          syncResolvedLocations(blockIds, resolvedLocations);
        }

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
        setConstraintsTarget(null);
        setMenuOpenId(null);
        setCreateError(null);
        setCreateState(DEFAULT_FORM);
        setIsCreatingDayType(false);
        setIsEditingExisting(false);
        setShowCreateForm(false);

        setSaveMessage("Day type saved.");
      }
    } catch (err) {
      console.error(err);
      setSaveMessage("Unable to save day type right now.");
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
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
          <div className="flex items-center justify-between">
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:border-white/25 hover:bg-white/10"
            >
              ← Back to schedule
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold uppercase tracking-[0.22em]">
              DAY TYPES
            </h1>
            <p className="text-sm text-white/60">
              Shape your day by selecting time blocks and previewing the flow at a glance.
            </p>
          </div>

          <section className="space-y-3">
            {isCreatingDayType ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_16px_32px_rgba(0,0,0,0.28)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 sm:flex-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    DAY TYPE
                  </span>
                  <span className="text-sm text-white/60">Define a new 24-hour template.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingDayType(false);
                    setShowCreateForm(false);
                    setSaveMessage(null);
                    setIsEditingExisting(false);
                    setEditingBlockId(null);
                    setConstraintsTarget(null);
                    setMenuOpenId(null);
                    setCreateError(null);
                    setCreateState(DEFAULT_FORM);
                    if (selectedDayTypeId) {
                      const current = dayTypes.find((dt) => dt.id === selectedDayTypeId);
                      if (current) {
                        setDayTypeName(current.name);
                        setIsDefault(current.is_default);
                        setSchedulerMode(current.scheduler_mode ?? "REGULAR");
                      }
                    } else {
                      setSchedulerMode("REGULAR");
                    }
                  }}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/85 transition hover:border-white/25 hover:bg-white/15"
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
                  className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none"
                />
                <div className="mt-2 text-sm">
                  {coverageStatus.ok ? (
                    <span className="text-emerald-200/80">Covers full 24 hours.</span>
                  ) : (
                    <span className="text-amber-200/80">{coverageStatus.reason}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 items-start gap-3 sm:items-center">
                  <div className="flex flex-col gap-2">
                    <label
                      className={cn(
                        "flex items-center gap-2 text-sm text-white/80",
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
                        className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:ring-white"
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
                              onClick={() =>
                                setSelectedDays((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(day.key)) {
                                    next.delete(day.key);
                                  } else {
                                    next.add(day.key);
                                  }
                                  return next;
                                })
                              }
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold transition",
                                conflict && active
                                  ? "border-red-400/80 bg-red-500/25 text-red-50"
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
                      <span className="text-xs text-amber-200/80">Pick at least one day for this default.</span>
                    ) : null}
                    {isDefault && conflictingSelectedDays.size > 0 ? (
                      <span className="text-xs text-red-200/80">
                        Remove red days — they are used by another default day type.
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="w-full min-w-[220px] sm:w-[260px]">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/60">
                        <span>Scheduler mode</span>
                        <span className="text-[9px] text-white/40">per day type</span>
                      </div>
                      <Select
                        value={schedulerMode}
                        onValueChange={(next) => setSchedulerMode(normalizeSchedulerMode(next))}
                        disabled={!isCreatingDayType}
                      >
                        <SelectTrigger className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-left text-sm font-semibold text-white/85 hover:border-white/25 focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#0F0F15]/95 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] p-0">
                          {SCHEDULER_MODE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              label={option.label}
                              className="text-sm text-white focus:bg-white/10 focus:text-white"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold">{option.label}</span>
                                <span className="text-[11px] text-white/60">{option.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    <p className="mt-1 text-[11px] text-white/50">
                      Applied automatically whenever this day type is used.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveDayType}
                    disabled={!isCreatingDayType || !canSaveDayType || saving}
                    className={cn(
                      "w-full min-w-[220px] rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 transition sm:w-auto",
                      isCreatingDayType
                        ? "bg-white/15 hover:border-white/25 hover:bg-white/20"
                        : "bg-white/10 opacity-60",
                      "disabled:opacity-50"
                    )}
                  >
                      {saving ? "Saving…" : isDefault ? "Save default day type" : "Save day type"}
                    </button>
                  {saveMessage ? (
                    <span className="text-xs text-white/60">{saveMessage}</span>
                  ) : null}
                  </div>
              </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    DAY TYPE
                  </div>
                  <button
                    type="button"
                  onClick={() => {
                    setIsCreatingDayType(true);
                    const availableForNewDefault = DAYS_OF_WEEK.filter((day) => !dayOwnership.get(day.key)).map(
                      (day) => day.key
                    );
                    const nextIsDefault = availableForNewDefault.length > 0;
                    setSelectedDayTypeId(null);
                    setSelectedIds(new Set());
                    setDayTypeName("");
                    setSchedulerMode("REGULAR");
                    setIsDefault(nextIsDefault);
                    setSelectedDays(nextIsDefault ? new Set(availableForNewDefault) : new Set());
                    setSaveMessage(null);
                    setIsEditingExisting(false);
                  }}
                    className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/85 transition hover:border-white/25 hover:bg-white/15"
                  >
                    Create day type
                  </button>
                </div>
              </div>
            )}

            {dayTypes.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">
                    Created day types
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
                      Edit day type
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
                          setIsCreatingDayType(false);
                          setShowCreateForm(false);
                          setSaveMessage(null);
                          setEditingBlockId(null);
                          setConstraintsTarget(null);
                          setMenuOpenId(null);
                          setCreateError(null);
                          setCreateState(DEFAULT_FORM);
                          setSelectedDayTypeId(dt.id);
                          const mapped = dayTypeBlockMap.get(dt.id);
                          setSelectedIds(new Set(mapped ?? []));
                          setSchedulerMode(dt.scheduler_mode ?? "REGULAR");
                          const defaults = dt.days
                            .map((n) => DAY_INDEX_TO_KEY[n])
                            .filter((d): d is string => Boolean(d));
                          setSelectedDays(new Set(defaults ?? []));
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                          active
                            ? "border-white/40 bg-white/15 text-white shadow-[0_10px_24px_rgba(0,0,0,0.3)]"
                            : "border-white/12 bg-white/[0.04] text-white/80 hover:border-white/20 hover:bg-white/10"
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

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                24H PREVIEW
              </h2>
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                guide only
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_16px_32px_rgba(0,0,0,0.28)]">
              <div className="flex items-start gap-4">
                <div className="relative h-80 w-12 text-[10px] uppercase tracking-[0.14em] text-white/50">
                  {HOURS.map((hour) => (
                    <span
                      key={`label-${hour}`}
                      className="absolute right-1 translate-y-[-50%]"
                      style={{ top: `${(hour / 24) * 100}%` }}
                      aria-hidden
                    >
                      {formatHourLabel(hour)}
                    </span>
                  ))}
                </div>
                <div className="relative h-80 flex-1 overflow-hidden rounded-lg border border-white/10 bg-black/25">
                  {HOURS.map((hour) => (
                    <div
                      key={`rail-${hour}`}
                      className={cn(
                        "absolute left-0 right-0 h-px",
                        hour % 6 === 0 ? "bg-white/15" : "bg-white/8"
                      )}
                      style={{ top: `${(hour / 24) * 100}%` }}
                      aria-hidden
                    />
                  ))}
                  {previewSegments.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                      Select time blocks to preview your day.
                    </div>
                  ) : null}
                  {previewSegments.map((segment) => {
                    const heightPct = ((segment.endMin - segment.startMin) / 1440) * 100;
                    const topPct = (segment.startMin / 1440) * 100;
                    const isBreak = segment.blockType === "BREAK";
                    const isPractice = segment.blockType === "PRACTICE";
                    return (
                      <div
                        key={`bar-${segment.id}`}
                        className={cn(
                          "absolute inset-x-3 rounded-md shadow-[0_14px_38px_rgba(0,0,0,0.35)]",
                          segment.overlapped
                            ? "border border-red-400/70 bg-red-500/25"
                            : isBreak
                              ? "border border-sky-300/70 bg-sky-400/20"
                              : isPractice
                                ? "border border-white/12 bg-white/10"
                                : "border border-white/15 bg-white/15"
                        )}
                        style={{
                          top: `${topPct}%`,
                          height: `${Math.max(heightPct, 1.5)}%`,
                        }}
                      >
                        <div className="flex h-full items-center justify-between px-3 text-[11px] uppercase tracking-[0.14em] text-white/80">
                          <span
                            className={cn(
                              "font-semibold",
                              segment.overlapped
                                ? "text-red-50"
                                : isBreak
                                  ? "text-sky-50"
                                  : isPractice
                                    ? "text-white/80"
                                    : "text-white"
                            )}
                          >
                            {segment.label}
                          </span>
                          <span
                            className={
                              segment.overlapped
                                ? "text-red-100/80"
                                : isBreak
                                  ? "text-sky-100/75"
                                  : isPractice
                                    ? "text-white/60"
                                    : "text-white/55"
                            }
                          >
                            {segment.title.replace(`${segment.label} `, "")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {isCreatingDayType ? (
            <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                TIME BLOCKS
              </h2>
              {hasBlocks ? (
                <button
                  type="button"
                  onClick={startCreateBlock}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/20 hover:bg-white/10"
                >
                  Create time block
                </button>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                {error}
              </div>
            ) : null}

            {!hasBlocks ? (
              <div className="rounded-2xl border border-white/10 bg-[var(--surface-elevated)]/70 p-6 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                <div className="space-y-2 text-center">
                  <h3 className="text-lg font-semibold text-white">No time blocks yet</h3>
                  <p className="text-sm text-white/60">
                    Create a few blocks to form the skeleton of your day.
                  </p>
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={startCreateBlock}
                      className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-white/20 hover:bg-white/15"
                    >
                      Create time block
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {showCreateForm ? (
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-black/30 p-5 shadow-[0_20px_48px_rgba(0,0,0,0.35)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                      {isEditingBlock ? "Edit time block" : "New time block"}
                    </div>
                    {isEditingBlock ? (
                      <div className="text-xs text-white/60">
                        Updating {normalizeLabel(createState.label) ?? "time block"}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetBlockForm}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmitBlock}
                      disabled={savingBlock}
                      className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20 disabled:opacity-60"
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
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
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
                      placeholder="Focus block"
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white placeholder:text-white/35 transition group-hover:border-white/20 group-focus-within:border-white/25 focus:outline-none"
                    />
                  </label>
                  <TimeInput
                    label="Start time"
                    ariaLabel="Start time"
                    value={createState.start_local}
                    onChange={(next) => setCreateState((prev) => ({ ...prev, start_local: next }))}
                    helper="HH:MM — we’ll handle overnight."
                  />
                  <TimeInput
                    label="End time"
                    ariaLabel="End time"
                    value={createState.end_local}
                    onChange={(next) => setCreateState((prev) => ({ ...prev, end_local: next }))}
                    helper="Ends before start? We wrap past midnight."
                  />
                </div>
                {createError ? (
                  <div className="mt-3 text-sm text-red-200">{createError}</div>
                ) : null}
              </div>
            ) : null}

            {hasBlocks ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {timeBlocks.map((block) => {
                  const selected = selectedIds.has(block.id);
                  const label = normalizeLabel(block.label) ?? "TIME BLOCK";
                  const energyLevel = blockEnergy.get(block.id) ?? "NO";
                  const locationOption = blockLocation.get(block.id);
                  const allowAllHabits = blockAllowAllHabitTypes.get(block.id) ?? true;
                  const allowAllSkills = blockAllowAllSkills.get(block.id) ?? true;
                  const allowAllMonuments = blockAllowAllMonuments.get(block.id) ?? true;
                  const allowedHabitTypes = blockAllowedHabitTypes.get(block.id) ?? new Set<string>();
                  const allowedSkillIds = blockAllowedSkillIds.get(block.id) ?? new Set<string>();
                  const allowedMonumentIds =
                    blockAllowedMonumentIds.get(block.id) ?? new Set<string>();
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
                      className={cn(
                        "flex w-full flex-col gap-3 rounded-2xl border px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition",
                        "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/10",
                        selected && "border-white/30 bg-white/10"
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
                                beginEditBlock(block);
                                setMenuOpenId(null);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit block
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="flex items-center gap-2 focus:bg-white/10 focus:text-white"
                              onSelect={(event) => {
                                event.preventDefault();
                                handleConstraintsClick(block);
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
                                handleDeleteBlock(block.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingId === block.id ? "Deleting…" : "Delete"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleSelect(block.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleSelect(block.id);
                            }
                          }}
                          className="flex flex-1 items-center justify-between text-left focus:outline-none"
                          aria-pressed={selected}
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-white/90">{label}</div>
                            <div className="text-xs uppercase tracking-[0.18em] text-white/50">
                              {block.start_local} → {block.end_local}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-white/45">
                              <MapPin className="h-3 w-3 text-white/55" />
                              <span className="truncate">
                                {(locationOption?.label || locationOption?.value || "Anywhere").toString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                cycleEnergy(block.id);
                              }}
                              className="rounded-md bg-white/5 px-1 py-0.5 text-white/70 transition hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/30"
                              aria-label={`Cycle energy for ${label}`}
                            >
                              <FlameEmber level={energyLevel} size="sm" />
                            </button>
                            <span
                              className={cn(
                                "ml-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold",
                                selected ? "bg-white/60 text-black" : "bg-transparent text-white/50"
                              )}
                              aria-hidden="true"
                            >
                              {selected ? "✓" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      {constraintsTarget?.id === block.id ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 shadow-[0_10px_28px_rgba(0,0,0,0.3)]">
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
                                    value={(blockType.get(block.id) ?? "FOCUS") as BlockType}
                                    onValueChange={(value) => {
                                      setBlockType((prev) => {
                                        const next = new Map(prev);
                                        next.set(block.id, value as BlockType);
                                        return next;
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none">
                                      <SelectValue placeholder="Block type" />
                                    </SelectTrigger>
                                    <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                                      {BLOCK_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                          {BLOCK_TYPE_LABEL[type]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/60">
                                    <MapPin className="h-4 w-4 text-white/70" />
                                    <span>Location context</span>
                                  </div>
                                  <Select
                                    value={(blockLocation.get(block.id)?.id ?? "ANY") as string}
                                    onValueChange={(value) => {
                                      if (value === "ANY") {
                                        updateLocationForBlock(block.id, null);
                                        return;
                                      }
                                      const match =
                                        selectableLocations.find((opt) => opt.id === value) ??
                                        selectableLocations.find(
                                          (opt) => normalizeLocationValue(opt.value) === normalizeLocationValue(value)
                                        );

                                      if (match) {
                                        updateLocationForBlock(block.id, match);
                                      } else {
                                        const normalized = normalizeLocationValue(value) ?? value;
                                        updateLocationForBlock(block.id, {
                                          id: value,
                                          value: normalized,
                                          label: match?.label ?? value,
                                        });
                                      }
                                    }}
                                    disabled={loadingLocations}
                                  >
                                    <SelectTrigger className="w-full rounded-lg border border-white/10 bg-black/30 text-left text-white focus:outline-none">
                                      <SelectValue placeholder="Anywhere" />
                                    </SelectTrigger>
                                    <SelectContent className="border border-white/10 bg-[#0f111a]/95 text-white shadow-xl backdrop-blur">
                                      <SelectItem value="ANY">Anywhere</SelectItem>
                                      {selectableLocations
                                        .filter((opt) => opt.value !== "ANY")
                                        .map((opt) => (
                                          <SelectItem key={opt.id} value={opt.id}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
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
                                            const next = new Map(prev);
                                            next.set(block.id, event.target.checked);
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
                                                  const next = new Map(prev);
                                                  const set = new Set(next.get(block.id) ?? []);
                                                  if (set.has(option.value)) {
                                                    set.delete(option.value);
                                                  } else {
                                                    set.add(option.value);
                                                  }
                                                  next.set(block.id, set);
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
                                        <div className="text-xs text-amber-200/80">
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
                                            const next = new Map(prev);
                                            next.set(block.id, event.target.checked);
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
                                          <div className="grid gap-1">
                                            {filteredSkills.map((skill) => {
                                              const selectedSkill = allowedSkillIds.has(skill.id);
                                              return (
                                                <button
                                                  key={skill.id}
                                                  type="button"
                                                  onClick={() =>
                                                    setBlockAllowedSkillIds((prev) => {
                                                      const next = new Map(prev);
                                                      const set = new Set(next.get(block.id) ?? []);
                                                      if (set.has(skill.id)) {
                                                        set.delete(skill.id);
                                                      } else {
                                                        set.add(skill.id);
                                                      }
                                                      next.set(block.id, set);
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
                                            })}
                                          </div>
                                        )}
                                      </div>
                                      {allowedSkillIds.size === 0 ? (
                                        <div className="text-xs text-amber-200/80">
                                          Nothing allowed in this block for skills.
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
                                          const next = new Map(prev);
                                          next.set(block.id, event.target.checked);
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
                                                    const next = new Map(prev);
                                                    const set = new Set(next.get(block.id) ?? []);
                                                    if (set.has(monument.id)) {
                                                      set.delete(monument.id);
                                                    } else {
                                                      set.add(monument.id);
                                                    }
                                                    next.set(block.id, set);
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
                                      <div className="text-xs text-amber-200/80">
                                        Nothing allowed in this block for monuments.
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setConstraintsTarget(null)}
                              className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 transition hover:border-white/25 hover:bg-white/15"
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
          ) : null}
        </div>
      </main>
    </ProtectedRoute>
  );
}
