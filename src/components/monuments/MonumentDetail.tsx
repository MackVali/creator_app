"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit3,
  Flame,
  Flag,
  Plus,
  StickyNote as StickyNoteIcon,
  Target,
} from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { getMonumentNotes } from "@/lib/monumentNotesStorage";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
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

type MonumentStats = {
  milestones: number;
  goals: number;
  notes: number;
};

export function MonumentDetail({ id }: MonumentDetailProps) {
  const [monument, setMonument] = useState<Monument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MonumentStats>({
    milestones: 0,
    goals: 0,
    notes: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const supabase = getSupabaseBrowser();
  const router = useRouter();
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const milestonesRef = useRef<MilestonesPanelHandle>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [id]);

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

  const refreshStats = useCallback(async () => {
    if (!supabase || !id) {
      if (isMountedRef.current) {
        setStats({
          milestones: 0,
          goals: 0,
          notes: getMonumentNotes(id).length,
        });
        setStatsLoading(false);
      }
      return;
    }
    try {
      await supabase.auth.getSession();
      const [milestoneResponse, goalResponse] = await Promise.all([
        supabase
          .from("milestones")
          .select("id", { count: "exact", head: true })
          .eq("monument_id", id),
        supabase
          .from("goals")
          .select("id", { count: "exact", head: true })
          .eq("monument_id", id),
      ]);

      if (milestoneResponse.error) {
        console.error("Failed to load milestone count", milestoneResponse.error);
      }

      if (goalResponse.error) {
        console.error("Failed to load goal count", goalResponse.error);
      }

      if (!isMountedRef.current) return;

      setStats({
        milestones: milestoneResponse.count ?? 0,
        goals: goalResponse.count ?? 0,
        notes: getMonumentNotes(id).length,
      });
      setStatsLoading(false);
    } catch (err) {
      console.error("Failed to load monument stats", err);
      if (!isMountedRef.current) return;
      setStats({
        milestones: 0,
        goals: 0,
        notes: getMonumentNotes(id).length,
      });
      setStatsLoading(false);
    }
  }, [supabase, id]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const updateStat = useCallback((key: keyof MonumentStats, value: number) => {
    setStats((prev) => ({ ...prev, [key]: value }));
    setStatsLoading(false);
  }, []);

  const handleMilestoneCountChange = useCallback(
    (count: number) => updateStat("milestones", count),
    [updateStat]
  );

  const handleGoalCountChange = useCallback(
    (count: number) => updateStat("goals", count),
    [updateStat]
  );

  const handleNoteCountChange = useCallback(
    (count: number) => updateStat("notes", count),
    [updateStat]
  );

  if (loading) {
    return (
      <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Card className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#1c1c1c_100%)] p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-16 w-16 rounded-2xl" />
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-9 w-32 rounded-md" />
                  <Skeleton className="h-9 w-32 rounded-md" />
                  <Skeleton className="h-9 w-28 rounded-md" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-gray-900 p-4"
                  >
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <Skeleton className="h-64 rounded-3xl" />
              <Skeleton className="h-72 rounded-3xl" />
              <Skeleton className="h-80 rounded-3xl" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-48 rounded-3xl" />
              <Skeleton className="h-64 rounded-3xl" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#1c1c1c_100%)] p-6 text-center text-slate-200 shadow-[0_40px_120px_rgba(15,23,42,0.45)]">
            <p>{error || "Monument not found"}</p>
          </Card>
        </div>
      </main>
    );
  }

  const handleAddMilestone = () => {
    document
      .getElementById("monument-milestones")
      ?.scrollIntoView({ behavior: "smooth" });
    void milestonesRef.current?.addMilestone();
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

  return (
    <main className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Link
          href="/monuments"
          className="group inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to monuments
        </Link>

        <Card className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_52%,#1d1d1d_100%)] p-6 text-slate-100 shadow-[0_40px_120px_rgba(15,23,42,0.45)] sm:p-8">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(107,114,128,0.25),transparent_58%)]" />
            <div className="absolute left-[-12%] top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-gray-700/20 blur-3xl" />
            <div className="absolute right-[-18%] top-[-20%] h-80 w-80 rounded-full bg-gray-600/15 blur-3xl" />
          </div>

          <div className="relative flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-4xl"
                  role="img"
                  aria-label={`Monument: ${monument.title}`}
                >
                  {monument.emoji || "\uD83D\uDDFC\uFE0F"}
                </span>
                <div className="space-y-3">
                  <Badge
                    variant="outline"
                    className="w-fit rounded-full border border-white/20 bg-gray-900 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-200"
                  >
                    Monument
                  </Badge>
                  <div>
                    <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
                      {monument.title}
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300">
                      Craft a space to celebrate progress. Add milestones, link goals, and capture reflections as this monument comes to life.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleAddMilestone} aria-label="Create milestone">
                  <Plus className="h-4 w-4" />
                  Milestone
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  className="border-white/20 text-slate-200 hover:bg-gray-800"
                  aria-label="Focus note editor"
                >
                  <StickyNoteIcon className="h-4 w-4" />
                  Quick note
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  className="text-slate-200 hover:bg-gray-800 hover:text-white"
                  aria-label="Edit monument"
                >
                  <Link href={`/monuments/${id}/edit`}>
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  label: "Milestones",
                  value: statsLoading ? "…" : stats.milestones.toString(),
                  description: "Key steps you’ve defined.",
                  icon: Flag,
                  accent: "text-emerald-300",
                },
                {
                  label: "Linked goals",
                  value: statsLoading ? "…" : stats.goals.toString(),
                  description: "Initiatives powering this win.",
                  icon: Target,
                  accent: "text-sky-300",
                },
                {
                  label: "Notes",
                  value: statsLoading ? "…" : stats.notes.toString(),
                  description: "Moments you’ve captured.",
                  icon: StickyNoteIcon,
                  accent: "text-amber-300",
                },
                {
                  label: "Momentum streak",
                  value: "0 days",
                  description: "Keep logging wins to build momentum.",
                  icon: Flame,
                  accent: "text-rose-300",
                },
              ].map(({ label, value, description, icon: Icon, accent }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[linear-gradient(140deg,#080808_0%,#121212_55%,#1a1a1a_100%)] p-4 backdrop-blur"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-800">
                    <Icon className={`h-5 w-5 ${accent}`} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="text-xl font-semibold text-white">{value}</p>
                    <p className="text-xs text-slate-400">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <MilestonesPanel
              ref={milestonesRef}
              monumentId={id}
              onAutoSplit={handleAutoSplit}
              onMilestonesChange={handleMilestoneCountChange}
            />

            <Card className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#191919_100%)] p-5 text-slate-100 shadow-[0_40px_120px_rgba(15,23,42,0.45)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Linked goals</h2>
                  <p className="text-sm text-slate-400">Highlight the goals that make this monument real.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateGoal}
                  className="border-white/20 text-slate-200 hover:bg-gray-800"
                  aria-label="Create goal"
                >
                  <Target className="h-4 w-4" />
                  New goal
                </Button>
              </div>
              <div className="mt-5">
                <FilteredGoalsGrid
                  entity="monument"
                  id={id}
                  onCreateGoal={handleCreateGoal}
                  onCountChange={handleGoalCountChange}
                />
              </div>
            </Card>

            <Card className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#191919_100%)] p-5 text-slate-100 shadow-[0_40px_120px_rgba(15,23,42,0.45)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Notes & reflections</h2>
                  <p className="text-sm text-slate-400">Capture quick wins, quotes, and takeaways while they’re fresh.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddNote}
                  className="border-white/20 text-slate-200 hover:bg-gray-800"
                  aria-label="Scroll to notes"
                >
                  <StickyNoteIcon className="h-4 w-4" />
                  Add note
                </Button>
              </div>
              <div className="mt-5">
                <MonumentNotesGrid
                  monumentId={id}
                  inputRef={noteInputRef}
                  onCountChange={handleNoteCountChange}
                />
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#050505_0%,#0f0f0f_55%,#191919_100%)] p-5 text-slate-100 shadow-[0_40px_120px_rgba(15,23,42,0.45)] sm:p-6">
              <h2 className="text-lg font-semibold text-white">Make this monument meaningful</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-500" />
                  Break big wins into milestones so you can celebrate the steps that matter.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-500" />
                  Link goals to show where the momentum is coming from and what’s next.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-500" />
                  Capture notes to remember how each milestone felt and what you learned.
                </li>
              </ul>
            </Card>
            <ActivityPanel />
          </div>
        </div>
      </div>
    </main>
  );
}

export default MonumentDetail;
