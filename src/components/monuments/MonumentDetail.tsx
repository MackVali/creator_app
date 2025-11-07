"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BatteryCharging, Flame } from "lucide-react";

import { Button } from "@/components/ui/button";
import ActivityPanel from "./ActivityPanel";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";

export interface MonumentDetailMonument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  monument: MonumentDetailMonument;
}

export function MonumentDetail({ monument }: MonumentDetailProps) {
  const router = useRouter();
  const { id } = monument;

  const handleCreateGoal = () => {
    router.push("/goals/new");
  };

  const handleAddNote = () => {
    router.push(`/monuments/${id}/notes/new`);
  };

  const quickFacts = [
    {
      label: "Momentum streak",
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
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
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
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {monument.title}
                </h1>
                <p className="max-w-xl text-sm text-white/70 sm:text-base">
                  Track the momentum of this monument with goals and notes that feel as polished as the vision.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                size="sm"
                className="rounded-full bg-white px-5 text-slate-900 shadow-sm transition hover:bg-white/90"
              >
                <Link href={`/monuments/${id}/edit`}>Edit monument</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddNote}
                aria-label="Add note"
                className="rounded-full border-white/20 bg-transparent px-4 text-white/80 backdrop-blur hover:border-white/30 hover:bg-white/10"
              >
                Add note
              </Button>
            </div>
          </div>

          <dl className="relative mt-6 grid gap-3 sm:grid-cols-3">
            {quickFacts.map(({ label, value, description, icon: Icon }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.18),_transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
                  <span className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/70">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {label}
                </dt>
                <dd className="mt-2 text-base font-semibold text-white">{value}</dd>
                <p className="mt-2 text-xs text-white/60">{description}</p>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-6 xl:auto-rows-min xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <header className="relative flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">
                GOALS
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateGoal}
                className="rounded-full border-white/20 bg-white/5 px-4 text-white backdrop-blur hover:border-white/30 hover:bg-white/10"
              >
                New goal
              </Button>
            </header>
            <div className="relative mt-4">
              <FilteredGoalsGrid
                entity="monument"
                id={id}
                onCreateGoal={handleCreateGoal}
                displayMode="minimal"
              />
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
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
              <MonumentNotesGrid monumentId={id} />
            </div>
          </section>

          <div className="xl:col-span-2">
            <ActivityPanel monumentId={id} />
          </div>
        </div>
      </div>
    </main>
  );
}

export default MonumentDetail;
