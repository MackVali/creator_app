"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase";
import { ChevronUp, ChevronDown } from "lucide-react";

type TimeBlock = {
  id: string;
  label?: string | null;
  start_local: string;
  end_local: string;
};

type PreviewSegment = {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  title: string;
};

const HOURS = Array.from({ length: 25 }, (_, idx) => idx);

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
    },
    {
      id: `${block.id}-b`,
      startMin: 0,
      endMin: end,
      label,
      title,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createState, setCreateState] = useState(DEFAULT_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dayTypeName, setDayTypeName] = useState("Default day");
  const [hasDefaultDayType, setHasDefaultDayType] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasBlocks = timeBlocks.length > 0;

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
        .select("id,label,start_local,end_local")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (fetchError) throw fetchError;
      const normalized = (data ?? []).map((block) => ({
        ...block,
        label: normalizeLabel(block.label),
        start_local: normalizeTimeLabel(block.start_local),
        end_local: normalizeTimeLabel(block.end_local),
      })) as TimeBlock[];
      setTimeBlocks(normalized);
    } catch (err) {
      console.error(err);
      setError("Unable to load time blocks right now.");
      setTimeBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    if (!hasBlocks) {
      setShowCreateForm(true);
    }
  }, [hasBlocks]);

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

  const handleCreate = async () => {
    setCreateError(null);
    const start = parseTimeToMinutes(createState.start_local);
    const end = parseTimeToMinutes(createState.end_local);
    if (start === null || end === null) {
      setCreateError("Please enter start and end times as HH:MM.");
      return;
    }
    setCreating(true);
    try {
      const optimistic: TimeBlock = {
        id: makeId(),
        label: normalizeLabel(createState.label) ?? "TIME BLOCK",
        start_local: normalizeTimeLabel(createState.start_local),
        end_local: normalizeTimeLabel(createState.end_local),
      };

      if (!supabase) {
        setTimeBlocks((prev) => [...prev, optimistic]);
        setSelectedIds((prev) => new Set(prev).add(optimistic.id));
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
          .select("id,label,start_local,end_local")
          .single();
        if (insertError) throw insertError;
        const insertedRaw = (data as TimeBlock) ?? optimistic;
        const inserted = {
          ...insertedRaw,
          label: normalizeLabel(insertedRaw.label) ?? "TIME BLOCK",
          start_local: normalizeTimeLabel(insertedRaw.start_local),
          end_local: normalizeTimeLabel(insertedRaw.end_local),
        };
        setTimeBlocks((prev) => [...prev, inserted]);
        setSelectedIds((prev) => new Set(prev).add(inserted.id));
      }

      setCreateState(DEFAULT_FORM);
      setShowCreateForm(false);
    } catch (err) {
      console.error(err);
      setCreateError("Unable to create time block. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const selectedBlocks = useMemo(
    () => timeBlocks.filter((block) => selectedIds.has(block.id)),
    [selectedIds, timeBlocks]
  );

  const previewSegments = useMemo(() => {
    return selectedBlocks.flatMap((block) => blockToSegments(block));
  }, [selectedBlocks]);

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

  const canSaveDayType =
    Boolean(dayTypeName.trim()) &&
    coverageStatus.ok &&
    (!hasDefaultDayType || isDefault);

  const handleSaveDayType = useCallback(async () => {
    if (!canSaveDayType) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      // TODO: replace stub with real API once day_types table is available
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (isDefault) {
        setHasDefaultDayType(true);
        setIsDefault(false);
      }
      setSaveMessage("Day type saved (stub). Connect backend to persist.");
    } catch (err) {
      console.error(err);
      setSaveMessage("Unable to save day type right now.");
    } finally {
      setSaving(false);
    }
  }, [canSaveDayType, isDefault]);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-gray-950 text-white">
        <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold uppercase tracking-[0.22em]">
              DAY TYPES
            </h1>
            <p className="text-sm text-white/60">
              Shape your day by selecting time blocks and previewing the flow at a glance.
            </p>
          </div>

          <section className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_16px_32px_rgba(0,0,0,0.28)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                    DAY TYPE
                  </div>
                  <input
                    type="text"
                    value={dayTypeName}
                    onChange={(e) => setDayTypeName(e.target.value)}
                    placeholder="Default day"
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/20 focus:outline-none"
                  />
                  <div className="text-[12px] text-white/55">
                    A day type is a 24-hour set of time blocks. Fill the full day without overlaps.
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm text-white/80">
                  <label className={cn("flex items-center gap-2", hasDefaultDayType ? "opacity-70" : "")}>
                    <input
                      type="checkbox"
                      checked={isDefault || !hasDefaultDayType}
                      disabled={!hasDefaultDayType}
                      onChange={(e) => setIsDefault(e.target.checked)}
                      className="h-4 w-4 rounded border-white/30 bg-black/30 text-white focus:ring-white"
                    />
                    <span className="text-xs uppercase tracking-[0.14em]">Set as default</span>
                  </label>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveDayType}
                  disabled={!canSaveDayType || saving}
                  className={cn(
                    "rounded-full border border-white/15 bg-white/15 px-4 py-2 text-sm font-semibold text-white/90 transition",
                    "hover:border-white/25 hover:bg-white/20 disabled:opacity-50"
                  )}
                >
                  {saving ? "Saving…" : hasDefaultDayType ? "Save day type" : "Save default day type"}
                </button>
                {coverageStatus.ok ? (
                  <span className="text-xs text-emerald-200/80">Covers full 24 hours.</span>
                ) : (
                  <span className="text-xs text-amber-200/80">{coverageStatus.reason}</span>
                )}
                {saveMessage ? (
                  <span className="text-xs text-white/60">{saveMessage}</span>
                ) : null}
              </div>
            </div>
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
              {previewSegments.length === 0 ? (
                <div className="text-sm text-white/60">Select time blocks to preview your day.</div>
              ) : (
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
                    {previewSegments.map((segment) => {
                      const heightPct = ((segment.endMin - segment.startMin) / 1440) * 100;
                      const topPct = (segment.startMin / 1440) * 100;
                      return (
                        <div
                          key={`bar-${segment.id}`}
                          className="absolute inset-x-3 rounded-md border border-white/15 bg-white/15 shadow-[0_14px_38px_rgba(0,0,0,0.35)]"
                          style={{
                            top: `${topPct}%`,
                            height: `${Math.max(heightPct, 1.5)}%`,
                          }}
                        >
                          <div className="flex h-full items-center justify-between px-3 text-[11px] uppercase tracking-[0.14em] text-white/80">
                            <span className="font-semibold text-white">{segment.label}</span>
                            <span className="text-white/55">
                              {segment.title.replace(`${segment.label} `, "")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
                TIME BLOCKS
              </h2>
              {hasBlocks ? (
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
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
                      onClick={() => setShowCreateForm(true)}
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
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                      New time block
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setCreateError(null);
                        setCreateState(DEFAULT_FORM);
                      }}
                      className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={creating}
                      className="rounded-full border border-white/20 bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/20 disabled:opacity-60"
                    >
                      {creating ? "Creating…" : "Add block"}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
                  <label className="group relative col-span-2 flex flex-col gap-1 text-sm text-white/70 sm:col-span-1">
                    <input
                      type="text"
                      value={createState.label}
                      onChange={(e) =>
                        setCreateState((prev) => ({ ...prev, label: e.target.value }))
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
                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => toggleSelect(block.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition",
                        "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/10",
                        selected && "border-white/30 bg-white/10"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-white/90">{label}</div>
                        <div className="text-xs uppercase tracking-[0.18em] text-white/50">
                          {block.start_local} → {block.end_local}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold",
                          selected ? "bg-white/60 text-black" : "bg-transparent text-white/50"
                        )}
                        aria-hidden="true"
                      >
                        {selected ? "✓" : ""}
                      </span>
                    </button>
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
