"use client";

import { memo, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { Goal } from "../types";
// Lazy-load dropdown contents to reduce initial bundle and re-render cost
const ProjectsDropdown = dynamic(() => import("./ProjectsDropdown").then(m => m.ProjectsDropdown), {
  ssr: false,
  loading: () => (
    <div className="h-24 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
  ),
});
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import FlameEmber, { type FlameLevel } from "@/components/FlameEmber";

const energyAccent: Record<
  Goal["energy"],
  { dot: string; bar: string }
> = {
  No: {
    dot: "bg-slate-200",
    bar: "linear-gradient(90deg, rgba(148,163,184,0.7), rgba(71,85,105,0.3))",
  },
  Low: {
    dot: "bg-emerald-300",
    bar: "linear-gradient(90deg, rgba(74,222,128,0.8), rgba(13,148,136,0.3))",
  },
  Medium: {
    dot: "bg-sky-300",
    bar: "linear-gradient(90deg, rgba(56,189,248,0.8), rgba(99,102,241,0.35))",
  },
  High: {
    dot: "bg-amber-300",
    bar: "linear-gradient(90deg, rgba(251,191,36,0.85), rgba(249,115,22,0.4))",
  },
  Ultra: {
    dot: "bg-fuchsia-300",
    bar: "linear-gradient(90deg, rgba(244,114,182,0.9), rgba(168,85,247,0.4))",
  },
  Extreme: {
    dot: "bg-yellow-300",
    bar: "linear-gradient(90deg, rgba(250,204,21,0.9), rgba(244,63,94,0.45))",
  },
};

interface GoalCardProps {
  goal: Goal;
  onEdit?(): void;
  onToggleActive?(): void;
  onDelete?(): void;
  onBoost?(): void;
  showWeight?: boolean;
  showCreatedAt?: boolean;
  showEmojiPrefix?: boolean;
  variant?: "default" | "compact";
}

function GoalCardImpl({
  goal,
  onEdit,
  onToggleActive,
  onDelete,
  onBoost,
  showWeight = true,
  showCreatedAt = true,
  showEmojiPrefix = false,
  variant = "default",
}: GoalCardProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const energy = energyAccent[goal.energy];
  const createdAt = useMemo(() => {
    if (goal.createdAt) return new Date(goal.createdAt).toLocaleDateString();
    if (goal.updatedAt) return new Date(goal.updatedAt).toLocaleDateString();
    return null;
  }, [goal.createdAt, goal.updatedAt]);

  // Compact tile for dense mobile grids
  if (variant === "compact") {
    const energy = energyAccent[goal.energy];
    const progressPct = Math.max(0, Math.min(100, Number(goal.progress ?? 0)));
    const lightness = Math.round(88 - progressPct * 0.78); // 0% -> 88% (light gray), 100% -> ~10% (near black)
    const containerBase =
      "group relative h-full rounded-2xl ring-1 ring-white/10 bg-gradient-to-b from-white/[0.03] to-white/[0.015] p-3 text-white min-h-[104px] shadow-[0_10px_26px_-14px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]";
    const containerClass = open ? containerBase : `${containerBase} aspect-[5/6]`;
    return (
      <div className={containerClass}>
        {/* Subtle top sheen + edge glow */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.10),transparent_60%)]" />
        <div className="relative z-0 flex h-full min-w-0 flex-col items-stretch">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={`goal-${goal.id}`}
            className="flex flex-col items-center gap-1.5 min-w-0 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base font-semibold shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),_0_6px_12px_rgba(0,0,0,0.35)]">
              {goal.monumentEmoji ?? goal.emoji ?? goal.title.slice(0, 2)}
            </div>
            <h3
              id={`goal-${goal.id}-label`}
              className="max-w-full px-1 text-center text-[8px] leading-snug font-semibold line-clamp-2 break-words min-h-[2.5em]"
              title={goal.title}
              style={{ hyphens: "auto" }}
            >
              {goal.title}
            </h3>
            <div className="flex items-center gap-1.5 text-[6px] tracking-normal text-white/60">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `hsl(0 0% ${lightness}%)` }} aria-hidden="true" />
              <span>{goal.progress}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] w-full">
              <div
                className="h-full rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
                style={{ width: `${goal.progress}%`, backgroundImage: energy.bar }}
              />
            </div>
          </button>

          {open && (
            <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.02]">
              <ProjectsDropdown
                id={`goal-${goal.id}`}
                goalTitle={goal.title}
                projects={goal.projects}
                loading={loading}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative h-full rounded-[30px] border border-white/10 bg-white/[0.03] p-5 text-white transition hover:-translate-y-1 hover:border-white/30">
      <div className="relative flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-controls={`goal-${goal.id}`}
            className="flex flex-1 flex-col gap-3 text-left"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl font-semibold">
                {goal.monumentEmoji ?? goal.emoji ?? goal.title.slice(0, 2)}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em]">
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-white/80">
                    <FlameEmber
                      level={goal.energy.toUpperCase() as FlameLevel}
                      size="xs"
                    />
                    <span className="text-[10px] uppercase tracking-[0.2em]">
                      {goal.energy}
                    </span>
                  </span>
                  {showWeight ? (
                    <span className="rounded-full border border-white/20 px-2 py-0.5 text-white/70">
                      wt {goal.weight ?? 0}
                    </span>
                  ) : null}
                </div>
                <h3 id={`goal-${goal.id}-label`} className="mt-2 text-xl font-semibold">
                  {showEmojiPrefix && (goal.monumentEmoji ?? goal.emoji) ? (
                    <span className="mr-2 inline" aria-hidden>
                      {goal.monumentEmoji ?? goal.emoji}
                    </span>
                  ) : null}
                  {goal.title}
                </h3>
                {goal.why && (
                  <p className="mt-1 text-sm text-white/65 line-clamp-2">{goal.why}</p>
                )}
              </div>
              <ChevronDown
                className={`mt-1 h-5 w-5 text-white/60 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1">
                <span className={`h-1.5 w-1.5 rounded-full ${energy.dot}`} aria-hidden="true" />
                <span>{goal.projects.length} projects</span>
              </div>
              {goal.dueDate && (
                <span className="rounded-full border border-white/10 px-3 py-1">
                  Due {new Date(goal.dueDate).toLocaleDateString()}
                </span>
              )}
              {createdAt && showCreatedAt && (
                <span className="rounded-full border border-white/10 px-3 py-1 text-white/60">
                  Created {createdAt}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-white/50">
                <span>Progress</span>
                <span>{goal.progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${goal.progress}%`, backgroundImage: energy.bar }}
                />
              </div>
            </div>
            {onBoost && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onBoost();
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-gradient-to-r from-red-600 to-rose-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white shadow-[0_8px_20px_-10px_rgba(239,68,68,0.6)] transition hover:scale-[1.02]"
                >
                  Boost +250
                </button>
              </div>
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Goal actions"
                className="rounded-full border border-white/10 bg-white/10 p-1.5 text-white/70 transition hover:border-white/40 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit?.()}>Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onToggleActive?.()}>
                {goal.active ? "Mark Inactive" : "Mark Active"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-rose-500 focus:text-rose-400"
                onSelect={() => onDelete?.()}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {open && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
            <ProjectsDropdown
              id={`goal-${goal.id}`}
              goalTitle={goal.title}
              projects={goal.projects}
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const GoalCard = memo(GoalCardImpl, (prev, next) => {
  const a = prev.goal;
  const b = next.goal;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.progress === b.progress &&
    a.active === b.active &&
    a.status === b.status &&
    (a.weight ?? 0) === (b.weight ?? 0) &&
    a.projects.length === b.projects.length &&
    prev.showWeight === next.showWeight &&
    prev.showCreatedAt === next.showCreatedAt &&
    prev.showEmojiPrefix === next.showEmojiPrefix &&
    prev.variant === next.variant
  );
});

export default GoalCard;
