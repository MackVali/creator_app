"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBarGradient } from "@/components/skills/ProgressBarGradient";
import { MonumentNotesGrid } from "@/components/notes/MonumentNotesGrid";

interface Monument {
  id: string;
  title: string;
  emoji: string | null;
  created_at: string;
}

export default function MonumentDetailPage() {
  const params = useParams();
  const id = params.id as string;
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
      <main className="p-4 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
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
    <main className="p-4 space-y-6">
      {/* Monument Header */}
      <div className="text-center space-y-4">
        <div
          className="text-6xl"
          role="img"
          aria-label={`Monument: ${monument.title}`}
        >
          {monument.emoji || "🏛️"}
        </div>
        <h1 className="text-3xl font-bold text-white">{monument.title}</h1>
        <p className="text-sm text-gray-400">
          Created {formatDate(monument.created_at)}
        </p>
        <div className="max-w-md mx-auto w-full space-y-2">
          <span className="text-sm text-gray-400">Charging</span>
          <ProgressBarGradient value={mockProgress} height={8} />
        </div>
        <Link
          href={`/monuments/${id}/edit`}
          className="inline-block rounded-full bg-[var(--accent)] px-4 py-2 font-semibold text-black"
        >
          Edit Monument
        </Link>
      </div>

      {/* Related Goals Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Related Goals</h2>
        <FilteredGoalsGrid entity="monument" id={id} />
      </div>

      {/* Notes Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Notes</h2>
        <MonumentNotesGrid monumentId={id} />
      </div>
    </main>
  );
}
