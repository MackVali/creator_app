// src/app/dashboard/loaders.ts
import { cookies as nextCookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import type {
  UserStats,
  MonumentCounts,
  SkillItem,
  GoalItem,
} from "@/types/dashboard";

export async function getUserStats(
  cookieStore?: Awaited<ReturnType<typeof nextCookies>>
): Promise<UserStats> {
  const cookieStoreResolved = cookieStore || (await nextCookies());
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStoreResolved.get(name),
    set: (
      _name: string,
      _value: string,
      _options: {
        path?: string;
        domain?: string;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      }
    ) => {},
  });
  if (!supabase) {
    return { level: 1, xp_current: 0, xp_max: 4000 };
  }
  const { data } = await supabase
    .from("user_stats_v")
    .select("level,xp_current,xp_max")
    .maybeSingle();
  return data ?? { level: 1, xp_current: 0, xp_max: 4000 };
}

export async function getMonumentsSummary(
  cookieStore?: Awaited<ReturnType<typeof nextCookies>>
): Promise<MonumentCounts> {
  const cookieStoreResolved = cookieStore || (await nextCookies());
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStoreResolved.get(name),
    set: (
      _name: string,
      _value: string,
      _options: {
        path?: string;
        domain?: string;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      }
    ) => {},
  });
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

export async function getSkillsAndGoals(
  cookieStore?: Awaited<ReturnType<typeof nextCookies>>
): Promise<{ skills: SkillItem[]; goals: string[] }> {
  const cookieStoreResolved = cookieStore || (await nextCookies());
  const supabase = getSupabaseServer({
    get: (name: string) => cookieStoreResolved.get(name),
    set: (
      _name: string,
      _value: string,
      _options: {
        path?: string;
        domain?: string;
        maxAge?: number;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: "strict" | "lax" | "none";
      }
    ) => {},
  });

  if (!supabase) {
    return { skills: [], goals: [] };
  }
  const [skillsRes, goalsRes] = await Promise.all([
    supabase
      .from("skills_progress_v")
      .select("skill_id,name,progress")
      .order("name"),
    supabase.from("goals_active_v").select("goal_id,name,updated_at").limit(3),
  ]);

  const skills = (skillsRes.data ?? []) as SkillItem[];
  const goals = ((goalsRes.data ?? []) as GoalItem[]).map((g) => g.name);
  return { skills, goals };
}
