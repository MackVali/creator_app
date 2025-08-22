import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  UserStats,
  MonumentCounts,
  SkillItem,
  GoalItem,
} from "@/types/dashboard";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createSupabaseServerClient();

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
    supabase.from("skills_progress_v").select("skill_id,name,progress"),
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

  const skillsOut = (skills ?? []) as SkillItem[];
  const goalsOut = ((goals ?? []) as GoalItem[]).map((g) => g.name);

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    skills: skillsOut,
    goals: goalsOut,
  });
}
