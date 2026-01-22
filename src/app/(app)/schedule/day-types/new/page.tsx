"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ChevronUp, ChevronDown, MoreVertical, Pencil, Trash2, Wand2, MapPin } from "lucide-react";
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
};

type DayTypeBlockLink = {
  day_type_id: string;
  time_block_id: string;
  energy?: FlameLevel | null;
  block_type?: BlockType | null;
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
  const [loading, setLoading] = useState(false);
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

  const FLAME_LEVELS = ENERGY.LIST as FlameLevel[];
  const isEditingBlock = Boolean(editingBlockId);
  const hasBlocks = timeBlocks.length > 0;
  const constraintLabel = useMemo(
    () => (constraintsTarget ? normalizeLabel(constraintsTarget.label) ?? "TIME BLOCK" : null),
    [constraintsTarget]
  );
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
  }, []);

  const cycleEnergy = (id: string) => {
    setBlockEnergy((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? "NO";
      const idx = FLAME_LEVELS.indexOf(current);
      const nextLevel = FLAME_LEVELS[(idx + 1) % FLAME_LEVELS.length];
      next.set(id, nextLevel);
      return next;
    });
  };

  const updateLocationForBlock = (blockId: string, option: LocationContextOption | null) => {
    setBlockLocation((prev) => {
      const next = new Map(prev);
      next.set(blockId, option);
      return next;
    });
  };

  const makeId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const loadBlocks = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
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
        .select("id,name,is_default,days")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (fetchError) throw fetchError;
      const normalized = (data as DayType[] | null)?.map((dt) => ({
        ...dt,
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
          "day_type_id,time_block_id,energy,block_type,location_context_id,location_context:location_contexts(value,label)"
        )
        .eq("user_id", user.id);
      if (fetchError) throw fetchError;
      const next = new Map<string, Set<string>>();
      const energyMap = new Map<string, FlameLevel>();
      const locationMap = new Map<string, LocationContextOption | null>();
      const typeMap = new Map<string, BlockType>();
      (data as DayTypeBlockLink[] | null)?.forEach((row) => {
        const existing = next.get(row.day_type_id) ?? new Set<string>();
        existing.add(row.time_block_id);
        next.set(row.day_type_id, existing);
        const level = (row.energy as FlameLevel | undefined) ?? "NO";
        energyMap.set(row.time_block_id, level);
        const type = (row.block_type as BlockType | undefined) ?? "FOCUS";
        typeMap.set(row.time_block_id, type);
        if (row.location_context_id) {
          const value =
            typeof (row as any)?.location_context?.value === "string"
              ? (row as any).location_context.value.trim().toUpperCase()
              : null;
          const label =
            typeof (row as any)?.location_context?.label === "string"
              ? (row as any).location_context.label.trim()
              : value;
          locationMap.set(row.time_block_id, {
            id: row.location_context_id,
            value: value ?? row.location_context_id,
            label: label ?? row.location_context_id,
          });
        } else {
          locationMap.set(row.time_block_id, null);
        }
      });
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
      setDayTypeBlockMap(next);
    } catch (err) {
      console.error(err);
      setDayTypeBlockMap(new Map());
    }
  }, [supabase]);

  useEffect(() => {
    void loadBlocks();
    void loadDayTypes();
    void loadDayTypeBlockLinks();
  }, [loadBlocks, loadDayTypes, loadDayTypeBlockLinks]);

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
      const defaults = defaultType.days.map((n) => DAY_INDEX_TO_KEY[n]).filter((d): d is string => Boolean(d));
      setSelectedDays(new Set(defaults));
      return;
    }
    if (dayTypes.length === 0) {
      setSelectedDayTypeId(null);
      setDayTypeName("");
      setIsDefault(true);
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
          })
          .eq("id", selectedDayTypeId)
          .select("id,is_default,days")
          .single();

        if (updateError) throw updateError;

        const { error: deleteLinksError } = await supabase
          .from("day_type_time_blocks")
          .delete()
          .eq("day_type_id", selectedDayTypeId);
        if (deleteLinksError) throw deleteLinksError;

        const blockIds = Array.from(selectedIds);
        const locationCache = new Map<string, string | null>();
        const resolveLocationIds = async () => {
          const result = new Map<string, string | null>();
          for (const blockId of blockIds) {
            const option = blockLocation.get(blockId);
            const normalized = normalizeLocationValue(option?.value ?? option?.label ?? null);
            if (!normalized) {
              result.set(blockId, null);
              continue;
            }
            if (locationCache.has(normalized)) {
              result.set(blockId, locationCache.get(normalized) ?? null);
              continue;
            }
            const resolved = await resolveLocationContextId(supabase, user.id, normalized);
            locationCache.set(normalized, resolved);
            result.set(blockId, resolved);
          }
          return result;
        };

        const resolvedLocations = await resolveLocationIds();
        if (blockIds.length > 0) {
          const payload = blockIds.map((id) => ({
            user_id: user.id,
            day_type_id: selectedDayTypeId,
            time_block_id: id,
            energy: blockEnergy.get(id) ?? "NO",
            block_type: blockType.get(id) ?? "FOCUS",
            location_context_id: resolvedLocations.get(id) ?? null,
          }));

          const { error: linkError } = await supabase.from("day_type_time_blocks").insert(payload);
          if (linkError) throw linkError;
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
          })
          .select("id,is_default,days")
          .single();

        if (insertError) throw insertError;

        const blockIds = Array.from(selectedIds);
        const locationCache = new Map<string, string | null>();
        const resolveLocationIds = async () => {
          const result = new Map<string, string | null>();
          for (const blockId of blockIds) {
            const option = blockLocation.get(blockId);
            const normalized = normalizeLocationValue(option?.value ?? option?.label ?? null);
            if (!normalized) {
              result.set(blockId, null);
              continue;
            }
            if (locationCache.has(normalized)) {
              result.set(blockId, locationCache.get(normalized) ?? null);
              continue;
            }
            const resolved = await resolveLocationContextId(supabase, user.id, normalized);
            locationCache.set(normalized, resolved);
            result.set(blockId, resolved);
          }
          return result;
        };
        const resolvedLocations = await resolveLocationIds();
        if (blockIds.length > 0) {
          const payload = blockIds.map((id) => ({
            user_id: user.id,
            day_type_id: inserted.id,
            time_block_id: id,
            energy: blockEnergy.get(id) ?? "NO",
            block_type: blockType.get(id) ?? "FOCUS",
            location_context_id: resolvedLocations.get(id) ?? null,
          }));

          const { error: linkError } = await supabase.from("day_type_time_blocks").insert(payload);
          if (linkError) throw linkError;

        setDayTypeBlockMap((prev) => {
          const next = new Map(prev);
          next.set(inserted.id, new Set(blockIds));
          return next;
        });
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
            },
          ];
          return nextDayTypes;
        });
        setHasDefaultDayType(nextDayTypes.some((dt) => dt.is_default && dt.days.length > 0));
        setSelectedDayTypeId(inserted.id);
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
  }, [canSaveDayType, dayTypeName, dayTypes, isDefault, isEditingExisting, selectedDayTypeId, selectedDays, selectedIds, supabase]);

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
                      }
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
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleSaveDayType}
                      disabled={!isCreatingDayType || !canSaveDayType || saving}
                    className={cn(
                      "rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 transition",
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
                  const typeValue = blockType.get(block.id) ?? "FOCUS";
                  const locationOption = blockLocation.get(block.id);
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
                            <div className="space-y-3">
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
                                        selectableLocations.find((opt) => opt.value === value);
                                      updateLocationForBlock(block.id, match ?? null);
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
