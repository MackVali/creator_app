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

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    supabase
      .from("skills_by_cats_v")
      .select("cat_id,cat_name,user_id,skill_id,skill_name,skill_icon,skill_level,progress"),
    supabase
      .from("goals")
      .select("id,name,priority,energy,monument_id,created_at")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6),
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

  // Group skills by category for the frontend
  const skillsByCategory = (skills ?? []).reduce((acc, skill) => {
    const catId = skill.cat_id;
    if (!catId) return acc; // Skip skills without category

    if (!acc[catId]) {
      acc[catId] = {
        cat_id: catId,
        cat_name: skill.cat_name,
        user_id: skill.user_id,
        skill_count: 0,
        skills: [],
      };
    }

    acc[catId].skills.push({
      skill_id: skill.skill_id,
      skill_name: skill.skill_name,
      skill_icon: skill.skill_icon,
      skill_level: skill.skill_level,
      progress: skill.progress,
    });
    acc[catId].skill_count = acc[catId].skills.length;
    return acc;
  }, {} as Record<string, CatItem>);

  const catsOut = Object.values(skillsByCategory);
  const goalsOut = (goals ?? []) as GoalItem[];

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    skillsAndGoals: {
      cats: catsOut,
      goals: goalsOut,
    },
  });
}
