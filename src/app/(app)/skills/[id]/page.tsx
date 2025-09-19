"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesGrid } from "@/components/notes/NotesGrid";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  created_at: string;
}

function describeLevel(level: number): string {
  if (level >= 10) {
    return "Mastery in motion.";
  }
  if (level >= 6) {
    return "Building serious momentum.";
  }
  if (level >= 3) {
    return "Solidifying the fundamentals.";
  }
  return "Laying the groundwork for growth.";
}

export default function SkillDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !id) return;

      setLoading(true);
      setError(null);

      try {
        await supabase.auth.getSession();
        const { data, error } = await supabase
          .from("skills")
          .select("id,name,icon,level,created_at")
          .eq("id", id)
          .single();

        if (!cancelled) {
          if (error) {
            console.error("Error fetching skill:", error);
            setError("Failed to load skill");
          } else {
            setSkill(data);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading skill:", err);
          setError("Failed to load skill");
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
      <main className="px-4 pb-16 pt-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 p-8 shadow-[0_30px_60px_rgba(15,23,42,0.45)]">
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-10">
              <Skeleton className="h-28 w-28 rounded-2xl" />
              <div className="flex w-full flex-1 flex-col gap-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-28 rounded-full" />
                  <Skeleton className="h-8 w-32 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-60 rounded-2xl border border-white/5 bg-slate-900/40" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-60 rounded-2xl border border-white/5 bg-slate-900/40" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !skill) {
    return (
      <main className="px-4 pb-16 pt-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 px-8 py-12 text-center shadow-[0_25px_60px_rgba(220,38,38,0.35)]">
            <h1 className="text-2xl font-semibold text-red-100">
              {error || "Skill not found"}
            </h1>
            <p className="mt-4 text-sm text-red-100/80">
              {error
                ? "Please try again later."
                : "This skill doesn't exist or you don't have access to it."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const createdAt = skill.created_at ? new Date(skill.created_at) : null;
  const hasValidDate = createdAt && !Number.isNaN(createdAt.getTime());
  const formattedCreatedAt = hasValidDate ? formatDate(skill.created_at) : null;
  const daysTracked = hasValidDate
    ? Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;
  const createdRelativeText = hasValidDate
    ? daysTracked === 0
      ? "Added today."
      : `Added ${daysTracked} day${daysTracked === 1 ? "" : "s"} ago.`
    : "Creation date unavailable.";

  const stats = [
    {
      label: "Level",
      value: `Lv ${skill.level}`,
      description: describeLevel(skill.level),
    },
    {
      label: "Added to timeline",
      value: formattedCreatedAt ?? "Not available",
      description: createdRelativeText,
    },
    {
      label: "Days tracked",
      value:
        daysTracked !== null
          ? `${daysTracked} day${daysTracked === 1 ? "" : "s"}`
          : "Not tracked",
      description:
        daysTracked !== null
          ? `Time since you logged ${skill.name}.`
          : "Tracking duration unavailable.",
    },
  ];

  const icon = skill.icon || "💡";

  return (
    <main className="px-4 pb-16 pt-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <section aria-labelledby="skill-overview">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-[0_40px_80px_-25px_rgba(15,23,42,0.65)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.35),transparent_55%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-[-20%] w-2/3 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2),transparent_65%)]"
            />
            <div className="relative z-10 flex flex-col gap-8 p-8 text-center md:flex-row md:items-center md:gap-12 md:p-12 md:text-left">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-[0_20px_45px_-20px_rgba(15,23,42,0.9)] md:mx-0 md:h-32 md:w-32">
                <span className="text-5xl md:text-6xl" role="img" aria-label={`Skill: ${skill.name}`}>
                  {icon}
                </span>
              </div>
              <div className="flex-1 space-y-6">
                <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-200">
                    Skill Overview
                  </span>
                  <span className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/20 px-4 py-1 text-sm font-semibold text-indigo-100">
                    Level {skill.level}
                  </span>
                </div>
                <div className="space-y-3">
                  <h1
                    id="skill-overview"
                    className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
                  >
                    {skill.name}
                  </h1>
                  <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300 md:mx-0">
                    {`Everything connected to ${skill.name} lives here — goals, notes, and the progress you're making along the way.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-left backdrop-blur-sm"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        {stat.label}
                      </span>
                      <span className="text-sm font-semibold text-white">
                        {stat.value}
                      </span>
                      {stat.description ? (
                        <span className="sr-only">{stat.description}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="skill-goals">
          <Card className="border-white/10 bg-slate-950/70 backdrop-blur-md shadow-[0_40px_80px_-25px_rgba(15,23,42,0.65)]">
            <CardHeader className="pb-2">
              <div className="space-y-2">
                <CardTitle id="skill-goals" className="text-lg font-semibold text-white">
                  Related goals
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Explore the goal folders powering {skill.name} and see the projects pushing it forward.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <FilteredGoalsGrid entity="skill" id={id} />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="skill-notes">
          <Card className="border-white/10 bg-slate-950/70 backdrop-blur-md shadow-[0_40px_80px_-25px_rgba(15,23,42,0.65)]">
            <CardHeader className="pb-2">
              <div className="space-y-2">
                <CardTitle id="skill-notes" className="text-lg font-semibold text-white">
                  Notes
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Keep track of learnings, resources, and reminders tied to {skill.name}.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <NotesGrid skillId={id} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
