"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BatteryCharging,
  Flame,
  Sparkles,
} from "lucide-react";

import { getSupabaseBrowser } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MilestonesPanel, { MilestonesPanelHandle } from "./MilestonesPanel";
import ActivityPanel from "./ActivityPanel";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
}

interface MonumentDetailProps {
  id: string;
}

export function MonumentDetail({ id }: MonumentDetailProps) {
  const [monument, setMonument] = useState<Monument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const milestonesRef = useRef<MilestonesPanelHandle>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !id) return;
      setLoading(true);
      setError(null);
      try {
        await supabase.auth.getSession();
        const { data, error } = await supabase
          .from("monuments")
          .select("id,title,emoji")
          .eq("id", id)
          .single();
        if (!cancelled) {
          if (error) {
            setError("Failed to load monument");
          } else {
            setMonument(data);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load monument");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  if (loading) {
    return (
      <main className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <Skeleton className="h-9 w-40 rounded-full bg-white/10" />
          <div className="overflow-hidden rounded-3xl border border-white/5 bg-[#111520] p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <Skeleton className="h-20 w-20 rounded-2xl" />
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-52" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Skeleton className="h-9 w-32 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-5 w-32" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Skeleton className="h-72 rounded-3xl bg-[#111520]" />
            <Skeleton className="h-72 rounded-3xl bg-[#111520]" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl border border-white/8 bg-[#111520] p-6 text-center shadow-[0_18px_48px_rgba(3,7,18,0.45)] sm:p-8">
            <h2 className="text-xl font-semibold text-white">We couldn&apos;t find that monument</h2>
            <p className="mt-2 text-sm text-[#A7B0BD]">
              {error || "The monument you&apos;re looking for may have been removed."}
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild>
                <Link href="/monuments">Back to Monuments</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const handleCreateMilestone = () => {
    milestonesRef.current?.addMilestone();
  };

  const handleAddMilestone = () => {
    document
      .getElementById("monument-milestones")
      ?.scrollIntoView({ behavior: "smooth" });
    handleCreateMilestone();
  };

  const handleAutoSplit = () => {
    console.log("Auto Split coming soon");
  };

  const handleAddNote = () => {
    noteInputRef.current?.scrollIntoView({ behavior: "smooth" });
    noteInputRef.current?.focus();
  };

  const handleCreateGoal = () => {
    router.push("/goals/new");
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
    {
      label: "Next step",
      value: "Create a milestone",
      description: "Break the vision into concrete wins to unlock progress.",
      icon: Sparkles,
    },
  ] as const;

  return (
    <main className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-2 rounded-full border border-white/5 bg-white/5 px-3 text-sm text-white/70 hover:border-white/10 hover:bg-white/10 hover:text-white"
          >
            <Link href="/monuments">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to monuments
            </Link>
          </Button>
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#101725] via-[#0B1220] to-[#05070F] p-6 shadow-[0_24px_64px_rgba(3,7,18,0.65)] sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
          >
            <div className="absolute -top-32 right-10 h-72 w-72 rounded-full bg-[rgba(88,122,255,0.25)] blur-3xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-[rgba(40,221,180,0.2)] blur-3xl" />
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-4xl text-white sm:h-24 sm:w-24 sm:text-5xl"
                  role="img"
                  aria-label={`Monument: ${monument.title}`}
                >
                  {monument.emoji || "\uD83D\uDDFC\uFE0F"}
                </span>
                <div className="flex flex-col gap-3">
                  <Badge
                    variant="outline"
                    className="w-fit rounded-full border-white/25 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-white/70"
                  >
                    Monument overview
                  </Badge>
                  <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                    {monument.title}
                  </h1>
                  <p className="max-w-xl text-sm text-white/70 sm:text-base">
                    Rally your focus around this monument. Break it into milestones, link supporting goals, and capture notes so future you knows exactly what to do next.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 self-start">
              <Button
                asChild
                size="sm"
                className="rounded-full bg-white text-slate-900 hover:bg-white/90"
              >
                <Link href={`/monuments/${id}/edit`}>Edit monument</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddMilestone}
                aria-label="Add milestone"
                className="rounded-full border-white/20 bg-white/10 text-white hover:border-white/30 hover:bg-white/20"
              >
                + Milestone
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddNote}
                aria-label="Add note"
                className="rounded-full border-transparent bg-white/5 text-white hover:border-white/20 hover:bg-white/15"
              >
                Quick note
              </Button>
            </div>
          </div>

          <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickFacts.map(({ label, value, description, icon: Icon }) => (
              <div
                key={label}
                className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-white"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </div>
                <div className="text-lg font-semibold sm:text-xl">{value}</div>
                <p className="text-sm text-white/70">{description}</p>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <MilestonesPanel
              ref={milestonesRef}
              monumentId={id}
              onAutoSplit={handleAutoSplit}
            />

            <section className="rounded-3xl border border-white/8 bg-[rgba(16,23,37,0.9)] p-6 shadow-[0_18px_48px_rgba(3,7,18,0.55)]">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">
                    Goals
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Goals connected to this monument
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Keep related goals in view so you always know what feeds this monument.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateGoal}
                  className="rounded-full border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
                >
                  New goal
                </Button>
              </header>
              <div className="mt-6">
                <FilteredGoalsGrid
                  entity="monument"
                  id={id}
                  onCreateGoal={handleCreateGoal}
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/8 bg-[#101725] p-6 shadow-[0_18px_48px_rgba(3,7,18,0.55)]">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/60">
                    Notes
                  </p>
                  <h2 className="text-xl font-semibold text-white">
                    Capture quick ideas and insights
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Drop thoughts, resources, or learnings as you make progress.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  className="rounded-full border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
                >
                  New note
                </Button>
              </header>
              <div className="mt-6">
                <MonumentNotesGrid monumentId={id} inputRef={noteInputRef} />
              </div>
            </section>

            <ActivityPanel />
          </div>
        </div>
      </div>
    </main>
  );
}

export default MonumentDetail;
