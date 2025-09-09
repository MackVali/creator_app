"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import {
  ContentCard,
  PageHeader,
  SectionHeader,
} from "@/components/ui/content-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBarGradient } from "@/components/skills/ProgressBarGradient";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  created_at: string;
}

interface MonumentDetailProps {
  id: string;
  showHeader?: boolean;
}

export function MonumentDetail({ id, showHeader = true }: MonumentDetailProps) {
  const [monument, setMonument] = useState<Monument | null>(null);
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
          .from("monuments")
          .select("id,title,emoji,created_at")
          .eq("id", id)
          .single();

        if (!cancelled) {
          if (error) {
            console.error("Error fetching monument:", error);
            setError("Failed to load monument");
          } else {
            setMonument(data);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Error loading monument:", err);
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
      <main className="p-4 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <ContentCard className="flex flex-col items-center space-y-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="w-full max-w-sm space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2 w-full" />
          </div>
        </ContentCard>
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="p-4">
        <div className="text-center py-12">
          <h1 className="text-2xl font-semibold text-red-400 mb-2">
            {error || "Monument not found"}
          </h1>
          <p className="text-gray-400">
            {error
              ? "Please try again later."
              : "This monument doesn't exist or you don't have access to it."}
          </p>
        </div>
      </main>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const mockProgress = 65;

  return (
    <main className="p-4 space-y-8">
      {showHeader && (
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <span
                className="text-4xl"
                role="img"
                aria-label={`Monument: ${monument.title}`}
              >
                {monument.emoji || "\uD83D\uDDFC\uFE0F"}
              </span>
              {monument.title}
            </div>
          }
          description={`Created ${formatDate(monument.created_at)}`}
        >
          <Link
            href={`/monuments/${id}/edit`}
            className="inline-block rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-black"
          >
            Edit Monument
          </Link>
        </PageHeader>
      )}

      <ContentCard className="max-w-md mx-auto w-full space-y-2 text-center">
        <span className="text-sm text-gray-400">Charging</span>
        <ProgressBarGradient value={mockProgress} height={8} />
      </ContentCard>

      <section className="space-y-4">
        <SectionHeader title="Related Goals" />
        <FilteredGoalsGrid entity="monument" id={id} />
      </section>

      <section className="space-y-4">
        <SectionHeader title="Notes" />
        <MonumentNotesGrid monumentId={id} />
      </section>
    </main>
  );
}

export default MonumentDetail;

