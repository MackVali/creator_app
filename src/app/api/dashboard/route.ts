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

  // Get skills and categories separately, then join them
  const [skillsResponse, catsResponse] = await Promise.all([
    supabase.from("skills").select("id,name,icon,level,cat_id,user_id").eq("user_id", user.id),
    supabase.from("cats").select("id,name,user_id").eq("user_id", user.id)
  ]);

  // Join the data manually
  const skillsData = skillsResponse.data?.map(skill => {
    const category = catsResponse.data?.find(cat => cat.id === skill.cat_id);
    return {
      ...skill,
      cat_name: category?.name || "Uncategorized"
    };
  }) || [];

  const [
    { data: stats },
    { data: monuments },
    { data: goals },
  ] = await Promise.all([
    supabase
      .from("user_stats_v")
      .select("level,xp_current,xp_max")
      .maybeSingle(),
    supabase.from("monuments_summary_v").select("category,count"),
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
  const skillsByCategory = (skillsData ?? []).reduce((acc, skill) => {
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
      skill_id: skill.id,
      skill_name: skill.name,
      skill_icon: skill.icon,
      skill_level: skill.level,
      progress: 0,
    });
    acc[catId].skill_count = acc[catId].skills.length;
    return acc;
  }, {} as Record<string, CatItem>);

  const catsOut = Object.values(skillsByCategory);
  const goalsOut = (goals ?? []) as GoalItem[];

  // Debug logging
  console.log("🔍 Raw skills data:", skillsData);
  console.log("🔍 Grouped skills:", catsOut);

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    skillsAndGoals: {
      cats: catsOut,
      goals: goalsOut,
    },
  });
}
