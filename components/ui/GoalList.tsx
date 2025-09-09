"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase";
import { Badge } from "./badge";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { EmptyState } from "./empty-state";

interface Goal {
  id: string;
  name: string;
  priority: string;
  energy: string;
  created_at: string;
}

export function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    if (!supabase) {
      console.error("Supabase client not available");
      setLoading(false);
      return;
    }

    try {
      console.log("Loading goals...");
      // First check if user is authenticated
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("User not authenticated:", userError);
        setLoading(false);
        return;
      }

      console.log("User authenticated:", user.id);

      const { data, error } = await supabase
        .from("goals")
        .select("id, name, priority, energy, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading goals:", error);
        return;
      }

      console.log("Goals data:", data);

      // If no goals, let's check if the table exists
      if (!data || data.length === 0) {
        console.log("No goals found, checking if table exists...");
        const { data: tableCheck, error: tableError } = await supabase
          .from("goals")
          .select("count")
          .limit(1);

        if (tableError) {
          console.error(
            "Table check error (table might not exist):",
            tableError
          );
        } else {
          console.log("Table exists, but no goals found");
        }
      }

      setGoals(data || []);
    } catch (error) {
      console.error("Error loading goals:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="flex gap-2">
                <div className="h-6 bg-gray-700 rounded w-16"></div>
                <div className="h-6 bg-gray-700 rounded w-16"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <EmptyState
        title="No goals yet"
        description="Start by creating your first goal to track your progress."
      />
    );
  }

  return (
    <div className="space-y-4">
      {goals.map((goal) => (
        <Card key={goal.id} className="hover:bg-gray-800/50 transition-colors">
          <CardContent className="p-4">
            <h3 className="font-medium text-white mb-2">{goal.name}</h3>
            <div className="flex gap-2">
              <Badge variant={getPriorityVariant(goal.priority)}>
                {goal.priority}
              </Badge>
              <Badge variant={getEnergyVariant(goal.energy)}>
                {goal.energy}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getPriorityVariant(
  priority: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (priority) {
    case "CRITICAL":
    case "ULTRA-CRITICAL":
      return "destructive";
    case "HIGH":
      return "default";
    case "MEDIUM":
      return "secondary";
    default:
      return "outline";
  }
}

function getEnergyVariant(
  energy: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (energy) {
    case "EXTREME":
      return "destructive";
    case "ULTRA":
      return "default";
    case "HIGH":
      return "secondary";
    default:
      return "outline";
  }
}
