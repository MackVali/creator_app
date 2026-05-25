"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BatteryCharging,
  Flame,
  MoreHorizontal,
  Plus,
  Timer,
} from "lucide-react";

import ActivityPanel from "./ActivityPanel";
import FocusPomo, { type FocusPomoSource } from "@/components/focus/FocusPomo";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import type { MonumentNote } from "@/lib/types/monument-note";
import { cn } from "@/lib/utils";
import MonumentEditDialog from "@/components/monuments/MonumentEditDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface MonumentDetailMonument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  monument: MonumentDetailMonument;
  notes: MonumentNote[];
}

type MonumentView = "goals" | "roadmap";

function MonumentRoadmapEmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#080A0F] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.34)] sm:px-5 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">
            Start this roadmap
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[#A7B0BD]">
            Add the first goal to give this monument a clear next step.
          </p>
        </div>
        <Link
          href="/goals"
          className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 text-xs font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.11] sm:w-auto"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add Goal
        </Link>
      </div>
    </div>
  );
}

export function MonumentDetail({ monument, notes }: MonumentDetailProps) {
  const { id } = monument;
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [monumentView, setMonumentView] = useState<MonumentView>("goals");
  const [goalSection, setGoalSection] = useState<"active" | "completed">(
    "active"
  );
  const [focusPomoSource, setFocusPomoSource] =
    useState<FocusPomoSource | null>(null);

  useEffect(() => {
    setMonumentView("goals");
    setGoalSection("active");
  }, [id]);

  const containerShell =
    "relative w-full overflow-hidden rounded-3xl border border-white/10";
  const sectionBackground =
    "bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)]";
  const overviewBackground =
    "bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] shadow-[0_35px_120px_-45px_rgba(0,0,0,0.85)]";

  const quickFacts = [
    {
      label: "Streak",
      value: "0 days",
      description: "Build consistency to light this up.",
      icon: Flame,
    },
    {
      label: "Status",
      value: "Not charging yet",
      description: "No activity has been recorded for this monument yet.",
      icon: BatteryCharging,
    },
  ] as const;

  const handleStartFocusPomo = () => {
    const source: FocusPomoSource = {
      sourceType: "monument",
      sourceId: id,
      title: monument.title,
      icon: monument.emoji,
    };

    console.info("Start focus pomo", source);
    setFocusPomoSource(source);
  };

  return (
    <main className="overflow-x-hidden px-2.5 py-4 sm:px-6 sm:py-6 lg:px-8">
      <MonumentEditDialog
        open={editDialogOpen}
        monumentId={id}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
          }
        }}
        onSaved={() => setEditDialogOpen(false)}
      />
      <FocusPomo
        open={Boolean(focusPomoSource)}
        source={focusPomoSource}
        onClose={() => setFocusPomoSource(null)}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 overflow-x-hidden sm:gap-6">
        <section
          className={cn(
            containerShell,
            overviewBackground,
            "px-3 py-3 text-white sm:p-7",
            "min-h-0 sm:min-h-[210px]"
          )}
        >
          <div className="absolute inset-0">
            <div className="absolute inset-x-12 -top-16 h-48 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.18),_transparent_70%)] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-56 w-56 translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.06),_transparent_60%)] blur-3xl" />
          </div>
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <button
              type="button"
              aria-label={`Start focus pomo for ${monument.title}`}
              onClick={handleStartFocusPomo}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:border-white/20 hover:bg-white/10"
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Monument actions"
                  className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:border-white/20 hover:bg-white/10"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
                  Edit monument
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="relative flex flex-row gap-4 sm:flex-row sm:items-start sm:gap-6">
            <span
              className="relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-[#040404] via-[#08080a] to-black text-3xl text-white shadow-[0_25px_45px_rgba(0,0,0,0.65)] sm:h-[72px] sm:w-[72px] sm:text-4xl"
              role="img"
              aria-label={`Monument: ${monument.title}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.55),_rgba(255,255,255,0.05))]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-[2px] rounded-[18px] bg-gradient-to-b from-white/20 via-white/5 to-white/0 opacity-80"
              />
              <span className="relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]">
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {monument.title}
              </h1>
              <div className="grid gap-0.5 min-[380px]:grid-cols-2 sm:flex sm:flex-wrap">
                {quickFacts.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="group flex items-center gap-0.5 rounded-full border border-black bg-white/5 px-1 py-0.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-black hover:bg-white/10 sm:gap-1 sm:px-2 sm:py-1"
                  >
                    <span className="flex size-3 items-center justify-center rounded-full bg-white/10 text-white/70 sm:size-5">
                      <Icon className="h-1.5 w-1.5 sm:h-2.5 sm:w-2.5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[5px] font-semibold uppercase tracking-[0.28em] text-white/45 sm:text-[7px]">
                        {label}
                      </span>
                      <span className="text-[7px] font-semibold text-white/85 sm:text-xs">
                        {value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="grid w-full grid-cols-1 gap-5 lg:gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section
            className={cn(
              containerShell,
              sectionBackground,
              "px-3 py-4 sm:p-7",
              "min-h-[260px]",
              "overflow-visible sm:overflow-hidden"
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <header className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="inline-flex w-full rounded-lg border border-white/10 bg-[#050506]/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:w-auto"
                aria-label="Monument view"
              >
                {(
                  [
                    { value: "goals", label: "GOAL GRID" },
                    { value: "roadmap", label: "ROADMAP" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMonumentView(option.value)}
                    className={cn(
                      "min-h-8 flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition sm:flex-none",
                      monumentView === option.value
                        ? "bg-zinc-800/90 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_18px_rgba(0,0,0,0.25)]"
                        : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
                    )}
                    aria-pressed={monumentView === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </header>
            <div className="relative mt-3 overflow-visible sm:mt-4">
              <MonumentGoalsList
                monumentId={id}
                monumentEmoji={monument.emoji}
                monumentView={monumentView}
                goalSection={goalSection}
                onGoalSectionChange={setGoalSection}
                roadmapEmptyState={<MonumentRoadmapEmptyState />}
              />
            </div>
          </section>

          <section
            className={cn(
              containerShell,
              sectionBackground,
              "p-5 sm:p-7",
              "min-h-[260px]",
              "overflow-visible sm:overflow-hidden"
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
            <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Notes
                </p>
              </div>
            </header>
            <div className="relative mt-5">
              <MonumentNotesGrid monumentId={id} initialNotes={notes} />
            </div>
          </section>

          <div className="w-full xl:col-span-2">
            <ActivityPanel monumentId={id} />
          </div>
        </div>
      </div>
    </main>
  );
}

export default MonumentDetail;
