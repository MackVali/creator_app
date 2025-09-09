"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";
import { MonumentDetailLayout, SectionShell } from "./MonumentDetailLayout";
import { MonumentHero } from "./MonumentHero";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  created_at: string;
}

interface MonumentDetailProps {
  id: string;
}

export function MonumentDetail({ id }: MonumentDetailProps) {
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
      <MonumentDetailLayout
        hero={<MonumentHero id={id} loading />}
        milestones={<SectionShell title="Milestones" loading />}
        goals={<SectionShell title="Goals" loading />}
        notes={<SectionShell title="Notes" loading />}
        activity={<SectionShell title="Activity" loading />}
      />
    );
  }

  if (error || !monument) {
    return (
      <main className="p-4">
        <div className="text-center py-12">
          <h1 className="mb-2 text-2xl font-semibold text-red-400">
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

  const mockProgress = 65;

  return (
    <MonumentDetailLayout
      hero={<MonumentHero id={id} monument={monument} progress={mockProgress} />}
      milestones={
        <SectionShell title="Milestones">
          <p className="text-sm text-muted-foreground">No milestones yet</p>
        </SectionShell>
      }
      goals={
        <SectionShell title="Goals">
          <FilteredGoalsGrid entity="monument" id={id} />
        </SectionShell>
      }
      notes={
        <SectionShell title="Notes">
          <MonumentNotesGrid monumentId={id} />
        </SectionShell>
      }
      activity={
        <SectionShell title="Activity">
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </SectionShell>
      }
    />
  );
}

export default MonumentDetail;
