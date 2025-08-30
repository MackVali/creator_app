"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { FilteredGoalsGrid } from "@/components/goals/FilteredGoalsGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesGrid } from "@/components/notes/NotesGrid";

interface Skill {
  id: string;
  name: string;
  icon: string | null;
  level: number;
  created_at: string;
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
      <main className="p-4 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-16 w-16 rounded-full mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto" />
          <div className="flex justify-center">
            <Skeleton className="h-6 w-20" />
          </div>
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

  if (error || !skill) {
    return (
      <main className="p-4">
        <div className="text-center py-12">
          <h1 className="text-2xl font-semibold text-red-400 mb-2">
            {error || "Skill not found"}
          </h1>
          <p className="text-gray-400">
            {error
              ? "Please try again later."
              : "This skill doesn't exist or you don't have access to it."}
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

  return (
    <main className="p-4 space-y-6">
      {/* Skill Header */}
      <div className="text-center space-y-4">
        <div
          className="text-6xl"
          role="img"
          aria-label={`Skill: ${skill.name}`}
        >
          {skill.icon || "💡"}
        </div>
        <h1 className="text-3xl font-bold text-white">{skill.name}</h1>
        <div className="flex justify-center text-sm">
          <span className="text-gray-300">Level {skill.level}</span>
        </div>
        <p className="text-sm text-gray-400">
          Created {formatDate(skill.created_at)}
        </p>
      </div>

      {/* Related Goals Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Related Goals</h2>
        <FilteredGoalsGrid entity="skill" id={id} />
      </div>

      {/* Notes Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Notes</h2>
        <NotesGrid skillId={id} />
      </div>
    </main>
  );
}
