// src/app/dashboard/loaders.ts
import { cookies as nextCookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";
import type {
  UserStats,
  MonumentCounts,
  CatItem,
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
): Promise<{ cats: CatItem[]; goals: GoalItem[] }> {
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
    return { cats: [], goals: [] };
  }
  const [catsRes, goalsRes] = await Promise.all([
    supabase
      .from("skills_by_cats_v")
      .select("cat_id,cat_name,user_id,skill_count,skills,color_hex,sort_order,emoji"),
    supabase.from("goals").select("id,name,created_at").limit(3),
  ]);

  const cats = (catsRes.data ?? []) as CatItem[];
  const goals = (goalsRes.data ?? []) as GoalItem[];
  return { cats, goals };
}
