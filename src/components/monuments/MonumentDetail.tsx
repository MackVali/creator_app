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
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <Skeleton className="h-8 w-32 rounded-md bg-white/10" />
          <div className="rounded-2xl border border-white/10 bg-[#111520] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <Skeleton className="h-16 w-16 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-36" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-28 rounded-full" />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Skeleton className="h-64 rounded-2xl bg-[#111520]" />
            <Skeleton className="h-64 rounded-2xl bg-[#111520]" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-white/10 bg-[#111520] p-6 text-center">
            <h2 className="text-lg font-semibold text-white">We couldn&apos;t find that monument</h2>
            <p className="mt-2 text-sm text-white/70">
              {error || "The monument you&apos;re looking for may have been removed."}
            </p>
            <div className="mt-5 flex justify-center">
              <Button asChild size="sm">
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
    <main className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit gap-2 rounded-md border border-white/5 bg-white/5 px-3 text-xs font-medium text-white/70 hover:border-white/10 hover:bg-white/10 hover:text-white"
        >
          <Link href="/monuments">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to monuments
          </Link>
        </Button>

        <section className="rounded-2xl border border-white/10 bg-[#0F1623] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span
                className="flex size-16 items-center justify-center rounded-xl bg-white/10 text-3xl text-white"
                role="img"
                aria-label={`Monument: ${monument.title}`}
              >
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">
                  {monument.title}
                </h1>
                <p className="max-w-xl text-sm text-white/60">
                  Track the milestones, goals, and notes that keep this monument moving forward.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                size="sm"
                className="rounded-md bg-white px-4 text-slate-900 hover:bg-white/90"
              >
                <Link href={`/monuments/${id}/edit`}>Edit monument</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddMilestone}
                aria-label="Add milestone"
                className="rounded-md border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
              >
                Add milestone
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddNote}
                aria-label="Add note"
                className="rounded-md border-transparent bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
              >
                Add note
              </Button>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {quickFacts.map(({ label, value, description, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-[#101b2a] p-3 text-white"
              >
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/60">
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
                <p className="mt-1 text-xs text-white/60">{description}</p>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <MilestonesPanel
              ref={milestonesRef}
              monumentId={id}
              onAutoSplit={handleAutoSplit}
            />

            <section className="rounded-2xl border border-white/10 bg-[#0F1623] p-5">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    Goals
                  </p>
                  <h2 className="text-lg font-semibold text-white">
                    Linked goals
                  </h2>
                  <p className="text-xs text-white/60">
                    Keep related work nearby so it&apos;s easy to connect the dots.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateGoal}
                  className="rounded-md border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
                >
                  New goal
                </Button>
              </header>
              <div className="mt-4">
                <FilteredGoalsGrid
                  entity="monument"
                  id={id}
                  onCreateGoal={handleCreateGoal}
                />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-[#0F1623] p-5">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    Notes
                  </p>
                  <h2 className="text-lg font-semibold text-white">
                    Quick captures
                  </h2>
                  <p className="text-xs text-white/60">
                    Save ideas, links, and reminders while they&apos;re fresh.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  className="rounded-md border-white/20 bg-white/5 text-white hover:border-white/30 hover:bg-white/15"
                >
                  New note
                </Button>
              </header>
              <div className="mt-4">
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
