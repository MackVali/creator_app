"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MilestonesPanel from "./MilestonesPanel";
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
      <main className="p-4 flex flex-col gap-4 sm:gap-5">
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </main>
    );
  }

  if (error || !monument) {
    return (
      <main className="p-4">
        <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 text-center">
          <p className="text-[#A7B0BD]">{error || "Monument not found"}</p>
        </Card>
      </main>
    );
  }

  const handleCreateMilestone = () => {
    console.log("Milestone creation coming soon");
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

  return (
    <main className="p-4 flex flex-col gap-4 sm:gap-5">
      <Card className="rounded-2xl border border-white/5 bg-[#111520] p-4 sm:p-5 shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-4">
          <span className="text-5xl" role="img" aria-label={`Monument: ${monument.title}`}>
            {monument.emoji || "\uD83D\uDDFC\uFE0F"}
          </span>
          <div className="flex flex-col">
            <h2 className="text-[#E7ECF2] font-bold">{monument.title}</h2>
            <Badge variant="outline" className="mt-1 self-start px-2 py-0">
              0 day streak
            </Badge>
          </div>
        </div>
        <p className="mt-3 text-[#A7B0BD]">Not charging yet.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/monuments/${id}/edit`}>Edit</Link>
          </Button>
          <Button variant="outline" onClick={handleAddMilestone} aria-label="Add milestone">+ Milestone</Button>
          <Button variant="outline" onClick={handleAddNote} aria-label="Add note">+ Note</Button>
        </div>
      </Card>

      <MilestonesPanel onAdd={handleCreateMilestone} onAutoSplit={handleAutoSplit} />
      <FilteredGoalsGrid
        entity="monument"
        id={id}
        onCreateGoal={handleCreateGoal}
      />
      <MonumentNotesGrid monumentId={id} inputRef={noteInputRef} />
      <ActivityPanel />
    </main>
  );
}

export default MonumentDetail;
