import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  UserStats,
  MonumentCounts,
  CatItem,
  GoalItem,
} from "@/types/dashboard";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase client not initialized" },
      { status: 500 }
    );
  }

  const [
    { data: stats },
    { data: monuments },
    { data: skills },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("user_stats_v")
      .select("level,xp_current,xp_max")
      .maybeSingle(),
    supabase.from("monuments_summary_v").select("category,count"),
    supabase.from("skills_by_cats_v").select("cat_id,cat_name,skill_count,skills"),
    supabase.from("goals_active_v").select("goal_id,name,updated_at").limit(3),
  ]);

  const statsOut: UserStats = stats ?? {
    level: 1,
    xp_current: 0,
    xp_max: 4000,
  };
  const mBase: MonumentCounts = {
    Achievement: 0,
    Legacy: 0,
    Triumph: 0,
    Pinnacle: 0,
  };
  for (const m of (monuments ?? []) as {
    category: keyof MonumentCounts;
    count: number;
  }[]) {
    if (m?.category in mBase) mBase[m.category] = m.count ?? 0;
  }

  const catsOut = (skills ?? []) as CatItem[];
  const goalsOut = ((goals ?? []) as GoalItem[]).map((g) => g.name);

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    skillsAndGoals: {
      cats: catsOut,
      goals: goalsOut,
    },
  });
}
