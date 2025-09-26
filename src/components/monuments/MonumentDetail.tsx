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
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <Skeleton className="h-8 w-32 rounded-full bg-white/10" />
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#141414] p-6 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.85)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_65%)] opacity-60" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <Skeleton className="h-16 w-16 rounded-2xl bg-white/10" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48 rounded-full" />
                  <Skeleton className="h-4 w-36 rounded-full" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-28 rounded-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            </div>
            <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
                >
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="mt-3 h-4 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Skeleton className="h-64 rounded-3xl bg-[#141414]" />
            <Skeleton className="h-64 rounded-3xl bg-[#141414]" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#080808] via-[#101010] to-[#181818] p-8 text-center shadow-[0_24px_60px_-30px_rgba(0,0,0,0.8)]">
            <h2 className="text-lg font-semibold text-white">We couldn&apos;t find that monument</h2>
            <p className="mt-2 text-sm text-white/70">
              {error || "The monument you&apos;re looking for may have been removed."}
            </p>
            <div className="mt-5 flex justify-center">
              <Button asChild size="sm" className="rounded-full px-6">
                <Link href="/monuments">Back to Monuments</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
      value: "Capture a note",
      description: "Jot down momentum-building ideas while they&apos;re fresh.",
      icon: Sparkles,
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#060606] via-[#101011] to-[#19191b] p-6 shadow-[0_28px_90px_-48px_rgba(0,0,0,0.78)] sm:p-7">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
              <header className="relative flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-white/60">
                    Goals
                  </p>
                  <h2 className="text-lg font-semibold text-white sm:text-xl">
                    Linked goals
                  </h2>
                  <p className="text-xs text-white/70 sm:text-sm">
                    Keep adjacent work in sync so progress feels coordinated and effortless.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateGoal}
                  className="rounded-full border-white/20 bg-white/5 px-4 text-white backdrop-blur hover:border-white/30 hover:bg-white/10"
                >
                  New goal
                </Button>
              </header>
              <div className="relative mt-5">
                <FilteredGoalsGrid
                  entity="monument"
                  id={id}
                  onCreateGoal={handleCreateGoal}
                />
              </div>
            </section>
          </div>

          <div className="space-y-6">
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  className="rounded-full border-white/20 bg-white/5 px-4 text-white backdrop-blur hover:border-white/30 hover:bg-white/10"
                >
                  New note
                </Button>
              </header>
              <div className="relative mt-5">
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
