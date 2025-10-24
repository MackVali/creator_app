// src/app/dashboard/loaders.ts
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  UserStats,
  MonumentCounts,
  CatItem,
  GoalItem,
} from "@/types/dashboard";

export async function getUserStats(): Promise<UserStats> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { level: 1, xp_current: 0, xp_max: 4000 };
  }
  const { data } = await supabase
    .from("user_stats_v")
    .select("level,xp_current,xp_max")
    .maybeSingle();
  return data ?? { level: 1, xp_current: 0, xp_max: 4000 };
}

export async function getMonumentsSummary(): Promise<MonumentCounts> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      Achievement: 0,
      Legacy: 0,
      Triumph: 0,
      Pinnacle: 0,
    };
  }
  const { data, error } = await supabase
    .from("monuments_summary_v")
    .select("category,count");
  const base: MonumentCounts = {
    Achievement: 0,
    Legacy: 0,
    Triumph: 0,
    Pinnacle: 0,
  };
  if (error || !data) return base;
  for (const row of data as {
    category: keyof MonumentCounts;
    count: number;
  }[]) {
    if (row?.category in base) base[row.category] = row.count ?? 0;
  }
  return base;
}

export async function getSkillsAndGoals(): Promise<{
  cats: CatItem[];
  goals: GoalItem[];
}> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { cats: [], goals: [] };
  }
  const [catsRes, goalsRes] = await Promise.all([
    supabase
      .from("skills_by_cats_v")
      .select("cat_id,cat_name,user_id,skill_count,skills"),
    supabase.from("goals").select("id,name,created_at").limit(3),
  ]);

  const cats = (catsRes.data ?? []) as CatItem[];
  const goals = (goalsRes.data ?? []) as GoalItem[];
  return { cats, goals };
}
