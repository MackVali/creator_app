import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  UserStats,
  MonumentCounts,
  CatItem,
  GoalItem,
} from "@/types/dashboard";
import { getSkillsForUser } from "../../../lib/data/skills";
import type { SkillRow } from "../../../lib/types/skill";

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
    getSkillsForUser(user.id), // Get all skills for user
    supabase.from("cats").select("id,name,user_id").eq("user_id", user.id),
  ]);

  // Debug logging for development
  if (process.env.NODE_ENV !== "production") {
    console.debug(
      "🔍 Debug: skills response",
      skillsResponse.length || 0,
      skillsResponse.slice(0, 3)
    );
    console.debug(
      "🔍 Debug: cats response",
      catsResponse.data?.length || 0,
      catsResponse.data?.slice(0, 3)
    );
  }

  // Join the data manually
  const skillsData = skillsResponse.map((skill: SkillRow) => {
    const category = catsResponse.data?.find(
      (cat: { id: string; name: string; user_id: string }) =>
        cat.id === skill.cat_id
    );
    return {
      ...skill,
      cat_name: category?.name || "Uncategorized",
    };
  });

  const [{ data: stats }, { data: monuments }, { data: goals }] =
    await Promise.all([
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
  const skillsByCategory = skillsData.reduce(
    (acc: Record<string, CatItem>, skill: SkillRow & { cat_name: string }) => {
      const catId = skill.cat_id;
      const catName = catId ? skill.cat_name : "Uncategorized";
      const key = catId || "uncategorized";

      if (!acc[key]) {
        acc[key] = {
          cat_id: catId || "uncategorized",
          cat_name: catName,
          user_id: skill.user_id,
          skill_count: 0,
          skills: [],
        };
      }

      acc[key].skills.push({
        skill_id: skill.id,
        skill_name: skill.name, // Use real name, no placeholder
        skill_icon: skill.icon || "🧩", // Handle null icon case
        skill_level: skill.level ?? 1,
        progress: 0,
      });
      acc[key].skill_count = acc[key].skills.length;
      return acc;
    },
    {} as Record<string, CatItem>
  );

  // Always include all CATs, even if they have no skills
  const allCats = catsResponse.data || [];
  const catsWithSkills = Object.values(skillsByCategory);
  
  // Create a complete list of CATs with their skills (or empty skills array)
  const catsOut = allCats.map(cat => {
    const existingCat = catsWithSkills.find(c => c.cat_id === cat.id);
    if (existingCat) {
      return existingCat;
    } else {
      // CAT exists but has no skills
      return {
        cat_id: cat.id,
        cat_name: cat.name,
        user_id: cat.user_id,
        skill_count: 0,
        skills: [],
      };
    }
  });

  // Add uncategorized skills if they exist
  const uncategorizedCat = catsWithSkills.find(c => c.cat_id === "uncategorized");
  if (uncategorizedCat) {
    catsOut.push(uncategorizedCat);
  }

  const goalsOut = (goals ?? []) as GoalItem[];

  // Debug logging
  console.log("🔍 Raw skills data:", skillsData);
  console.log("🔍 All CATs:", allCats);
  console.log("🔍 CATs with skills:", catsWithSkills);
  console.log("🔍 Final CATs output:", catsOut);

  return NextResponse.json({
    stats: statsOut,
    monuments: mBase,
    skillsAndGoals: {
      cats: catsOut,
      goals: goalsOut,
    },
  });
}
