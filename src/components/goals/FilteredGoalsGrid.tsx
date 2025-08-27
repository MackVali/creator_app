"use client";

import { useEffect, useState } from "react";
import { GoalCard } from "@/components/ui/GoalCard";
import type { GoalItem } from "@/types/dashboard";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Card, CardContent } from "../../../components/ui/card";

interface FilteredGoalsGridProps {
  entity: "monument" | "skill";
  id: string;
}

export function FilteredGoalsGrid({ entity, id }: FilteredGoalsGridProps) {
  const supabase = getSupabaseBrowser();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase) return;
      setLoading(true);
      await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setGoals([]);
          setLoading(false);
        }
        return;
      }

      try {
        if (entity === "monument") {
          const { data, error } = await supabase
            .from("goals")
            .select(
              "id,name,priority,energy,monument_id,created_at"
            )
            .eq("user_id", user.id)
            .eq("monument_id", id)
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(12);

          if (error) throw error;
          if (!cancelled) setGoals(data || []);
        } else {
          const goalIds = new Set<string>();

          const { data: psData, error: psError } = await supabase
            .from("project_skills")
            .select("projects(goal_id)")
            .eq("skill_id", id);
          if (psError) throw psError;
          psData?.forEach((row: { projects: { goal_id: string | null } | null }) => {
            const goalId = row.projects?.goal_id;
            if (goalId) goalIds.add(goalId);
          });

          const { data: taskData, error: taskError } = await supabase
            .from("tasks")
            .select("projects(goal_id)")
            .eq("skill_id", id);
          if (taskError) throw taskError;
          taskData?.forEach((row: { projects: { goal_id: string | null } | null }) => {
            const goalId = row.projects?.goal_id;
            if (goalId) goalIds.add(goalId);
          });

          if (goalIds.size > 0) {
            const ids = Array.from(goalIds);
            const { data, error } = await supabase
              .from("goals")
              .select(
                "id,name,priority,energy,monument_id,created_at"
              )
              .eq("user_id", user.id)
              .in("id", ids)
              .order("priority", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(12);
            if (error) throw error;
            if (!cancelled) setGoals(data || []);
          } else {
            if (!cancelled) setGoals([]);
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setGoals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [entity, id, supabase]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-3"></div>
              <div className="flex gap-2 mb-3">
                <div className="h-6 bg-gray-700 rounded w-16"></div>
                <div className="h-6 bg-gray-700 rounded w-16"></div>
              </div>
              <div className="h-3 bg-gray-700 rounded w-24"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-400">
        No related goals yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  );
}

