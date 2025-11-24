"use client";

import Link from "next/link";
import { ArrowLeft, BatteryCharging, Flame } from "lucide-react";

import { Button } from "@/components/ui/button";
import ActivityPanel from "./ActivityPanel";
import { MonumentGoalsList } from "@/components/monuments/MonumentGoalsList";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import type { MonumentNote } from "@/lib/types/monument-note";

export interface MonumentDetailMonument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  monument: MonumentDetailMonument;
  notes: MonumentNote[];
}

export function MonumentDetail({ monument, notes }: MonumentDetailProps) {
  const { id } = monument;
  // Always use the compact goal cards on monuments
  const useNewGoalCards = true;

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

  return (
    <main className="overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 overflow-x-hidden">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-white/70 backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <Link href="/monuments">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to monuments
          </Link>
        </Button>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#050505] via-[#0f0f10] to-[#1b1b1d] p-6 shadow-[0_35px_120px_-45px_rgba(0,0,0,0.85)] sm:p-8">
          <div className="absolute inset-0">
            <div className="absolute inset-x-8 -top-24 h-64 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.22),_transparent_70%)] blur-3xl" />
            <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.08),_transparent_60%)] blur-3xl" />
          </div>
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-5">
              <span
                className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-white/10 text-4xl text-white shadow-inner"
                role="img"
                aria-label={`Monument: ${monument.title}`}
              >
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
              <div className="flex-1 space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {monument.title}
                </h1>
                <div className="flex flex-wrap gap-1.5">
                  {quickFacts.map(({ label, value, icon: Icon }) => (
                    <div
                      key={label}
                      className="group flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur transition hover:border-white/25 hover:bg-white/10"
                    >
                      <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-white/70">
                        <Icon className="size-2.5" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[7px] font-semibold uppercase tracking-[0.28em] text-white/45">
                          {label}
                        </span>
                        <span className="text-[10px] font-semibold text-white/85 sm:text-xs">
                          {value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid w-full grid-cols-1 gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <header className="relative flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                GOALS
              </h2>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-full border-white/20 bg-white/5 px-4 text-white backdrop-blur hover:border-white/30 hover:bg-white/10"
              >
                <Link href="/goals/new">New goal</Link>
              </Button>
            </header>
            <div className="relative mt-4 overflow-visible">
              <MonumentGoalsList monumentId={id} monumentEmoji={monument.emoji} />
            </div>
          </section>

          <section className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
            <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                  Notes
                </p>
                <h2 className="text-lg font-semibold text-white sm:text-xl">
                  Quick captures
                </h2>
                <p className="text-xs text-white/70 sm:text-sm">
                  Save ideas, links, and reminders while they&apos;re fresh.
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
