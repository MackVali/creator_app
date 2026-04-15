"use client";

import { KeyboardEvent, useMemo } from "react";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 25 }, (_, idx) => idx);

export type BlockType = "FOCUS" | "BREAK" | "PRACTICE";

export type DayType24hPreviewBlock = {
  id?: string;
  label?: string | null;
  start_local: string;
  end_local: string;
  blockType?: BlockType;
  hasConstraints?: boolean;
  opIndex?: number;
};

type PreviewSegment = {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  title: string;
  blockType: BlockType;
  overlapped: boolean;
  hasConstraints: boolean;
  rootId: string;
};

const formatHourLabel = (hour: number): string => {
  const safe = Math.min(Math.max(Math.floor(hour), 0), 24);
  const suffix = safe < 12 || safe === 24 ? "am" : "pm";
  const base = safe % 12 === 0 ? 12 : safe % 12;
  return `${base}${suffix}`;
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

function normalizeLabel(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

export function sortTimeBlocks<T extends { start_local: string; label?: string | null }>(
  blocks: T[]
): T[] {
  const score = (block: T) => parseTimeToMinutes(block.start_local) ?? 0;
  return [...blocks].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return (a.label ?? "").localeCompare(b.label ?? "");
  });
}

export function blockToSegments(block: {
  id?: string;
  label?: string | null;
  start_local: string;
  end_local: string;
}): PreviewSegment[] {
  const start = parseTimeToMinutes(block.start_local);
  const end = parseTimeToMinutes(block.end_local);
  if (start === null || end === null) return [];
  if (start === end) return [];
  const label = normalizeLabel(block.label) ?? "TIME BLOCK";
  const title = `${label} ${block.start_local} → ${block.end_local}`;
  const derivedRootId =
    block.id ??
    `${label}-${block.start_local}-${block.end_local}`.replace(/\s+/g, "-").toLowerCase();
  if (end > start) {
    return [
      {
        id: derivedRootId,
        startMin: start,
        endMin: end,
        label,
        title,
        overlapped: false,
        blockType: "FOCUS",
        hasConstraints: false,
        rootId: derivedRootId,
      },
    ];
  }
  return [
    {
      id: `${derivedRootId}-a`,
      startMin: start,
      endMin: 1440,
      label,
      title,
      overlapped: false,
      blockType: "FOCUS",
      hasConstraints: false,
      rootId: derivedRootId,
    },
    {
      id: `${derivedRootId}-b`,
      startMin: 0,
      endMin: end,
      label,
      title,
      overlapped: false,
      blockType: "FOCUS",
      hasConstraints: false,
      rootId: derivedRootId,
    },
  ];
}

function buildPreviewSegments(blocks: DayType24hPreviewBlock[]): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  blocks.forEach((block) => {
    const blockSegments = blockToSegments(block).map((segment) => ({
      ...segment,
      blockType: block.blockType ?? "FOCUS",
      hasConstraints: Boolean(block.hasConstraints),
    }));
    segments.push(...blockSegments);
  });

  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin);
  const overlaps = new Set<string>();
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (!last) {
      last = current;
      continue;
    }
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
}

export type DayType24hPreviewProps = {
  blocks: DayType24hPreviewBlock[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

export function DayType24hPreview({
  blocks,
  selectedId,
  onSelect,
}: DayType24hPreviewProps) {
  const previewSegments = useMemo(() => buildPreviewSegments(blocks), [blocks]);

  return (
    <div className="w-full overflow-x-hidden rounded-2xl border border-slate-300/15 bg-gradient-to-br from-slate-950/95 via-slate-900/85 to-slate-950/95 px-3 py-4 shadow-[0_20px_40px_rgba(2,6,23,0.45)]">
      <div className="flex items-start gap-4">
        <div className="relative h-[38vh] sm:h-[52vh] w-12 min-w-[3rem] text-[10px] uppercase tracking-[0.14em] text-slate-300/55">
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
        <div className="relative flex-1 h-[38vh] sm:h-[52vh] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-300/10 bg-slate-950/55 backdrop-blur-sm">
          {HOURS.map((hour) => (
            <div
              key={`rail-${hour}`}
              className={cn(
                "absolute left-0 right-0 h-px",
                hour % 6 === 0 ? "bg-slate-200/18" : "bg-slate-200/10"
              )}
              style={{ top: `${(hour / 24) * 100}%` }}
              aria-hidden
            />
          ))}
          {previewSegments.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-200/60">
              Select time blocks to preview your day.
            </div>
          ) : null}
          {previewSegments.map((segment) => {
            const heightPct = ((segment.endMin - segment.startMin) / 1440) * 100;
            const topPct = (segment.startMin / 1440) * 100;
            const isBreak = segment.blockType === "BREAK";
            const isPractice = segment.blockType === "PRACTICE";
            const isConstrained = !segment.overlapped && segment.hasConstraints;
            const isSelected = Boolean(
              selectedId &&
                (selectedId === segment.rootId || selectedId === segment.id)
            );
            const handleSelect = () => {
              if (!onSelect) return;
              onSelect(segment.rootId);
            };
            const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (!onSelect) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(segment.rootId);
              }
            };
            return (
              <div
                key={`bar-${segment.id}`}
                onClick={handleSelect}
                onKeyDown={handleKeyDown}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-pressed={isSelected || undefined}
                className={cn(
                  "absolute inset-x-3 rounded-md shadow-[0_14px_38px_rgba(2,6,23,0.45)] transition focus-visible:outline-none",
                  onSelect ? "cursor-pointer" : "",
                  isSelected
                    ? "border border-violet-300/55 bg-violet-300/18 text-violet-50"
                    : segment.overlapped
                      ? "border border-rose-300/70 bg-rose-500/25"
                      : isConstrained
                        ? "border border-cyan-300/70 bg-cyan-400/20"
                        : isBreak
                          ? "border border-indigo-300/65 bg-indigo-400/18"
                          : isPractice
                            ? "border border-slate-300/35 bg-slate-300/12"
                            : "border border-emerald-300/55 bg-emerald-400/18"
                )}
                style={{
                  top: `${topPct}%`,
                  height: `${Math.max(heightPct, 1.5)}%`,
                }}
              >
                <div className="flex h-full items-center justify-center px-3 text-[11px] uppercase tracking-[0.14em] text-slate-100/85">
                  <span
                    className={cn(
                      "font-semibold truncate",
                      segment.overlapped
                        ? "text-rose-50"
                        : isConstrained
                          ? "text-cyan-50"
                          : isBreak
                            ? "text-indigo-50"
                            : isPractice
                              ? "text-slate-100/85"
                              : "text-emerald-50"
                    )}
                  >
                    {segment.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
